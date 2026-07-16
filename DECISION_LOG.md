# Decision Log

## D001 — Canonical baseline
Sprint 2A is the canonical Railway baseline because it was confirmed working by the product owner. Sprint 2B is rejected and must not be merged.

## D002 — Module isolation
Accessibility, STATS19, Railway and future modules remain in separate module folders. Railway changes must not modify Accessibility or STATS19 files.

## D003 — Release gate
Every package must pass the foundation regression check before release and show a unique build identifier in the interface.

## D004 — Assisted research
The assisted station-research bridge remains approved, but it will be reintroduced as an isolated Railway-only feature after regression protection is in place.

## D005 — Sprint 4 Bus Foundation
The Technical Director approved Sprint 4 on 16 July 2026. Shared contracts, Bus architecture and frozen-module regression are one controlled sprint. The Toolkit is a commercial-grade internal platform.

## D006 — Project Data Model
Report Builder depends upon the Project Data Model. A complete Project Manager UI is not a prerequisite.

## D007 — Architecture Decision Records
Significant architecture decisions are controlled through sequential ADRs in `docs/adr/`, beginning ADR-001.
