# System design — Zikkaron

## Layers

```
┌─────────────────────────────────────────────────────────┐
│  Next.js frontend (MetaMask, Amoy 80002)                │
│  /authority console · /properties · /occupancy · /kyc   │
└───────────────────────────┬─────────────────────────────┘
                            │ x-wallet-address (demo)
┌───────────────────────────▼─────────────────────────────┐
│  Express API · Zod · Helmet · CORS                      │
│  /api/authority/* · /api/properties · /api/occupancy    │
└───────────────┬─────────────────────────────┬───────────┘
                │                             │
        PostgreSQL                     Polygon Amoy
        agencies, exports,             PropertyRegistry
        occupants, events,             PossessionMemorial
        gov_api_queue                  Escrow / KYC / etc.
                │
              IPFS CIDs (documents / evidence)
```

## On-chain modules

| Contract | Role |
|----------|------|
| UserVerification | KYC hash memorial; ADMIN / TITLE_OFFICER / AUTHORITY_OFFICER |
| PropertyRegistry | APN-bound property memorial; occupancy status |
| PossessionMemorial | Incident / notice evidence hashes |
| OwnershipTransfer | Transfer intent + simulated county verify |
| EscrowPayment | Test POL escrow (not closing) |
| RentalAgreement | Lease hash + authorized occupant flag |

NatSpec on all modules: assists owners and authorities; not title; not eviction; not an official government system.

## Off-chain authority path

1. Search → case view (read-only)  
2. Export → `authority_case_exports` + watermark + `le_case_share_placeholder`  
3. Acknowledge → `authority_acknowledgements` + `agency_ack_received` event  

## Auth & government adapters (phased)

| Phase | Capability |
|-------|------------|
| 1 | SIWE Bearer sessions (`/api/auth/*`) |
| 2 | Agency SSO stubs (`/api/auth/sso/*`) |
| 3 | County/assessor lookup adapters (`/api/lookups/*`, `GOV_LOOKUP_ADAPTER`) |

## Security controls in MVP

Roles including `authority_officer`, export logging, disclaimers, hashes-only PII, PossessionMemorial, dispute warnings, default unofficial county records.
