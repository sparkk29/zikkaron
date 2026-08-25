const { query } = require("../db/pool");

async function writeAudit(actorWallet, action, entityType, entityId, meta = {}) {
  await query(
    `INSERT INTO audit_logs (actor_wallet, action, entity_type, entity_id, meta)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorWallet || null, action, entityType || null, entityId || null, meta]
  );
}

async function enqueueGovJob(jobType, payload = {}) {
  const result = await query(
    `INSERT INTO government_api_queue (job_type, payload, status)
     VALUES ($1, $2, 'queued') RETURNING *`,
    [jobType, payload]
  );
  return result.rows[0];
}

module.exports = { writeAudit, enqueueGovJob };
