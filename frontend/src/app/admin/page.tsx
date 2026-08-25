"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";

export default function AdminPage() {
  const { address, connect } = useWallet();
  const [jobs, setJobs] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [verifyWallet, setVerifyWallet] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    if (!address) return;
    try {
      const q = await api<{ jobs: any[] }>("/api/admin/queue", { wallet: address });
      setJobs(q.jobs);
      try {
        const a = await api<{ logs: any[] }>("/api/admin/audit", { wallet: address });
        setLogs(a.logs);
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

  return (
    <section>
      <h1>Admin</h1>
      <p className="muted">
        Soft KYC verify, government_api_queue stubs, and audit logs. Partnership integrations are
        placeholders only.
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
