const express = require("express");
const { z } = require("zod");
const { requireWallet, requireRole } = require("../middleware/auth");
const {
  lookupForProperty,
  listLookupsForProperty,
  processQueuedLookupJobs,
  runCountyRecordLookup,
  runAssessorApnLookup,
} = require("../services/lookupService");
const { getLookupAdapter } = require("../services/lookupAdapters");

const router = express.Router();

router.get("/adapter", (_req, res) => {
  res.json({
    adapter: getLookupAdapter().name,
    mode: process.env.GOV_LOOKUP_ADAPTER || "simulated",
    notice:
      "Pluggable county/assessor lookup adapters. Default is simulated; set GOV_LOOKUP_ADAPTER=http for partner middleware URLs.",
  });
});

router.post(
  "/run/:propertyId",
  requireWallet,
  requireRole("admin", "title_officer", "authority_officer"),
  async (req, res, next) => {
    try {
      const out = await lookupForProperty(req.params.propertyId, req.wallet);
      res.json(out);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      next(err);
    }
  }
);

router.get(
  "/property/:propertyId",
  requireWallet,
  requireRole("admin", "title_officer", "authority_officer", "seller"),
  async (req, res, next) => {
    try {
      const rows = await listLookupsForProperty(req.params.propertyId);
      res.json({ lookups: rows });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/process-queue",
  requireWallet,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const limit = Number(req.body?.limit || 20);
      const processed = await processQueuedLookupJobs(limit);
      res.json({ processed, adapter: getLookupAdapter().name });
    } catch (err) {
      next(err);
    }
  }
);

const adHocSchema = z.object({
  lookupType: z.enum(["county_record", "assessor_apn"]),
  apn: z.string().min(1),
  state: z.string().length(2),
  county: z.string().min(1),
  deedCid: z.string().optional(),
  addressLine1: z.string().optional(),
  zip: z.string().optional(),
  instrumentNumberPlaceholder: z.string().optional(),
  propertyId: z.string().uuid().optional(),
});

router.post(
  "/adhoc",
  requireWallet,
  requireRole("admin", "title_officer", "authority_officer"),
  async (req, res, next) => {
    try {
      const body = adHocSchema.parse(req.body);
      const out =
        body.lookupType === "county_record"
          ? await runCountyRecordLookup(body)
          : await runAssessorApnLookup(body);
      res.json({
        ...out.result,
        savedId: out.saved.id,
        notice: "Assistive lookup only — not an official government record.",
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
