// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {console} from "forge-std/console.sol";
import {CooperativeTreasury} from "../src/CooperativeTreasury.sol";

/// @notice Drives randomised sequences of the five things that can actually happen to the
///         treasury: a member joins, a member leaves, a share changes, a buyer pays, a
///         painter withdraws.
///
/// @dev Every action is bounded so it is a *legal* action rather than a guaranteed revert
///      — the point is to explore reachable states deeply, not to spend the run watching
///      calls bounce off input validation. Ghost variables track money in and money out so
///      the conservation invariant has something independent to compare against.
contract TreasuryHandler is Test {
    CooperativeTreasury public immutable treasury;
    address public immutable admin;

    /// @dev Six candidate painters. Small enough that the fuzzer revisits the same member
    ///      repeatedly (join, leave, rejoin) rather than always touching a fresh address.
    address[6] public candidates;

    // --- ghost accounting, maintained independently of the contract ---
    uint256 public totalPaidIn;
    uint256 public totalWithdrawn;

    // --- call counters, reported at the end of a run ---
    uint256 public addCalls;
    uint256 public removeCalls;
    uint256 public updateCalls;
    uint256 public payInCalls;
    uint256 public withdrawCalls;

    constructor(CooperativeTreasury treasury_, address admin_) {
        treasury = treasury_;
        admin = admin_;
        for (uint256 i; i < 6; ++i) {
            candidates[i] = address(uint160(0x7000 + i));
        }
    }

    function _candidate(uint256 seed) internal view returns (address) {
        return candidates[bound(seed, 0, 5)];
    }

    function addMember(uint256 whoSeed, uint256 shareSeed) public {
        address who = _candidate(whoSeed);
        if (treasury.isMember(who)) return;

        uint256 free = treasury.unallocatedShareBps();
        if (free == 0) return;

        uint256 share = bound(shareSeed, 1, free);
        vm.prank(admin);
        treasury.addMember(who, share);
        addCalls++;
    }

    function removeMember(uint256 whoSeed) public {
        address who = _candidate(whoSeed);
        if (!treasury.isMember(who)) return;

        vm.prank(admin);
        treasury.removeMember(who);
        removeCalls++;
    }

    function updateShare(uint256 whoSeed, uint256 shareSeed) public {
        address who = _candidate(whoSeed);
        if (!treasury.isMember(who)) return;

        // The new share may take at most what this member already holds plus whatever is
        // still unallocated, otherwise the contract would (correctly) reject it.
        uint256 ceiling = treasury.shareOf(who) + treasury.unallocatedShareBps();
        if (ceiling == 0) return;

        uint256 share = bound(shareSeed, 1, ceiling);
        vm.prank(admin);
        treasury.setMemberShare(who, share);
        updateCalls++;
    }

    function payIn(uint256 amountSeed) public {
        uint256 amount = bound(amountSeed, 1, 20 ether);
        vm.deal(address(this), address(this).balance + amount);

        treasury.payIn{value: amount}("invariant");
        totalPaidIn += amount;
        payInCalls++;
    }

    function withdraw(uint256 whoSeed) public {
        address who = _candidate(whoSeed);
        uint256 owed = treasury.withdrawable(who);
        if (owed == 0) return;

        vm.prank(who);
        treasury.withdraw();
        totalWithdrawn += owed;
        withdrawCalls++;
    }

    receive() external payable {}
}

/// @notice System-wide properties that must hold after *every* call in *every* randomised
///         sequence — not only the orderings a hand-written test happens to construct.
///
///         These target exactly the checks a worked example is most likely to miss:
///         the fixed-denominator invariant, the rounding remainder, and the guarantee that
///         no payout is ever double-counted.
contract CooperativeTreasuryInvariantTest is StdInvariant, Test {
    CooperativeTreasury internal treasury;
    TreasuryHandler internal handler;

    address internal admin = makeAddr("coopAdmin");

    function setUp() public {
        treasury = new CooperativeTreasury(admin);
        handler = new TreasuryHandler(treasury, admin);

        // Only the handler drives the system, so every sequence is a legal one.
        targetContract(address(handler));
    }

    /// @notice Member shares can never sum past the fixed denominator, however the admin
    ///         interleaves joins, departures and share changes.
    function invariant_allocatedNeverExceedsDenominator() public view {
        assertLe(treasury.allocatedShareBps(), treasury.TOTAL_SHARE_BPS());
    }

    /// @notice The cached total always equals the actual sum of the roster. A drift here
    ///         would mean the split reads one thing and the accounting another.
    function invariant_cachedTotalMatchesTheRoster() public view {
        CooperativeTreasury.MemberView[] memory members = treasury.getMembers();
        uint256 sum;
        for (uint256 i; i < members.length; ++i) {
            sum += members[i].shareBps;
        }
        assertEq(sum, treasury.allocatedShareBps(), "roster sum drifted from allocatedShareBps");
    }

    /// @notice Members' shares plus the cooperative's own unallocated portion are always
    ///         exactly the denominator — nothing is owned by nobody.
    function invariant_sharesAlwaysAccountForTheWholeDenominator() public view {
        assertEq(treasury.allocatedShareBps() + treasury.unallocatedShareBps(), treasury.TOTAL_SHARE_BPS());
    }

    /// @notice The contract can always pay what it owes: every member's unwithdrawn
    ///         balance, the co-op reserve, and the dust queued for the next split.
    function invariant_balanceCoversEverythingOwed() public view {
        assertGe(
            address(treasury).balance,
            treasury.totalOwedToMembers() + treasury.reserveBalance() + treasury.carriedRemainder(),
            "treasury cannot cover its liabilities"
        );
        assertTrue(treasury.isSolvent());
    }

    /// @notice Every wei that ever came in is either still owed to someone, held as
    ///         reserve, carried as dust, or was actually paid out — never lost, never
    ///         counted twice. This is the property that would break if a withdrawal ever
    ///         paid the same balance more than once.
    function invariant_everyWeiIsAccountedFor() public view {
        uint256 stillHeld =
            treasury.totalOwedToMembers() + treasury.reserveBalance() + treasury.carriedRemainder();

        assertEq(
            handler.totalPaidIn(),
            handler.totalWithdrawn() + stillHeld,
            "money in does not equal money out plus money still held"
        );
    }

    /// @notice The carried remainder is dust by definition. If it ever reached a whole
    ///         denominator's worth, the split would be leaving real money behind.
    function invariant_remainderStaysDust() public view {
        assertLt(treasury.carriedRemainder(), treasury.TOTAL_SHARE_BPS());
    }

    function invariant_callSummary() public view {
        console.log("addMember   ", handler.addCalls());
        console.log("removeMember", handler.removeCalls());
        console.log("updateShare ", handler.updateCalls());
        console.log("payIn       ", handler.payInCalls());
        console.log("withdraw    ", handler.withdrawCalls());
    }
}
