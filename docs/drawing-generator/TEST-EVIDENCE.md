# DG-0 test evidence

Test date: 2026-08-14. Starting `origin/main`: `b9e860c7b5379d2d51136e05e07ac63973211340`.

## Baseline before implementation

The exact 16-script deterministic/regression set completed **11 passed / 5 failed**. The five existing failures were:

- `tests/emergency-sprint1a.test.mjs`: expected Bus import report readable-text marker.
- `tests/library-manager.test.mjs`: expected stale Shared Library master counts.
- `tests/research-quality.test.mjs`: expected removed `enhanceBusRequest` surface.
- `tests/research-workflow-completion.test.mjs`: expected 1, received 0.
- `tests/sprint1c.test.mjs`: expected `Open Combined Site Research` text.

The exact six-script existing browser set completed **4 passed / 2 failed**. Existing failures were `core-polish-browser.mjs` (Ready tags expected 4, actual 5) and `shared-library-browser.mjs` (hidden editor field `locator.fill` timeout when run against the active dashboard). These failures were recorded before DG-0 and no test was weakened.

## DG-0 candidate results

| Gate/command | Result |
|---|---|
| `node modules/drawing-generator/tests/drawing-generator.test.mjs` | **33/33 passed**: geometry, CRS, scale, modes, Railway equivalence, overlays, source states, SVG/sheet. |
| `node --test --experimental-test-coverage --test-coverage-exclude='modules/drawing-generator/assets/vendor/**' modules/drawing-generator/tests/drawing-generator.test.mjs` | Pass; measured set 91.77% lines, 80.00% branches, 61.95% functions. DG core file line results ranged 79.49–100%; function aggregate includes imported uncalled established-library functions. |
| `TPT_REVIEW_ROOT=http://127.0.0.1:8768/ node modules/drawing-generator/tests/browser-smoke.mjs` | Pass: address point does not create polygon; site import; fixture-backed source snapshot; two overlays; four modes; no page errors. |
| `TPT_REVIEW_ROOT=http://127.0.0.1:8768/ node modules/drawing-generator/tests/live-smoke.mjs` | Pass locally: Drawing Generator/four modes plus Dashboard, Accessibility, Railway, Bus, STATS19, Library Manager and Site Research; no page errors. |
| `TPT_REVIEW_ROOT=http://127.0.0.1:8768/ node modules/drawing-generator/tests/pdf-qa.mjs` | Four sanitized PDFs created. |
| Poppler `pdfinfo` + rendered-page visual inspection + pypdf text/MediaBox inspection | Each PDF: 1 page; 1191.12 x 841.92 pt A3 landscape; candidate/build/scale/attribution/key present; borders/layout visually unclipped. |
| Drainage Toolkit source tests | **33/33 passed** at reference commit before adapting candidate patterns. |

## Post-change existing regression comparison

The same 16 deterministic scripts completed **11 passed / 5 failed**, with exactly the baseline failure set above. The same six browser scripts completed **4 passed / 2 failed**, with exactly the baseline failure set above. Therefore DG-0 introduced **zero new existing-suite regressions**.

The 16 deterministic scripts were: `tests/run-tests.mjs`, `tests/regression-check.mjs`, `tests/bus-foundation.test.mjs`, `tests/bus-route-family-hotfix.test.mjs`, `tests/classification.test.mjs`, `tests/contracts.test.mjs`, `tests/emergency-bus-hotfix.test.mjs`, `tests/research-workflow.test.mjs`, `tests/word-export.test.mjs`, `modules/accessibility/tests/classification-regression.mjs`, `modules/railway/tests/regression-check.mjs`, and the five failing scripts named above.

The six browser scripts were: `tests/accessibility-google-browser.mjs`, `tests/bus-browser-smoke.mjs`, `tests/core-polish-browser.mjs`, `tests/shared-cache-browser.mjs`, `tests/shared-consumption-browser.mjs`, and `tests/shared-library-browser.mjs`.

