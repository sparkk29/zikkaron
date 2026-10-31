const express = require("express");
const { z } = require("zod");
const { query } = require("../db/pool");
const rateLimit = require("express-rate-limit");
const { requireWallet, requireRole } = require("../middleware/auth");
const { writeAudit } = require("../services/audit");
const { assertPropertyAccess, propertyAccessLevel, loadUser } = require("../services/access");
const { getProperty } = require("../services/properties");

const router = express.Router();

const OWNER_ONLY = { roles: [], message: "Owner only" };

const disputeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.DISPUTE_RATE_LIMIT || 5),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.wallet,
  message: { error: "Too many disputes opened from this wallet; try again later" },
});

const occupantSchema = z.object({
  propertyId: z.string().uuid(),
  occupantName: z.string().min(1),
  occupantWallet: z.string().optional(),
  relationship: z.string().optional(),
  leaseCid: z.string().optional(),
});

router.post("/occupants", requireWallet, async (req, res, next) => {
  try {
    const body = occupantSchema.parse(req.body);
    await assertPropertyAccess(req, body.propertyId, OWNER_ONLY);

    const result = await query(
      `INSERT INTO authorized_occupants
         (property_id, occupant_name, occupant_wallet, relationship, lease_cid, created_by_wallet)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        body.propertyId,
        body.occupantName,
        body.occupantWallet?.toLowerCase() || null,
        body.relationship || null,
        body.leaseCid || null,
        req.wallet,
      ]
    );

    await query(
      `UPDATE properties SET occupancy_status = 'authorized_tenant', updated_at = NOW() WHERE id = $1`,
      [body.propertyId]
    );

    await query(
      `INSERT INTO occupancy_events
         (property_id, event_type, actor_wallet, evidence_cid, note)
       VALUES ($1, 'authorized_occupant_added', $2, $3, $4)`,
      [body.propertyId, req.wallet, body.leaseCid || null, `Authorized: ${body.occupantName}`]
    );

    await writeAudit(req.wallet, "occupancy.authorize", "authorized_occupant", result.rows[0].id, {});
    res.status(201).json({ occupant: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

const eventSchema = z.object({
  propertyId: z.string().uuid(),
  eventType: z.enum([
    "unauthorized_occupancy_reported",
    "notice_memorialized",
    "police_called",
    "authority_notified",
    "agency_ack_received",
    "authorized_occupant_added",
    "vacant_secured",
  ]),
  evidenceCid: z.string().optional(),
  evidenceHash: z.string().optional(),
  note: z.string().optional(),
  notLegalServiceAcknowledged: z.boolean().optional(),
  onchainEventId: z.number().int().optional(),
});

router.post("/events", requireWallet, async (req, res, next) => {
  try {
    const body = eventSchema.parse(req.body);
    await assertPropertyAccess(req, body.propertyId, OWNER_ONLY);
    if (body.eventType === "agency_ack_received") {
      return res.status(403).json({
        error: "agency_ack_received is recorded by the Authority Console acknowledgment flow",
      });
    }

    if (body.eventType === "notice_memorialized" && !body.notLegalServiceAcknowledged) {
      return res.status(400).json({
        error: "notLegalServiceAcknowledged required for notice memorials",
        hint: "Notice memorials are not legal service of process.",
      });
    }

    const result = await query(
      `INSERT INTO occupancy_events
         (property_id, event_type, actor_wallet, evidence_cid, evidence_hash, note,
          not_legal_service_acknowledged, onchain_event_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        body.propertyId,
        body.eventType,
        req.wallet,
        body.evidenceCid || null,
        body.evidenceHash || null,
        body.note || null,
        body.notLegalServiceAcknowledged === true,
        body.onchainEventId ?? null,
      ]
    );

    if (body.eventType === "unauthorized_occupancy_reported") {
      await query(
        `UPDATE properties SET occupancy_status = 'unauthorized_suspected', updated_at = NOW() WHERE id = $1`,
        [body.propertyId]
      );
    }

    await writeAudit(req.wallet, "occupancy.event", "occupancy_event", result.rows[0].id, {
      eventType: body.eventType,
    });

    res.status(201).json({
      event: result.rows[0],
      disclaimer:
        body.eventType === "notice_memorialized"
          ? "Memorialized notice is not legal service. Eviction requires lawful process under state law."
          : undefined,
    });
  } catch (err) {
    next(err);
  }
});

const disputeSchema = z.object({
  propertyId: z.string().uuid(),
  reason: z.string().min(3),
});

router.post("/disputes", requireWallet, disputeLimiter, async (req, res, next) => {
  try {
    const body = disputeSchema.parse(req.body);
    const prop = await getProperty(body.propertyId);
    if (!prop) return res.status(404).json({ error: "Property not found" });
    if (!(await loadUser(req))) {
      return res.status(403).json({ error: "Register before opening a dispute" });
    }

    // Owners and approved authorities open disputes directly; anyone else waits for review
    // so a stranger cannot pause a listing on their own.
    const trusted = Boolean(await propertyAccessLevel(req, prop));
    const status = trusted ? "open" : "pending_review";
    const result = await query(
      `INSERT INTO disputes (property_id, opened_by_wallet, reason, status)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [prop.id, req.wallet, body.reason, status]
    );
    if (trusted) {
      await query(
        `UPDATE properties SET listing_paused = TRUE, updated_at = NOW() WHERE id = $1`,
        [prop.id]
      );
    }
    await writeAudit(req.wallet, "dispute.open", "dispute", result.rows[0].id, { status });
    res.status(201).json({
      dispute: result.rows[0],
      note: trusted
        ? "Open disputes pause/warn listings and appear in the Authority Console."
        : "Dispute submitted for administrator / authority review before it affects the listing.",
    });
  } catch (err) {
    next(err);
  }
});

const disputeReviewSchema = z.object({
  status: z.enum(["open", "resolved", "dismissed"]),
  note: z.string().max(1000).optional(),
});

router.patch(
  "/disputes/:disputeId",
  requireWallet,
  requireRole("admin", "authority_officer", "title_officer"),
  async (req, res, next) => {
    try {
      const body = disputeReviewSchema.parse(req.body);
      const result = await query(
        `UPDATE disputes SET status = $1 WHERE id = $2 RETURNING *`,
        [body.status, req.params.disputeId]
      );
      const dispute = result.rows[0];
      if (!dispute) return res.status(404).json({ error: "Dispute not found" });

      const remaining = await query(
        `SELECT COUNT(*)::int AS c FROM disputes WHERE property_id = $1 AND status = 'open'`,
        [dispute.property_id]
      );
      const listingPaused = remaining.rows[0].c > 0;
      await query(`UPDATE properties SET listing_paused = $1, updated_at = NOW() WHERE id = $2`, [
        listingPaused,
        dispute.property_id,
      ]);
      await writeAudit(req.wallet, "dispute.review", "dispute", dispute.id, {
        status: body.status,
        note: body.note,
      });
      res.json({ dispute, listingPaused });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
