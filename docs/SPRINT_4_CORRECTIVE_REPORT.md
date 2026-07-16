# Sprint 4 Bus Foundation — Corrective Development Report

**Decision:** Original BUS-0.1.0 review build rejected  
**Corrected build:** BUS-0.2.0 / BUS-CORE-020-20260716  
**Branch:** `sprint-4-bus-foundation`  
**Status:** Corrective build passed locally and at the exact deployed review URL
**Date:** 16 July 2026

## 1. Root-cause report

### Exact rejected URL tested

`https://raw.githack.com/joerfreeman02/transport-planner-toolkit/sprint-4-bus-foundation/modules/bus/index.html`

The rejected BUS-0.1.0 build did not fail consistently in the engineering Chromium environment. On 16 July 2026 it loaded its map, registered the Find address handler and returned a result for `SW1A 1AA`; the captured browser console contained no error or warning.

The Technical Director's reported dead-interface outcome remains valid. BUS-0.1.0 depended on a long ES-module graph before any startup state or error handler was active. A failure in the entry module, any imported shared runtime, or Leaflet could leave static HTML looking ready while no controls worked. There was no independent bootstrap, startup timeout, visible failure message or downloadable startup evidence. This was the architectural root cause.

### Console and network evidence

Rejected deployed build, engineering Chromium:

- JavaScript console errors: none captured in the reproducing environment.
- Uncaught page exceptions: none captured.
- Address request: completed and returned a selectable result.
- Leaflet: initialised in the reproducing environment.
- Windows command-line HTTPS request to RawGitHack: failed before HTTP with `SEC_E_NO_CREDENTIALS`; this demonstrates an environment-specific TLS path but is not treated as the sole application diagnosis.

Corrective local build testing deliberately uncovered two real defects:

1. Dynamic script paths were initially resolved relative to the HTML document rather than `bus-bootstrap.js`. The independent bootstrap visibly reported `Bus core failed to load` and enabled diagnostic download. Paths were corrected.
2. Leaflet attempted two missing image assets (`leafletmarker-icon.png` and `leafletmarker-shadow.png`), both returning HTTP 404. The corrective build now uses self-contained accessible `divIcon` markers. The final smoke run recorded no console, HTTP, failed-request or uncaught-runtime errors.

The full workflow test also showed that double GET/POST attempts across three Overpass providers could exceed the loading limit. Discovery now makes one firm 12-second GET attempt per provider, sequentially, with a bounded worst-case failover and visible final failure.

## 2. Corrective architecture

- `bus-bootstrap.js` is a classic script with no ES-module imports.
- It registers `error` and `unhandledrejection` listeners before loading Leaflet or the Bus core.
- It loads Leaflet and `bus-core.js` sequentially and validates both global APIs.
- A 12-second startup watchdog prevents indefinite startup.
- Failure displays **Bus module failed to initialise**, records the asset/exception and permits diagnostic download.
- `bus-core.js` is a self-contained classic-script vertical baseline.
- Frozen Accessibility, Railway and STATS19 modules do not consume the new code.

## 3. Corrected core workflow

- Project name and UK address/postcode input.
- Nominatim UK address search with firm timeout and visible failure.
- Draggable/click-adjustable Leaflet site marker and explicit confirmation.
- Editable stop radius (200–3,000 metres) and maximum stop count.
- NaPTAN/ATCO code preferred as stable identity when available.
- OSM identity visibly marked as fallback when a NaPTAN identifier is unavailable.
- Opposite-direction boarding points preserved.
- Exact and same-position duplicate prevention.
- Three sequential Overpass providers with firm timeouts.
- Provider failure distinguished from zero results.
- Walking and cycling distance/time via OSRM matrices.
- Estimated fallback clearly labelled when routing fails.
- Selectable route geometry on the map.
- Stop inclusion/exclusion with marker opacity synchronisation.
- Marker-to-table and table-to-map selection synchronisation.
- User-visible and downloadable diagnostics.

## 4. Suspended scope

Removed from the corrective interface and runtime:

- manual service entry;
- Bus Knowledge Library implementation;
- assisted research;
- Word export;
- CSV/reporting expansion.

## 5. Automated smoke-test evidence

Playwright test: `tests/bus-browser-smoke.mjs`.

Local corrected-build result:

- map initialised: pass;
- Find address active handler: pass;
- address result returned: pass;
- Confirm site enabled after selection: pass;
- site marker draggable: pass;
- Find nearby stops enabled after confirmation: pass;
- stop discovery returned 20 unique rows: pass;
- walking/cycling routed or estimated status visible: pass;
- map/table marker count synchronised: pass;
- deliberately blocked `bus-core.js` produced visible startup failure: pass;
- console errors: none;
- uncaught JavaScript errors: none;
- failed requests: none;
- HTTP errors: none.

Exact deployed RawGitHack result (engineering in-app Chromium, `CB7 4AH`):

- BUS-0.2.0 initialised and the Leaflet map rendered: pass;
- address lookup returned a selectable result: pass;
- selecting the result enabled Confirm site: pass;
- confirmed draggable site marker enabled Find nearby stops: pass;
- stop discovery returned 20 rows and 20 synchronised stop markers: pass;
- first stop used NaPTAN/ATCO identity `0500EELYY096`: pass;
- walking and cycling values were both labelled routed: pass;
- focusing the stop drew two route geometries: pass;
- console errors and warnings: none.

The deployed automated headless run also passed startup, map, handler, address, confirmation, visible provider-failure handling and no-uncaught-error checks. Its hosted-network route to the Overpass providers received a 504 followed by bounded timeouts, so it exercised and passed the required visible-failure path rather than reporting a false zero-result state. The exact same deployment completed stop discovery successfully in the real in-app browser test above.

## 6. Files changed in the corrective build

- `.gitignore`
- `package.json`
- `pnpm-lock.yaml`
- `config/modules.json`
- `modules/bus/index.html`
- `modules/bus/assets/css/bus.css`
- `modules/bus/assets/js/bus-bootstrap.js`
- `modules/bus/assets/js/bus-core.js`
- removed `modules/bus/assets/js/bus-app.js`
- removed `modules/bus/assets/js/bus-domain.js`
- removed `modules/bus/assets/js/bus-services.js`
- `docs/schemas/bus-assessment.schema.json`
- `docs/adr/ADR-002-bus-data-and-verification.md`
- `docs/adr/ADR-005-shared-mapping.md`
- `tests/bus-foundation.test.mjs`
- `tests/bus-browser-smoke.mjs`
- `tests/regression-check.mjs`
- governance, release and test records listed in this commit.

## 7. Frozen-baseline confirmation

No files under these directories are changed from the accepted starting commit `f6f603f`:

- `modules/accessibility/`
- `modules/railway/`
- `modules/stats19/`

Dashboard changes remain limited to the previously approved Bus review entry and controlled version identity; no further Dashboard functional change is introduced in the corrective build.

## 8. Known limitations

- Direct spatial querying of the official DfT NaPTAN download API is not implemented. NaPTAN/ATCO identifiers present in mapped stop data are preferred; OSM discovery remains an explicitly labelled interim fallback.
- NaPTAN coverage and OSM tag completeness vary; direction may remain “Direction not stated”.
- Nominatim, Overpass and OSRM are external services and can be unavailable or throttled.
- Estimated walking/cycling values are approximations and are never labelled routed.
- External provider availability can differ between hosted/headless and user-browser networks; bounded failover and downloadable diagnostics remain necessary.
- Wider browser, accessibility and planner acceptance remain release gates.
