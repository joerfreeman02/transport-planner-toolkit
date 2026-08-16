# DG-0 known limitations

## Deadline-driven manual fallbacks

- HGV route-to/from selection is never automatic; draw/import and professionally approve it.
- Nationwide bus-route completeness is not guaranteed; import/draw reviewed route groups.
- Community considerations are candidates only until a professional explicitly includes them.
- Current cycle hierarchy uses OSM `icn`/`ncn`/`rcn`/`lcn` relation evidence without requiring a route reference. Proposed/planned/future/construction/disused/abandoned and unsupported network relations remain review-only until a planner adds an approved overlay.
- Navigable-waterway status requires explicit OSM `boat=yes` or `motorboat=yes`; canal/river type alone is review-only and must not be used as a navigability claim.
- Route labels, group names and controlled colours require user review.

## Technical limitations

- Public Nominatim/Overpass endpoints have no availability SLA, quota guarantee or reproducibility guarantee. Download source snapshots immediately.
- Browser state is local storage, not a managed project database; clear-site/browser operations can remove it. Export overlays/snapshots.
- Proj4 uses a Helmert-style OSGB36 transformation without an OSTN15 grid file; it is not survey-grade.
- The issued SVG embeds live rendered OSM tile images. It is not self-contained until those browser image requests have succeeded; print is deliberately blocked on partial/failed loads.
- Public OSM Standard tiles are suitable only for normal human viewport use under the current policy. No bulk, prefetch, offline archive or headless scan is permitted. Production traffic may require a contracted or self-hosted provider.
- Per-tile affine transforms approximate the non-linear BNG projection within each Web Mercator tile. Tested maximum centre error is below 0.03 SVG px at the configured UK QA extent, but this is visual cartography, not survey control.
- Geometry validation rejects self-intersections but does not provide full GIS topology repair, polygon union or snapping.
- Rendering clips by the SVG view box; it does not geometrically split source features at the extent boundary.
- Source snapshot hashes attest to the local envelope contents, not to publisher signatures.
- Printing depends on the browser honouring A3, landscape, 100% scale and background graphics. The user must verify the print dialogue.

## Source limitations

- OSM classification is only as complete/current as the returned tags and Overpass response.
- Relation geometries may be discontinuous MultiLineStrings. Presentation grouping combines only connected like-for-like segments; it is not GIS conflation and does not alter source records.
- Station modes follow current Railway tag semantics, but ambiguous/poorly tagged stations may need reviewed overlays.
- Automatic bus retrieval is limited to OSM bus-route relations and may omit services or contain stale geometry.
- Waterway navigability is conservative: all unproven rivers and canals remain review-only.
- No authoritative traffic-order, restriction, bridge-height/weight or swept-path evidence is used. The tool cannot determine HGV suitability.

## Cosmetic refinements

- Label placement uses deterministic bounding-box collision avoidance, repeat caps and regional/local count limits. It does not curve labels along lines or create leader lines, so some labels are deliberately withheld.
- Fine-grained road casing, interchange symbols, route-arrow cadence and typography may need precedent-led refinement.
- Rendered OSM labels can coexist with controlled vector labels. Collision management applies to controlled labels, not text already baked into OSM tiles, so dense urban regional sheets still require professional visual review.
- North-arrow, legend and title blocks are deterministic reconstructions, not CAD blocks or a pixel copy.

## Future automation

- Approved hosted raster/vector provider, a status-safe TfL Cycle Routes/CID adapter, authoritative bus sources, waterway reconciliation, OSTN15 support, topology-aware cartographic generalisation, curved/leader-line labels, direct PDF generation, project storage/versioning and a formally extracted shared spatial package.
- Codecov and OpenSSF Scorecard adoption remain governance decisions; Sentry/telemetry require a separate privacy decision.
# DG-0C3.1 routing limitations

- Road snapping follows planner-supplied waypoints using the selected provider's car-road graph. It does not assess height, width, weight, loading, turning, access, time, traffic, temporary restrictions, permits or HGV suitability.
- Public routing and map services have no SLA. Failure is deliberately non-destructive and requires retry, more guidance, redraw or explicit manual fallback.
- Waypoint proximity/order checks detect material divergence but do not prove that the chosen road is legally or operationally suitable.
- Site endpoint direction uses geometric proximity to the confirmed polygon; equal/ambiguous endpoint proximity is blocked for review.
- Local Routing may show a community/manual overlay only after explicit planner selection; relevance remains a professional judgement.
