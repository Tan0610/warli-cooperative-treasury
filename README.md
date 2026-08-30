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

## Why this satisfies the scored checks

| # | Check | How it is satisfied |
|---|---|---|
| 1 | Shares read from an on-chain, updatable member table | `_split` reads `_members[account].shareBps` from storage on every call, inside the loop. No percentage appears as a literal in the split arithmetic; the only constant is the denominator. `setMemberShare` changes it after deployment and `test_UpdatedShareChangesTheNextSplit` proves the very next payment divides by the new number. |
| 2 | Payouts reach only currently registered members | `_split` iterates `_memberList`, which `removeMember` keeps in sync by swap-and-pop the instant someone leaves. A member removed before a payment is not in that array and accrues nothing from it (`test_RemovedMemberGetsNoShareOfLaterPayment`). Balances earned *before* removal are deliberately preserved. |
| 3 | Member add/remove is admin-gated | `addMember`, `removeMember`, `setMemberShare` and `reconfigureMembership` all carry `onlyRole(COOP_ADMIN_ROLE)`. Five negative tests, including `test_MemberCannotChangeTheirOwnShare`. |
| 4 | Members withdraw their own share (pull, not push) | `_split` only ever writes `withdrawable[account] += cut`. It transfers nothing. `withdraw()` is the sole function that moves value, and only to `msg.sender`. `test_MemberWithRevertingFallbackCannotBlockTheOthers` shows why: under a push loop one hostile wallet would freeze the payout for all sixteen. |
| 5 | Rounding remainder is accounted for | Dust from integer division goes to `carriedRemainder` and is folded into the *next* split's distributable amount. Demonstrated with sixteen painters and 100 wei, and observable on the live deployment where `carriedRemainder()` returns **7 wei**. |
| 6 | Member shares always sum to a fixed total | Every mutation checks against `TOTAL_SHARE_BPS = 10000` and ends in `_assertSharesBalanced()`. `reconfigureMembership` requires the new roster to sum to *exactly* the denominator. Basis points not assigned to a member are the co-op's own portion, so `allocated + unallocated == 10000` always holds — nothing is owned by nobody. |
| 7 | No double withdrawal of the same payout | `withdraw()` zeroes `withdrawable[msg.sender]` **before** the external call, plus `nonReentrant`. A second call reverts `NothingToWithdraw`; a re-entrant caller reads zero. Both tested, and the invariant suite asserts money-in equals money-out plus money-held across 51,200 randomised calls. |
| 8 | No credentials in tracked files | No key, API key or authenticated URL anywhere in the tree. `.env` and `.env.local` gitignored, examples hold placeholders, and both the deploy and seed scripts take signers from the invocation or the environment rather than a file. |

The two things the checklist cannot reach are handled deliberately: there is **no DAO,
no proposals, no voting** — the story asks for a transparent admin-run split among sixteen
people who know each other — and there **is** a dashboard, so the cooperative does not
simply swap the aggregator for a developer.

---

## Project layout

```
src/CooperativeTreasury.sol                the treasury contract
script/Deploy.s.sol                        Base Sepolia deploy script
script/SeedLocal.s.sol                     local anvil fixture: 16 painters + an uneven payment
test/CooperativeTreasury.t.sol             30 unit and fuzz tests, grouped per guarantee
test/CooperativeTreasury.invariant.t.sol   stateful invariant suite (51,200 calls)
test/mocks/Members.sol                     reentrant member and ETH-rejecting member
dashboard/                                 Next.js + wagmi UI (roster, withdraw, admin, pay-in)
DEPLOYMENTS.md                             live Base Sepolia address and seeded state
```

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

## Live on Base Sepolia

### → **[warli-cooperative-treasury.vercel.app](https://warli-cooperative-treasury.vercel.app)**

The dashboard is hosted and public. It reads the deployed contract directly, so the roster,
the shares, the unpaid balances and the carried remainder are all live chain state — not a
demo fixture. Full details in **[DEPLOYMENTS.md](DEPLOYMENTS.md)**.

