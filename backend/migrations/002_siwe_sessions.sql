-- Phase 1: SIWE session auth tables

CREATE TABLE IF NOT EXISTS auth_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  nonce TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_wallet ON auth_nonces (wallet_address);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires ON auth_nonces (expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  auth_method TEXT NOT NULL DEFAULT 'siwe',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_wallet ON sessions (wallet_address);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
