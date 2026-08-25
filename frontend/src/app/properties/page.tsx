"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";

type Property = {
  id: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  apn: string;
  occupancyStatus: string;
  listingPaused: boolean;
  listPriceUsd?: string;
};

export default function PropertiesPage() {
  const { address, connect } = useWallet();
  const [properties, setProperties] = useState<Property[]>([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    addressLine1: "",
    city: "",
    state: "AZ",
    zip: "",
    county: "",
    apn: "",
    legalDescription: "",
    deedCid: "",
    occupancyStatus: "vacant_secured",
    listPriceUsd: "",
  });

  async function load() {
    const data = await api<{ properties: Property[] }>("/api/properties");
    setProperties(data.properties);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!address) return connect();
    setMsg("");
    try {
      await api("/api/properties", {
        method: "POST",
        wallet: address,
        body: {
          ...form,
          listPriceUsd: form.listPriceUsd ? Number(form.listPriceUsd) : undefined,
          disclaimerAccepted: true,
        },
      });
      setMsg("Property memorial created. Not legal title.");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section>
      <h1>Properties</h1>
      <p className="muted">
        Register a memorial bound to county / APN / deed CID. County recording remains
        authoritative.
      </p>

      <form className="panel" onSubmit={onCreate}>
        <h3>Register memorial</h3>
        <div className="form-row">
          <div>
            <label className="label">Address</label>
            <input
              required
              value={form.addressLine1}
              onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
            />
          </div>
          <div>
            <label className="label">City</label>
            <input
              required
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div>
            <label className="label">State</label>
            <input
              required
              maxLength={2}
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
            />
          </div>
          <div>
            <label className="label">ZIP</label>
            <input
              required
              value={form.zip}
              onChange={(e) => setForm({ ...form, zip: e.target.value })}
            />
          </div>
        </div>
        <div className="form-row">
          <div>
            <label className="label">County</label>
            <input
              required
              value={form.county}
              onChange={(e) => setForm({ ...form, county: e.target.value })}
            />
          </div>
          <div>
            <label className="label">APN</label>
            <input
              required
              value={form.apn}
              onChange={(e) => setForm({ ...form, apn: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Occupancy</label>
            <select
              value={form.occupancyStatus}
              onChange={(e) => setForm({ ...form, occupancyStatus: e.target.value })}
            >
              <option value="vacant_secured">vacant_secured</option>
              <option value="owner_occupied">owner_occupied</option>
              <option value="authorized_tenant">authorized_tenant</option>
            </select>
          </div>
          <div>
            <label className="label">List price (USD display)</label>
            <input
              value={form.listPriceUsd}
              onChange={(e) => setForm({ ...form, listPriceUsd: e.target.value })}
            />
          </div>
        </div>
        <label className="label">Deed CID (IPFS)</label>
        <input
          value={form.deedCid}
          onChange={(e) => setForm({ ...form, deedCid: e.target.value })}
          placeholder="bafy..."
        />
        <label className="label">Legal description</label>
        <textarea
          rows={2}
          value={form.legalDescription}
          onChange={(e) => setForm({ ...form, legalDescription: e.target.value })}
        />
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
          <input type="checkbox" required defaultChecked />
          <span className="muted">
            I accept that this is a memorial record only — not title transfer, not an official
            government filing.
          </span>
        </label>
        <button className="btn accent" type="submit">
          Create memorial
        </button>
      </form>

      {msg && <div className="warn-box">{msg}</div>}

      <div className="grid">
        {properties.map((p) => (
          <Link key={p.id} href={`/properties/${p.id}`} className="panel" style={{ color: "inherit", textDecoration: "none" }}>
            <h3 style={{ marginTop: 0 }}>{p.addressLine1}</h3>
            <p className="muted">
              {p.city}, {p.state} {p.zip} · {p.county}
            </p>
            <p>
              <span className="tag">{p.occupancyStatus}</span>
              {p.listingPaused && <span className="tag">paused</span>}
            </p>
            <p className="muted">APN {p.apn}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
