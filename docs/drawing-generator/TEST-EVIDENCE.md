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
# DG-0C3.1 final Monday readiness evidence

Build/status: `DRAW-0.1.0-DG0C3.1-20260816`; **WORK IN PROGRESS / LIVE REVIEW - NOT ACCEPTED BASELINE**. The corrective work continued from commit `2c069c7b1581dcbaa92b009b74abd4c87b092ba8` on the existing branch and PR; it did not merge or start a new sprint.

## Deterministic and browser gates

- `node modules/drawing-generator/tests/drawing-generator.test.mjs`: **49 passed**. New coverage includes mocked waypoint-order road snapping, non-destructive failure, deterministic route-to/route-from reversal, direction review without a site, distance-based arrow cadence, routing thematic suppression, render non-mutation and one issued logo.
- `node modules/drawing-generator/tests/browser-smoke.mjs`: **passed** with no page errors/bad local responses. It covers all four modes, two mocked road requests, explicit approval, direction normalization, regional→local→regional geometry persistence, site-change reapproval, exact failure warning, manual fallback, tile failure safety and route/source/tile mocks.
- Critical protected regressions: root deterministic **13 passed**; foundation regression **passed**; Bus **10 passed**; Railway **29/29 passed**; Accessibility classification **6 passed**.

## PDF and real-world evidence

- Four deterministic QA PDFs were generated with mocked tiles/routes. Each is exactly one A3 landscape page.
- A Milton Keynes Regional Plan used a small synthetic non-client site, 4,089 current classified Overpass features and 35 live z13 OSM tiles.
- A Milton Keynes Regional Routing Plan used the same synthetic site, exactly two sequential live road-geometry requests and 35 live z13 OSM tiles. Both routes reached `approved`; Route From Site was deterministically reversed so its start is nearest the site.
- All six PDFs were rendered to PNG and visually inspected. Map/title frames fit, title content is not clipped, one title-block EAS logo appears, Regional Routing contains only site/routes over the real OSM basemap, Local Routing retains only the explicitly selected community item in addition to site/routes, and arrows are readable and correctly directed.
- `pdfinfo` reported `Pages: 1` and A3 page size `1191.12 x 841.92 pts` for every artifact.

The live scripts are guarded and excluded from CI. Automated browser/PDF tests intercept public tile and routing traffic. No client address, boundary, route or historic-project payload is stored in the repository or QA artifacts.

# DG-0C3.2 final pre-merge author-control evidence

Build/status: `DRAW-0.1.0-DG0C3.2-20260817`; **WORK IN PROGRESS / LIVE REVIEW - NOT ACCEPTED BASELINE**. This narrow correction continues on the existing draft PR and does not merge, alter production identities or introduce a new sprint.

## Evidence to record at the gate

- `node modules/drawing-generator/tests/drawing-generator.test.mjs`: **51 passed**. Covers immutable station-to-returned-rail QA, the exact no-nearby-rail warning/default withholding, explicit include/exclude presentation filtering, A/M-reference-only labels, single-ref regional repeat cap and all-mode distinct OSM attribution.
- `node modules/drawing-generator/tests/browser-smoke.mjs`: **passed** with no page errors or bad local responses. It proves the visible Advanced source-review control, source ID/state/warning presentation, map removal/restoration after explicit Include, local state persistence over mode changes, four-mode attribution, routing approval/direction and failed-tile safety with mocked sources/tiles/routes.
- `pdf-qa.mjs` created four deterministic one-page A3 PDFs with mocked tiles/routes and asserted the separate readable OSM attribution in every mode. `pdfinfo`, `pypdf` text checks and 110 dpi rendered-page inspection confirmed all six C3.2 PDFs are one-page A3 landscape (`1191.12 x 841.92 pt`), contain the C3.2 build and contain `OpenStreetMap contributors`.
- The guarded Milton Keynes Regional Plan retrieved 4,089 classified features, composed 35 live z13 tiles and exposed **one** visible source-review flag. The guarded Regional Routing Plan made exactly **two** sequential public route requests, used 35 live z13 tiles and ended both routes `approved`, with Route From Site normalised/reversed.
- C3.2 retains GitHub tooling policy: no workflow/dependency tooling change; Dependabot remains, Codecov/OpenSSF/Sentry are deferred and Renovate is not installed.

