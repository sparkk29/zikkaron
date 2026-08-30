"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, setSessionToken } from "@/lib/api";
import { useWallet } from "@/lib/wallet";

export default function AuthorityPage() {
  const { address, connect } = useWallet();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [caseData, setCaseData] = useState<any>(null);
  const [caseRef, setCaseRef] = useState("");
  const [msg, setMsg] = useState("");
  const [exportId, setExportId] = useState<string | null>(null);
  const [ssoAgencies, setSsoAgencies] = useState<any[]>([]);
  const [selectedAgency, setSelectedAgency] = useState("");
  const [redactOwnerWallet, setRedactOwnerWallet] = useState(false);
  const [redactEvidence, setRedactEvidence] = useState(false);

  useEffect(() => {
    api<{ agencies: any[] }>("/api/auth/sso/agencies")
      .then((d) => {
        setSsoAgencies(d.agencies);
        if (d.agencies[0]) setSelectedAgency(d.agencies[0].id);
      })
      .catch(() => setSsoAgencies([]));
  }, []);

  async function simulateSso() {
    if (!address) return connect();
    if (!selectedAgency) return;
    try {
      const res = await api<{
        token: string;
        notice: string;
        user: { agencyName: string; role: string };
        authMethod: string;
      }>("/api/auth/sso/simulate", {
        method: "POST",
        body: {
          agencyId: selectedAgency,
          walletAddress: address,
          displayName: "Agency Officer (SSO stub)",
          subjectPlaceholder: "DEMO-SSO-SUB",
        },
        token: null,
      });
      setSessionToken(res.token);
      setMsg(
        `${res.notice}\nBound to ${res.user.agencyName} as ${res.user.role} (${res.authMethod})`
      );
      window.location.reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "SSO simulate failed");
    }
  }

  async function startOidcStub() {
    if (!selectedAgency) return;
    try {
      const res = await api<{ notice: string; authorizeUrlPlaceholder: string }>(
        "/api/auth/sso/oidc/start",
        {
          method: "POST",
          body: { agencyId: selectedAgency },
          token: null,
        }
      );
      setMsg(`${res.notice}\nPlaceholder authorize URL:\n${res.authorizeUrlPlaceholder}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "OIDC start failed");
    }
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    if (!address) return connect();
    setMsg("");
    try {
      const data = await api<{ results: any[]; notice: string }>(
        `/api/authority/search?q=${encodeURIComponent(q)}`,
        { wallet: address }
      );
      setResults(data.results);
      setMsg(data.notice);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  async function openCase(propertyId: string) {
    if (!address) return connect();
    const data = await api(`/api/authority/case/${propertyId}`, { wallet: address });
    setCaseData(data);
  }

  async function exportPack() {
    if (!address || !caseData) return;
    try {
      const res = await api<any>("/api/authority/exports", {
        method: "POST",
        wallet: address,
        body: {
          propertyId: caseData.property.id,
          caseRefPlaceholder: caseRef || undefined,
          authorityUseAcknowledged: true,
          redactOwnerWallet,
          redactEvidence,
        },
      });
      setExportId(res.export.id);
      setMsg(`${res.export.watermark}\n${res.note}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  async function downloadPack() {
    if (!address || !exportId) return;
    try {
      const data = await api<any>(`/api/authority/exports/${exportId}/download`, {
        wallet: address,
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `zikkaron-case-pack-${exportId}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMsg("Case pack downloaded. Preserve the manifest hash with the export.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function acknowledge() {
    if (!address || !caseData) return;
    try {
      const res = await api<any>("/api/authority/acknowledge", {
        method: "POST",
        wallet: address,
        body: {
          propertyId: caseData.property.id,
          exportId: exportId || undefined,
          note: "Simulated agency acknowledgment of receipt",
        },
      });
      setMsg(res.note);
      await openCase(caseData.property.id);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section>
      <h1>Authority Console</h1>
      <p className="muted">
        Read-only case support for demo authority_officer accounts. Designed for collaboration
        with government and law enforcement. <strong>Not an official government system.</strong>{" "}
        No seals, badges, or “verified by FBI” chrome.
      </p>
      <div className="warn-box">
        MVP authority access is demo-only — not accredited LE access control, not CJIS / FedRAMP
        certified. Handle exports under agency policy.
      </div>

      <div className="panel">
        <h3>Agency SSO (stubs)</h3>
        <p className="muted">
          OIDC/SAML adapters are placeholders for MoU pilots. Use simulated login to bind an
          authority session without a live government IdP.
        </p>
        <label className="label">Pilot agency</label>
        <select value={selectedAgency} onChange={(e) => setSelectedAgency(e.target.value)}>
          {ssoAgencies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.ssoProtocol || "n/a"})
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button className="btn accent" type="button" onClick={simulateSso}>
            Simulated agency SSO login
          </button>
          <button className="btn secondary" type="button" onClick={startOidcStub}>
            Preview OIDC start stub
          </button>
        </div>
      </div>

      <form className="panel" onSubmit={search}>
        <label className="label">Search address / APN / property id</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="100 Memorial Way or APN"
        />
        <button className="btn accent" type="submit">
          Search
        </button>
      </form>

      <div className="grid">
        {results.map((p) => (
          <button
            key={p.id}
            type="button"
            className="panel"
            style={{ textAlign: "left", cursor: "pointer" }}
            onClick={() => openCase(p.id)}
          >
            <strong>{p.addressLine1}</strong>
            <div className="muted">
              {p.city}, {p.state} · APN {p.apn}
            </div>
            <span className="tag">{p.occupancyStatus}</span>
          </button>
        ))}
      </div>

      {caseData && (
        <>
          <div className="panel">
            <h3>Case view</h3>
            <p>
              Owner wallet: <code>{caseData.owner.wallet}</code>
            </p>
            <p className="muted">
              KYC {caseData.owner.kycVerified ? "verified" : "unverified"} · fraud risk{" "}
              {caseData.owner.fraudRiskLevel || "n/a"} · hash {caseData.owner.kycHash || "—"}
            </p>
            <h4>Authorized occupants</h4>
            <ul>
              {caseData.authorizedOccupants?.map((o: any) => (
                <li key={o.id}>{o.occupant_name}</li>
              ))}
            </ul>
            <h4>Open disputes</h4>
            <ul>
              {caseData.openDisputes?.length ? (
                caseData.openDisputes.map((d: any) => <li key={d.id}>{d.reason}</li>)
              ) : (
                <li className="muted">None</li>
              )}
            </ul>
            <h4>Incident timeline</h4>
            <ul className="timeline">
              {caseData.incidentTimeline?.map((ev: any) => (
                <li key={ev.id}>
                  <strong>{ev.event_type}</strong>
                  <div className="muted">{new Date(ev.created_at).toLocaleString()}</div>
                  <div>{ev.note}</div>
                  {ev.evidence_cid && <div className="muted">Evidence CID {ev.evidence_cid}</div>}
                </li>
              ))}
            </ul>
            <h4>Legal record placeholders</h4>
            <ul>
              {caseData.legalRecordPlaceholders?.map((lr: any) => (
                <li key={lr.id}>
                  official={String(lr.is_official_county_record)} · {lr.document_cid}
                </li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <h3>Authority Case Pack</h3>
            <label className="label">Case ref placeholder</label>
            <input
              value={caseRef}
              onChange={(e) => setCaseRef(e.target.value)}
              placeholder="DEMO-CASE-42"
            />
            <label style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <input
                type="checkbox"
                checked={redactOwnerWallet}
                onChange={(e) => setRedactOwnerWallet(e.target.checked)}
              />
              <span className="muted">Redact owner wallet from export</span>
            </label>
            <label style={{ display: "flex", gap: "0.5rem", marginBottom: "0.85rem" }}>
              <input
                type="checkbox"
                checked={redactEvidence}
                onChange={(e) => setRedactEvidence(e.target.checked)}
              />
              <span className="muted">Redact evidence CIDs and hashes from export</span>
            </label>
            <label style={{ display: "flex", gap: "0.5rem", marginBottom: "0.85rem" }}>
              <input type="checkbox" required defaultChecked />
              <span className="muted">
                authorityUseAcknowledged — for official investigation / case support; handle under
                agency policy.
              </span>
            </label>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button className="btn accent" type="button" onClick={exportPack}>
                Download / log case pack
              </button>
              {exportId && (
                <button className="btn secondary" type="button" onClick={downloadPack}>
                  Download logged export JSON
                </button>
              )}
              <button className="btn secondary" type="button" onClick={acknowledge}>
                Acknowledge receipt (simulated)
              </button>
            </div>
          </div>
        </>
      )}

      {msg && (
        <pre className="panel muted" style={{ whiteSpace: "pre-wrap" }}>
          {msg}
        </pre>
      )}
    </section>
  );
}
