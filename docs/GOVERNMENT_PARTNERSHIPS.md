# Government partnerships — Zikkaron

Zikkaron is designed to **work with** government and authorities, not around them.

> Designed for collaboration with government and law enforcement. Not an official government system.

MVP uses **simulated** authority accounts and **integration placeholders**. This document describes the partnership architecture — it does **not** claim a live MoU or endorsement.

## Target agencies

| Agency type | Product intent |
|-------------|----------------|
| County recorder / register of deeds | Cross-check deed hashes vs instrument # / book-page placeholders; flag mismatches for human review |
| County assessor | Bind memorials to APN so fake addresses are harder to shop |
| Police / sheriff | Fast authorized-occupant answer + incident timeline + evidence CIDs |
| Prosecutors / fraud units | Structured packs for suspected deed fraud / impersonation |
| Civil courts / counsel | Chronological memorial export for UD / trespass / quiet-title *support* (not a filing portal) |
| State AG / consumer protection (future) | Pattern flags on repeat fraud wallets / APNs |

Seeded demo rows in `agencies` use names like “Demo Sheriff Office (Pilot Placeholder)” — **not** real endorsements.

## What Zikkaron may share (with lawful process / role)

- Property memorial metadata (address, APN, county, occupancy status)
- Authorized occupant registry (owner-asserted)
- Incident timeline + evidence CIDs / hashes
- KYC **hash** and verification flag (not raw identity documents)
- Dispute flags and legal-record placeholders
- Export log: `exported_to_role=authority_officer`, agency name, case_ref placeholder

Owner data reaches authorities via: **explicit owner share** (future), **authority role login**, or **logged export request**.

## What agencies still do alone

- Record instruments and maintain official indexes  
- Respond to calls, investigate, arrest  
- Issue warrants, prosecute, adjudicate  
- Order eviction / quiet title  
- Licensed title/escrow closings  

## Pilot MoU checklist (placeholder)

- [ ] Named agency sponsor and data owner  
- [ ] Purpose limitation: case support / fraud deterrence only  
- [ ] No public shame list / bulk scrape for harassment  
- [x] AuthN/AuthZ plan (SSO) — **stubs shipped** (`/api/auth/sso/*`); live IdP still requires MoU  
- [ ] Retention & audit of `authority_case_exports`  
- [ ] CJIS / privacy counsel review if LE PII enters scope  
- [ ] Clear UI language: not an official government system  
- [ ] Exit: agency can stop pilot without Zikkaron claiming endorsement  

## Agency SSO stubs (Phase 2)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/auth/sso/agencies` | List pilot agencies with SSO placeholder config |
| `POST /api/auth/sso/oidc/start` | Build OIDC authorize URL placeholder + state |
| `GET /api/auth/sso/oidc/callback` | 501 until live code exchange |
| `POST /api/auth/sso/saml/start` | SAML AuthnRequest stub |
| `GET /api/auth/sso/saml/metadata` | SP metadata XML placeholder |
| `POST /api/auth/sso/simulate` | Demo login: bind wallet session as `authority_officer` |

Live OIDC/SAML federation is **out of MVP** until certificates, client secrets, and MoU exist.

## Integration stubs (`government_api_queue`)

- `ofac_screen_placeholder`
- `county_record_lookup` → **Phase 3 adapter** (`simulated` or `http` via `GOV_LOOKUP_ADAPTER`)
- `assessor_apn_lookup` → **Phase 3 adapter**
- `erecording_submit_placeholder`
- `le_case_share_placeholder`
- `agency_mou_placeholder`

### Lookup adapter API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/lookups/adapter` | Active adapter name/mode |
| `POST /api/lookups/run/:propertyId` | Run county + assessor lookups for a property |
| `POST /api/lookups/process-queue` | Drain queued county/APN jobs |
| `POST /api/lookups/adhoc` | Ad-hoc APN/instrument assistive check |

Results land in `government_lookup_results` with explicit disclaimers — **not** official county extracts.
