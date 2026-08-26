"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";

export default function AdminPage() {
  const { address, connect } = useWallet();
  const [jobs, setJobs] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [verifyWallet, setVerifyWallet] = useState("");
  const [adapter, setAdapter] = useState<string>("");
  const [msg, setMsg] = useState("");

  async function load() {
    if (!address) return;
    try {
      const q = await api<{ jobs: any[] }>("/api/admin/queue", { wallet: address });
      setJobs(q.jobs);
      const a = await api<{ adapter: string; mode: string }>("/api/lookups/adapter");
      setAdapter(`${a.adapter} (mode=${a.mode})`);
      try {
        const audit = await api<{ logs: any[] }>("/api/admin/audit", { wallet: address });
        setLogs(audit.logs);
      } catch {
        /* authority can see queue; audit is admin-only */
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  useEffect(() => {
    if (address) load();
  }, [address]);

  async function verify() {
    if (!address) return connect();
    try {
      await api(`/api/users/verify/${verifyWallet}`, { method: "POST", wallet: address });
      setMsg(`Verified ${verifyWallet}`);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  async function processLookups() {
    if (!address) return connect();
    try {
      const res = await api<{ processed: any[]; adapter: string }>("/api/lookups/process-queue", {
        method: "POST",
        wallet: address,
        body: { limit: 50 },
      });
      setMsg(`Processed ${res.processed.length} lookup jobs via ${res.adapter}`);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section>
      <h1>Admin</h1>
      <p className="muted">
        Soft KYC verify, government_api_queue, county/APN lookup adapters, and audit logs.
      </p>
      {!address && (
        <button className="btn" type="button" onClick={connect}>
          Connect wallet
        </button>
      )}
      <div className="panel">
        <h3>Verify KYC (admin)</h3>
        <input
          placeholder="0x..."
          value={verifyWallet}
          onChange={(e) => setVerifyWallet(e.target.value)}
        />
        <button className="btn accent" type="button" onClick={verify}>
          Mark verified
        </button>
      </div>
      <div className="panel">
        <h3>County / assessor lookup adapter</h3>
        <p className="muted">Active: {adapter || "…"}</p>
        <button className="btn secondary" type="button" onClick={processLookups}>
          Process queued lookups
        </button>
      </div>
      <div className="panel">
        <h3>government_api_queue</h3>
        <ul>
          {jobs.map((j) => (
            <li key={j.id}>
              <code>{j.job_type}</code> — {j.status}
            </li>
          ))}
        </ul>
      </div>
      {logs.length > 0 && (
        <div className="panel">
          <h3>Audit (recent)</h3>
          <ul>
            {logs.slice(0, 20).map((l) => (
              <li key={l.id}>
                {l.action} · {l.actor_wallet}
              </li>
            ))}
          </ul>
        </div>
      )}
      {msg && <div className="warn-box">{msg}</div>}
    </section>
  );
}
