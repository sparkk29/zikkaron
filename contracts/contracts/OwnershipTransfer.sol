// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ZikkaronRoles} from "./ZikkaronRoles.sol";

/**
 * @title OwnershipTransfer
 * @notice Memorial of ownership claim transfer intents. Does NOT convey legal title or replace county recording.
 * @dev Zikkaron assists owners and authorities with memorial records. Not title. Not eviction. Not an official government system. County recording, law enforcement, and courts remain authoritative.
 */
contract OwnershipTransfer is Initializable, AccessControlUpgradeable, UUPSUpgradeable {
    enum TransferStatus {
        Proposed,
        Accepted,
        CountyVerifySimulated,
        Cancelled
    }

    struct Transfer {
        uint256 propertyId;
        address fromOwner;
        address toOwner;
        bytes32 instrumentHash;
        string instrumentNumberPlaceholder;
        TransferStatus status;
        bool disclaimerAccepted;
    }

    uint256 public nextTransferId;
    mapping(uint256 => Transfer) public transfers;

    event TransferProposed(uint256 indexed transferId, uint256 indexed propertyId, address fromOwner, address toOwner);
    event TransferAccepted(uint256 indexed transferId);
    event CountyVerifySimulated(uint256 indexed transferId, address indexed titleOfficer);

    /// @custom:oz-upgrades-unsafe-allow constructor
    /// @dev MVP deploys implementation directly for Amoy/local tests. Production should use UUPS proxies and call _disableInitializers() in the constructor.
    constructor() {}

    function initialize(address admin) external initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ZikkaronRoles.ADMIN, admin);
        _setRoleAdmin(ZikkaronRoles.TITLE_OFFICER, ZikkaronRoles.ADMIN);
        nextTransferId = 1;
    }

    function grantTitleOfficer(address account) external onlyRole(ZikkaronRoles.ADMIN) {
        _grantRole(ZikkaronRoles.TITLE_OFFICER, account);
    }

    function proposeTransfer(
        uint256 propertyId,
        address toOwner,
        bytes32 instrumentHash,
        string calldata instrumentNumberPlaceholder,
        bool disclaimerAccepted
    ) external returns (uint256 transferId) {
        require(disclaimerAccepted, "disclaimer required");
        require(toOwner != address(0) && toOwner != msg.sender, "invalid to");
        transferId = nextTransferId++;
        transfers[transferId] = Transfer({
            propertyId: propertyId,
            fromOwner: msg.sender,
            toOwner: toOwner,
            instrumentHash: instrumentHash,
            instrumentNumberPlaceholder: instrumentNumberPlaceholder,
            status: TransferStatus.Proposed,
            disclaimerAccepted: true
        });
        emit TransferProposed(transferId, propertyId, msg.sender, toOwner);
    }

    function acceptTransfer(uint256 transferId) external {
        Transfer storage t = transfers[transferId];
        require(t.status == TransferStatus.Proposed, "not proposed");
        require(msg.sender == t.toOwner, "not buyer");
        t.status = TransferStatus.Accepted;
        emit TransferAccepted(transferId);
    }

    /// @notice Human-in-the-loop stand-in for recorder workflow. Simulated only.
    function simulateCountyVerify(uint256 transferId) external {
        require(
            hasRole(ZikkaronRoles.TITLE_OFFICER, msg.sender) || hasRole(ZikkaronRoles.ADMIN, msg.sender),
            "title officer only"
        );
        Transfer storage t = transfers[transferId];
        require(t.status == TransferStatus.Accepted, "not accepted");
        t.status = TransferStatus.CountyVerifySimulated;
        emit CountyVerifySimulated(transferId, msg.sender);
    }

    function _authorizeUpgrade(address) internal override onlyRole(ZikkaronRoles.ADMIN) {}
}
