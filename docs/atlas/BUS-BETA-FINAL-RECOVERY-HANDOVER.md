# ATLAS Bus Beta Final Recovery Handover

## Release-candidate identity

- Accepted functional baseline: `b3ad244dc98253da2f95a8ea9d0274ab32140f6f` (`atlas-bus-beta-intelligence-accepted-2026-10-23`).
- Rejected polish runtime inspected: `38cc166864a96aeccef8ceeb037dc5c46a087d39`, branch `codex/atlas-bus-beta-polish`. It remains forensic reference only.
- Recovery branch: `codex/atlas-bus-beta-final-recovery`.
- Validated runtime commit: `d2ed143d751b6b1573747d64c9b5cc1d94b2fddf`.
- This handover is a documentation-only follow-up. It does not change the runtime commit or any application, test, workflow, or data file.
- Version/build remain `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`.

## Regression diagnosis and recovery

The rejected runtime diff against the accepted baseline contained no edits to Bus domain logic, adapters, application services, route/source arbitration, timetable, calendar, frequency, operator, endpoint, or fail-closed evidence code. It did alter the application/presentation boundary: the accepted `buildControlledBusWording` path was replaced with a bespoke narrative count over presentation rows; Browser and Word were fed separately mapped presentation copies; and existing golden contracts were edited alongside the presentation changes. There was no frozen whole-product semantic oracle to detect when the actual application path diverged from the accepted result.

The rejected Waltham Cross report's 39 endpoint-review items and expanded route population were not reproduced as a consequence of any changed Bus-domain rule. In the final exact-candidate normal-product audit, Waltham Cross produced 15 assessed stops, 22 service summaries, and 6 evidence-review items, matching the accepted semantic oracle. That audit has live TfL disabled and no Waltham-specific captured TfL response; therefore the historical 39-item result cannot be attributed to a particular TfL response or claimed as fully reproduced. The recovery does not hide review items or filter routes. The unresolved historical trigger is recorded here rather than guessed.

The application was rebuilt from the accepted baseline. Map references are added to copies of stop/service presentation records and never mutate source or planner data. Browser rows, Word rows, assessment wording, and the formal Bus facts are covered by a versioned accepted-product oracle. Any change in stops, logical groups, route/service identity, direction, operator, frequency basis, period, qualifications, review evidence/count, or completion state fails the parity contract.

## Frozen candidate and parity evidence

Run #75 remains immutable and unchanged:

- Run: `39430415441`
- Artifact: `12275615359`, `atlas-bus-beta-review-candidate-39430415441`
- Producer SHA: `151199cc914c235870f444d26b03c2309edbd035`
- Canonical GitHub digest: `sha256:5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`

The local Browser/Word audit used that prepared candidate, reported no external requests, and reported acquisition, publication, and deployment all `false`. Its frozen semantic parity check passed five controls: Pipers Lane, Pipers route 46, Waltham Cross, Chingford, and PE1. A separate captured-response Enfield Browser/Word audit passed both route 313 and route 329; it used no live TfL HTTP and no national acquisition.

Control results:

- **Waltham Cross:** 15 assessed stops, 22 service summaries, 6 review items; accepted-oracle parity passed. No route-specific suppression was introduced.
- **Pipers Lane:** accepted 230/231 presentation and evidence parity passed. Route 46 appears in both directions as Centrebus, typically every 60 minutes Monday–Saturday, with no scheduled Sunday service. Operating periods are approximately 06:56–19:19 towards Hemel Hempstead and 07:17–20:32 towards Luton on weekdays; Browser and Word facts match.
- **PE1:** 41 assessed stops, 55 service summaries, 2 review items; route 202 retains its three evidenced branches (Peterborough, Austerby, Bourne) with 2, 2, and 1 weekday/weekly departures as appropriate. Parity passed.
- **Chingford:** complete fixture-backed TfL golden control; two route-657 rows, both visibly school-day qualified. Parity passed.
- **Enfield 313:** the captured production-composition audit produced the Chingford-bound normal service, `Arriva London North`, typically every 20 minutes Monday–Saturday and every 30 minutes Sunday. Browser and Word agree. The Potters Bar-bound normal service is retained by the accepted regression suite.
- **Enfield 329:** no Browser or Word planner service row is fabricated. Two conflicting Run #75 candidate operator records remain unresolved; the applicable iBus index has no Service_Line mapping or productive pattern. Sources & Checks retains the unresolved route/stop timetable evidence and Word retains the route-level timetable/source review qualification.

## Product and presentation changes

