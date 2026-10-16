# R46-I1 — Deterministic cross-source service-pattern identity discovery

**Status:** complete, diagnostic only.

**Decision:** do not accept a national PRIMARY↔TNDS service identity bridge from the current candidate keys. Carry exact route-pattern matches forward as review candidates only.

**Bus Beta closure:** the national identity-discovery line is **CLOSED for Bus Beta**. Reopen it only under a later approved requirement. No further national identity analysis or BODS/TNDS planner supplementation is implied by this discovery.

**Release status:** remain `2.0.0-alpha.15` with marker `ATLAS-2.0.0-alpha.15-20260914`. This closeout makes no Beta declaration.

## Scope and frozen evidence

This sprint compared the governed Run #45 PRIMARY and TNDS reconciliation checkpoints bound by Run #46. The user-supplied TNDS ZIP was verified before use at 980,641,406 bytes with SHA-256 `ddfa7dee4b2a41cccc49e9b8f77bb68069e8aef7138c8ad322bbb484a0e293bc`; it matches the supplied expected digest exactly. It was copied and safely extracted under the diagnostic workspace, outside the repository. The original artifact was not changed.

| Evidence | SHA-256 | Snapshot / size |
|---|---|---|
| PRIMARY checkpoint ZIP | `e135d52abfb36eba1341ac814aa3e0d5e81e568edb2c8de2f6afea31a11a482b` | snapshot `13e2895be61c5bb5adaf8adec9896520b8224ff243766818d3ca920f0eae71e1`; 1,450,209 rows |
| TNDS checkpoint ZIP | `ddfa7dee4b2a41cccc49e9b8f77bb68069e8aef7138c8ad322bbb484a0e293bc` | snapshot `76ee662a30e5bcb0072c93f4dd3a8efe85c41446ca318a1d6f5700070f5bf058`; 12,945,193 rows |
| Run #46 evidence ZIP | `c61086e2fd278b13e0012ec21a4afb8c3b9ccf9d4475e67cec6473921fcfc301` | binds to both snapshots and checkpoint producer run `38731043427` |

The TNDS checkpoint manifest and Run #46 embedded TNDS manifest agree on producer commit, branch, snapshot, aggregate projection digest, fingerprint, service count and evidence-row count. Every projection shard digest, aggregate digest and projection metadata digest was checked. Streamed row counts match both checkpoint manifests. Repeated prepared-service evidence conflicts: zero on both sides.

No TNDS reacquisition or other source acquisition was performed. No BODS, NaPTAN, NPTG, TfL or iBus data was fetched. The checkpoint ZIPs were only read. No production reconciliation behavior, planner output, or workflow was changed; no GitHub Actions were run.

## Method

The diagnostic streams JSONL.GZ checkpoint shards into a disk-backed SQLite database and deduplicates stop-level evidence by `(side, region, preparedServiceId)`. Route numbers use Unicode NFKC, case folding and collapsed whitespace. Stop IDs use the comparator’s exact whitespace removal and uppercase normalization; order and repeated calls are preserved. A route-pattern key is `(region, normalized route, exact ordered stop sequence)`. Only complete StopPoint sequences are considered source-neutral candidates. Source-specific `gtfs:` tokens remain non-clean even if textually equal.

The report measures direct native service-ID equality, exact route-pattern equality, route-pattern plus operator, and the current composite without route. It counts services and evidence-row coverage, multiplicity, region spread and semantic differences. Pipers Lane and Queensgate are bounded controls using only the frozen call-eligible stop lists. Pipers Lane is SE; Queensgate is EM. The four Queensgate BCE entrance IDs are excluded as non-call infrastructure.

## National findings

The PRIMARY checkpoint contains 38,727 prepared services, of which 1,980 are London and outside the TNDS comparator. The eight-region comparator therefore contains 36,747 PRIMARY services and 282,687 TNDS services. All have route and ordered-sequence fields. PRIMARY has 37,045 clean StopPoint patterns and 1,682 services containing unresolved GTFS pattern tokens; TNDS has 282,687 clean patterns and no such tokens. Neither side has an incomplete sequence.

| Candidate | Shared keys | One-to-one keys | Keys with multiplicity | PRIMARY coverage | TNDS coverage |
|---|---:|---:|---:|---:|---:|
| Direct native ID | 5 | 0 | 5 (100%) | 11 / 36,747 (0.03%) | 23 / 282,687 (0.01%) |
| Region + route + exact ordered StopPoint pattern | 21,029 | 9,617 | 11,412 (54.27%) | 21,124 (57.48%) | 213,302 (75.46%) |
| Route-pattern + operator | 13,728 | 6,832 | 6,896 (50.23%) | 13,736 (37.38%) | 100,925 (35.70%) |
| Current composite without route | 4,201 | 2,233 | 1,968 (46.85%) | 4,241 (11.54%) | 39,059 (13.82%) |

Direct IDs are sparse and every shared key is many-to-many or one-to-many. Adding operator reduces coverage substantially and still leaves half the shared keys with multiplicity. Omitting route from the composite creates 228 cross-source service pairs with different route numbers, so that key is not safe as a service identity.

Exact route-pattern coverage varies by region:

