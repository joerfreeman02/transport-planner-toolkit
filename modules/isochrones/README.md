# ATLAS Isochrone Drawing Studio — isolated Leaflet beta

**Status:** Working candidate; browser/map-tile/export QA still required. The existing ATLAS modules and main branch are unchanged.

## Start (Windows)
1. Check out branch `feature/atlas-isochrone-leaflet-mvp` in a separate Git worktree if your main checkout has work in progress.
2. Run the existing root **OPEN ATLAS REVIEW.bat**. It starts the ATLAS HTTP server and opens the dashboard.
3. On the same local server origin/port, browse to `/modules/isochrones/index.html`.
   Example: if your dashboard opens at `http://127.0.0.1:PORT/`, open `http://127.0.0.1:PORT/modules/isochrones/index.html`.
4. Choose the four *Rowley Lane ... Ped/Cyc.json* files supplied by Iso4App. No network data is uploaded when importing these files; browser FileReader reads them locally.
5. Switch the scenario in the selector. The actual GeoJSON geometry is rendered on Leaflet and **fitBounds** fills the 8.96 × 5.77-inch map area used by the Cowley Hill PowerPoint.
6. Click **Load verified OSM land use + POIs** to request `landuse=residential` polygons and named amenities from Overpass, confined to the visible map extent. This is optional if Overpass is unavailable, but **required before issuing a drawing with residential hatching**.
7. Add/check any additional project-specific annotations, including Tesco, High Street, Existing Studios, schools, college and employment area. Click **Add annotation**, then the correct map location.
8. Use **Export map PNG** for a 2x map-panel raster (it draws only tiles already visible in the map and adds georeferenced network/hatching/labels), or **Print / save EAS sheet PDF** for the full drawing frame.

## Existing ATLAS code reused
- `../../assets/vendor/leaflet/`: same Leaflet vendor files as Bus, Accessibility and Drawing Generator.
- `../drawing-generator/assets/js/basemap-compositor.js` → `basemapProvider()`: existing OSM provider contract.
- `../drawing-generator/assets/images/eas-primary.png`: existing EAS corporate artwork.

## Important restrictions and QA
- This is an **interactive browser application**, not a background tile scraper. Use the normal ATLAS HTTP review server. `file://` opening produced OSM 403s previously due to the missing referring origin.
- Only standard map tiles for the actively displayed viewport are requested. Do not add automated multizoom prefetching or headless panning/scraping. Respect [OSMF's tile policy](https://operations.osmfoundation.org/policies/tiles/).
- `© OpenStreetMap contributors` is displayed on the live map and inside exports. Iso4App also requires source attribution as appropriate.
- OSM residential tags are **mapped land use, not a guarantee every dwelling/estate is present or correctly classified**. Verify against up-to-date photography and project survey evidence.
- Way and closed relation-outer polygons are drawn; complex unclosed multipolygon relation members require a more complete polygon assembler before release.
- Export PNG depends on cross-origin-enabled OSM tiles. If OSM tiles fail to load or the canvas is blocked by the browser, the UI reports the problem. Print-to-PDF remains the fall-back.
- This MVP intentionally does not modify Bus, Accessibility, HRA, NEXUS, shared basemap contract or the Drawing Generator.
- Review on latest Chrome or Edge. Check scales, road weights, legend, EAS logo and annotation location before use in a planning submission.
- Direct automated PPTX injection using the EAS template is the next acceptance step; the current prototype creates panel PNGs and a printable complete sheet.

## Suggested acceptance test
1. Roundabout pedestrian, Pub pedestrian, Roundabout bicycle, Pub bicycle all load.
2. Correct GeoJSON start markers, road lines, and travel-time legend for each.
3. OSM basemap visibly loads (not the 403 checkerboards seen from `file://`).
4. Map panel width:height equals `8.96/5.77`; no stretching, geographic displacement or missing attribution.
5. OSM residential polygons load for one viewport and are verified against aerial images; add omitted landmarks manually.
6. Export PNG is not blank and overlays line up; full-sheet print preserves the right-hand key and branding.
