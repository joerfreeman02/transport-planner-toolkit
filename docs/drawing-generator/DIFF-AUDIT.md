# DG-0 / DG-0C1 file-by-file diff audit

Allowlist result before deployment: **PASS**. All candidate implementation changes are additive except the ADR register row. Generated QA PDFs and confidential local visual references are untracked and excluded from commit.

## Protected-surface answers

| Surface | Functional code/data altered? |
|---|---|
| Accessibility | NO |
| Railway | NO |
| Bus | NO |
| STATS19 | NO |
| Library Manager | NO |
| Site Research | NO |
| Dashboard | C3 WIP registration only; no established card or behaviour altered |
| Shared Knowledge Library data | NO |
| Existing production version identities | NO |

## Candidate files and purpose

| File | Purpose |
|---|---|
| `.github/dependabot.yml` | Weekly grouped npm/Actions updates; no automerge. |
| `.github/workflows/drawing-generator-ci.yml` | Additive DG deterministic/browser and protected regression gates. |
| `docs/adr/README.md` | Registers proposed ADR-008 only. |
| `docs/adr/ADR-008-drawing-generator-spatial-rendering.md` | Proposed projected-SVG/physical-scale decision. |
| `docs/drawing-generator/DG0-ARCHITECTURE.md` | Scope, boundaries and component architecture. |
| `docs/drawing-generator/DATA-SOURCE-REGISTER.md` | Automatic sources, classification, attribution and failures. |
| `docs/drawing-generator/DFT-REUSE-REGISTER.md` | Candidate Drainage reuse decisions/evidence. |
| `docs/drawing-generator/GOLDEN-DRAWING-COMPARISON.md` | Sanitized visual precedent comparison. |
| `docs/drawing-generator/CRS-SCALE-QA.md` | BNG control, observed error and scale arithmetic. |
| `docs/drawing-generator/KNOWN-LIMITATIONS.md` | Manual, technical, source, cosmetic and future limitations. |
| `docs/drawing-generator/MANUAL-ACCEPTANCE.md` | Product Owner live-review procedure. |
| `docs/drawing-generator/TEST-EVIDENCE.md` | Baseline/candidate regression and PDF evidence. |
| `docs/drawing-generator/DIFF-AUDIT.md` | This allowlist audit. |
| `docs/drawing-generator/GITHUB-TOOLING-REVIEW.md` | Dependency, CI, coverage and security-tool adoption review. |
| `modules/drawing-generator/index.html` | Isolated live-review user interface and A3 sheet DOM. |
| `modules/drawing-generator/README.md` | Module identity, operation and verification. |
| `modules/drawing-generator/THIRD-PARTY-NOTICES.md` | Leaflet, Leaflet.draw, Proj4 and OSM notices. |
| `modules/drawing-generator/assets/css/drawing-generator.css` | Editing UI and physical A3 print composition. |
| `modules/drawing-generator/assets/images/eas-primary.png` | Current Product Owner-supplied EAS logo. |
| `modules/drawing-generator/assets/js/app.js` | State, metadata, workflow, persistence and diagnostics. |
| `modules/drawing-generator/assets/js/config.js` | Candidate identity, providers, company data and palette. |
| `modules/drawing-generator/assets/js/crs.js` | Proj4 BNG transformation and error calculation. |
| `modules/drawing-generator/assets/js/drawing-modes.js` | Four scale/layout/visible-layer configurations. |
| `modules/drawing-generator/assets/js/geometry.js` | GeoJSON validation and site/overlay extraction. |
| `modules/drawing-generator/assets/js/map-controller.js` | Leaflet.draw editing layer controller. |
| `modules/drawing-generator/assets/js/overlay-store.js` | Controlled reviewed overlay lifecycle. |
| `modules/drawing-generator/assets/js/railway-adapter.js` | Railway-compatible evidence/mode adapter. |
| `modules/drawing-generator/assets/js/scale-engine.js` | Pure physical paper-to-ground engine. |
| `modules/drawing-generator/assets/js/source-adapter.js` | Overpass query, failover, classification and snapshot. |
| `modules/drawing-generator/assets/js/svg-renderer.js` | Deterministic projected SVG, grid, scale and north arrow. |
| `modules/drawing-generator/assets/vendor/leaflet.draw.js` | Leaflet.draw 1.0.4 distribution. |
| `modules/drawing-generator/assets/vendor/leaflet.draw.css` | Leaflet.draw 1.0.4 styles. |
| `modules/drawing-generator/assets/vendor/images/spritesheet.png` | Leaflet.draw control sprite. |
| `modules/drawing-generator/assets/vendor/images/spritesheet-2x.png` | High-density Leaflet.draw control sprite. |
| `modules/drawing-generator/assets/vendor/images/spritesheet.svg` | Vector Leaflet.draw control sprite. |
| `modules/drawing-generator/assets/vendor/proj4.js` | Proj4js 2.19.10 browser distribution. |
| `modules/drawing-generator/assets/vendor/PROJ4-LICENSE.md` | Proj4js MIT licence. |
| `modules/drawing-generator/tests/drawing-generator.test.mjs` | Deterministic DG unit/integration tests. |
| `modules/drawing-generator/tests/browser-smoke.mjs` | Fixture-backed interactive acceptance. |
| `modules/drawing-generator/tests/pdf-qa.mjs` | Four sanitized A3 PDF generator/QA driver. |
| `modules/drawing-generator/tests/live-smoke.mjs` | Deployed DG and protected-module smoke. |
| `modules/drawing-generator/tests/fixtures/synthetic-site.geojson` | Sanitized boundary fixture. |
| `modules/drawing-generator/tests/fixtures/synthetic-overlays.geojson` | Sanitized reviewed-overlay fixture. |
| `modules/drawing-generator/tests/fixtures/synthetic-overpass.json` | Sanitized vector-source fixture. |

