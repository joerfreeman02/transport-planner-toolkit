# BUS-ROBUSTNESS-1A4E-C2 — TfL route-topology / service-endpoint closeout

## Closeout identity

- Repository: `transport-planner-toolkit`.
- Worktree: `atlas-bus-tfl-authoritative-evidence-c2`.
- Branch: `codex/atlas-bus-tfl-authoritative-evidence-c2`.
- Baseline: `cd177f1d66832d03d50e5cb01eccc0ba3184a471` (C1 tip).
- Version: `2.0.0-alpha.15`; no version change.
- Functional implementation commit: `2d55ac4c00ab80dfb689b2ea4a5dd8130aeb2faa`.
- Final tip: this documentation commit on the branch; its full SHA is reported by the closeout response (a commit cannot include its own hash without changing that hash).
- Frozen national prepared-data run: `36125621080`; no fresh national acquisition and no iBus data ingestion.
- C2 review URL: `http://127.0.0.1:8780/atlas/?review=v2#modules`.

## Changed files

Functional commit (`2d55ac4`):

- `src/atlas/adapters/authoritative-bus-timetable-adapter.mjs`
- `src/atlas/adapters/tfl-bus-timetable-adapter.mjs`
- `src/atlas/application/bus-assessment.mjs`
- `src/atlas/domain/bus-service-assessment.mjs`
- `src/atlas/domain/planner-endpoint-decision.mjs`
- `tests/atlas/bus-robustness-1a4e-c1-clipped-pattern-closeout.test.mjs`
- `tests/atlas/bus-robustness-1a4e-c2-endpoint-semantics.test.mjs` (new)
- `tests/atlas/run-all.mjs`
- `tests/atlas/tfl-bus-timetable.test.mjs`

The handover commit adds only this file. No GROUP/CIRC, route-pattern-stop, calendar, frequency, period, or version behavior was intentionally changed.

## Production metadata wrapper

The production route-metadata adapter supplies a source-result wrapper (`{ ok, data, warnings, provenance, ... }`), while the clipped-pattern matcher expects the TfL line payload. C1 handed the wrapper directly to the matcher, so production-shaped route sections could be missed. C2 unwraps `.data` generically while retaining direct-payload compatibility. An `{ ok: false }` result remains a failure and is not converted to a match.

The new C2 test exercises `tflRouteSequenceEvidenceForService` through the same `createAuthoritativeBusTimetableAdapter` composition and wrapped metadata shape. It rejects candidate sections with a direction mismatch, conflicting exact full-route endpoint IDs, incompatible service type, or non-overlapping validity. The focused test passes.

## Topology is not a journey endpoint

The TfL route/sequence sidecar is now explicitly represented as `routeTopologyEndpoints` and `routeTopologyStops`. It can identify branch membership, remove structural ambiguity, and contribute branch/section identity to technical conflict provenance. It is not merged into the exact service endpoint candidate IDs and is not used to hydrate a planner-facing journey endpoint. Exact service endpoints remain grounded in timetable/service or separately authoritative prepared/reference evidence.

The regression uses a clipped interval such as `C-D-E` within `A-B-C-D-E`: the full branch can prove topology, but cannot by itself assert that this journey began at `A`. An unresolved but non-material origin remains technical evidence when route, direction, destination and service family are known and no planner-facing classification changes. Structural ambiguity remains reviewable.

## C1 forensic findings and C2 materiality

Baseline `8da1495101ac7d1c2e9f843b5951df2b6127a44a` had four duplicated generic unknown-origin review items for route 313 (two direction/pattern facts repeated at nearby stops). The C1 handover and its live comparison identify the later 456, 629 and W8 exact-place review facts as newly surfaced after C1 added full-route origin promotion; they were not among the four baseline facts. C1's final live result had three distinct review facts after deduplicating W8 calendar/pattern copies. C2 removes only the non-material topology-origin actionability: it does not hide a planner-material destination, branch, service-existence, short-working, calendar, frequency or period conflict.

