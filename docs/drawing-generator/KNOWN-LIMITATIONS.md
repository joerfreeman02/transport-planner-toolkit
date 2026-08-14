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
- The SVG renderer intentionally excludes raster basemap tiles/screenshots. It renders restrained structured OSM context, controlled transport/site/overlay vectors and a BNG grid inside the exact projected extent.
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
- North-arrow, legend and title blocks are deterministic reconstructions, not CAD blocks or a pixel copy.

## Future automation

- Approved hosted vector provider/cache, a status-safe TfL Cycle Routes/CID adapter, authoritative bus sources, waterway reconciliation, OSTN15 support, topology-aware cartographic generalisation, curved/leader-line labels, direct PDF generation, project storage/versioning and a formally extracted shared spatial package.
- Codecov and OpenSSF Scorecard adoption remain governance decisions; Sentry/telemetry require a separate privacy decision.
