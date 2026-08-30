-- Phase 5: evidence ingestion, integrity metadata, and owner share links

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS filename TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS byte_size INTEGER,
  ADD COLUMN IF NOT EXISTS scan_status TEXT NOT NULL DEFAULT 'simulated_clean',
  ADD COLUMN IF NOT EXISTS scan_result JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS storage_mode TEXT NOT NULL DEFAULT 'ipfs_or_hash_fallback';

CREATE INDEX IF NOT EXISTS idx_documents_property ON documents (property_id, created_at DESC);

ALTER TABLE authority_case_exports
  ADD COLUMN IF NOT EXISTS manifest_hash TEXT,
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'json';

CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_by_wallet TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL,
  recipient_label TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_links_property ON share_links (property_id);
CREATE INDEX IF NOT EXISTS idx_share_links_expiry ON share_links (expires_at);
