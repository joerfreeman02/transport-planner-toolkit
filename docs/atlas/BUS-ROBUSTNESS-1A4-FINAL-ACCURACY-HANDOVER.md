# BUS-ROBUSTNESS-1A4 — Final Accuracy Handover

Status: READY FOR PRODUCT OWNER MANUAL ACCEPTANCE  
ATLAS version: `2.0.0-alpha.15`  
Branch: `codex/atlas-bus-final-accuracy-closeout`  
Worktree: `atlas-bus-term-time-presentation-closeout/atlas-bus-final-accuracy-closeout`  
Baseline: `b5a23f27335c2eee8f9111c980cd01df1758e468`  
Implementation SHA: `485ec1199195a04386394b0e04f9db58b1730bfb`  
Final tip: recorded in the final handover response from the clean checkout (`git rev-parse HEAD`).

No merge, deployment, publication, Alpha.16, Beta promotion, BUS-ROBUSTNESS-1B or BUS-POLISH work was performed.

## Defect A — route 313 principal destination

### Reproduction and root cause

The bounded live TfL Enfield Town 250 m reproduction selected the school-facing route 313 destination as the headline direction even though the ordinary public route evidence continued to support Potters Bar Station. The inspected TfL evidence included ordinary high-volume timetable variants, a school-day extension to Dame Alice Owen's School, and a smaller short-working pattern. The ordinary weekday records carried 56 scheduled journeys in the inspected main variant; the school extension was a restricted minority variant. The existing annotation taxonomy correctly retained the extension, but `compareMain` allowed assessed endpoint support to outrank the destination-specific scheduled journey population. The school endpoint was more specific/assessed and its pattern was longer, so it won the principal comparison despite materially smaller service support.

This was not caused by TfL precedence, timetable-calendar composition, endpoint resolution failure, or a second public route row. The accepted Enfield source and grouping architecture remained intact.

### Implementation

`src/atlas/domain/bus-planner-summary.mjs` now gives destination-specific journey support, destination-record support, journey support and activity precedence over endpoint support only for a restricted school/term-time variant alongside an ordinary/non-school timetable. Pattern length remains a deterministic tie-breaker, and endpoint evidence remains part of the comparison. No route number, destination or school name is hard-coded. The existing additional-service, short-working, branch and Detailed Evidence paths retain the minority extension.

### Result

- Principal destination: the ordinary/main endpoint, conceptually `Towards Potters Bar Station` for the accepted Enfield control.
- School extension: retained as structured additional/variant evidence.
- No ordinary frequency is labelled as a school-only service.
- No `Destination not supplied` was introduced.
- The presentation-only dagger/table-wide timetable-note architecture is unchanged.
- Browser and Word consume the same corrected planner row.

## Defect B — circular terminal frequency overcount

### Reproduction and root cause

The frozen national diagnostic snapshot was run `36125621080`; no fresh national acquisition was performed. At Waltham Cross Bus Station Stop C (`210021703430`), the prepared evidence showed:

- Route 16 circular record: 46 weekday terminal observations and 34 Saturday observations, representing paired start/end observations for the underlying circular vehicle journeys. The pre-fix planner row fed 47 Monday and 38 Saturday entries after the circular record was combined with route variants.
- Route 16C circular record: 22 Sunday terminal observations, representing 11 circular vehicle journeys. Four one-trip non-circular variants also contributed at the assessed stop, giving a pre-fix Sunday planner population of 26.
- The frozen source GTFS inspection showed the same route StopPoint at the beginning and end of circular trips. The prepared service summary retained schedule minutes but did not retain a terminal occurrence role for every observation, so the planner could not use a simple journey identity plus occurrence-position key. The prior semantic key treated different minutes at the same StopPoint as separate service opportunities.

The proven overcount was therefore terminal return/start duplication in circular source evidence, compounded by arrival-only non-circular variants being allowed into the circular terminal frequency population. Intermediate repeated stops remain outside this correction.

### Implementation

`src/atlas/domain/bus-grouping.mjs` now proves a circular terminal only when the source circular assertion, exact origin/destination StopPoint evidence and assessed place agree. `src/atlas/domain/bus-planner-summary.mjs` then applies the correction only at that proven closed terminal:

1. explicit arrival/departure occurrence metadata is authoritative;
2. arrival-only non-circular records are excluded from the terminal departure population;
3. where the frozen prepared shape has no occurrence role, the repeated terminal cadence is normalised conservatively per day;
4. ordinary intermediate circular-stop evidence and non-terminal routes retain the existing deduplication semantics.

