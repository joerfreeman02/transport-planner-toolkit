# Product Owner manual acceptance

Drawing Generator is a live-review candidate and must not be accepted merely because these steps complete.

1. Open the deployed direct Drawing Generator URL in Chrome or Edge.
2. Confirm the banner says `LIVE REVIEW CANDIDATE - NOT ACCEPTED BASELINE` and the build says `DRAW-0.1.0-DG0C1-20260814`.
3. Enter the live project address and search, or enter confirmed coordinates. Confirm this centres the map but does **not** create a site polygon.
4. Draw the approved site boundary with the polygon tool, or import a Product Owner-prepared GeoJSON Polygon/MultiPolygon. Edit it and confirm any holes. Do not treat the architect PDF as georeferenced geometry.
5. Enter client, architect, project, drawing/project numbers, designer, date, revision/status and description.
6. Select **Regional Plan**, retrieve vector layers, review every missing-layer warning, and add reviewed overlays where needed.
7. Select **Regional Routing**, draw/import professionally approved route-to and route-from lines, assign the controlled classes and labels, then review arrows/legend.
8. Select **Local Context**, retrieve local candidates, include only relevant community considerations, and draw/import any missing bus/cycle/rail groups.
9. Select **Local Routing**, retain/add the approved local routes and community features.
10. For each mode choose **Print / Save PDF**. In the browser dialogue select A3, Landscape, Scale 100%, zero/default margins as shown by the preview, and enable background graphics. Save one PDF per drawing.
11. Confirm each PDF is exactly one landscape A3 page; the site, required reviewed layers, current EAS logo, legend, north arrow, attribution, correct scale and 20 mm scale bar are legible and unclipped.
12. Compare hierarchy/placement with the supplied professional precedents. Record the mode, build, browser/PDF setting, screenshot and exact defect for every issue.

Do not upload live client snapshots, site GeoJSON or PDFs to the public repository. Report defects to the Technical Director/Product Owner before baseline acceptance.