## DG-0C1 corrective delta

The corrective change is contained within the existing, isolated Drawing Generator and its documentation/tests. No protected module, Dashboard, shared-library data, production identity or recovery branch is altered. Generated C1 PDFs/renders and the authorised local source comparison are untracked and excluded from the commit.

| File | Corrective purpose |
|---|---|
| `modules/drawing-generator/index.html` | Displays the C1 build stamp. |
| `modules/drawing-generator/assets/js/config.js` | Sets `DRAW-0.1.0-DG0C1-20260814`; status remains an unaccepted live-review candidate. |
| `modules/drawing-generator/assets/js/source-adapter.js` | Conservative bicycle, waterway, road and motorway evidence classification plus visible source warnings. |
| `modules/drawing-generator/assets/js/svg-renderer.js` | Neutral `MAIN ROAD` legend and exclusion of review-only cycle evidence. |
| `modules/drawing-generator/assets/js/app.js` | Makes review-only source warnings visible in the source status. |
| `modules/drawing-generator/tests/drawing-generator.test.mjs` | Adds source-safety and road-label regression evidence. |
| `modules/drawing-generator/tests/browser-smoke.mjs` | Verifies all four title-block defaults/current date and supports a supplied local Chromium path for reproducible QA. |
| `modules/drawing-generator/tests/live-smoke.mjs`, `pdf-qa.mjs` | Support a supplied local Chromium path for reproducible QA. |
| `docs/drawing-generator/{DATA-SOURCE-REGISTER,GOLDEN-DRAWING-COMPARISON,KNOWN-LIMITATIONS,TEST-EVIDENCE}.md` | Documents conservative rules, the sanitised comparison, limitations and C1 evidence. |

## DG-0C2 corrective delta

C2 starts exactly at `f3ed7417dc1876ae5ac5b3bc7959b120081077c3`. The protected-surface answers above remain NO. C2 does not alter `.github`, dependency files, Dashboard, Accessibility, Railway, Bus, STATS19, Library Manager, Site Research, Shared Knowledge Library data or any existing production identity. The generated PDF and rendered PNG are QA artifacts and are not committed.