| Region | PRIMARY covered / total | TNDS covered / total |
|---|---:|---:|
| EA | 1,051 / 2,379 | 3,494 / 5,908 |
| EM | 2,588 / 4,142 | 12,899 / 21,798 |
| NE | 1,765 / 2,801 | 14,015 / 20,677 |
| NW | 3,198 / 4,889 | 35,193 / 41,451 |
| SE | 4,331 / 8,223 | 30,617 / 49,450 |
| SW | 5,008 / 6,576 | 47,999 / 55,095 |
| WM | 1,877 / 3,861 | 24,404 / 32,030 |
| Y | 1,306 / 3,876 | 44,681 / 56,278 |

The 21,029 shared clean route-pattern keys produce 215,014 service pairs because several keys contain multiple prepared services. Of those pairs, 175,954 differ in operator or an endpoint. Across all exact-pattern pairs, the differing-field counts are: operating days 189,518; validity period 214,905; destination 149,667; operator 114,036; origin 21,372. These fields can describe distinct timetable variants even when the route and stop sequence agree. The shared-key groups also contain TNDS variants in prepared-service identity (11,396 keys), operating days (7,992), validity period (4,401), source archive (4,596), and source service ID (1,995).

## Bounded controls and unresolved calls

**Pipers Lane (SE, 11 call-eligible stops):** one PRIMARY service and nine TNDS services touch the control stops. The exact route-pattern bridge count is zero. Route 230 has one service on each side, with no exact ordered-pattern bridge; route 231 has eight TNDS services and no PRIMARY counterpart. Routes 46 and C have no matching service in this bounded control. The non-bridge outcome is consistent with differing or unsupported local source coverage; proximity or route labels do not authorize a match.

**Peterborough Queensgate (EM, 53 eligible call stops):** 145 PRIMARY and 342 TNDS services touch the eligible stops. There are 93 shared clean route-pattern keys, linking 93 PRIMARY and 287 TNDS prepared services. Only 53 keys are one-to-one; the remaining groups include one-to-53, one-to-41, one-to-12 and other many-service variants. Nine services are non-clean. BCE IDs `0590BCE01L`, `0590BCE02L`, `0590BCE03U` and `0590BCE04U` were excluded.

The frozen Run #46 unresolved summary reports 4,908 unresolved scheduled calls, 161 raw GTFS stop IDs, 214 unique region-scoped stop identity keys, and 201 keys in TNDS comparator scope. Twenty-two comparator-scope keys (854 references) are present in TNDS; 179 are absent. It reports zero exact service-identity corroborations. This sprint additionally links 427 PRIMARY services by exact region, route ID and route number; 318 of those have a same-number TNDS route, and 38 have an exact TNDS route-pattern key. Same-route results are route-only candidates, not corroboration.

Using exact normalized region and route number to scope raw-stop sequence checks, all 22 referenced keys occur in 160 TNDS prepared-service patterns, with 233 stop-sequence references. This is a stop-pattern overlap count, not service identity: the route ID is not corroborated across sources and Run #46 still reports zero exact service-identity corroborations. London’s 1,748 unresolved calls remain outside TNDS comparator scope.

## Decision and candidate contract

Do not publish a direct bridge or use a route-pattern key as accepted service identity. The best discovery key is `(region, normalized route, exact ordered StopPoint IDs)`, but it defines an equivalence class with substantial multiplicity, not a unique service. Route-pattern plus operator and the route-free composite both reduce coverage and retain high ambiguity. No direct ID path provides a useful unique baseline.

For a follow-on design, store this key as a **candidate grouping key** with all source members and provenance. Keep native prepared and source IDs, source snapshot/archive, operator, origin, destination, operating days, validity dates and ordered calls on each member. Classify a candidate group as one-to-one, one-to-many, many-to-one, many-to-many, non-clean or cross-route. Require explicit semantic adjudication before any accepted identity relation; never discard calendar or validity variants by collapsing on pattern alone. Keep the contract versioned and diagnostic until a separate production-change decision is made.

The next controlled sprint should define and implement the approved **site-scoped timetable-source hierarchy**, with source authority and precedence made explicit per site. It should not extend this national identity-discovery line absent a newly approved requirement.

## GitHub tooling adoption review

- Dependabot: configured.
- Codecov: deferred until a formal coverage baseline is approved.
- OpenSSF Scorecard: reserve for a later release/security milestone.
- Sentry: deferred pending telemetry and privacy architecture.
- Renovate: do not add in parallel with Dependabot without an approved reason.

## Artifacts and verification

- Deterministic detailed evidence: [`identity-bridge-discovery.json`](../../diagnostic/atlas-bus-data-trust/r46-i1/identity-bridge-discovery.json)
- Human-readable generated summary: [`identity-bridge-discovery.md`](../../diagnostic/atlas-bus-data-trust/r46-i1/identity-bridge-discovery.md)
- Analyzer: [`identity_bridge_discovery.py`](../../tools/atlas-bus-data/identity_bridge_discovery.py)
- Focused tests: [`test_identity_bridge_discovery.py`](../../tools/atlas-bus-data/test_identity_bridge_discovery.py)

The report is diagnostic-only, planner-ineligible, and records unchanged source authority and projection fingerprint. It uses a preserved SQLite copy whose service/evidence totals were checked against the checkpoint manifests before summarization. The JSON and Markdown outputs are deterministic. Full test and worktree verification results are recorded in the sprint closeout message.
