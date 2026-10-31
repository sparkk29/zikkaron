const express = require("express");
const { z } = require("zod");
const { query } = require("../db/pool");
const { requireWallet, optionalWallet, requireRole } = require("../middleware/auth");
const { writeAudit, enqueueGovJob } = require("../services/audit");
const { getProperty, mapProperty, mapPublicProperty } = require("../services/properties");
const {
  PRIVILEGED_ROLES,
  assertPropertyAccess,
  propertyAccessLevel,
  hasApprovedRole,
  isOwner,
  loadUser,
} = require("../services/access");

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

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get("/", optionalWallet, async (req, res, next) => {
  try {
    const { limit, offset } = listQuerySchema.parse(req.query);
    const result = await query(
      `SELECT p.*, u.fraud_risk_level AS owner_fraud_risk, u.kyc_verified AS owner_kyc_verified
       FROM properties p
       LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(p.owner_wallet)
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const privileged = hasApprovedRole(await loadUser(req), PRIVILEGED_ROLES);
    res.json({
      properties: result.rows.map((p) =>
        privileged || isOwner(req, p) ? mapProperty(p) : mapPublicProperty(p)
      ),
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", optionalWallet, async (req, res, next) => {
  try {
    const prop = await getProperty(req.params.id);
    if (!prop) return res.status(404).json({ error: "Property not found" });

    const access = await propertyAccessLevel(req, prop);
    if (!access) {
      const openDisputes = await query(
        `SELECT COUNT(*)::int AS c FROM disputes WHERE property_id = $1 AND status = 'open'`,
        [prop.id]
      );
      return res.json({
        access: "public",
        property: mapPublicProperty(prop),
        openDisputeCount: openDisputes.rows[0].c,
        notice:
          "Public memorial view. Occupants, timeline, disputes, and legal records are limited to the owner and approved authorities.",
      });
    }

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
      access,
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
    const { property: prop } = await assertPropertyAccess(req, req.params.id, {
      roles: [],
      message: "Owner only",
    });
    const openDisputes = await query(
      `SELECT COUNT(*)::int AS c FROM disputes WHERE property_id = $1 AND status = 'open'`,
      [prop.id]
    );
    if (openDisputes.rows[0].c > 0) {
      return res.status(409).json({
        error: "Open disputes must be resolved by an administrator or authority before changing occupancy status",
      });
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

module.exports = router;
module.exports.getProperty = getProperty;
module.exports.mapProperty = mapProperty;
