// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ZikkaronRoles} from "./ZikkaronRoles.sol";
import {PropertyOwnerGated} from "./PropertyOwnerGated.sol";

/**
 * @title EscrowPayment
 * @notice Testnet POL escrow for demo purchase deals. TESTNET FUNDS, NOT A CLOSING. Not licensed escrow.
 * @dev Zikkaron assists owners and authorities with memorial records. Not title. Not eviction. Not an official government system. County recording, law enforcement, and courts remain authoritative.
 */
contract EscrowPayment is
    Initializable,
    AccessControlUpgradeable,
    PropertyOwnerGated,
    UUPSUpgradeable,
    PausableUpgradeable
{
    enum DealStatus {
        Open,
        Funded,
        Released,
        Refunded,
        Cancelled
    }

    struct Deal {
        uint256 propertyId;
        address seller;
        address buyer;
        uint256 amount;
        DealStatus status;
        bool disclaimerAccepted;
        bool fraudWarningAcknowledged;
    }

    uint64 public constant DEFAULT_REFUND_TIMEOUT = 14 days;
    uint64 public constant MIN_REFUND_TIMEOUT = 1 days;
    uint64 public constant MAX_REFUND_TIMEOUT = 365 days;

    uint256 public nextDealId;
    mapping(uint256 => Deal) public deals;
    uint256 private _status;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    // Appended after the original layout; keep new state variables below this line.
    mapping(uint256 => uint64) public fundedAt;
    uint64 private _refundTimeout;

    event DealOpened(uint256 indexed dealId, uint256 indexed propertyId, address seller, address buyer, uint256 amount);
    event DealFunded(uint256 indexed dealId, address buyer, uint256 amount);
    event DealReleased(uint256 indexed dealId, address seller, uint256 amount);
    event DealRefunded(uint256 indexed dealId, address buyer, uint256 amount);
    event RefundTimeoutUpdated(uint64 timeout);

    modifier nonReentrant() {
        require(_status != _ENTERED, "reentrant");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        __AccessControl_init();
        __Pausable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ZikkaronRoles.ADMIN, admin);
        nextDealId = 1;
        _status = _NOT_ENTERED;
    }

    /// @notice Seconds after funding when the buyer may reclaim funds without an admin.
    function refundTimeout() public view returns (uint64) {
        return _refundTimeout == 0 ? DEFAULT_REFUND_TIMEOUT : _refundTimeout;
    }

    function setRefundTimeout(uint64 timeout) external onlyRole(ZikkaronRoles.ADMIN) {
        require(timeout >= MIN_REFUND_TIMEOUT && timeout <= MAX_REFUND_TIMEOUT, "timeout bounds");
        _refundTimeout = timeout;
        emit RefundTimeoutUpdated(timeout);
    }

    function openDeal(
        uint256 propertyId,
        address buyer,
        uint256 amount,
        bool disclaimerAccepted,
        bool fraudWarningAcknowledged
    ) external whenNotPaused onlyPropertyOwner(propertyId) returns (uint256 dealId) {
        require(disclaimerAccepted, "disclaimer required");
        require(fraudWarningAcknowledged, "fraud warning required");
        require(buyer != address(0) && buyer != msg.sender, "invalid buyer");
        require(amount > 0, "amount");

        dealId = nextDealId++;
        deals[dealId] = Deal({
            propertyId: propertyId,
            seller: msg.sender,
            buyer: buyer,
            amount: amount,
            status: DealStatus.Open,
            disclaimerAccepted: true,
            fraudWarningAcknowledged: true
        });
        emit DealOpened(dealId, propertyId, msg.sender, buyer, amount);
    }

    function fundDeal(uint256 dealId) external payable nonReentrant whenNotPaused {
        Deal storage d = deals[dealId];
        require(d.status == DealStatus.Open, "not open");
        require(msg.sender == d.buyer, "not buyer");
        require(msg.value == d.amount, "amount mismatch");
        d.status = DealStatus.Funded;
        fundedAt[dealId] = uint64(block.timestamp);
        emit DealFunded(dealId, msg.sender, msg.value);
    }

    function release(uint256 dealId) external nonReentrant onlyRole(ZikkaronRoles.ADMIN) {
        Deal storage d = deals[dealId];
        require(d.status == DealStatus.Funded, "not funded");
        d.status = DealStatus.Released;
        (bool ok, ) = d.seller.call{value: d.amount}("");
        require(ok, "transfer failed");
        emit DealReleased(dealId, d.seller, d.amount);
    }

    function refund(uint256 dealId) external nonReentrant onlyRole(ZikkaronRoles.ADMIN) {
        _refund(dealId);
    }

    /// @notice Buyer exit after the refund timeout, so funds never depend solely on an admin.
    /// @dev Intentionally not gated by whenNotPaused: pausing must not trap buyer funds.
    function claimRefund(uint256 dealId) external nonReentrant {
        Deal storage d = deals[dealId];
        require(msg.sender == d.buyer, "not buyer");
        require(d.status == DealStatus.Funded, "not funded");
        require(block.timestamp >= uint256(fundedAt[dealId]) + refundTimeout(), "refund timeout active");
        _refund(dealId);
    }

    function _refund(uint256 dealId) private {
        Deal storage d = deals[dealId];
        require(d.status == DealStatus.Funded, "not funded");
        d.status = DealStatus.Refunded;
        (bool ok, ) = d.buyer.call{value: d.amount}("");
        require(ok, "transfer failed");
        emit DealRefunded(dealId, d.buyer, d.amount);
    }

    function pause() external onlyRole(ZikkaronRoles.ADMIN) {
        _pause();
    }

    function unpause() external onlyRole(ZikkaronRoles.ADMIN) {
        _unpause();
    }

    function _authorizeUpgrade(address) internal override onlyRole(ZikkaronRoles.ADMIN) {}
}
