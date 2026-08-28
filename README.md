# Warli Cooperative Treasury

> Road to Devcon II — *Art, Culture & Ethereum in India*
> Problem 3: **The Aggregator Who Pays Late, In Cash, Minus a Cut**

Sixteen Warli painters in a village outside Palghar sell through a local aggregator. He
collects buyer payments in a lump sum, pays each artisan weeks later, in cash, minus a cut
nobody ever agreed to. Nobody has ever seen the math. When a member leaves the group or a
new one joins, the payouts get murkier still.

`CooperativeTreasury` does what the aggregator claims to do, honestly. Buyer money arrives
and is split immediately across whoever the **current** members actually are, by a share
the cooperative sets together and anyone can read off-chain. Each artisan pulls their own
money when they want it. The arithmetic is public, the roster is public, and the leftover
paise are accounted for.

---

## How a payment splits

A payment is credited, not sent. `payIn()` (or a plain transfer to the contract) runs one
pass over the current roster and writes to a ledger:

```
distributable = msg.value + carriedRemainder        // last split's dust rejoins the pot

for each member m in the CURRENT roster:
    cut = distributable * m.shareBps / 10000        // share read from storage, now
    withdrawable[m] += cut                          // credited, never transferred

toReserve  = distributable * unallocatedShareBps() / 10000
remainder  = distributable - (sum of cuts) - toReserve
carriedRemainder = remainder                        // carried, never dropped
```

Later, and separately, each member calls `withdraw()` for themselves.

### Worked example: 16 painters, 100 wei

All sixteen hold an equal `625` bps (16 × 625 = 10000).

| | |
|---|---|
| Buyer pays | `100 wei` |
| Each painter is credited | `100 × 625 / 10000 = 6.25` → **`6 wei`** (integer division truncates) |
| Total credited to members | `16 × 6 = 96 wei` |
| Unallocated portion | `0` (the roster covers the full 10000 bps) |
| **Remainder** | **`4 wei`** → stored in `carriedRemainder` |

Those 4 wei are not lost and not the aggregator's. On the next payment,
`distributable = newPayment + 4`, so they are divided among the painters then. Over many
sales the dust settles back into the cooperative rather than accumulating silently in the
contract balance.

`previewSplit(amount)` returns this whole calculation as a dry run, so the cooperative can
see the math *before* a buyer pays.

---

## Design decisions

### Shares live in state, never in the code

Every percentage comes from `_members[account].shareBps`, read inside the split loop at the
moment the payment arrives. The only constant in the arithmetic is the denominator,
`TOTAL_SHARE_BPS = 10000`. Change a share with `setMemberShare` and the very next payment
divides by the new number — no redeploy, no snapshot.

### Only the current roster is paid

`_split` iterates `_memberList`, which holds exactly the active members. Someone removed
before a payment arrives is not in that list and accrues nothing from it.

Removal is not confiscation, though: a departing member keeps whatever they had already
accrued, because that money was earned while they were on the roster. `withdrawable` is
deliberately not cleared on removal.

### Pull, not push

The split writes balances and sends nothing. Members withdraw themselves. Two reasons:

- **Safety.** One artisan using a wallet that reverts on receive would, under a push loop,
  revert the entire distribution and freeze the payout for all sixteen. There is a test for
  exactly this (`test_MemberWithRevertingFallbackCannotBlockTheOthers`).
- **Gas.** A push loop makes the buyer pay for sixteen ETH transfers, and that cost grows
  with the cooperative until a payment cannot fit in a block.

### Shares always sum to a fixed denominator

The invariant `allocatedShareBps + unallocatedShareBps() == TOTAL_SHARE_BPS` holds after
every mutation, and is asserted in `_assertSharesBalanced()`. Basis points not assigned to
any member are the cooperative's own unallocated portion; they route to `reserveBalance`,
which an admin can hand to a member with `allocateReserve`. So a shortfall is explicitly
owned rather than lost, and shares can never sum past 10000.

`reconfigureMembership(accounts, shares)` is the intended path for a mid-cycle change: it
replaces the whole roster atomically and **requires the new shares to sum to exactly
10000**. This is how one artisan leaves and the rest re-divide 100% in a single transaction,
with no window where the roster is half-updated.

> Because the roster is kept at exactly 10000, raising one member's share before lowering
> another's will revert. Lower first, or use `reconfigureMembership`.

### No payout can be taken twice

`withdraw()` zeroes `withdrawable[msg.sender]` **before** the external call
(checks-effects-interactions), so a re-entrant caller reads `0` and reverts.
`nonReentrant` is a second, independent barrier. Calling `withdraw()` twice in a row pays
once and then reverts with `NothingToWithdraw`.

