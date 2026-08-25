# Zikkaron

**זִכָּרוֹן** — *zikkaron* — memorial, remembrance, lasting record

> *A memorial layer that works with authorities — not instead of them.*

Zikkaron is a **US civic memorial layer** that helps **government agencies, law enforcement, courts, and property owners** deter squatters and property fraudsters with shared, timestamped, tamper-evident memorial records.

It is **civic assistance infrastructure**: structured evidence packs, occupancy registries, and document integrity that **support** county recorders, assessors, police/sheriffs, prosecutors, and courts. It never pretends to *be* those institutions or to hold legal title.

**Designed for collaboration with government and law enforcement. Not an official government system.**

---

## What Zikkaron is / is not

| Is | Is not |
|----|--------|
| Parallel memorial + civic handoff layer | County recorder, police, or court |
| Assistive evidence for case support | Legal title or eviction portal |
| Authorized occupancy verification | Public squatter blacklist |
| Architecture for partnership (pilot stubs) | A claim of live sheriff/county endorsement |

Persistent product stance: County recording, police, and the courts remain authoritative. Eviction requires lawful process under state law.

---

## Monorepo

```
zikkaron/
├── contracts/   # zikkaron-contracts — Solidity 0.8.24, Hardhat, Polygon Amoy
├── backend/     # zikkaron-backend — Express + PostgreSQL + authority APIs
├── frontend/    # zikkaron-frontend — Next.js 14 + MetaMask
└── docs/        # Partnership, threat model, flows, flaws
```

## Quick start

```bash
# 1. Infra (Postgres + optional IPFS)
docker compose up -d
# If Docker is unavailable: install PostgreSQL locally, create DB/user `zikkaron`/`zikkaron`,
# then: npm run migrate -w zikkaron-backend

# 2. Install
npm install

# 3. Contracts
npm run contracts:compile
npm run contracts:test

# 4. Backend
cp .env.example .env
npm run backend:dev

# 5. Frontend
cp frontend/.env.local.example frontend/.env.local
npm run frontend:dev
```

- API health: `http://localhost:4000/health` → `{ product: "Zikkaron", country: "US" }`
- App: `http://localhost:3000`
- Authority Console: `http://localhost:3000/authority`

### MetaMask

Connect to **Polygon Amoy (80002)**. On-chain amounts are **test POL only — TESTNET FUNDS, NOT A CLOSING.** Mainnet deploy is gated: `CONFIRM_MAINNET_DEPLOY=yes`.

## MVP one-sitting path

1. Connect MetaMask on Amoy  
2. `/kyc` — owner KYC (simulated hash) + optional `authority_officer` with agency placeholders  
3. `/properties` — mint memorial with county / APN / deed CID; set `vacant_secured` or authorize occupant  
4. `/occupancy` — log unauthorized occupancy + notice memorial (`notLegalServiceAcknowledged`)  
5. `/authority` — search APN/address, view timeline, export **Authority Case Pack**, simulate acknowledge  
6. `/buy-sell` — escrow path with fraud-flag warnings  
7. Property detail — `title_officer` simulated county verify  

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/discussion.md](docs/discussion.md) | Product discussion |
| [docs/flow.md](docs/flow.md) | Owner + authority flows (mermaid) |
| [docs/flaw.md](docs/flaw.md) | Limits & security flaws |
| [docs/futureimplementation.md](docs/futureimplementation.md) | MoUs, SSO, county adapters, CJIS |
| [docs/GOVERNMENT_PARTNERSHIPS.md](docs/GOVERNMENT_PARTNERSHIPS.md) | Agency targets & pilot checklist |
| [docs/THREAT_ACTORS.md](docs/THREAT_ACTORS.md) | Fraud / squatter threat model |
| [docs/BRAND.md](docs/BRAND.md) | Brand & tone |
| [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) | Architecture |

## Footer line

*Zikkaron* (Hebrew: memorial) — civic evidence layer assisting owners and authorities. Not title. Not force. Not a government website.

## License

MIT (contracts and application code) — memorial assistance software only; no warranty of legal effect.
# zikkaron
