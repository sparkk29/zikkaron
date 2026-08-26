const { query } = require("../db/pool");
const { getLookupAdapter } = require("./lookupAdapters");
const { writeAudit } = require("./audit");

async function persistLookupResult({ propertyId, queueJobId, result }) {
  const row = await query(
    `INSERT INTO government_lookup_results
       (property_id, queue_job_id, adapter, lookup_type, request, response, match_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      propertyId || null,
      queueJobId || null,
      result.adapter,
      result.lookupType,
      result.request || {},
      result.response || {},
      result.matchStatus,
    ]
  );
  return row.rows[0];
}

async function runCountyRecordLookup(payload, { queueJobId } = {}) {
  const adapter = getLookupAdapter();
  const result = await adapter.lookupCountyRecord(payload);
  const saved = await persistLookupResult({
    propertyId: payload.propertyId,
    queueJobId,
    result,
  });
  return { result, saved };
}

async function runAssessorApnLookup(payload, { queueJobId } = {}) {
  const adapter = getLookupAdapter();
  const result = await adapter.lookupAssessorApn(payload);
  const saved = await persistLookupResult({
    propertyId: payload.propertyId,
    queueJobId,
    result,
  });
  return { result, saved };
}

async function processQueuedLookupJobs(limit = 20) {
  const jobs = await query(
    `SELECT * FROM government_api_queue
     WHERE status = 'queued'
       AND job_type IN ('county_record_lookup', 'assessor_apn_lookup')
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );

  const processed = [];
  for (const job of jobs.rows) {
    try {
      let out;
      if (job.job_type === "county_record_lookup") {
        out = await runCountyRecordLookup(job.payload || {}, { queueJobId: job.id });
      } else {
        out = await runAssessorApnLookup(job.payload || {}, { queueJobId: job.id });
      }
      await query(
        `UPDATE government_api_queue
         SET status = 'simulated_done', result = $1, updated_at = NOW()
         WHERE id = $2`,
        [{ lookupResultId: out.saved.id, matchStatus: out.result.matchStatus }, job.id]
      );
      processed.push({ jobId: job.id, matchStatus: out.result.matchStatus });
    } catch (err) {
      await query(
        `UPDATE government_api_queue
         SET status = 'failed', result = $1, updated_at = NOW()
         WHERE id = $2`,
        [{ error: err.message }, job.id]
      );
      processed.push({ jobId: job.id, error: err.message });
    }
  }
  return processed;
}

async function lookupForProperty(propertyId, actorWallet) {
  const prop = await query(`SELECT * FROM properties WHERE id = $1`, [propertyId]);
  if (!prop.rows[0]) {
    throw Object.assign(new Error("Property not found"), { status: 404 });
  }
  const p = prop.rows[0];
  const county = await runCountyRecordLookup({
    propertyId: p.id,
    apn: p.apn,
    state: p.state,
    county: p.county,
    deedCid: p.deed_cid,
  });
  const assessor = await runAssessorApnLookup({
    propertyId: p.id,
    apn: p.apn,
    state: p.state,
    county: p.county,
    addressLine1: p.address_line1,
    zip: p.zip,
  });
  if (actorWallet) {
    await writeAudit(actorWallet, "gov.lookup_run", "property", propertyId, {
      county: county.result.matchStatus,
      assessor: assessor.result.matchStatus,
    });
  }
  return {
    adapter: getLookupAdapter().name,
    countyRecord: county.result,
    assessorApn: assessor.result,
    notice:
      "Assistive adapter results only. County recorder and assessor remain authoritative.",
  };
}

async function listLookupsForProperty(propertyId) {
  const result = await query(
    `SELECT * FROM government_lookup_results
     WHERE property_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [propertyId]
  );
  return result.rows;
}

module.exports = {
  runCountyRecordLookup,
  runAssessorApnLookup,
  processQueuedLookupJobs,
  lookupForProperty,
  listLookupsForProperty,
};
