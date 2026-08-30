// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title ZikkaronProxy
 * @notice Minimal ERC-1967 proxy used by the MVP deploy script for UUPS modules.
 * @dev The implementation's _authorizeUpgrade function remains the upgrade gate.
 */
contract ZikkaronProxy is ERC1967Proxy {
    constructor(address implementation, bytes memory initializationData)
        ERC1967Proxy(implementation, initializationData)
    {}
}
