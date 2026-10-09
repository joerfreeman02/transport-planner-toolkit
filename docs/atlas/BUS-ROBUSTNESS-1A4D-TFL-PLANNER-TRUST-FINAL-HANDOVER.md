# BUS-ROBUSTNESS-1A4D — TfL planner trust handover

## Decision

**NOT READY for Product Owner final TFL/London intelligence acceptance.**

This closeout deliberately stops at the approved-source boundary. The two 313
origin decisions remain genuinely unresolved in the evidence currently
ingested. TfL publishes an official full route-sequence endpoint which this
adapter does not consume. Integrating it would be a source-boundary expansion
and needs a separately approved implementation, request budget, freshness and
cache policy, route-branch matching rules, and provenance. No such requests
were made here. The outstanding question is not safely answerable by guessing
or by asking a planner to repeat routine web research.

## Build and scope

- Repository: `transport-planner-toolkit`.
- Branch: `codex/atlas-bus-tfl-planner-trust-final-closeout`.
- Worktree: `atlas-bus-tfl-planner-trust-final-closeout` (sibling worktree).
- Baseline: `717135fba88ef36db108d70455e2b98f4bf149d6`.
- Formal version: `2.0.0-alpha.15` (unchanged).
- Implementation commit: `a9873957e2b4f564faefa5d83f814475371a432d`.
- Final tip: handover commit at branch HEAD; its full SHA is reported by the
  final git verification accompanying this document.
- Frozen national snapshot: `36125621080`.
- No national acquisition, TNDS activation, merge, deployment, or version
  promotion was performed.

## Files changed

- `atlas/assets/css/atlas-shell.css`
- `atlas/assets/js/app.mjs`
- `src/atlas/adapters/authoritative-bus-timetable-adapter.mjs`
- `src/atlas/domain/bus-planner-summary.mjs`
- `src/atlas/domain/bus-service-assessment.mjs`
- `src/atlas/domain/bus-source-presentation.mjs`
- `src/atlas/presentation/bus-word-export.mjs`
- `tests/atlas/bus-alpha13-planner-summary.test.mjs`
- `tests/atlas/bus-group-1c-real-runtime.test.mjs`
- `tests/atlas/bus-robustness-1a-calendar-simple.test.mjs`
- `tests/atlas/bus-robustness-1a2-enfield-variant.test.mjs`
- `tests/atlas/run-all.mjs`
- `tests/atlas/tfl-bus-timetable.test.mjs`
- `tests/atlas/bus-robustness-1a4d-tfl-planner-trust.test.mjs`
- `docs/atlas/BUS-ROBUSTNESS-1A4D-TFL-PLANNER-TRUST-FINAL-HANDOVER.md`

## Before / after review-item inventory

The exact prior live Enfield acceptance captured in the 1A4C handover had 13
planner-endpoint-resolution items before its correction and two remaining
items afterwards. Those two were the 313 origin decisions at StopPoints
`490001101K` and `490001101N`. The 1A4C capture also reported 47 successful
TfL timetable requests and no unresolved request failures. This 1A4D run did
not repeat that live acquisition or claim a new live review count.

| Item in prior acceptance | 1A4D disposition | Class |
|---|---|---|
| Thirteen earlier endpoint warnings | Prior 1A4C correction remains protected by regression; no new endpoint inference added | A — previously resolved |
| 313 origin at `490001101K` | Still lacks aligned exact endpoint identity in ingested evidence; sequence endpoint is not implemented | C — unresolved |
| 313 origin at `490001101N` | Same source gap; no place inferred | C — unresolved |
| Operator absent on 191, 313, 317 | Generic planner-facing missing-operator warning removed; absence is retained in Detailed Evidence as `not supplied`; no operator asserted | B for presentation, but acceptance remains blocked by incomplete authoritative operator evidence |
| TfL/BODS fields differ | Deterministic TfL identity makes a weaker-source difference technical audit evidence; identity disagreement while TfL identity is incomplete remains material | A when identity complete; C if material identity remains unresolved |
| Generic source-origin/destination qualification | Kept in technical source evidence instead of routine “Points to note”; exact unresolved route identity remains reviewable | B except where exact decision is unresolved |
| Generic unnamed short-working/timetable-variant banner | Removed from Browser and Word presentation; source/variant evidence is not deleted | B; underlying classifications are not all live-replayed in this stop-limited closeout |
| Other route/source warnings | Existing service, chronology, calendar, accessibility and source-unavailable warnings remain governed by their existing tests; no blanket warning suppression | No additional review inventory claimed |

