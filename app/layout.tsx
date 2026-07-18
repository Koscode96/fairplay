import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "FairPlay, P2P fair-odds betting",
  description: "Bet anyone at TxODDS fair prices. Settled by verified data on Solana.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body>{children}</body></html>
  );
}
