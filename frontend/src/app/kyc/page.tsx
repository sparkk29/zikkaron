"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";

type User = {
  role: string;
  kycVerified: boolean;
  kycHash: string | null;
  fraudRiskLevel: string;
  agencyName?: string;
};

export default function KycPage() {
  const { address, connect } = useWallet();
  const [role, setRole] = useState("seller");
  const [displayName, setDisplayName] = useState("");
  const [kycPayload, setKycPayload] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [badgeRef, setBadgeRef] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [msg, setMsg] = useState("");

  async function refresh() {
    if (!address) return;
    try {
      const data = await api<{ user: User }>("/api/users/me", { wallet: address });
      setUser(data.user);
    } catch {
      setUser(null);
    }
  }

  useEffect(() => {
    refresh();
  }, [address]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!address) return connect();
    setMsg("");
    try {
      const data = await api<{ user: User; note: string }>("/api/users/register", {
        method: "POST",
        wallet: address,
        body: {
          role,
          displayName: displayName || undefined,
          kycPayload: kycPayload || undefined,
          agencyName: role === "authority_officer" ? agencyName : undefined,
          badgeRefPlaceholder: role === "authority_officer" ? badgeRef : undefined,
        },
      });
      setUser(data.user);
      setMsg(data.note);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section>
      <h1>KYC (simulated)</h1>
      <p className="muted">
        Hashes only — no raw SSN, ITIN, or driver license on-chain or in durable cleartext.
        Authority officers register with demo agency placeholders (not real credentials).
      </p>
      <form className="panel" onSubmit={onSubmit}>
        <label className="label">Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="seller">seller / owner</option>
          <option value="buyer">buyer</option>
          <option value="tenant">tenant</option>
          <option value="title_officer">title_officer</option>
          <option value="authority_officer">authority_officer</option>
          <option value="admin">admin</option>
        </select>
        <label className="label">Display name</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <label className="label">KYC payload (hashed client-side via server SHA-256)</label>
        <input
          value={kycPayload}
          onChange={(e) => setKycPayload(e.target.value)}
          placeholder="demo identity string — never a real SSN"
        />
        {role === "authority_officer" && (
          <>
            <label className="label">Agency name (placeholder)</label>
            <input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} />
            <label className="label">Badge ref placeholder</label>
            <input value={badgeRef} onChange={(e) => setBadgeRef(e.target.value)} />
          </>
        )}
        <button className="btn accent" type="submit">
          Register / update
        </button>
      </form>
      {msg && <div className="warn-box">{msg}</div>}
      {user && (
        <div className="panel">
          <p>
            <span className="tag">{user.role}</span>
            KYC {user.kycVerified ? "verified" : "unverified"} · risk {user.fraudRiskLevel}
          </p>
          <p className="muted">Hash: {user.kycHash || "—"}</p>
        </div>
      )}
    </section>
  );
}
