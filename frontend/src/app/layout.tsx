import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";
import { Banner, Footer, Nav } from "@/components/Shell";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-loaded",
  weight: ["500", "600", "700"],
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body-loaded",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Zikkaron — Civic Memorial Layer",
  description:
    "A memorial layer that works with authorities — not instead of them. Assisting owners and government agencies against squatters and property fraud.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body style={{ fontFamily: "var(--font-body-loaded), var(--font-body)" }}>
        <WalletProvider>
          <Banner />
          <main>
            <Nav />
            {children}
            <Footer />
          </main>
        </WalletProvider>
      </body>
    </html>
  );
}
