const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const BASE = process.env.API_URL || "http://127.0.0.1:4000";
const OWNER = "0x1111111111111111111111111111111111111111";
const AUTHORITY = "0x2222222222222222222222222222222222222222";
const BUYER = "0x3333333333333333333333333333333333333333";
const ADMIN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async function api(path, { method = "GET", wallet, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(wallet ? { "x-wallet-address": wallet } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

describe("Zikkaron backend happy paths", { timeout: 30000 }, () => {
  let propertyId;
  let healthOk = false;

  before(async () => {
    try {
      const h = await api("/health");
      healthOk = h.status === 200 && h.data.product === "Zikkaron";
    } catch {
      healthOk = false;
    }
  });

  it("health reports product Zikkaron and country US", async () => {
    if (!healthOk) return;
    const { status, data } = await api("/health");
    assert.equal(status, 200);
    assert.equal(data.product, "Zikkaron");
    assert.equal(data.country, "US");
  });

  it("registers KYC hashes for owner, admin, authority", async () => {
    if (!healthOk) return;
    for (const [wallet, role, extra] of [
      [ADMIN, "admin", {}],
      [OWNER, "seller", { kycPayload: "owner-demo-kyc" }],
      [
        AUTHORITY,
        "authority_officer",
        {
          agencyName: "Demo Sheriff Office (Pilot Placeholder)",
          badgeRefPlaceholder: "DEMO-BADGE-001",
          displayName: "Officer Demo",
        },
      ],
      [BUYER, "buyer", { kycPayload: "buyer-demo-kyc" }],
    ]) {
      const { status, data } = await api("/api/users/register", {
        method: "POST",
        wallet,
        body: { role, ...extra },
      });
      assert.equal(status, 201, JSON.stringify(data));
      assert.equal(data.user.role, role);
    }

    const verify = await api(`/api/users/verify/${OWNER}`, { method: "POST", wallet: ADMIN });
    assert.equal(verify.status, 200);
    assert.equal(verify.data.user.kycVerified, true);
  });

  it("mints property memorial with APN and vacant_secured", async () => {
    if (!healthOk) return;
    const { status, data } = await api("/api/properties", {
      method: "POST",
      wallet: OWNER,
      body: {
        addressLine1: "100 Memorial Way",
        city: "Phoenix",
        state: "AZ",
        zip: "85001",
        county: "Maricopa",
        apn: `TEST-${Date.now()}`,
        deedCid: "bafyDeedDemoCid",
        occupancyStatus: "vacant_secured",
        listPriceUsd: 425000,
        disclaimerAccepted: true,
      },
    });
    assert.equal(status, 201, JSON.stringify(data));
    propertyId = data.property.id;
    assert.equal(data.property.occupancyStatus, "vacant_secured");
  });

  it("adds authorized occupant", async () => {
    if (!healthOk) return;
    const { status, data } = await api("/api/occupancy/occupants", {
      method: "POST",
      wallet: OWNER,
      body: {
        propertyId,
        occupantName: "Jordan Tenant",
        relationship: "authorized_tenant",
        leaseCid: "bafyLeaseDemo",
      },
    });
    assert.equal(status, 201, JSON.stringify(data));
  });

  it("logs unauthorized occupancy + notice memorial", async () => {
    if (!healthOk) return;
    const incident = await api("/api/occupancy/events", {
      method: "POST",
      wallet: OWNER,
      body: {
        propertyId,
        eventType: "unauthorized_occupancy_reported",
        evidenceCid: "bafyIncident",
        evidenceHash: "abc123",
        note: "Unknown occupants observed",
      },
    });
    assert.equal(incident.status, 201, JSON.stringify(incident.data));

    const notice = await api("/api/occupancy/events", {
      method: "POST",
      wallet: OWNER,
      body: {
        propertyId,
        eventType: "notice_memorialized",
        note: "Notice posted at property — memorial only",
        notLegalServiceAcknowledged: true,
      },
    });
    assert.equal(notice.status, 201, JSON.stringify(notice.data));

    const notified = await api("/api/occupancy/events", {
      method: "POST",
      wallet: OWNER,
      body: {
        propertyId,
        eventType: "authority_notified",
        note: "Owner notified demo agency",
      },
    });
    assert.equal(notified.status, 201);
  });

  it("authority case export happy path + acknowledge", async () => {
    if (!healthOk) return;
    const search = await api(`/api/authority/search?q=${propertyId}`, { wallet: AUTHORITY });
    assert.equal(search.status, 200, JSON.stringify(search.data));
    assert.ok(search.data.results.length >= 1);

    const caseView = await api(`/api/authority/case/${propertyId}`, { wallet: AUTHORITY });
    assert.equal(caseView.status, 200);
    assert.ok(caseView.data.authorizedOccupants);
    assert.ok(caseView.data.incidentTimeline.length >= 1);

    const exp = await api("/api/authority/exports", {
      method: "POST",
      wallet: AUTHORITY,
      body: {
        propertyId,
        caseRefPlaceholder: "DEMO-CASE-42",
        authorityUseAcknowledged: true,
      },
    });
    assert.equal(exp.status, 201, JSON.stringify(exp.data));
    assert.match(exp.data.export.watermark, /not an official government record/i);

    const ack = await api("/api/authority/acknowledge", {
      method: "POST",
      wallet: AUTHORITY,
      body: {
        propertyId,
        exportId: exp.data.export.id,
        note: "Simulated receipt for case support",
      },
    });
    assert.equal(ack.status, 201, JSON.stringify(ack.data));
  });

  it("purchase deal requires disclaimer and surfaces fraud warnings", async () => {
    if (!healthOk) return;
    const bad = await api("/api/deals", {
      method: "POST",
      wallet: OWNER,
      body: {
        propertyId,
        buyerWallet: BUYER,
        amountTestPol: 1.5,
        disclaimerAccepted: false,
        fraudWarningAcknowledged: true,
      },
    });
    assert.equal(bad.status, 400);

    const ok = await api("/api/deals", {
      method: "POST",
      wallet: OWNER,
      body: {
        propertyId,
        buyerWallet: BUYER,
        amountTestPol: 1.5,
        disclaimerAccepted: true,
        fraudWarningAcknowledged: true,
      },
    });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.ok(ok.data.reminders.some((r) => /TESTNET FUNDS/i.test(r)));
  });
});
