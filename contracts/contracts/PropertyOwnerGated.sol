// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ZikkaronRoles} from "./ZikkaronRoles.sol";
import {IPropertyOwnerLookup} from "./IPropertyOwnerLookup.sol";

/**
 * @title PropertyOwnerGated
 * @notice Binds a module to PropertyRegistry so property-scoped writes require the memorial claimant.
 * @dev Uses ERC-7201 namespaced storage so adding this base to already-deployed proxies does not
 *      shift the inheriting contract's storage layout.
 */
abstract contract PropertyOwnerGated is AccessControlUpgradeable {
    /// @custom:storage-location erc7201:zikkaron.storage.PropertyOwnerGated
    struct PropertyOwnerGatedStorage {
        IPropertyOwnerLookup registry;
    }

    // keccak256(abi.encode(uint256(keccak256("zikkaron.storage.PropertyOwnerGated")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant PROPERTY_OWNER_GATED_STORAGE =
        0xfee8aff3335b0a0587c149979f5114cec0e309119a050c8c85f65a489e1ddd00;

    event PropertyRegistrySet(address indexed registry);

    function _gateStorage() private pure returns (PropertyOwnerGatedStorage storage $) {
        assembly {
            $.slot := PROPERTY_OWNER_GATED_STORAGE
        }
    }

    function propertyRegistry() public view returns (address) {
        return address(_gateStorage().registry);
    }

    function setPropertyRegistry(address registry) external onlyRole(ZikkaronRoles.ADMIN) {
        require(registry != address(0), "registry required");
        _gateStorage().registry = IPropertyOwnerLookup(registry);
        emit PropertyRegistrySet(registry);
    }

    function _claimedOwner(uint256 propertyId) internal view returns (address owner) {
        IPropertyOwnerLookup registry = _gateStorage().registry;
        require(address(registry) != address(0), "registry not set");
        owner = registry.claimedOwnerOf(propertyId);
        require(owner != address(0), "property missing");
    }

    modifier onlyPropertyOwner(uint256 propertyId) {
        require(_claimedOwner(propertyId) == msg.sender, "not property owner");
        _;
    }
}