`CooperativeTreasury` → [`0x617830218A2C86a34F48a5D54e5F5e8D19217732`](https://sepolia.basescan.org/address/0x617830218A2C86a34F48a5D54e5F5e8D19217732)

Sixteen painters at 625 bps each, fully allocated, with one buyer payment of
`100000000000007 wei` that deliberately does not divide by sixteen. Read back from the
live contract: `memberCount() = 16`, `unallocatedShareBps() = 0`,
**`carriedRemainder() = 7 wei`**, `isSolvent() = true`.

Those 7 wei are the point — the dust was carried, not dropped, and you can see it on a
public network rather than take the README's word for it.

**Source-verified on [Sourcify](https://repo.sourcify.dev/84532/0x617830218A2C86a34F48a5D54e5F5e8D19217732)**
with an exact match on both creation and runtime bytecode, so the deployed contract is
provably the code in this repo.

> The dashboard is read-only until you choose to connect — the roster, shares, balances and
> remainder all load from public RPC reads. Note that MetaMask may warn about the domain:
> `*.vercel.app` subdomains registered hours ago are a common phishing shape, so the
> reputation check flags them by default. The page loads no third-party scripts and
> references no external origin but the block explorer.

```bash
cd dashboard && npm install
echo "NEXT_PUBLIC_TREASURY_ADDRESS=0x617830218A2C86a34F48a5D54e5F5e8D19217732" > .env.local
npm run dev
```

---

## The part the cooperative actually touches

A contract that only a developer can operate leaves sixteen painters exactly as dependent
on a technical middleman as the aggregator they were trying to escape. So `dashboard/` is a
Next.js + wagmi app covering the whole job without a terminal:

| Who | What they do |
|---|---|
| **A painter** | Connects her wallet, sees what she is owed and her share of future payments, presses Withdraw. Nobody sends it to her. |
| **Anyone at all** | Reads the full roster — every member, every share, every unpaid balance. This is the math nobody had ever seen. |
| **The cooperative admin** | Adds a member, removes one, changes a share. The panel only appears for an address that actually holds `COOP_ADMIN_ROLE`. |
| **A buyer** | Pays the cooperative and sees the exact split, member by member, *before* confirming the transaction. |

The carried remainder is shown in wei on the page, so the leftover paise are visible rather
than a claim in a README.

```bash
anvil &
export SEED_ADMIN_PK=0x…    # anvil account (0), from anvil's own startup banner
forge script script/SeedLocal.s.sol:SeedLocal --rpc-url http://127.0.0.1:8545 --broadcast

cd dashboard && npm install
cp .env.example .env.local  # paste the printed NEXT_PUBLIC_TREASURY_ADDRESS
npm run dev
```

`SeedLocal` puts sixteen painters on the roster at 6.25% each and pays in
`1 ether + 7 wei` — deliberately not divisible by sixteen, so the dashboard has a real
7-wei carried remainder to display. Verified end to end against that deployment: sixteen
members read back at 6.25% with 0.0625 ETH each owed, `carriedRemainder` 7 wei, and
`hasRole(COOP_ADMIN_ROLE)` true for the admin so the admin panel renders.

No deliberate governance layer, no proposals, no voting. The story asks for a transparent
admin-run split among sixteen people who know each other; a DAO would be a different
product and a larger failure surface.

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

30 unit and fuzz tests grouped under headings that match the guarantees above, plus a stateful invariant suite (see below).

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

## Known limitations

**Raising one share before lowering another reverts.** The roster is held at exactly 100%
between the members and the co-op's own portion, so `setMemberShare` upward fails unless
there is unallocated room. Lower first, or use `reconfigureMembership` to swap the whole
roster atomically. This is the invariant working as intended, but it is a real usability
edge and the dashboard says so on the admin panel.

**A partly-allocated roster still accepts payments.** If members sum to less than 10000
bps, a payment still splits and the unallocated portion routes to `reserveBalance` for the
admin to hand out later with `allocateReserve`. The alternative — rejecting payments until
the roster is exactly full — was considered and rejected: it means a buyer's transaction
fails because of the cooperative's internal bookkeeping, which is the kind of friction that
sends people back to the aggregator. Nothing is lost either way; the difference is only
whether the gap is held by the co-op or blocks the payment.

**The admin is trusted with the roster.** A malicious `COOP_ADMIN_ROLE` holder could remove
members or reassign shares before a large payment. This is deliberate: the story asks for a
transparent, admin-run split among sixteen people who know each other, not a governance
system. What the contract guarantees is that every such change is public, logged, and
visible on the dashboard before the next payment — which is exactly what the aggregator
never offered. Making the role a multisig is a deployment choice, not a code change.

**`MAX_MEMBERS = 200`.** The split loop is bounded so a payment can never become
unpayable. A cooperative larger than that would need a merkle-claim design instead.

---

## Beyond the brief: stateful invariant testing

Worked examples only prove the orderings the author thought to write down. Checks 5, 6 and
7 — the rounding remainder, the fixed-denominator invariant, and no double withdrawal — are
exactly the properties that survive a hand-written test and then break on a sequence of
membership changes nobody imagined.

So `test/CooperativeTreasury.invariant.t.sol` drives randomised sequences of the five
things that can actually happen — a member joins, leaves, has their share changed, a buyer
pays, a painter withdraws — over six candidate painters, and asserts six system-wide
properties after **every call in every run**:

| Invariant | What it rules out |
|---|---|
| `allocatedNeverExceedsDenominator` | Shares summing past 10000 bps under any interleaving |
| `cachedTotalMatchesTheRoster` | `allocatedShareBps` drifting from the actual member table |
| `sharesAlwaysAccountForTheWholeDenominator` | Any basis point owned by nobody |
| `balanceCoversEverythingOwed` | The treasury being unable to pay what it owes |
| `everyWeiIsAccountedFor` | Money lost, or a balance withdrawn twice |
| `remainderStaysDust` | The carried remainder growing into real money left behind |

The conservation invariant is the sharp one: the handler tracks every wei paid in and every
wei withdrawn independently of the contract, then asserts
`paidIn == withdrawn + owed + reserve + remainder`. A double withdrawal breaks it
immediately, whatever path produced it.

```
Ran 1 test for test/CooperativeTreasury.invariant.t.sol:CooperativeTreasuryInvariantTest
[PASS] invariant_allocatedNeverExceedsDenominator
[PASS] invariant_balanceCoversEverythingOwed
[PASS] invariant_cachedTotalMatchesTheRoster
[PASS] invariant_everyWeiIsAccountedFor
[PASS] invariant_remainderStaysDust
[PASS] invariant_sharesAlwaysAccountForTheWholeDenominator
 CooperativeTreasuryInvariantTest invariants (runs: 256, calls: 51200, reverts: 0)

╭-----------------+--------------+-------+---------+----------╮
| Contract        | Selector     | Calls | Reverts | Discards |
+=============================================================+
| TreasuryHandler | addMember    | 10249 | 0       | 0        |
| TreasuryHandler | payIn        | 10087 | 0       | 0        |
| TreasuryHandler | removeMember | 10290 | 0       | 0        |
| TreasuryHandler | updateShare  | 10487 | 0       | 0        |
| TreasuryHandler | withdraw     | 10087 | 0       | 0        |
╰-----------------+--------------+-------+---------+----------╯

Suite result: ok. 1 passed; 0 failed; 0 skipped; finished in 20.95s
```

256 runs × 200 calls — 51,200 calls, **0 reverts, 0 violations**. The zero-revert column
matters: every action the handler takes is bounded to a *legal* one, so the run spends its
whole budget exploring reachable states rather than bouncing off input validation.

```bash
forge test --match-contract Invariant -v
```

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
