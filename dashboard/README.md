# Cooperative treasury dashboard

The part of this project a painter or a cooperative admin actually touches. Everything the
contract exposes, without a terminal:

- **The roster, in the open** — every current member, their share, and exactly what is
  waiting for them. This is the math the aggregator never showed anyone.
- **Your share** — a painter connects her wallet, sees what she is owed, and withdraws it
  herself. Nobody sends it to her.
- **Cooperative admin** — add a member, remove one, change a share. Shown only to an
  address that actually holds `COOP_ADMIN_ROLE`.
- **Pay the cooperative** — a buyer pays in, and sees the exact split *before* confirming.

## Running it

```bash
cp .env.example .env.local          # set NEXT_PUBLIC_TREASURY_ADDRESS
npm install
npm run dev
```

Against a local chain, from the repository root:

```bash
anvil &
export SEED_ADMIN_PK=0x…            # anvil account (0), from anvil's startup banner
forge script script/SeedLocal.s.sol:SeedLocal --rpc-url http://127.0.0.1:8545 --broadcast
# copy the printed NEXT_PUBLIC_TREASURY_ADDRESS into dashboard/.env.local
```

That seeds sixteen painters at 6.25% each and one buyer payment of `1 ether + 7 wei`, which
does not divide evenly — so the carried remainder is visible on the page rather than
theoretical.

`.env.local` is gitignored. No key, RPC credential, or authenticated URL is committed.

Next.js 16 (App Router) · wagmi v3 · viem · Tailwind.
