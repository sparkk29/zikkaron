// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ZikkaronRoles
 * @notice Shared role constants for Zikkaron memorial contracts.
 * @dev Zikkaron assists owners and authorities with memorial records. Not title. Not eviction. Not an official government system. County recording, law enforcement, and courts remain authoritative.
 */
library ZikkaronRoles {
    bytes32 public constant ADMIN = keccak256("ADMIN");
    bytes32 public constant SELLER = keccak256("SELLER");
    bytes32 public constant BUYER = keccak256("BUYER");
    bytes32 public constant TENANT = keccak256("TENANT");
    bytes32 public constant TITLE_OFFICER = keccak256("TITLE_OFFICER");
    bytes32 public constant AUTHORITY_OFFICER = keccak256("AUTHORITY_OFFICER");
}
