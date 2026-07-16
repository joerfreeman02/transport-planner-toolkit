# ADR-005 — Shared mapping adoption strategy

- **Status:** Accepted
- **Date:** 2026-07-16
- **Owner:** Technical Lead

## Context

Accessibility and Railway have confirmed working maps. Rewriting them would breach frozen-baseline controls.

## Decision

Define a provider-neutral shared mapping contract and implement its first adapter for Bus. Do not migrate frozen modules during Sprint 4. The contract owns lifecycle, layers, marker events, attribution and accessible equivalents; Bus owns stop selection and assessment rules.

## Consequences

Bus becomes the reference consumer. Future frozen-module adoption requires separate impact assessment and regression approval.
