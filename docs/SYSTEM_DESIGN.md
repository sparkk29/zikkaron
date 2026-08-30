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
│  /api/documents · /api/shares                           │
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

The deployment path uses ERC-1967 proxies for the UUPS modules. Implementations are locked
against direct initialization, and `UPGRADE_ADMIN_ADDRESS` can receive the upgrade role. The
deployer should be a multisig/timelock-controlled operational account for shared networks.
PropertyRegistry, PossessionMemorial, and EscrowPayment expose admin pause/unpause controls.

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

## Evidence path

1. Owner uploads an allowed document through `/api/documents`.
2. The API validates size/type and runs a simulated malware check.
3. IPFS is attempted when `IPFS_API_URL` is configured; otherwise a labeled SHA-256-only
   fallback is stored. Raw content is not stored in PostgreSQL.
4. Authority exports include document metadata, redaction options, and a SHA-256 manifest.
5. Owners can create expiring, purpose-labeled share links through `/api/shares`.

## Authority governance

- Privileged authority accounts must be linked to an agency.
- Exports, acknowledgements, revocations, and case records are scoped to that agency.
- Case-pack payloads default to a 90-day retention deadline.
- Admin purge redacts expired payloads while preserving export and audit metadata.

## Security controls in MVP

Roles including `authority_officer`, export logging, disclaimers, hashes-only PII, PossessionMemorial, dispute warnings, default unofficial county records.
