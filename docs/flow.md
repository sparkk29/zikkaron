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

## Purchase deal (testnet)

Seller opens deal with `disclaimerAccepted` + `fraudWarningAcknowledged`. API soft-warns on unverified KYC, elevated fraud risk, paused listings, open disputes. Reminders: TESTNET FUNDS, NOT A CLOSING; wire-fraud out-of-band verification.
