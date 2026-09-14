# Alpha.15 production replay runtime diagnosis

Date: 2026-09-14

This note records the diagnosis before the Alpha.15 replay or planner is
corrected. The assessment is represented anonymously; the committed replay
does not retain the assessment-origin coordinate or a private client identity.

## Result

The original PR #44 replay was not at the deployed planner-input boundary. It
selected prepared BODS records from the Pages `bus` dataset only. The deployed
cross-boundary assessment composes that national BODS result with the
supplementary TNDS result, and also performs the live TfL branch for returned
TfL StopPoints. The relevant public target routes are national records in this
assessment, so the omitted TNDS records are the material source of the
fragmentation.

The original fixture contained 33 prepared BODS records and produced these
Alpha.14 counts:

| Route | Alpha.14 rows from original fixture |
| --- | ---: |
| 25C | 2 |
| 66 | 2 |
| 242 | 4 |
| 310 | 2 |
| A1 | 2 |

The runtime reconstruction used the same selected public StopPoint IDs and
the deployed run-19 manifests/shards, then applied the same normalization,
StopPoint scoping and BODS/TNDS fingerprint merge as the browser adapter. It
retained only the declared route-control scope after that runtime boundary.
The resulting evidence counts are:

| Stage | Count |
| --- | ---: |
| Selected StopPoints | 16 |
| BODS shards loaded | 5 |
| BODS raw services in those shards | 3,776 |
| BODS scoped services | 97 |
| TNDS shards loaded | 3 |
| TNDS raw services in those shards | 7,075 |
| TNDS scoped services | 373 |
| BODS/TNDS merged services | 156 |
| Route-scope runtime input | 53 |
| Service summaries supplied to the planner | 48 |

On that runtime-composed input, the unmodified Alpha.14 planner produces:

| Route | Runtime input records | Alpha.14 rows |
| --- | ---: | ---: |
| 25C | 4 | 4 |
| 66 | 12 | 4 |
| 242 | 21 | 8 |
| 310 | 6 | 4 |
| A1 | 6 | 4 |

This reproduces the material Product Owner failure shape: 25C, 66, 242,
310 and A1 are all fragmented above the intended public-direction counts,
with 242 additionally spanning Central Connect and Uno evidence.

## Exact deployed path

The deployed Pages artifact is `github-pages` from workflow run `34783354786`
(run 19), whose source head is
`0efdaf4f33b5db5d1e057f43ddfd16d0e15477ba`.

The runtime path is:

`atlas/assets/js/app.mjs` creates the TfL StopPoint, prepared national,
authoritative timetable, stop-discovery and assessment objects (lines 6-32).
The full Bus action first calls `busAssessment.inspectScope`, then calls
`busAssessment.assess` (lines 661-706). `src/atlas/application/bus-assessment.mjs`
discovers and groups authoritative stops, enriches them with access routes,
calls the authoritative timetable adapter, and returns the assessment result
(lines 179-230 and 290-320).

For this point the cross-boundary `bus-stop-discovery` path merges NaPTAN and
TfL StopPoint records by public StopPoint ID. The authoritative timetable
adapter then calls `prepared-bus-data-adapter.servicesForStops` for the
national scope and the TfL timetable adapter for returned TfL StopPoints
(`src/atlas/adapters/authoritative-bus-timetable-adapter.mjs:199-334`). The
prepared adapter loads the Pages BODS service shards, the Pages TNDS manifest
and stop-prefix shards, normalizes and scopes records, and applies
`mergeBusTimetableSources`
(`src/atlas/adapters/prepared-bus-data-adapter.mjs:174-271`).

The resulting composed services are passed to
`buildServiceSummaries(selectedStops, services)` and then to
`buildPlannerBusServiceSummaries(serviceSummaries, selectedStops)` in
`src/atlas/application/bus-assessment.mjs:295-299`. The result is stored as
`currentBusResult.plannerServiceSummaries` and rendered as Browser Table 3.3
by `renderAssessment` in `atlas/assets/js/app.mjs:455-532`. Word export consumes
the same selected result through `buildBusWordTables`, so it is downstream of
the same planner boundary.

## Why PR #44 was clean for four routes

The original extraction method fetched the deployed Pages BODS manifest,
selected BODS service shards for the selected StopPoint prefixes, and retained
records with scheduled evidence for the declared routes. It did not fetch the
deployed `bus-tnds/manifest.json` or its TNDS shards. Therefore it preserved
the BODS 25C/66/310/A1 records but removed the supplementary pattern,
short-working, operator-spelling and nearby-StopPoint variants that the
browser merged into its national service result. The original 242 excess was
only the subset of fragmentation visible in BODS.

The correction must therefore use the runtime-composed national input at the
planner boundary. It must not add guessed rows or hand-edit a screenshot
reproduction.

## Correction verification

The corrected public replay fixture is
`tests/atlas/fixtures/alpha15-waltham-cross-production.json`. It retains the
53 route-scoped records derived from the runtime boundary, including both BODS
and TNDS, while withholding the assessment-origin coordinate. The exact
before/after comparison is reproducible with
`node tools/atlas-review/alpha15-runtime-comparison.mjs` and is asserted by
`tests/atlas/alpha15-production-fidelity.test.mjs`.

On the identical normalized 48-summary input, the frozen Alpha.14 planner is
red at 25C=4, 66=4, 242=8, 310=4 and A1=4. Alpha.15 reduces those public
direction rows to 2 each; 317 remains 2 and 310 remains explicitly
non-circular. Timetable frequency is bound only to explicit stop evidence, or
to a single-stop unbound service; multi-stop unbound evidence remains served
stop evidence but cannot inflate a representative-stop frequency.
