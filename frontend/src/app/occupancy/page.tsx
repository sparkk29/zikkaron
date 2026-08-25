"use client";

import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";

export default function OccupancyPage() {
  const { address, connect } = useWallet();
  const [propertyId, setPropertyId] = useState("");
  const [occupantName, setOccupantName] = useState("");
  const [leaseCid, setLeaseCid] = useState("");
  const [eventType, setEventType] = useState("unauthorized_occupancy_reported");
  const [note, setNote] = useState("");
  const [evidenceCid, setEvidenceCid] = useState("");
  const [msg, setMsg] = useState("");

  async function addOccupant(e: FormEvent) {
    e.preventDefault();
    if (!address) return connect();
    try {
      const res = await api("/api/occupancy/occupants", {
        method: "POST",
        wallet: address,
        body: { propertyId, occupantName, leaseCid: leaseCid || undefined },
      });
      setMsg(JSON.stringify(res, null, 2));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  async function logEvent(e: FormEvent) {
    e.preventDefault();
    if (!address) return connect();
    try {
      const res = await api("/api/occupancy/events", {
        method: "POST",
        wallet: address,
        body: {
          propertyId,
          eventType,
          note: note || undefined,
          evidenceCid: evidenceCid || undefined,
          notLegalServiceAcknowledged:
            eventType === "notice_memorialized" ? true : undefined,
        },
      });
      setMsg(JSON.stringify(res, null, 2));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section>
      <h1>Occupancy & incidents</h1>
      <p className="muted">
        Maintain an authorized occupancy registry and log incidents for Authority Console case
        support. Notice memorials are not legal service of process. Eviction requires lawful
        process under state law — Zikkaron does not instruct lockouts.
      </p>

      <div className="form-row">
        <div>
          <label className="label">Property ID</label>
          <input value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required />
        </div>
      </div>

      <form className="panel" onSubmit={addOccupant}>
        <h3>Authorize occupant</h3>
        <label className="label">Name</label>
        <input value={occupantName} onChange={(e) => setOccupantName(e.target.value)} required />
        <label className="label">Lease CID</label>
        <input value={leaseCid} onChange={(e) => setLeaseCid(e.target.value)} />
        <button className="btn accent" type="submit">
          Add authorized occupant
        </button>
      </form>

      <form className="panel" onSubmit={logEvent}>
        <h3>Log memorial event</h3>
        <label className="label">Event type</label>
        <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
          <option value="unauthorized_occupancy_reported">unauthorized_occupancy_reported</option>
          <option value="notice_memorialized">notice_memorialized</option>
          <option value="police_called">police_called</option>
          <option value="authority_notified">authority_notified</option>
          <option value="vacant_secured">vacant_secured</option>
        </select>
        <label className="label">Evidence CID</label>
        <input value={evidenceCid} onChange={(e) => setEvidenceCid(e.target.value)} />
        <label className="label">Note</label>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        {eventType === "notice_memorialized" && (
          <div className="warn-box">
            Submitting acknowledges this is <strong>not legal service</strong>. Real-world LE /
            court process remains outside Zikkaron.
          </div>
        )}
        <button className="btn" type="submit">
          Record event
        </button>
      </form>

      {msg && <pre className="panel">{msg}</pre>}
    </section>
  );
}
