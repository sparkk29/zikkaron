const express = require("express");
const { z } = require("zod");
const { query } = require("../db/pool");
const { requireWallet } = require("../middleware/auth");
const { writeAudit } = require("../services/audit");
const {
  ALLOWED_MIME_TYPES,
  decodeContent,
  scanDocument,
  uploadToIpfs,
} = require("../services/evidence");

const router = express.Router();

const uploadSchema = z.object({
  propertyId: z.string().uuid(),
  docType: z.enum(["deed", "lease", "incident_evidence", "notice", "other"]),
  filename: z.string().min(1).max(255),
  mimeType: z.string().refine((value) => ALLOWED_MIME_TYPES.has(value), {
    message: "Unsupported MIME type",
  }),
  contentBase64: z.string().min(1).max(15 * 1024 * 1024),
});

router.post("/", requireWallet, async (req, res, next) => {
  try {
    const body = uploadSchema.parse(req.body);
    const property = await query(`SELECT * FROM properties WHERE id = $1`, [body.propertyId]);
    if (!property.rows[0]) return res.status(404).json({ error: "Property not found" });
    if (property.rows[0].owner_wallet.toLowerCase() !== req.wallet) {
      return res.status(403).json({ error: "Only the property owner may upload evidence" });
    }

    const content = decodeContent(body.contentBase64);
    const scan = scanDocument({
      filename: body.filename,
      mimeType: body.mimeType,
      content,
    });
    if (scan.status === "rejected") {
      return res.status(415).json({
        error: "Document rejected by upload validation",
        scan,
      });
    }

    const stored = await uploadToIpfs({
      filename: body.filename,
      mimeType: body.mimeType,
      content,
    });
    const result = await query(
      `INSERT INTO documents
         (property_id, doc_type, cid, content_hash, uploaded_by_wallet,
          filename, mime_type, byte_size, scan_status, scan_result, storage_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        body.propertyId,
        body.docType,
        stored.cid,
        stored.hash,
        req.wallet,
        body.filename,
        body.mimeType,
        content.length,
        scan.status,
        { ...scan.result, ...(stored.warning ? { storageWarning: stored.warning } : {}) },
        stored.storageMode,
      ]
    );
    await writeAudit(req.wallet, "document.upload", "document", result.rows[0].id, {
      propertyId: body.propertyId,
      docType: body.docType,
      contentHash: stored.hash,
      storageMode: stored.storageMode,
    });
    res.status(201).json({
      document: result.rows[0],
      warning: stored.warning,
      notice:
        "The content hash proves the uploaded bytes. It does not prove county authenticity or legal effect.",
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get("/property/:propertyId", requireWallet, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, property_id, doc_type, cid, content_hash, uploaded_by_wallet,
              filename, mime_type, byte_size, scan_status, scan_result, storage_mode, created_at
       FROM documents WHERE property_id = $1 ORDER BY created_at DESC`,
      [req.params.propertyId]
    );
    res.json({
      documents: result.rows,
      notice: "Document metadata only. Raw content is not stored by the API.",
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
