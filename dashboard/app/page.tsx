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
import {
  WarliBorder,
  WarliCarrier,
  WarliCattle,
  WarliChaukCorner,
  WarliHut,
  WarliTarpaCircle,
  WarliTree,
  WarliVillage,
} from "./warli";

const BPS = 10_000n;
const EXPLORER = "https://sepolia.basescan.org";

/**
 * Testnet amounts are tiny, and a column of "0.000006 ETH" carries no information.
 * Step down ETH -> gwei -> wei so each figure keeps its significant digits; the whole
 * point of this page is that the arithmetic is legible.
 */
function split(wei: bigint): [string, string] {
  if (wei === 0n) return ["0", "ETH"];
  const asEth = Number(formatEther(wei));
  if (asEth >= 0.0001) return [asEth.toLocaleString(undefined, {maximumFractionDigits: 6}), "ETH"];
  const asGwei = Number(formatUnits(wei, 9));
  if (asGwei >= 1) return [asGwei.toLocaleString(undefined, {maximumFractionDigits: 3}), "gwei"];
  return [wei.toString(), "wei"];
}

function Amount({wei, className = ""}: {wei?: bigint; className?: string}) {
  if (wei === undefined) return <span className="text-chalk-faint">…</span>;
  const [v, u] = split(wei);
  return (
    <span className={`tnum ${className}`}>
      {v}
      <span className="ml-1 text-[0.62em] tracking-wide text-chalk-faint">{u}</span>
    </span>
  );
}

const pct = (bps: bigint) => `${(Number(bps) / 100).toFixed(Number(bps) % 100 ? 2 : 0)}%`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ---------------------------------------------------------------------------
// small pieces — deliberately not "cards"
// ---------------------------------------------------------------------------

/**
 * A section marker. Each section carries its own motif from the village rather than a
 * repeated icon — a tree over the ledger, a hut over the roster controls, cattle over the
 * money coming in. On a Warli wall no two parts of the scene are the same drawing.
 */
