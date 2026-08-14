# DG-0 file-by-file diff audit

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
| Dashboard | NO |
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
