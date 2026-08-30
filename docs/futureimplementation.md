# Future implementation

## Government partnerships

- Execute pilot MoUs with county recorder / assessor / sheriff (see GOVERNMENT_PARTNERSHIPS.md).
- Agency SSO (SAML/OIDC) replacing header wallet spoof for `authority_officer`.
- County recorder and assessor API adapters (instrument lookup, APN validation).
- Optional e-recording submit placeholder → real vendor adapters where lawful.
- CJIS / state criminal justice information policy review before any LE production data exchange.
- FedRAMP / state equivalent path if hosting for agency tenants.

## Product

- Owner-initiated share links with expiry and purpose limitation.
- ~~Agency-scoped case records, export revocation, and retention purge~~ (Phase 6 shipped;
  production retention schedules still require agency policy).
- Privacy-preserving repeat-fraud pattern flags (wallet/APN clusters) for AG / consumer protection.
- ~~SIWE session auth~~ (Phase 1 shipped); hardware key options for high-value owners.
- ~~Agency SSO (SAML/OIDC) stubs~~ (Phase 2 shipped); live IdP still needs MoU.
- ~~County recorder / assessor API adapter interface~~ (Phase 3 shipped); wire partner middleware URLs via `GOV_LOOKUP_ADAPTER=http`.
- On-chain `AuthorityAck` events (optional; MVP is off-chain).
- Production UUPS proxy deploys + formal audit.
- Real IPFS pinning SLAs; document malware scanning.

## Explicit non-goals unless separately authorized

- Live NCIC / CAD integration
- Warrant issuance UX
- Public harassment / shame lists
- USD ACH / wire rails inside Zikkaron
- Facial recognition
