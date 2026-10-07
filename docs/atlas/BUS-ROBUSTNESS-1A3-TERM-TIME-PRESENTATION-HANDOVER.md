# BUS-ROBUSTNESS-1A3 — Term-time presentation closeout handover

Status: implementation complete; Product Owner manual acceptance required  
ATLAS version: `2.0.0-alpha.15`  
Baseline: `6e3b5597f6dd3badba08280c6156e48a83aa54ee`  
Baseline branch: `codex/atlas-bus-enfield-variant-closeout`  
Implementation branch: `codex/atlas-bus-term-time-presentation-closeout`  
Worktree: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\atlas-bus-term-time-presentation-closeout`  
Implementation SHA: `651ecee` (`fix: compose split term-time bus presentation`)  
Final branch tip: the documentation-only closeout commit containing this handover

## Scope and root cause

This sprint closes the term-time presentation defect identified in the bounded Enfield reproduction. The source evidence is generic TfL calendar evidence, not route-specific logic.

The affected TfL records included:

- `Mon-Fri Non-Schooldays` → resolved profile `non-school-day`;
- `Mon-Th Schooldays` → resolved profile `school-day`, Monday–Thursday;
- `School Friday` → resolved profile `school-day`, Friday;
- ordinary Saturday and Sunday evidence retained separately.

The baseline had two independent defects. `Th` was not recognised as the Thursday abbreviation, and a label such as `School Friday` was not classified as school-day. After parsing, the planner also selected one school-day result for every weekday, so a split term-time source could lose valid Tuesday–Friday evidence. The baseline then added `Timetable may vary during school holidays.` to every affected row.

## Implemented policy

The planner now composes a representative week from resolved calendar semantics:

- all applicable term-time/school-day profile results are combined by weekday, so split source records such as Mon–Thu plus School Friday are retained;
- ordinary weekend evidence is used for Saturday and Sunday only when it exists;
- no weekend service is fabricated when ordinary weekend evidence is absent;
- non-school/holiday profile evidence remains available in the row’s profile-scoped evidence and schedule fields;
- a row-level holiday sentence is no longer emitted;
- one table-wide exact note is emitted when at least one displayed row has both a proven term-time profile and a proven non-school/holiday profile:

> Timetable note: Where separate term-time and school-holiday timetables are published, the term-time timetable is shown. Routes marked † have separate timetables. Timetable information reflects the data available to ATLAS on YYYY-MM-DD and services may vary during school holidays.

The date is derived from deterministic assessment/provenance timestamps, with no current-clock dependency. The route marker `†` is presentation-only: the underlying `routeNumber` remains unchanged. Genuine single-calendar school-only services, ordinary single-profile services and services without a proven term-time/non-school pair do not receive the marker or table-wide note.

Browser and Word use the same shared planner row and the same note/marker helpers. GROUP, CIRC, DEST, endpoint identity, direction, frequency, operating-period and source-authority logic were not redesigned.

## Bounded Enfield replay

Control: Enfield Town / immediate station area, coordinates `51.6523584, -0.0783252`, radius `250 m`. Frozen national snapshot: `36125621080`. No fresh national acquisition was performed. Bounded live TfL timetable calls were permitted by the sprint; prepared national evidence and review assets remained on the accepted configuration.

Replay result:

- status `complete`;
- 10 selected stops;
- 57 service summaries;
- 35 detailed TfL timetable requests, all successful and processed;
- one route-metadata request;
- zero unresolved timetable requests;
- `timetableConclusion: MATCHED`;
- anonymous TfL requests, no embedded API key, no realtime arrivals;
- supplementary BODS was attempted as controlled supplementary evidence; no fresh national timetable acquisition was performed.

The selected presentation controls were:

| Route control | Result |
| --- | --- |
| 121 | Both directions have `ordinary`, `school-day`, `non-school-day`; both render `121†`, have populated Mon–Fri and Sat–Sun schedules, and have no row-level holiday note. |
| 191 | Both directions have the same proven split calendar; both render `191†` with populated weekdays and weekends. |
| 192 | Both directions are ordinary-only; no dagger and no holiday note. |
| 313 | Both directions have the proven split calendar; both render `313†` with populated weekdays and weekends. |
| W8 | Both directions have the proven split calendar; both render `W8†` with populated weekdays and weekends. |
| 629 | Both directions are genuine `school-day` only, with two weekday journeys/day and no weekend service; no dagger. |
| 657 | Genuine school-day-only negative control remains unmarked and retains its school-only qualification. |

The term-time table-wide note was emitted once for the displayed mixed-calendar result and used the replay evidence date `2026-10-07`.

## Regression coverage

Focused deterministic coverage includes:

- `tests/atlas/tfl-bus-timetable.test.mjs` — `Mon-Th Schooldays`, `School Friday`, profile and day parsing;
- `tests/atlas/bus-robustness-1a-calendar-simple.test.mjs` — split-week composition, non-school evidence retention, weekends, dagger, exact note and Browser/Word parity;
- `tests/atlas/bus-robustness-1a2-enfield-variant.test.mjs` — Enfield controls and removal of row-level holiday wording;
- `tests/atlas/alpha13-calendar-safety.test.mjs` and `tests/atlas/alpha13-summary-closeout.test.mjs` — existing calendar and planner contracts;
- `tests/atlas/bus-word-export.test.mjs` — Word export parity.

The full command was run from the clean implementation tip with elevated native subprocess permissions because the legacy-isolation fixture invokes `git init`:

```text
node tests/atlas/run-all.mjs
```

It exited `0` and ended exactly with:

```text
ATLAS Alpha.15 deterministic suite passed.
```

The suite also passed the existing Chingford/Waltham controls, including 121/191/192/313/W8/629/657 coverage where applicable, GROUP, CIRC, DEST, endpoint-alias, source/provenance, frequency, operating-period, Browser/Word, QA-01/02/03, legacy-isolation and review-environment contracts.

## Changed files

Implementation and regression files changed by this sprint:

- `src/atlas/adapters/tfl-bus-timetable-adapter.mjs`
- `src/atlas/domain/bus-planner-summary.mjs`
- `src/atlas/presentation/bus-word-export.mjs`
- `atlas/assets/js/app.mjs`
- `atlas/assets/css/atlas-shell.css`
- `tests/atlas/tfl-bus-timetable.test.mjs`
- `tests/atlas/bus-robustness-1a-calendar-simple.test.mjs`
- `tests/atlas/bus-robustness-1a2-enfield-variant.test.mjs`
- `tests/atlas/alpha13-calendar-safety.test.mjs`
- `docs/atlas/BUS-ROBUSTNESS-1A3-TERM-TIME-PRESENTATION-HANDOVER.md`

No source authority, acquisition workflow, national snapshot, release/version, grouping architecture, publication, deployment or Alpha.16 files were changed.

## Review build and manual gate

The final clean review server was verified at:

```text
http://127.0.0.1:8769/atlas/?review=v2#modules
```

The review route is `/atlas/#modules`. At the clean implementation tip the server returned `data-atlas-test-build="BUS-TFL-COMPLETE · 4b14d6b"`; after the documentation-only closeout commit, restart the same server from the clean final tip to refresh that seven-character suffix. Browser/Word parity is covered deterministically, but Product Owner visual/manual inspection of the clean review build remains required.

## GitHub tooling adoption review

Dependabot, Codecov, OpenSSF Scorecard, Sentry and Renovate were reviewed for this sprint. None was installed or reconfigured. Adoption remains outside this focused presentation closeout.

## Recommendation and exclusions

Recommendation: `READY FOR PRODUCT OWNER MANUAL ACCEPTANCE`.

No merge, deploy, publication or Alpha.16 promotion was performed. `BUS-ROBUSTNESS-1B` and `BUS-POLISH` were not started. Timetable data can change outside this bounded replay; the final decision remains a Product Owner acceptance of the clean review build.