The final Enfield review count is therefore **not remeasured**. This document
does not claim “Evidence items to review: None.” A live re-run with the current
build and the approved route-sequence evidence is needed before that claim can
be made.

## Evidence exhaustion and 313 origin findings

The current 1A4C live capture names the two affected route 313 timetable
summaries and their assessed StopPoints. Its source record wording says
“Origin not supplied”; the exact service summaries have direction and
destination evidence, but no aligned exact origin StopPoint identity. The
1A4C handover states that the corridor-clipped pattern cannot establish the
origin and that no place was inferred.

The code audit confirms the current TfL adapter calls:

- `GET /Line/{ids}/Route` for route metadata;
- `GET /Line/{id}/Timetable/{fromStopPointId}` for scheduled timetable data.

The timetable parser derives its pattern from the returned timetable
StationIntervals. The generic planner endpoint resolver can hydrate exact
StopPoint IDs using the prepared/reference stop data and NaPTAN/NPTG/StopArea
evidence already present. It also uses available opposite-direction records
only when service lineage and exact endpoint identity are demonstrable. None
of those paths supplies a complete, exact origin for these two records.

| Evidence path | Finding for the two 313 origins |
|---|---|
| TfL scheduled timetable | Origin is not supplied for the affected pattern; timetable evidence remains useful for schedules, not a proven full origin |
| TfL Line/Route metadata | Supported metadata path returns route sections and direction/name information; no aligned endpoint StopPoint identity was available in the captured result |
| Exact TfL StopPoint identity | No source origin StopPoint ID aligned to either 313 origin decision |
| NaPTAN / StopArea / NPTG | Can resolve a supplied exact ID to a place/locality; cannot create the missing route-to-endpoint identity |
| Complete source pattern | Not available as a distinct complete authoritative pattern in the current route-summary input; corridor edges are not endpoints |
| Reverse direction / same lineage | Existing evidence did not prove the missing origin by same-family exact identity |
| BODS supplementary data | Weaker source only; it cannot replace TfL authority or establish an origin without a deterministic route-lineage match |

