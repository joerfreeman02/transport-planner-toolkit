# DG-0 known limitations

## Deadline-driven manual fallbacks

- HGV route-to/from selection is never automatic; draw/import and professionally approve it.
- Nationwide bus-route completeness is not guaranteed; import/draw reviewed route groups.
- Community considerations are candidates only until a professional explicitly includes them.
- Strategic-cycle hierarchy requires explicit OSM `ncn`/`rcn` network and route-reference evidence; other bicycle relations remain review-only until a planner adds an approved overlay.
- Navigable-waterway status requires explicit OSM `boat=yes` or `motorboat=yes`; canal/river type alone is review-only and must not be used as a navigability claim.
- Route labels, group names and controlled colours require user review.

## Technical limitations

- Public Nominatim/Overpass endpoints have no availability SLA, quota guarantee or reproducibility guarantee. Download source snapshots immediately.
- Browser state is local storage, not a managed project database; clear-site/browser operations can remove it. Export overlays/snapshots.
- Proj4 uses a Helmert-style OSGB36 transformation without an OSTN15 grid file; it is not survey-grade.
- The SVG renderer intentionally excludes raster basemap context. It renders structured transport/site/overlay vectors and a BNG grid.
- Geometry validation rejects self-intersections but does not provide full GIS topology repair, polygon union or snapping.
- Rendering clips by the SVG view box; it does not geometrically split source features at the extent boundary.
- Source snapshot hashes attest to the local envelope contents, not to publisher signatures.
- Printing depends on the browser honouring A3, landscape, 100% scale and background graphics. The user must verify the print dialogue.

## Source limitations

- OSM classification is only as complete/current as the returned tags and Overpass response.
- Relation geometries may be discontinuous MultiLineStrings. No cartographic conflation is performed.
- Station modes follow current Railway tag semantics, but ambiguous/poorly tagged stations may need reviewed overlays.
- Automatic bus retrieval is limited to OSM bus-route relations and may omit services or contain stale geometry.
- Waterway navigability is conservative: all unproven rivers and canals remain review-only.
- No authoritative traffic-order, restriction, bridge-height/weight or swept-path evidence is used. The tool cannot determine HGV suitability.

## Cosmetic refinements

- Label collision/leader-line optimisation is deliberately limited.
- Fine-grained road casing, interchange symbols, route-arrow cadence and typography may need precedent-led refinement.
- North-arrow, legend and title blocks are deterministic reconstructions, not CAD blocks or a pixel copy.

## Future automation

- Approved hosted vector provider/cache, authoritative bus and cycle sources, waterway reconciliation, OSTN15 support, sophisticated cartographic generalisation, label placement, direct PDF generation, project storage/versioning and a formally extracted shared spatial package.
- Codecov and OpenSSF Scorecard adoption remain governance decisions; Sentry/telemetry require a separate privacy decision.
