# ADR-006 — Shared Library publishing

Date: 16 July 2026  
Status: Accepted interim architecture

## Decision

Load deployed Rail, Bus Stop and Bus Route masters read-only for every user. Permit authorised workstations to publish deterministic reviewed merges through the GitHub REST Contents API using a user-entered fine-grained token stored in sessionStorage or, by explicit choice, localStorage.

Application writes are hard-restricted to:

- `data/knowledge/rail-library.json`
- `data/knowledge/bus-stop-library.json`
- `data/knowledge/bus-route-library.json`

The client fetches the latest SHA, protects newer verified records, previews changes, requires confirmation, retries conflicts from the latest master and retains local drafts until GitHub confirms success. Tokens are never committed, exported, diagnosed, logged or rendered after entry.

## Consequences

This enables company-wide reuse without a backend but places credential stewardship on authorised users. A backend or GitHub App remains the preferred future commercial architecture.

## 2.1 implementation amendment

Railway and Bus expose in-context publish and refresh controls, but both delegate authentication, preview, merge protection and GitHub writes to this single shared service. Modules must not duplicate token storage. Dashboard controls remain available for administration.
