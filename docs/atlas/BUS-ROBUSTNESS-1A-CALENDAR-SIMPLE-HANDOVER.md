# BUS-ROBUSTNESS-1A — Simple Calendar Presentation Handover

Status: implementation complete; Product Owner manual acceptance required  
ATLAS version: `2.0.0-alpha.15`  
Baseline: `bb8f484677c7f44b56043f0ab87768963c281325`  
Branch: `codex/atlas-bus-robustness-1a-calendar-simple`  
Worktree: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\atlas-bus-robustness-1a-calendar-simple`  
Prior implementation SHA: `03e2798` (`fix: simplify mixed school calendar presentation`)
Corrective implementation SHA: `4475de5` (`fix: compose representative school-term week`)
Final branch tip: the documentation-only closeout commit containing this handover update

## Scope and root cause

The accepted baseline was reproduced at Enfield Town Station / immediate station area using coordinates `51.6523584, -0.0783252` and a `250 m` radius, with the accepted TfL/prepared-data configuration. The bounded live run returned 10 stops and 35 TfL timetable identities and produced ordinary rows for 121, 313 and W8.

For the affected ordinary directions, resolved profile populations included `ordinary`, `school-day` and `non-school-day`. On the baseline, `buildPlannerRow` correctly calculated each profile but selected `ordinary` when present and then emitted every effective profile through `mixedProfileOutput`. This generated `Standard days`, `School days (additional)` and `Non-school days (additional)` frequency and operating-period lines.

The same component also carried source notes such as `School-day journeys only.` and `Non-school days only.`. The downstream material-note and variant-qualification paths treated those timetable-variant assertions as service qualifications, although the route operated under both calendars. The profile-specific departure, frequency and operating-period calculations themselves were valid; the defect was final profile selection and planner presentation.

The corrective defect was narrower: after the first correction selected the school-day profile as the sole normal result, the whole school-day result object also supplied Saturday and Sunday. Valid ordinary weekend evidence therefore remained retained in profile-scoped evidence but was omitted from the normal planner row, which could display `No scheduled service` on a weekend that had ordinary departures.

## Minimal correction

The correction is confined to `src/atlas/domain/bus-planner-summary.mjs`:

- detect a resolved school-day plus non-school-day profile combination at the final planner-row stage;
- compose a representative school-term week: school-day evidence for Monday-Friday, and the applicable ordinary profile for Saturday-Sunday when ordinary evidence exists;
- use no ordinary weekend fallback when no ordinary profile exists, so a mixed school-calendar service cannot gain fabricated weekend service;
- suppress the mixed-profile `Standard days` / `additional` lines from normal frequency and operating-period output;
- retain every profile in `calendarSchedulesByProfile`, `calendarDeparturePopulationByProfile`, `calendarFrequencyByProfile`, `calendarOperatingPeriodsByProfile` and the related evidence fields;
- suppress calendar-variant qualifications for this ordinary mixed-calendar case;
- add exactly `Timetable may vary during school holidays.` only when the same reconciled row has positive effective `school-day` and `non-school-day` profiles;
- leave genuine single school-day, genuine non-school-only, ordinary single-profile and all calculation methods unchanged.

No adapter, `periodCalendar` parser, source authority, TfL/BODS architecture, grouping, circular, destination, endpoint-alias, stop-discovery, prepared-data, assessment, browser, Word, national-data or versioning redesign was made.

## Approved presentation rule

Where the same public service has both school-day and non-school-day weekday timetable evidence, the planner shows a representative school-term week: the school-day/school-term timetable is used Monday-Friday, and applicable ordinary/weekend evidence is used Saturday-Sunday. The non-school timetable remains inspectable in Detailed Evidence/provenance. The exact normal service note is:

> Timetable may vary during school holidays.

The row does not display `Standard days`, `School days (additional)` or `Non-school days (additional)`, and it does not display `School-day journeys only.` or `Non-school days only.` for that mixed ordinary service. If no ordinary Saturday/Sunday evidence exists, the row remains `No scheduled service` on those days; no weekend service is inferred.

## Controls

The final live Enfield reproduction showed:

- 121: both directions use only the school-day principal presentation; the note is present; service qualification is absent; non-school evidence remains retained.
- 313: both directions use only the school-day principal presentation; the note is present; service qualification is absent; non-school evidence remains retained.
- W8: both directions use only the school-day principal presentation; the note is present; service qualification is absent; non-school evidence remains retained.

Route 657 remains a genuine school-day-only control. Its one-journey/day departure behaviour and school-day calendar remain unchanged, and it retains `School-day journeys only.` without the generic school-holiday variation note. Genuine non-school-only services retain their existing qualification. Ordinary single-profile services receive no new note.

The non-school profile is not discarded: the deterministic and live controls assert retained profile-scoped departure populations and schedules, and Browser/Word consume the same representative-week planner row. The mixed-with-weekend control asserts ordinary Saturday/Sunday departures in the normal row; the mixed-without-weekend control asserts no invented weekend service. Route 657, non-school-only and ordinary single-profile controls remain negative controls for the holiday note.

## Regression verification

Focused tests passed:

- `node tests/atlas/bus-robustness-1a-calendar-simple.test.mjs`
- `node tests/atlas/alpha13-calendar-safety.test.mjs`
- `node tests/atlas/tfl-bus-timetable.test.mjs`
- `node tests/atlas/alpha13-summary-closeout.test.mjs`
- `node tests/atlas/alpha15-production-fidelity.test.mjs`
- `node tests/atlas/alpha15-planner-service-group.test.mjs`
- `node tests/atlas/bus-group-stop-1a-hardening.test.mjs`
- `node tests/atlas/bus-group-1c-real-runtime.test.mjs`
- `node tests/atlas/bus-group-1d-real-runtime.test.mjs`
- `node tests/atlas/bus-group-1e-real-runtime.test.mjs`
- `node tests/atlas/bus-group-1f-real-runtime.test.mjs`
- `node tests/atlas/bus-group-1g-wording.test.mjs`
- `node tests/atlas/bus-circ.test.mjs`
- `node tests/atlas/bus-circ-1c-enriched-group.test.mjs`
- `node tests/atlas/bus-endpoint-alias-closeout.test.mjs`
- `node tests/atlas/tfl-operating-period.test.mjs`
- `node tests/atlas/tfl-operating-period-1b.test.mjs`
- `node tests/atlas/tfl-operating-period-1c.test.mjs`
- `node tests/atlas/bus-qa-02-frequency.test.mjs`
- `node tests/atlas/bus-qa-03-integrity.test.mjs`
- `node tests/atlas/bus-word-export.test.mjs`
- `node tests/atlas/bus-ui-contract.test.mjs`

These retain the accepted Waltham controls: 279/317/N279 endpoint aliases, accepted operating periods, TfL/BODS authority and diagnostics, GROUP, CIRC, DEST, frequency and Word parity. The accepted Chingford controls retain 357, 444 and W16 directions and 657 school-day behaviour.

The complete deterministic suite command is:

```text
node tests/atlas/run-all.mjs
```

Final implementation clean-worktree result: `node tests/atlas/run-all.mjs` exited `0` and ended exactly with `ATLAS Alpha.15 deterministic suite passed.` The first sandboxed attempt was blocked only at the legacy-isolation subprocess (`spawnSync git init`, `EPERM`); the authoritative rerun with native subprocess permissions passed all deterministic controls, including the corrective mixed-calendar weekend tests.

## Final review build

Frozen national snapshot: `36125621080`. No fresh national acquisition was performed. The Enfield reproduction used bounded live TfL calls permitted by this sprint; prepared national evidence remained on the accepted configuration.

Final review URL: [ATLAS corrective implementation review](http://127.0.0.1:49461/atlas/#modules)
Build header: `BUS-TFL-COMPLETE · 4475de5`
Browser/Word parity: passed by the deterministic planner and Word-table assertions; Product Owner visual/manual inspection remains the acceptance gate.

## Changed files

The corrective implementation commit changed only the shared planner summary and its deterministic regression test:

- `src/atlas/domain/bus-planner-summary.mjs`
- `tests/atlas/bus-robustness-1a-calendar-simple.test.mjs`

The complete sprint branch also contains the earlier acceptance-test, runner and handover updates:

- `src/atlas/domain/bus-planner-summary.mjs`
- `tests/atlas/alpha13-calendar-safety.test.mjs`
- `tests/atlas/bus-robustness-1a-calendar-simple.test.mjs`
- `tests/atlas/run-all.mjs`
- `tests/atlas/tfl-bus-timetable.test.mjs`
- `docs/atlas/BUS-ROBUSTNESS-1A-CALENDAR-SIMPLE-HANDOVER.md`

## GitHub tooling adoption review

Dependabot, Codecov, OpenSSF Scorecard, Sentry and Renovate were reviewed for this sprint. None was installed or reconfigured. The existing governance position remains unchanged; tooling adoption is outside this small presentation correction.

## Remaining limitations and recommendation

The live Enfield evidence is bounded to the accepted source configuration and the requested 250 m control. Timetable data can change outside this review run, and the final decision remains a Product Owner manual acceptance of the clean review build. No fresh national acquisition was run for the correction.

Recommendation: `READY FOR PRODUCT OWNER MANUAL ACCEPTANCE`.

BUS-ROBUSTNESS-1B and BUS-POLISH were not started. No merge, deploy, publication or Alpha.16 promotion was performed.