In the captures below, “exact schedule IDs” means the IDs carried by the TfL timetable record; it does not certify those IDs as the true endpoints of every journey represented by a clipped interval. C1's endpoint decision also hydrated prepared/reference candidates. The available C1 detailed capture does not preserve a stable route-section ID or the literal TfL `branchId` for each of these three route records; those identifiers are therefore explicitly unknown here, not inferred from the route number or stop sequence. C2 carries deterministic branch/section identity in the aggregate sidecar and conflict key where the source supplies it.

### Route 456 — C1 review StopPoint `490006586W`

- Planner row: route 456, “Towards Crews Hill”; outbound, ordinary calendar; planner direction/destination remained Crews Hill.
- TfL timetable evidence: raw origin `Crews Hill`, raw destination `North Middlesex Hospital`; source origin ID `490006586W`, destination ID `490015155Z`. The displayed ordered pattern continued from the assessed corridor through North Middlesex Hospital; the exact journey origin was not independently established by this clipped row.
- C1 exact endpoint resolution for the origin admitted `490006586W` and prepared/reference candidate `490005913W`. Hydration resolved `490006586W` to Enfield Town / Cecil Road (StopArea `490G00006586`, NPTG Enfield Town `N0075228`) and `490005913W` to Crews Hill (StopArea `490G00005913`, NPTG Crews Hill `N0065140`). C1 retained the raw planner wording Crews Hill and marked `conflict-review`.
- Evidence roles: `490006586W` is the timetable-record origin ID and an exact physical StopPoint; `490005913W` is prepared/reference supplementary endpoint evidence. The C1 promotion of the matched full-route branch origin into the exact candidate set made the topology-vs-service distinction consequential. Neither candidate is elevated by C2 into a different planner destination.
- Route identity/direction, destination, ordinary calendar, frequency/period, and short-working classification did not change. C2 retains the conflict in detailed technical evidence only; it does not create a planner action because the disagreement is origin-only and changes none of those planner-facing facts.
- C2 live table: “Towards Crews Hill” and “Towards North Middlesex Hospital” remain; no 456 planner review item.

### Route 629 — C1 review StopPoint `490009169S`

- Planner rows: route 629, “Towards Turkey Street Station” and “Towards Wood Green Bus Garage”; school-day-only, two journeys/day per direction in the C2 Enfield result.
- TfL timetable records inspected in C1: inbound `Turkey Street Station → Wood Green Bus Garage`, school-day; scheduled record endpoint IDs `490006588R` and `490014852S`. The ordered pattern includes `490009169S` as an internal Cecil Rd / St Annes School StopPoint, not as the raw timetable destination. The opposite route direction was Haringey Civic Centre → Turkey Street Station.
- The C1 live conflict at `490009169S` came from the promoted route-topology endpoint candidate being treated as exact service-origin evidence. Its physical/reference evidence identifies Cecil Rd / St Annes School, StopArea `490G00004904`, NPTG Enfield Town `N0075228`. The timetable's raw destination and exact destination identity remain Wood Green Bus Garage (`490014852S`, StopArea `490G000844`, NPTG Wood Green `E0034415`) for the inbound pattern; Turkey Street is separately evidenced at `490013843S/N` in the opposite/destination patterns, StopArea `490G00013843`, NPTG Bulls Cross `E0034285`. The visible C1 extract does not establish `490009169S` as a true journey endpoint.
- Evidence roles: the C1 record labels `490009169S` as an `origin StopPoint ID`, while the same record's ordered pattern begins `490001101M → 490006588R → 490009169S` and its raw service origin is Turkey Street Station. It is therefore an exact source-assigned clipped-pattern origin candidate and an internal ordered StopPoint, but the capture does not prove that it is the actual journey's origin. The source record labels `490014852S` as the destination ID for Wood Green Bus Garage. Turkey Street (`490013843S/N`) also appears as the other direction's source endpoint. A true journey-origin claim for the clipped interval is unavailable. No route-section ID or literal C1 `branchId` is available in the retained capture.
- C2 keeps both route directions and the school-day qualification; the known school timetable rows remain two journeys/day at approximately 07:00–08:59 and 15:00–15:59. Removing the origin-only planner task changes no destination, route identity, school-only classification, service existence, frequency, or operating period. No C2 planner review item is created for 629.

