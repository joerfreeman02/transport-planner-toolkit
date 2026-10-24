# ATLAS Bus Beta — Final Closeout Handover

**Status: NOT READY FOR PRODUCT OWNER BETA ACCEPTANCE.** The frozen-candidate Route 66 correction and local planner-facing regression are green. Exact-final-SHA hosted validation and final rendered-document/map visual review remain open.

## Revision and provenance

- Repository: `joerfreeman02/transport-planner-toolkit`
- Correction branch: `codex/atlas-bus-beta-final-closeout`
- Starting acceptance-candidate SHA: `4281875d9e9b108dee35081d6627d93f8facd6f1`
- Runtime SHA: `abf491e59a353e9a665dd0e4cff160bc0fcf13a0`
- Code-bearing implementation checkpoint: `abf491e59a353e9a665dd0e4cff160bc0fcf13a0`
- Frozen Run #75: workflow run `39430415441`; artifact `12275615359`; name `atlas-bus-beta-review-candidate-39430415441`; producer SHA `151199cc914c235870f444d26b03c2309edbd035`; size `2549732499` bytes; canonical GitHub upload digest `sha256:5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`.
- Candidate files were read from the existing local review root. No candidate bytes were rebuilt, replaced, or modified. No live acquisition or national rebuild was performed.

The code-bearing checkpoint `abf491e` includes the product changes, the valid app-file EOF cleanup, and the corrected diagnostic wiring. The complete frozen-candidate Browser-to-Word product audit was rerun against this checkout and passed with zero audit failures, browser errors, failed requests, external requests, acquisitions, publication attempts, or deployment attempts. This handover update is documentation-only.

## Route 66 correction

### Evidence and root cause

