const express = require("express");
const { query } = require("../db/pool");
const { requireWallet, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/queue", requireWallet, requireRole("admin", "authority_officer"), async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT * FROM government_api_queue ORDER BY created_at DESC LIMIT 100`
    );
    res.json({
      jobs: result.rows,
      note: "Integration placeholders only. No live NCIC/CAD/recorder APIs in MVP.",
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/queue/:id/simulate-done",
  requireWallet,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const result = await query(
        `UPDATE government_api_queue
         SET status = 'simulated_done', result = $1, updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [{ simulated: true, at: new Date().toISOString() }, req.params.id]
      );
      if (!result.rows[0]) return res.status(404).json({ error: "Job not found" });
      res.json({ job: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/audit", requireWallet, requireRole("admin"), async (_req, res, next) => {
  try {
    const result = await query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200`);
    res.json({ logs: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
