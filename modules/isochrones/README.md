# ATLAS Isochrone Drawing Studio — isolated beta

**Status:** Local review candidate. Synthetic import and geometry tests pass. Real Rowley Lane data, live OSM/browser rendering, print output, and visual comparison with the supplied PowerPoint still need review before issue.

## Open locally

1. Open this branch in its separate worktree; do not change branches in the existing ATLAS checkout.
2. Run the existing root **OPEN ATLAS REVIEW.bat** from this worktree.
3. In the browser window opened by that review server, visit `/modules/isochrones/index.html` on the same local server origin. Keep the port printed/opened by the launcher; do not guess a port.
4. Select the four `Rowley Lane ... Ped/Cyc.json` files through the browser file picker. Files are read in the browser and are not uploaded.
5. Select each access scenario. Walking uses six five-minute bands through 30 minutes; cycling uses three through 15 minutes. A line's `to` value in seconds is the upper bound for its band. Only geometrically identical segments in the same band are deduplicated; distinct routes with common endpoints remain.
6. Use **Load OSM land use + named features** only when needed. It makes one explicit, bounded Overpass request for the visible map extent, caches repeated extents in memory, and enforces a 30-second request interval. OSM names and land-use tags are source data, not proof of completeness or ground truth. Open boundaries appear dashed red, missing geometry is counted, and coverage remains marked unknown.
7. Add annotations at evidence-based positions. Labels can be edited, dragged, and removed individually; manual placements still need checking.
8. **Export map PNG** captures the currently visible OSM tiles only, at 3× map-panel resolution, with the isochrone, hatching, labels, scale, and attribution. If visible tiles are incomplete or the browser blocks canvas access, export stops with an error. **Print / save EAS sheet PDF** uses the live browser print view.

## Layout and source

- The preview's map panel is sized to the handover's 8.96 × 5.77 inch target ratio. The supplied project PowerPoint files are not in this worktree, so exact template dimensions and visual correspondence have not yet been verified.
- The sheet uses the existing `assets/images/eas-primary.png` from Drawing Generator. It was visually inspected and shows the current **EAS Consulting Engineers** logo.
- Existing shared Leaflet and basemap-provider code is imported read-only. No shared asset, module, contract, dashboard, or build file is changed.
- The basemap is OSM Standard with visible attribution. There is no tile prefetch, zoom sweep, archive, or background query. Residential and POI retrieval runs only on the explicit button click for the visible bounds.
- OSM residential ways and relation members are assembled into rings; inner rings are kept as holes. Unclosed members are shown as incomplete boundaries, not filled as residential areas. OSM geographic coverage remains unknown.
- PPTX injection is not implemented. The present outputs are a map PNG and browser print-to-PDF.

## Synthetic test

```powershell
node modules/isochrones/tests/core.test.mjs
```

The synthetic test covers walking/cycling limits, upper-bound banding, repeated start points, forward/reversed exact duplicates, distinct geometry, property preservation, relation ring assembly, holes, and incomplete boundaries. It does not substitute for the four Rowley Lane GeoJSONs or the live OSM/browser/print checks.
