# ADR-005 — Shared mapping adoption strategy

- **Status:** Accepted
- **Date:** 2026-07-16
- **Owner:** Technical Lead

## Context

Accessibility and Railway have confirmed working maps. Rewriting them would breach frozen-baseline controls.

## Decision

Retain the provider-neutral shared mapping contract, but implement BUS-0.2.0 through a self-contained classic-script bootstrap and core until real-browser startup is proven. Do not migrate frozen modules during Sprint 4. Shared runtime adoption follows accepted browser evidence rather than preceding it.

## Consequences

Bus becomes the reference consumer. Future frozen-module adoption requires separate impact assessment and regression approval.
