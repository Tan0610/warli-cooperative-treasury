// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CooperativeTreasury
/// @notice A shared treasury for an artisan cooperative (modelled on the sixteen Warli
///         painters outside Palghar who currently sell through an aggregator that pays
///         late, in cash, minus a cut nobody agreed to).
///
///         Buyer money arrives at the treasury and is split across whoever the *current*
///         members are, by a share the cooperative can see and adjust together. Nothing
///         is pushed: each member pulls their own accrued balance when they want it.
///
/// @dev Design invariants, each mapped to a stated requirement:
///
///      1. SHARES LIVE IN ON-CHAIN, UPDATABLE STATE.
///         Every payout percentage is read from `_members[account].shareBps` at split
///         time. No percentage is ever hardcoded in the split arithmetic; the only
///         constant involved is the fixed denominator `TOTAL_SHARE_BPS`.
///
///      2. ONLY CURRENTLY REGISTERED MEMBERS ARE PAID.
///         `_split` iterates `_memberList`, which holds exactly the active roster at the
///         moment of the call. A member removed before a payment arrives is not in that
///         list and accrues nothing from it. Balances they earned *before* removal stay
///         withdrawable, because that money was already theirs.
///
///      3. MEMBERSHIP CHANGES ARE ADMIN-GATED.
///         Add / remove / update / reconfigure all require `COOP_ADMIN_ROLE`.
///
///      4. PULL, NOT PUSH.
///         `_split` only credits `withdrawable[member]`. It never transfers value. A
///         member calls `withdraw()` themselves. One artisan with a reverting fallback
///         therefore cannot brick the payout for the other fifteen, and the split cost
///         does not grow into an unpayable transaction for the buyer.
///
///      5. THE REMAINDER IS NEVER DROPPED.
///         Integer division leaves dust. It is accumulated into `carriedRemainder` and
///         folded into the *next* split distributable amount, so it stays in the
///         cooperative money rather than silently vanishing into the contract balance.
///
///      6. SHARES ALWAYS SUM TO A FIXED DENOMINATOR.
///         `allocatedShareBps + unallocatedShareBps() == TOTAL_SHARE_BPS` holds after
///         every mutation, structurally. Any basis points not assigned to a member are
///         held as the cooperative own unallocated portion and routed to
///         `reserveBalance`, which the admin can later allocate to a member. Shares can
///         never sum to more than the denominator, and any shortfall is explicitly
///         owned by the co-op instead of being lost.
///
///      7. NO DOUBLE WITHDRAWAL.
///         `withdraw()` zeroes the balance before the external call (checks-effects-
///         interactions) and is additionally wrapped in `nonReentrant`.
contract CooperativeTreasury is AccessControl, ReentrancyGuard {
    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @notice The fixed denominator all shares are measured against: 10000 basis
    ///         points == 100%. Member shares are always checked against this total.
    uint256 public constant TOTAL_SHARE_BPS = 10_000;

    /// @notice Upper bound on the roster, so the `_split` loop can never grow past a
    ///         payable gas budget. A village cooperative is tens of people, not tens
    ///         of thousands.
    uint256 public constant MAX_MEMBERS = 200;

    /// @notice Role permitted to change who is in the cooperative and on what share.
    bytes32 public constant COOP_ADMIN_ROLE = keccak256("COOP_ADMIN_ROLE");

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @param shareBps   Portion of every future payment, in basis points of
    ///                   TOTAL_SHARE_BPS. Updatable after deployment.
    /// @param listIndex  Position in `_memberList`, for O(1) removal.
    /// @param active     Whether this address is on the roster right now.
    /// @param joinedAt   Block timestamp of the most recent join, for the record.
    struct Member {
        uint256 shareBps;
        uint256 listIndex;
        bool active;
        uint64 joinedAt;
    }

    /// @notice A read-only view of one member, for dashboards and off-chain readers.
    struct MemberView {
        address account;
        uint256 shareBps;
        uint256 withdrawable;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @dev The updatable member table. This, not any literal, is what the split reads.
    mapping(address account => Member member) private _members;

    /// @dev The active roster. Exactly the members eligible for the next split.
    address[] private _memberList;

    /// @notice Sum of the shares of all currently active members, in basis points.
    ///         Always <= TOTAL_SHARE_BPS.
    uint256 public allocatedShareBps;

    /// @notice Funds each member has accrued and not yet pulled. Pull-payment ledger.
    mapping(address account => uint256 amount) public withdrawable;

    /// @notice Sum of all unwithdrawn member balances. Used to prove solvency and to
    ///         identify ETH that arrived without going through a split.
    uint256 public totalOwedToMembers;

    /// @notice The cooperative unallocated portion, plus anything the admin has not yet
    ///         handed to a member. Never stranded: `allocateReserve` moves it.
    uint256 public reserveBalance;

    /// @notice Dust left over from integer division, carried into the next split.
    uint256 public carriedRemainder;

    /// @notice Lifetime total of buyer money that has entered the treasury.
    uint256 public totalReceived;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event MemberAdded(address indexed account, uint256 shareBps, uint256 allocatedShareBps);
    event MemberRemoved(address indexed account, uint256 freedShareBps, uint256 allocatedShareBps);
    event MemberShareUpdated(
        address indexed account, uint256 oldShareBps, uint256 newShareBps, uint256 allocatedShareBps
    );
    event MembershipReconfigured(uint256 memberCount, uint256 allocatedShareBps);
    event PaymentReceived(address indexed payer, uint256 amount, string memo);
    event PaymentSplit(
        uint256 distributable, uint256 distributedToMembers, uint256 toReserve, uint256 remainderCarried
    );
    event ShareCredited(address indexed account, uint256 shareBps, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event ReserveAllocated(address indexed to, uint256 amount);
    event UnaccountedFundsSwept(uint256 amount);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ZeroAddress();
    error ZeroShare();
    error ZeroAmount();
    error AlreadyMember(address account);
    error NotAMember(address account);
    error RosterFull(uint256 max);
    error SharesExceedTotal(uint256 attempted, uint256 total);
    error SharesMustEqualTotal(uint256 provided, uint256 total);
    error LengthMismatch(uint256 accounts, uint256 shares);
    error NothingToWithdraw(address account);
    error InsufficientReserve(uint256 requested, uint256 available);
    error TransferFailed(address to, uint256 amount);
    error NoUnaccountedFunds();

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    /// @param admin The cooperative administrator: holds both the ability to manage
    ///              roles and `COOP_ADMIN_ROLE` itself.
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COOP_ADMIN_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Membership management (admin-gated)
    // ---------------------------------------------------------------------

    /// @notice Register a member and assign them a share of all *future* income.
    /// @dev Checks the new total against the fixed denominator TOTAL_SHARE_BPS.
    function addMember(address account, uint256 shareBps) external onlyRole(COOP_ADMIN_ROLE) {
        _addMember(account, shareBps);
        _assertSharesBalanced();
    }

    /// @notice Remove a member. They accrue nothing from any payment that splits after
    ///         this call. Anything they already accrued stays withdrawable, because it
    ///         was earned while they were on the roster.
    function removeMember(address account) external onlyRole(COOP_ADMIN_ROLE) {
        _removeMember(account);
        _assertSharesBalanced();
    }

    /// @notice Change an existing member share.
    /// @dev Checks the resulting total against the fixed denominator TOTAL_SHARE_BPS.
    function setMemberShare(address account, uint256 newShareBps) external onlyRole(COOP_ADMIN_ROLE) {
        Member storage m = _members[account];
        if (!m.active) revert NotAMember(account);
        if (newShareBps == 0) revert ZeroShare();

        uint256 oldShareBps = m.shareBps;
        uint256 newAllocated = allocatedShareBps - oldShareBps + newShareBps;
        if (newAllocated > TOTAL_SHARE_BPS) revert SharesExceedTotal(newAllocated, TOTAL_SHARE_BPS);

        m.shareBps = newShareBps;
        allocatedShareBps = newAllocated;

        emit MemberShareUpdated(account, oldShareBps, newShareBps, newAllocated);
        _assertSharesBalanced();
    }

    /// @notice Replace the whole roster atomically, requiring the new shares to sum to
    ///         *exactly* the fixed denominator.
    /// @dev This is the intended path for a mid-cycle change where one artisan leaves and
    ///      the remaining members re-divide 100% between them: it is a single transaction,
    ///      so the roster is never left half-updated, and it cannot succeed unless the
    ///      shares add up to TOTAL_SHARE_BPS.
    function reconfigureMembership(address[] calldata accounts, uint256[] calldata sharesBps)
        external
        onlyRole(COOP_ADMIN_ROLE)
    {
        if (accounts.length != sharesBps.length) {
            revert LengthMismatch(accounts.length, sharesBps.length);
        }
        if (accounts.length > MAX_MEMBERS) revert RosterFull(MAX_MEMBERS);

        uint256 sum;
        for (uint256 i; i < sharesBps.length; ++i) {
            sum += sharesBps[i];
        }
        if (sum != TOTAL_SHARE_BPS) revert SharesMustEqualTotal(sum, TOTAL_SHARE_BPS);

        // Clear the current roster from the back, so each `_removeMember` is O(1).
        while (_memberList.length != 0) {
            _removeMember(_memberList[_memberList.length - 1]);
        }

        for (uint256 i; i < accounts.length; ++i) {
            _addMember(accounts[i], sharesBps[i]);
        }

        emit MembershipReconfigured(accounts.length, allocatedShareBps);
        _assertSharesBalanced();
    }

    // ---------------------------------------------------------------------
    // Money in
    // ---------------------------------------------------------------------

    /// @notice Buyer-facing entry point. Splits immediately across the current roster.
    /// @param memo Free-form label (invoice id, order number) recorded in the event.
    function payIn(string calldata memo) external payable {
        if (msg.value == 0) revert ZeroAmount();
        totalReceived += msg.value;
        emit PaymentReceived(msg.sender, msg.value, memo);
        _split(msg.value);
    }

    /// @notice Plain transfers are treated as an unlabelled buyer payment.
    receive() external payable {
        if (msg.value == 0) revert ZeroAmount();
        totalReceived += msg.value;
        emit PaymentReceived(msg.sender, msg.value, "");
        _split(msg.value);
    }

    // ---------------------------------------------------------------------
    // Money out
    // ---------------------------------------------------------------------

    /// @notice Pull your own accrued share. The contract never pushes money to you.
    /// @dev Checks-effects-interactions: the balance is zeroed *before* the external
    ///      call, so a re-entering receiver finds nothing left to claim. `nonReentrant`
    ///      is a second, independent line of defence.
    function withdraw() external nonReentrant returns (uint256 amount) {
        amount = withdrawable[msg.sender];
        if (amount == 0) revert NothingToWithdraw(msg.sender);

        // --- effects, before any external call ---
        // Zeroing here is what makes a second withdraw() in the same transaction a
        // no-op: a re-entrant caller reads 0 and reverts with NothingToWithdraw.
        withdrawable[msg.sender] = 0;
        totalOwedToMembers -= amount;
        // Emitted before the interaction too, so a re-entrant callee cannot interleave
        // or reorder logs that off-chain readers depend on. If the call below fails the
        // whole transaction reverts and this log is discarded with it.
        emit Withdrawn(msg.sender, amount);

        // --- interaction ---
        // forge-lint: disable-next-line(reentrancy-eth, low-level-calls)
        // Safe: every state change above is already committed, and `nonReentrant` is a
        // second, independent barrier. `call` rather than `transfer` so that members
        // using a smart-contract wallet are not broken by the 2300-gas stipend.
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed(msg.sender, amount);
    }

    /// @notice Hand part of the cooperative unallocated reserve to a specific member.
    /// @dev This is how the co-op unallocated basis points and any carried dust
    ///      eventually reach a person, so nothing is stranded in the contract.
    function allocateReserve(address to, uint256 amount) external onlyRole(COOP_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > reserveBalance) revert InsufficientReserve(amount, reserveBalance);

        reserveBalance -= amount;
        withdrawable[to] += amount;
        totalOwedToMembers += amount;

        emit ReserveAllocated(to, amount);
    }

    /// @notice Fold any ETH that reached this contract without going through a split
    ///         (a forced transfer via `selfdestruct`, or a block reward) into the next
    ///         distribution, so it is not stuck with nowhere to go.
    function sweepUnaccountedFunds() external {
        uint256 amount = unaccountedBalance();
        if (amount == 0) revert NoUnaccountedFunds();
        emit UnaccountedFundsSwept(amount);
        _split(amount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Basis points not currently assigned to any member. Held by the co-op.
    function unallocatedShareBps() public view returns (uint256) {
        return TOTAL_SHARE_BPS - allocatedShareBps;
    }

    function memberCount() external view returns (uint256) {
        return _memberList.length;
    }

    function isMember(address account) external view returns (bool) {
        return _members[account].active;
    }

    /// @notice The share a member will receive from the *next* split.
    function shareOf(address account) external view returns (uint256) {
        return _members[account].active ? _members[account].shareBps : 0;
    }

    function getMember(address account) external view returns (Member memory) {
        return _members[account];
    }

    function memberAt(uint256 index) external view returns (address) {
        return _memberList[index];
    }

    /// @notice The full current roster with shares and unpulled balances: what the
    ///         cooperative looks at instead of taking the aggregator word for it.
    function getMembers() external view returns (MemberView[] memory list) {
        uint256 n = _memberList.length;
        list = new MemberView[](n);
        for (uint256 i; i < n; ++i) {
            address account = _memberList[i];
            list[i] = MemberView({
                account: account, shareBps: _members[account].shareBps, withdrawable: withdrawable[account]
            });
        }
    }

    /// @notice Dry-run a split of `amount` against the roster as it stands right now.
    /// @return accounts  The current roster.
    /// @return amounts   What each of them would be credited.
    /// @return toReserve What the co-op unallocated portion would take.
    /// @return remainder The dust that would carry to the split after this one.
    function previewSplit(uint256 amount)
        external
        view
        returns (address[] memory accounts, uint256[] memory amounts, uint256 toReserve, uint256 remainder)
    {
        uint256 distributable = amount + carriedRemainder;
        uint256 n = _memberList.length;
        accounts = new address[](n);
        amounts = new uint256[](n);

        uint256 assigned;
        for (uint256 i; i < n; ++i) {
            address account = _memberList[i];
            accounts[i] = account;
            amounts[i] = (distributable * _members[account].shareBps) / TOTAL_SHARE_BPS;
            assigned += amounts[i];
        }

        toReserve = (distributable * unallocatedShareBps()) / TOTAL_SHARE_BPS;
        assigned += toReserve;
        remainder = distributable - assigned;
    }

    /// @notice ETH held by this contract that no ledger entry accounts for.
    function unaccountedBalance() public view returns (uint256) {
        uint256 tracked = totalOwedToMembers + reserveBalance + carriedRemainder;
        uint256 balance = address(this).balance;
        return balance > tracked ? balance - tracked : 0;
    }

    /// @notice Every wei the contract holds is claimable by someone: member unpulled
    ///         balances, the co-op reserve, or dust queued for the next split.
    function isSolvent() external view returns (bool) {
        return address(this).balance >= totalOwedToMembers + reserveBalance + carriedRemainder;
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev Credits `distributable` across the roster *as it stands at this moment*.
    ///      Reads every percentage from the member table; writes only to balances.
    ///      Sends nothing: see `withdraw()`.
    function _split(uint256 amount) private {
        // Dust from previous splits rejoins the pot rather than being written off.
        uint256 distributable = amount + carriedRemainder;
        carriedRemainder = 0;

        uint256 assigned;
        uint256 n = _memberList.length;

        for (uint256 i; i < n; ++i) {
            address account = _memberList[i];
            // Current on-chain share, not a value snapshotted at deployment or at the
            // time the member joined.
            uint256 shareBps = _members[account].shareBps;
            uint256 cut = (distributable * shareBps) / TOTAL_SHARE_BPS;
            if (cut != 0) {
                withdrawable[account] += cut; // credit only, no transfer here
                assigned += cut;
                emit ShareCredited(account, shareBps, cut);
            }
        }

        totalOwedToMembers += assigned;

        // The co-op own unassigned basis points.
        uint256 toReserve = (distributable * unallocatedShareBps()) / TOTAL_SHARE_BPS;
        if (toReserve != 0) {
            reserveBalance += toReserve;
        }

        // Whatever integer division could not place is carried, never dropped.
        uint256 remainder = distributable - assigned - toReserve;
        carriedRemainder = remainder;

        emit PaymentSplit(distributable, assigned, toReserve, remainder);
    }

    function _addMember(address account, uint256 shareBps) private {
        if (account == address(0)) revert ZeroAddress();
        if (shareBps == 0) revert ZeroShare();

        Member storage m = _members[account];
        if (m.active) revert AlreadyMember(account);
        if (_memberList.length >= MAX_MEMBERS) revert RosterFull(MAX_MEMBERS);

        uint256 newAllocated = allocatedShareBps + shareBps;
        if (newAllocated > TOTAL_SHARE_BPS) revert SharesExceedTotal(newAllocated, TOTAL_SHARE_BPS);

        m.shareBps = shareBps;
        m.listIndex = _memberList.length;
        m.active = true;
        // forge-lint: disable-next-line(unsafe-typecast)
        // Safe: uint64 seconds overflows in the year 584942417355. Record-keeping only.
        m.joinedAt = uint64(block.timestamp);
        _memberList.push(account);

        allocatedShareBps = newAllocated;
        emit MemberAdded(account, shareBps, newAllocated);
    }

    function _removeMember(address account) private {
        Member storage m = _members[account];
        if (!m.active) revert NotAMember(account);

        uint256 freed = m.shareBps;
        uint256 index = m.listIndex;
        uint256 lastIndex = _memberList.length - 1;

        if (index != lastIndex) {
            address moved = _memberList[lastIndex];
            _memberList[index] = moved;
            _members[moved].listIndex = index;
        }
        _memberList.pop();

        m.active = false;
        m.shareBps = 0;
        m.listIndex = 0;

        allocatedShareBps -= freed;
        emit MemberRemoved(account, freed, allocatedShareBps);
    }

    /// @dev The fixed-denominator invariant, asserted after every membership mutation:
    ///      the member shares plus the cooperative unallocated portion are always
    ///      exactly TOTAL_SHARE_BPS, and member shares alone never exceed it.
    function _assertSharesBalanced() private view {
        if (allocatedShareBps > TOTAL_SHARE_BPS) {
            revert SharesExceedTotal(allocatedShareBps, TOTAL_SHARE_BPS);
        }
        assert(allocatedShareBps + unallocatedShareBps() == TOTAL_SHARE_BPS);
    }
}
