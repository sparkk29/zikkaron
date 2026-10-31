<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/zikkaron-logo-dark.svg">
    <img alt="Zikkaron — civic memorial layer for owners and authorities" src="docs/assets/zikkaron-logo-light.svg" width="480">
  </picture>
</p>

<p align="center">
  <strong>זִכָּרוֹן</strong> — <em>zikkaron</em> — memorial, remembrance, lasting record
</p>

<p align="center">
  <em>A memorial layer that works with authorities — not instead of them.</em>
</p>

<p align="center">
  <img alt="Polygon Amoy" src="https://img.shields.io/badge/chain-Polygon%20Amoy%20(80002)-1f6b5c">
  <img alt="Solidity 0.8.24" src="https://img.shields.io/badge/solidity-0.8.24-15202b">
  <img alt="Next.js 14" src="https://img.shields.io/badge/next.js-14-15202b">
  <img alt="PostgreSQL 16" src="https://img.shields.io/badge/postgres-16-3a4a58">
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-3a4a58">
</p>

---

Zikkaron is a **US civic memorial layer** that helps **government agencies, law enforcement, courts, and property owners** deter squatters and property fraudsters with shared, timestamped, tamper-evident memorial records.

It is **civic assistance infrastructure**: structured evidence packs, occupancy registries, and document integrity that **support** county recorders, assessors, police/sheriffs, prosecutors, and courts. It never pretends to *be* those institutions or to hold legal title.

**Designed for collaboration with government and law enforcement. Not an official government system.**

## What Zikkaron is / is not

| Is | Is not |
|----|--------|
| Parallel memorial + civic handoff layer | County recorder, police, or court |
| Assistive evidence for case support | Legal title or eviction portal |
| Authorized occupancy verification | Public squatter blacklist |
| Architecture for partnership (pilot stubs) | A claim of live sheriff/county endorsement |

County recording, police, and the courts remain authoritative. Eviction requires lawful process under state law.

## The mark

