// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Read-only view of PropertyRegistry memorial claimants used by property-gated modules.
interface IPropertyOwnerLookup {
    function claimedOwnerOf(uint256 propertyId) external view returns (address);
}
