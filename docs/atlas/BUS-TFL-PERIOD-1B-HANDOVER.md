# BUS-TFL-PERIOD-1B handover

## Scope

BUS-TFL-PERIOD-1B closes the production-shaped mixed TfL plus national evidence
gap found at the Waltham Cross planner basis StopPoint. The change is generic
and preserves the accepted BUS-GROUP, BUS-CIRC, BUS-DEST, calendar, frequency,
Browser and Word contracts. Production remains Alpha.15. No publication,
activation, deployment, merge, version promotion or BUS-POLISH is included.

Branch: `codex/atlas-bus-tfl-operating-period-1b`

Baseline SHA: `447a941936ed890e755f33531b659990e2f371c7`

Final SHA: recorded after the 1B commit

## Proven root causes

The actual 447a941 runtime classified the Waltham Cross Stop A planner basis
(`210021703420`) as BODS-only for routes 217, 317 and 327. The authoritative
adapter therefore did not stage TfL timetable requests for that StopPoint,
even though the bounded official TfL Stop A fixture contains TfL scheduled
data. The resulting BODS summaries supplied the wrong operating-period basis:

| Route | 447a941 observed period | Corrected TfL-led period |
|---|---|---|
| 217 | `00:05–00:25` next day | `04:00–00:59` next day |
| 317 | `00:05–23:35` | `05:00–00:59` next day |
| 327 | `07:00–19:00` | `07:00–19:59` |

The first defect was therefore a cross-boundary TfL request-scope failure,
not a stale browser label and not a GROUP or CIRC regression. The correction
stages a bounded TfL overlay for selected cross-boundary routes when the real
TfL timetable adapter confirms route-metadata capability and the selected
scope contains TfL route coverage.

A second generic defect was also proven. When a TfL record was supplemented,
the human-facing label `TfL + BODS supplementary` could be reused as the
provider identity by operating-period and planner evidence code. The corrected
shape keeps presentation and authority separate:

```text
provider: TfL
primaryAuthority: TfL
timetableSource: TfL + BODS supplementary
source.provider: TfL
source.primaryAuthority: TfL
source.supplementaryProvider: BODS
```

BODS exact departures are retained on the TfL-primary record as explicit BODS
departure evidence for audit and frequency. They remain excluded from the
TfL operating-period boundary. TfL structured periods, including the 327
`07:00–19:59` boundary, are preserved through the planner and Word layers.

## Why PERIOD-1A missed it

PERIOD-1A covered clean synthetic mixed records and the bounded Stop A TfL
fixture, but did not compose the real authoritative adapter with a national
StopPoint population that was BODS-labelled while the same selected scope had
TfL route coverage. It therefore did not exercise the cross-boundary Stop A
overlay, the composite-label/provider-identity distinction, or the retained
BODS departure population through planner and Word output.

## Control outcomes

- Waltham 217, 317 and 327 use the TfL-led periods above.
- 279 and 491 retain their accepted daytime behaviour; N279 retains its
  genuine night-service chronology.
- Chingford Grove Road 357, 444 and W16 retain both directions.
- 657 remains school-day-only with one journey per day and departure-style
  wording at approximately `07:58` and `16:22` where applicable.
- Pipers and BODS-only populations retain their existing source and
  single-journey behaviour.
- GROUP, CIRC, DEST, calendar, frequency and Browser/Word parity remain
  covered by the existing controls.

## Files changed

- `src/atlas/adapters/authoritative-bus-timetable-adapter.mjs`
- `src/atlas/domain/bus-service-assessment.mjs`
- `src/atlas/domain/bus-planner-summary.mjs`
- `tests/atlas/tfl-operating-period-1b.test.mjs`
- `tests/atlas/run-all.mjs`
- `docs/atlas/BUS-TFL-PERIOD-1B-HANDOVER.md`

## Verification and data boundary

The new production-fidelity test passes with the actual Stop A TfL fixture,
asserting the 217/317/327 overlay requests, TfL primary identity, retained
BODS departures and planner/Word period parity. Focused controls pass for TfL
timetable and operating-period behaviour, the new 1B composition, Alpha.13
planner summaries, BUS-QA-03 integrity and Alpha.12 evidence integrity.

The full suite passes from the final committed clean tree, including the
legacy-isolation guard, BUS-GROUP, BUS-CIRC, BUS-DEST, Alpha.12–Alpha.15,
browser and Word contracts.

The V2 review uses frozen source snapshot run `36125621080`, snapshot
`8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9`, with
acquisition disabled. TfL remains the normal bounded live London timetable
provider. No live NaPTAN, NPTG, BODS or TNDS acquisition is performed, and no
national source rebuild is performed outside the V2 prepared-cache process.

The remaining limitation is intentional: the correction is verified against a
bounded Waltham/Chingford/Pipers acceptance scope and does not claim a broad
national live crawl. Manual Product Owner acceptance should confirm the V2
runtime at the final review URL and the exact build header before testing.

## GitHub tooling adoption review

The existing repository review remains unchanged: retain weekly grouped
Dependabot updates; consider a scoped Codecov pilot only with approval; route
OpenSSF Scorecard through a separate governance/security review; continue to
defer Sentry because location telemetry requires an explicit privacy decision;
continue to defer Renovate because it would duplicate Dependabot. No GitHub
tooling was installed or changed by 1B.
