const express = require("express");
const crypto = require("crypto");
const { z } = require("zod");
const { query } = require("../db/pool");
const { requireWallet, requireRole } = require("../middleware/auth");
const { writeAudit, enqueueGovJob } = require("../services/audit");
const { mapProperty } = require("./properties");

const router = express.Router();

/**
 * Authority Console APIs — read-only case support + logged exports.
 * Demo access control only. Not CJIS / FedRAMP / accredited LE access.
 */

router.get("/agencies", requireWallet, requireRole("authority_officer", "admin"), async (_req, res, next) => {
  try {
    const result = await query(`SELECT * FROM agencies ORDER BY name`);
    res.json({ agencies: result.rows });
  } catch (err) {
    next(err);
  }
});

router.get("/search", requireWallet, requireRole("authority_officer", "admin"), async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "q required (address, APN, or property id)" });

    const result = await query(
      `SELECT p.*, u.fraud_risk_level AS owner_fraud_risk, u.kyc_verified AS owner_kyc_verified,
              u.wallet_address AS owner_wallet_join, u.display_name AS owner_display_name
       FROM properties p
       LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(p.owner_wallet)
       WHERE p.id::text = $1
          OR LOWER(p.apn) = LOWER($1)
          OR LOWER(p.address_line1) LIKE LOWER($2)
          OR LOWER(p.city || ' ' || p.state || ' ' || p.zip) LIKE LOWER($2)
       ORDER BY p.created_at DESC
       LIMIT 25`,
      [q, `%${q}%`]
    );

    res.json({
      results: result.rows.map(mapProperty),
      notice:
        "Designed for collaboration with government and law enforcement. Not an official government system.",
    });
  } catch (err) {
    next(err);
  }
});

router.get(
  "/case/:propertyId",
  requireWallet,
  requireRole("authority_officer", "admin"),
  async (req, res, next) => {
    try {
      const casePack = await buildCasePack(req.params.propertyId);
      if (!casePack) return res.status(404).json({ error: "Property not found" });
      res.json({
        ...casePack,
        notice:
          "Read-only Authority Console view. Assistive memorial data — not an official government record.",
      });
    } catch (err) {
      next(err);
    }
  }
);

const exportSchema = z.object({
  propertyId: z.string().uuid(),
  agencyId: z.string().uuid().optional(),
  caseRefPlaceholder: z.string().max(120).optional(),
  authorityUseAcknowledged: z.literal(true),
  redactOwnerWallet: z.boolean().default(false),
  redactEvidence: z.boolean().default(false),
});

