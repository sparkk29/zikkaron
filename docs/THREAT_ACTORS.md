# Threat actors — Zikkaron

## Fraudsters

| Pattern | Product response |
|---------|------------------|
| Forged deeds / impersonation | KYC hashes, APN + instrument binding, fraud_risk_level, attestation packs |
| Fake listings | Seller KYC soft gate, dispute pause, owner risk warnings on deals |
| Wire-fraud diversion | Out-of-band wire reminder; no USD rails in MVP |
| Fake leases / fake “recordings” | Lease CID memorials; `is_official_county_record` default false until simulated verify; mismatch disputes |

## Squatters / unauthorized occupants

| Pattern | Product response |
|---------|------------------|
| Vacant-home takeover | `vacant_secured` status, incident memorials, PossessionMemorial anchors |
| Fake lease shown to police | Authorized occupancy registry visible in Authority Console |
| No owner paper trail | Chronological export + evidence CIDs for counsel / LE |

## Abusers of the platform itself

| Pattern | Mitigation |
|---------|------------|
| Spoofed authority wallet | Disclose demo auth; future SSO |
| Vigilante harassment lists | Not built; no public blacklist UI |
| Fake agency seals in UI | Explicitly forbidden in brand rules |
| Self-help eviction coaching | Legal copy forbids; notices ≠ service |

## Residual risk

Determined adversaries can still forge documents offline, spoof demo headers, or ignore lawful process. Zikkaron reduces coordination friction for honest owners and partner agencies; it does not eliminate fraud or trespass.
