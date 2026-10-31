"use client";

import { FormEvent, useState } from "react";
import { isAddress } from "ethers";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";

export default function BuySellPage() {
  const { address, connect } = useWallet();
  const [propertyId, setPropertyId] = useState("");
  const [buyerWallet, setBuyerWallet] = useState("");
  const [amount, setAmount] = useState("1");
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [fraudWarningAcknowledged, setFraudWarningAcknowledged] = useState(false);
  const [msg, setMsg] = useState("");

  async function openDeal(e: FormEvent) {
    e.preventDefault();
    if (!address) return connect();
    if (!isAddress(buyerWallet)) {
      setMsg("Buyer wallet must be a valid 0x address.");
      return;
    }
    const amountTestPol = Number(amount);
    if (!Number.isFinite(amountTestPol) || amountTestPol <= 0) {
      setMsg("Amount must be a positive number of test POL.");
      return;
    }
    if (!disclaimerAccepted || !fraudWarningAcknowledged) {
      setMsg("Accept the disclaimer and acknowledge the fraud warning before opening a deal.");
      return;
    }
    try {
      const res = await api<any>("/api/deals", {
        method: "POST",
        wallet: address,
        body: {
          propertyId,
          buyerWallet,
          amountTestPol,
          disclaimerAccepted,
          fraudWarningAcknowledged,
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
        <input
          value={buyerWallet}
          onChange={(e) => setBuyerWallet(e.target.value.trim())}
          pattern="^0x[a-fA-F0-9]{40}$"
          placeholder="0x..."
          required
        />
        <label className="label">Amount (test POL)</label>
        <input
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <label style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <input
            type="checkbox"
            required
            checked={disclaimerAccepted}
            onChange={(e) => setDisclaimerAccepted(e.target.checked)}
          />
          <span className="muted">
            disclaimerAccepted — testnet memorial escrow only; not a closing, title, or licensed escrow
          </span>
        </label>
        <label style={{ display: "flex", gap: "0.5rem", marginBottom: "0.85rem" }}>
          <input
            type="checkbox"
            required
            checked={fraudWarningAcknowledged}
            onChange={(e) => setFraudWarningAcknowledged(e.target.checked)}
          />
          <span className="muted">
            fraudWarningAcknowledged — I will verify payment instructions out-of-band
          </span>
        </label>
        <button
          className="btn accent"
          type="submit"
          disabled={!disclaimerAccepted || !fraudWarningAcknowledged}
        >
          Open deal
        </button>
      </form>
      {msg && <pre className="panel" style={{ whiteSpace: "pre-wrap" }}>{msg}</pre>}
    </section>
  );
}