### Route W8 — C1 review StopPoint `490009169S`

- Planner rows: W8 “Towards Chase Farm Hospital / Main Entrance” and “Towards Picketts Lock Centre”; term-time marker retained, frequency/period unchanged.
- C1 timetable pattern shown for the conflicting direction: raw origin `Chase Farm Hospital / Main Entrance`, raw destination `Picketts Lock Centre`; schedule record origin ID `490009169S`, destination ID `490010990E`. The ordered records include the Enfield Town-area StopPoint in the clipped path. The opposite service pattern ends at exact `490002140ZZ` (Chase Farm Hospital / Main Entrance), StopArea `490G000360`, NPTG Enfield `N0060495`.
- C1 prepared/reference endpoint comparison included `490009169S` (Cecil Rd / St Annes School; StopArea `490G00004904`, NPTG Enfield Town `N0075228`) against `490002140ZZ` (Chase Farm Hospital / Main Entrance; StopArea `490G000360`, NPTG Enfield `N0060495`). C1 marked the origin `conflict-review` while retaining the raw planner endpoint Chase Farm Hospital / Main Entrance.
- Evidence roles: C1 labels `490009169S` as an `origin StopPoint ID`, even though the raw origin is Chase Farm Hospital / Main Entrance and the ordered record starts `490006588R → 490009169S`. It is an exact source-assigned clipped-pattern origin candidate and an internal ordered StopPoint, but not proof by itself of the actual journey's origin. `490002140ZZ` is independently observed TfL endpoint evidence for the Chase Farm end of the opposite pattern; `490010990E` is the Picketts Lock destination ID in this record. The C1 review fact was newly surfaced by C1's endpoint-resolution/topology path, but the retained capture cannot isolate whether the prepared/reference candidate or route-sequence promotion first introduced that candidate into the final set; no stable literal branch or route-section ID survives in the capture. No short-working endpoint is implicated.
- Destination, W8 identity, term-time/calendar family, and frequency/period did not change. The origin disagreement cannot alter a planner-facing fact on this evidence, so C2 retains it as technical evidence and creates no review item. Repeated W8 calendars/pattern copies are one technical fact.

### Baseline/C1 conclusion

The four 313 unknown-origin tasks existed at baseline; the three 456/629/W8 endpoint conflicts did not. C1 introduced their review classification by promoting full-route topology origins into exact endpoint resolution. C2 removes that promotion, not the underlying source records or their technical provenance. Its live Enfield review list is zero; C1 was three after deduplication. This is not a claim that the true origin of each clipped journey has been independently discovered.

## Branch-aware conflict identity and deduplication

`buildServiceSummaries()` now aggregates `routeTopologyEndpoints`, route-topology records, and deterministic route/branch/section identities rather than flattening the sidecar into an endpoint-ID alias. `conflictEndpointFactIdentity()` includes the aggregated topology identity. The mandatory production-path test proves that two conflicts with the same route, direction, endpoint set and opposite endpoint but different authoritative branch identities remain two facts, while repeated calendar/pattern copies of the same branch/place conflict remain one. GROUP and CIRC inputs are unchanged.

## BODS operator consensus

BODS remains supplementary operator metadata only; TfL operator text is never overwritten. Consensus now considers every relevant same-route/stop candidate before accepting unanimity. A blank candidate fails closed, just as conflicting canonical operators or incompatible lineage do. Tests cover Metroline + METROLINE fill, Metroline + Arriva no-fill, Metroline + relevant blank no-fill, incompatible lineage no-fill, and preservation of an existing TfL operator.

Live Enfield summary at 250 m (13 stops, 24 summaries; 9 October 2026):

