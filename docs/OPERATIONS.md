# Operations — Zikkaron MVP

## Local startup

```bash
brew services start postgresql@16
npm run migrate -w zikkaron-backend
npm run backend:dev
npm run frontend:dev
```

Docker Compose remains the preferred shared local setup for PostgreSQL and IPFS.

## Health and metrics

- `GET /health` checks PostgreSQL and returns `503` when the database is unavailable.
- Every response carries an `x-request-id`; clients may provide a safe correlation ID.
- `GET /metrics` exposes in-process request counts and latency. Set `METRICS_TOKEN` to protect
  it outside local development.
- Set `LOG_REQUESTS=true` for one-line JSON request logs.

Metrics are intentionally process-local in the MVP. Production should export them to a managed
monitoring system.

## Shutdown

The backend handles `SIGTERM` and `SIGINT`, stops accepting requests, closes the HTTP server,
and drains the PostgreSQL pool.

## CI

`.github/workflows/ci.yml` runs:

- Solidity compile and tests
- PostgreSQL migration and backend integration tests
- Next.js production build

CI enables demo-only flags explicitly. Shared or production environments must keep header
authentication, privileged bootstrap, and simulated SSO disabled.

## Backup and recovery

Before any pilot, define PostgreSQL backup frequency, restore testing, IPFS pinning policy,
export retention, and agency-specific incident contacts. The MVP does not provide a durable
backup service or a production IPFS pinning SLA.
