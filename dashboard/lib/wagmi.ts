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

/** The deployed treasury. Set NEXT_PUBLIC_TREASURY_ADDRESS in .env.local. */
export const treasuryAddress = (process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? "") as `0x${string}`;

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
