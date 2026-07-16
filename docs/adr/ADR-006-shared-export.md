# ADR-006 — Shared export adoption strategy

- **Status:** Accepted
- **Date:** 2026-07-16
- **Owner:** Technical Lead

## Context

Accessibility and Railway already use the EAS Word-table formatter. Future outputs require consistent metadata and review status.

## Decision

Retain the working formatter and place a versioned export-envelope contract in front of it. Modules supply validated domain tables and metadata; the formatter owns presentation and safe file creation. All output is labelled as a professional draft pending planner review.

## Consequences

Existing exports remain frozen while Bus adopts the complete contract. Formatter changes require regression across every consumer.
