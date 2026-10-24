# ATLAS Bus Beta — Final Closeout Handover

**Status: NOT READY FOR PRODUCT OWNER BETA ACCEPTANCE.** The frozen-candidate Route 66 correction and local planner-facing regression are green. Exact-final-SHA hosted validation and final rendered-document/map visual review remain open.

## Revision and provenance

- Repository: `joerfreeman02/transport-planner-toolkit`
- Correction branch: `codex/atlas-bus-beta-final-closeout`
- Starting acceptance-candidate SHA: `4281875d9e9b108dee35081d6627d93f8facd6f1`
- Runtime SHA: `898615b86578944be9070eca044e58e12f303f83`
- Current branch HEAD before this documentation commit: `abf491e59a353e9a665dd0e4cff160bc0fcf13a0`
- Frozen Run #75: workflow run `39430415441`; artifact `12275615359`; name `atlas-bus-beta-review-candidate-39430415441`; producer SHA `151199cc914c235870f444d26b03c2309edbd035`; size `2549732499` bytes; canonical GitHub upload digest `sha256:5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`.
- Candidate files were read from the existing local review root. No candidate bytes were rebuilt, replaced, or modified. No live acquisition or national rebuild was performed.

The runtime SHA contains the product changes in this closeout. The later `abf491e` commit updates only the diagnostic test wiring and removes an accidental literal `\\n` text at the end of the app file; it does not change application behavior. This handover is documentation-only.

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

Exact-final-SHA hosted validation was not dispatched. `gh auth status` reported the configured GitHub CLI token for `joerfreeman02` is invalid. No credential retry or credential request was made. The available GitHub connector provides read operations but no workflow-dispatch operation. Therefore the local evidence is not a substitute for the required hosted exact-SHA gate.

## Safety and release state

- Version remains `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`.
- No Run #75 rebuild, live national acquisition, merge to `main`, publication, deployment, or release occurred.
- Dependabot: configured. Codecov: deferred pending coverage baseline. OpenSSF Scorecard: later security/release milestone. Sentry: deferred pending telemetry/privacy architecture. Renovate: not required alongside Dependabot.
- Product Owner Beta acceptance remains blocked pending Technical Director review, exact-final-SHA hosted validation, and the remaining document/map rendered visual QA.
- No production change should be made during that review unless a new failing test or review finding establishes a defect.

## Local review URL

The local review root is the isolated closeout checkout with unchanged Run #75 prepared data. The localhost-only server is listening on PID `12156`, bound to `127.0.0.1:8774`. URL: `http://127.0.0.1:8774/atlas/?review=v2#modules`. Preferred port 8773 was occupied, so the adjacent available port 8774 is used. Browser smoke returned HTTP 200, loaded the Bus entry, and recorded zero console errors, failed requests, or non-tile external requests; the standard transparent map-tile fixture was used to avoid external traffic. Bus and TNDS candidate manifests both returned HTTP 200. This is a local review environment, not production. It is not Product Owner acceptance authorization.