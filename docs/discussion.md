# Discussion — Zikkaron

## Problem

US property owners and public agencies face two overlapping threats:

1. **Fraudsters** — forged deeds, owner impersonation, fake listings, wire-fraud diversion, fake leases, PDFs that do not match county instruments.
2. **Unauthorized occupants / squatters** — vacant-home takeover, “I have a lease” disputes at the door, thin paper trails for true owners when police arrive.

County systems, LE CAD, and courts are authoritative — but officers and clerks often lack a structured, shareable view of *who the owner claims is authorized*, *what was hashed when*, and *whether a lease appears in any memorial*.

## Thesis

Zikkaron is a **parallel memorial + civic handoff** layer. It does not replace recording, policing, or adjudication. It makes handoff cheaper and clearer:

- Owners maintain APN-bound memorials, authorized occupancy, and incident timelines.
- Authority officers (demo role in MVP) look up properties read-only and export **Authority Case Packs** with audit logs.
- Title officers perform **simulated** county-record verify as a stand-in for human-in-the-loop recorder workflow.

## Partnership posture

Authorities remain sovereign. Zikkaron assists. Marketing and UI must never imply current sheriff/county endorsement, fake seals, or .gov identity. MVP ships `agencies`, `government_api_queue`, and export acknowledgements as **architecture for partnership**, not live MoUs.

## Why blockchain + IPFS

- Timestamped, tamper-evident anchors (`PossessionMemorial`, deed/lease CIDs).
- Not a substitute for county seals; hashes prove integrity of *what was submitted*, not authenticity of a government instrument.

## Roles

`admin`, `seller`, `buyer`, `tenant`, `title_officer`, `authority_officer`.

## Out of MVP

CJIS, NCIC, live CAD, live recorder APIs, real MoUs, mainnet, USD rails, MLS, facial recognition, warrant systems.
