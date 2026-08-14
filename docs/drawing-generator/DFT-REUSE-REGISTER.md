# Drainage Toolkit reuse register

Reference state inspected: `joerfreeman02/Drainage-Flood-Risk-Toolkit`, candidate branch `sprint-0/flood-zone-spatial-prototype`, commit `4e892cd1ceba4a64929ebaefc1a83a2563eb9824`. This is candidate input, not accepted architecture. There is no runtime dependency and the reference repository was not modified. Its 33 deterministic source tests passed during review.

| Reference path/component | Decision and DG-0 adaptation | Independent evidence | Future potential |
|---|---|---|---|
| `src/map.js`: Leaflet/Leaflet.draw site lifecycle | Adapted into `map-controller.js`; added overlay drawing classes and isolated Leaflet.draw vendor assets. | Browser smoke draws/imports state; geometry/store tests cover lifecycle. | Shared editing-map controller candidate. |
| `src/geometry.js`: Polygon/MultiPolygon, holes, validation | Adapted and tightened in `geometry.js`; retained holes, added explicit point/boundary separation, WGS84 ranges and self-intersection rejection. | Polygon, MultiPolygon, hole and malformed tests. | Shared GeoJSON validation candidate after acceptance. |
| `src/project-context.js` and address workflow | Pattern adapted in `app.js`; location and boundary are separate. TPT state remains local and module-scoped. | Browser test proves coordinates do not infer a polygon. | Consider common project-context adapter. |
| `src/main.js`: Proj4/BNG | Definition re-audited and adapted in `crs.js`; packaged Proj4js 2.19.10 and tested known control plus inverse round trip. | Known EPSG control and <0.02 m round-trip threshold. | High-accuracy grid-shift assessment remains future work. |
| `src/map.js`: layer architecture | Concept adapted into source/site/overlay groups, with source adapters independent from rendering. | Four-mode browser and deterministic renderer tests. | Shared spatial-layer contract candidate. |
| north arrow, legend and diagnostics patterns in `src/main.js`/UI | Adapted as deterministic SVG and explicit diagnostics/source states. | Sheet-structure and browser tests. | Shared diagnostics schema candidate. |
| fixed print CSS / print preview | Physical CSS approach adapted to explicit A3 landscape dimensions. | Four one-page PDF outputs and Poppler inspection. | Common corporate sheet primitive candidate. |
| browser map capture in print output | Rejected. Leaflet screenshots do not provide the required projected-coordinate/paper-scale relationship. DG-0 renders BNG vectors to deterministic SVG. | Exact extent/scale tests and PDF QA. | None; raster context could be separately georeferenced later. |
| provider adapters/provenance/config/diagnostics | Adapted into `source-adapter.js` with provider failover, distinct source states, query/snapshot/checksum. | Network, timeout, malformed, zero and ambiguity tests. | Shared provider state/envelope candidate. |
| test/CI/Dependabot patterns | Adapted as isolated deterministic/browser/PDF tests, additive Actions workflow and grouped weekly dependency checks. | Local suites and workflow syntax review. | Consolidate only after both candidates are accepted. |

No code was copied as a shared package. Every adapted component is independently owned and tested in TPT. Extraction into a cross-tool package is expressly deferred.
