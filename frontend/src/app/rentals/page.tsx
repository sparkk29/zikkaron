"use client";

import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";

export default function RentalsPage() {
  const { address, connect } = useWallet();
  const [propertyId, setPropertyId] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [leaseCid, setLeaseCid] = useState("");
  const [msg, setMsg] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!address) return connect();
    try {
      // Rental path uses authorized occupant registry for MVP memorial
      const res = await api("/api/occupancy/occupants", {
        method: "POST",
        wallet: address,
        body: {
          propertyId,
          occupantName: tenantName,
          relationship: "authorized_tenant",
          leaseCid: leaseCid || undefined,
        },
      });
      setMsg(`Authorized tenant memorialized. ${JSON.stringify(res)}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section>
      <h1>Rentals</h1>
      <p className="muted">
        Tenants must be on the authorized occupancy registry. Lease CIDs are integrity anchors —
        not court filings. Fake leases shown to police are a primary threat; memorials help
        officers see what the owner recorded.
      </p>
      <form className="panel" onSubmit={onSubmit}>
        <label className="label">Property ID</label>
        <input value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required />
        <label className="label">Tenant name</label>
        <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} required />
        <label className="label">Lease CID</label>
        <input value={leaseCid} onChange={(e) => setLeaseCid(e.target.value)} />
        <button className="btn accent" type="submit">
          Authorize tenant
        </button>
      </form>
      {msg && <pre className="panel">{msg}</pre>}
    </section>
  );
}
