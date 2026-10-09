# BUS-ROBUSTNESS-1A4F-C1 — TfL iBus Calendar Stability Handover

## Closeout identity

- Repository: `transport-planner-toolkit`.
- Worktree: `atlas-bus-tfl-ibus-calendar-stability`.
- Branch: `codex/atlas-bus-tfl-ibus-calendar-stability`.
- Baseline: `139f3db4a5f5b738e106dacd1516abd6b9c4e162`.
- Version: `2.0.0-alpha.15`; unchanged.
- Functional implementation SHA: `d4198ae` (`Assert real inactive iBus blocks are date-filtered`), following the calendar/index and planner-presentation implementation commit `649de0d`.
- Final tip: this handover commit; its exact SHA is reported in the closeout response because a commit cannot contain its own SHA.
- Working tree is clean after closeout. No merge or deployment was performed. National prepared snapshot `36125621080` remains frozen; no national acquisition or TNDS activation occurred.

## Exact files changed

The corrective implementation changes these 14 files; this handover is the 15th:

- `atlas/data/tfl-ibus/20261009/operator-index.json`
- `atlas/data/tfl-ibus/manifest.json`
- `src/atlas/presentation/bus-word-export.mjs`
- `tests/atlas/alpha13-calendar-safety.test.mjs`
- `tests/atlas/alpha14-production-row-consolidation.test.mjs`
- `tests/atlas/alpha15-production-fidelity.test.mjs`
- `tests/atlas/bus-alpha13-planner-summary.test.mjs`
- `tests/atlas/bus-dest-endpoint-intelligence.test.mjs`
- `tests/atlas/bus-planner-golden-rule.test.mjs`
- `tests/atlas/bus-qa-01-acceptance.test.mjs`
- `tests/atlas/bus-robustness-1a-calendar-simple.test.mjs`
- `tests/atlas/bus-robustness-1a4f-tfl-ibus-operator.test.mjs`
- `tests/atlas/tfl-operating-period-1b.test.mjs`
- `tools/atlas-review/build-tfl-ibus-operator-index.py`
- `docs/atlas/BUS-ROBUSTNESS-1A4F-C1-IBUS-CALENDAR-STABILITY-HANDOVER.md`

No operator-resolution/runtime code was changed. The planner-facing Word contract was restored to seven columns: Route, Operator, Direction / main service pattern, Served at, Principal locations, Typical frequency, Operating period at stop. The normal Browser service table continues to present those seven fields (with its separate Include control); it has no operator-provenance column. `source.operatorProvenance`, source hierarchy, Base_Version, authority diagnostics and ambiguity evidence remain in the engineering model and detailed audit presentation.

## Calendar defect and correction

The previous builder retained `Block_CalendarDay` only when its date equalled `--assessment-date`, despite advertising the full Base_Version validity range. The builder now retains the official calendar rows for relevant blocks whose calendar date is in `[Valid_From, Valid_To)`. It does not synthesize daily activity, retain dates outside that range, or mix Base_Versions. `--assessment-date` remains the selected source/version validity check and the recorded acceptance-control date. Runtime still filters the retained evidence by the requested assessment date; an absent or inactive day cannot borrow another day's operator.

- `Base_Version`: `20261009`.
- Validity: `2026-10-08T00:00:00` inclusive to `2026-11-05T00:00:00` exclusive.
- Retained calendar-day coverage: 28 actual dates, `2026-10-08` through `2026-11-04`; 2,922 real block/date rows in the 313-scoped index.
- The rebuilt index is 340,287 bytes, SHA-256 `39b0eae384ec7a44115f898b940b3f35213577195706d38a82fa97707d2610de`; the manifest pins the same hash and validity.

The index remains intentionally scoped to `Service_Line_No 313`. Network-wide/current iBus generation remains a production-source/updater closeout requirement; this change does not expand the indexed network.

## Real-data verification and acquisition

The existing official TfL cache was reused from `%TEMP%\atlas-ibus-inspect-20261009`. The rebuild made zero source downloads (zero bytes), recorded 33 cache hits / 130,685,457 cached bytes, and made one public S3 listing request. That listing covered 792 objects and identified 28 schedule archives. No source archive was newly downloaded.

The real rebuilt 313 index resolves code `MN`, Arriva London North, on both `2026-10-09` and `2026-10-10` from each date's own active `Block_CalendarDay` evidence. Real 313 pattern 6912 has two active journeys on October 10 and five journeys without active evidence that day; the resolver returns only active October 10 candidates. Tests also prove that a synthetic day-A operator cannot leak into day B, a valid inactive date remains unresolved, mixed-version calendar rows are rejected, and `2026-11-05` returns `outside-base-version-validity`.

## Protected operator and timetable outcomes

- 191 remains Arriva London; 317 remains Metroline Travel.
- 313 remains Arriva London North in both ordinary directions: Towards Chingford Station and Towards Potters Bar Railway Station.
- Dame Alice Owen's School remains secondary/restricted; Crown Road (EN1) remains the named short working.
- Direct TfL timetable operator authority, iBus fallback precedence, BODS audit-only disagreement, provenance tiers, and fail-closed multi-operator ambiguity are unchanged.
- GROUP, DEST, CIRC, endpoint aliases and intelligence, timetable schedules, calendar/term-time rules, frequency, operating periods, and school-only behavior are unchanged. Browser and Word operator values remain equal; the Word regression checks the seven-column contract and confirms `source.operatorProvenance` remains available outside that contract.

## Live controls

- **Enfield Town, 250 m:** 13 stops, 14 routes, 44 route × StopPoint pairs, and 24 planner summaries; accepted route inventory remains `121, 191, 192, 231, 307, 313, 317, 329, 377, 456, 629, N29, W8, W9`. Both ordinary 313 directions retain Arriva London North, with the school and Crown Road qualifications separate. The review queue has zero avoidable endpoint-review items. The Word export retains operator parity and underlying provenance while presenting the seven-column contract.
- **Chingford Mount / Normanshire Drive, 250 m:** routes 357, 444, 657 and W16 retained; 657 remains school-days-only, one journey/day/direction.
- **Waltham Cross Bus Station, 250 m:** six stops and 19 summaries; accepted route families remain unchanged. The known stop-coverage contradiction and OSRM review at StopPoint `210021703430` remain untouched for BUS-ROBUSTNESS-1B.

## Testing and review build

- Focused real-index tests cover multiple dates, mixed Base_Version rejection, date-specific selection, real October 9/10 resolution, exclusion of inactive October 10 journeys, no date leakage, unresolved inactive dates, and outside-validity failure.
- Word regressions now use seven columns and retain assertions for operator parity, frequency and operating periods.
- Full suite: `node tests/atlas/run-all.mjs` passed with exit code 0 after the temporary legacy-isolation Git fixture was allowed to initialize.
- Exact final line: `ATLAS Alpha.15 deterministic suite passed.`
- Final V2 review URL and visible final-tip header are recorded in the closeout response; the review server remains running with Enfield open.

## GitHub tooling adoption review

- Dependabot: retain as the current dependency-update baseline.
- Codecov: defer pending an explicit coverage policy and repository approval.
- OpenSSF Scorecard: read-only security-posture review candidate; do not enable/configure in this correction.
- Sentry: defer until telemetry, privacy and security review is approved.
- Renovate: no adoption; it overlaps with Dependabot.
- No GitHub tooling was installed or reconfigured.

**READY FOR PRODUCT OWNER FINAL TFL/LONDON INTELLIGENCE ACCEPTANCE**