| File | C2 purpose |
|---|---|
| `modules/drawing-generator/index.html` | Planner-first setup/generate/review flow; advanced editing/source diagnostics collapsed by default; C2 identity. |
| `modules/drawing-generator/assets/css/drawing-generator.css` | Unobscured editor, advanced-panel styling, compact legend/sidebar/title handling, managed labels and corrected print isolation. |
| `modules/drawing-generator/assets/js/app.js` | Primary Generate flow, visible workflow status, cancelable drawing state, mode-relevant advanced overlay choices and acceptance telemetry. |
| `modules/drawing-generator/assets/js/config.js` | C2 build identity; candidate status unchanged. |
| `modules/drawing-generator/assets/js/drawing-modes.js` | Structured context and explicit primary/local cycle-network visibility per mode. |
| `modules/drawing-generator/assets/js/map-controller.js` | Full-opacity OSM editing map, default navigation, explicit active-draw cancellation/restoration and generalized source display. |
| `modules/drawing-generator/assets/js/overlay-store.js` | Adds controlled manual primary/local cycle-network classes while retaining existing compatibility classes. |
| `modules/drawing-generator/assets/js/source-adapter.js` | Exact-extent structured context query/classification; current `icn`/`ncn`/`rcn`/`lcn` cycle hierarchy without ref requirement; lifecycle review-only safety; retained metadata. |
| `modules/drawing-generator/assets/js/cartography.js` | New pure connected-way presentation grouping, coincident station de-duplication and deterministic collision/repetition label management. |
| `modules/drawing-generator/assets/js/svg-renderer.js` | Draws structured context beneath controlled overlays in the exact BNG SVG; controlled labels and compact legend hierarchy. |
| `modules/drawing-generator/tests/{drawing-generator.test.mjs,browser-smoke.mjs,pdf-qa.mjs}` | Adds C2 source/cartography/UX/context/PDF acceptance and a single-mode PDF output option. |
| `modules/drawing-generator/tests/fixtures/synthetic-overpass.json` | Sanitized context, current ref-less cycle and proposed-cycle evidence. |
| `modules/drawing-generator/README.md` | C2 identity and planner/context workflow. |
| `docs/adr/ADR-008-drawing-generator-spatial-rendering.md` | Records the structured-context and managed-label refinement without changing Proposed status. |
| `docs/drawing-generator/{DG0-ARCHITECTURE,DATA-SOURCE-REGISTER,GOLDEN-DRAWING-COMPARISON,KNOWN-LIMITATIONS,MANUAL-ACCEPTANCE,TEST-EVIDENCE,DIFF-AUDIT}.md` | C2 architecture, evidence, precedent comparison, constraints, acceptance and audit. |
| `docs/drawing-generator/TFL-CYCLE-EVIDENCE.md` | Official TfL evidence hierarchy, safe future-adapter rule and documented reason no fragile runtime dependency was added. |

## DG-0C3 corrective delta

C3 starts exactly at `090a2f1ecfb299ed7119a0199c50ae11e916ef29` and preserves the C2 branch/history. The only protected-surface exception is the explicitly authorised, additive static Dashboard registration: one WIP card in `index.html` and one module entry in `config/modules.json`. Existing cards, Ready labels, Dashboard JavaScript/CSS, production identities and all functional modules remain unchanged. Generated C3 PDFs/renders are untracked and excluded from commit.

