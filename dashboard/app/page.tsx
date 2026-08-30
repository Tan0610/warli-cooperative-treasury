"use client";

import {useState} from "react";
import {formatEther, formatUnits, isAddress, parseEther, type Address} from "viem";
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
import {WarliFrieze, WarliMark} from "./WarliFrieze";

const BPS = 10_000n;
const EXPLORER = "https://sepolia.basescan.org";

/**
 * Testnet amounts are tiny, and "0.000006 ETH" in a column of sixteen rows is unreadable.
 * Step down to gwei and then wei so the figure keeps its significant digits instead of
 * dissolving into zeros — the point of this page is that the math is legible.
 */
function amount(wei: bigint): {value: string; unit: string} {
  if (wei === 0n) return {value: "0", unit: "ETH"};
  const asEth = Number(formatEther(wei));
  if (asEth >= 0.0001) {
    return {value: asEth.toLocaleString(undefined, {maximumFractionDigits: 6}), unit: "ETH"};
  }
  const asGwei = Number(formatUnits(wei, 9));
  if (asGwei >= 1) {
    return {value: asGwei.toLocaleString(undefined, {maximumFractionDigits: 3}), unit: "gwei"};
  }
  return {value: wei.toString(), unit: "wei"};
}

const Amount = ({wei, className = ""}: {wei: bigint; className?: string}) => {
  const {value, unit} = amount(wei);
  return (
    <span className={`tnum ${className}`}>
      {value}
      <span className="ml-1 text-[0.72em] text-chalk-faint">{unit}</span>
    </span>
  );
};

const pct = (bps: bigint) => `${(Number(bps) / 100).toFixed(Number(bps) % 100 ? 2 : 0)}%`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

function Panel({
  title,
  subtitle,
  children,
  accent = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border ${
        accent ? "border-ochre/35 bg-wall-2/60" : "border-line bg-wall"
      } p-5 sm:p-6`}
    >
      <div className="flex items-start gap-2.5">
        <WarliMark className="mt-0.5 h-5 w-2.5 shrink-0 text-ochre/70" />
        <div className="min-w-0">
          <h2 className="font-[family-name:var(--font-display)] text-lg leading-tight text-ochre">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm leading-relaxed text-chalk-dim">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-line bg-ground/70 px-3 py-2.5 font-[family-name:var(--font-mono)] text-sm text-chalk placeholder:text-chalk-faint/70 outline-none transition focus:border-ochre/70 focus:ring-1 focus:ring-ochre/30"
    />
  );
}

function Button({
  children,
  variant = "solid",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {variant?: "solid" | "quiet"}) {
  const base =
    "rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-35";
  const styles =
    variant === "solid"
      ? "bg-terracotta text-chalk hover:bg-terracotta-hi"
      : "border border-line text-chalk-dim hover:border-ochre/50 hover:text-chalk";
  return <button {...props} className={`${base} ${styles}`}>{children}</button>;
}

function TxStatus({hash, error}: {hash?: `0x${string}`; error?: Error | null}) {
  const {isLoading, isSuccess} = useWaitForTransactionReceipt({hash});
  if (error) {
    return (
      <p className="mt-3 text-sm text-terracotta-hi">{error.message.split("\n")[0]}</p>
    );
  }
  if (isLoading) return <p className="mt-3 text-sm text-chalk-dim">Waiting for confirmation…</p>;
  if (isSuccess) {
    return (
      <p className="mt-3 text-sm text-leaf">
        Done.{" "}
        {hash && (
          <a
            className="underline underline-offset-2 hover:text-chalk"
            href={`${EXPLORER}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction
          </a>
        )}
      </p>
    );
  }
  return null;
}

