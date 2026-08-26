const express = require("express");
const { z } = require("zod");
const { query } = require("../db/pool");
const { requireWallet, requireRole } = require("../middleware/auth");
const { writeAudit, enqueueGovJob } = require("../services/audit");

const router = express.Router();

const propertySchema = z.object({
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().min(5).max(10),
  county: z.string().min(1),
  apn: z.string().min(1),
  legalDescription: z.string().optional(),
  deedCid: z.string().optional(),
  occupancyStatus: z.enum([
    "vacant_secured",
    "owner_occupied",
    "authorized_tenant",
    "disputed",
    "unauthorized_suspected",
  ]),
  listPriceUsd: z.number().nonnegative().optional(),
  disclaimerAccepted: z.literal(true),
  onchainPropertyId: z.number().int().optional(),
});

router.get("/", async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT p.*, u.fraud_risk_level AS owner_fraud_risk, u.kyc_verified AS owner_kyc_verified
       FROM properties p
       LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(p.owner_wallet)
       ORDER BY p.created_at DESC`
    );
    res.json({ properties: result.rows.map(mapProperty) });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const prop = await getProperty(req.params.id);
    if (!prop) return res.status(404).json({ error: "Property not found" });

    const [occupants, events, disputes, legal] = await Promise.all([
      query(
        `SELECT * FROM authorized_occupants WHERE property_id = $1 AND active = TRUE ORDER BY created_at`,
        [prop.id]
      ),
      query(
        `SELECT * FROM occupancy_events WHERE property_id = $1 ORDER BY created_at DESC`,
        [prop.id]
      ),
      query(`SELECT * FROM disputes WHERE property_id = $1 ORDER BY created_at DESC`, [prop.id]),
      query(`SELECT * FROM legal_records WHERE property_id = $1 ORDER BY created_at DESC`, [
        prop.id,
      ]),
    ]);

    res.json({
      property: mapProperty(prop),
      authorizedOccupants: occupants.rows,
      occupancyEvents: events.rows,
      disputes: disputes.rows,
      legalRecords: legal.rows,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireWallet, async (req, res, next) => {
  try {
    const body = propertySchema.parse(req.body);
    const result = await query(
      `INSERT INTO properties (
         owner_wallet, address_line1, address_line2, city, state, zip, county, apn,
         legal_description, deed_cid, occupancy_status, list_price_usd, disclaimer_accepted,
         onchain_property_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        req.wallet,
        body.addressLine1,
        body.addressLine2 || null,
        body.city,
        body.state.toUpperCase(),
        body.zip,
        body.county,
        body.apn,
        body.legalDescription || null,
        body.deedCid || null,
        body.occupancyStatus,
        body.listPriceUsd ?? null,
        true,
        body.onchainPropertyId ?? null,
      ]
    );

    const property = result.rows[0];

    if (body.deedCid) {
      await query(
        `INSERT INTO legal_records (property_id, document_cid, is_official_county_record)
         VALUES ($1, $2, FALSE)`,
        [property.id, body.deedCid]
      );
      await enqueueGovJob("county_record_lookup", {
        propertyId: property.id,
        deedCid: body.deedCid,
        apn: body.apn,
        state: body.state.toUpperCase(),
        county: body.county,
      });
      await enqueueGovJob("assessor_apn_lookup", {
        propertyId: property.id,
        apn: body.apn,
        state: body.state.toUpperCase(),
        county: body.county,
        addressLine1: body.addressLine1,
        zip: body.zip,
      });

      if (process.env.GOV_LOOKUP_AUTO_PROCESS !== "false") {
        const { processQueuedLookupJobs } = require("../services/lookupService");
        await processQueuedLookupJobs(10);
      }
    }

    await writeAudit(req.wallet, "property.create", "property", property.id, {
      apn: body.apn,
    });
    res.status(201).json({
      property: mapProperty(property),
      note: "Memorial record created. Not legal title. County recording remains authoritative.",
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/occupancy", requireWallet, async (req, res, next) => {
  try {
    const status = z
      .enum([
        "vacant_secured",
        "owner_occupied",
        "authorized_tenant",
        "disputed",
        "unauthorized_suspected",
      ])
      .parse(req.body.occupancyStatus);
    const prop = await getProperty(req.params.id);
    if (!prop) return res.status(404).json({ error: "Property not found" });
    if (prop.owner_wallet.toLowerCase() !== req.wallet) {
      return res.status(403).json({ error: "Owner only" });
    }
    const result = await query(
      `UPDATE properties SET occupancy_status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, prop.id]
    );
    await writeAudit(req.wallet, "property.occupancy", "property", prop.id, { status });
    res.json({ property: mapProperty(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

const legalVerifySchema = z.object({
  legalRecordId: z.string().uuid(),
  instrumentNumberPlaceholder: z.string().optional(),
  bookPagePlaceholder: z.string().optional(),
  matchConfirmed: z.boolean(),
});

router.post(
  "/:id/legal/simulate-verify",
  requireWallet,
  requireRole("title_officer", "authority_officer", "admin"),
  async (req, res, next) => {
    try {
      const body = legalVerifySchema.parse(req.body);
      const prop = await getProperty(req.params.id);
      if (!prop) return res.status(404).json({ error: "Property not found" });

      if (!body.matchConfirmed) {
        const dispute = await query(
          `INSERT INTO disputes (property_id, opened_by_wallet, reason, status)
           VALUES ($1, $2, $3, 'open') RETURNING *`,
          [
            prop.id,
            req.wallet,
            "Simulated county instrument mismatch — human review required",
          ]
        );
        await query(
          `UPDATE properties SET listing_paused = TRUE, occupancy_status = 'disputed', updated_at = NOW()
           WHERE id = $1`,
          [prop.id]
        );
        await writeAudit(req.wallet, "legal.mismatch_dispute", "dispute", dispute.rows[0].id, {});
        return res.json({
          verified: false,
          dispute: dispute.rows[0],
          note: "Mismatch opened dispute. Listing paused. Human review required.",
        });
      }

      const result = await query(
        `UPDATE legal_records SET
           is_official_county_record = TRUE,
           instrument_number_placeholder = COALESCE($1, instrument_number_placeholder),
           book_page_placeholder = COALESCE($2, book_page_placeholder),
           verified_by_agency_id = $3,
           verified_by_wallet = $4,
           verified_at = NOW()
         WHERE id = $5 AND property_id = $6
         RETURNING *`,
        [
          body.instrumentNumberPlaceholder || null,
          body.bookPagePlaceholder || null,
          req.user.agency_id || null,
          req.wallet,
          body.legalRecordId,
          prop.id,
        ]
      );
      if (!result.rows[0]) return res.status(404).json({ error: "Legal record not found" });
      await writeAudit(req.wallet, "legal.simulate_verify", "legal_record", result.rows[0].id, {});
      res.json({
        legalRecord: result.rows[0],
        note: "Simulated verify only — not a live county API confirmation.",
      });
    } catch (err) {
      next(err);
    }
  }
);

async function getProperty(id) {
  const result = await query(
    `SELECT p.*, u.fraud_risk_level AS owner_fraud_risk, u.kyc_verified AS owner_kyc_verified
     FROM properties p
     LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(p.owner_wallet)
     WHERE p.id::text = $1 OR p.apn = $1`,
    [id]
  );
  return result.rows[0] || null;
}

function mapProperty(p) {
  return {
    id: p.id,
    onchainPropertyId: p.onchain_property_id,
    ownerWallet: p.owner_wallet,
    addressLine1: p.address_line1,
    addressLine2: p.address_line2,
    city: p.city,
    state: p.state,
    zip: p.zip,
    county: p.county,
    apn: p.apn,
    legalDescription: p.legal_description,
    deedCid: p.deed_cid,
    occupancyStatus: p.occupancy_status,
    listingPaused: p.listing_paused,
    listPriceUsd: p.list_price_usd,
    ownerFraudRisk: p.owner_fraud_risk,
    ownerKycVerified: p.owner_kyc_verified,
    createdAt: p.created_at,
  };
}

module.exports = router;
module.exports.getProperty = getProperty;
module.exports.mapProperty = mapProperty;