| File | C3 purpose |
|---|---|
| `index.html` | Adds one static Drawing Generator card labelled `WORK IN PROGRESS`; established cards are untouched. |
| `config/modules.json` | Registers Drawing Generator `0.1.0` / C3 build / WIP path without changing toolkit identity. |
| `modules/drawing-generator/assets/js/basemap-compositor.js` | New provider abstraction, fixed zooms, exact intersecting-tile manifest, per-tile BNG affine placement and 80-tile cap. |
| `modules/drawing-generator/assets/js/{app,map-controller,source-adapter,svg-renderer,config}.js` | C3 workflow/status, exact official tile URL, basemap lifecycle/failure safety, professional-only Overpass query, hybrid composition and acceptance telemetry. |
| `modules/drawing-generator/index.html`, `assets/css/drawing-generator.css` | C3 WIP identity, primary routing controls, rendered-basemap language, failure/print styling and exact print colours. |
| `modules/drawing-generator/tests/{drawing-generator.test.mjs,browser-smoke.mjs,pdf-qa.mjs,live-smoke.mjs}` | Projection/source/dashboard unit gates; completely intercepted automated tile acceptance/PDFs; protected local smoke. |
| `modules/drawing-generator/tests/real-world-regional-pdf-qa.mjs` | Explicitly guarded one-viewport live Milton Keynes proof driver; non-issued editing zooms are mocked. |
| `modules/drawing-generator/README.md` | C3 operation, tile boundary and guarded live-QA instructions. |
| `docs/adr/ADR-008-drawing-generator-spatial-rendering.md` | Records the hybrid rendered-OSM/controlled-vector decision while retaining Proposed status. |
| `docs/drawing-generator/{DG0-ARCHITECTURE,DATA-SOURCE-REGISTER,KNOWN-LIMITATIONS,MANUAL-ACCEPTANCE,TEST-EVIDENCE,DIFF-AUDIT}.md` | C3 architecture, policy/source separation, limitations, acceptance and evidence. |
# DG-0C3.1 corrective delta

- Added provider-neutral, user-triggered road-geometry assistance through ordered planner waypoints, with bounded failure, retained rough geometry and per-route provenance.
- Added deterministic site direction normalization and recorded reversals; ambiguous/no-site routes block readiness.
- Added explicit snapped approval, retry/redraw/add-guidance path and manual fallback acceptance; site changes clear prior approval.
- Replaced per-vertex SVG markers with ground-distance arrow cadence on final retained geometry.
- Reduced Regional Routing to basemap/site/routes/manual reviewed items and Local Routing to basemap/site/routes plus explicitly selected community/manual items; unchanged Regional Plan and Local Context hierarchies remain intact.
- Removed the right-sidebar duplicate company/logo block and retained one current EAS title-block logo in all four layouts.
- Added unit/browser/live QA, one-page A3 artifacts, source/provider documentation and an ADR. Generated artifacts remain untracked.
- No protected module identity, historic client data, main-branch merge or new sprint was introduced.

# DG-0C3.2 pre-merge author-control delta

- Added `source-review.js` and an Advanced diagnostics source-review panel. It reports stable source ID, station name/mode, include/exclude state and returned-rail QA, defaults only no-nearby-rail stations to withheld, and persists explicit planner decisions in local storage.
- Preserved source geometry and snapshot provenance: station QA is an immutable-input presentation assessment; excluded source records are removed consistently from editor map, issued SVG and legend without altering provider evidence.
- Added a dedicated, readable `© OpenStreetMap contributors` SVG map-corner attribution in all modes. The sheet footer now holds engineering/provider provenance only.
- Reduced controlled road labelling: Regional/Local context road names are suppressed; Regional primary/motorway labels use returned A/M refs only with a one-reference normal cap and reduced label budget.
- Updated all four deterministic and two Milton Keynes live QA PDF drivers to the C3.2 build; the live regional proof reports visible flagged source-review candidates.
- No GitHub workflow/tooling files changed: Dependabot was retained; Codecov, OpenSSF Scorecard, Sentry and Renovate remain deferred/not installed under the existing governance boundary. Generated PDFs/renders remain untracked.

# DG-0C3.3 functional recovery delta