function Stat({label, wei, hint}: {label: string; wei?: bigint; hint?: string}) {
  return (
    <div className="rounded-xl border border-line bg-wall p-4">
      <p className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-chalk-faint">
        {label}
      </p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-xl text-chalk">
        {wei === undefined ? <span className="text-chalk-faint">…</span> : <Amount wei={wei} />}
      </p>
      {hint && <p className="mt-1 text-xs text-chalk-faint">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------

export default function Home() {
  const {address, isConnected} = useAccount();
  const {connect, connectors} = useConnect();
  const {disconnect} = useDisconnect();

  const configured = isAddress(treasuryAddress);
  const common = {address: treasuryAddress, abi: treasuryAbi, query: {enabled: configured}} as const;

  const members = useReadContract({...common, functionName: "getMembers"});
  const held = useBalance({address: treasuryAddress, query: {enabled: configured}});
  const totalReceived = useReadContract({...common, functionName: "totalReceived"});
  const reserve = useReadContract({...common, functionName: "reserveBalance"});
  const remainder = useReadContract({...common, functionName: "carriedRemainder"});
  const unallocated = useReadContract({...common, functionName: "unallocatedShareBps"});
  const owed = useReadContract({...common, functionName: "totalOwedToMembers"});
  const solvent = useReadContract({...common, functionName: "isSolvent"});

  const adminRole = useReadContract({...common, functionName: "COOP_ADMIN_ROLE"});
  const isAdmin = useReadContract({
    address: treasuryAddress,
    abi: treasuryAbi,
    functionName: "hasRole",
    args: adminRole.data && address ? [adminRole.data, address] : undefined,
    query: {enabled: configured && !!adminRole.data && !!address},
  });

  const mine = members.data?.find((m) => m.account.toLowerCase() === address?.toLowerCase());

  if (!configured) {
    return (
      <main className="mx-auto max-w-2xl p-10">
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ochre">
          No treasury configured
        </h1>
        <p className="mt-3 text-chalk-dim">
          Set <code className="rounded bg-wall-2 px-1.5 py-0.5 text-chalk">NEXT_PUBLIC_TREASURY_ADDRESS</code>{" "}
          to a deployed CooperativeTreasury and restart.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-8 sm:px-8">
      {/* ---------------- header ---------------- */}
      <header>
        <WarliFrieze className="h-8 w-full max-w-md text-ochre/45" />

        <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-xl">
            <h1 className="font-[family-name:var(--font-display)] text-[2.1rem] leading-[1.1] text-chalk sm:text-[2.6rem]">
              Palghar Warli Cooperative
            </h1>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-chalk-dim">
              Sixteen painters, one treasury. Buyer money splits across whoever the members
              actually are today, by a share anyone can read — and each painter takes her own.
              This is the math the aggregator never showed anyone.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            {isConnected ? (
              <>
                <span className="rounded-lg border border-line bg-wall px-3 py-1.5 font-[family-name:var(--font-mono)] text-sm text-chalk">
                  {short(address!)}
                </span>
                <button
                  onClick={() => disconnect()}
                  className="text-xs text-chalk-faint underline underline-offset-2 hover:text-ochre"
                >
                  disconnect
                </button>
              </>
            ) : (
              connectors.map((c) => (
                <Button key={c.uid} onClick={() => connect({connector: c})}>
                  Connect {c.name}
                </Button>
              ))
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <a
            href={`${EXPLORER}/address/${treasuryAddress}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-line bg-wall px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-chalk-dim transition hover:border-ochre/50 hover:text-chalk"
          >
            {treasuryAddress}
          </a>
          <span className="text-chalk-faint">Base Sepolia</span>
          {solvent.data && (
            <span className="text-leaf">
              ● every wei accounted for
            </span>
          )}
        </div>

        <div className="rule-ochre mt-6" />
      </header>

      {/* ---------------- the numbers ---------------- */}
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Received all-time" wei={totalReceived.data} />
        <Stat label="Held right now" wei={held.data?.value} />
        <Stat label="Owed to members" wei={owed.data} hint="waiting to be pulled" />
        <Stat
          label="Carried remainder"
          wei={remainder.data}
          hint="dust, folded into the next split"
        />
      </div>

      <div className="mt-8 space-y-5">
        {isConnected && <YourShare share={mine} />}

        {/* ---------------- roster ---------------- */}
        <Panel
          title="Who is in the cooperative, and on what share"
          subtitle="Read live from the contract. A payment arriving now would divide exactly like this."
        >
          {members.isLoading && <p className="text-sm text-chalk-dim">Reading the roster…</p>}

          {members.data?.length === 0 && (
            <p className="text-sm text-chalk-dim">No members registered yet.</p>
          )}

          {!!members.data?.length && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[0.68rem] uppercase tracking-[0.13em] text-chalk-faint">
                    <th className="pb-2.5 font-medium">Member</th>
                    <th className="pb-2.5 font-medium">Share</th>
                    <th className="pb-2.5 text-right font-medium">Waiting to be withdrawn</th>
                  </tr>
                </thead>
                <tbody>
                  {members.data.map((m) => {
                    const isMe = m.account.toLowerCase() === address?.toLowerCase();
                    return (
                      <tr
                        key={m.account}
                        className={`border-b border-line/50 transition ${
                          isMe ? "bg-ochre/10" : "hover:bg-wall-2/60"
                        }`}
                      >
                        <td className="py-2.5">
                          <a
                            href={`${EXPLORER}/address/${m.account}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-[family-name:var(--font-mono)] text-[0.82rem] text-chalk-dim transition hover:text-ochre"
                          >
                            {short(m.account)}
                          </a>
                          {isMe && (
                            <span className="ml-2 rounded bg-ochre/20 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wider text-ochre">
                              you
                            </span>
                          )}
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="tnum w-12 text-chalk">{pct(m.shareBps)}</span>
                            <span className="h-1 w-20 overflow-hidden rounded-full bg-line">
                              <span
                                className="block h-full bg-ochre/70"
                                style={{width: `${Number(m.shareBps) / 100}%`}}
                              />
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 text-right text-chalk">
                          <Amount wei={m.withdrawable} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-5 border-t border-line/60 pt-4 text-xs leading-relaxed text-chalk-faint">
            {unallocated.data !== undefined && (
              <>
                <span className="text-chalk-dim">{pct(BPS - unallocated.data)}</span> allocated to
                members
                {unallocated.data > 0n && (
                  <>
                    , <span className="text-chalk-dim">{pct(unallocated.data)}</span> held by the
                    cooperative
                  </>
                )}
                {". "}
              </>
            )}
            Integer division never divides evenly across sixteen shares; the leftover{" "}
            {remainder.data !== undefined ? (
              <span className="text-chalk-dim">{remainder.data.toString()} wei</span>
            ) : (
              "…"
            )}{" "}
            is carried into the next payment rather than dropped, or quietly kept by whoever
            runs the contract.
          </p>
        </Panel>

        {isAdmin.data && <AdminPanel />}
        <BuyerPanel />
      </div>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-xs text-chalk-faint">
        <span>
          Road to Devcon II · Art, Culture &amp; Ethereum in India · Problem 3
        </span>
        <WarliFrieze className="h-6 w-40 text-ochre/25" />
      </footer>
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
        <p className="text-sm text-chalk-dim">
          This wallet is not on the roster, so it accrues nothing from payments. Only current
          members do — which is the point.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Your share"
      subtitle="Nobody sends this to you. You take it, whenever you want it."
      accent
    >
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="font-[family-name:var(--font-display)] text-4xl text-chalk">
            <Amount wei={share.withdrawable} />
          </p>
          <p className="mt-1.5 text-sm text-chalk-dim">
            waiting for you · {pct(share.shareBps)} of every future payment
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
  const call = (functionName: "addMember" | "removeMember" | "setMemberShare", args: readonly unknown[]) =>
    writeContract({address: treasuryAddress, abi: treasuryAbi, functionName, args} as never);

  return (
    <Panel
      title="Cooperative admin"
      subtitle="Adding or removing a member changes who the next payment reaches. Shares are entered as percentages."
    >
      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-2.5">
          <p className="text-sm font-medium text-chalk">Add a member</p>
          <Field placeholder="0x… address" value={addAddr} onChange={(e) => setAddAddr(e.target.value)} />
          <Field
            placeholder="share, e.g. 6.25"
            value={addPct}
            onChange={(e) => setAddPct(e.target.value)}
            inputMode="decimal"
          />
          <Button
            disabled={!isAddress(addAddr) || !addPct || isPending}
            onClick={() => call("addMember", [addAddr as Address, toBps(addPct)])}
          >
            Add
          </Button>
        </div>

        <div className="space-y-2.5">
          <p className="text-sm font-medium text-chalk">Remove a member</p>
          <Field
            placeholder="0x… address"
            value={removeAddr}
            onChange={(e) => setRemoveAddr(e.target.value)}
          />
          <p className="text-xs leading-relaxed text-chalk-faint">
            They stop sharing in future payments. Anything already owed stays theirs.
          </p>
          <Button
            disabled={!isAddress(removeAddr) || isPending}
            onClick={() => call("removeMember", [removeAddr as Address])}
          >
            Remove
          </Button>
        </div>

        <div className="space-y-2.5">
          <p className="text-sm font-medium text-chalk">Change a share</p>
          <Field placeholder="0x… address" value={updAddr} onChange={(e) => setUpdAddr(e.target.value)} />
          <Field
            placeholder="new share, e.g. 8"
            value={updPct}
            onChange={(e) => setUpdPct(e.target.value)}
            inputMode="decimal"
          />
          <Button
            disabled={!isAddress(updAddr) || !updPct || isPending}
            onClick={() => call("setMemberShare", [updAddr as Address, toBps(updPct)])}
          >
            Update
          </Button>
        </div>
      </div>

      <p className="mt-5 border-t border-line/60 pt-4 text-xs leading-relaxed text-chalk-faint">
        Shares are held at exactly 100% between the members and the cooperative&apos;s own
        portion, so raising one member above what is unallocated will be rejected — lower
        another first.
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
  const [value, setValue] = useState("");
  const [memo, setMemo] = useState("");

  const valid = !!value && Number(value) > 0;
  const preview = useReadContract({
    address: treasuryAddress,
    abi: treasuryAbi,
    functionName: "previewSplit",
    args: valid ? [parseEther(value)] : undefined,
    query: {enabled: valid},
  });

  return (
    <Panel
      title="Pay the cooperative"
      subtitle="The split happens in the same transaction, across whoever is on the roster at that moment."
    >
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[10rem] flex-1">
          <Field
            placeholder="amount in ETH"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="min-w-[10rem] flex-1">
          <Field placeholder="order reference" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>
        <Button
          disabled={!valid || isPending}
          onClick={() =>
            writeContract({
              address: treasuryAddress,
              abi: treasuryAbi,
              functionName: "payIn",
              args: [memo || "order"],
              value: parseEther(value),
            })
          }
        >
          {isPending ? "Confirm…" : "Pay"}
        </Button>
      </div>

      {preview.data && (
        <div className="mt-5 rounded-lg border border-line bg-ground/60 p-4">
          <p className="mb-3 text-[0.68rem] uppercase tracking-[0.13em] text-chalk-faint">
            This is exactly how it would divide
          </p>
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {preview.data[0].map((acct, i) => (
              <div
                key={acct}
                className="flex justify-between font-[family-name:var(--font-mono)] text-xs"
              >
                <span className="text-chalk-dim">{short(acct)}</span>
                <span className="text-chalk">
                  <Amount wei={preview.data![1][i]!} />
                </span>
              </div>
            ))}
          </div>
          {preview.data[2] > 0n && (
            <div className="mt-2 flex justify-between border-t border-line/60 pt-2 font-[family-name:var(--font-mono)] text-xs text-chalk-faint">
              <span>co-op reserve</span>
              <span>
                <Amount wei={preview.data[2]} />
              </span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-line/60 pt-2 font-[family-name:var(--font-mono)] text-xs text-chalk-faint">
            <span>carried to the next payment</span>
            <span className="tnum">{preview.data[3].toString()} wei</span>
          </div>
        </div>
      )}

      <TxStatus hash={hash} error={error} />
    </Panel>
  );
}
