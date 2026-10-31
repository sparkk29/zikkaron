const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { Wallet } = require("ethers");
const { SiweMessage } = require("siwe");

const BASE = process.env.API_URL || "http://127.0.0.1:4000";
const OWNER = "0x1111111111111111111111111111111111111111";
const AUTHORITY = "0x2222222222222222222222222222222222222222";
const BUYER = "0x3333333333333333333333333333333333333333";
const ADMIN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const TRUSTED_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

async function api(path, { method = "GET", wallet, token, body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(!token && wallet ? { "x-wallet-address": wallet } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, headers: res.headers };
}

async function requireHealthyApi() {
  let h;
  try {
    h = await api("/health");
  } catch (err) {
    throw new Error(`Zikkaron API unreachable at ${BASE}: ${err.message}`);
  }
  if (h.status !== 200 || h.data.product !== "Zikkaron") {
    throw new Error(`Zikkaron API unhealthy at ${BASE}: ${h.status} ${JSON.stringify(h.data)}`);
  }
}

describe("Zikkaron SIWE auth", { timeout: 30000 }, () => {
  before(requireHealthyApi);

  it("issues nonce, verifies SIWE signature, and serves session", async () => {
    const wallet = Wallet.createRandom();
    const address = wallet.address.toLowerCase();

    const nonceRes = await api(`/api/auth/nonce?address=${address}`);
    assert.equal(nonceRes.status, 200, JSON.stringify(nonceRes.data));
    assert.ok(nonceRes.data.nonce);

    const message = new SiweMessage({
      domain: nonceRes.data.domain,
      address: wallet.address,
      statement: nonceRes.data.statement,
      uri: nonceRes.data.uri,
      version: "1",
      chainId: nonceRes.data.chainId,
      nonce: nonceRes.data.nonce,
    });
    const prepared = message.prepareMessage();
    const signature = await wallet.signMessage(prepared);

    const verify = await api("/api/auth/verify", {
      method: "POST",
      body: { message: prepared, signature },
    });
    assert.equal(verify.status, 200, JSON.stringify(verify.data));
    assert.ok(verify.data.token);
    assert.equal(verify.data.wallet, address);

    const session = await api("/api/auth/session", { token: verify.data.token });
    assert.equal(session.status, 200);
    assert.equal(session.data.wallet, address);

    const setCookie = verify.headers.get("set-cookie") || "";
    assert.match(setCookie, /zikkaron_session=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    const cookie = setCookie.split(";")[0];

    const cookieSession = await api("/api/auth/session", { headers: { cookie } });
    assert.equal(cookieSession.status, 200, JSON.stringify(cookieSession.data));
    assert.equal(cookieSession.data.wallet, address);

    const crossSite = await api("/api/auth/logout", {
      method: "POST",
      headers: { cookie, origin: "https://evil.example" },
    });
    assert.equal(crossSite.status, 403, JSON.stringify(crossSite.data));
    const noOrigin = await api("/api/auth/logout", { method: "POST", headers: { cookie } });
    assert.equal(noOrigin.status, 403);

    const cookieLogout = await api("/api/auth/logout", {
      method: "POST",
      headers: { cookie, origin: TRUSTED_ORIGIN },
    });
    assert.equal(cookieLogout.status, 200, JSON.stringify(cookieLogout.data));
    assert.match(cookieLogout.headers.get("set-cookie") || "", /zikkaron_session=;/);
    const afterLogout = await api("/api/auth/session", { headers: { cookie } });
    assert.equal(afterLogout.status, 401);

    const replay = await api("/api/auth/verify", {
      method: "POST",
      body: { message: prepared, signature },
    });
    assert.equal(replay.status, 401, JSON.stringify(replay.data));

    const logout = await api("/api/auth/logout", {
      method: "POST",
      token: verify.data.token,
    });
    assert.equal(logout.status, 200);
  });

  it("rejects a SIWE message with a bad signature as 401", async () => {
    const wallet = Wallet.createRandom();
    const nonceRes = await api(`/api/auth/nonce?address=${wallet.address.toLowerCase()}`);
    const message = new SiweMessage({
      domain: nonceRes.data.domain,
      address: wallet.address,
      statement: nonceRes.data.statement,
      uri: nonceRes.data.uri,
      version: "1",
      chainId: nonceRes.data.chainId,
      nonce: nonceRes.data.nonce,
    }).prepareMessage();
    const signature = await Wallet.createRandom().signMessage(message);
    const verify = await api("/api/auth/verify", { method: "POST", body: { message, signature } });
    assert.equal(verify.status, 401, JSON.stringify(verify.data));
  });

  it("simulated SSO never escalates an existing non-officer user", async () => {
    const agencies = await api("/api/auth/sso/agencies");
    const agencyId = agencies.data.agencies[0].id;
    const seller = Wallet.createRandom().address.toLowerCase();
    const reg = await api("/api/users/register", {
      method: "POST",
      wallet: seller,
      body: { role: "seller" },
    });
    assert.equal(reg.status, 201, JSON.stringify(reg.data));

    const sim = await api("/api/auth/sso/simulate", {
      method: "POST",
      wallet: seller,
      body: { agencyId, walletAddress: seller },
    });
    assert.equal(sim.status, 409, JSON.stringify(sim.data));

    const me = await api("/api/users/me", { wallet: seller });
    assert.equal(me.data.user.role, "seller");
  });

  it("lists SSO agencies and simulates agency SSO login", async () => {
    const list = await api("/api/auth/sso/agencies");
    assert.equal(list.status, 200, JSON.stringify(list.data));
    assert.ok(list.data.agencies.length >= 1);
    const agencyId = list.data.agencies[0].id;

    const oidc = await api("/api/auth/sso/oidc/start", {
      method: "POST",
      body: { agencyId },
    });
    assert.equal(oidc.status, 200);
    assert.ok(oidc.data.authorizeUrlPlaceholder);

    const wallet = Wallet.createRandom();
    const sim = await api("/api/auth/sso/simulate", {
      method: "POST",
      wallet: wallet.address,
      body: {
        agencyId,
        walletAddress: wallet.address,
        displayName: "SSO Test Officer",
        subjectPlaceholder: "SUB-TEST-1",
      },
    });
    assert.equal(sim.status, 201, JSON.stringify(sim.data));
    assert.equal(sim.data.authMethod, "agency_sso_stub");
    assert.equal(sim.data.user.role, "authority_officer");
    assert.equal(sim.data.user.roleApproved, false);

    const session = await api("/api/auth/session", { token: sim.data.token });
    assert.equal(session.status, 200);
    assert.equal(session.data.authMethod, "agency_sso_stub");
  });
});

describe("Zikkaron backend happy paths", { timeout: 30000 }, () => {
  let propertyId;
  let exportId;

  before(requireHealthyApi);

  it("health reports product Zikkaron and country US", async () => {
    const health = await api("/health");
    assert.equal(health.status, 200);
    assert.equal(health.data.product, "Zikkaron");
    assert.equal(health.data.country, "US");
    assert.equal(health.data.dependencies.database, "up");
    assert.equal(health.data.auth, undefined, "health must not reveal auth configuration");
    assert.ok(health.headers.get("x-request-id"));
  });

  it("exposes operational metrics and honors request correlation", async () => {
    const metrics = await api("/metrics");
    assert.equal(metrics.status, 200);
    assert.equal(metrics.data.product, "Zikkaron");
    assert.ok(metrics.data.totalRequests >= 1);
    assert.ok(metrics.data.byStatus["200"] >= 1);
  });

  it("registers KYC hashes for owner, admin, authority", async () => {
    const selfAssigned = await api("/api/users/register", {
      method: "POST",
      wallet: OWNER,
      body: { role: "authority_officer", agencyName: "Untrusted Caller" },
    });
    assert.equal(selfAssigned.status, 403);

    const existingAdmin = await api("/api/users/me", { wallet: ADMIN });
    if (existingAdmin.status === 404) {
      const bootstrap = await api("/api/users/register", {
        method: "POST",
        wallet: ADMIN,
        body: { role: "admin" },
      });
      assert.equal(bootstrap.status, 201, JSON.stringify(bootstrap.data));
      assert.equal(bootstrap.data.user.roleApproved, true);
    } else {
      assert.equal(existingAdmin.status, 200, JSON.stringify(existingAdmin.data));
      assert.equal(existingAdmin.data.user.role, "admin");
      assert.equal(existingAdmin.data.user.roleApproved, true);
    }

    for (const [wallet, role, extra] of [
      [OWNER, "seller", { kycPayload: "owner-demo-kyc" }],
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

    const authoritySignup = await api("/api/users/register", {
      method: "POST",
      wallet: AUTHORITY,
      body: { role: "seller", displayName: "Officer Demo" },
    });
    assert.equal(authoritySignup.status, 201, JSON.stringify(authoritySignup.data));

    const agencyList = await api("/api/auth/sso/agencies");
    assert.equal(agencyList.status, 200);
    const agencyId = agencyList.data.agencies[0].id;
    const authorityApproval = await api(`/api/users/roles/${AUTHORITY}`, {
      method: "POST",
      wallet: ADMIN,
      body: {
        role: "authority_officer",
        agencyName: "Demo Sheriff Office (Pilot Placeholder)",
        badgeRefPlaceholder: "DEMO-BADGE-001",
        agencyId,
      },
    });
    assert.equal(authorityApproval.status, 200, JSON.stringify(authorityApproval.data));
    assert.equal(authorityApproval.data.user.roleApproved, true);

    const verify = await api(`/api/users/verify/${OWNER}`, { method: "POST", wallet: ADMIN });
    assert.equal(verify.status, 200);
    assert.equal(verify.data.user.kycVerified, true);
  });

  it("mints property memorial with APN and vacant_secured", async () => {
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

  it("ingests evidence metadata and creates an expiring owner share", async () => {
    const contentBase64 = Buffer.from("%PDF-1.4 demo evidence").toString("base64");
    const document = await api("/api/documents", {
      method: "POST",
      wallet: OWNER,
      body: {
        propertyId,
        docType: "incident_evidence",
        filename: "incident.pdf",
        mimeType: "application/pdf",
        contentBase64,
      },
    });
    assert.equal(document.status, 201, JSON.stringify(document.data));
    assert.equal(document.data.document.scan_status, "simulated_clean");
    assert.match(document.data.document.content_hash, /^[a-f0-9]{64}$/);

    const share = await api("/api/shares", {
      method: "POST",
      wallet: OWNER,
      body: {
        propertyId,
        purpose: "Counsel diligence review",
        recipientLabel: "Demo Counsel",
        expiresInHours: 2,
      },
    });
    assert.equal(share.status, 201, JSON.stringify(share.data));
    const token = share.data.share.url.split("/").pop();
    const shared = await api(`/api/shares/${token}`);
    assert.equal(shared.status, 200, JSON.stringify(shared.data));
    assert.equal(shared.data.share.purpose, "Counsel diligence review");
    assert.equal(shared.data.documents.length, 1);
  });

  it("authority case export happy path + acknowledge", async () => {
    const search = await api(`/api/authority/search?q=${propertyId}`, { wallet: AUTHORITY });
    assert.equal(search.status, 200, JSON.stringify(search.data));
    assert.ok(search.data.results.length >= 1);

    const caseView = await api(`/api/authority/case/${propertyId}`, { wallet: AUTHORITY });
    assert.equal(caseView.status, 200);
    assert.ok(caseView.data.authorizedOccupants);
    assert.ok(caseView.data.incidentTimeline.length >= 1);

    const authorityCase = await api("/api/authority/cases", {
      method: "POST",
      wallet: AUTHORITY,
      body: { propertyId, priority: "high", note: "Demo case review" },
    });
    assert.equal(authorityCase.status, 201, JSON.stringify(authorityCase.data));
    const caseUpdate = await api(`/api/authority/cases/${authorityCase.data.case.id}`, {
      method: "PATCH",
      wallet: AUTHORITY,
      body: { status: "in_review" },
    });
    assert.equal(caseUpdate.status, 200, JSON.stringify(caseUpdate.data));

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
    exportId = exp.data.export.id;
    assert.equal(exp.data.pack.owner.kycHash, undefined);
    assert.match(exp.data.export.watermark, /not an official government record/i);
    assert.match(exp.data.export.manifestHash, /^[a-f0-9]{64}$/);

    const download = await api(`/api/authority/exports/${exp.data.export.id}/download`, {
      wallet: AUTHORITY,
    });
    assert.equal(download.status, 200, JSON.stringify(download.data));
    assert.equal(download.data.manifestHash, exp.data.export.manifestHash);

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

    const exports = await api("/api/authority/exports", { wallet: AUTHORITY });
    assert.equal(exports.status, 200);
    assert.ok(exports.data.exports.some((item) => item.id === exp.data.export.id));

    const revoke = await api(`/api/authority/exports/${exp.data.export.id}/revoke`, {
      method: "POST",
      wallet: AUTHORITY,
    });
    assert.equal(revoke.status, 200, JSON.stringify(revoke.data));
  });

  it("purchase deal requires disclaimer and surfaces fraud warnings", async () => {
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

  it("runs county/assessor lookup adapters for a property", async () => {
    const adapter = await api("/api/lookups/adapter");
    assert.equal(adapter.status, 200);
    assert.equal(adapter.data.adapter, "simulated");

    const run = await api(`/api/lookups/run/${propertyId}`, {
      method: "POST",
      wallet: ADMIN,
    });
    assert.equal(run.status, 200, JSON.stringify(run.data));
    assert.equal(run.data.countyRecord.lookupType, "county_record");
    assert.equal(run.data.assessorApn.lookupType, "assessor_apn");
    assert.match(run.data.notice, /authoritative/i);

    const listed = await api(`/api/lookups/property/${propertyId}`, { wallet: ADMIN });
    assert.equal(listed.status, 200);
    assert.ok(listed.data.lookups.length >= 2);
  });

  it("limits private property data to the owner and approved authorities", async () => {
    const stranger = Wallet.createRandom().address.toLowerCase();
    const otherSeller = Wallet.createRandom().address.toLowerCase();
    const agencies = await api("/api/auth/sso/agencies");
    const strangerReg = await api("/api/users/register", {
      method: "POST",
      wallet: stranger,
      body: { role: "buyer", agencyId: agencies.data.agencies[0].id },
    });
    assert.equal(strangerReg.status, 201, JSON.stringify(strangerReg.data));
    assert.equal(strangerReg.data.user.agencyId, null);
    await api("/api/users/register", { method: "POST", wallet: otherSeller, body: { role: "seller" } });

    const anon = await api(`/api/properties/${propertyId}`);
    assert.equal(anon.status, 200);
    assert.equal(anon.data.access, "public");
    assert.equal(anon.data.property.ownerWallet, undefined);
    assert.equal(anon.data.authorizedOccupants, undefined);
    assert.equal(anon.data.legalRecords, undefined);

    const list = await api("/api/properties?limit=5");
    assert.equal(list.status, 200);
    assert.ok(list.data.properties.every((p) => p.ownerWallet === undefined));

    const asOwner = await api(`/api/properties/${propertyId}`, { wallet: OWNER });
    assert.equal(asOwner.data.access, "owner");
    assert.ok(asOwner.data.authorizedOccupants.length >= 1);

    const asAuthority = await api(`/api/properties/${propertyId}`, { wallet: AUTHORITY });
    assert.equal(asAuthority.data.access, "privileged");

    const docsStranger = await api(`/api/documents/property/${propertyId}`, { wallet: stranger });
    assert.equal(docsStranger.status, 403, JSON.stringify(docsStranger.data));
    const docsOwner = await api(`/api/documents/property/${propertyId}`, { wallet: OWNER });
    assert.equal(docsOwner.status, 200);

    const lookupsOther = await api(`/api/lookups/property/${propertyId}`, { wallet: otherSeller });
    assert.equal(lookupsOther.status, 403, JSON.stringify(lookupsOther.data));
    const lookupsOwner = await api(`/api/lookups/property/${propertyId}`, { wallet: OWNER });
    assert.equal(lookupsOwner.status, 200);

    const dealsAnon = await api(`/api/deals/property/${propertyId}`);
    assert.equal(dealsAnon.status, 401);
    const dealsStranger = await api(`/api/deals/property/${propertyId}`, { wallet: stranger });
    assert.deepEqual(dealsStranger.data.deals, []);
    const dealsBuyer = await api(`/api/deals/property/${propertyId}`, { wallet: BUYER });
    assert.ok(dealsBuyer.data.deals.length >= 1);

    const fakeAck = await api("/api/occupancy/events", {
      method: "POST",
      wallet: OWNER,
      body: { propertyId, eventType: "agency_ack_received" },
    });
    assert.equal(fakeAck.status, 403);
  });

  it("queues stranger disputes for review and only authorities clear them", async () => {
    const stranger = Wallet.createRandom().address.toLowerCase();
    const unregistered = await api("/api/occupancy/disputes", {
      method: "POST",
      wallet: stranger,
      body: { propertyId, reason: "Not registered yet" },
    });
    assert.equal(unregistered.status, 403);

    await api("/api/users/register", { method: "POST", wallet: stranger, body: { role: "buyer" } });
    const dispute = await api("/api/occupancy/disputes", {
      method: "POST",
      wallet: stranger,
      body: { propertyId, reason: "I claim this property" },
    });
    assert.equal(dispute.status, 201, JSON.stringify(dispute.data));
    assert.equal(dispute.data.dispute.status, "pending_review");
    const afterPending = await api(`/api/properties/${propertyId}`, { wallet: OWNER });
    assert.equal(afterPending.data.property.listingPaused, false);

    const ownerReview = await api(`/api/occupancy/disputes/${dispute.data.dispute.id}`, {
      method: "PATCH",
      wallet: OWNER,
      body: { status: "dismissed" },
    });
    assert.equal(ownerReview.status, 403);

    const escalate = await api(`/api/occupancy/disputes/${dispute.data.dispute.id}`, {
      method: "PATCH",
      wallet: AUTHORITY,
      body: { status: "open" },
    });
    assert.equal(escalate.status, 200, JSON.stringify(escalate.data));
    assert.equal(escalate.data.listingPaused, true);

    const ownerReset = await api(`/api/properties/${propertyId}/occupancy`, {
      method: "PATCH",
      wallet: OWNER,
      body: { occupancyStatus: "vacant_secured" },
    });
    assert.equal(ownerReset.status, 409, JSON.stringify(ownerReset.data));

    const resolve = await api(`/api/occupancy/disputes/${dispute.data.dispute.id}`, {
      method: "PATCH",
      wallet: AUTHORITY,
      body: { status: "resolved" },
    });
    assert.equal(resolve.status, 200);
    assert.equal(resolve.data.listingPaused, false);

    const ownerUpdate = await api(`/api/properties/${propertyId}/occupancy`, {
      method: "PATCH",
      wallet: OWNER,
      body: { occupancyStatus: "vacant_secured" },
    });
    assert.equal(ownerUpdate.status, 200, JSON.stringify(ownerUpdate.data));
  });

  it("keeps exports scoped to the issuing agency", async () => {
    const ssoAgencies = await api("/api/auth/sso/agencies");
    const authorityAgencyId = ssoAgencies.data.agencies[0].id;
    const allAgencies = await api("/api/authority/agencies", { wallet: ADMIN });
    const otherAgency = allAgencies.data.agencies.find((a) => a.id !== authorityAgencyId);
    assert.ok(otherAgency, "seed data should include more than one agency");
    const officer = Wallet.createRandom().address.toLowerCase();
    await api("/api/users/register", { method: "POST", wallet: officer, body: { role: "seller" } });
    const approve = await api(`/api/users/roles/${officer}`, {
      method: "POST",
      wallet: ADMIN,
      body: { role: "authority_officer", agencyId: otherAgency.id },
    });
    assert.equal(approve.status, 200, JSON.stringify(approve.data));
    const download = await api(`/api/authority/exports/${exportId}/download`, { wallet: officer });
    assert.equal(download.status, 403, JSON.stringify(download.data));
  });

  it("treats LIKE wildcards in authority search as literals", async () => {
    const wildcard = await api(`/api/authority/search?q=${encodeURIComponent("%")}`, {
      wallet: AUTHORITY,
    });
    assert.equal(wildcard.status, 200);
    assert.ok(wildcard.data.results.every((p) => p.addressLine1.includes("%")));
  });

  it("retention purge also clears expired auth records", async () => {
    const purge = await api("/api/admin/retention/purge", { method: "POST", wallet: ADMIN });
    assert.equal(purge.status, 200, JSON.stringify(purge.data));
    assert.equal(typeof purge.data.auth.noncesDeleted, "number");
    assert.equal(typeof purge.data.auth.sessionsDeleted, "number");
  });

  it("maps unknown and malformed references to 4xx instead of 500", async () => {
    const unknown = await api("/api/authority/cases", {
      method: "POST",
      wallet: AUTHORITY,
      body: { propertyId: "00000000-0000-4000-8000-000000000000", note: "missing property" },
    });
    assert.equal(unknown.status, 404, JSON.stringify(unknown.data));

    const malformed = await api("/api/authority/exports/not-a-uuid/download", { wallet: AUTHORITY });
    assert.equal(malformed.status, 400, JSON.stringify(malformed.data));
  });
});