function Heading({
  children,
  note,
  motif,
}: {
  children: React.ReactNode;
  note?: string;
  motif?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start gap-4">
      {motif && <div className="mt-0.5 shrink-0 text-ochre/55">{motif}</div>}
      <div className="min-w-0">
        <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-ochre">
          {children}
        </h2>
        {note && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-chalk-dim">{note}</p>}
      </div>
    </div>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full border-b border-line bg-transparent px-0 py-2 font-[family-name:var(--font-mono)] text-sm text-chalk placeholder:text-chalk-faint/60 outline-none transition focus:border-ochre"
    />
  );
}

function Button({
  children,
  variant = "solid",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {variant?: "solid" | "quiet"}) {
  const styles =
    variant === "solid"
      ? "bg-terracotta text-chalk hover:bg-terracotta-hi"
      : "border border-line text-chalk-dim hover:border-ochre hover:text-chalk";
  return (
    <button
      {...props}
      className={`px-5 py-2.5 text-[0.82rem] font-medium tracking-wide uppercase transition disabled:cursor-not-allowed disabled:opacity-30 ${styles}`}
    >
      {children}
    </button>
  );
}

function TxStatus({hash, error}: {hash?: `0x${string}`; error?: Error | null}) {
  const {isLoading, isSuccess} = useWaitForTransactionReceipt({hash});
  if (error) return <p className="mt-3 text-sm text-terracotta-hi">{error.message.split("\n")[0]}</p>;
  if (isLoading) return <p className="mt-3 text-sm text-chalk-dim">Waiting for confirmation…</p>;
  if (isSuccess) {
    return (
      <p className="mt-3 text-sm text-leaf">
        Done.{" "}
        {hash && (
          <a
            className="underline underline-offset-4 hover:text-chalk"
            href={`${EXPLORER}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            view transaction
          </a>
        )}
      </p>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------

export default function Home() {
  const {address, isConnected} = useAccount();
  const {connect, connectors} = useConnect();
  const {disconnect} = useDisconnect();

  // EIP-6963 discovery can surface the same wallet more than once, and wagmi's generic
  // "Injected" entry duplicates a named one. Showing two identical buttons is worse than
  // showing one, so keep the first connector per name and drop the unnamed fallback when
  // a real wallet was discovered.
  const wallets = connectors.filter((c, i, all) => {
    if (all.findIndex((o) => o.name === c.name) !== i) return false;
    return !(c.id === "injected" && all.some((o) => o.id !== "injected"));
  });

  const configured = isAddress(treasuryAddress);
  const common = {address: treasuryAddress, abi: treasuryAbi, query: {enabled: configured}} as const;

  const members = useReadContract({...common, functionName: "getMembers"});
  const held = useBalance({address: treasuryAddress, query: {enabled: configured}});
  const totalReceived = useReadContract({...common, functionName: "totalReceived"});
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
      <main className="mx-auto max-w-2xl p-12">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-ochre">
          No treasury configured
        </h1>
        <p className="mt-4 text-chalk-dim">
          Set <code className="bg-wall-2 px-1.5 py-0.5 text-chalk">NEXT_PUBLIC_TREASURY_ADDRESS</code>{" "}
          and restart.
        </p>
      </main>
    );
  }

  return (
    <div className="grain">
      <main className="mx-auto max-w-[62rem] px-6 pb-24 pt-10 sm:px-10">
        {/* ============ the wall ============ */}
        <header>
          <div className="flex items-start justify-between gap-8">
            <div className="max-w-2xl">
              <p className="text-[0.66rem] uppercase tracking-[0.3em] text-chalk-faint">
                Village outside Palghar · Maharashtra
              </p>
              <h1 className="mt-4 font-[family-name:var(--font-display)] text-[2.6rem] leading-[0.98] tracking-tight text-chalk sm:text-[3.8rem]">
                Palghar Warli
                <br />
                <span className="text-ochre">Cooperative</span>
              </h1>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2 pt-2">
              {isConnected ? (
                <>
                  <p className="font-[family-name:var(--font-mono)] text-sm text-chalk">
                    {short(address!)}
                  </p>
                  <button
                    onClick={() => disconnect()}
                    className="text-xs text-chalk-faint underline underline-offset-4 hover:text-ochre"
                  >
                    disconnect
                  </button>
                </>
              ) : (
                wallets.map((c) => (
                  <Button key={c.uid} onClick={() => connect({connector: c})}>
                    {c.name}
                  </Button>
                ))
              )}
            </div>
          </div>

          <p className="mt-7 max-w-2xl text-[1.02rem] leading-[1.75] text-chalk-dim">
            Sixteen painters sold through an aggregator who collected in a lump sum, paid
            weeks later in cash, minus a cut nobody agreed to.{" "}
            <span className="text-chalk">Nobody ever saw the math.</span> This is the math.
          </p>

          <WarliVillage className="mt-10 h-24 w-full max-w-3xl text-ochre/45" />
        </header>

        <WarliBorder className="mt-8 h-3 w-full text-ochre/30" />

        {/* ============ the standing figures ============ */}
        <section className="mt-9 grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-4">
          {[
            ["Received", totalReceived.data, "all-time"],
            ["Held now", held.data?.value, "in the contract"],
            ["Owed out", owed.data, "not yet pulled"],
            ["Carried", remainder.data, "dust, kept for the next split"],
          ].map(([label, wei, hint]) => (
            <div key={label as string}>
              <p className="text-[0.63rem] uppercase tracking-[0.18em] text-chalk-faint">
                {label as string}
              </p>
              <p className="mt-2.5 font-[family-name:var(--font-display)] text-[1.45rem] leading-none text-chalk">
                <Amount wei={wei as bigint | undefined} />
              </p>
              <p className="mt-2 text-[0.7rem] leading-snug text-chalk-faint">{hint as string}</p>
            </div>
          ))}
        </section>

        {/* ============ your money ============ */}
        {isConnected && (
          <>
            <WarliBorder className="mt-10 h-3 w-full text-ochre/30" />
            <YourShare share={mine} />
          </>
        )}

        {/* ============ the ledger ============ */}
        <WarliBorder className="mt-10 h-3 w-full text-ochre/30" />
        <section className="mt-9">
          <Heading
            motif={<WarliTree className="h-12 w-8" />}
            note="Read live from the contract. A payment arriving this second would divide exactly like this — the shares are not a snapshot, and not a promise."
          >
            The ledger
          </Heading>

          {members.isLoading && <p className="text-sm text-chalk-dim">Reading the roster…</p>}
          {members.data?.length === 0 && (
            <p className="text-sm text-chalk-dim">No members registered yet.</p>
          )}

          {!!members.data?.length && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem]">
                <thead>
                  <tr className="text-left text-[0.6rem] uppercase tracking-[0.18em] text-chalk-faint">
                    <th className="pb-3 font-medium">Painter</th>
                    <th className="pb-3 font-medium">Share of what comes in</th>
                    <th className="pb-3 text-right font-medium">Waiting for her</th>
                  </tr>
                </thead>
                <tbody>
                  {members.data.map((m, i) => {
                    const isMe = m.account.toLowerCase() === address?.toLowerCase();
                    return (
                      <tr key={m.account} className="ledger-row">
                        <td className="py-3">
                          <span className="mr-3 inline-block w-5 text-right font-[family-name:var(--font-mono)] text-[0.7rem] text-chalk-faint">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <a
                            href={`${EXPLORER}/address/${m.account}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-[family-name:var(--font-mono)] text-[0.82rem] text-chalk-dim transition hover:text-ochre"
                          >
                            {short(m.account)}
                          </a>
                          {isMe && (
                            <span className="ml-2.5 text-[0.6rem] uppercase tracking-[0.15em] text-ochre">
                              you
                            </span>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <span className="tnum w-12 text-[0.85rem] text-chalk">
                              {pct(m.shareBps)}
                            </span>
                            <span className="hidden h-px w-24 bg-line sm:block">
                              <span
                                className="block h-px bg-ochre/80"
                                style={{width: `${Number(m.shareBps) / 100}%`}}
                              />
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-right text-[0.9rem] text-chalk">
                          <Amount wei={m.withdrawable} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-6 max-w-3xl text-[0.78rem] leading-relaxed text-chalk-faint">
            {unallocated.data !== undefined && (
              <>
                <span className="text-chalk-dim">{pct(BPS - unallocated.data)}</span> allocated to
                painters
                {unallocated.data > 0n && (
                  <>
                    , <span className="text-chalk-dim">{pct(unallocated.data)}</span> held by the
                    cooperative
                  </>
                )}
                {". "}
              </>
            )}
            Sixteen shares never divide evenly. The leftover{" "}
            <span className="text-chalk-dim">
              {remainder.data !== undefined ? `${remainder.data} wei` : "…"}
            </span>{" "}
            is carried into the next payment — not dropped, and not quietly kept by whoever
            runs the contract.
            {solvent.data && (
              <span className="text-leaf"> Every wei the treasury holds is owed to someone.</span>
            )}
          </p>
        </section>

        {/* ============ things you can do ============ */}
        <WarliBorder className="mt-10 h-3 w-full text-ochre/30" />
        <div className="mt-9 grid gap-12 lg:grid-cols-2">
          <BuyerPanel />
          {isAdmin.data ? (
            <AdminPanel />
          ) : (
            <section>
              <Heading
                motif={<WarliHut className="h-9 w-10" />}
                note="Adding or removing a painter changes who the next payment reaches. The controls appear here for an address holding COOP_ADMIN_ROLE."
              >
                Cooperative admin
              </Heading>
              <p className="text-sm text-chalk-faint">
                {isConnected
                  ? "This wallet does not hold the admin role."
                  : "Connect the admin wallet to manage the roster."}
              </p>
            </section>
          )}
        </div>

        {/* ============ footer ============ */}
        <WarliBorder className="mt-14 h-3 w-full text-ochre/30" />
        <footer className="mt-7 flex flex-wrap items-end justify-between gap-6">
          <div className="text-[0.7rem] leading-relaxed text-chalk-faint">
            <a
              href={`${EXPLORER}/address/${treasuryAddress}`}
              target="_blank"
              rel="noreferrer"
              className="font-[family-name:var(--font-mono)] text-chalk-dim underline underline-offset-4 transition hover:text-ochre"
            >
              {treasuryAddress}
            </a>
            <br />
            Base Sepolia · Road to Devcon II · Art, Culture &amp; Ethereum in India
          </div>
          <WarliTarpaCircle className="h-24 w-24 text-ochre/35" />
        </footer>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// a painter checking, and taking, her own money
// ---------------------------------------------------------------------------

function YourShare({share}: {share?: {account: Address; shareBps: bigint; withdrawable: bigint}}) {
  const {writeContract, data: hash, error, isPending} = useWriteContract();

  if (!share) {
    return (
      <section className="mt-9">
        <Heading motif={<WarliCarrier className="h-11 w-6" />}>Your share</Heading>
        <p className="max-w-xl text-sm leading-relaxed text-chalk-dim">
          This wallet is not on the roster, so it accrues nothing from payments. Only current
          members do — which is exactly the point.
        </p>
      </section>
    );
  }

  return (
    <section className="relative mt-9">
      {/*
        The chauk is the square Warli paint on a wall for a wedding — the drawing reserved
        for the occasion that matters. Getting paid is that occasion here, so it frames
        this and nothing else on the page.
      */}
      <WarliChaukCorner className="pointer-events-none absolute -left-3 -top-3 h-12 w-12 text-ochre/25" />
      <WarliChaukCorner className="pointer-events-none absolute -bottom-3 -right-3 h-12 w-12 rotate-180 text-ochre/25" />

      <Heading motif={<WarliCarrier className="h-11 w-6" />}>Your share</Heading>
      <div className="flex flex-wrap items-end justify-between gap-8">
        <div>
          <p className="font-[family-name:var(--font-display)] text-[3.2rem] leading-[0.9] text-chalk sm:text-[4rem]">
            <Amount wei={share.withdrawable} />
          </p>
          <p className="mt-4 text-sm text-chalk-dim">
            waiting for you · {pct(share.shareBps)} of every payment that arrives
          </p>
          <p className="mt-1 text-[0.78rem] text-chalk-faint">
            Nobody sends this to you. You take it, whenever you want it.
          </p>
        </div>
        <Button
          disabled={share.withdrawable === 0n || isPending}
          onClick={() =>
            writeContract({address: treasuryAddress, abi: treasuryAbi, functionName: "withdraw"})
          }
        >
          {isPending ? "Confirm in wallet" : "Withdraw"}
        </Button>
      </div>
      <TxStatus hash={hash} error={error} />
    </section>
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

  const toBps = (p: string) => BigInt(Math.round(Number(p) * 100));
  const call = (fn: "addMember" | "removeMember" | "setMemberShare", args: readonly unknown[]) =>
    writeContract({address: treasuryAddress, abi: treasuryAbi, functionName: fn, args} as never);

  return (
    <section>
      <Heading
        motif={<WarliHut className="h-9 w-10" />}
        note="Adding or removing a painter changes who the next payment reaches. Shares are entered as percentages."
      >
        Cooperative admin
      </Heading>

      <div className="space-y-7">
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_auto] sm:items-end">
          <Field placeholder="0x… address to add" value={addAddr} onChange={(e) => setAddAddr(e.target.value)} />
          <Field placeholder="share %" value={addPct} onChange={(e) => setAddPct(e.target.value)} inputMode="decimal" />
          <Button
            variant="quiet"
            disabled={!isAddress(addAddr) || !addPct || isPending}
            onClick={() => call("addMember", [addAddr as Address, toBps(addPct)])}
          >
            Add
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_auto] sm:items-end">
          <Field placeholder="0x… address to update" value={updAddr} onChange={(e) => setUpdAddr(e.target.value)} />
          <Field placeholder="new share %" value={updPct} onChange={(e) => setUpdPct(e.target.value)} inputMode="decimal" />
          <Button
            variant="quiet"
            disabled={!isAddress(updAddr) || !updPct || isPending}
            onClick={() => call("setMemberShare", [updAddr as Address, toBps(updPct)])}
          >
            Update
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_auto] sm:items-end">
          <Field placeholder="0x… address to remove" value={removeAddr} onChange={(e) => setRemoveAddr(e.target.value)} />
          <span className="hidden sm:block" />
          <Button
            variant="quiet"
            disabled={!isAddress(removeAddr) || isPending}
            onClick={() => call("removeMember", [removeAddr as Address])}
          >
            Remove
          </Button>
        </div>
      </div>

      <p className="mt-6 text-[0.75rem] leading-relaxed text-chalk-faint">
        A removed painter stops sharing in future payments but keeps anything already owed.
        Shares sit at exactly 100% between the painters and the cooperative&apos;s own portion,
        so raising one above what is unallocated is rejected — lower another first.
      </p>
      <TxStatus hash={hash} error={error} />
    </section>
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
    <section>
      <Heading
        motif={<WarliCattle className="h-8 w-12" />}
        note="The split happens in the same transaction, across whoever is on the roster at that moment. You see the arithmetic before you sign it."
      >
        Pay the cooperative
      </Heading>

      <div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
        <Field placeholder="ETH" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" />
        <Field placeholder="order reference" value={memo} onChange={(e) => setMemo(e.target.value)} />
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
          {isPending ? "Confirm" : "Pay"}
        </Button>
      </div>

      {preview.data && (
        <div className="mt-6">
          <p className="mb-3 text-[0.6rem] uppercase tracking-[0.18em] text-chalk-faint">
            Exactly how it would divide
          </p>
          <div className="max-h-52 overflow-y-auto pr-2">
            {preview.data[0].map((acct, i) => (
              <div
                key={acct}
                className="flex justify-between border-b border-line/40 py-1.5 font-[family-name:var(--font-mono)] text-[0.72rem]"
              >
                <span className="text-chalk-faint">{short(acct)}</span>
                <span className="text-chalk-dim">
                  <Amount wei={preview.data![1][i]!} />
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between font-[family-name:var(--font-mono)] text-[0.72rem] text-chalk-faint">
            <span>carried to the next payment</span>
            <span className="tnum">{preview.data[3].toString()} wei</span>
          </div>
        </div>
      )}

      <TxStatus hash={hash} error={error} />
    </section>
  );
}
