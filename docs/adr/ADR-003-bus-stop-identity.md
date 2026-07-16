# ADR-003 — Bus stop identity and pairing model

- **Status:** Accepted
- **Date:** 2026-07-16
- **Owner:** Bus Module Owner

## Context

Opposite-direction stops may share a name but are legitimate separate boarding points. Source data may also contain true duplicates.

## Decision

Use the source-system stop identifier as the primary identity when available. Otherwise derive a deterministic identity from normalised name, rounded coordinates and direction. Pairing/grouping is a separate relationship and never collapses distinct directional stops. Exact source identity is de-duplicated; proximity/name similarity produces a review warning rather than silent deletion.

## Consequences

The user can understand direction and stop pairs while duplicate records remain controlled.