TfL’s official Unified API documents
`GET /Line/{id}/Route/Sequence/{direction}` as returning a direction’s stop
sequences, including `StopPointSequence` and ordered NaPTAN IDs. This is the
specific missing authoritative sequence capability to evaluate in a future,
explicitly approved source-boundary change. It was not called or added in
1A4D. Integration must match the right branch/service type and direction,
reconcile exact stop identities, preserve ambiguity where sequences branch,
and include bounded request/caching/freshness/provenance behavior. [TfL Unified API Swagger](https://push-api-nile.tfl.gov.uk/swagger/ui/index.html)

For each still-unresolved origin, the exact unknown is the complete-route
origin identity (name plus exact StopPoint ID) for the particular 313
direction/pattern. The current evidence cannot support a safe origin assertion.
A human might consult TfL’s full sequence data, but that is routine research
ATLAS should perform once the official endpoint is approved and integrated;
the item is not resolved by asking the planner to look at another bus website.

## Operator findings

Current TfL timetable parsing reads `operator` only if it is present in the
route or response object; the existing route metadata schema used here does
not supply it for the affected 191/313/317 timetable patterns. No NOC/operator
code registry is ingested in the approved current architecture. The frozen
national snapshot may supplement only when deterministic source-route lineage
is established; it does not justify copying an operator from a neighbouring
row. Accordingly, no operator was filled by inference. The source detail now
shows “not supplied” rather than presenting the routine metadata omission as
a planner action. The authoritative operator fact remains an acceptance
limitation, not a claim that no operator exists.

TfL’s iBus static-data documentation notes that a line can change operator and
that operator/garage is not related directly to the line in that dataset. A
stable operator answer therefore needs an authoritative, date-valid
service/contract/operator identity source and deterministic mapping to the
service lineage, not merely a route number. [TfL iBus static data documentation](https://ibus.data.tfl.gov.uk/ibus-static-data-documentation.pdf)

## Supplementary-source conflicts

The adapter now records differing BODS fields with field names, material
fields, source classification and TfL authority. When TfL route metadata is
matched and both origin and destination are established, weaker-source
differences remain in technical audit and do not become an ordinary planner
warning. If route identity fields differ while TfL identity is incomplete,
the conflict remains material and reviewable. TfL calculations remain
authoritative; supplementary schedules do not inflate or override them.

## Variants and short workings

The previous generic text was generated by legacy grouping compatibility
fields when a route-family/variant existed but no deterministic named
destination was available. The prior brief lists routes 192, 231, 317, 329,
377, N29 and W8 as examples. The code path conflated structural branches,
short workings, calendar-profile differences, timetable-profile differences,
and source-record duplication into one fallback sentence. This closeout
removes only the exact generic fallback from planner-facing Browser and Word
notes; named evidence such as route 313’s Crown Road (EN1) short working
remains. Calendar/school evidence remains expressed through the existing
calendar marker and qualification/timetable-note pathways.

The prior live Enfield route 313 accepted behavior remains protected:

- principal direction: Towards Potters Bar Railway Station;
- Dame Alice Owen’s School remains secondary/additional evidence;
- Crown Road (EN1) remains an explicitly named short working.

This stop-limited closeout did not reproduce every current Enfield generic
note against a new live result, so it does not claim that every route from the
example list has been individually source-classified in this build.

## Other nearby stop records

Route-less, unmatched `bus_coach` group-completion records are retained but
excluded from the normal route-bearing stop table. A collapsed section below
that table is labelled “Other nearby stop records — no route information
currently available (N)” and presents map reference, name, indicator, walking
distance/time and plain-language status with no arbitrary record cap. The
explanation makes clear that absence of route data does not prove inactivity
or no service. Records remain in map markers and detailed source evidence.
Route-bearing and timetable-matched records remain in the normal table. Word
excludes only the non-route-evidenced diagnostic records; matched records
remain report-relevant.

## Timetable-note label

`buildBusTimetablePresentationNote()` now returns note content without the
presentation label. Browser and Word each supply “Timetable note:” once.
Timetable wording/calculation methodology is unchanged.

## Tests and live controls

Focused 1A4D regressions pass for other-stop classification/Word treatment,
generic note filtering, named short-working retention, calendar-only variant
suppression and source warning presentation. Protected regressions pass for
1A4, 1A4B endpoint hydration, GROUP, CIRC, TfL source authority,
calendar/term-time, school-only and Browser/Word parity.

`node tests/atlas/run-all.mjs` passed after running with permission to create
its temporary isolated Git repositories. It ended exactly:

`ATLAS Alpha.15 deterministic suite passed.`

The previous exact Enfield 250 m live control is recorded in the 1A4C handover
(51.6506, -0.0783; frozen snapshot `36125621080`; 47 successful TfL timetable
requests). No new 1A4D live acquisition or final V2 browser build was run after
the source-sequence gap was established. Therefore this handover has no new
review URL/build header, Word export capture, or final live review count. No
fresh national acquisition occurred. Waltham/Chingford remain covered by the
protected deterministic regression suite; no new live regional acquisition
is claimed.

## Source expansion required before acceptance

1. Add an approved TfL route-sequence operation for exact ordered StopPoint
   identities, with branch/direction/service-type matching, request budgeting,
   cache/freshness and provenance. Re-run the two 313 origin decisions and
   retain review where TfL still returns ambiguity.
2. Identify an approved authoritative, date-valid operator/service-contract
   source and deterministic mapping for 191, 313 and 317, or explicitly accept
   that those records remain without operator names.
3. Replay all current generic Enfield variant evidence and classify each as
   alternative origin, destination, true short working, branch, calendar-only,
   timetable-only, duplicate, or unresolved material structure.
4. Run the exact Enfield 250 m live/browser/Word acceptance against the final
   clean build and record the review count, URL and build header.

No external monitoring/coverage/error tools were installed or reconfigured:

- Dependabot — retain existing weekly configuration.
- Codecov — defer; coverage ownership/thresholds and upload workflow are not
  established.
- OpenSSF Scorecard — consider later with reviewed Action pinning and minimal
  workflow permissions.
- Sentry — defer pending production environment, retention and privacy rules.
- Renovate — do not add alongside existing Dependabot without an unmet need.

No files were changed after discovering the official sequence-source gap
except this handover documentation. No source acquisition was widened.
