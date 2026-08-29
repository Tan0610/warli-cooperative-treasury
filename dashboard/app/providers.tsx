"use client";

import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {useState, type ReactNode} from "react";
import {WagmiProvider} from "wagmi";
import {config} from "@/lib/wagmi";

export function Providers({children}: {children: ReactNode}) {
  // One client per browser session; created lazily so it is not shared across
  // server renders.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The roster and the balances are the whole point of this page, so keep
            // them close to live rather than serving a stale cache.
            refetchInterval: 5_000,
            staleTime: 2_000,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
