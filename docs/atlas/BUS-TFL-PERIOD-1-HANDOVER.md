# BUS-TFL-PERIOD-1 handover

Status: ready for Product Owner review only. Production remains `2.0.0-alpha.15`; this branch has not been promoted, activated, merged, or deployed.

## Delivery identity

- Frozen starting SHA: `48bdc3b7541fda2da5fa13472f15931e4f64b09a`
- Branch: `codex/atlas-bus-tfl-operating-period`
- Final SHA: the commit containing this handover document; see the final task handover for its exact value.
- Review URL: `http://127.0.0.1:8769/atlas/#modules` when the local review server is running
- No Alpha.16 was created.

## Defect evidence and root cause

The official TfL response for `Line/{lineId}/Timetable/490003378H` contains three different kinds of timing information:

1. `timetable.departureStopId` identifies the requested TfL StopPoint.
2. `routes[].stationIntervals` identifies the ordered stop pattern and interval timing.
3. `routes[].schedules[]` contains exact `firstJourney`, `lastJourney`, `knownJourneys`, and `periods[]`.

Each `periods[]` entry has `type`, `fromTime`, `toTime`, and, where supplied, `frequency.lowestFrequency` and `frequency.highestFrequency`. The live Waltham responses show period boundaries wider than the sparse exact journey list. For example, the Monday-Friday 217 response has exact journeys from `06:01` through `25:29`, while its period evidence runs from the `06:00` period through the `25:59` period. The 317 response has the same shape, with exact journeys from `05:53` through `25:21` and period evidence from `05:00` through `25:59`.

The root cause was downstream: ATLAS used exact scheduled departures to calculate the displayed operating period and retained TfL periods only when they also contained numeric frequency values. `Normal` and `FrequencyHours` periods without numeric frequency fields were therefore lost as operating-span evidence. The result was an exact-departure span presented as the whole service day, and it could understate the published TfL operating period. No TfL departure was missing from the canonical departure array; the boundary evidence was missing from the operating-period calculation.

## Implemented model

The adapter now retains a structured `operatingPeriodEvidence` array per service record and calendar profile. It is separate from:

- `stopSchedules` / `departureEvidenceByDay`: exact scheduled departures only;
- `frequencyEvidence`: TfL frequency bands only, with raw TfL period times preserved for the existing frequency logic;
- `calendarEvidence`: the mapped operating-day profile.

The service-day chronology rule is:

- TfL hour values above 24 remain later minutes on the same service day; `25:29` is minute `1529`, not `01:29` on the preceding day.
- Ordered TfL periods are normalised across midnight in the same way. A later raw `00:20` period is represented internally as `1460` when it follows the daytime portion of that service day.
- A pure night service whose periods begin at `25:00` remains a next-day service span; it is not moved back onto the previous calendar day.
- First/last exact journeys are never replaced by invented departures. When exact and period boundaries are materially disjoint, ATLAS keeps the exact boundaries and emits a review warning with `operatingPeriodEvidenceState: conflict`.
- Evidence from different route-pattern identities is not combined when their day boundaries differ.

`operatingPeriodEvidence` supplies boundaries only. It never appends to `stopSchedules`, `departuresByDay`, frequency populations, or journey counts used for exact timetable calculations.

## Waltham TfL diagnostic

Diagnostic control: `51.6857829,-0.0330001`, 700 m; mandatory TfL StopPoint `490003378H`, `Bullsmoor Lane / Mollison Avenue`; routes `217`, `279`, `317`, `327`, `491`, `N279`.

The reproducible six-response fixture is [tfl-waltham-operating-period-diagnostic.json](../../tests/atlas/fixtures/tfl-waltham-operating-period-diagnostic.json), captured by [capture-tfl-operating-period-diagnostic.mjs](../../tools/atlas-review/capture-tfl-operating-period-diagnostic.mjs). The fixture contains the bounded TfL timetable responses and no national-source acquisition.