# DG-0C3.3 functional recovery evidence

Corrective starting commit: `6a3c55ecbcb1587f449c8d69121e85c98d0e76a3`. Build/status: `DRAW-0.1.0-DG0C3.3-20260817`; **WORK IN PROGRESS / LIVE REVIEW - NOT ACCEPTED BASELINE**. Four historic reference PDFs were inspected locally as presentation/workflow precedents only. They and their historic transport facts, client identity and geometry remain untracked.

## Root-cause and acceptance evidence

| Gate | Result |
|---|---|
| `drawing-generator.test.mjs` | **64 passed**. New coverage proves clipped relation null safety, current cycle lifecycle handling, bus grouping/missing-geometry review, exact community area/single-containing-building association, no fabricated ambiguous footprint, community provenance/deduplication, service-track suppression, Local Context hierarchy, site leader callout, exact editing/PDF extent parity and coincident-arrow presentation offsets without geometry mutation. |
| `browser-smoke.mjs` | **Passed** in all four modes with no page errors/bad local responses. Route drawing retained navigation; a drag changed map centre without changing the active vertex count. Separate Roads/Cycle/Rail/Bus/Water/Community controls, square editor, default issued-area layer, exact Regional/Local dimensions, community Add/Remove/map/preview/persistence behavior, road-snap approval/direction/persistence and strengthened arrow halos/offsets all passed. |
| Local protected-surface smoke | **Passed** for Dashboard, Drawing Generator/four modes, Accessibility, Railway, Bus, STATS19, Library Manager and Site Research with no page errors. |
| Established protected regressions | Root **13 passed**; foundation regression **passed**; Bus **10 passed**; Railway **29/29 passed**; Accessibility **6 passed**. No protected implementation file changed and no test was weakened. |
| Sanitised current-source Regional comparison | A bounded public-source comparison returned usable current cycle, road, rail, station and explicitly navigable-water evidence. Service rail tracks were withheld and proposed/unsupported cycle and non-evidenced waterway records remained review-only. No location-specific payload or counts are committed. |
| Sanitised current-source Local Context comparison | A bounded public-source comparison returned usable current bus, cycle, rail and community evidence. Unambiguous selected community facilities used exact source/containing-building areas; unresolved associations remained review-only. Generic controlled main-road theming was absent. No location-specific payload or counts are committed. |
| PDF creation/inspection | Four deterministic PDFs plus sanitised Regional Plan and Local Context current-source comparison PDFs were created. Poppler reported exactly one A3 landscape page (`1191.12 × 841.92 pt`) for all six. All pages were rendered at 120 dpi and visually inspected; border/title/legend fit, external site callout, controlled hierarchy, one logo, scale, attribution and WIP stamp were legible. The live comparisons used 74 Regional and 69 Local z13/z17 tiles, within the 80-tile cap. |

The source defect was not absent current data: the comparison area contains current bus and cycle evidence. The old query requested every intersecting relation in full and the normalizer then dereferenced null placeholders introduced by clipped relation output. C3.3 uses relation bodies with geometry clipped to the exact frame and filters null placeholders before normalization. TfL remains the preferred bus-route existence authority, but its official Unified API requires registered credentials; no key was available or embedded. OSM remains the current geometry backbone and missing bus line geometry is surfaced as `BUS ROUTE GEOMETRY REQUIRES REVIEW`.

Generated comparison PDFs, page renders, current-source payloads and temporary QA drivers remain untracked. Draft PR `#14` was opened against `main`; GitHub `Drawing Generator CI / deterministic` passed on the functional candidate. The PR remains draft and no merge is authorised.

