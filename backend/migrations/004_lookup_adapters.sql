-- Phase 3: County / assessor lookup adapter results

CREATE TABLE IF NOT EXISTS government_lookup_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  queue_job_id UUID REFERENCES government_api_queue(id) ON DELETE SET NULL,
  adapter TEXT NOT NULL,
  lookup_type TEXT NOT NULL CHECK (lookup_type IN ('county_record', 'assessor_apn')),
  request JSONB NOT NULL DEFAULT '{}',
  response JSONB NOT NULL DEFAULT '{}',
  match_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (match_status IN ('matched', 'mismatch', 'not_found', 'simulated', 'error', 'unknown')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gov_lookup_property ON government_lookup_results (property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gov_lookup_type ON government_lookup_results (lookup_type, adapter);
