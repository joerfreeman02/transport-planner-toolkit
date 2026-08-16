# Product Owner manual acceptance

Drawing Generator is a live-review candidate and must not be accepted merely because these steps complete.

1. Open the deployed direct Drawing Generator URL in Chrome or Edge.
2. Confirm the banner says `WORK IN PROGRESS / LIVE REVIEW - NOT ACCEPTED BASELINE` and the build says `DRAW-0.1.0-DG0C3-20260816`.
3. Confirm **Advanced editing / source diagnostics** starts closed, the map can pan immediately, and **Draw site boundary** begins an explicit drawing state. Choose **Cancel drawing** and confirm normal map navigation returns.
4. Enter the live project address and search, or enter confirmed coordinates. Confirm this centres the map but does **not** create a site polygon.
5. Draw the approved site boundary with the polygon tool, or import a Product Owner-prepared GeoJSON Polygon/MultiPolygon. Edit it and confirm any holes. Do not treat the architect PDF as georeferenced geometry.
6. Enter project/client in the primary setup. Open Advanced only for architect, drawing/project numbers, designer, date, revision/status, diagnostics and reviewed overlays.
7. Select **Regional Plan**, choose **Generate / refresh drawing**, review every missing-layer warning, and add reviewed overlays where needed. Confirm recognizable OSM Standard roads, settlements, land and water appear as the rendered basemap beneath the red/magenta/orange/blue/grey controlled hierarchy. Confirm attribution, z13 and a bounded tile count are recorded on the sheet/SVG.
8. Select **Regional Routing**. Confirm the primary buttons **Draw Route To Site**, **Draw Route From Site**, **Cancel Route Drawing** and **Delete/Redraw Route** are visible/usable. Draw professionally approved directions and review arrows/legend.
9. Select **Local Context**, retrieve local candidates, include only relevant community considerations, and draw/import any missing bus/cycle/rail groups.
10. Select **Local Routing**, retain/add the approved local routes and community features.
11. For each mode choose **Print / Save PDF**. In the browser dialogue select A3, Landscape, Scale 100%, zero/default margins as shown by the preview, and enable background graphics. Save one PDF per drawing.
12. Confirm each PDF is exactly one landscape A3 page; the site, recognizable rendered OSM context, required reviewed layers, current EAS logo, compact legend, north arrow, attribution, correct scale and 20 mm scale bar are legible and unclipped. Confirm labels do not visibly overlap and recurring road/cycle labels are not excessive.
13. Test one failed-tile condition in a non-production/mock environment. Confirm controlled overlays remain, print is disabled and `BASEMAP FAILED TO LOAD - REVIEW REQUIRED` is visible. Do not simulate this by repeatedly requesting the public service.
14. Compare hierarchy/placement with the supplied professional precedents. Record the mode, build, browser/PDF setting, screenshot and exact defect for every issue.

Do not upload live client snapshots, site GeoJSON or PDFs to the public repository. Report defects to the Technical Director/Product Owner before baseline acceptance.