After merge, the same deterministic comparison and deployed `live-smoke.mjs` must be rerun and appended to the release handover; a merge alone is not a live pass.

## DG-0C1 corrective results

Corrective starting commit: `2a3ffafb40e02ca0307e9726f14c668b2ea053ed` (`origin/main` after DG-0 merge). Corrective build: `DRAW-0.1.0-DG0C1-20260814`.

| Gate/command | Result |
|---|---|
| `node modules/drawing-generator/tests/drawing-generator.test.mjs` | **36/36 passed**. New evidence proves: generic bicycle relations remain review-only unless an explicit `ncn`/`rcn` network and route reference are present; canal status alone is insufficient; road/motorway labels retain only returned evidence. |
| Local `browser-smoke.mjs` | Pass: all four title/number/scale defaults, current editable date, site/import/source/overlay flow, fixed-scale print safeguard, no page errors. |
| Local `live-smoke.mjs` | Pass: Drawing Generator/four modes plus Dashboard, Accessibility, Railway, Bus, STATS19, Library Manager and Site Research; no page errors. |
| Sanitised `pdf-qa.mjs` + Poppler inspection | Four PDFs created; each is one-page A3 landscape (1191.12 × 841.92 pt). Rendered visual review confirmed title block, C1 stamp, attribution, neutral `MAIN ROAD` key and no clipping. |
| Authorised current-source comparison | Local-only public-Overpass retrieval for the approved historic review extents completed. Regional evidence included road, motorway, rail/station, cycle and confirmed/review-only waterway classes; local evidence included road, rail and community-candidate classes. No boundary, raw query, response or PDF was persisted. |

The same 16 deterministic scripts completed **11 passed / 5 failed**, with exactly the documented pre-existing failures. The same six browser scripts completed **4 passed / 2 failed**, with exactly the documented `core-polish-browser.mjs` and `shared-library-browser.mjs` controls. No test was weakened.

## DG-0C2 professional cartography and UX recovery

Corrective starting commit: `f3ed7417dc1876ae5ac5b3bc7959b120081077c3` (`origin/main`). Corrective build: `DRAW-0.1.0-DG0C2-20260814`. Status remains **LIVE REVIEW CANDIDATE - NOT ACCEPTED BASELINE**.

| Gate/command | Result |
|---|---|
| `node modules/drawing-generator/tests/drawing-generator.test.mjs` | **41/41 passed**. Covers geometry, CRS, exact fixed scale, Railway equivalence, overlay safety, source failure states, structured context classification, current/ref-less `icn`/`ncn`/`rcn`/`lcn` hierarchy, proposed/construction review-only status, connected-only way grouping, station de-duplication, bounded/repeat-limited label placement, four SVG modes and A3 sheet identity. |
| Local `browser-smoke.mjs` | Pass across all four modes: advanced controls collapsed by default; navigation on by default; drawing starts explicitly; Cancel and site import restore navigation; primary Generate flow; exact contextual SVG marker/count; snapshot/overlays; mode-relevant advanced choices; no local HTTP/page errors. |
| Local `live-smoke.mjs` | Pass: Drawing Generator/four modes plus Dashboard, Accessibility, Railway, Bus, STATS19, Library Manager and Site Research; no page errors. |
| Critical existing CI deterministic scripts | Pass: `run-tests`, `regression-check`, `bus-foundation`, Railway regression and Accessibility classification regression. |
| Same 16-script deterministic baseline set | **11 passed / 5 failed**, exactly matching C1. Known failures remain `emergency-sprint1a`, `library-manager`, `research-quality`, `research-workflow-completion` and `sprint1c`. |
| Same six-script browser baseline set | **4 passed / 2 failed**, exactly matching C1. Known failures remain `core-polish-browser` (expected 4 Ready tags, actual 5) and `shared-library-browser` (hidden editor field fill timeout). |
| Regional `pdf-qa.mjs` + Poppler/pypdf/rendered visual inspection | One sanitized C2 Regional Plan PDF. One page, A3 landscape, 1191.12 x 841.92 pt; required build/status/scale/OSM/cycle text present; full-extent contextual hierarchy, legend, border and title strip visually inspected with no clipping. SHA-256 `8C98605B9075BC194BB1920BCDA3BF18324BAC59D0F62BD2EE6C9E87D0714928`. |

