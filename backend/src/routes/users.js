const express = require("express");
const { z } = require("zod");
const crypto = require("crypto");
const { query } = require("../db/pool");
const { requireWallet, requireRole } = require("../middleware/auth");
const { writeAudit, enqueueGovJob } = require("../services/audit");

const router = express.Router();

const registerSchema = z.object({
  role: z.enum(["admin", "seller", "buyer", "tenant", "title_officer", "authority_officer"]),
  displayName: z.string().min(1).max(120).optional(),
  kycPayload: z.string().min(1).optional(),
  agencyName: z.string().optional(),
  agencyUnit: z.string().optional(),
  badgeRefPlaceholder: z.string().optional(),
  agencyId: z.string().uuid().optional(),
});

router.post("/register", requireWallet, async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const privilegedRoles = ["admin", "title_officer", "authority_officer"];
    const bootstrapWallet = (process.env.BOOTSTRAP_ADMIN_WALLET || "").toLowerCase();
    const isAdminBootstrap =
      body.role === "admin" &&
      process.env.ALLOW_PRIVILEGED_BOOTSTRAP === "true" &&
      bootstrapWallet &&
      req.wallet === bootstrapWallet;

    if (privilegedRoles.includes(body.role)) {
      if (!isAdminBootstrap) {
        return res.status(403).json({
          error:
            "Privileged roles cannot be self-assigned. An approved administrator must grant this role.",
        });
      }

      const existingAdmin = await query(
        `SELECT 1 FROM users WHERE role = 'admin' AND role_approved = TRUE LIMIT 1`
      );
      if (existingAdmin.rows.length > 0) {
        return res.status(409).json({
          error: "An approved administrator already exists; use the role approval endpoint.",
        });
      }
    }

    const kycHash = body.kycPayload
      ? crypto.createHash("sha256").update(body.kycPayload).digest("hex")
      : null;

    const result = await query(
      `INSERT INTO users (
         wallet_address, role, display_name, kyc_hash,
         agency_name, agency_unit, badge_ref_placeholder, agency_id,
         role_approved, role_approved_by, role_approved_at, role_approval_source
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11)
       ON CONFLICT (wallet_address) DO UPDATE SET
         role = CASE
           WHEN users.role IN ('admin', 'title_officer', 'authority_officer')
             THEN users.role
           ELSE EXCLUDED.role
         END,
         display_name = COALESCE(EXCLUDED.display_name, users.display_name),
         kyc_hash = COALESCE(EXCLUDED.kyc_hash, users.kyc_hash),
         agency_name = COALESCE(EXCLUDED.agency_name, users.agency_name),
         agency_unit = COALESCE(EXCLUDED.agency_unit, users.agency_unit),
         badge_ref_placeholder = COALESCE(EXCLUDED.badge_ref_placeholder, users.badge_ref_placeholder),
         agency_id = COALESCE(EXCLUDED.agency_id, users.agency_id),
         role_approval_source = CASE
           WHEN $10 IS NOT NULL THEN 'bootstrap'
           WHEN users.role IN ('admin', 'title_officer', 'authority_officer')
             THEN users.role_approval_source
           ELSE 'self_signup'
         END,
         role_approved = CASE
           WHEN $10 IS NOT NULL THEN TRUE
           WHEN users.role IN ('admin', 'title_officer', 'authority_officer')
             THEN users.role_approved
           ELSE TRUE
         END,
         role_approved_by = CASE
           WHEN $10 IS NOT NULL THEN $10
           ELSE users.role_approved_by
         END,
         role_approved_at = CASE
           WHEN $10 IS NOT NULL THEN NOW()
           ELSE users.role_approved_at
         END,
         updated_at = NOW()
       RETURNING *`,
      [
        req.wallet,
        body.role,
        body.displayName || null,
        kycHash,
        body.agencyName || null,
        body.agencyUnit || null,
        body.badgeRefPlaceholder || null,
        body.agencyId || null,
        body.role === "admin" ? true : !privilegedRoles.includes(body.role),
        isAdminBootstrap ? req.wallet : null,
        isAdminBootstrap ? "bootstrap" : "self_signup",
      ]
    );

    await enqueueGovJob("ofac_screen_placeholder", { wallet: req.wallet });
    await writeAudit(req.wallet, "user.register", "user", result.rows[0].id, { role: body.role });
    res.status(201).json({
      user: sanitizeUser(result.rows[0]),
      note: privilegedRoles.includes(body.role)
        ? "Administrator bootstrap completed. Future privileged roles require administrator approval."
        : "KYC stores hashes only. No raw SSN/ITIN/DL. OFAC screening is a placeholder stub.",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/roles/:wallet", requireWallet, requireRole("admin"), async (req, res, next) => {
  try {
    const body = z
      .object({
        role: z.enum(["seller", "buyer", "tenant", "title_officer", "authority_officer"]),
        agencyName: z.string().optional(),
        agencyUnit: z.string().optional(),
        agencyId: z.string().uuid().optional(),
      })
      .parse(req.body);
    const wallet = req.params.wallet.toLowerCase();

    const result = await query(
      `UPDATE users
       SET role = $1,
           agency_name = COALESCE($2, agency_name),
           agency_unit = COALESCE($3, agency_unit),
           agency_id = COALESCE($4, agency_id),
           role_approved = TRUE,
           role_approved_by = $5,
           role_approved_at = NOW(),
           role_approval_source = 'administrator',
           updated_at = NOW()
       WHERE LOWER(wallet_address) = $6
       RETURNING *`,
      [
        body.role,
        body.agencyName || null,
        body.agencyUnit || null,
        body.agencyId || null,
        req.wallet,
        wallet,
      ]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "User not found" });
    await writeAudit(req.wallet, "user.role_approve", "user", result.rows[0].id, {
      role: body.role,
    });
    res.json({
      user: sanitizeUser(result.rows[0]),
      note: "Role approved by administrator.",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireWallet, async (req, res, next) => {
  try {
    const result = await query("SELECT * FROM users WHERE LOWER(wallet_address) = $1", [
      req.wallet,
    ]);
    if (!result.rows[0]) return res.status(404).json({ error: "Not registered" });
    res.json({ user: sanitizeUser(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.post("/verify/:wallet", requireWallet, requireRole("admin"), async (req, res, next) => {
  try {
    const wallet = req.params.wallet.toLowerCase();
    const result = await query(
      `UPDATE users SET kyc_verified = TRUE, ofac_screen_placeholder_status = 'simulated_clear', updated_at = NOW()
       WHERE LOWER(wallet_address) = $1 RETURNING *`,
      [wallet]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "User not found" });
    await writeAudit(req.wallet, "user.verify", "user", result.rows[0].id, {});
    res.json({ user: sanitizeUser(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.post("/fraud-risk/:wallet", requireWallet, requireRole("admin", "authority_officer"), async (req, res, next) => {
  try {
    const level = z.enum(["low", "medium", "high"]).parse(req.body.level);
    const wallet = req.params.wallet.toLowerCase();
    const result = await query(
      `UPDATE users SET fraud_risk_level = $1, updated_at = NOW()
       WHERE LOWER(wallet_address) = $2 RETURNING *`,
      [level, wallet]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "User not found" });
    await writeAudit(req.wallet, "user.fraud_risk", "user", result.rows[0].id, { level });
    res.json({ user: sanitizeUser(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

function sanitizeUser(u) {
  return {
    id: u.id,
    walletAddress: u.wallet_address,
    role: u.role,
    displayName: u.display_name,
    kycHash: u.kyc_hash,
    kycVerified: u.kyc_verified,
    fraudRiskLevel: u.fraud_risk_level,
    roleApproved: u.role_approved,
    roleApprovalSource: u.role_approval_source,
    agencyName: u.agency_name,
    agencyUnit: u.agency_unit,
    badgeRefPlaceholder: u.badge_ref_placeholder,
    agencyId: u.agency_id,
    ofacScreenPlaceholderStatus: u.ofac_screen_placeholder_status,
  };
}

module.exports = router;
