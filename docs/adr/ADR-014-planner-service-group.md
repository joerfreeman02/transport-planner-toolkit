# ADR-014 — Production-fidelity PlannerServiceGroup abstraction

Status: Proposed for Alpha.15 Technical Director review
Date: 2026-09-14
Owner: ATLAS engineering

## Context

The deployed Waltham Cross replay exposed a production failure mode that could not be represented safely by source-record identity: one public route direction was split across operator names, feed records, timetable registrations, short workings and nearby served stops. Route 242 was promoted to four planner rows although the evidence established two public directions. Frequency was also at risk of being calculated from a non-basis stop or from duplicated provider records.

## Options

1. Keep source records as planner rows and document the resulting fragmentation.
2. Collapse each route to a fixed number of rows after presentation, hiding excess evidence.
3. Build an auditable `PlannerServiceGroup` from compatible route-direction and corridor evidence, then derive headline fields, served stops, basis-stop calculations, operator evidence and source traceability from that group.

## Decision

Option 3 is adopted for Alpha.15. A planner group is formed within a normalized route number using deterministic connected components. Public direction compatibility is established from ordered endpoint orientation plus supporting source-lineage, pattern, corridor and served-stop evidence. A feed's direction marker is supporting evidence rather than a global identity: the production 242 replay demonstrates that marker conventions can reverse between operators. Reverse endpoint or ordered-pattern evidence remains a hard separation, and ambiguous markerless records cannot bridge explicit opposite directions.

The group retains all selected served stops, while the timetable basis is selected only from stops with scheduled evidence and then ranked by routed walking distance, discovery distance and stop ID. Frequency and operating periods use only departures at that basis. The row marks the basis in a multi-stop `Served at` value and lists the other served stops with their distances. Operator aliases are normalized for identity but raw operator names remain available as evidence; genuinely distinct operators are displayed together. Raw service summaries, source IDs, alternate destinations, pattern evidence, calendar evidence and an audit identity remain attached to the row.

Physical-journey deduplication uses journey identity only when the semantic departure agrees, preserving distinct provider-scoped records when the same local ID is attached to different route semantics. Distinct physical journeys at the same minute therefore remain countable. Circular status is retained for a genuinely closed loop, but an open two-way route family is not allowed to present a circular duplicate.

## Consequences

- The deployed `github-pages` artifact from workflow run `34783354786` is replayed by `tests/atlas/fixtures/alpha15-waltham-cross-production.json`; the fixture is provenance-bearing and network-free.
- `tests/atlas/alpha15-production-fidelity.test.mjs` verifies the production-shaped 25C, 66, 242, 310, A1 and 317 rows, including 242 operator consolidation, all served stops and basis-stop evidence.
- `tests/atlas/alpha15-planner-service-group.test.mjs` covers operator variants, route-number normalization, short workings, incomplete nearest-stop evidence, physical-journey deduplication, same-minute distinct journeys, calendars, circular controls, disjoint corridors, markerless reverse directions and unresolved identities.
- `npm run review:atlas:alpha15` prints the same planner rows used by Browser and Word for a direct local review without hand-editing JSON. `tools/atlas-review/run-review.cmd` remains the loopback browser review entry point.
- No updater workflow, acquisition source, old repository metadata or existing dirty checkout is changed by this abstraction.
