# ADR-007 — Project Data Model boundary

- **Status:** Accepted
- **Date:** 2026-07-16
- **Owner:** Technical Lead

## Context

Modules require common site context and Report Builder will require structured project data. A full Project Manager UI is not a prerequisite.

## Decision

Create a versioned project-context contract independent of any interface. Modules may read a validated project context and emit output referencing its stable project identifier. Report Builder depends upon this Project Data Model.

## Consequences

Project Manager and Report Builder can evolve independently around the same data boundary.
