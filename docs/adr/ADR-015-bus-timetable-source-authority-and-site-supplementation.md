# ADR-015 — Bus timetable source authority and site-scoped supplementation

Status: Accepted for BUS-BETA-S1 implementation; Technical Director review required
Date: 2026-10-16
Owner: ATLAS engineering

## Context

ATLAS Bus already prepares and serves BODS and TNDS timetable evidence through local StopPoint shards, and its existing planner intelligence consolidates compatible route directions and physical journeys. The closed R46-I1 investigation found deterministic overlap but did not establish a universal national BODS↔TNDS service-record identity. Reusing national route or record identity for site arbitration would risk suppressing real local services or double-counting evidence.

## Options

1. Treat BODS and TNDS as nationally interchangeable records and attempt a one-to-one identity bridge.
2. Use route number alone to suppress TNDS whenever a BODS route has that number.
3. Arbitrate only evidence scoped to eligible local StopPoints, retaining BODS priority when local equivalence is positively established and otherwise keeping current usable TNDS evidence as a supplement.

## Decision

Option 3 is adopted.

- Direct TfL timetable evidence remains the authority for TfL services. Existing iBus lineage/enrichment rules remain in force; national evidence does not displace a usable TfL timetable.
- Outside TfL authority, BODS is primary when its local scheduled evidence is usable. Current prepared TNDS evidence may supplement it.
- The prepared-data boundary scopes both feeds to the selected eligible StopPoints. BODS/TNDS equivalence requires the normalized public route number, exact non-empty local called StopPoint set, exact normalized operator, compatible positive direction/corridor evidence, and no conflicting circular classification. Endpoint pairs are ordered. If the evidence is insufficient or conflicts, the records remain separate; route number alone never suppresses a service.
- An equivalent TNDS copy is omitted from planner input and BODS retains timetable provenance and departures, preventing duplicate rows and frequency inflation. A distinct exact local TNDS service remains available to the existing planner intelligence. It is not promoted into a global BODS identity graph.
- Provenance is retained in service records and planner summaries. The browser planner may show the primary source (`TfL`, `BODS` or `TNDS`) as a compact source label. Word output remains source-neutral.
- Existing shard/request completeness and review state remains machine-readable. Failed acquisition, missing shards and unprocessed requests are not converted to a zero-service conclusion. No technical source warning is added to the planner summary.
- Stop identity continues to use the existing exact resolver and eligible-call semantics. No fuzzy stop matching, nearest-stop reassignment or guessed unresolved-call recovery is introduced.
- R46-I1 national identity discovery is closed. Its exact region + normalized route + ordered StopPoint pattern comparison remains diagnostic/review corroboration only, not service identity.

## Consequences

- `mergeBusTimetableSources` is the isolated site-scoped arbitration boundary after the prepared BODS and TNDS records are scoped to the assessment StopPoints.
- A TNDS service calling an exact eligible local StopPoint can supply local timetable evidence when BODS has no usable local schedule for that service.
- Distinct operators, directions, stop sets, endpoint pairs, circular classifications and under-specified records are preserved rather than guessed equivalent.
- Browser source provenance does not change the Word export schema or service content.
- Deterministic tests cover the local equivalence contract and browser/Word provenance boundary; existing production-fidelity and control tests remain the regression gate.

## Exclusions

No national service identity bridge, full-feed join, fuzzy matching, data reacquisition, TfL authority redesign, planner-intelligence rewrite, version increment, Beta declaration, release, or R46-I1 evidence rewrite is part of this decision.
