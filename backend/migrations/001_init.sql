-- Zikkaron US MVP schema
-- Civic memorial layer assisting owners and authorities. Not an official government system.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role AS ENUM (
  'admin',
  'seller',
  'buyer',
  'tenant',
  'title_officer',
  'authority_officer'
);

CREATE TYPE agency_type AS ENUM (
  'county_recorder',
  'assessor',
  'police',
  'sheriff',
  'prosecutor',
  'court_clerk',
  'other'
);

CREATE TYPE agency_status AS ENUM ('pilot_placeholder', 'inactive');

CREATE TYPE occupancy_status AS ENUM (
  'vacant_secured',
  'owner_occupied',
  'authorized_tenant',
  'disputed',
  'unauthorized_suspected'
);

CREATE TYPE fraud_risk_level AS ENUM ('low', 'medium', 'high');

CREATE TYPE occupancy_event_type AS ENUM (
  'unauthorized_occupancy_reported',
  'notice_memorialized',
  'police_called',
  'authority_notified',
  'agency_ack_received',
  'authorized_occupant_added',
  'vacant_secured'
);

CREATE TYPE gov_job_type AS ENUM (
  'ofac_screen_placeholder',
  'county_record_lookup',
  'assessor_apn_lookup',
  'erecording_submit_placeholder',
  'le_case_share_placeholder',
  'agency_mou_placeholder'
);

CREATE TYPE gov_job_status AS ENUM ('queued', 'simulated_done', 'failed');

CREATE TABLE agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type agency_type NOT NULL,
  county_fips TEXT,
  state CHAR(2) NOT NULL,
  status agency_status NOT NULL DEFAULT 'pilot_placeholder',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL UNIQUE,
  role user_role NOT NULL DEFAULT 'seller',
  display_name TEXT,
  kyc_hash TEXT,
  kyc_verified BOOLEAN NOT NULL DEFAULT FALSE,
  fraud_risk_level fraud_risk_level NOT NULL DEFAULT 'low',
  agency_id UUID REFERENCES agencies(id),
  agency_name TEXT,
  agency_unit TEXT,
  badge_ref_placeholder TEXT,
  ofac_screen_placeholder_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onchain_property_id BIGINT,
  owner_wallet TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state CHAR(2) NOT NULL,
  zip TEXT NOT NULL,
  county TEXT NOT NULL,
  apn TEXT NOT NULL,
  legal_description TEXT,
  deed_cid TEXT,
  occupancy_status occupancy_status NOT NULL DEFAULT 'vacant_secured',
  listing_paused BOOLEAN NOT NULL DEFAULT FALSE,
  list_price_usd NUMERIC(14, 2),
  disclaimer_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (state, county, apn)
);

CREATE TABLE legal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  instrument_number_placeholder TEXT,
  book_page_placeholder TEXT,
  recording_date_placeholder DATE,
  document_cid TEXT,
  document_hash TEXT,
  is_official_county_record BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by_agency_id UUID REFERENCES agencies(id),
  verified_by_wallet TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE authorized_occupants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  occupant_name TEXT NOT NULL,
  occupant_wallet TEXT,
  relationship TEXT,
  lease_cid TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_wallet TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE occupancy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  event_type occupancy_event_type NOT NULL,
  actor_wallet TEXT NOT NULL,
  evidence_cid TEXT,
  evidence_hash TEXT,
  note TEXT,
  not_legal_service_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  onchain_event_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  opened_by_wallet TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE authority_case_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id),
  actor_wallet TEXT NOT NULL,
  case_ref_placeholder TEXT,
  authority_use_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  payload_snapshot JSONB NOT NULL,
  watermark TEXT NOT NULL DEFAULT 'Zikkaron memorial export — assistive; not an official government record.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE authority_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id UUID REFERENCES authority_case_exports(id) ON DELETE SET NULL,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id),
  actor_wallet TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  seller_wallet TEXT NOT NULL,
  buyer_wallet TEXT NOT NULL,
  amount_test_pol NUMERIC(36, 18) NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  disclaimer_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  fraud_warning_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  onchain_deal_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rental_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  landlord_wallet TEXT NOT NULL,
  tenant_wallet TEXT,
  tenant_name TEXT NOT NULL,
  lease_cid TEXT,
  lease_hash TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  authorized_occupant BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  cid TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  uploaded_by_wallet TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_wallet TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE government_api_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type gov_job_type NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status gov_job_status NOT NULL DEFAULT 'queued',
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_properties_apn ON properties (apn);
CREATE INDEX idx_properties_address ON properties (state, zip, address_line1);
CREATE INDEX idx_occupancy_events_property ON occupancy_events (property_id, created_at DESC);
CREATE INDEX idx_disputes_property ON disputes (property_id) WHERE status = 'open';
CREATE INDEX idx_users_wallet ON users (wallet_address);

-- Seed demo agencies (pilot placeholders — no real endorsement claimed)
INSERT INTO agencies (name, type, county_fips, state, status) VALUES
  ('Demo County Recorder (Pilot Placeholder)', 'county_recorder', '04013', 'AZ', 'pilot_placeholder'),
  ('Demo County Assessor (Pilot Placeholder)', 'assessor', '04013', 'AZ', 'pilot_placeholder'),
  ('Demo Sheriff Office (Pilot Placeholder)', 'sheriff', '04013', 'AZ', 'pilot_placeholder'),
  ('Demo Police Department (Pilot Placeholder)', 'police', '04013', 'AZ', 'pilot_placeholder'),
  ('Demo Prosecutor Fraud Unit (Pilot Placeholder)', 'prosecutor', '04013', 'AZ', 'pilot_placeholder');

INSERT INTO government_api_queue (job_type, payload, status) VALUES
  ('agency_mou_placeholder', '{"note":"MoU adapter stub for future partnership"}', 'queued'),
  ('ofac_screen_placeholder', '{"note":"OFAC screening stub"}', 'queued');
