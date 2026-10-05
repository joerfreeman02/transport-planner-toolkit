# BUS-TFL-PERIOD-1C handover

## 1. Scope and governance

BUS-TFL-PERIOD-1C corrects the generic TfL source-authority and supplementary-evidence regression introduced by 1B. It preserves the valid cross-boundary TfL operating-period correction and does not redesign GROUP, CIRC, DEST, stop discovery, route-family grouping, national acquisition or the general frequency methodology. ATLAS remains a development candidate on Alpha.15. No merge, publication, activation, deployment, Alpha.16 promotion or BUS-POLISH is included.

Branch: `codex/atlas-bus-tfl-operating-period-1c`

Worktree: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\atlas-bus-tfl-operating-period-1c`

Baseline SHA: `9654d321d764428d83a91de7681bb62a4bdc076c`

Implementation commit: `b91bffc4ff0f873a3a6cdf11fbf379da572bee31`

Final handover commit: recorded by the final `git rev-parse HEAD` after this document is committed.

## 2. Proven root causes

### Service-note leakage

The 1B adapter correctly retained BODS timing differences, but `buildServiceSummaries()` exposed the resolved supplementary-authority warnings through `operatingPeriodReviewWarnings`. `buildPlannerRow()` then appended those warnings directly to `serviceNote`; the warning was generated once per service day, so the same resolved “retained for audit” diagnostic was repeated across the week. Browser and Word both consume the planner row, so both presentation surfaces received the leak. This was a classification/data-flow defect: a resolved TfL-versus-BODS audit difference is not automatically a planner qualification.

### Frequency and journey-count inflation

The 1B `retainSupplementaryDepartures()` path merged matching BODS minutes into the TfL record’s `stopSchedules` and `departureEvidenceByDay`. The assessment layer then built `serviceDepartureEntries()`/frequency from that mixed population. A TfL journey and its slightly different BODS representation therefore became two exact-minute departures. The production-shaped 657 replay proved the mechanism: one authoritative TfL journey plus one BODS representation must remain one TfL journey/day, while two genuinely distinct TfL journeys remain two/day.

### Why 1B tests missed both defects

1B checked TfL authority, operating-period boundaries and retained supplementary evidence, but did not assert that the authoritative departure population remained TfL-only, did not assert the one-journey/two-representations invariant, and did not exercise the raw warning through a real planner row and Word export. It also lacked the generic unrelated-London presentation control. The 1C tests add those production-shaped contracts.

## 3. Corrected architecture

For the same TfL route at the relevant stop, successful scheduled TfL evidence is the authoritative calculation population. BODS/TNDS evidence is stored separately as supplementary audit evidence. The adapter now keeps `provider` and `primaryAuthority` as TfL, records BODS as `source.supplementaryProvider`, and stores supplementary schedules/evidence in `supplementaryStopSchedules` and `supplementaryDepartureEvidenceByDay` without changing authoritative `stopSchedules` or `departureEvidenceByDay`.

`buildServiceSummaries()` selects authoritative departure evidence before deriving departures, frequency, calendar and operating-period populations. TfL wins when valid TfL evidence exists; national evidence remains the explicit primary/fallback when TfL is unavailable or no TfL authority applies. Supplementary discrepancies remain in structured audit fields and `operatingPeriodAuthority.auditWarnings`. Genuine unresolved conflicts continue through the concise planner review mechanism. Resolved audit diagnostics do not enter ordinary `serviceNote` or Word service notes.

No route, site, stop ID or observed minute is hard-coded in production code. Named controls occur only in deterministic tests and this handover.

## 4. Files changed

- `src/atlas/adapters/authoritative-bus-timetable-adapter.mjs`
- `src/atlas/domain/bus-service-assessment.mjs`
- `src/atlas/domain/bus-planner-summary.mjs`
- `tests/atlas/run-all.mjs`
- `tests/atlas/tfl-operating-period.test.mjs`
- `tests/atlas/tfl-operating-period-1b.test.mjs`
- `tests/atlas/tfl-operating-period-1c.test.mjs`
- `docs/atlas/BUS-TFL-PERIOD-1C-HANDOVER.md`

## 5. Bounded controls

The required control set is Waltham Cross at approximately `51.6857829, -0.0330001`, 700 m, full assessment; Chingford/Normanshire at the established 700 m control; an unrelated central-London control; and the Pipers/BODS-only national control where practical. The final Browser and Word observations are recorded below after the final V2 server is live.

### Waltham Cross

The preserved 1B TfL-led results are 217 approximately `04:00–00:59` next day, 317 approximately `05:00–00:59` next day, and 327 approximately `07:00–19:59`. 279 and 491 retain their accepted daytime/late behaviour. N279 retains genuine night-service chronology. GROUP/CIRC structure remains covered by the existing regression suite. Supplementary BODS evidence remains inspectable but is not emitted as repeated ordinary Service notes.

### Chingford / Normanshire

357 and 444 retain both accepted directions; W16 retains both accepted directions. 657 remains school-days-only and its authoritative TfL schedule supplies one journey/day per evidenced direction; single-journey wording remains departure-style. The 1C production-shaped test proves the same result generically without hard-coding route 657 or its observed minutes.

### Unrelated London control

The control is intentionally unrelated to Waltham and Chingford. Final exact coordinates, radius, selected stop and route inventory, together with Browser/Word observations, are added after the bounded V2 replay. Its purpose is to prove that the warning classification is generic across TfL assessments.

### Pipers / national control

BODS-only national services remain national-primary. The explicit fallback path remains available when TfL is unavailable or unresolved. The known frozen-source Pipers limitation remains a fixture limitation and is not changed by this sprint.

## 6. Browser and Word evidence

The deterministic 1C presentation test verifies that supplementary audit evidence survives in structured detailed evidence while the raw “BODS departure evidence was retained for audit...” diagnostic is absent from the planner service note and Word output. It also verifies a genuine unresolved conflict still receives the concise planner review note. Final V2 runtime values are recorded after launch:

- review URL: to be recorded after final V2 launch;
- `isV2Review`: to be recorded from Browser runtime;
- V2 data base: `/__atlas-review/v2-data/`;
- exact final build header: to be recorded after the final commit;
- Waltham/Chingford/third-control Browser and Word parity: to be recorded after bounded replay.

## 7. Automated verification

Focused commands passed:

- `node tests/atlas/tfl-operating-period.test.mjs`
- `node tests/atlas/tfl-operating-period-1b.test.mjs`
- `node tests/atlas/tfl-operating-period-1c.test.mjs`
- `node --check` for all three changed production modules
- `git diff --check`

The full command `node tests/atlas/run-all.mjs` passed from the committed clean worktree, including the legacy-isolation guard, review-environment checks, TfL operating-period tests, 1B/1C tests, Browser contracts, Word contracts, GROUP, CIRC, DEST, calendar, frequency, QA-02 and QA-03 controls.

## 8. V2 data boundary

The V2 environment uses frozen national source snapshot run `36125621080`, snapshot ID `8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9`, with acquisition disabled. TfL remains the normal bounded live London timetable provider. No fresh NaPTAN, NPTG, BODS or TNDS acquisition is permitted. A compatible prepared V2 cache may be rebuilt from the frozen snapshot when the generator fingerprint changes; the final result is recorded after the current build completes. No broad London crawl or national rebuild outside the V2 review preparation is performed.

## 9. Limitations and acceptance status

The runtime controls are bounded and do not claim a broad live-national crawl. Product Owner acceptance remains a separate guided manual decision after Technical Director review and Browser/Word inspection. BUS-TFL-PERIOD-1B was manually rejected and is not retrospectively described as accepted. This candidate is not production-activated and BUS-POLISH has not started.

## GitHub tooling adoption review

Dependabot remains installed/configured and should be retained. Codecov may be considered only with approval at the appropriate production/freeze milestone. OpenSSF Scorecard remains a governed future consideration. Sentry remains deferred pending an explicit privacy/telemetry decision. Renovate remains deferred while Dependabot is the selected dependency updater. Branch protection remains a repository-side confirmation item where it cannot be independently read through the current integration. No GitHub tooling was installed or materially reconfigured in this sprint.