No global “one journey identity equals one stop occurrence” rule was introduced, and no prepared-data schema redesign was made.

### Result from the frozen fixture

- Route 16: `Mon-Sat: Typically every ~30 mins`; operating periods `Mon-Fri: Approx. 08:15–21:40` and `Sat: Approx. 07:10–19:10`.
- Route 16C: `Sun: Typically every ~60 mins`; operating period `Sun: Approx. 08:00–19:45`.
- Route 16 Monday corrected population: 27 public departure entries after terminal normalisation; the former 5-minute lower frequency band is gone.
- Route 16C Sunday corrected population: 14 public departure entries, retaining the genuine Maple Gate/Maynard Court outgoing short workings while excluding terminal arrival inflation.
- Waltham Cross Bus Station remains a proven circular terminal for the frequency rule.
- Source circular assertions, route locations, short workings and the existing complete-pattern CIRC regression remain protected. The frozen prepared Waltham fixture intentionally lacks a complete ordered pattern, so its pre-existing public CIRC decision remains `unresolved-review` rather than inventing circular wording from an incomplete pattern.

## Regression coverage

Added `tests/atlas/bus-robustness-1a4-accuracy-closeout.test.mjs`, wired into `tests/atlas/run-all.mjs`.

The focused closeout covers six Defect A controls and five Defect B controls: dominant main destination, longer restricted pattern, endpoint-quality tie-break, retained variant/calendar evidence, distinct corridor, Browser/Word parity, explicit circular arrival/departure roles, multiple same-minute non-circular journeys, frozen route 16/16C populations, proven terminal evidence, corrected frequency and operating period.

Protected controls remain passing:

- Enfield: 121, 191, 192, 313, W8 and 629/657 calendar/dagger behaviour through the existing Alpha.15 and BUS-ROBUSTNESS-1A2/1A3 controls.
- Chingford: 357, 444, W16 and 657 school-day evidence unchanged.
- Waltham: 13-family and 15-family grouping, 16/16C short workings, 66 and 251 Hammond Street variants, 279/N279 endpoint aliases and additional services, 317, 327, 491 and A1 behaviour unchanged.
- DEST, GROUP, CIRC, endpoint aliases, TfL authority, BODS/TNDS supplementary boundaries, term-time/table-wide note/dagger behaviour, frequency methodology, operating periods and Browser/Word parity all pass their existing tests.

Focused commands passed:

```text
node tests/atlas/bus-robustness-1a4-accuracy-closeout.test.mjs
node tests/atlas/bus-group-terminus.test.mjs
node tests/atlas/bus-circ-1c-enriched-group.test.mjs
node tests/atlas/bus-robustness-1a2-enfield-variant.test.mjs
node tests/atlas/bus-group-1d-real-runtime.test.mjs
node tests/atlas/bus-group-1e-real-runtime.test.mjs
```

The complete deterministic suite was rerun with the elevated execution required by the repository's legacy-isolation subprocess check and must end with:

```text
ATLAS Alpha.15 deterministic suite passed.
```

## Review controls and provenance

- Frozen national snapshot: run `36125621080`; snapshot SHA-256 `8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9`.
- Acquisition: no fresh national acquisition; the frozen diagnostic cache was reused. The only permitted live source activity was the bounded Enfield TfL control.
- Review URL: `http://127.0.0.1:8770/atlas/?review=v2#modules`.
- HTTP verification: `200 OK` from `http://127.0.0.1:8770/atlas/`.
- Build header: `BUS-TFL-COMPLETE · 485ec11`.
- The implementation commit is recorded above; the documentation closeout commit is the final branch tip. The review server remains running against this clean worktree.
- Review server: leave running for Product Owner inspection.

## GitHub tooling adoption review

Dependabot, Codecov, OpenSSF Scorecard, Sentry and Renovate were reviewed for possible adoption. None was installed, enabled, configured or reconfigured during this sprint; adoption remains a separate governance decision.

## Exact files changed

- `src/atlas/domain/bus-grouping.mjs`
- `src/atlas/domain/bus-planner-summary.mjs`
- `tests/atlas/bus-robustness-1a4-accuracy-closeout.test.mjs`
- `tests/atlas/run-all.mjs`
- `docs/atlas/BUS-ROBUSTNESS-1A4-FINAL-ACCURACY-HANDOVER.md`

## Recommendation

READY FOR PRODUCT OWNER MANUAL ACCEPTANCE

Product Owner review should inspect the Enfield 313 destination/extension annotation and the Waltham 16/16C frequency and operating-period rows in the running Alpha.15 V2 review build. No further sprint scope is opened here.
