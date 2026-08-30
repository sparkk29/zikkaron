-- Phase 4: privileged-role approval and authorization hardening

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS role_approved_by TEXT,
  ADD COLUMN IF NOT EXISTS role_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS role_approval_source TEXT NOT NULL DEFAULT 'pending';

-- Existing ordinary demo accounts remain usable. Existing privileged accounts
-- must be explicitly approved through bootstrap or the admin role endpoint.
UPDATE users
SET role_approved = TRUE,
    role_approval_source = 'legacy_public_role'
WHERE role IN ('seller', 'buyer', 'tenant')
  AND role_approved = FALSE;

CREATE INDEX IF NOT EXISTS idx_users_role_approval
  ON users (role, role_approved);
