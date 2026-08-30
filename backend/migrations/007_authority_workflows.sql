-- Phase 6: authority case workflow, agency scoping, and retention controls

ALTER TABLE authority_case_exports
  ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by_wallet TEXT,
  ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purged_by_wallet TEXT;

UPDATE authority_case_exports
SET retention_expires_at = created_at + INTERVAL '90 days'
WHERE retention_expires_at IS NULL;

CREATE TABLE IF NOT EXISTS authority_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id),
  opened_by_wallet TEXT NOT NULL,
  assigned_to_wallet TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_review', 'referred', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_authority_cases_agency
  ON authority_cases (agency_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_authority_cases_property
  ON authority_cases (property_id, updated_at DESC);
