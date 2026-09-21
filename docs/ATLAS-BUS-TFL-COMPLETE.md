# ATLAS BUS — BUS-TFL-COMPLETE technical record

Status: ready for Technical Director manual review. No merge, production refresh, reference-data publication or Pages deployment was performed.

## Scope and provenance

The verified starting `main` was `c78132bc9e5c85f3f3926b83a7e92da217b5b5c2`. Work was performed in the clean isolated branch `codex/atlas-bus-tfl-complete`.

Production-fidelity controls used the live TfL scheduled timetable source and the Run #24 prepared-data publication `35352167115-c670698dbf709a953d15b3927ee677fb502d1b3a`. Run #25 (`35591771460`) was not used as data; it failed before candidate validation and publication.

Formal release identity remains `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`. The original clean review executable identity was `BUS-TFL-COMPLETE · 8d64487` (`8d64487c9bb7ab4e606063586038c6219e332366`). The 1A sparse-pattern correction is recorded by its implementation commit and final clean control SHA in the PR handover.

## Forensic root cause

The failure was one common TfL response-interpretation defect, not three route-specific defects.

For live requests for 215, 385 and 397, the requested StopPoint ID was present in `timetable.departureStopId`, but TfL's `stationIntervals` sequence began with the following stop and omitted the departure stop itself. The adapter treated absence from `stationIntervals` as proof that the requested stop was not served, so it rejected valid timetable patterns as unresolved before planner service-summary construction.

The same response shape was observed for working controls 97, 158 and 444. Those controls also rely on the exact `departureStopId` for the selected stop; their previous success was not evidence that the omitted first stop was impossible.

Two adjacent, response-shape issues were also evidenced in the live metadata calls:

- TfL rejected the repeated `serviceTypes=Regular&serviceTypes=Night` query form with HTTP 400; the comma form `serviceTypes=Regular,Night` succeeds.
- A single-line route metadata response can be an object, rather than the batched array form, and current responses can expose route sections through `sections` as well as `routeSections`.

The exact pre-fix unresolved 700 m identities were the 23 requests for routes 215, 385 and 397 at the assessed StopPoint IDs. The 400 m control had six unresolved identities: `215|490007676L`, `385|490007676L`, `397|490007676L`, `215|490007676J`, `385|490007676J`, and `397|490007676J`. After the original correction, both Normanshire controls had zero unresolved TfL request identities.

BUS-TFL-COMPLETE-1A identified a second general response shape at Waltham Cross StopPoint `490003378H`. For each of 217, 279, 317, 327, 491 and N279, TfL returned HTTP 200, an exact matching `departureStopId`, one valid interval with ID `0`, one following stop in that interval, and scheduled known journeys with interval ID `0`. The requested H stop was omitted from `stationIntervals`, but scheduled departure evidence was present. The previous `pattern.stations.length < 2` guard rejected these valid terminal-adjacent patterns.

No route number, stop number, site name, or direction was used as a special case. 397A was not added to the correction.

## Correction

`src/atlas/adapters/tfl-bus-timetable-adapter.mjs` now accepts a pattern when either:

1. the requested StopPoint is explicitly present in `stationIntervals`; or
2. the response's exact `departureStopId` equals the requested StopPoint.

When condition 2 applies, the requested departure stop is added to the normalized stop sequence for downstream timetable evidence, including when TfL supplies only one following interval stop. A departure-stop mismatch still rejects the pattern. The adapter requires legitimate scheduled timetable evidence and deterministic pattern association; route metadata is used to establish complete endpoints when possible, but incomplete origin/destination metadata leaves those fields blank with a warning rather than discarding real scheduled evidence. Metadata alone cannot fabricate service.

Metadata parsing now normalizes single-object and batched-array responses, accepts the observed section property variants, and uses the successful comma-separated service-type query. These are general response-shape corrections.

## Deterministic regression evidence

The fixture suite includes the minimal omitted-departure-stop response shape for 215, 385, 397, 97, 158 and 444, plus safeguards for:

- mismatched `departureStopId`;
- ambiguous timetable responses;
- metadata-only responses;
- single-line object metadata and `sections`;
- no TfL/national duplication;
- unrelated resolved-route stability;
- both approved 444 directions.
- sparse one-following-stop response shape using an alternate synthetic line identity;
- sparse response with a mismatched `departureStopId` remaining unresolved.

Commands passed:

- `node tests/atlas/tfl-bus-timetable.test.mjs`
- `node tests/atlas/review-environment.test.mjs`
- `node tests/atlas/run-all.mjs` — complete Alpha.15 deterministic suite passed.

The review server exposes `BUS-TFL-COMPLETE · <short clean SHA>` only when the worktree is clean, so the browser cannot claim a clean executable identity for dirty code. The 1A browser/manual identity must use the final clean control SHA recorded below alongside the unchanged formal release.

## BUS-TFL-COMPLETE-1A classifications

### Waltham Cross StopPoint H

The six requests are one evidenced general parser class, not six route-specific exceptions:

| Route | Requested stop | Stop name | HTTP | Departure stop | Interval IDs / count | Following-stop count | Scheduled evidence | Classification |
|---|---|---|---:|---|---|---:|---|---|
| 217 | `490003378H` | Bullsmoor Lane / Mollison Avenue | 200 | `490003378H` | `0` / 1 | 1 | Yes; journey interval `0` | General sparse StationInterval shape |
| 279 | `490003378H` | Bullsmoor Lane / Mollison Avenue | 200 | `490003378H` | `0` / 1 | 1 | Yes; journey interval `0` | General sparse StationInterval shape |
| 317 | `490003378H` | Bullsmoor Lane / Mollison Avenue | 200 | `490003378H` | `0` / 1 | 1 | Yes; journey interval `0` | General sparse StationInterval shape |
| 327 | `490003378H` | Bullsmoor Lane / Mollison Avenue | 200 | `490003378H` | `0` / 1 | 1 | Yes; journey interval `0` | General sparse StationInterval shape |
| 491 | `490003378H` | Bullsmoor Lane / Mollison Avenue | 200 | `490003378H` | `0` / 1 | 1 | Yes; journey interval `0` | General sparse StationInterval shape |
| N279 | `490003378H` | Bullsmoor Lane / Mollison Avenue | 200 | `490003378H` | `0` / 1 | 1 | Yes; journey interval `0` | General sparse StationInterval shape |

