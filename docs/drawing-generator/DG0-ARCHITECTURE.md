# DG-0 architecture

Status: **Proposed live-review candidate; not an accepted baseline.**
Version/build: `DRAW-0.1.0` / `DRAW-0.1.0-DG0C3.3-20260817`.

## Road-geometry assistance boundary

`route-snap-adapter.js` owns the replaceable external provider boundary, request construction, bounded failure handling and provenance. `route-geometry.js` is network-free and owns route length, waypoint-order/deviation checks, site-direction normalization and distance-based arrow placement. `app.js` owns user intent and state transitions (`rough` → `snapping` → `snapped-review` → `approved`, with explicit failure/review/manual branches). `svg-renderer.js` consumes final retained geometry without mutating it. Provider output can never self-approve or change the planner's ordered waypoint choice.

## Scope and boundaries

DG-0 is an isolated static-browser module under `modules/drawing-generator/`. It implements one common engine configured for four drawing types. No existing functional module, production identity or Shared Knowledge Library record is a runtime dependency or is modified. C3 adds one WIP Dashboard card and one `config/modules.json` entry because the Dashboard is static; established cards and Dashboard behaviour remain unchanged.

The module does not select professional HGV routes, infer a site polygon from an address, infer engineering geometry from pixels, or treat historic precedent drawings as current data. Project state remains local to the browser and can be exported; client data is not transmitted except address text sent deliberately to Nominatim and the calculated drawing bounding box sent deliberately to Overpass.

## Processing model

1. The user locates an editing map by UK address or WGS84 coordinate. This creates a centre point only.
2. The user draws/edits/deletes a boundary with Leaflet.draw or imports validated Polygon/MultiPolygon GeoJSON. Holes are preserved.
3. A pure scale engine derives the EPSG:27700 extent from the physical map-frame dimensions and fixed mode scale.
4. The basemap compositor selects only XYZ tiles intersecting the exact BNG-derived frame, at fixed z13/z17. Each 256 px tile receives its own affine transform from its projected north-west, north-east and south-west corners. A maximum 80-tile viewport cap prevents bulk retrieval.
5. The Overpass adapter requests only structured professional transport/candidate vectors for that exact extent, with route-relation geometry clipped to the drawing bounds. It classifies supported evidence and creates a checksummed source snapshot. It no longer harvests landuse/place/minor-road geometry to imitate a basemap. Failure, malformed, timeout and genuine zero states remain distinct.
6. User-drawn or imported Point/LineString/MultiLineString/Polygon/MultiPolygon overlays carry a controlled class, colour, label, layer name and visibility state. They persist across mode changes. Routing modes also expose primary Draw To, Draw From, Cancel and Delete/Redraw controls.
7. `source-review.js` derives a deterministic station-to-returned-rail proximity assessment (200 m default) without changing station geometry or the provider snapshot. A no-nearby-rail warning defaults that source ID to excluded; Advanced diagnostics exposes the stable ID, name/mode, warning/distance and Include/Exclude action. Local storage retains only the planner decision and re-applies it on retrieval/mode change.
8. A pure presentation stage filters source-review exclusions, groups only connected like-for-like linework, removes coincident duplicate station labels, caps repeated labels and withholds colliding/out-of-frame labels. Original feature/source identifiers remain in the source snapshot and presentation metadata. Regional road labelling is limited to returned A/M references, with no geographic road/junction/roundabout names and one repeated reference normally permitted.
9. The renderer composes the raster tiles beneath BNG-projected, clipped controlled vectors in one SVG and records provider, zoom, tile count and maximum affine-centre error. It carries a separate map-corner OpenStreetMap attribution rather than mixing copyright text with engineering provenance. Tile failure preserves vector overlays, blocks print and displays `BASEMAP FAILED TO LOAD - REVIEW REQUIRED`.
10. CSS composes one `420mm x 297mm` landscape sheet. Browser Print / Save PDF uses `@page { size: A3 landscape; margin: 0; }`.

## Components

- `map-controller.js`: Leaflet and Leaflet.draw interaction, site and overlay lifecycle.
- `geometry.js`: GeoJSON extraction/validation, closed-ring and self-intersection checks, Polygon/MultiPolygon/hole support.
- `crs.js`: Proj4 EPSG:4326 ↔ EPSG:27700 using the OSGB36 datum definition.
- `scale-engine.js`: pure paper/ground calculations, centred projected extents and the editing-map issued-area footprint.
- `basemap-compositor.js`: provider abstraction, exact tile coverage, fixed zooms, affine placement and retrieval cap.
- `source-adapter.js`: clipped Overpass provider failover, current-status source classification, route grouping, provenance and checksum.
- `community-association.js`: exact source-area retention and deterministic single-containing-building association without buffers or invented footprints.
- `source-review.js`: immutable-input station/rail consistency QA and planner include/exclude presentation filter.
- `cartography.js`: deterministic source-way presentation grouping, station de-duplication and managed label placement.
- `railway-adapter.js`: local pure adapter matching current Railway evidence/mode semantics; equivalence tested against the existing module.
- `overlay-store.js`: validated controlled overlay model with import/edit/delete/visibility/export.
- `svg-renderer.js`: hybrid rendered-OSM/controlled-vector composition with auditable basemap metadata, legend, north arrow and physical scale bar.
- `app.js`: user workflow, metadata, persistence, diagnostics and print orchestration.

## Drawing configuration

Regional modes use a 336 x 245 mm map frame at 1:50,000 (16,800 x 12,250 m). Local modes use a 318 x 285 mm map frame at 1:2,500 (795 x 712.5 m). Regional sheets place the legend to the right and title block below; local sheets use a full-height right-hand legend/title panel, matching the supplied visual hierarchy without pixel-copying it.

## Context and hierarchy boundary

The issued contextual layer is recognizable OSM Standard cartography, not an Overpass pseudo-basemap. The exact official provider template is isolated behind a replaceable adapter. Tiles are not prefetched, archived or requested by automated tests. Browser cache/referer/user-agent behaviour is left native. BNG grid and controlled EAS vector overlays remain separate from raster context and retain exact projected geometry.

Current OSM bicycle relations with `network=icn`, `ncn` or `rcn` render as the primary cycle network and `network=lcn` renders as the local cycle network; a route `ref` is not required. Lifecycle-tagged proposed/planned/future/construction/disused/abandoned evidence remains review-only. The authoritative-source decision, mode colours, bus geometry rule and community association are recorded in `CURRENT-SOURCE-MAPPING.md`. TfL is not a runtime dependency because its official API requires registered credentials that are not available to this WIP static client.

## Security, privacy and resilience

No API key is required or stored. Provider endpoints are explicit and replaceable. Tile count is bounded and print is blocked unless every composed tile succeeds. Source failures cannot become an empty-success state. Unsupported geometry/classes/colours are rejected. HTML labels are escaped before sheet rendering. Live client snapshots and site data are never committed. The current candidate uses browser local storage only, with no telemetry or server-side persistence.

See the source, reuse, CRS/scale and limitation registers in this directory. Architecture status remains Proposed as recorded in ADR-008.