- Replaced the old form-led surface with the navy EAS | ATLAS shell, truthful Modules/About navigation, and restrained orange active state. No Projects, global search/export, cloud account, fake status, unsupported metrics, or browser-geolocation controls were added.
- Added consistent, recognizable Bus, Accessibility, Rail, Road Safety, and Drawings icons with truthful Beta/legacy/planned states.
- Added a compact six-stage guided workflow for location, point confirmation, settings, assessment, results, and Word export. The active step is orange; the desktop workflow rail is navy.
- Kept the map persistent and dominant. Existing assessment-point adjustment and deterministic numeric references remain available.
- Preserved both routed nearest logical-stop-group assessment and configurable full-radius assessment, staged large-assessment continuation, real processing stages, New/Reset confirmation, fail-closed evidence, detailed Sources & Checks, and Word export.
- Reworked Sources & Checks with grouped summaries and expandable underlying evidence. Review details remain available; review items are not suppressed to improve appearance.
- The processing overlay is map-led and uses the approved ATLAS mark without fabricated percentages. Status before assessment is neutral; no false `Current` claim is shown.
- Header uses the approved EAS | ATLAS lock-up. Footer uses the approved EAS | FORGE dark-background lock-up, retains `Created by Joe Freeman`, and does not repeat ATLAS branding.
- About page retains product, source, version, FORGE, and creator information.
- Word service facts, selections, qualifications, review requirements, and deterministic map references remain aligned with Browser output. The Transport Statement is a conservative summary of selected planner rows, not raw pattern counts.

## Validation

- Full deterministic ATLAS suite: `node tests/atlas/run-all.mjs` — **passed**, exit 0 (`ATLAS Alpha.15 deterministic suite passed.`). This includes the UI, browser, map, loading, staged assessment, reset, source-review, Word, parity, and workflow contracts.
- Full Bus-data Python suite: `python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v` — **309 tests passed**, `OK`.
- Focused UI/parity/workflow/review-environment contracts — **passed**; review-environment suite: 7 tests passed.
- Five-control normal-product Browser/Word audit — **passed**, frozen parity 5/5; zero failed requests, zero external requests, no acquisition/publication/deployment.
- Captured Enfield 313/329 Browser/Word audit — **passed**, frozen parity 2/2; zero external requests, no acquisition/publication/deployment.
- Run #75 artifact identity — canonical run/artifact/producer/digest confirmed against the accepted provenance record; candidate files were not changed.
- `git diff --check` — **passed**.
- Domain intelligence, source adapters, workflows, prepared data, and Run #75 were unchanged. No live national-source acquisition or candidate rebuild occurred.
- Hosted validation was not run: this is a local presentation recovery, and the available candidate workflows can acquire or prepare source data. The protected workflow was not dispatched.

## Local Product Owner acceptance environment

- Runtime SHA: `d2ed143d751b6b1573747d64c9b5cc1d94b2fddf`.
- Runtime worktree: `C:\Users\joe.freeman\AppData\Local\Temp\atlas-bus-beta-runtime-d2ed143` (clean, detached at that exact SHA).
- URL: `http://127.0.0.1:8771/atlas/?review=v2#modules`.
- Server PID: `37936`, bound only to `127.0.0.1:8771`.
- `/atlas`, CSS, Leaflet, `/src`, and Run #75 BODS/TNDS manifests returned HTTP 200.
- The review server mounts the frozen candidate through its isolated review-data route. It does not rebuild or write candidate data. Word export is available in the real planner flow.
- No application/test/data changes were made after the successful validation commit. The documentation-only follow-up does not change the runtime worktree.

## Deferred items and release boundaries

- Full accessible dark theme: deferred; the approved dark navy shell and light workspace are implemented.
- Word map image embedding: deferred; the export retains stable numeric map references without screenshot capture.
- The historical Waltham 39-item event's exact live-TfL trigger remains unproven, as stated above. Current frozen-candidate Browser/Word parity is green.
- Product Owner acceptance remains required. This handover does not claim Beta acceptance.
- Recommended next version after Product Owner and Technical Director approval: `2.0.0-beta.1` / `ATLAS-2.0.0-beta.1-20261023`. No bump has been made.
- No merge to `main`, PR, release, publication, or deployment occurred.

## GitHub tooling adoption review

- Dependabot — configured.
- Codecov — deferred until an appropriate coverage baseline/milestone.
- OpenSSF Scorecard — later security/release milestone.
- Sentry — deferred pending telemetry/privacy architecture.
- Renovate — not required alongside Dependabot.