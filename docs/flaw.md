# Flaws & limits — Zikkaron MVP

Zikkaron is assistive memorial software. These limits are intentional disclosures.

## Access & auth

- **Primary auth is SIWE (Sign-In with Ethereum)** with server-side sessions. Browsers hold the session in an httpOnly, `SameSite=Strict` cookie; API clients may send `Authorization: Bearer`. Nonces are consumed atomically, and domain, URI, and chain ID are all checked.
- **Cookie-authenticated writes require a trusted `Origin`** (`CORS_ORIGIN`). The frontend and API must share a site for the cookie to be sent.
- **`x-wallet-address` remains available only when `ALLOW_HEADER_AUTH=true`** (local tests). It is spoofable — the API refuses to start with it enabled when `NODE_ENV=production`, and the frontend only sends it when `NEXT_PUBLIC_ALLOW_HEADER_AUTH=true`.
- **Privileged roles require administrator approval.** One-time admin bootstrap is controlled by an exact `BOOTSTRAP_ADMIN_WALLET` plus `ALLOW_PRIVILEGED_BOOTSTRAP=true` (refused in production). Agency binding (`agency_id`) is set only by an administrator or the SSO stub, never by self-registration.
- **Agency SSO is stubbed** (`agency_sso_stub` sessions via `/api/auth/sso/simulate`) and requires an authenticated session plus `ALLOW_SIMULATED_SSO=true` (refused in production). It only creates new, unapproved officers; existing users keep their role and approval. Live OIDC/SAML callbacks return 501 until MoU + IdP credentials.
- **Authority access is not accredited LE access control.** SSO placeholders do not validate real agency identity.
- **Not CJIS / FedRAMP / state security certified.**

## Evidence & documents

- **Hash ≠ county seal authenticity.** A deed CID proves the bytes submitted to Zikkaron, not that the county recorded them.
- **Fake PDFs can still be uploaded.** Simulated title verify and disputes mitigate; they do not eliminate fraud.
- **Memorial ≠ service of process or court order.** Notice memorials require `notLegalServiceAcknowledged`.
- **First registrant wins an APN.** Off-chain and on-chain registration do not prove ownership, so a squatter can claim an APN before the real owner; resolution is an admin / authority dispute process.
- **Disputes are human-reviewed.** Disputes from non-owners start as `pending_review` and do not pause listings until an admin or authority opens them.

## Legal & civic

- **Cannot evict.** Must not instruct illegal self-help lockouts.
- **Not title.** On-chain `claimedOwner` is an app memorial claim.
- **State/county variation** is first-class; there is no national “government squatter registry.”

## Contracts

- **Unaudited.** Slither runs in CI (fails on medium+), but no formal audit has been done.
- **Deployed behind ERC-1967 proxies (UUPS).** Implementations are locked; initialization happens atomically through `ZikkaronProxy`. With `UPGRADE_ADMIN_ADDRESS` set, the deployer renounces `ADMIN` and `DEFAULT_ADMIN_ROLE`; without it, the deployer key retains upgrade authority.
- **On-chain property writes are gated on the memorial claimant** (`PropertyRegistry.claimedOwnerOf`), which is itself first-come — not proof of title.
- **Escrow release/refund are admin actions**; buyers can self-refund only after the refund timeout (default 14 days).
- **APN keys use `abi.encode`.** Records registered before this change used the old `encodePacked` key and are not migrated.
- **Testnet POL only** unless `CONFIRM_MAINNET_DEPLOY=yes`.

## Privacy

- No raw SSN/ITIN/DL/bank data on-chain.
- KYC payloads are stored as HMAC-SHA256 with a server-side `KYC_HASH_PEPPER`; rotating the pepper invalidates comparison with existing hashes. Case packs no longer include the KYC hash.
- Case packs may contain owner wallet + occupancy data; exports are logged and labeled assistive / not official government records.
- Anonymous property reads return a public view only (no owner wallet, deed CID, occupants, timeline, or legal records).
- The frontend CSP allows `'unsafe-inline'` scripts because Next.js emits inline bootstrap scripts; a nonce-based CSP is future work.
- Pattern flags on repeat fraud wallets / APNs (privacy-preserving) are future work.

## Partnership stubs

- `government_api_queue` jobs (`ofac_screen_placeholder`, `county_record_lookup`, `assessor_apn_lookup`, `erecording_submit_placeholder`, `le_case_share_placeholder`, `agency_mou_placeholder`) do not call live systems.
