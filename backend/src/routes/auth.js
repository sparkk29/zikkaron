const express = require("express");
const { z } = require("zod");
const {
  createNonce,
  verifySiweAndCreateSession,
  getSessionByToken,
  revokeSession,
  extractBearer,
} = require("../services/siweAuth");
const { writeAudit } = require("../services/audit");

const router = express.Router();

router.get("/nonce", async (req, res, next) => {
  try {
    const address = String(req.query.address || "")
      .trim()
      .toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: "Valid address query param required" });
    }
    const payload = await createNonce(address);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

const verifySchema = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
});

router.post("/verify", async (req, res, next) => {
  try {
    const body = verifySchema.parse(req.body);
    const result = await verifySiweAndCreateSession(body);
    await writeAudit(result.wallet, "auth.siwe_login", "session", result.session.id, {
      method: "siwe",
    });
    res.json({
      token: result.token,
      wallet: result.wallet,
      expiresAt: result.session.expires_at,
      authMethod: "siwe",
      notice:
        "Session proves wallet control via SIWE. Not title. Not an official government system.",
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get("/session", async (req, res, next) => {
  try {
    const token = extractBearer(req);
    const session = await getSessionByToken(token);
    if (!session) return res.status(401).json({ error: "No active session" });
    res.json({
      wallet: session.wallet_address,
      authMethod: session.auth_method,
      expiresAt: session.expires_at,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const token = extractBearer(req);
    const session = await getSessionByToken(token);
    await revokeSession(token);
    if (session) {
      await writeAudit(session.wallet_address, "auth.logout", "session", session.id, {});
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
