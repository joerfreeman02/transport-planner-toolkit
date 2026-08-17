# Product Owner manual acceptance

Drawing Generator is a live-review candidate and must not be accepted merely because these steps complete.

1. Open the deployed direct Drawing Generator URL in Chrome or Edge.
2. Confirm the banner says `WORK IN PROGRESS / LIVE REVIEW - NOT ACCEPTED BASELINE` and the build says `DRAW-0.1.0-DG0C3.3-20260817`.
3. In each drawing mode confirm the issued sheet contains exactly one EAS logo, in the title block.

## Routing workflow

1. Confirm a real site polygon, then choose Regional Routing or Local Routing.
2. Draw Route To Site as ordered rough waypoints through the planner-selected roads. Repeat for Route From Site.
   While either route is active, click once to add a waypoint, drag the map to pan and use the mouse wheel to zoom. Confirm the navigation gesture does not add a waypoint.
3. Confirm the application replaces each rough guide with clean road-following geometry and reports planner approval is required.
4. Confirm Route To ends nearest the site and Route From starts nearest the site. If a line was reversed, confirm its overlay record displays that normalization.
5. Confirm arrows follow route direction and use a clean distance cadence rather than every geometry vertex.
   Where TO and FROM share a corridor, confirm the blue FROM arrows remain immediately readable through their white halo and presentation-only offset; retained professional geometry must remain coincident with the approved road.
6. Confirm Regional Routing contains no automatic road/motorway/cycle/water/rail/station thematic overlays. In Local Routing, retain a community/manual overlay only where explicitly selected and relevant.
7. Approve the snapped routes. Confirm print becomes available only when both route directions, basemap, scale and site are ready.
8. Edit a route to add guidance and confirm it is re-snapped and approval is cleared. Change Regional Routing to Local Routing and back; confirm the retained geometry is unchanged.
9. Simulate provider failure. Confirm the rough geometry remains visible, the exact UI warning is `ROAD SNAP FAILED — ROUTE REQUIRES MANUAL REVIEW`, and print remains blocked. Retry, redraw, or explicitly choose Use Manual Geometry. Manual acceptance must still pass the site-direction check.
10. Clear the site and confirm the exact warning `ROUTE DIRECTION REQUIRES REVIEW` blocks readiness.
11. Toggle **ISSUED DRAWING EXTENT** and confirm the Regional frame reports 16,800 m × 12,250 m at 1:50,000 and the Local frame reports 795 m × 712.5 m at 1:2,500. Confirm it updates after mode/location/site changes and is not the current Leaflet viewport.
3. Confirm **Advanced editing / source diagnostics** starts closed, the map can pan immediately, and **Draw site boundary** begins an explicit drawing state. Choose **Cancel drawing** and confirm normal map navigation returns.
4. Enter the live project address and search, or enter confirmed coordinates. Confirm this centres the map but does **not** create a site polygon.
5. Draw the approved site boundary with the polygon tool, or import a Product Owner-prepared GeoJSON Polygon/MultiPolygon. Edit it and confirm any holes. Do not treat the architect PDF as georeferenced geometry.
6. Enter project/client in the primary setup. Open Advanced only for architect, drawing/project numbers, designer, date, revision/status, diagnostics and reviewed overlays.
7. Select **Regional Plan**, choose **Generate / refresh drawing**, review every missing-layer warning, and add reviewed overlays where needed. Confirm recognizable OSM Standard roads, settlements, land and water appear as the rendered basemap beneath the red/magenta/orange/blue/grey controlled hierarchy. Confirm a separate readable `© OpenStreetMap contributors` marker at the map edge, z13 and a bounded tile count are recorded on the sheet/SVG.
8. In **Advanced editing / source diagnostics**, inspect each station row: confirm its stable source ID, name/mode, current Include/Exclude state and returned-rail QA. Confirm a `REVIEW REQUIRED - NO NEARBY RETURNED RAIL GEOMETRY` station is excluded from map, drawing and legend until **Include** is explicitly selected; confirm the decision persists through a mode change/retrieval without relocating the source geometry.
9. Select **Regional Routing**. Confirm the primary buttons **Draw Route To Site**, **Draw Route From Site**, **Cancel Route Drawing** and **Delete/Redraw Route** are visible/usable. Draw professionally approved directions and review arrows/legend.
10. Select **Local Context**, retrieve local candidates and use the separate Cycle, Rail, Bus, Water and Community controls. Include only relevant community considerations with an evidenced source area or single containing building. Confirm Add changes immediately to Added/Remove, updates map and preview, persists without duplicates, and that ambiguous/no-building nodes remain review-only. Confirm generic red main-road thematic clutter is absent.
11. Select **Local Routing**, retain/add the approved local routes and community features.
12. For each mode choose **Print / Save PDF**. In the browser dialogue select A3, Landscape, Scale 100%, zero/default margins as shown by the preview, and enable background graphics. Save one PDF per drawing.
13. Confirm each PDF is exactly one landscape A3 page; the site, recognizable rendered OSM context, required reviewed layers, current EAS logo, compact legend, north arrow, separate attribution, correct scale and 20 mm scale bar are legible and unclipped. Confirm labels do not visibly overlap, Regional has no road/junction/roundabout place names and recurring A/M references are not excessive.
14. Test one failed-tile condition in a non-production/mock environment. Confirm controlled overlays remain, print is disabled and `BASEMAP FAILED TO LOAD - REVIEW REQUIRED` is visible. Do not simulate this by repeatedly requesting the public service.
15. Compare hierarchy/placement with the supplied professional precedents. Record the mode, build, browser/PDF setting, screenshot and exact defect for every issue.

Do not upload live client snapshots, site GeoJSON or PDFs to the public repository. Report defects to the Technical Director/Product Owner before baseline acceptance.
