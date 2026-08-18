# Product Owner manual acceptance

Drawing Generator is a live-review candidate and must not be accepted merely because these steps complete.

1. Open the deployed direct Drawing Generator URL in Chrome or Edge.
2. Confirm the banner says `WORK IN PROGRESS / LIVE REVIEW - NOT ACCEPTED BASELINE` and the build says `DRAW-0.1.0-DG0C3.3B-HF4A-20260818`.
3. Without opening **Advanced controls and diagnostics**, switch through Regional Plan, Regional Routing, Local Context and Local Routing. Confirm the normal five steps are visible: choose drawing, locate site, confirm site/routes, set appearance/check sources, then generate/review/issue.
4. Confirm Colour and Faded are the initial basemap choices. Switch to Greyscale only when desired and confirm Colour remains selectable; the site, routes and controlled coloured overlays must not change.
5. In Local Context, optionally make a bus presentation group. Confirm a route cannot be added to two groups, ungrouped routes remain shown and the group does not change route source identity or geometry.
6. Confirm generic rail geometry is labelled `RAILWAY`, not London Overground, unless explicit source evidence supports a named mode. Confirm community candidates offer stable OpenStreetMap and Google Maps links and that selected annotations use a leader and backed label.
7. In each drawing mode confirm the issued sheet contains exactly one EAS logo, in the title block.

## Routing workflow

1. Confirm a real site polygon, then choose Regional Routing or Local Routing.
2. Draw Route To Site through the roads selected by the planner. Add points at meaningful turns/junctions; a detailed route may contain more than 50 planner points. Repeat for Route From Site. While drawing, pan/zoom without accidentally adding vertices.
3. Confirm the application adds internal guidance and road-snaps through the planner-selected trace to clean road-following geometry, then reports that explicit planner approval is required. A valid candidate must not be rejected merely because the road is longer than straight planner chords or curves away from those chords.
4. Confirm Route To ends nearest the site and Route From starts nearest the site. If a line is deterministically reversed, confirm the overlay record reports that normalization.
5. Confirm direction marks are small route-centred `>` chevrons that follow the final retained geometry. No long arrow shafts or cartographic offsets should appear; where TO and FROM overlap, red remains primary and blue remains subordinate/readable.
6. Test a deliberately detailed route with more than 50 planner points. Confirm it is processed without the former waypoint-limit error and that the final candidate still follows the selected roads.
7. Confirm Regional Routing contains no automatic road/motorway/cycle/water/rail/station thematic overlays. In Local Routing, retain a community/manual overlay only where explicitly selected and relevant.
8. Approve the road-snapped routes. Confirm print becomes available only when both route directions, basemap, scale and site are ready.
9. Edit/redraw a route to add guidance and confirm road snapping reruns and previous approval is cleared. Change Regional Routing to Local Routing and back; confirm retained route geometry is unchanged.
10. Simulate provider `NoRoute`/HTTP failure in the mocked test environment. Confirm the original planner geometry remains visible, print stays blocked, and retry/redraw/manual fallback remain available. Manual acceptance must still pass the site-direction check.
11. Clear the site and confirm `ROUTE DIRECTION REQUIRES REVIEW` blocks readiness. Toggle **ISSUED DRAWING EXTENT** and confirm Regional reports 16,800 m × 12,250 m at 1:50,000 and Local reports 795 m × 712.5 m at 1:2,500.

3. Confirm **Advanced editing / source diagnostics** starts closed, the map can pan immediately, and **Draw site boundary** begins an explicit drawing state. Choose **Cancel drawing** and confirm normal map navigation returns.
4. Enter the live project address and search, or enter confirmed coordinates. Confirm this centres the map but does **not** create a site polygon.
5. Draw the approved site boundary with the polygon tool, or import a Product Owner-prepared GeoJSON Polygon/MultiPolygon. Edit it and confirm any holes. Do not treat the architect PDF as georeferenced geometry.
6. Enter project/client in the primary setup. Open Advanced only for architect, drawing/project numbers, designer, date, revision/status, diagnostics and reviewed overlays.
7. Select **Regional Plan**, choose **Generate / refresh drawing**, review every missing-layer warning, and add reviewed overlays where needed. Confirm recognizable OSM Standard roads, settlements, land and water appear as the rendered basemap beneath the red/green/blue/grey controlled hierarchy. Confirm a separate readable `© OpenStreetMap contributors` marker at the map edge, z13 and a bounded tile count are recorded on the sheet/SVG.
8. In **Advanced editing / source diagnostics**, inspect each station row: confirm its stable source ID, name/mode, current Include/Exclude state and returned-rail QA. Confirm a `REVIEW REQUIRED - NO NEARBY RETURNED RAIL GEOMETRY` station is excluded from map, drawing and legend until **Include** is explicitly selected; confirm the decision persists through a mode change/retrieval without relocating the source geometry.
9. Select **Regional Routing**. Confirm the primary buttons **Draw Route To Site**, **Draw Route From Site**, **Cancel Route Drawing** and **Delete/Redraw Route** are visible/usable. Draw professionally approved directions and review arrows/legend.
10. Select **Local Context**, retrieve local candidates and use the separate Cycle, Rail, Bus, Water and Community controls. Include only relevant community considerations with an evidenced source area or single containing building. Confirm Add changes immediately to Added/Remove, updates map and preview, persists without duplicates, and that ambiguous/no-building nodes remain review-only. Confirm generic red main-road thematic clutter is absent.
11. Select **Local Routing**, retain/add the approved local routes and community features.
12. For each mode choose **Print / Save PDF**. In the browser dialogue select A3, Landscape, Scale 100%, zero/default margins as shown by the preview, and enable background graphics. Save one PDF per drawing.
13. Confirm each PDF is exactly one landscape A3 page; the site, recognizable rendered OSM context, required reviewed layers, current EAS logo, compact legend, north arrow, separate attribution, correct scale and 20 mm scale bar are legible and unclipped. Confirm labels do not visibly overlap, Regional has no road/junction/roundabout place names and recurring A/M references are not excessive.
14. Test one failed-tile condition in a non-production/mock environment. Confirm controlled overlays remain, print is disabled and `BASEMAP FAILED TO LOAD - REVIEW REQUIRED` is visible. Do not simulate this by repeatedly requesting the public service.
15. Compare hierarchy/placement with the supplied professional precedents. Record the mode, build, browser/PDF setting, screenshot and exact defect for every issue.

Do not upload live client snapshots, site GeoJSON or PDFs to the public repository. Report defects to the Technical Director/Product Owner before baseline acceptance.
