# Flows — Zikkaron

## Occupancy → authority assist

```mermaid
flowchart TD
    A[Owner logs incident + evidence] --> B[PossessionMemorial hash]
    B --> C[Owner marks authority_notified]
    C --> D[Authority Console lookup]
    D --> E[Authority Case Pack export]
    E --> F[Simulated agency acknowledge]
    F --> G[Real-world LE / court process outside Zikkaron]
```

The owner's side of this flow — timeline entries, evidence upload, and a dispute awaiting
admin / authority review:

![Owner property view with incident timeline](screenshots/property-owner-view.jpg)

## Recorder assist (simulated)

```mermaid
flowchart LR
    O[Owner uploads deed CID] --> T[title_officer / authority compares instrument fields]
    T -->|match| V[Set is_official_county_record after simulated verify]
    T -->|mismatch| D[Open dispute + pause listing]
    V --> H[Human review remains required for real recording]
```

## Owner KYC → property memorial

```mermaid
sequenceDiagram
    participant U as Owner wallet
    participant API as Zikkaron API
    participant DB as PostgreSQL
    participant CH as Contracts Amoy
    U->>API: register KYC hash + role seller
    API->>DB: users.kyc_hash
    U->>API: create property APN/county/deed CID
    API->>DB: properties + legal_records unofficial
    API->>DB: enqueue county_record_lookup / assessor_apn_lookup
    U->>CH: PropertyRegistry.registerProperty optional
```

## Authority Case Pack

```mermaid
sequenceDiagram
    participant A as authority_officer
    participant API as /api/authority
    participant DB as PostgreSQL
    A->>API: search q=APN|address
    API-->>A: property hits
    A->>API: GET case/:id
    API-->>A: occupants + timeline + disputes
    A->>API: POST exports authorityUseAcknowledged
    API->>DB: authority_case_exports + audit + le_case_share_placeholder
    A->>API: POST acknowledge simulated
    API->>DB: authority_acknowledgements + agency_ack_received event
```

![Authority Console search, case view, and case pack export](screenshots/authority-console.jpg)

## Purchase deal (testnet)

Seller opens deal with `disclaimerAccepted` + `fraudWarningAcknowledged`. API soft-warns on unverified KYC, elevated fraud risk, paused listings, open disputes. Reminders: TESTNET FUNDS, NOT A CLOSING; wire-fraud out-of-band verification.

Both acknowledgments are separate checkboxes, and the submit button stays disabled until both are checked:

![Buy / Sell testnet escrow form](screenshots/buy-sell.jpg)

## Dispute review

```mermaid
flowchart LR
    S[Non-owner opens dispute] --> P[pending_review: listing unchanged]
    O[Owner or approved authority opens dispute] --> Op[open: listing paused]
    P -->|admin / authority PATCH open| Op
    Op -->|admin / authority resolve or dismiss| R[Listing unpaused when no open disputes remain]
```

Owners cannot change occupancy status while an open dispute exists.
