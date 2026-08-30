import {createConfig, http} from "wagmi";
import {baseSepolia, foundry} from "wagmi/chains";
import {injected} from "wagmi/connectors";

/**
 * Base Sepolia for the real deployment, plus a local foundry chain so the whole
 * dashboard can be driven against `anvil` without touching a testnet.
 */
export const config = createConfig({
  chains: [baseSepolia, foundry],
  connectors: [injected()],
  transports: {
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL),
    [foundry.id]: http("http://127.0.0.1:8545"),
  },
  ssr: true,
});

/**
 * The live Base Sepolia deployment, seeded with the sixteen Palghar painters.
 *
 * This is a default, not a secret — a treasury address is public by construction, and this
 * one is already in DEPLOYMENTS.md and the README. Baking it in means a fresh clone and a
 * hosted build both just work, instead of rendering an empty page because an environment
 * variable was missed.
 *
 * Override it with NEXT_PUBLIC_TREASURY_ADDRESS to point the dashboard at your own
 * deployment, local anvil included.
 */
const DEFAULT_TREASURY = "0x617830218A2C86a34F48a5D54e5F5e8D19217732";

export const treasuryAddress = (process.env.NEXT_PUBLIC_TREASURY_ADDRESS ||
  DEFAULT_TREASURY) as `0x${string}`;

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