The C2 branch changes only the Drawing Generator implementation/tests and its documentation/ADR. No protected functional module, Dashboard code, Shared Knowledge Library data, production identity, dependency workflow or security workflow is changed. Deployed live smoke remains a post-merge gate; local smoke is not represented as deployment evidence.

## DG-0C3 real OSM basemap and four-drawing recovery

C3 started exactly at `090a2f1ecfb299ed7119a0199c50ae11e916ef29` on `corrective/dg0c2-professional-cartography-ux`; `origin/main` was `f3ed7417dc1876ae5ac5b3bc7959b120081077c3`. Build: `DRAW-0.1.0-DG0C3-20260816`. Status: **WORK IN PROGRESS / LIVE REVIEW - NOT ACCEPTED BASELINE**.

| Gate/command | Result |
|---|---|
| `node modules/drawing-generator/tests/drawing-generator.test.mjs` | **44/44 passed**. Adds exact official provider URL/attribution/cap, replaceable-provider validation, projection-aware tile manifests, fixed z13/z17, 30/25-tile reference manifests, below-0.03 px affine-centre error, exclusion of Overpass pseudo-basemap tags, four rendered-tile SVGs and isolated Dashboard WIP registration. |
| Local `browser-smoke.mjs` with all tiles intercepted | Pass across all four modes. Proves mocked tile success, exact SVG provider/zoom/count/status telemetry, print block until complete, primary route controls/cancellation, default navigation, source/overlay preservation and exact failed-basemap warning with print disabled. No local HTTP/page errors. |
| Four-mode `pdf-qa.mjs` with intercepted mocked tiles | Four one-page A3 landscape PDFs created. Each identifies the tile fixture as mocked/no-public-retrieval and retains C3 build/status, scale, attribution, title block and controlled overlays. |
| Guarded `real-world-regional-pdf-qa.mjs` | One authorised public-tile viewport for Milton Keynes. **35 unique z13 OSM tiles**, 35 composed tiles and **4,086 live classified Overpass features**. Editing-map zooms were intercepted, so only the issued Regional viewport used the public tile service. |
| Poppler `pdfinfo` and 120 dpi page renders | All five PDFs: exactly one page, A3 landscape, `1191.12 x 841.92 pt`; rendered visual inspection confirmed visible cartography, unclipped border/title/legend, current logo, scale bar and WIP stamp. |
| pypdf text/hash inspection | All five contain C3 build, WIP status and tile attribution/fixture disclosure. Principal real-world PDF SHA-256: `77973816479BD3615A76BD6450661021084EF01CB37D2A9765D2BF9C118E4A16`. |
| Same 16 deterministic baseline scripts | **11 passed / 5 failed**, exactly matching C2. Known failures: `emergency-sprint1a`, `library-manager`, `research-quality`, `research-workflow-completion`, `sprint1c`. |
| Same six browser baseline scripts | **4 passed / 2 failed**, exactly matching C2. Known failures: `core-polish-browser` and `shared-library-browser`. |
| Local `live-smoke.mjs` with map tiles intercepted | Pass: Drawing Generator/four modes, Dashboard, Accessibility, Railway, Bus, STATS19, Library Manager and Site Research; no page errors. |

Automated C3 tests never harvest public tiles. The one live artifact is real-world evidence, not a synthetic fixture. Generated PDFs/renders remain untracked and are not part of the commit. Remote PR CI and deployment smoke remain separate gates; no merge is authorised by this evidence.
