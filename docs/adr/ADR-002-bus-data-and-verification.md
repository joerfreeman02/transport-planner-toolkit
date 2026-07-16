# ADR-002 — Bus data acquisition and verification strategy

- **Status:** Accepted
- **Date:** 2026-07-16
- **Owner:** Bus Module Owner

## Context

Bus stops and timetables can come from mapped data, operator material and user research. Sources change and may disagree.

## Decision

Separate stop discovery from service verification. Discovery may use an adapter-backed mapping source. Service data is accepted only with source, retrieval date and explicit verification state. Provider failures remain visible and never mean that no stops or services exist. Imports are schema-validated before review.

For the BUS-0.2.0 corrective baseline, direct NaPTAN ingestion remains the preferred target but is not falsely represented as a browser-radius API. Stop identity uses NaPTAN/ATCO codes where supplied in mapped stop data; OSM discovery is explicitly labelled as fallback and uses sequential providers with firm timeouts. Manual service evidence is suspended.

## Consequences

The corrective release proves only site, stop and walking/cycling access workflows. Timetable and service evidence remain out of scope until the core baseline is accepted.
