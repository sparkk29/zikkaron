# zikkaron-backend

Express + PostgreSQL API for Zikkaron (US).

```bash
docker compose up -d
npm run dev -w zikkaron-backend
npm run test -w zikkaron-backend   # requires API running
```

Key routes:

- `GET /health` → `product: Zikkaron`, `country: US`
- `/api/users/*` KYC register / verify
- `/api/properties/*` memorials + simulated legal verify
- `/api/occupancy/*` occupants, events, disputes
- `/api/authority/*` search, case, exports, acknowledge
- `/api/documents/*` validated evidence ingestion and document metadata
- `/api/shares/*` expiring owner-created memorial share links
- `/api/authority/cases/*` agency-scoped case lifecycle
- `/api/deals/*` purchase deals
- `/api/admin/*` queue + audit

Auth: SIWE `Authorization: Bearer` sessions. The spoofable `x-wallet-address` fallback is
disabled by default and should only be enabled for local tests.

For a fresh local install, configure `BOOTSTRAP_ADMIN_WALLET` and temporarily set
`ALLOW_PRIVILEGED_BOOTSTRAP=true`. Register that wallet as `admin` once, then unset the
bootstrap flag. Privileged roles must thereafter be granted through `POST /api/users/roles/:wallet`.

Simulated agency SSO requires `ALLOW_SIMULATED_SSO=true` and an authenticated session; it is not
an identity-provider assertion.

Evidence upload uses IPFS when `IPFS_API_URL` is configured. If IPFS is unavailable and
`IPFS_UPLOAD_REQUIRED=false`, the API records a clearly labeled SHA-256-only fallback.

Authority exports are scoped to the officer's agency, carry a retention deadline, support
redaction, and can be revoked. Admin retention purge redacts expired payloads while preserving
audit metadata.

Operational endpoints: `GET /health`, `GET /metrics`, and `x-request-id` response headers.
See [`docs/OPERATIONS.md`](../docs/OPERATIONS.md).
