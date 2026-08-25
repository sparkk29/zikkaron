// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ZikkaronRoles} from "./ZikkaronRoles.sol";

/**
 * @title PropertyRegistry
 * @notice Memorial registry of property claims bound to APN/county placeholders. NOT legal title.
 * @dev Zikkaron assists owners and authorities with memorial records. Not title. Not eviction. Not an official government system. County recording, law enforcement, and courts remain authoritative.
 */
contract PropertyRegistry is Initializable, AccessControlUpgradeable, UUPSUpgradeable {
    enum OccupancyStatus {
        VacantSecured,
        OwnerOccupied,
        AuthorizedTenant,
        Disputed
    }

    struct Property {
        address claimedOwner;
        bytes32 deedCidHash;
        string apn;
        string county;
        string stateCode;
        OccupancyStatus occupancyStatus;
        bool listingPaused;
        bool exists;
        uint64 registeredAt;
    }

    uint256 public nextPropertyId;
    mapping(uint256 => Property) public properties;
    mapping(bytes32 => uint256) public apnToPropertyId; // keccak256(state|county|apn)

    event PropertyRegistered(
        uint256 indexed propertyId,
        address indexed owner,
        string apn,
        string county,
        string stateCode,
        bytes32 deedCidHash
    );
    event OccupancyStatusUpdated(uint256 indexed propertyId, OccupancyStatus status);
    event ListingPaused(uint256 indexed propertyId, bool paused);

    /// @custom:oz-upgrades-unsafe-allow constructor
    /// @dev MVP deploys implementation directly for Amoy/local tests. Production should use UUPS proxies and call _disableInitializers() in the constructor.
    constructor() {}

    function initialize(address admin) external initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ZikkaronRoles.ADMIN, admin);
        nextPropertyId = 1;
    }

    function registerProperty(
        bytes32 deedCidHash,
        string calldata apn,
        string calldata county,
        string calldata stateCode,
        OccupancyStatus occupancyStatus
    ) external returns (uint256 propertyId) {
        require(deedCidHash != bytes32(0), "empty deed");
        require(bytes(apn).length > 0, "apn required");
        bytes32 apnKey = keccak256(abi.encodePacked(stateCode, "|", county, "|", apn));
        require(apnToPropertyId[apnKey] == 0, "apn exists");

        propertyId = nextPropertyId++;
        properties[propertyId] = Property({
            claimedOwner: msg.sender,
            deedCidHash: deedCidHash,
            apn: apn,
            county: county,
            stateCode: stateCode,
            occupancyStatus: occupancyStatus,
            listingPaused: false,
            exists: true,
            registeredAt: uint64(block.timestamp)
        });
        apnToPropertyId[apnKey] = propertyId;

        emit PropertyRegistered(propertyId, msg.sender, apn, county, stateCode, deedCidHash);
        emit OccupancyStatusUpdated(propertyId, occupancyStatus);
    }

    function setOccupancyStatus(uint256 propertyId, OccupancyStatus status) external {
        Property storage p = properties[propertyId];
        require(p.exists, "missing");
        require(p.claimedOwner == msg.sender || hasRole(ZikkaronRoles.ADMIN, msg.sender), "not owner");
        p.occupancyStatus = status;
        emit OccupancyStatusUpdated(propertyId, status);
    }

    function setListingPaused(uint256 propertyId, bool paused) external {
        Property storage p = properties[propertyId];
        require(p.exists, "missing");
        require(
            p.claimedOwner == msg.sender ||
                hasRole(ZikkaronRoles.ADMIN, msg.sender) ||
                hasRole(ZikkaronRoles.TITLE_OFFICER, msg.sender),
            "unauthorized"
        );
        p.listingPaused = paused;
        emit ListingPaused(propertyId, paused);
    }

    function transferClaimedOwner(uint256 propertyId, address newOwner) external onlyRole(ZikkaronRoles.ADMIN) {
        Property storage p = properties[propertyId];
        require(p.exists, "missing");
        p.claimedOwner = newOwner;
    }

    function _authorizeUpgrade(address) internal override onlyRole(ZikkaronRoles.ADMIN) {}
}