router.post(
  "/exports",
  requireWallet,
  requireRole("authority_officer", "admin"),
  async (req, res, next) => {
    try {
      const body = exportSchema.parse(req.body);
      const casePack = await buildCasePack(body.propertyId);
      if (!casePack) return res.status(404).json({ error: "Property not found" });

      const redactedPack = redactCasePack(casePack, body);
      const snapshotWithoutManifest = {
        ...redactedPack,
        exportedToRole: "authority_officer",
        agencyName: req.user.agency_name,
        caseRefPlaceholder: body.caseRefPlaceholder || null,
        exportedAt: new Date().toISOString(),
        watermark: "Zikkaron memorial export — assistive; not an official government record.",
      };
      const manifestHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(snapshotWithoutManifest))
        .digest("hex");
      const snapshot = { ...snapshotWithoutManifest, manifestHash };

      const result = await query(
        `INSERT INTO authority_case_exports
           (property_id, agency_id, actor_wallet, case_ref_placeholder,
            authority_use_acknowledged, payload_snapshot, manifest_hash, format)
         VALUES ($1,$2,$3,$4,TRUE,$5,$6,'json') RETURNING *`,
        [
          body.propertyId,
          body.agencyId || req.user.agency_id || null,
          req.wallet,
          body.caseRefPlaceholder || null,
          snapshot,
          manifestHash,
        ]
      );

      await enqueueGovJob("le_case_share_placeholder", {
        exportId: result.rows[0].id,
        propertyId: body.propertyId,
        caseRef: body.caseRefPlaceholder,
      });

      await writeAudit(req.wallet, "authority.export", "authority_case_export", result.rows[0].id, {
        propertyId: body.propertyId,
      });

      res.status(201).json({
        export: {
          id: result.rows[0].id,
          createdAt: result.rows[0].created_at,
          watermark: result.rows[0].watermark,
          caseRefPlaceholder: result.rows[0].case_ref_placeholder,
          manifestHash: result.rows[0].manifest_hash,
          format: result.rows[0].format,
        },
        pack: snapshot,
        note: "For official investigation / case support; handle under agency policy.",
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/exports/:exportId/download",
  requireWallet,
  requireRole("authority_officer", "admin"),
  async (req, res, next) => {
    try {
      const result = await query(
        `SELECT id, property_id, case_ref_placeholder, payload_snapshot,
                manifest_hash, watermark, created_at
         FROM authority_case_exports WHERE id = $1`,
        [req.params.exportId]
      );
      if (!result.rows[0]) return res.status(404).json({ error: "Export not found" });
      const exportRow = result.rows[0];
      await writeAudit(req.wallet, "authority.export_download", "authority_case_export", exportRow.id, {});
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="zikkaron-case-pack-${exportRow.id}.json"`
      );
      res.json({
        exportId: exportRow.id,
        propertyId: exportRow.property_id,
        caseRefPlaceholder: exportRow.case_ref_placeholder,
        manifestHash: exportRow.manifest_hash,
        watermark: exportRow.watermark,
        createdAt: exportRow.created_at,
        pack: exportRow.payload_snapshot,
      });
    } catch (err) {
      next(err);
    }
  }
);

const ackSchema = z.object({
  propertyId: z.string().uuid(),
  exportId: z.string().uuid().optional(),
  agencyId: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
});

router.post(
  "/acknowledge",
  requireWallet,
  requireRole("authority_officer", "admin"),
  async (req, res, next) => {
    try {
      const body = ackSchema.parse(req.body);
      const result = await query(
        `INSERT INTO authority_acknowledgements
           (export_id, property_id, agency_id, actor_wallet, note)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          body.exportId || null,
          body.propertyId,
          body.agencyId || req.user.agency_id || null,
          req.wallet,
          body.note || "Simulated agency acknowledgment of receipt",
        ]
      );

      await query(
        `INSERT INTO occupancy_events
           (property_id, event_type, actor_wallet, note)
         VALUES ($1, 'agency_ack_received', $2, $3)`,
        [body.propertyId, req.wallet, body.note || "Simulated agency acknowledgment"]
      );

      await writeAudit(
        req.wallet,
        "authority.acknowledge",
        "authority_acknowledgement",
        result.rows[0].id,
        {}
      );

      res.status(201).json({
        acknowledgement: result.rows[0],
        note: "Simulated acknowledgment only. Does not create a warrant, recording, or court order.",
      });
    } catch (err) {
      next(err);
    }
  }
);

async function buildCasePack(propertyId) {
  const propResult = await query(
    `SELECT p.*, u.fraud_risk_level AS owner_fraud_risk, u.kyc_verified AS owner_kyc_verified,
            u.kyc_hash AS owner_kyc_hash, u.display_name AS owner_display_name, u.role AS owner_role
     FROM properties p
     LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(p.owner_wallet)
     WHERE p.id::text = $1`,
    [propertyId]
  );
  const prop = propResult.rows[0];
  if (!prop) return null;

  const [occupants, events, disputes, legal, exports_, documents] = await Promise.all([
    query(
      `SELECT id, occupant_name, occupant_wallet, relationship, lease_cid, active, created_at
       FROM authorized_occupants WHERE property_id = $1 ORDER BY created_at`,
      [prop.id]
    ),
    query(
      `SELECT id, event_type, actor_wallet, evidence_cid, evidence_hash, note, created_at
       FROM occupancy_events WHERE property_id = $1 ORDER BY created_at ASC`,
      [prop.id]
    ),
    query(
      `SELECT id, reason, status, opened_by_wallet, created_at FROM disputes
       WHERE property_id = $1 ORDER BY created_at DESC`,
      [prop.id]
    ),
    query(
      `SELECT id, instrument_number_placeholder, book_page_placeholder, document_cid,
              is_official_county_record, verified_at, verified_by_wallet
       FROM legal_records WHERE property_id = $1`,
      [prop.id]
    ),
    query(
      `SELECT id, case_ref_placeholder, created_at, actor_wallet FROM authority_case_exports
       WHERE property_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [prop.id]
    ),
    query(
      `SELECT id, doc_type, cid, content_hash, filename, mime_type, byte_size,
              scan_status, storage_mode, created_at
       FROM documents WHERE property_id = $1 ORDER BY created_at DESC`,
      [prop.id]
    ),
  ]);

  return {
    property: mapProperty(prop),
    owner: {
      wallet: prop.owner_wallet,
      displayName: prop.owner_display_name,
      kycVerified: prop.owner_kyc_verified,
      kycHash: prop.owner_kyc_hash,
      fraudRiskLevel: prop.owner_fraud_risk,
    },
    authorizedOccupants: occupants.rows,
    openDisputes: disputes.rows.filter((d) => d.status === "open"),
    disputes: disputes.rows,
    incidentTimeline: events.rows,
    legalRecordPlaceholders: legal.rows,
    priorExports: exports_.rows,
    documents: documents.rows,
  };
}

function redactCasePack(pack, options) {
  const redacted = JSON.parse(JSON.stringify(pack));
  if (options.redactOwnerWallet) {
    redacted.owner.wallet = "[REDACTED]";
    redacted.property.ownerWallet = "[REDACTED]";
    redacted.incidentTimeline = redacted.incidentTimeline.map((event) => ({
      ...event,
      actor_wallet: "[REDACTED]",
    }));
  }
  if (options.redactEvidence) {
    redacted.incidentTimeline = redacted.incidentTimeline.map((event) => ({
      ...event,
      evidence_cid: null,
      evidence_hash: null,
    }));
    redacted.documents = redacted.documents.map((document) => ({
      ...document,
      cid: null,
      content_hash: null,
    }));
  }
  return redacted;
}

module.exports = router;
module.exports.buildCasePack = buildCasePack;