The official Arriva Route 66 timetable was checked as external validation: [Arriva Route 66 timetable](https://www.arrivabus.co.uk/services/AKE_WE_66). Run #75 contains both broad regular national evidence and shorter endpoint/branch representations at Waltham Cross Stop C. The production Browser-to-Word audit against that frozen candidate reports 26 weekday and 25 Saturday departures for the principal Stop C row, with weekday service from approximately 05:29 to 19:05.

The production planner composition defect was in peer arbitration: a candidate peer could replace a component after comparison with a weaker member of that component, even when the component contained stronger timetable evidence. Sparse endpoint/branch evidence could therefore displace the stronger through-service population. The correction compares a replacement peer to the highest evidence rank already represented in the component and permits replacement only when the peer outranks that strongest member. This is a general evidence-ranking rule; it has no route, operator, stop, place, frequency, count, or departure-time special case.

A follow-up audit found the initial direct-candidate diagnostic did not instantiate the same production composition as the application: it passed the prepared national adapter directly and omitted the production reference-data adapter. That exposed intermediate BODS and TNDS rows separately. The diagnostic now uses the authoritative timetable adapter and candidate-backed reference data for Waltham, with a deterministic successful empty TfL contribution. It performs no live TfL request. The corrected diagnostic returns one Stop C principal row, carries both BODS and TNDS provenance, and passes the same 05:29–19:05 and Browser/Word assertions.

### Route 66 results

- Selected assessed stop: Waltham Cross Bus Station, Stop C (`210021703430`).
- Frozen-candidate principal: 26 departures per weekday and 25 Saturday departures in the direct production-composition diagnostic.
- Browser: `Mon-Fri: Typically every ~30–40 mins; Sat: Typically every ~30 mins; Sun: No scheduled service`; operating span `Mon-Fri: Approx. 05:29–19:05; Sat: Approx. 06:05–18:50; Sun: No scheduled service`.
- Word: materially the same frequency and span as Browser.
- Source identity: 52 candidate records in the same-public-service group, 45 deduplicated representations, 3 retained branch variants; BODS and TNDS provenance is present. The selected principal no longer presents the historical 2 weekday / 1 Saturday subset.

## Product and export closeout

- Home has a richer, truthful platform landing view using the supplied five module illustrations. No fake project history, cloud account, system-health, live-data, or unsupported module functionality was added.
- The application header uses the supplied EAS | ATLAS identity. Footer uses restrained EAS | FORGE attribution, keeps “Created by Joe Freeman”, and aligns to the shared navy token.
- Existing About page content remains available and passed its regression.
- The six-stage guided Bus workflow and supported assessment actions remain present. Existing nearest-stop/logical-stop-group and configurable full-radius behavior remain available; this closeout did not remove assessment or evidence controls.
- Word export uses a neutral planning-facing filename and wording, compact 6 pt table typography, a map inclusion toggle (on by default), and no visible ATLAS/internal-QA wording. Sources & Checks remains available in the application; internal QA status and review-only rows are not exported.
- Transport Statement wording, planner review acknowledgement gate, conditional map-reference removal, standalone PNG export, numbered map key, deterministic marker layout, marker bounds/padding, and Browser/Word semantic parity have automated coverage.
- Map key references correspond to numeric map references. The standalone map uses the neutral title “Bus Assessment Map”.

## Regression evidence

- Corrected frozen-candidate diagnostic: Waltham, Pipers, Chingford, PE1, and Queensgate completed. Waltham Route 66 is one principal Stop C row with the full frozen candidate population. Pipers 46/230, Chingford 657, and PE1 202 are included in deterministic Browser regression coverage.
- Browser-to-Word product audit: `READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_RE-ACCEPTANCE`; no browser console errors, failed requests, external source requests, acquisition attempts, publication attempts, or deployment attempts were observed in that audit.
- Waltham Browser/Word Route 66 parity: passed with selected stop `210021703430` and the frequency/span above.
- Other controls in the product audit: Pipers 46/230, PE1 202, Waltham route families and mixed-source rows, Chingford 657, Enfield 313/329. The product audit confirmed the accepted evidence-review state remains visible and did not claim the flagged case is clean.
- Full Python Bus-data suite: 309 tests passed (`OK`; 99.182 seconds). No Python Bus-data implementation was changed after this run.
- Full deterministic ATLAS suite: rerun after the diagnostic correction with bundled Playwright on `NODE_PATH`; completed without a reported test failure. The first attempt stopped at module resolution because the bundled dependency path was not configured; the rerun used the bundled dependency path.
- `git diff --check`: passed after the test correction.
- Run #75 provenance verification: unchanged candidate identity and canonical digest above; no acquisition or rebuild.

## Visual QA and remaining gates

Home, Bus workspace, and About desktop screenshots were inspected. Browser console was clean. Structural Word checks passed for map on/off, map embed/reference behavior, neutral filename, 6 pt table cells, absence of visible ATLAS text, and Browser/Word content parity.

Two visual checks remain incomplete:

1. A native rendered-page review of the generated DOCX was not completed because the approved bundled environment had no supported document renderer available.
2. A full basemap QA export using public OpenStreetMap tiles was blocked by automatic approval review because the request would send location-derived map-tile traffic to an external provider. No alternate route was used. The automated audit used local tile stubs, so its exported raster is not evidence of actual basemap appearance.

Exact-final-SHA hosted validation was not dispatched, and this local branch has not been pushed. GitHub branch search returned no `codex/atlas-bus-beta-final-closeout` branch, so origin parity is not established. `gh auth status` reported the configured GitHub CLI token for `joerfreeman02` is invalid. No credential retry or credential request was made. The available GitHub connector provides read operations but no workflow-dispatch operation. Therefore the local evidence is not a substitute for the required hosted exact-SHA gate.

## Safety and release state

- Version remains `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`.
- No Run #75 rebuild, live national acquisition, merge to `main`, publication, deployment, or release occurred.
- Dependabot: configured. Codecov: deferred pending coverage baseline. OpenSSF Scorecard: later security/release milestone. Sentry: deferred pending telemetry/privacy architecture. Renovate: not required alongside Dependabot.
- Product Owner Beta acceptance remains blocked pending Technical Director review, exact-final-SHA hosted validation, and the remaining document/map rendered visual QA.
- No production change should be made during that review unless a new failing test or review finding establishes a defect.

## Local review URL

The local review root is the isolated closeout checkout with unchanged Run #75 prepared data. The localhost-only server is listening on PID `12156`, bound to `127.0.0.1:8774`. URL: `http://127.0.0.1:8774/atlas/?review=v2#modules`. Preferred port 8773 was occupied, so the adjacent available port 8774 is used. Browser smoke returned HTTP 200, loaded the Bus entry, and recorded zero console errors, failed requests, or non-tile external requests; the standard transparent map-tile fixture was used to avoid external traffic. Bus and TNDS candidate manifests both returned HTTP 200. This is a local review environment, not production. It is not Product Owner acceptance authorization.
## Superseding closeout update — 24 October 2026

This section supersedes the earlier statements above that described the Browser-to-Word audit and full Python suite as green. Those statements are historical results for runtime `abf491e`; they do not describe the final local presentation checkpoint or current release readiness.

### Current revisions and scope

- Current code-bearing runtime SHA: `d865ff035e05cbe1ce34b224398893734508e9c0` on `codex/atlas-bus-beta-final-closeout`.
- This update is documentation-only. The final documentation SHA is the branch HEAD containing this section.
- Only presentation/export and responsive-layout files changed in the code-bearing commit, with focused tests. No Bus-domain/service composition, source authority, candidate, or data-preparation files changed.
- Run #75 remains the immutable identity and canonical digest recorded above. The local Browser-to-Word audit restored and verified the candidate against that canonical digest. No national acquisition or candidate rebuild occurred.
- Version/build remains `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`.

### Presentation changes in this checkpoint

- Improved narrow viewport workflow navigation and stage-label spacing, compact address presentation, map selection button styling, assessment-radius styling, and unnamed-stop labels.
- Reworked the Transport Statement prose and removed duplicate destination suffixes while preserving the same service rows and source evidence.
- Kept the Word-embedded map compact with numeric references and provided the complete stop key on the standalone map export.
- Changed the standalone map export to a one-page A3 landscape PDF. The generated PDF uses the displayed map image and the existing assessment/stop references; it does not invent route geometry.

### Validation and remaining product gates

- Full deterministic ATLAS suite: passed (`ATLAS Alpha.15 deterministic suite passed`).
- Full Bus-data Python suite: 309 tests passed (`OK`, 92.713 seconds) when temporary files were directed to the isolated checkout's retained `.tmp` area. No `.tmp` contents were removed.
- Focused Word, PDF, marker-layout, map-reference and UI-contract tests: passed. `git diff --check`: passed before the code-bearing commit.
- Responsive browser check at 617 px: all six workflow stages are visible; progress-stage labels do not overlap; no horizontal document overflow; no page errors. External map tiles were blocked for this layout diagnostic, so its blank map is expected and is not basemap visual evidence.
- Latest frozen-candidate production Browser-to-Word audit: **NOT READY FOR MANUAL RE-ACCEPTANCE**. Candidate restore/provenance passed; browser/request errors and acquisition/publication/deployment attempts were zero. Two evidence gates failed and remain unresolved: Pipers route 230's circular evidence note is absent from the planner-facing normal-service row; PE1 route 202 produced two patterns where the audit requires three distinct evidence-backed patterns. No service-composition changes were made in response. Both require Technical Director review before any further product change.
- Waltham Route 66 retained its expected principal service result in Browser and Word: weekday typically 30–40 minutes, Saturday typically 30 minutes, weekday span approximately 05:29–19:05, Saturday approximately 06:05–18:50. The audit also showed a separate Smiths Lane direction row; retain that fact in review rather than claiming Route 66 is a single row.
- User-supplied DOCX reports were structurally inspected and showed the Waltham 66/251 results, but rendered-page QA could not be performed because the approved document-rendering environment does not provide LibreOffice. No user report was modified.
- No exact-final-SHA hosted validation was dispatched. The configured GitHub CLI authentication is invalid, the remote branch was not discoverable through the available GitHub read connector, and no workflow-dispatch capability is available in this session. No credential retry was made. Local results do not substitute for hosted validation or origin parity.

### Environment and release status

- Isolated worktree: `C:\Users\joe.freeman\AppData\Local\ATLAS\codex-workspaces\bus-beta-final-ui`.
- Local review server remains PID `12156`, bound to `127.0.0.1:8774`: `http://127.0.0.1:8774/atlas/?review=v2#modules`. This serves the isolated local checkout, not a hosted or production build.
- `.tmp/` remains untracked and untouched; it was neither staged nor cleaned. The protected OneDrive/main checkout was not used.
- No merge, deployment, publication, version/build bump, candidate rebuild, or fresh national acquisition occurred.
- Product Owner Beta acceptance is **not authorized by this handover**. Remaining gates: Technical Director decision on Pipers 230 and PE1 202, exact-final-SHA hosted validation, origin parity, and rendered Word/map visual review.
