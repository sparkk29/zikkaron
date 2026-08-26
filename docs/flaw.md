# Flaws & limits — Zikkaron MVP

Zikkaron is assistive memorial software. These limits are intentional disclosures.

## Access & auth

- **Primary auth is SIWE (Sign-In with Ethereum)** with server-side sessions (`Authorization: Bearer`).
- **`x-wallet-address` remains available only when `ALLOW_HEADER_AUTH=true`** (local/tests). It is spoofable — disable in shared environments.
- **Agency SSO is stubbed** (`agency_sso_stub` sessions via `/api/auth/sso/simulate`). Live OIDC/SAML callbacks return 501 until MoU + IdP credentials.
- **Authority access is not accredited LE access control.**
- **Not CJIS / FedRAMP / state security certified.**

## Evidence & documents

- **Hash ≠ county seal authenticity.** A deed CID proves the bytes submitted to Zikkaron, not that the county recorded them.
- **Fake PDFs can still be uploaded.** Simulated title verify and disputes mitigate; they do not eliminate fraud.
- **Memorial ≠ service of process or court order.** Notice memorials require `notLegalServiceAcknowledged`.

## Legal & civic

- **Cannot evict.** Must not instruct illegal self-help lockouts.
- **Not title.** On-chain `claimedOwner` is an app memorial claim.
- **State/county variation** is first-class; there is no national “government squatter registry.”

## Contracts

- **Unaudited.** UUPS-ready modules; MVP deploy script initializes implementations directly for local/Amoy simplicity.
- **Testnet POL only** unless `CONFIRM_MAINNET_DEPLOY=yes`.

## Privacy

- No raw SSN/ITIN/DL/bank data on-chain.
- Case packs may contain owner wallet + occupancy data; exports are logged and labeled assistive / not official government records.
- Pattern flags on repeat fraud wallets / APNs (privacy-preserving) are future work.

## Partnership stubs

- `government_api_queue` jobs (`ofac_screen_placeholder`, `county_record_lookup`, `assessor_apn_lookup`, `erecording_submit_placeholder`, `le_case_share_placeholder`, `agency_mou_placeholder`) do not call live systems.
