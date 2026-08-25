const express = require("express");
const { z } = require("zod");
const { query } = require("../db/pool");
const { requireWallet } = require("../middleware/auth");
const { writeAudit } = require("../services/audit");
const { getProperty } = require("./properties");

const router = express.Router();

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
    const prop = await getProperty(body.propertyId);
    if (!prop) return res.status(404).json({ error: "Property not found" });
    if (prop.owner_wallet.toLowerCase() !== req.wallet) {
      return res.status(403).json({ error: "Owner only" });
    }

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
    const prop = await getProperty(body.propertyId);
    if (!prop) return res.status(404).json({ error: "Property not found" });
    if (prop.owner_wallet.toLowerCase() !== req.wallet) {
      return res.status(403).json({ error: "Owner only" });
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

router.post("/disputes", requireWallet, async (req, res, next) => {
  try {
    const body = disputeSchema.parse(req.body);
    const prop = await getProperty(body.propertyId);
    if (!prop) return res.status(404).json({ error: "Property not found" });

    const result = await query(
      `INSERT INTO disputes (property_id, opened_by_wallet, reason) VALUES ($1,$2,$3) RETURNING *`,
      [body.propertyId, req.wallet, body.reason]
    );
    await query(
      `UPDATE properties SET listing_paused = TRUE, updated_at = NOW() WHERE id = $1`,
      [body.propertyId]
    );
    await writeAudit(req.wallet, "dispute.open", "dispute", result.rows[0].id, {});
    res.status(201).json({
      dispute: result.rows[0],
      note: "Open disputes pause/warn listings and appear in the Authority Console.",
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