- 191: Arriva London displayed in both Brimsdown Station and Edmonton Green directions.
- 313: operator remains “not supplied” in both Chingford Station and Potters Bar Railway Station directions.
- 317: Metroline Travel displayed in both Little Park Gardens and Waltham Cross Bus Station directions.

Therefore a bounded, separately approved iBus operator-evidence sprint remains required for unresolved 313 operator data. C2 did not ingest iBus, guess an operator, or change TfL timetable authority.

## Live regression controls

- **Enfield Town, 250 m** (`51.6523584, -0.0783252`): C2 replay completed against frozen run `36125621080`; 13 stops, 14 distinct routes, 44 detailed route × StopPoint pairs, 24 planner summaries. Before/after actionable review counts: baseline 4 generic 313 items → C1 3 deduplicated endpoint conflicts → C2 0. Routes 121, 191, 192, 231, 307, 313, 317, 329, 377, 456, 629, N29, W8 and W9 retained. No 313 endpoint warning returned. Both required principal directions remain; Dame Alice Owen's School is separate/restricted and Crown Road (EN1) remains the named short working. Sources/checks complete, with TfL/supplementary route-identity and frequency/operating-period qualifications retained.
- **Chingford Mount / Normanshire Drive, 250 m** (`51.616596, -0.011789`): 2 stops, 8 planner summaries, zero evidence items to review. Routes 357, 444, 657 and W16 remain. Route 657 remains school-days-only: one journey/day at approximately 07:55 toward Bancroft's School and one at approximately 16:26 toward Salisbury Hall Sainsbury's. These minute values reflect the current frozen replay; no service was generalised beyond the school calendar.
- **Waltham Cross Bus Station, 250 m** (`51.685520, -0.031123`): 6 stops, 19 summaries; protected route families 13/13A/B/C, 15/15A, 16/16C, 66, 251, 279, 317, 327, 491 and N279 remain. The pre-existing OSRM review at `210021703430` and “no bus stops within selected distance” anomaly remain despite returned stop records, matching the C1 baseline. C2 did not worsen or fix these; retain both as explicit BUS-ROBUSTNESS-1B Planner Trust inputs.

## Protected behavior and parity

Focused C2 and adapter tests pass. The deterministic suite remains the gate for the wider protected matrix: 313 Chingford/Potters Bar/Crown Road/school extension; 121, 191, 192, 231, 307, 317, 329, 377, 456, 629, N29, W8; 357, 444, school-only 657, W16; the listed Waltham route families; GROUP, DEST, CIRC, endpoint aliases, term-time/calendar, school-only, source authority, frequency, operating period, and Browser/Word parity. `node tests/atlas/run-all.mjs` passed on the clean pre-closeout-documentation-record tip `aa0728101422d2302d35f80fa78e65f12c2a68cf` and ended exactly `ATLAS Alpha.15 deterministic suite passed.` The final documentation tip is rerun after recording this result; that final clean-tip outcome is also included in the task response.

No push, PR, merge, deployment, version change, new source acquisition, or tooling installation/reconfiguration was performed. The branch remains local-only; origin parity is therefore not claimed.

## GitHub tooling adoption review (no changes)

- **Dependabot:** retain as the existing dependency-update baseline.
- **Codecov:** defer adoption/configuration pending an explicit coverage policy and repository approval.
- **OpenSSF Scorecard:** candidate for a read-only repository security-posture check; do not enable or configure in this sprint.
- **Sentry:** defer; telemetry and privacy/security review are required before adding runtime error reporting.
- **Renovate:** no adoption now; it overlaps the existing Dependabot role and would add duplicate update automation.

## Recommendation

**READY FOR TECHNICAL DIRECTOR REVIEW**. The 456/629/W8 planner-origin tasks are removed as non-material endpoint disagreements and remain inspectable as technical evidence. Waltham's existing access/coverage anomalies and the unresolved 313 operator are recorded, not concealed or expanded into this sprint.
