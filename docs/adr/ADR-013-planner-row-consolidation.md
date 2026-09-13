# ADR-013 — Production-representative planner row consolidation

Status: Accepted for Alpha.14 implementation; Technical Director review required
Date: 2026-09-13
Owner: ATLAS engineering

## Context

Alpha.13 manual acceptance found that production-shaped timetable variants could become extra planner rows even when they represented the same principal route direction. Circular/linear classification, alternate termini, operator naming, source pattern IDs and selected-stop variants were being allowed to act as identity boundaries. The result was especially visible on 25C, 310, 46 and 230. Calendar applicability is also evidence for presentation, not a route identity.

## Options

1. Truncate each route to two rows after grouping.
2. Treat every source record, operator label, StopPoint or calendar profile as a headline row.
3. Consolidate compatible evidence by route, principal direction and genuine corridor, then present calendar profiles and variants inside that row.

## Decision

Option 3 is adopted. Planner identity follows this hierarchy:

`route number → principal direction / genuine corridor → calendar-specific presentation within the row`.

Circular versus linear is retained as service-family evidence and cannot by itself create a second row. A source route lineage, proven ordered pattern relationship, shared pattern evidence or compatible endpoint evidence may establish a variant relationship. Explicitly disjoint patterns without a common source lineage remain separate, protecting genuinely distinct corridors and opposite directions. StopPoint differences select and scope evidence; they do not define direction identity.

The representative stop is selected after compatible route-direction consolidation. Canonical departures are then deduplicated by physical journey identity at that stop, while raw service records, source lineage, provenance and alternate destinations remain available. The planner summary audit reports every route, row count, direction/corridor identity, representative stop, operator family, headline destination and variant count; routes above an expected production count are reported rather than hidden.

## Consequences

- Production-representative replay fixtures are mandatory for 25C, 310, 46 and 230, with 317 inspected as a surrounding control.
- The accepted row-count controls are 25C 2, 66 2, 242 2, 310 2, 46 2, 230 1, 231 1, 357 2, 444 2, W16 2 and 657 1.
- The Alpha.13 manual-acceptance failure is corrected without `rows.slice(0, 2)` or any other hidden truncation.
- Alpha.13 calendar-safe frequency, operating-period, deduplication, provenance and Browser/Word parity contracts remain in force.
- A route above its expected count is an explicit QA failure or documented exception requiring review; it is not silently compressed.