# DG-0C3.3A release-candidate evidence

Build/status: `DRAW-0.1.0-DG0C3.3A-20260817`; **WORK IN PROGRESS / LIVE REVIEW - NOT ACCEPTED BASELINE**.

- `drawing-generator.test.mjs`: **68/68 passed**. Coverage includes generic/explicit rail-mode safety, neutral generic rail rendering, optional colour/greyscale basemap treatment, green cycle hierarchy, backed community labels, immutable controlled bus grouping, arrow readability and exact scale/extent parity.
- `browser-smoke.mjs`: passed with no page errors/bad local responses. A first-time-user check switches through all four modes and confirms the five normal planner steps are available without opening Advanced controls. It also verifies default colour/faded basemap appearance, source-audit visibility, routing navigation and issued-extent parity.
- TfL cycle/bus data remains reference-only because the official Unified API requires credentials; no uncredentialed proxy or synthetic TfL route geometry was added.
- Generated PDFs/screenshots and any real-world source payload remain untracked and excluded from commit. Protected modules and production identity remain untouched.

# DG-0C3.3B HF4 map-matching corrective evidence

Prepared recovery baseline: `cb927bcd712946458f6a7e3c017be696796e1b57`. Candidate build: `DRAW-0.1.0-DG0C3.3B-HF4-20260818`. Status remains **WORK IN PROGRESS / LIVE REVIEW - NOT ACCEPTED BASELINE**.

Product Owner live testing of HF3 established three routing defects before HF4: a valid Local route was withheld by the 90 m straight-chord corridor rule despite preserved planner-point order and approximately 1.65 m maximum planner-point deviation; a Regional route was withheld by the 1.60 route-length-ratio rule at approximately 1.89; and the implementation contained a hard 50-planner-point input limit. Exact client route/source payloads remain outside the repository.

HF4 replaces Route-service mocks/behaviour with planner-guided Match-service semantics, retains the original planner geometry, adds bounded chunking/sequential request control and converts route-length/corridor metrics to diagnostics. The new synthetic HF4 regression covers the three defect classes plus chunk failure, original/internal outliers, discontinuous sub-traces, materially wrong candidates and provider timeout.

## HF4 local automated verification

- `hf4-map-matching.test.mjs`: **PASS**.
- `hf2-route-community.test.mjs`: **PASS**.
- `hf3-routing-polish.test.mjs`: **PASS**.
- `drawing-generator.test.mjs`: **PASS**.
- `browser-smoke.mjs`: **PASS** against the local mocked provider/tile environment.
- `pdf-qa.mjs`: **PASS; 4 A3 QA PDFs produced in the temporary test directory**.
- Protected root/foundation/Bus/Railway/Accessibility CI regressions: **PASS**.
- `git diff --check`: **PASS**.

These are local branch engineering gates only. Remote CI, Pages deployment and Product Owner real-world Local/Regional/>50-point routing acceptance remain separate and pending.

# DG-0C3.3B HF4A guided-routing recovery

Build/status: `DRAW-0.1.0-DG0C3.3B-HF4A-20260818`; **WORK IN PROGRESS / LIVE REVIEW - NOT ACCEPTED BASELINE**.

## HF4A local automated verification

- HF4A dense guided-route regression: **PASS**.
- HF4 planner-authority regression under the current adapter: **PASS**.
- HF2 protected community/routing regression: **PASS**.
- HF3 protected routing/presentation regression: **PASS**.
- Drawing Generator deterministic suite: **PASS**.
- Guarded non-client live no-key OSRM Route provider smoke: **PASS**.
- Browser smoke: **PASS**.
- Four-mode PDF QA: **PASS; exactly 4 QA PDFs produced**.
- Protected root/foundation/Bus/Railway/Accessibility regressions: **PASS**.
- `git diff --check`: **PASS**.

These are local branch engineering gates only. Remote CI, Pages deployment, and Product Owner live Local/Regional/>50-point routing acceptance remain separate and pending.
