const express = require("express");
const { z } = require("zod");
const { query } = require("../db/pool");
const { requireWallet } = require("../middleware/auth");
const { writeAudit } = require("../services/audit");
const {
  PRIVILEGED_ROLES,
  assertPropertyAccess,
  hasApprovedRole,
  loadUser,
} = require("../services/access");

const router = express.Router();

const dealSchema = z.object({
  propertyId: z.string().uuid(),
  buyerWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amountTestPol: z.number().positive(),
  disclaimerAccepted: z.literal(true),
  fraudWarningAcknowledged: z.literal(true),
});

router.post("/", requireWallet, async (req, res, next) => {
  try {
    const body = dealSchema.parse(req.body);
    const { property: prop } = await assertPropertyAccess(req, body.propertyId, {
      roles: [],
      message: "Seller must be property owner",
    });

    const seller = await query(
      `SELECT * FROM users WHERE LOWER(wallet_address) = $1`,
      [req.wallet]
    );
    const warnings = [];
    if (!seller.rows[0]?.kyc_verified) {
      warnings.push("Seller KYC not verified (soft gate).");
    }
    if (seller.rows[0]?.fraud_risk_level && seller.rows[0].fraud_risk_level !== "low") {
      warnings.push(`Seller fraud_risk_level=${seller.rows[0].fraud_risk_level}`);
    }
    if (prop.listing_paused) {
      warnings.push("Listing is paused due to open dispute or review.");
    }
    const openDisputes = await query(
      `SELECT COUNT(*)::int AS c FROM disputes WHERE property_id = $1 AND status = 'open'`,
      [prop.id]
    );
    if (openDisputes.rows[0].c > 0) {
      warnings.push("Open disputes exist — buyer should review Authority Console / diligence pack.");
    }

    const result = await query(
      `INSERT INTO purchase_deals
         (property_id, seller_wallet, buyer_wallet, amount_test_pol, disclaimer_accepted,
          fraud_warning_acknowledged, status)
       VALUES ($1,$2,$3,$4,TRUE,TRUE,'open') RETURNING *`,
      [body.propertyId, req.wallet, body.buyerWallet.toLowerCase(), body.amountTestPol]
    );

    await writeAudit(req.wallet, "deal.open", "purchase_deal", result.rows[0].id, {});

    res.status(201).json({
      deal: result.rows[0],
      warnings,
      reminders: [
        "TESTNET FUNDS, NOT A CLOSING. Zikkaron escrow is not licensed escrow.",
        "Wire-fraud reminder: never send USD wires based solely on in-app messages. Verify closing instructions out-of-band with known parties.",
        "County recording, title, and licensed escrow remain authoritative for real transfers.",
      ],
    });
  } catch (err) {
    next(err);
  }
});

router.get("/property/:propertyId", requireWallet, async (req, res, next) => {
  try {
    const privileged = hasApprovedRole(await loadUser(req), PRIVILEGED_ROLES);
    const result = await query(
      `SELECT * FROM purchase_deals
       WHERE property_id = $1
         AND ($2 OR LOWER(seller_wallet) = $3 OR LOWER(buyer_wallet) = $3)
       ORDER BY created_at DESC`,
      [req.params.propertyId, privileged, req.wallet]
    );
    res.json({ deals: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
