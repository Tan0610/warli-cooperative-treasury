import type {Metadata} from "next";
import {Fraunces, Inter, JetBrains_Mono} from "next/font/google";
import "./globals.css";
import {Providers} from "./providers";

/** Display face: a little warmth and weight, so the title reads as painted, not shipped. */
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "WONK"],
  display: "swap",
});

const sans = Inter({subsets: ["latin"], variable: "--font-sans", display: "swap"});

/** Addresses and amounts need to line up in columns. */
const mono = JetBrains_Mono({subsets: ["latin"], variable: "--font-mono", display: "swap"});

export const metadata: Metadata = {
  title: "Palghar Warli Cooperative — Treasury",
  description:
    "The math the aggregator never showed anyone: every member's share, every payment, every rupee accounted for. Live on Base Sepolia.",
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-ground font-[family-name:var(--font-sans)] text-chalk">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
