// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {CooperativeTreasury} from "../src/CooperativeTreasury.sol";
import {ReentrantMember, RejectingMember} from "./mocks/Members.sol";

/// @notice Behavioural tests for the Palghar Warli cooperative treasury.
///
///         The section headings match the guarantees the treasury is supposed to make:
///         shares come from live on-chain state, only current members are paid, the
///         roster is admin-gated, members pull rather than being pushed, the rounding
///         remainder survives, shares sum to a fixed denominator, and no payout can be
///         taken twice.
contract CooperativeTreasuryTest is Test {
    CooperativeTreasury internal treasury;

    address internal admin = makeAddr("coopAdmin");
    address internal outsider = makeAddr("outsider");
    address internal buyer = makeAddr("berlinBuyer");

    address internal kalpana = makeAddr("kalpana");
    address internal jivya = makeAddr("jivya");
    address internal shantaram = makeAddr("shantaram");
    address internal balu = makeAddr("balu");

    uint256 internal constant TOTAL = 10_000;

    /// @dev Cached in setUp: reading it via treasury.COOP_ADMIN_ROLE() inside a test
    ///      would be an external call that consumes the pending vm.prank.
    bytes32 internal coopAdminRole;

    function setUp() public {
        treasury = new CooperativeTreasury(admin);
        coopAdminRole = treasury.COOP_ADMIN_ROLE();
        vm.deal(buyer, 1_000 ether);
        vm.deal(outsider, 10 ether);
    }

    // -----------------------------------------------------------------
    // helpers
    // -----------------------------------------------------------------

    /// @dev Four painters splitting 100%: 40 / 30 / 20 / 10.
    function _seedFourMembers() internal {
        vm.startPrank(admin);
        treasury.addMember(kalpana, 4_000);
        treasury.addMember(jivya, 3_000);
        treasury.addMember(shantaram, 2_000);
        treasury.addMember(balu, 1_000);
        vm.stopPrank();
    }

    function _pay(uint256 amount) internal {
        vm.prank(buyer);
        treasury.payIn{value: amount}("order-001");
    }

    // =================================================================
    // 1. Shares are read from an on-chain, updatable member table
    // =================================================================

    function test_SplitReadsSharesFromOnChainTable() public {
        _seedFourMembers();
        _pay(10 ether);

        assertEq(treasury.withdrawable(kalpana), 4 ether, "40% of 10 ether");
        assertEq(treasury.withdrawable(jivya), 3 ether, "30% of 10 ether");
        assertEq(treasury.withdrawable(shantaram), 2 ether, "20% of 10 ether");
        assertEq(treasury.withdrawable(balu), 1 ether, "10% of 10 ether");
    }

    /// @notice The decisive test for "not hardcoded": change a share after deployment
    ///         and the very next payment splits by the new number.
    function test_UpdatedShareChangesTheNextSplit() public {
        _seedFourMembers();
        _pay(10 ether);
        assertEq(treasury.withdrawable(kalpana), 4 ether);

        // Kalpana takes on more of the work; balu steps back. Same total.
        // Balu must be lowered first: the roster is already at 10000, so raising
        // kalpana ahead of that would overshoot the denominator and revert.
        vm.startPrank(admin);
        treasury.setMemberShare(balu, 500);
        treasury.setMemberShare(kalpana, 4_500);
        vm.stopPrank();

        _pay(10 ether);

        // Second payment used the *new* shares, not the ones set at join time.
        assertEq(treasury.withdrawable(kalpana), 4 ether + 4.5 ether, "45% on the 2nd split");
        assertEq(treasury.withdrawable(balu), 1 ether + 0.5 ether, "5% on the 2nd split");
        assertEq(treasury.shareOf(kalpana), 4_500);
    }

    function test_ShareOfIsZeroForNonMember() public view {
        assertEq(treasury.shareOf(outsider), 0);
    }

    // =================================================================
    // 2. Payouts reach only currently registered members
    // =================================================================

    function test_RemovedMemberGetsNoShareOfLaterPayment() public {
        _seedFourMembers();

        vm.prank(admin);
        treasury.removeMember(balu);

        _pay(9 ether); // balu is off the roster before this payment splits

        assertEq(treasury.withdrawable(balu), 0, "removed before the split, so nothing accrues");
        assertFalse(treasury.isMember(balu));
        assertEq(treasury.memberCount(), 3);
    }

    /// @notice Removal is not confiscation: money earned while on the roster stays owed.
    function test_RemovedMemberKeepsWhatTheyAlreadyEarned() public {
        _seedFourMembers();
        _pay(10 ether);
        assertEq(treasury.withdrawable(balu), 1 ether);

        vm.prank(admin);
        treasury.removeMember(balu);

        assertEq(treasury.withdrawable(balu), 1 ether, "already-earned balance survives removal");

        vm.prank(balu);
        treasury.withdraw();
        assertEq(balu.balance, 1 ether);
    }

    /// @notice A member who joins mid-cycle shares in the payments that follow, and only
    ///         those. (Deliverable calls for a joining-and-leaving-mid-cycle test.)
    function test_MemberJoiningAndLeavingMidCycle() public {
        vm.startPrank(admin);
        treasury.addMember(kalpana, 5_000);
        treasury.addMember(jivya, 5_000);
        vm.stopPrank();

        _pay(10 ether); // cycle 1: two members
        assertEq(treasury.withdrawable(kalpana), 5 ether);
        assertEq(treasury.withdrawable(jivya), 5 ether);
        assertEq(treasury.withdrawable(shantaram), 0, "not a member yet");

        // Shantaram joins; the three re-divide 100% atomically.
        address[] memory accounts = new address[](3);
        uint256[] memory shares = new uint256[](3);
        accounts[0] = kalpana;
        accounts[1] = jivya;
        accounts[2] = shantaram;
        shares[0] = 4_000;
        shares[1] = 3_000;
        shares[2] = 3_000;
        vm.prank(admin);
        treasury.reconfigureMembership(accounts, shares);

        _pay(10 ether); // cycle 2: three members
        assertEq(treasury.withdrawable(kalpana), 5 ether + 4 ether);
        assertEq(treasury.withdrawable(jivya), 5 ether + 3 ether);
        assertEq(treasury.withdrawable(shantaram), 3 ether, "shares only from the cycle they joined");

        // Jivya leaves; the remaining two re-divide 100%.
        address[] memory after_ = new address[](2);
        uint256[] memory afterShares = new uint256[](2);
        after_[0] = kalpana;
        after_[1] = shantaram;
        afterShares[0] = 6_000;
        afterShares[1] = 4_000;
        vm.prank(admin);
        treasury.reconfigureMembership(after_, afterShares);

        _pay(10 ether); // cycle 3: two members
        assertEq(treasury.withdrawable(kalpana), 9 ether + 6 ether);
        assertEq(treasury.withdrawable(shantaram), 3 ether + 4 ether);
        assertEq(treasury.withdrawable(jivya), 8 ether, "frozen at what she earned before leaving");
    }

    // =================================================================
    // 3. Member add / remove is admin-gated
    // =================================================================

    function test_AddMemberRequiresCoopAdminRole() public {
        vm.prank(outsider);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, outsider, coopAdminRole
            )
        );
        treasury.addMember(kalpana, 5_000);
    }

    function test_RemoveMemberRequiresCoopAdminRole() public {
        _seedFourMembers();
        vm.prank(outsider);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, outsider, coopAdminRole
            )
        );
        treasury.removeMember(kalpana);
    }

    function test_SetMemberShareRequiresCoopAdminRole() public {
        _seedFourMembers();
        vm.prank(outsider);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, outsider, coopAdminRole
            )
        );
        treasury.setMemberShare(kalpana, 9_000);
    }

    function test_ReconfigureRequiresCoopAdminRole() public {
        address[] memory accounts = new address[](1);
        uint256[] memory shares = new uint256[](1);
        accounts[0] = outsider;
        shares[0] = TOTAL;

        vm.prank(outsider);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, outsider, coopAdminRole
            )
        );
        treasury.reconfigureMembership(accounts, shares);
    }

    /// @notice A member cannot quietly raise their own share.
    function test_MemberCannotChangeTheirOwnShare() public {
        _seedFourMembers();
        vm.prank(kalpana);
        vm.expectRevert();
        treasury.setMemberShare(kalpana, 9_000);
    }

    function test_AdminHoldsBothRolesAtDeployment() public view {
        assertTrue(treasury.hasRole(treasury.COOP_ADMIN_ROLE(), admin));
        assertTrue(treasury.hasRole(treasury.DEFAULT_ADMIN_ROLE(), admin));
    }

    // =================================================================
    // 4. Members withdraw their own share (pull, not push)
    // =================================================================

    /// @notice A split moves no ETH. It only writes balances.
    function test_SplitCreditsBalancesAndSendsNothing() public {
        _seedFourMembers();

        uint256 kalpanaBefore = kalpana.balance;
        _pay(10 ether);

        assertEq(kalpana.balance, kalpanaBefore, "no ETH was pushed during the split");
        assertEq(treasury.withdrawable(kalpana), 4 ether, "it was credited instead");
        assertEq(address(treasury).balance, 10 ether, "the money is still in the treasury");
    }

    function test_MemberPullsTheirOwnShare() public {
        _seedFourMembers();
        _pay(10 ether);

        vm.prank(kalpana);
        uint256 paid = treasury.withdraw();

        assertEq(paid, 4 ether);
        assertEq(kalpana.balance, 4 ether);
        assertEq(treasury.withdrawable(kalpana), 0);
        assertEq(address(treasury).balance, 6 ether, "everyone else is untouched");
    }

    /// @notice The reason to pull rather than push: one member whose fallback reverts
    ///         would, under a push loop, freeze the payout for the whole cooperative.
    function test_MemberWithRevertingFallbackCannotBlockTheOthers() public {
        RejectingMember stubborn = new RejectingMember();

        vm.startPrank(admin);
        treasury.addMember(address(stubborn), 5_000);
        treasury.addMember(kalpana, 5_000);
        vm.stopPrank();

        _pay(10 ether); // the split itself does not revert

        assertEq(treasury.withdrawable(address(stubborn)), 5 ether);

        // Kalpana is paid normally even though the other member cannot receive ETH.
        vm.prank(kalpana);
        treasury.withdraw();
        assertEq(kalpana.balance, 5 ether);

        // The stubborn member's own withdrawal fails, and only theirs.
        vm.expectRevert();
        stubborn.pull(treasury);
        assertEq(treasury.withdrawable(address(stubborn)), 5 ether, "still owed, not lost");
    }

    function test_WithdrawWithNothingOwedReverts() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(CooperativeTreasury.NothingToWithdraw.selector, outsider));
        treasury.withdraw();
    }

    // =================================================================
    // 5. The rounding remainder is accounted for
    // =================================================================

    /// @notice Sixteen painters on 625 bps each: 100 wei does not divide evenly.
    function test_RemainderIsCarriedToTheNextSplit() public {
        address[] memory sixteen = new address[](16);
        uint256[] memory shares = new uint256[](16);
        for (uint256 i; i < 16; ++i) {
            sixteen[i] = address(uint160(0x5000 + i));
            shares[i] = 625; // 16 * 625 == 10000
        }
        vm.prank(admin);
        treasury.reconfigureMembership(sixteen, shares);

        _pay(100 wei);

        // 100 * 625 / 10000 == 6 (truncated) for each of the sixteen -> 96 assigned.
        uint256 assigned;
        for (uint256 i; i < 16; ++i) {
            assertEq(treasury.withdrawable(sixteen[i]), 6);
            assigned += treasury.withdrawable(sixteen[i]);
        }
        assertEq(assigned, 96);
        assertEq(treasury.carriedRemainder(), 4, "the 4 wei that would not divide is kept");

        // Those 4 wei rejoin the pot on the next payment rather than being written off.
        _pay(100 wei);
        assertEq(treasury.carriedRemainder() + _sum(sixteen), 200, "nothing left the system");
    }

    function test_NoWeiIsEverUnaccountedFor() public {
        _seedFourMembers();
        _pay(1 ether + 7 wei);
        _pay(3 wei);
        _pay(999_999_999_999 wei);

        assertTrue(treasury.isSolvent(), "every wei is claimable by someone");
        assertEq(
            treasury.totalOwedToMembers() + treasury.reserveBalance() + treasury.carriedRemainder(),
            address(treasury).balance,
            "ledger accounts for the whole balance exactly"
        );
    }

    /// @notice Basis points the co-op has not handed out are held in the reserve, and the
    ///         admin can move them to a member. They are never stranded.
    function test_UnallocatedSharesAccrueToReserveAndCanBeAllocated() public {
        vm.prank(admin);
        treasury.addMember(kalpana, 6_000); // 4000 bps left unallocated

        _pay(10 ether);

        assertEq(treasury.withdrawable(kalpana), 6 ether);
        assertEq(treasury.reserveBalance(), 4 ether, "the co-op holds the rest");
        assertEq(treasury.unallocatedShareBps(), 4_000);

        vm.prank(admin);
        treasury.allocateReserve(jivya, 4 ether);

        assertEq(treasury.reserveBalance(), 0);
        assertEq(treasury.withdrawable(jivya), 4 ether);
    }

    /// @notice ETH force-fed past `receive()` is swept back into a normal split.
    function test_ForceFedEtherCanBeSweptIntoASplit() public {
        _seedFourMembers();
        vm.deal(address(treasury), 8 ether); // simulates a selfdestruct push

        assertEq(treasury.unaccountedBalance(), 8 ether);

        treasury.sweepUnaccountedFunds();

        assertEq(treasury.unaccountedBalance(), 0);
        assertEq(treasury.withdrawable(kalpana), 3.2 ether, "40% of the swept 8 ether");
        assertTrue(treasury.isSolvent());
    }

    // =================================================================
    // 6. Member shares always sum to a fixed denominator
    // =================================================================

    function test_SharesCannotExceedTheFixedTotal() public {
        vm.startPrank(admin);
        treasury.addMember(kalpana, 7_000);
        vm.expectRevert(abi.encodeWithSelector(CooperativeTreasury.SharesExceedTotal.selector, 10_500, TOTAL));
        treasury.addMember(jivya, 3_500);
        vm.stopPrank();
    }

    function test_UpdatingAShareCannotPushPastTheTotal() public {
        _seedFourMembers(); // exactly 10000 allocated
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(CooperativeTreasury.SharesExceedTotal.selector, 10_500, TOTAL));
        treasury.setMemberShare(kalpana, 4_500);
    }

    function test_ReconfigureMustSumToExactlyTheTotal() public {
        address[] memory accounts = new address[](2);
        uint256[] memory shares = new uint256[](2);
        accounts[0] = kalpana;
        accounts[1] = jivya;

        shares[0] = 5_000;
        shares[1] = 4_000; // 9000, short
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(CooperativeTreasury.SharesMustEqualTotal.selector, 9_000, TOTAL)
        );
        treasury.reconfigureMembership(accounts, shares);

        shares[1] = 6_000; // 11000, over
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(CooperativeTreasury.SharesMustEqualTotal.selector, 11_000, TOTAL)
        );
        treasury.reconfigureMembership(accounts, shares);
    }

    function test_AllocatedPlusUnallocatedAlwaysEqualsTheTotal() public {
        assertEq(treasury.allocatedShareBps() + treasury.unallocatedShareBps(), TOTAL);

        _seedFourMembers();
        assertEq(treasury.allocatedShareBps(), TOTAL);
        assertEq(treasury.allocatedShareBps() + treasury.unallocatedShareBps(), TOTAL);

        vm.prank(admin);
        treasury.removeMember(jivya);
        assertEq(treasury.allocatedShareBps(), 7_000);
        assertEq(treasury.allocatedShareBps() + treasury.unallocatedShareBps(), TOTAL);
    }

    function test_ZeroShareMemberIsRejected() public {
        vm.prank(admin);
        vm.expectRevert(CooperativeTreasury.ZeroShare.selector);
        treasury.addMember(kalpana, 0);
    }

    function test_DuplicateMemberIsRejected() public {
        vm.startPrank(admin);
        treasury.addMember(kalpana, 5_000);
        vm.expectRevert(abi.encodeWithSelector(CooperativeTreasury.AlreadyMember.selector, kalpana));
        treasury.addMember(kalpana, 1_000);
        vm.stopPrank();
    }

    // =================================================================
    // 7. No double withdrawal of the same payout
    // =================================================================

    function test_SecondWithdrawInARowPaysNothing() public {
        _seedFourMembers();
        _pay(10 ether);

        vm.prank(kalpana);
        treasury.withdraw();
        assertEq(kalpana.balance, 4 ether);

        // The balance was zeroed by the first call, so the second finds nothing.
        vm.prank(kalpana);
        vm.expectRevert(abi.encodeWithSelector(CooperativeTreasury.NothingToWithdraw.selector, kalpana));
        treasury.withdraw();

        assertEq(kalpana.balance, 4 ether, "paid once, not twice");
    }

    /// @notice A member contract that calls back into `withdraw()` from its `receive()`
    ///         gets exactly one payout, not two.
    function test_ReentrantMemberCannotBePaidTwice() public {
        ReentrantMember attacker = new ReentrantMember(treasury);

        vm.startPrank(admin);
        treasury.addMember(address(attacker), 5_000);
        treasury.addMember(kalpana, 5_000);
        vm.stopPrank();

        _pay(10 ether);
        assertEq(treasury.withdrawable(address(attacker)), 5 ether);

        attacker.attack();

        assertFalse(attacker.reentrySucceeded(), "the nested withdraw was rejected");
        assertEq(address(attacker).balance, 5 ether, "exactly one share, not two");
        assertEq(treasury.withdrawable(address(attacker)), 0);
        assertEq(address(treasury).balance, 5 ether, "kalpana's half is untouched");
        assertTrue(treasury.isSolvent());
    }

    // =================================================================
    // Fuzz
    // =================================================================

    /// @notice For any payment and any legal roster, the treasury never credits more
    ///         than it received and never loses a wei.
    function testFuzz_SplitConservesValue(uint96 amount, uint16 aShare) public {
        amount = uint96(bound(amount, 1, type(uint96).max));
        uint256 shareA = bound(aShare, 1, TOTAL - 1);

        vm.startPrank(admin);
        treasury.addMember(kalpana, shareA);
        treasury.addMember(jivya, TOTAL - shareA);
        vm.stopPrank();

        vm.deal(buyer, amount);
        vm.prank(buyer);
        treasury.payIn{value: amount}("fuzz");

        uint256 accounted =
            treasury.totalOwedToMembers() + treasury.reserveBalance() + treasury.carriedRemainder();

        assertEq(accounted, amount, "credited exactly what arrived");
        assertEq(address(treasury).balance, amount);
        assertTrue(treasury.carriedRemainder() < TOTAL, "remainder is bounded by the denominator");
    }

    function testFuzz_WithdrawPaysTheCreditedAmountExactlyOnce(uint96 amount) public {
        amount = uint96(bound(amount, TOTAL, type(uint96).max));

        vm.prank(admin);
        treasury.addMember(kalpana, TOTAL);

        vm.deal(buyer, amount);
        vm.prank(buyer);
        treasury.payIn{value: amount}("fuzz");

        uint256 owed = treasury.withdrawable(kalpana);

        vm.prank(kalpana);
        treasury.withdraw();
        assertEq(kalpana.balance, owed);

        vm.prank(kalpana);
        vm.expectRevert();
        treasury.withdraw();
        assertEq(kalpana.balance, owed, "still exactly one payout");
    }

    // -----------------------------------------------------------------

    function _sum(address[] memory accounts) internal view returns (uint256 total) {
        for (uint256 i; i < accounts.length; ++i) {
            total += treasury.withdrawable(accounts[i]);
        }
    }
}