- Baseline is exactly `6a3c55ecbcb1587f449c8d69121e85c98d0e76a3`; build only advances to `DRAW-0.1.0-DG0C3.3-20260817`. Status/version remain unchanged and unaccepted.
- `source-adapter.js` replaces full relation geometry with exact-frame clipped relation bodies, safely ignores clipped null placeholders, preserves current lifecycle status, groups bus routes by reference/controlled colour, surfaces missing bus geometry, withholds service rail tracks and retrieves only nearby building support for community nodes.
- New `community-association.js` preserves exact amenity/shop areas or associates a node with exactly one containing building. Zero/multiple matches remain review-only; no buffer or fabricated polygon exists.
- `app.js`, `overlay-store.js`, `map-controller.js` and `scale-engine.js` add immediate/deduplicated community selection with persisted provenance, planner-facing source layer controls, route-time map panning without vertex creation, and a toggleable issued-area footprint from the PDF extent engine.
- `drawing-modes.js`, `cartography.js` and `svg-renderer.js` recover the Local Context hierarchy, external deterministic site callout, bus route legend/group presentation, combined Design/Drawn title cell, and haloed/oppositely offset TO/FROM arrows. Arrow offsets are presentation-only and retained route geometry is untouched.
- `index.html` and `drawing-generator.css` carry the C3.3 identity, near-square editor, selected/review community states and title/callout presentation. `config/modules.json` advances only the WIP Drawing Generator build.
- Tests/fixtures add the C3.3 deterministic/browser/PDF acceptance without weakening existing assertions. The two guarded Milton Keynes drivers are relabelled for the current build only.
- `CURRENT-SOURCE-MAPPING.md`, architecture, README, manual acceptance and test evidence document current-source colour/status mapping, the TfL credential decision, route navigation, exact issued extent, confidentiality and results.
- No Accessibility, Railway, Bus, STATS19, Library Manager, Shared Library, Site Research, Dashboard implementation, production identity, `.github` workflow or dependency-tooling file is modified. Dependabot is retained; Codecov/OpenSSF/Sentry remain deferred and Renovate remains uninstalled.
- Historic reference PDFs, client-specific content, live source payloads, temporary QA scripts, six generated PDFs and rendered PNGs are untracked and excluded from the commit.

# DG-0C3.3A release-candidate allowlist

The C3.3A candidate changes only Drawing Generator implementation, its sanitised fixtures/tests and Drawing Generator documentation. It adds `presentation-controls.js` for renderer-only bus/basemap presentation state. No protected module, production identity, Dashboard implementation, shared data, workflow, dependency or generated client artifact is changed. Temporary/PDF outputs remain untracked.

# DG-0C3.3B HF4 planner-guided map-matching corrective delta

- Recovery baseline is `cb927bcd712946458f6a7e3c017be696796e1b57`. Candidate build advances only to `DRAW-0.1.0-DG0C3.3B-HF4-20260818`; status remains **WORK IN PROGRESS / LIVE REVIEW - NOT ACCEPTED BASELINE**.
- Routing-provider semantics change from OSRM Route to OSRM Match so the planner-selected trace is map-matched instead of asking the provider to select a fastest path between sparse coordinates.
- The original planner LineString is preserved. Bounded internal samples, provider-safe overlapping chunks and a sequential provider scheduler remove the former 50-point user limit while retaining planner point/order/endpoints and continuity as acceptance controls.
- HF3's 1.60 route-length ratio and straight-chord corridor threshold are removed as hard blockers; both remain diagnostic evidence only. A materially bad candidate still falls back non-destructively to the planner geometry.
- HF2/HF3 routing mocks, deterministic routing checks, browser smoke and CI are deliberately migrated to Match response semantics in the same correction. HF4 adds explicit Local-false-positive, long-route, >50-point, chunk/throttle, outlier/sub-trace and bad-candidate regressions.
- Renderer, basemap, exact scale/extents, Regional Plan, Local Context, community, bus, rail, cycle, title block, shared Project/Client persistence and protected Toolkit modules are outside HF4 and are not redesigned.
- No client address, boundary, source snapshot, historic drawing or live route coordinates are committed. HF4 regression geometry is synthetic.
- GitHub tooling position is unchanged: Dependabot adopted; Codecov/OpenSSF Scorecard/Sentry deferred; Renovate not installed.
