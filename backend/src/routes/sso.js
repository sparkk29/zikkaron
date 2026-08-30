const express = require("express");
const { z } = require("zod");
const {
  listSsoAgencies,
  startOidcStub,
  startSamlStub,
  simulateAgencyLogin,
} = require("../services/agencySso");
const { requireWallet } = require("../middleware/auth");

const router = express.Router();

router.get("/agencies", async (_req, res, next) => {
  try {
    const agencies = await listSsoAgencies();
    res.json({
      agencies,
      notice:
        "SSO configs are placeholders for MoU pilots. Not live government IdP integrations.",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/oidc/start", async (req, res, next) => {
  try {
    const agencyId = z.string().uuid().parse(req.body.agencyId);
    const result = await startOidcStub(agencyId);
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get("/oidc/callback", async (_req, res) => {
  res.status(501).json({
    error: "OIDC callback not implemented",
    notice:
      "Live authorization-code exchange requires agency MoU, client secret, and CJIS/privacy review.",
  });
});

router.post("/saml/start", async (req, res, next) => {
  try {
    const agencyId = z.string().uuid().parse(req.body.agencyId);
    const result = await startSamlStub(agencyId);
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get("/saml/metadata", async (_req, res) => {
  res.type("application/xml").send(`<?xml version="1.0"?>
<!-- Zikkaron SAML SP metadata PLACEHOLDER — not for production federation -->
<EntityDescriptor entityID="https://zikkaron.example/sp-placeholder">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="http://localhost:4000/api/auth/sso/saml/acs"
      index="0"/>
  </SPSSODescriptor>
</EntityDescriptor>
`);
});

router.post("/saml/acs", async (_req, res) => {
  res.status(501).json({
    error: "SAML ACS not implemented",
    notice: "Assertion consumer service deferred until agency certificate exchange.",
  });
});

const simulateSchema = z.object({
  agencyId: z.string().uuid(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  subjectPlaceholder: z.string().max(120).optional(),
  emailPlaceholder: z.string().email().optional(),
  displayName: z.string().max(120).optional(),
  protocol: z.enum(["simulated", "oidc", "saml"]).optional(),
});

router.post("/simulate", requireWallet, async (req, res, next) => {
  try {
    if (process.env.ALLOW_SIMULATED_SSO !== "true") {
      return res.status(404).json({
        error: "Simulated SSO is disabled",
        notice: "Enable ALLOW_SIMULATED_SSO only in a local/demo environment.",
      });
    }
    const body = simulateSchema.parse(req.body);
    if (body.walletAddress.toLowerCase() !== req.wallet) {
      return res.status(403).json({
        error: "walletAddress must match the authenticated session",
      });
    }
    const result = await simulateAgencyLogin(body);
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
