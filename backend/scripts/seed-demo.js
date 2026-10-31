/**
 * Seed a local Zikkaron API with demo data for walkthroughs and screenshots.
 *
 * Requires a running local API started with demo-only flags:
 *   ALLOW_HEADER_AUTH=true ALLOW_PRIVILEGED_BOOTSTRAP=true \
 *   BOOTSTRAP_ADMIN_WALLET=<printed admin address> npm run dev -w zikkaron-backend
 *
 * Demo wallets are derived from public strings. Never fund them or use them outside local demos.
 */
const { Wallet, id } = require("ethers");

const BASE = process.env.API_URL || "http://127.0.0.1:4000";

const demoWallet = (label) => new Wallet(id(`zikkaron-demo-${label}`));
const WALLETS = {
  admin: demoWallet("admin"),
  owner: demoWallet("owner"),
  officer: demoWallet("officer"),
  buyer: demoWallet("buyer"),
  neighbor: demoWallet("neighbor"),
};

async function api(path, { method = "GET", as, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(as ? { "x-wallet-address": WALLETS[as].address.toLowerCase() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function ensureRegistered(as, body) {
  const me = await fetch(`${BASE}/api/users/me`, {
    headers: { "x-wallet-address": WALLETS[as].address.toLowerCase() },
  });
  if (me.status === 200) return (await me.json()).user;
  return (await api("/api/users/register", { method: "POST", as, body })).user;
}

const PROPERTIES = [
  {
    addressLine1: "1420 E Saguaro Vista Dr",
    city: "Phoenix",
    state: "AZ",
    zip: "85016",
    county: "Maricopa",
    apn: "163-27-041",
    deedCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    legalDescription: "Lot 41, Saguaro Vista Unit 2, per Book 512 of Maps, page 18",
    occupancyStatus: "vacant_secured",
    listPriceUsd: 615000,
  },
  {
    addressLine1: "88 W Juniper Ln",
    city: "Mesa",
    state: "AZ",
    zip: "85201",
    county: "Maricopa",
    apn: "135-44-118",
    deedCid: "bafybeihkoviema7g3gxyt6la7vd5ho32ictqbilu3wnlo3rs7ewhnp7lly",
    occupancyStatus: "authorized_tenant",
    listPriceUsd: 389000,
  },
  {
    addressLine1: "5710 N Cascabel Rd",
    city: "Tucson",
    state: "AZ",
    zip: "85718",
    county: "Pima",
    apn: "108-12-0330",
    deedCid: "bafybeie5gq4jxvzmsym6hjlwxej4rwdoxt7wadqvmmwbqi7r27fclha2va",
    occupancyStatus: "owner_occupied",
    listPriceUsd: 742000,
  },
];

async function main() {
  const health = await api("/health");
  if (!health.ok) throw new Error("API is not healthy");

  await ensureRegistered("admin", { role: "admin", displayName: "Demo Administrator" });
  await ensureRegistered("owner", {
    role: "seller",
    displayName: "Dana Whitfield",
    kycPayload: "demo-owner-kyc",
  });
  await ensureRegistered("buyer", { role: "buyer", displayName: "Marcus Lee", kycPayload: "demo-buyer-kyc" });
  await ensureRegistered("neighbor", { role: "buyer", displayName: "R. Alvarez" });
  await ensureRegistered("officer", { role: "seller", displayName: "Deputy J. Ortiz" });

  await api(`/api/users/verify/${WALLETS.owner.address.toLowerCase()}`, { method: "POST", as: "admin" });
  const { agencies } = await api("/api/authority/agencies", { as: "admin" });
  const sheriff = agencies.find((a) => a.type === "sheriff") || agencies[0];
  await api(`/api/users/roles/${WALLETS.officer.address.toLowerCase()}`, {
    method: "POST",
    as: "admin",
    body: {
      role: "authority_officer",
      agencyId: sheriff.id,
      agencyName: sheriff.name,
      agencyUnit: "Property Crimes Unit",
    },
  });

  const existing = await api("/api/properties?limit=100", { as: "owner" });
  const byApn = new Map(existing.properties.map((p) => [p.apn, p]));
  const created = [];
  for (const property of PROPERTIES) {
    if (byApn.has(property.apn)) {
      created.push(byApn.get(property.apn));
      continue;
    }
    const { property: row } = await api("/api/properties", {
      method: "POST",
      as: "owner",
      body: { ...property, disclaimerAccepted: true },
    });
    created.push(row);
  }
  const [vista, juniper] = created;

  if (!byApn.has(PROPERTIES[0].apn)) {
    await api("/api/occupancy/events", {
      method: "POST",
      as: "owner",
      body: {
        propertyId: vista.id,
        eventType: "vacant_secured",
        note: "Locks changed and windows secured after estate closing.",
      },
    });
    await api("/api/occupancy/events", {
      method: "POST",
      as: "owner",
      body: {
        propertyId: vista.id,
        eventType: "unauthorized_occupancy_reported",
        evidenceCid: "bafybeibwzifw52ttrkqlikfzext5akxu7lz4xiwjgwzmqcpdzmp3n5vnbe",
        evidenceHash: "9f2c1e7a4b0d8c3e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0",
        note: "Neighbor reported lights and two vehicles overnight; side gate lock cut.",
      },
    });
    await api("/api/occupancy/events", {
      method: "POST",
      as: "owner",
      body: {
        propertyId: vista.id,
        eventType: "notice_memorialized",
        note: "Notice posted at front door — memorial only, not service of process.",
        notLegalServiceAcknowledged: true,
      },
    });
    await api("/api/occupancy/events", {
      method: "POST",
      as: "owner",
      body: {
        propertyId: vista.id,
        eventType: "authority_notified",
        note: "Owner contacted Maricopa County Sheriff non-emergency line; report pending.",
      },
    });
    await api("/api/documents", {
      method: "POST",
      as: "owner",
      body: {
        propertyId: vista.id,
        docType: "incident_evidence",
        filename: "gate-lock-photo-notes.txt",
        mimeType: "text/plain",
        contentBase64: Buffer.from(
          "Side gate padlock found cut at 07:40. Photos retained by owner."
        ).toString("base64"),
      },
    });
    await api("/api/occupancy/disputes", {
      method: "POST",
      as: "neighbor",
      body: { propertyId: vista.id, reason: "Occupant claims a verbal lease from a prior relative." },
    });

    await api("/api/occupancy/occupants", {
      method: "POST",
      as: "owner",
      body: {
        propertyId: juniper.id,
        occupantName: "Priya Raman",
        relationship: "authorized_tenant",
        leaseCid: "bafybeif7ztnhq65lumvvtr4ekcwd2ifwgm3awq4zfr3srh462rwyinlb4y",
      },
    });
    await api("/api/deals", {
      method: "POST",
      as: "owner",
      body: {
        propertyId: juniper.id,
        buyerWallet: WALLETS.buyer.address,
        amountTestPol: 2.5,
        disclaimerAccepted: true,
        fraudWarningAcknowledged: true,
      },
    });
    await api("/api/authority/cases", {
      method: "POST",
      as: "officer",
      body: { propertyId: vista.id, priority: "high", note: "Possible unauthorized entry; verify occupant claim." },
    });
  }

  console.log(
    JSON.stringify(
      {
        wallets: Object.fromEntries(
          Object.entries(WALLETS).map(([label, wallet]) => [label, wallet.address.toLowerCase()])
        ),
        properties: created.map((p) => ({ id: p.id, apn: p.apn, addressLine1: p.addressLine1 })),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