### Nothing gets stuck

`isSolvent()` asserts that every wei the contract holds is claimable by someone —
members' unpulled balances, the co-op reserve, or dust queued for the next split. ETH
force-fed past `receive()` (via `selfdestruct`) is recovered by `sweepUnaccountedFunds()`,
which folds it into an ordinary split.

---

## Contract surface

| Function | Who | What it does |
|---|---|---|
| `addMember(account, shareBps)` | `COOP_ADMIN_ROLE` | Register a member with a share of future income |
| `removeMember(account)` | `COOP_ADMIN_ROLE` | Drop from the roster; accrued balance survives |
| `setMemberShare(account, bps)` | `COOP_ADMIN_ROLE` | Change a share, checked against the denominator |
| `reconfigureMembership(accts, bps)` | `COOP_ADMIN_ROLE` | Atomic roster replacement, must sum to exactly 10000 |
| `payIn(memo)` | anyone | Buyer payment with an invoice label; splits immediately |
| `receive()` | anyone | Plain transfer, treated as an unlabelled payment |
| `withdraw()` | any member | Pull your own accrued balance |
| `allocateReserve(to, amount)` | `COOP_ADMIN_ROLE` | Move unallocated reserve to a member |
| `sweepUnaccountedFunds()` | anyone | Fold force-fed ETH into a normal split |
| `previewSplit(amount)` | view | Dry-run a split against the current roster |
| `getMembers()` | view | The whole roster with shares and balances |
| `isSolvent()` | view | Every wei is accounted for |

Roles: `COOP_ADMIN_ROLE` manages the roster. `DEFAULT_ADMIN_ROLE` manages roles. Both are
granted to the `admin` given at construction.

---

## Tests

```
forge test -vv
```

30 tests, grouped under headings that match the guarantees above.

| Guarantee | Tests |
|---|---|
| Shares read from updatable on-chain state | `test_SplitReadsSharesFromOnChainTable`, `test_UpdatedShareChangesTheNextSplit` |
| Only current members are paid | `test_RemovedMemberGetsNoShareOfLaterPayment`, `test_RemovedMemberKeepsWhatTheyAlreadyEarned`, `test_MemberJoiningAndLeavingMidCycle` |
| Roster changes are admin-gated | `test_AddMemberRequiresCoopAdminRole`, `test_RemoveMemberRequiresCoopAdminRole`, `test_SetMemberShareRequiresCoopAdminRole`, `test_ReconfigureRequiresCoopAdminRole`, `test_MemberCannotChangeTheirOwnShare` |
| Pull, not push | `test_SplitCreditsBalancesAndSendsNothing`, `test_MemberPullsTheirOwnShare`, `test_MemberWithRevertingFallbackCannotBlockTheOthers` |
| Remainder is accounted for | `test_RemainderIsCarriedToTheNextSplit`, `test_NoWeiIsEverUnaccountedFor`, `test_UnallocatedSharesAccrueToReserveAndCanBeAllocated`, `test_ForceFedEtherCanBeSweptIntoASplit` |
| Shares sum to a fixed denominator | `test_SharesCannotExceedTheFixedTotal`, `test_UpdatingAShareCannotPushPastTheTotal`, `test_ReconfigureMustSumToExactlyTheTotal`, `test_AllocatedPlusUnallocatedAlwaysEqualsTheTotal` |
| No double withdrawal | `test_SecondWithdrawInARowPaysNothing`, `test_ReentrantMemberCannotBePaidTwice` |
| Value conservation (fuzz, 512 runs each) | `testFuzz_SplitConservesValue`, `testFuzz_WithdrawPaysTheCreditedAmountExactlyOnce` |

---

## Build and deploy

Requires [Foundry](https://getfoundry.sh).

```bash
git clone --recursive <this repo>      # --recursive: forge-std and OpenZeppelin are submodules
cd warli-cooperative-treasury
forge build
forge test
```

Deploying to Base Sepolia:

```bash
cp .env.example .env                   # then edit; .env is gitignored
cast wallet import devcon --interactive        # encrypted keystore, no raw key on disk
forge script script/Deploy.s.sol:Deploy \
  --rpc-url base_sepolia --account devcon --broadcast --verify
```

No private key, API key, or authenticated URL is stored in this repository. `.env` is
gitignored; `.env.example` contains placeholders only, and the deploy script takes its
signer from the forge invocation rather than from a file.

---

## Stack

Solidity 0.8.28 · Foundry · OpenZeppelin v5.1.0 (`AccessControl`, `ReentrancyGuard`) ·
Base Sepolia.

## License

MIT
