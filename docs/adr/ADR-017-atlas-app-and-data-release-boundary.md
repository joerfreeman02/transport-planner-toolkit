# ADR-017: Separate ATLAS application and data release identities

**Status:** Proposed — Technical Director approval required
**Date:** 23 November 2026

## Context

ATLAS publishes application code and prepared national timetable data through related but distinct workflows. The frozen Run #75 regression fixture is a historical test contract; public Bus, TNDS, and TfL iBus roots may later change through an independently approved data publication. Requiring current live data to equal one old test fixture blocks legitimate application-only maintenance. Testing a selected commit from a different checkout than the one assembled for Pages also makes release evidence ambiguous.

## Decision proposed

1. Keep a provenance-bound frozen regression fixture, with raw manifest/index identities and deterministic hosted validation. The original Run #75 artifact remains immutable; any repaired composite is explicitly identified as a new fixture derived from it.
2. Identify live publication separately by the exact data-source configuration, canonical freshness/status manifest digest and currentness value, Bus/TNDS/iBus manifest identities, and referenced iBus index identity. A release requires an explicit approval digest for that complete live snapshot and must preserve it byte-for-byte at the logical source level. A validated status does not imply freshness or production eligibility; `diagnosticOnly` and `productionEligible` remain independently reviewed facts.
3. Identify application code by the full selected commit SHA. Tests and release assembly must run from that exact checkout; the generated Pages release identity must contain the same SHA and a deterministic artifact-tree identity.
4. Keep release scope bounded by a reviewed exact-path manifest anchored to accepted main. Unknown changed files fail closed.
5. Keep app-only release and national-data refresh on the shared non-cancelling Pages concurrency group. A data refresh must pin the accepted application identity; app-only publication must not acquire or rewrite national data.

## Consequences

- A later approved live data snapshot can be paired with a compatible application patch without rewriting the frozen regression evidence.
- The release gate requires explicit live-data approval and traceable app, data, and test-fixture identities.
- Missing, mixed, stale, unapproved, or inaccessible source identities fail closed.
- The status-manifest digest is an independent identity field, so a freshness or eligibility change cannot pass as an unchanged app-only data identity.
- This ADR does not approve Beta.2 acceptance, merge, tag, release, deployment, source refresh, or updater operation.

## Approval

Technical Director: **Pending**

Product Owner: release authorization remains separate and is not granted by this ADR.
