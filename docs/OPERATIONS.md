# Operations — Zikkaron MVP

## Local startup

```bash
brew services start postgresql@16
npm run migrate -w zikkaron-backend
npm run backend:dev
npm run frontend:dev
```

Docker Compose remains the preferred shared local setup for PostgreSQL and IPFS.

## Startup guard

With `NODE_ENV=production` the API refuses to start if `ALLOW_HEADER_AUTH`,
`ALLOW_SIMULATED_SSO`, or `ALLOW_PRIVILEGED_BOOTSTRAP` is `true`, or if `DATABASE_URL`,
`METRICS_TOKEN`, or `KYC_HASH_PEPPER` is missing (`backend/src/config.js`). Behind a load
balancer, set `TRUST_PROXY` so rate limits key on the real client IP.

## Health and metrics

- `GET /health` checks PostgreSQL and returns `503` when the database is unavailable. It does
  not reveal auth or adapter configuration.
- Every response carries an `x-request-id`; clients may provide a safe correlation ID.
- `GET /metrics` exposes in-process request counts and latency. `METRICS_TOKEN` (sent as
  `x-metrics-token`, compared in constant time) is required in production.
- Set `LOG_REQUESTS=true` for one-line JSON request logs.

## Auth record cleanup

Expired nonces and sessions that expired or were revoked over a day ago are deleted every
`AUTH_CLEANUP_INTERVAL_MINUTES` (default 60) and on `POST /api/admin/retention/purge`, which
also writes an `admin.retention_purge` audit entry.

Metrics are intentionally process-local in the MVP. Production should export them to a managed
monitoring system.

## Shutdown

The backend handles `SIGTERM` and `SIGINT`, stops accepting requests, closes the HTTP server,
and drains the PostgreSQL pool.

## CI

`.github/workflows/ci.yml` runs:

- Solidity compile and tests
- Slither static analysis (fails on medium or higher findings)
- PostgreSQL migration, backend config unit tests, and backend integration tests (the suite fails
  if the API is unreachable)
- Next.js production build

Docker Compose binds PostgreSQL, the IPFS API, and the IPFS gateway to `127.0.0.1` only.

CI enables demo-only flags explicitly. Shared or production environments must keep header
authentication, privileged bootstrap, and simulated SSO disabled.

## Backup and recovery

Before any pilot, define PostgreSQL backup frequency, restore testing, IPFS pinning policy,
export retention, and agency-specific incident contacts. The MVP does not provide a durable
backup service or a production IPFS pinning SLA.
