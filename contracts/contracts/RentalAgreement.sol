// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ZikkaronRoles} from "./ZikkaronRoles.sol";

/**
 * @title RentalAgreement
 * @notice Memorial of rental agreement hashes and authorized occupancy claims. Not a court filing.
 * @dev Zikkaron assists owners and authorities with memorial records. Not title. Not eviction. Not an official government system. County recording, law enforcement, and courts remain authoritative.
 */
contract RentalAgreement is Initializable, AccessControlUpgradeable, UUPSUpgradeable {
    enum AgreementStatus {
        Active,
        Ended,
        Disputed
    }

    struct Agreement {
        uint256 propertyId;
        address landlord;
        address tenant;
        bytes32 leaseCidHash;
        uint64 startAt;
        uint64 endAt;
        AgreementStatus status;
        bool authorizedOccupant;
    }

    uint256 public nextAgreementId;
    mapping(uint256 => Agreement) public agreements;
    mapping(uint256 => uint256[]) public propertyAgreements;

    event AgreementCreated(
        uint256 indexed agreementId,
        uint256 indexed propertyId,
        address landlord,
        address tenant,
        bytes32 leaseCidHash
    );
    event AgreementEnded(uint256 indexed agreementId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    /// @dev MVP deploys implementation directly for Amoy/local tests. Production should use UUPS proxies and call _disableInitializers() in the constructor.
    constructor() {}

    function initialize(address admin) external initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ZikkaronRoles.ADMIN, admin);
        nextAgreementId = 1;
    }

    function createAgreement(
        uint256 propertyId,
        address tenant,
        bytes32 leaseCidHash,
        uint64 startAt,
        uint64 endAt
    ) external returns (uint256 agreementId) {
        require(tenant != address(0), "tenant");
        require(leaseCidHash != bytes32(0), "lease hash");
        require(endAt > startAt, "dates");

        agreementId = nextAgreementId++;
        agreements[agreementId] = Agreement({
            propertyId: propertyId,
            landlord: msg.sender,
            tenant: tenant,
            leaseCidHash: leaseCidHash,
            startAt: startAt,
            endAt: endAt,
            status: AgreementStatus.Active,
            authorizedOccupant: true
        });
        propertyAgreements[propertyId].push(agreementId);
        emit AgreementCreated(agreementId, propertyId, msg.sender, tenant, leaseCidHash);
    }

    function endAgreement(uint256 agreementId) external {
        Agreement storage a = agreements[agreementId];
        require(msg.sender == a.landlord || hasRole(ZikkaronRoles.ADMIN, msg.sender), "unauthorized");
        require(a.status == AgreementStatus.Active, "not active");
        a.status = AgreementStatus.Ended;
        a.authorizedOccupant = false;
        emit AgreementEnded(agreementId);
    }

    function _authorizeUpgrade(address) internal override onlyRole(ZikkaronRoles.ADMIN) {}
}