Matched controls at `490003378G` returned HTTP 200, exact departure-stop identity, interval ID `0`, scheduled journeys, and longer interval sequences. The route metadata responses were single objects with two `routeSections`; no source or endpoint failure was observed. The correction is therefore general and evidence-based. The exact H requests return `MATCHED` with one retained service each under the corrected adapter.

### Normanshire route 212

The East View parent is TfL StopPoint `490G00006381`. Its logical children are:

- Stop WT: `490006381N`, `51.61285, -0.00249`, towards Chingford Mount or Chingford Station;
- opposite Stop WE: `490006381S`, `51.61310, -0.00176`, towards Leytonstone or Walthamstow.

From the confirmed assessment point `51.6162611, -0.0125148`, the straight-line distances are approximately 789.3 m for WT and 821.6 m for WE. Both are outside the current 700 m Full Assessment discovery radius. The live TfL timetable endpoints return HTTP 200, exact departure-stop identity, scheduled journey evidence and `MATCHED` results for both logical stops. The single-direction 212 result is therefore a stop-discovery/radius classification, specifically **BUS-STOP-STRUCTURE**, not a TfL completeness defect. No stop-discovery change was made.

### Normanshire W16

The live assessed W16 requests at `490007574W`, `490008982W`, `490005178H`, `490005180C`, `490007574E` and `490008982E` all return HTTP 200, exact departure-stop identity, interval ID `0`, scheduled journeys and `MATCHED` results. The production-fidelity record retains TfL evidence with BODS supplementary/fallback provenance and no unresolved W16 requests.

The three planner rows are therefore not a missing-timetable problem. Two Chingford-bound components have the same public destination but distinct endpoint text/pattern populations and conservative component lineage; the grouping algorithm does not merge them without deterministic shared lineage/corridor evidence. The split is **BUS-GROUP** work and remains untouched.

## Live production-fidelity controls

The final register and fresh Word outputs are under `work/bus-closeout-1a/production-controls/` and are intentionally ignored working evidence. They record the confirmed coordinate-only control points, Full Assessment mode, radius, Run #24 publication, formal release and executable SHA.

| Control | Coordinates | Radius | Stops | TfL requests | Unresolved | Planner result |
|---|---:|---:|---:|---:|---:|---|
| Normanshire Drive | `51.6162611, -0.0125148` | 400 m | 7 | 35 | 0 | 215/385/397 rows present; both 444 directions preserved |
| Normanshire Drive | `51.6162611, -0.0125148` | 700 m | 18 | 83 | 0 | 215/385/397 rows present; both 444 directions preserved |
| Pipers Lane | `51.852700, -0.454343` | 700 m | 11 | 0 | 0 | Existing 230/231 control unchanged |
| Waltham Cross | `51.6857829, -0.0330001` | 700 m | 16 | 22 | 0 after 1A correction (6 pre-fix) | Existing national/TfL service population remains stable |

Normanshire planner rows now include:

- 215: Towards Lee Valley Campsite; Towards Walthamstow Bus Station
- 385: Towards Chingford Station; Towards Salisbury Hall Sainsbury's
- 397: Towards Salisbury Hall Sainsbury's; Towards The Broadway
- 444: Towards Chingford Station; Towards Turnpike Lane Bus Station

The stop populations and discovered route populations remained unchanged; only legitimate timetable resolution changed. Pipers and Waltham were regression controls, not destination/grouping work.

Fresh Word evidence from the original correction includes:

- `ATLAS BUS-TFL-COMPLETE — tfl-complete-final — normanshire-drive-400m — 8d64487.docx`
- `ATLAS BUS-TFL-COMPLETE — tfl-complete-final — normanshire-drive-700m — 8d64487.docx`
- `ATLAS BUS-TFL-COMPLETE — tfl-complete-final — pipers-lane-700m — 8d64487.docx`
- `ATLAS BUS-TFL-COMPLETE — tfl-complete-final — waltham-cross-700m — 8d64487.docx`

## Compatibility and scope protection

The Run #24 candidate compatibility fingerprint remains exactly:

`093d047c87482aba3d5b90844608046ece18bd673f9228dab504030883af223`

No candidate-generation compatibility input was changed, including `build_static_index.py`, `refresh_bus_data.py`, `prepare_tnds.mjs`, `tnds-transxchange-adapter.mjs`, `scheduled-evidence.mjs`, `bus-service-assessment.mjs`, `service-calendar.mjs`, or `atlas-release.json`. The formal production version was not incremented.

Remaining limitations are the live TfL source's normal availability/shape variability, the separate 397A mixed-source/London Service Permit case, the 212 logical-stop radius limitation, and conservative W16 grouping. No unresolved evidence was forced into a planner row.

## Recommendation

**READY FOR TECHNICAL DIRECTOR MANUAL REVIEW**

Do not merge, dispatch a Bus refresh, publish reference data, deploy Pages, or begin the excluded destination/grouping/UI sprints as part of this record.

## GitHub tooling adoption review

Status only; no tooling changes were authorised: Dependabot; Codecov; OpenSSF Scorecard; Sentry; Renovate; main branch protection.
