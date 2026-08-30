const crypto = require("crypto");
const express = require("express");
const { z } = require("zod");
const { query } = require("../db/pool");
const { requireWallet } = require("../middleware/auth");
const { writeAudit } = require("../services/audit");

const router = express.Router();

const createSchema = z.object({
  propertyId: z.string().uuid(),
  purpose: z.string().min(3).max(240),
  recipientLabel: z.string().max(120).optional(),
  expiresInHours: z.number().positive().max(168).default(72),
});

router.post("/", requireWallet, async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const property = await query(`SELECT id, owner_wallet FROM properties WHERE id = $1`, [
      body.propertyId,
    ]);
    if (!property.rows[0]) return res.status(404).json({ error: "Property not found" });
    if (property.rows[0].owner_wallet.toLowerCase() !== req.wallet) {
      return res.status(403).json({ error: "Only the property owner may create a share link" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000);
    const result = await query(
      `INSERT INTO share_links
         (property_id, created_by_wallet, token_hash, purpose, recipient_label, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, property_id, purpose, recipient_label, expires_at, created_at`,
      [
        body.propertyId,
        req.wallet,
        tokenHash,
        body.purpose,
        body.recipientLabel || null,
        expiresAt,
      ]
    );
    await writeAudit(req.wallet, "share.create", "share_link", result.rows[0].id, {
      propertyId: body.propertyId,
      purpose: body.purpose,
      expiresAt,
    });
    res.status(201).json({
      share: {
        ...result.rows[0],
        url: `/api/shares/${token}`,
      },
      warning: "Anyone with this URL can view the shared memorial until it expires or is revoked.",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/revoke", requireWallet, async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE share_links SET revoked_at = NOW()
       WHERE id = $1 AND LOWER(created_by_wallet) = $2 AND revoked_at IS NULL
       RETURNING id, revoked_at`,
      [req.params.id, req.wallet]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Active share link not found" });
    await writeAudit(req.wallet, "share.revoke", "share_link", req.params.id, {});
    res.json({ share: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get("/:token", async (req, res, next) => {
  try {
    const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
    const link = await query(
      `SELECT sl.*, p.address_line1, p.city, p.state, p.zip, p.county, p.apn,
              p.occupancy_status, p.listing_paused, p.owner_wallet
       FROM share_links sl
       JOIN properties p ON p.id = sl.property_id
       WHERE sl.token_hash = $1 AND sl.revoked_at IS NULL AND sl.expires_at > NOW()`,
      [tokenHash]
    );
    if (!link.rows[0]) return res.status(404).json({ error: "Share link expired or revoked" });
    const share = link.rows[0];
    const [occupants, events, documents] = await Promise.all([
      query(
        `SELECT occupant_name, occupant_wallet, relationship, lease_cid, active, created_at
         FROM authorized_occupants WHERE property_id = $1 AND active = TRUE ORDER BY created_at`,
        [share.property_id]
      ),
      query(
        `SELECT event_type, evidence_cid, evidence_hash, note, created_at
         FROM occupancy_events WHERE property_id = $1 ORDER BY created_at ASC`,
        [share.property_id]
      ),
      query(
        `SELECT doc_type, cid, content_hash, filename, mime_type, byte_size, scan_status, created_at
         FROM documents WHERE property_id = $1 ORDER BY created_at DESC`,
        [share.property_id]
      ),
    ]);
    await query(
      `UPDATE share_links SET access_count = access_count + 1, last_accessed_at = NOW() WHERE id = $1`,
      [share.id]
    );
    await writeAudit(null, "share.access", "share_link", share.id, {
      purpose: share.purpose,
    });
    res.json({
      share: {
        id: share.id,
        purpose: share.purpose,
        recipientLabel: share.recipient_label,
        expiresAt: share.expires_at,
      },
      property: {
        addressLine1: share.address_line1,
        city: share.city,
        state: share.state,
        zip: share.zip,
        county: share.county,
        apn: share.apn,
        occupancyStatus: share.occupancy_status,
        listingPaused: share.listing_paused,
        ownerWallet: share.owner_wallet,
      },
      authorizedOccupants: occupants.rows,
      incidentTimeline: events.rows,
      documents: documents.rows,
      notice:
        "Explicit owner share link. Assistive memorial data only — not an official government record or legal filing.",
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