| Route | Before: exact departures only | After: exact departures + TfL period evidence | Evidence basis |
|---|---|---|---|
| 217 | Mon-Fri `06:01–01:29 (next day)` | Mon-Fri `06:00–01:59`, Sat `05:00–01:59`, Sun `06:00–01:59` | `firstJourney`/`lastJourney` plus ordered `periods.fromTime/toTime`; no synthetic departures |
| 317 | Mon-Sat `05:53–01:21 (next day)` | Mon-Sat `05:00–01:59`, Sun `07:00–01:59` | same; Sunday remains its own calendar boundary |
| 279 | `05:11–01:23 (next day)` | `05:00–01:59 (next day)` | exact journey evidence widened only by TfL periods |
| 327 | `07:21–19:21` | `07:00–19:59` | daytime TfL periods; Sunday has no schedule |
| 491 | `06:44–00:30 (next day)` | `06:00–00:59 (next day)` | ordered daytime-to-midnight TfL periods |
| N279 | `01:36–06:32 (next day)` | `01:00–06:59 (next day)` | TfL `25:00–30:59` night-service periods; no previous-day shift |

The route-level frequency outputs remain based on the exact TfL frequency evidence and are unchanged by the operating-period correction. No route produced an operating-period warning in the six-route Waltham audit.

## Regression coverage

- Normanshire/London closeout fixtures: routes 357, 444, and W16 remain two-direction summaries; route 657 remains school-days-only with no Saturday/Sunday population and the controlled `School days only.` note.
- Pipers/non-TfL: the Alpha.5 assessment and BUS-CIRC controls pass; BODS-backed calculations remain on the canonical departure path.
- GROUP: Alpha.15 adversarial PlannerServiceGroup coverage and the captured mixed TfL+BODS Waltham runtime pass. No GROUP grouping behaviour was changed.
- CIRC: deterministic circular, variant, Waltham, and Pipers controls pass. No CIRC behaviour was changed.
- Browser and Word consume the same planner summary row. Word export tests pass, including the shared Alpha.5 DOCX package and Waltham mixed-runtime handover controls.

## Scope and limitations

- No NaPTAN, NPTG, BODS, or TNDS acquisition was performed for this task. Existing frozen fixtures were used for non-TfL regression checks.
- The bounded official TfL diagnostic made 60 HTTP calls in total: 46 timetable calls and 14 route-metadata calls. The committed Waltham fixture itself contains the six mandatory timetable responses.
- The diagnostic is a response-shape and downstream-replay audit, not a claim that TfL periods are exact departure lists.
- No map export, Word redesign, BUS-POLISH, GROUP/CIRC redesign, TNDS activation, deployment, publication, merge, or production activation was performed.
- The full Node suite passed from the clean committed checkout at the final SHA; origin parity is recorded in the task handover after push.

## Product Owner manual acceptance checklist

1. Start the local review server and open the review URL.
2. Replay the Waltham control and confirm 217/317 spans include the next-day periods while exact departure populations remain unchanged.
3. Confirm frequency, calendar labels, GROUP, CIRC, Normanshire, and Pipers outputs remain unchanged.
4. Export the Waltham Word table and confirm its operating-period text matches the browser planner row.
5. Treat this as review-only; do not promote or activate production.

## Tooling adoption review

- Dependabot: present in `.github/dependabot.yml`; retain and review its update cadence.
- Codecov: no repository configuration was found. Consider adding coverage reporting only if CI can publish the existing Node test results without weakening the bounded review workflow.
- OpenSSF Scorecard: no workflow was found. Consider it for the default branch once branch protection and CI permissions are formalised.
- Sentry: no integration was found. Defer until a production telemetry decision exists; it is outside this bounded correction.
- Renovate: no configuration was found. Do not add it alongside Dependabot without an ownership decision.
- Main branch protection: not verifiable from this local checkout. Confirm required reviews, status checks, and no direct pushes in the GitHub repository settings before production promotion.

Recommendation: Technical Director and Product Owner review only. Do not begin BUS-POLISH.
