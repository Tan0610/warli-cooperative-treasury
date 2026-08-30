# Deployments — Base Sepolia (chain 84532)

Live, seeded, and readable in the dashboard.

| Contract | Address |
|---|---|
| `CooperativeTreasury` | [`0x617830218A2C86a34F48a5D54e5F5e8D19217732`](https://sepolia.basescan.org/address/0x617830218A2C86a34F48a5D54e5F5e8D19217732) |

`COOP_ADMIN_ROLE` and `DEFAULT_ADMIN_ROLE`: `0xA39D127B021196AA7Eec7427d4c9af19001A086b`.

## Seeded state, read back from the live contract

Sixteen painters at **625 bps each** (16 × 625 = 10000, fully allocated), and one buyer
payment of `100000000000007 wei` — deliberately not divisible by sixteen.

| | |
|---|---|
| `memberCount()` | `16` |
| `unallocatedShareBps()` | `0` — the roster covers the whole denominator |
| `totalReceived()` | `100000000000007` wei |
| `totalOwedToMembers()` | `100000000000000` wei |
| **`carriedRemainder()`** | **`7` wei** |
| `isSolvent()` | `true` |

Those 7 wei are the whole point. The payment did not divide evenly, the dust was carried
rather than dropped, and the dashboard displays it — so the "leftover paise are accounted
for" claim is observable on a public network rather than asserted in a README.

One of the sixteen members is the admin address, so connecting that wallet to the dashboard
shows both the admin panel and a real member balance.

## Running the dashboard against it

```bash
cd dashboard && npm install
echo "NEXT_PUBLIC_TREASURY_ADDRESS=0x617830218A2C86a34F48a5D54e5F5e8D19217732" > .env.local
npm run dev
```

Point a wallet at Base Sepolia and the roster, shares, balances and carried remainder all
load from the live contract.

## Reading it without the dashboard

```bash
cast call 0x617830218A2C86a34F48a5D54e5F5e8D19217732 "memberCount()(uint256)"       --rpc-url https://sepolia.base.org
cast call 0x617830218A2C86a34F48a5D54e5F5e8D19217732 "carriedRemainder()(uint256)"  --rpc-url https://sepolia.base.org
cast call 0x617830218A2C86a34F48a5D54e5F5e8D19217732 "isSolvent()(bool)"            --rpc-url https://sepolia.base.org
```

> The deploying key is a throwaway that has only ever held Base Sepolia testnet ETH, and
> its private key was exposed during development. It holds `COOP_ADMIN_ROLE`, which makes
> this a demonstration rather than a production instance — a real cooperative would put
> that role behind a multisig.

## Source verification

Verified on **Sourcify** with an exact match on both creation and runtime bytecode, so the
deployed code is provably the code in this repo:

- https://repo.sourcify.dev/84532/0x617830218A2C86a34F48a5D54e5F5e8D19217732

```bash
curl -s https://sourcify.dev/server/v2/contract/84532/0x617830218A2C86a34F48a5D54e5F5e8D19217732
# {"match":"match","creationMatch":"match","runtimeMatch":"match", ...}
```

Sourcify rather than Basescan because it needs no API key, and Basescan surfaces
Sourcify-verified sources anyway. Reproduce with:

```bash
forge verify-contract 0x617830218A2C86a34F48a5D54e5F5e8D19217732 \
  src/CooperativeTreasury.sol:CooperativeTreasury \
  --chain-id 84532 --verifier sourcify \
  --constructor-args $(cast abi-encode "constructor(address)" 0xA39D127B021196AA7Eec7427d4c9af19001A086b)
```

## Hosted dashboard

**https://warli-cooperative-treasury.vercel.app**

Public, no login. It reads the live Base Sepolia treasury above, so the roster, every
share, every unpaid balance and the 7-wei carried remainder load from the chain rather
than from fixtures. Connect a wallet on Base Sepolia and the "Your share" panel fills in;
connect the admin address and the membership controls appear.

The treasury address is compiled in as a default (`dashboard/lib/wagmi.ts`) rather than
read only from an environment variable — a treasury address is public by construction, and
a fresh clone or a hosted build should not render an empty page because a variable was
missed. `NEXT_PUBLIC_TREASURY_ADDRESS` still overrides it, for a local anvil or your own
deployment.
