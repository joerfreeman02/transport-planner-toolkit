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
