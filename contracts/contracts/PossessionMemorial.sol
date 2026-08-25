// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ZikkaronRoles} from "./ZikkaronRoles.sol";

/**
 * @title PossessionMemorial
 * @notice Timestamped memorial hashes for occupancy incidents and notices. Not service of process. Not eviction.
 * @dev Zikkaron assists owners and authorities with memorial records. Not title. Not eviction. Not an official government system. County recording, law enforcement, and courts remain authoritative.
 */
contract PossessionMemorial is Initializable, AccessControlUpgradeable, UUPSUpgradeable {
    enum EventType {
        UnauthorizedOccupancyReported,
        NoticeMemorialized,
        PoliceCalled,
        AuthorityNotified,
        AgencyAckReceived,
        AuthorizedOccupantAdded,
        VacantSecured
    }

    struct MemorialEvent {
        uint256 propertyId;
        address actor;
        EventType eventType;
        bytes32 evidenceHash;
        uint64 timestamp;
        string noteCid; // optional IPFS CID for off-chain note (not legal service)
    }

    uint256 public nextEventId;
    mapping(uint256 => MemorialEvent) public events;
    mapping(uint256 => uint256[]) public propertyEvents;

    event MemorialRecorded(
        uint256 indexed eventId,
        uint256 indexed propertyId,
        address indexed actor,
        EventType eventType,
        bytes32 evidenceHash
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    /// @dev MVP deploys implementation directly for Amoy/local tests. Production should use UUPS proxies and call _disableInitializers() in the constructor.
    constructor() {}

    function initialize(address admin) external initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ZikkaronRoles.ADMIN, admin);
        nextEventId = 1;
    }

    function recordEvent(
        uint256 propertyId,
        EventType eventType,
        bytes32 evidenceHash,
        string calldata noteCid
    ) external returns (uint256 eventId) {
        require(propertyId > 0, "property required");
        require(evidenceHash != bytes32(0) || bytes(noteCid).length > 0, "evidence required");

        eventId = nextEventId++;
        events[eventId] = MemorialEvent({
            propertyId: propertyId,
            actor: msg.sender,
            eventType: eventType,
            evidenceHash: evidenceHash,
            timestamp: uint64(block.timestamp),
            noteCid: noteCid
        });
        propertyEvents[propertyId].push(eventId);

        emit MemorialRecorded(eventId, propertyId, msg.sender, eventType, evidenceHash);
    }

    function getPropertyEventIds(uint256 propertyId) external view returns (uint256[] memory) {
        return propertyEvents[propertyId];
    }

    function _authorizeUpgrade(address) internal override onlyRole(ZikkaronRoles.ADMIN) {}
}
