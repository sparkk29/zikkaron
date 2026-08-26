"use client";

import Link from "next/link";
import { useWallet } from "@/lib/wallet";

export function Banner() {
  return (
    <div className="banner" role="note">
      <strong>Zikkaron</strong> works <strong>with</strong> government and authorities to help
      deter squatters and fraudsters through memorial records. It is <strong>not</strong> an
      official government system, does not transfer title, and does not evict anyone. County
      recording, police, and the courts remain authoritative. Eviction requires lawful process
      under state law.
    </div>
  );
}

export function Nav() {
  const { address, connect, disconnect, connecting, authenticated } = useWallet();
  return (
    <nav className="nav">
      <Link href="/" className="brand">
        Zikkaron
        <span>Memorial records assisting owners and government authorities</span>
      </Link>
      <div className="nav-links">
        <Link href="/properties">Properties</Link>
        <Link href="/buy-sell">Buy / Sell</Link>
        <Link href="/rentals">Rentals</Link>
        <Link href="/occupancy">Occupancy</Link>
        <Link href="/kyc">KYC</Link>
        <Link href="/authority">Authority</Link>
        <Link href="/admin">Admin</Link>
        <Link href="/legal">Legal</Link>
        {address ? (
          <button className="btn secondary" type="button" onClick={() => disconnect()}>
            {authenticated ? "SIWE · " : ""}
            {address.slice(0, 6)}…{address.slice(-4)}
          </button>
        ) : (
          <button className="btn" type="button" onClick={connect} disabled={connecting}>
            {connecting ? "Signing in…" : "Connect + SIWE"}
          </button>
        )}
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <p>
        <em>Zikkaron</em> (Hebrew: memorial) — civic evidence layer assisting owners and
        authorities. Not title. Not force. Not a government website.
      </p>
      <p className="muted">
        Designed for collaboration with government and law enforcement. Not an official
        government system. Polygon Amoy testnet only for on-chain memorials — TESTNET FUNDS, NOT
        A CLOSING.
      </p>
    </footer>
  );
}
