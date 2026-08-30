// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ZikkaronRoles} from "./ZikkaronRoles.sol";

/**
 * @title UserVerification
 * @notice On-chain memorial of KYC hash verification status. Hashes only — no raw SSN/ITIN/DL.
 * @dev Zikkaron assists owners and authorities with memorial records. Not title. Not eviction. Not an official government system. County recording, law enforcement, and courts remain authoritative.
 */
contract UserVerification is Initializable, AccessControlUpgradeable, UUPSUpgradeable {
    struct VerificationRecord {
        bytes32 kycHash;
        bool verified;
        uint8 fraudRiskLevel; // 0=low, 1=medium, 2=high
        uint64 verifiedAt;
        string roleLabel; // off-chain role mirror: seller|buyer|tenant|title_officer|authority_officer
    }

    mapping(address => VerificationRecord) public records;

    event UserRegistered(address indexed user, bytes32 kycHash, string roleLabel);
    event UserVerified(address indexed user, address indexed verifier);
    event FraudRiskUpdated(address indexed user, uint8 level, address indexed actor);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ZikkaronRoles.ADMIN, admin);
        _setRoleAdmin(ZikkaronRoles.TITLE_OFFICER, ZikkaronRoles.ADMIN);
        _setRoleAdmin(ZikkaronRoles.AUTHORITY_OFFICER, ZikkaronRoles.ADMIN);
    }

    function register(bytes32 kycHash, string calldata roleLabel) external {
        require(kycHash != bytes32(0), "empty hash");
        VerificationRecord storage r = records[msg.sender];
        r.kycHash = kycHash;
        r.roleLabel = roleLabel;
        emit UserRegistered(msg.sender, kycHash, roleLabel);
    }

    function verifyUser(address user) external onlyRole(ZikkaronRoles.ADMIN) {
        VerificationRecord storage r = records[user];
        require(r.kycHash != bytes32(0), "not registered");
        r.verified = true;
        r.verifiedAt = uint64(block.timestamp);
        emit UserVerified(user, msg.sender);
    }

    function setFraudRisk(address user, uint8 level) external {
        require(
            hasRole(ZikkaronRoles.ADMIN, msg.sender) ||
                hasRole(ZikkaronRoles.AUTHORITY_OFFICER, msg.sender),
            "unauthorized"
        );
        require(level <= 2, "invalid level");
        records[user].fraudRiskLevel = level;
        emit FraudRiskUpdated(user, level, msg.sender);
    }

    function grantAuthorityOfficer(address account) external onlyRole(ZikkaronRoles.ADMIN) {
        _grantRole(ZikkaronRoles.AUTHORITY_OFFICER, account);
    }

    function grantTitleOfficer(address account) external onlyRole(ZikkaronRoles.ADMIN) {
        _grantRole(ZikkaronRoles.TITLE_OFFICER, account);
    }

    function _authorizeUpgrade(address) internal override onlyRole(ZikkaronRoles.ADMIN) {}
}
