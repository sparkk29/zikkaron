"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";

export default function PropertyDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const { address, connect } = useWallet();
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [legalRecordId, setLegalRecordId] = useState("");
  const [instrument, setInstrument] = useState("");
  const [matchConfirmed, setMatchConfirmed] = useState(true);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceType, setEvidenceType] = useState("incident_evidence");
  const [sharePurpose, setSharePurpose] = useState("");
  const [shareUrl, setShareUrl] = useState("");

  async function load() {
    const d = await api(`/api/properties/${id}`);
    setData(d);
    const first = (d as any).legalRecords?.[0]?.id;
    if (first) setLegalRecordId(first);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, [id]);

  async function simulateVerify(e: FormEvent) {
    e.preventDefault();
    if (!address) return connect();
    try {
      const res = await api(`/api/properties/${id}/legal/simulate-verify`, {
        method: "POST",
        wallet: address,
        body: {
          legalRecordId,
          instrumentNumberPlaceholder: instrument || undefined,
          matchConfirmed,
        },
      });
      setMsg(JSON.stringify(res));
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  async function uploadEvidence(e: FormEvent) {
    e.preventDefault();
    if (!address) return connect();
    if (!evidenceFile) {
      setMsg("Choose a PDF, PNG, JPEG, text, or JSON file first.");
      return;
    }
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(evidenceFile);
      });
      const result = await api<any>("/api/documents", {
        method: "POST",
        wallet: address,
        body: {
          propertyId: id,
          docType: evidenceType,
          filename: evidenceFile.name,
          mimeType: evidenceFile.type || "application/octet-stream",
          contentBase64,
        },
      });
      setMsg(
        `Evidence stored as ${result.document.storage_mode}. SHA-256: ${result.document.content_hash}`
      );
      setEvidenceFile(null);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function createShare(e: FormEvent) {
    e.preventDefault();
    if (!address) return connect();
    try {
      const result = await api<any>("/api/shares", {
        method: "POST",
        wallet: address,
        body: {
          propertyId: id,
          purpose: sharePurpose,
          expiresInHours: 72,
        },
      });
      setShareUrl(result.share.url);
      setMsg("Share link created. Anyone with it can view the memorial until expiry.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Share creation failed");
    }
  }

  if (!data) return <p className="muted">Loading… {msg}</p>;
  const p = data.property;

  return (
    <section>
      <h1>{p.addressLine1}</h1>
      <p className="muted">
        {p.city}, {p.state} {p.zip} · {p.county} County · APN {p.apn}
      </p>
      <p>
        <span className="tag">{p.occupancyStatus}</span>
        {p.listingPaused && <span className="tag">listing paused</span>}
        {p.ownerFraudRisk && p.ownerFraudRisk !== "low" && (
          <span className="tag">owner risk {p.ownerFraudRisk}</span>
        )}
      </p>

      <div className="panel">
        <h3>Authorized occupants</h3>
        {data.authorizedOccupants?.length ? (
          <ul>
            {data.authorizedOccupants.map((o: any) => (
              <li key={o.id}>
                {o.occupant_name} {o.relationship ? `(${o.relationship})` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">None registered — may show vacant_secured.</p>
        )}
      </div>

      <div className="panel">
        <h3>Incident timeline</h3>
        <ul className="timeline">
          {data.occupancyEvents?.map((ev: any) => (
            <li key={ev.id}>
              <strong>{ev.event_type}</strong>
              <div className="muted">{new Date(ev.created_at).toLocaleString()}</div>
              <div>{ev.note}</div>
              {ev.evidence_cid && <div className="muted">CID {ev.evidence_cid}</div>}
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h3>Evidence & owner share</h3>
        <p className="muted">
          Uploads are scanned with a simulated validator and pinned to IPFS when configured.
          Otherwise only a clearly labeled SHA-256 fallback is recorded.
        </p>
        <form onSubmit={uploadEvidence}>
          <label className="label">Evidence type</label>
          <select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)}>
            <option value="incident_evidence">incident_evidence</option>
            <option value="notice">notice</option>
            <option value="deed">deed</option>
            <option value="lease">lease</option>
          </select>
          <label className="label">File</label>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.txt,.json"
            onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
          />
          <button className="btn" type="submit">
            Upload evidence
          </button>
        </form>
        <form onSubmit={createShare} style={{ marginTop: "1.25rem" }}>
          <label className="label">Share purpose</label>
          <input
            required
            value={sharePurpose}
            onChange={(e) => setSharePurpose(e.target.value)}
            placeholder="Counsel diligence review"
          />
          <button className="btn secondary" type="submit">
            Create 72-hour share link
          </button>
          {shareUrl && <p className="muted">Share URL: {shareUrl}</p>}
        </form>
      </div>

      <div className="panel">
        <h3>Legal record placeholders</h3>
        {data.legalRecords?.map((lr: any) => (
          <div key={lr.id} style={{ marginBottom: "0.75rem" }}>
            <div>CID {lr.document_cid}</div>
            <div className="muted">
              Official county record flag: {String(lr.is_official_county_record)} (default false
              until simulated verify)
            </div>
          </div>
        ))}
        <form onSubmit={simulateVerify}>
          <p className="muted">
            Title officer / authority: human-in-the-loop simulated county verify (stand-in for
            recorder workflow).
          </p>
          <label className="label">Legal record id</label>
          <input value={legalRecordId} onChange={(e) => setLegalRecordId(e.target.value)} />
          <label className="label">Instrument # placeholder</label>
          <input value={instrument} onChange={(e) => setInstrument(e.target.value)} />
          <label style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <input
              type="checkbox"
              checked={matchConfirmed}
              onChange={(e) => setMatchConfirmed(e.target.checked)}
            />
            Match confirmed (uncheck to open dispute on mismatch)
          </label>
          <button className="btn" type="submit">
            Simulated verify
          </button>
        </form>
      </div>

      {data.disputes?.length > 0 && (
        <div className="warn-box">
          <strong>Disputes</strong>
          <ul>
            {data.disputes.map((d: any) => (
              <li key={d.id}>
                [{d.status}] {d.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {msg && <pre className="panel muted">{msg}</pre>}
    </section>
  );
}
