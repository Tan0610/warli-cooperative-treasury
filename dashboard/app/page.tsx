"use client";

import {useState} from "react";
import {formatEther, isAddress, parseEther, type Address} from "viem";
import {
  useAccount,
  useBalance,
  useConnect,
  useDisconnect,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {treasuryAbi} from "@/lib/abi";
import {treasuryAddress} from "@/lib/wagmi";

const BPS = 10_000;

const pct = (bps: bigint | number) => `${(Number(bps) / 100).toFixed(Number(bps) % 100 ? 2 : 0)}%`;
const eth = (wei: bigint) => `${Number(formatEther(wei)).toLocaleString(undefined, {maximumFractionDigits: 6})}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ---------------------------------------------------------------------------
// shared bits
// ---------------------------------------------------------------------------

function Panel({title, subtitle, children}: {title: string; subtitle?: string; children: React.ReactNode}) {
  return (
    <section className="rounded-lg border border-[#d9cbb4] bg-[#fffaf1] p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-[#a8452a]">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-[#6b5a4b]">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded border border-[#d9cbb4] bg-white px-3 py-2 text-sm outline-none focus:border-[#a8452a]"
    />
  );
}

function Button({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {children: React.ReactNode}) {
  return (
    <button
      {...props}
      className="rounded bg-[#a8452a] px-4 py-2 text-sm font-medium text-[#fffaf1] transition hover:bg-[#8d3721] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Surfaces a pending/failed transaction instead of leaving the user guessing. */
function TxStatus({hash, error}: {hash?: `0x${string}`; error?: Error | null}) {
  const {isLoading, isSuccess} = useWaitForTransactionReceipt({hash});
  if (error) return <p className="mt-2 text-sm text-[#a8452a]">{error.message.split("\n")[0]}</p>;
  if (isLoading) return <p className="mt-2 text-sm text-[#6b5a4b]">Waiting for confirmation…</p>;
  if (isSuccess) return <p className="mt-2 text-sm text-[#3f6b3f]">Done.</p>;
  return null;
}

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------

export default function Home() {
  const {address, isConnected} = useAccount();
  const {connect, connectors} = useConnect();
  const {disconnect} = useDisconnect();

  const configured = isAddress(treasuryAddress);

  const members = useReadContract({
    address: treasuryAddress,
    abi: treasuryAbi,
    functionName: "getMembers",
    query: {enabled: configured},
  });

  const held = useBalance({address: treasuryAddress, query: {enabled: configured}});

  const common = {address: treasuryAddress, abi: treasuryAbi, query: {enabled: configured}} as const;

  const totalReceived = useReadContract({...common, functionName: "totalReceived"});
  const reserve = useReadContract({...common, functionName: "reserveBalance"});
  const remainder = useReadContract({...common, functionName: "carriedRemainder"});
  const unallocated = useReadContract({...common, functionName: "unallocatedShareBps"});
  const owed = useReadContract({...common, functionName: "totalOwedToMembers"});

  const adminRole = useReadContract({
    address: treasuryAddress,
    abi: treasuryAbi,
    functionName: "COOP_ADMIN_ROLE",
    query: {enabled: configured},
  });
  const isAdmin = useReadContract({
    address: treasuryAddress,
    abi: treasuryAbi,
    functionName: "hasRole",
    args: adminRole.data && address ? [adminRole.data, address] : undefined,
    query: {enabled: configured && !!adminRole.data && !!address},
  });

  const myShare = members.data?.find((m) => m.account.toLowerCase() === address?.toLowerCase());

  if (!configured) {
    return (
      <main className="mx-auto max-w-3xl p-10">
        <h1 className="text-2xl font-semibold">Treasury address not set</h1>
        <p className="mt-3 text-[#6b5a4b]">
          Copy <code className="rounded bg-[#efe6d6] px-1">.env.example</code> to{" "}
          <code className="rounded bg-[#efe6d6] px-1">.env.local</code> and set{" "}
          <code className="rounded bg-[#efe6d6] px-1">NEXT_PUBLIC_TREASURY_ADDRESS</code> to a deployed
          CooperativeTreasury, then restart the dev server.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 md:p-10">
      {/* header ---------------------------------------------------------- */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#d9cbb4] pb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Palghar Warli Cooperative</h1>
          <p className="mt-1 max-w-xl text-[#6b5a4b]">
            The math the aggregator never showed anyone. Every member&apos;s share, every payment that came
            in, and every rupee still owed — readable by anyone, changeable only by the cooperative.
          </p>
          <p className="mt-2 font-mono text-xs text-[#8a7663]">{treasuryAddress}</p>
        </div>

        {isConnected ? (
          <div className="text-right">
            <p className="font-mono text-sm">{short(address!)}</p>
            <button onClick={() => disconnect()} className="text-xs text-[#a8452a] underline">
              disconnect
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            {connectors.map((c) => (
              <Button key={c.uid} onClick={() => connect({connector: c})}>
                Connect {c.name}
              </Button>
            ))}
          </div>
        )}
      </header>

      {/* summary --------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Received all-time", totalReceived.data !== undefined ? `${eth(totalReceived.data)} ETH` : "…"],
          ["Held right now", held.data ? `${eth(held.data.value)} ETH` : "…"],
          ["Owed to members", owed.data !== undefined ? `${eth(owed.data)} ETH` : "…"],
          ["Co-op reserve", reserve.data !== undefined ? `${eth(reserve.data)} ETH` : "…"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[#d9cbb4] bg-[#fffaf1] p-4">
            <p className="text-xs uppercase tracking-wider text-[#8a7663]">{label}</p>
            <p className="mt-1 text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {/* your share ------------------------------------------------------ */}
      {isConnected && <YourShare share={myShare} />}

      {/* roster ---------------------------------------------------------- */}
      <Panel
        title="Who is in the cooperative, and on what share"
        subtitle="Read live from the contract. A payment arriving now would divide exactly like this."
      >
        {members.isLoading && <p className="text-sm text-[#6b5a4b]">Loading the roster…</p>}
        {members.data?.length === 0 && (
          <p className="text-sm text-[#6b5a4b]">No members registered yet.</p>
        )}
        {!!members.data?.length && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e4d8c4] text-left text-xs uppercase tracking-wider text-[#8a7663]">
                <th className="pb-2">Member</th>
                <th className="pb-2">Share</th>
                <th className="pb-2 text-right">Waiting to be withdrawn</th>
              </tr>
            </thead>
            <tbody>
              {members.data.map((m) => (
                <tr
                  key={m.account}
                  className={`border-b border-[#efe6d6] ${
                    m.account.toLowerCase() === address?.toLowerCase() ? "bg-[#f7eddc]" : ""
                  }`}
                >
                  <td className="py-2 font-mono text-xs">{m.account}</td>
                  <td className="py-2">{pct(m.shareBps)}</td>
                  <td className="py-2 text-right">{eth(m.withdrawable)} ETH</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="mt-4 text-xs text-[#8a7663]">
          Shares total {unallocated.data !== undefined ? pct(BigInt(BPS) - unallocated.data) : "…"} allocated
          to members
          {unallocated.data ? `, ${pct(unallocated.data)} held by the cooperative` : ""}. Rounding left over
          from the last split: {remainder.data !== undefined ? `${remainder.data.toString()} wei` : "…"} —
          carried into the next payment, not lost.
        </p>
      </Panel>

      {/* admin ----------------------------------------------------------- */}
      {isAdmin.data && <AdminPanel />}

      {/* buyer ----------------------------------------------------------- */}
      <BuyerPanel />
    </main>
  );
}

// ---------------------------------------------------------------------------
// a painter checking, and taking, her own money
// ---------------------------------------------------------------------------

function YourShare({share}: {share?: {account: Address; shareBps: bigint; withdrawable: bigint}}) {
  const {writeContract, data: hash, error, isPending} = useWriteContract();

  if (!share) {
    return (
      <Panel title="Your share">
        <p className="text-sm text-[#6b5a4b]">
          This wallet is not on the roster. Only current members accrue a share of payments.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Your share" subtitle="Nobody sends this to you. You take it, whenever you want it.">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-3xl font-semibold">{eth(share.withdrawable)} ETH</p>
          <p className="mt-1 text-sm text-[#6b5a4b]">
            waiting for you · your share of future payments is {pct(share.shareBps)}
          </p>
        </div>
        <Button
          disabled={share.withdrawable === 0n || isPending}
          onClick={() =>
            writeContract({address: treasuryAddress, abi: treasuryAbi, functionName: "withdraw"})
          }
        >
          {isPending ? "Confirm in wallet…" : "Withdraw"}
        </Button>
      </div>
      <TxStatus hash={hash} error={error} />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// the cooperative admin, without needing a terminal
// ---------------------------------------------------------------------------

function AdminPanel() {
  const {writeContract, data: hash, error, isPending} = useWriteContract();
  const [addAddr, setAddAddr] = useState("");
  const [addPct, setAddPct] = useState("");
  const [removeAddr, setRemoveAddr] = useState("");
  const [updAddr, setUpdAddr] = useState("");
  const [updPct, setUpdPct] = useState("");

  const toBps = (percent: string) => BigInt(Math.round(Number(percent) * 100));

  return (
    <Panel
      title="Cooperative admin"
      subtitle="Adding or removing a member changes who the next payment reaches. Shares are entered as percentages."
    >
      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-2">
          <p className="text-sm font-medium">Add a member</p>
          <Field placeholder="0x… address" value={addAddr} onChange={(e) => setAddAddr(e.target.value)} />
          <Field
            placeholder="share, e.g. 6.25"
            value={addPct}
            onChange={(e) => setAddPct(e.target.value)}
            inputMode="decimal"
          />
          <Button
            disabled={!isAddress(addAddr) || !addPct || isPending}
            onClick={() =>
              writeContract({
                address: treasuryAddress,
                abi: treasuryAbi,
                functionName: "addMember",
                args: [addAddr as Address, toBps(addPct)],
              })
            }
          >
            Add
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Remove a member</p>
          <Field
            placeholder="0x… address"
            value={removeAddr}
            onChange={(e) => setRemoveAddr(e.target.value)}
          />
          <p className="text-xs text-[#8a7663]">
            They stop sharing in future payments. Anything already owed to them stays theirs.
          </p>
          <Button
            disabled={!isAddress(removeAddr) || isPending}
            onClick={() =>
              writeContract({
                address: treasuryAddress,
                abi: treasuryAbi,
                functionName: "removeMember",
                args: [removeAddr as Address],
              })
            }
          >
            Remove
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Change a share</p>
          <Field placeholder="0x… address" value={updAddr} onChange={(e) => setUpdAddr(e.target.value)} />
          <Field
            placeholder="new share, e.g. 8"
            value={updPct}
            onChange={(e) => setUpdPct(e.target.value)}
            inputMode="decimal"
          />
          <Button
            disabled={!isAddress(updAddr) || !updPct || isPending}
            onClick={() =>
              writeContract({
                address: treasuryAddress,
                abi: treasuryAbi,
                functionName: "setMemberShare",
                args: [updAddr as Address, toBps(updPct)],
              })
            }
          >
            Update
          </Button>
        </div>
      </div>
      <p className="mt-4 text-xs text-[#8a7663]">
        Shares are held at exactly 100% between the members and the cooperative&apos;s own portion. Raising
        one member above what is unallocated will be rejected — lower another first.
      </p>
      <TxStatus hash={hash} error={error} />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// a buyer paying the cooperative directly
// ---------------------------------------------------------------------------

function BuyerPanel() {
  const {writeContract, data: hash, error, isPending} = useWriteContract();
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  const preview = useReadContract({
    address: treasuryAddress,
    abi: treasuryAbi,
    functionName: "previewSplit",
    args: amount && Number(amount) > 0 ? [parseEther(amount)] : undefined,
    query: {enabled: !!amount && Number(amount) > 0},
  });

  return (
    <Panel
      title="Pay the cooperative"
      subtitle="The split happens in the same transaction, across whoever is on the roster at that moment."
    >
      <div className="flex flex-wrap gap-3">
        <div className="min-w-40 flex-1">
          <Field
            placeholder="amount in ETH"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="min-w-40 flex-1">
          <Field placeholder="order reference" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>
        <Button
          disabled={!amount || Number(amount) <= 0 || isPending}
          onClick={() =>
            writeContract({
              address: treasuryAddress,
              abi: treasuryAbi,
              functionName: "payIn",
              args: [memo || "order"],
              value: parseEther(amount),
            })
          }
        >
          Pay
        </Button>
      </div>

      {preview.data && (
        <div className="mt-4 rounded border border-[#e4d8c4] bg-[#f9f2e6] p-3 text-sm">
          <p className="mb-2 text-xs uppercase tracking-wider text-[#8a7663]">
            This is exactly how it would divide
          </p>
          {preview.data[0].map((acct, i) => (
            <div key={acct} className="flex justify-between font-mono text-xs">
              <span>{short(acct)}</span>
              <span>{eth(preview.data![1][i]!)} ETH</span>
            </div>
          ))}
          {preview.data[2] > 0n && (
            <div className="flex justify-between font-mono text-xs text-[#8a7663]">
              <span>co-op reserve</span>
              <span>{eth(preview.data[2])} ETH</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-[#e4d8c4] pt-1 font-mono text-xs text-[#8a7663]">
            <span>carried to next payment</span>
            <span>{preview.data[3].toString()} wei</span>
          </div>
        </div>
      )}

      <TxStatus hash={hash} error={error} />
    </Panel>
  );
}