The logo is a **cornerstone**: a house outline whose foundation corner is a solid teal block, with ledger lines inside. A cornerstone is the stone laid to record when a building was founded, which matches what Zikkaron does: keep a lasting, dated record of a property without claiming to own or govern it. It deliberately avoids seals, badges, stars, and religious symbols. See [docs/BRAND.md](docs/BRAND.md#logo).

| Asset | Use |
|-------|-----|
| [`frontend/public/logo.svg`](frontend/public/logo.svg) | Transparent mark (app navigation) |
| [`frontend/src/app/icon.svg`](frontend/src/app/icon.svg) | Favicon / app icon on an ink tile |
| [`docs/assets/zikkaron-logo-light.svg`](docs/assets/zikkaron-logo-light.svg) | Wordmark for light backgrounds |
| [`docs/assets/zikkaron-logo-dark.svg`](docs/assets/zikkaron-logo-dark.svg) | Wordmark for dark backgrounds |

## Features

**Owners**
- Mint property memorials on Polygon Amoy with county, APN, and deed CID.
- Mark a property `vacant_secured` or register authorized occupants.
- Log unauthorized occupancy and notice memorials (`notLegalServiceAcknowledged`).
- Upload evidence to IPFS (with an explicit hash-only fallback and a placeholder file scan).
- Create expiring, revocable share links for evidence packs.
- Escrow-style buy/sell and rental flows with fraud-flag warnings (test POL only).

**Authorities**
- Authority Console: search by APN or address, view a property timeline, export an **Authority Case Pack**.
- Agency-scoped cases (open → in review → referred → closed) with priority, assignment, and notes.
- Watermarked exports with manifest hashes, revocation, and retention expiry.
- Retention policies with an admin purge endpoint.
- Agency SSO stubs (OIDC and SAML placeholders) plus a simulated sign-in for demos.

**Platform**
- Sign-In with Ethereum (SIWE) sessions in an httpOnly, `SameSite=Strict` cookie (Bearer tokens for API clients), with an `Origin` check on cookie-authenticated writes; header auth only when explicitly enabled for tests.
- Privileged roles (`authority_officer`, `title_officer`, admin) require admin approval; simulated agency SSO never grants or swaps a role.
- Property occupants, timelines, disputes, legal records, documents, lookups, and deals are limited to the owner, deal parties, and approved authorities; anonymous callers get a public listing view.
- Disputes from non-owners start as `pending_review` and only admins/authorities can open, resolve, or dismiss them.
- The API refuses to start in production with demo flags enabled or required secrets missing.
- County / assessor lookup adapters (`simulated` or `http`) with an admin job queue; results are assistive, never official records.
- Upgradeable contracts (UUPS behind `ZikkaronProxy`), pausable, with inline reentrancy guards. Rental, transfer, escrow, and possession writes require the `PropertyRegistry` claimant; escrow buyers can reclaim funds after a refund timeout.
- Audit log, `/health` with a database check, JSON request `/metrics`, and `x-request-id` tracing.
- GitHub Actions CI for contracts (tests + Slither), backend (against Postgres), and frontend build.
- Frontend CSP, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy` headers.

## Monorepo

```
zikkaron/
├── contracts/   # zikkaron-contracts — Solidity 0.8.24, Hardhat, OpenZeppelin upgradeable, Polygon Amoy
├── backend/     # zikkaron-backend — Express + PostgreSQL, SIWE, authority APIs, migrations 001–007
├── frontend/    # zikkaron-frontend — Next.js 14 App Router + MetaMask + SIWE
├── docs/        # Partnerships, threat model, flows, operations, brand assets
└── .github/     # CI workflow
```

## Quick start

Requires Node 18+ and PostgreSQL 16 (Docker or a local install). IPFS is optional.

```bash
# 1. Infra — Postgres + optional IPFS
docker compose up -d
# No Docker? Install Postgres locally (e.g. `brew install postgresql@16`)
# and create database/user `zikkaron` with password `zikkaron`.

# 2. Install
npm install

# 3. Configure
cp .env.example .env
cp frontend/.env.local.example frontend/.env.local

# 4. Database migrations (tracked in schema_migrations)
npm run migrate -w zikkaron-backend

# 5. Contracts
npm run contracts:compile
npm run contracts:test

# 6. Backend  → http://localhost:4000
npm run backend:dev

# 7. Frontend → http://localhost:3000
npm run frontend:dev
```

- API health: `http://localhost:4000/health`
- Metrics: `http://localhost:4000/metrics`
- App: `http://localhost:3000`
- Authority Console: `http://localhost:3000/authority`

### First admin

Privileged roles need an approved admin. For a fresh local database, set `BOOTSTRAP_ADMIN_WALLET` to your exact wallet and `ALLOW_PRIVILEGED_BOOTSTRAP=true`, register that wallet as admin once, then unset both.

### MetaMask

Connect to **Polygon Amoy (80002)** and sign the SIWE message to start a session. On-chain amounts are **test POL only — TESTNET FUNDS, NOT A CLOSING.**

### Deploying contracts

```bash
DEPLOYER_PRIVATE_KEY=0x... UPGRADE_ADMIN_ADDRESS=0x... npm run deploy:amoy -w zikkaron-contracts
```

Mainnet deploy is refused unless `CONFIRM_MAINNET_DEPLOY=yes`. In production, `UPGRADE_ADMIN_ADDRESS` should be a multisig or timelock: the script binds the registry-gated modules to `PropertyRegistry`, grants `ADMIN` and `DEFAULT_ADMIN_ROLE` to that address, renounces both from the deployer, and verifies the handoff. Without it the deployer key keeps upgrade authority.

## Configuration

Key backend variables (see [`.env.example`](.env.example) for the full list):

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `development` | `production` enables the startup guard and `Secure` session cookies |
| `DATABASE_URL` | local `zikkaron` DB (dev only) | Postgres connection; required in production |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated trusted origins for CORS and the cookie `Origin` check |
| `TRUST_PROXY` | `false` | Express `trust proxy` setting so rate limits see real client IPs behind a load balancer |
| `SIWE_DOMAIN` / `SIWE_URI` / `SIWE_CHAIN_ID` | `localhost` / `http://localhost:3000` / `80002` | SIWE message validation (domain, URI, and chain are all checked) |
| `SESSION_TTL_HOURS` | `24` | Session lifetime (SIWE and simulated SSO) |
| `SESSION_COOKIE_SECURE` | on in production | Force the `Secure` attribute on the session cookie |
| `AUTH_CLEANUP_INTERVAL_MINUTES` | `60` | Expired nonce/session cleanup interval (`0` disables) |
| `KYC_HASH_PEPPER` | dev fallback | HMAC-SHA256 key for KYC payload hashes; required in production |
| `METRICS_TOKEN` | empty | `x-metrics-token` for `/metrics`; required in production |
| `ALLOW_HEADER_AUTH` | `false` | Spoofable `x-wallet-address` auth — tests only; refused in production |
| `BOOTSTRAP_ADMIN_WALLET` + `ALLOW_PRIVILEGED_BOOTSTRAP` | empty / `false` | One-time first-admin bootstrap; refused in production |
| `ALLOW_SIMULATED_SSO` | `false` | Demo agency sign-in; refused in production |
| `GOV_LOOKUP_ADAPTER` | `simulated` | `simulated` or `http` county/assessor lookups |
| `IPFS_API_URL` / `IPFS_UPLOAD_REQUIRED` | `http://localhost:5001` / `false` | Evidence storage; fall back to hash-only when not required |
| `MAX_DOCUMENT_BYTES` | `10485760` | Evidence upload size limit (also sizes the documents route body limit) |
| `API_RATE_LIMIT` / `AUTH_RATE_LIMIT` / `NONCE_RATE_LIMIT` | `120` / `60` / `20` | Requests per minute |
| `DISPUTE_RATE_LIMIT` | `5` | Disputes per wallet per hour |

Frontend variables live in [`frontend/.env.local.example`](frontend/.env.local.example) (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_CHAIN_NAME`, `NEXT_PUBLIC_MAX_DOCUMENT_BYTES`, and `NEXT_PUBLIC_ALLOW_HEADER_AUTH`, which must stay `false` outside local demos).

The browser session cookie is `SameSite=Strict`, so the frontend and API must be served from the same site (for example `app.example.com` and `api.example.com`).

## Testing

```bash
npm run contracts:test   # Hardhat contract tests
npm run backend:test     # API tests (backend must be running with test flags)
npm run build -w zikkaron-frontend
```

Backend API tests expect `ALLOW_HEADER_AUTH=true`, `ALLOW_PRIVILEGED_BOOTSTRAP=true`, `ALLOW_SIMULATED_SSO=true`, and a `BOOTSTRAP_ADMIN_WALLET`. The suite fails (rather than silently passing) when the API at `API_URL` is unreachable; `npm run test:unit -w zikkaron-backend` runs the server-free config tests. The CI workflow in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) shows the exact setup.

## MVP walkthrough

1. Connect MetaMask on Amoy and sign in with SIWE.
2. `/kyc` — owner KYC (simulated hash), or request `authority_officer` with agency details (needs admin approval).
3. `/properties` — mint a memorial with county / APN / deed CID; set `vacant_secured` or authorize an occupant; upload evidence and create a share link.
4. `/occupancy` — log unauthorized occupancy and a notice memorial.
5. `/authority` — search APN/address, view the timeline, open a case, export an **Authority Case Pack**.
6. `/buy-sell` and `/rentals` — escrow paths with fraud-flag warnings.
7. `/admin` — approve roles, review lookup results, view the audit log, run retention purge.

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) | Architecture, auth, evidence path, governance |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Startup, health/metrics, CI, backup and recovery |
| [docs/flow.md](docs/flow.md) | Owner + authority flows (mermaid) |
| [docs/THREAT_ACTORS.md](docs/THREAT_ACTORS.md) | Fraud / squatter threat model |
| [docs/flaw.md](docs/flaw.md) | Known limits and security flaws |
| [docs/GOVERNMENT_PARTNERSHIPS.md](docs/GOVERNMENT_PARTNERSHIPS.md) | Agency targets and pilot checklist |
| [docs/futureimplementation.md](docs/futureimplementation.md) | MoUs, production SSO, county adapters, CJIS |
| [docs/discussion.md](docs/discussion.md) | Product discussion |
| [docs/BRAND.md](docs/BRAND.md) | Brand, tone, and logo |

## License

MIT (contracts and application code) — memorial assistance software only; no warranty of legal effect.

---

<p align="center">
  <em>Zikkaron</em> (Hebrew: memorial) — civic evidence layer assisting owners and authorities.<br>
  Not title. Not force. Not a government website.
</p>
