import type {Metadata} from "next";
import "./globals.css";
import {Providers} from "./providers";

export const metadata: Metadata = {
  title: "Palghar Warli Cooperative — Treasury",
  description:
    "The math the aggregator never showed anyone: every member's share, every payment, every rupee accounted for.",
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f5efe4] text-[#2b211a] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
