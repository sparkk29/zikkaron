-- Phase 2: Agency SSO stubs (OIDC / SAML placeholders)

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS sso_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sso_protocol TEXT CHECK (sso_protocol IS NULL OR sso_protocol IN ('oidc', 'saml')),
  ADD COLUMN IF NOT EXISTS sso_issuer TEXT,
  ADD COLUMN IF NOT EXISTS sso_client_id_placeholder TEXT,
  ADD COLUMN IF NOT EXISTS sso_metadata_url_placeholder TEXT,
  ADD COLUMN IF NOT EXISTS sso_redirect_uri_placeholder TEXT;

CREATE TABLE IF NOT EXISTS agency_sso_logins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id),
  protocol TEXT NOT NULL CHECK (protocol IN ('oidc', 'saml', 'simulated')),
  subject_placeholder TEXT NOT NULL,
  email_placeholder TEXT,
  display_name TEXT,
  wallet_bound TEXT,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  state_token TEXT,
  status TEXT NOT NULL DEFAULT 'simulated_ok',
  raw_claims JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agency_sso_logins_agency ON agency_sso_logins (agency_id, created_at DESC);

-- Enable SSO placeholders on seeded demo agencies (no live IdP)
UPDATE agencies
SET sso_enabled = TRUE,
    sso_protocol = 'oidc',
    sso_issuer = 'https://sso.example.gov/oidc-placeholder',
    sso_client_id_placeholder = 'zikkaron-pilot-client',
    sso_metadata_url_placeholder = 'https://sso.example.gov/.well-known/openid-configuration',
    sso_redirect_uri_placeholder = 'http://localhost:4000/api/auth/sso/oidc/callback'
WHERE status = 'pilot_placeholder' AND type IN ('sheriff', 'police', 'prosecutor', 'county_recorder');
