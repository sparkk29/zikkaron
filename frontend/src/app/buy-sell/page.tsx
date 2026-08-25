"use client";

import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";

export default function BuySellPage() {
  const { address, connect } = useWallet();
  const [propertyId, setPropertyId] = useState("");
  const [buyerWallet, setBuyerWallet] = useState("");
  const [amount, setAmount] = useState("1");
  const [msg, setMsg] = useState("");

  async function openDeal(e: FormEvent) {
    e.preventDefault();
    if (!address) return connect();
    try {
      const res = await api<any>("/api/deals", {
        method: "POST",
        wallet: address,
        body: {
          propertyId,
          buyerWallet,
          amountTestPol: Number(amount),
          disclaimerAccepted: true,
          fraudWarningAcknowledged: true,
        },
      });
      setMsg(
        [
          `Deal ${res.deal.id} opened.`,
          ...(res.warnings || []),
          ...(res.reminders || []),
        ].join("\n")
      );
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section>
      <h1>Buy / Sell (testnet memorial escrow)</h1>
      <div className="warn-box">
        TESTNET FUNDS, NOT A CLOSING. Zikkaron escrow is not licensed escrow or title. Wire-fraud
        reminder: never send USD wires based solely on in-app messages — verify closing instructions
        out-of-band.
      </div>
      <form className="panel" onSubmit={openDeal}>
        <label className="label">Property ID</label>
        <input value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required />
        <label className="label">Buyer wallet</label>
        <input value={buyerWallet} onChange={(e) => setBuyerWallet(e.target.value)} required />
        <label className="label">Amount (test POL)</label>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <label style={{ display: "flex", gap: "0.5rem", marginBottom: "0.85rem" }}>
          <input type="checkbox" required defaultChecked />
          <span className="muted">disclaimerAccepted + fraud warning acknowledged</span>
        </label>
        <button className="btn accent" type="submit">
          Open deal
        </button>
      </form>
      {msg && <pre className="panel" style={{ whiteSpace: "pre-wrap" }}>{msg}</pre>}
    </section>
  );
}
