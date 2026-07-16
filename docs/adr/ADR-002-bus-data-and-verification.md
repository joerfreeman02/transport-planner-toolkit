# ADR-002 — Bus data acquisition and verification strategy

- **Status:** Accepted
- **Date:** 2026-07-16
- **Owner:** Bus Module Owner

## Context

Bus stops and timetables can come from mapped data, operator material and user research. Sources change and may disagree.

## Decision

Separate stop discovery from service verification. Discovery may use an adapter-backed mapping source. Service data is accepted only with source, retrieval date and explicit verification state. Provider failures remain visible and never mean that no stops or services exist. Imports are schema-validated before review.

## Consequences

The first Bus release supports controlled manual/research evidence and provider adapters; it does not claim an automatically verified timetable.
