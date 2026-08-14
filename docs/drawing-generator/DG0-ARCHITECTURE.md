# DG-0 architecture

Status: **Proposed live-review candidate; not an accepted baseline.**
Version/build: `DRAW-0.1.0` / `DRAW-0.1.0-DG0C2-20260814`.

## Scope and boundaries

DG-0 is an isolated static-browser module under `modules/drawing-generator/`. It implements one common engine configured for four drawing types. No existing functional module, Dashboard code, production identity or Shared Knowledge Library record is a runtime dependency or is modified.

The module does not select professional HGV routes, infer a site polygon from an address, infer engineering geometry from pixels, or treat historic precedent drawings as current data. Project state remains local to the browser and can be exported; client data is not transmitted except address text sent deliberately to Nominatim and the calculated drawing bounding box sent deliberately to Overpass.

## Processing model

1. The user locates an editing map by UK address or WGS84 coordinate. This creates a centre point only.
2. The user draws/edits/deletes a boundary with Leaflet.draw or imports validated Polygon/MultiPolygon GeoJSON. Holes are preserved.
3. A pure scale engine derives the EPSG:27700 extent from the physical map-frame dimensions and fixed mode scale.
4. The Overpass adapter requests structured OSM vectors for that exact extent, classifies supported contextual/transport evidence and creates a checksummed source snapshot. Failure, malformed, timeout and genuine zero states remain distinct.
5. User-drawn or imported Point/LineString/MultiLineString/Polygon/MultiPolygon overlays carry a controlled class, colour, label, layer name and visibility state. They persist across mode changes.
6. A pure presentation stage groups only connected like-for-like linework, removes coincident duplicate station labels, caps repeated labels and withholds colliding/out-of-frame labels. Original feature/source identifiers remain in the source snapshot and presentation metadata.
7. The renderer transforms all geometry into BNG, clips it through the drawing view box, draws structured land/place/secondary-road context beneath controlled EAS transport/site overlays, and emits deterministic SVG. Leaflet tiles are editing context only and never appear on the issued sheet.
8. CSS composes one `420mm x 297mm` landscape sheet. Browser Print / Save PDF uses `@page { size: A3 landscape; margin: 0; }`.

## Components

- `map-controller.js`: Leaflet and Leaflet.draw interaction, site and overlay lifecycle.
- `geometry.js`: GeoJSON extraction/validation, closed-ring and self-intersection checks, Polygon/MultiPolygon/hole support.
- `crs.js`: Proj4 EPSG:4326 ↔ EPSG:27700 using the OSGB36 datum definition.
- `scale-engine.js`: pure paper/ground calculations and centred projected extents.
- `source-adapter.js`: Overpass provider failover, source classification, provenance and checksum.
- `cartography.js`: deterministic source-way presentation grouping, station de-duplication and managed label placement.
- `railway-adapter.js`: local pure adapter matching current Railway evidence/mode semantics; equivalence tested against the existing module.
- `overlay-store.js`: validated controlled overlay model with import/edit/delete/visibility/export.
- `svg-renderer.js`: projected, auditable contextual/controlled vector composition with legend, north arrow and physical scale bar.
- `app.js`: user workflow, metadata, persistence, diagnostics and print orchestration.

## Drawing configuration

Regional modes use a 336 x 245 mm map frame at 1:50,000 (16,800 x 12,250 m). Local modes use a 318 x 285 mm map frame at 1:2,500 (795 x 712.5 m). Regional sheets place the legend to the right and title block below; local sheets use a full-height right-hand legend/title panel, matching the supplied visual hierarchy without pixel-copying it.

## Context and hierarchy boundary

The issued contextual basemap is not a generic raster basemap. It is a deliberately limited set of structured OSM landuse/natural polygons, place labels and road ways returned inside the exact BNG-derived request extent. Regional modes request secondary/tertiary roads; local modes additionally request residential/unclassified/living-street ways. Context is pale, excluded from the legend and drawn beneath the BNG grid and controlled transport/site overlays.

Current OSM bicycle relations with `network=icn`, `ncn` or `rcn` render as the primary cycle network and `network=lcn` renders as the local cycle network; a route `ref` is not required. Lifecycle-tagged proposed/planned/future/construction/disused/abandoned evidence remains review-only. TfL evidence is documented separately and is not a runtime dependency in C2.

## Security, privacy and resilience

No API key is required or stored. Provider endpoints are explicit. Source failures cannot become an empty-success state. Unsupported geometry/classes/colours are rejected. HTML labels are escaped before sheet rendering. Live client snapshots and site data are never committed. The current candidate uses browser local storage only, with no telemetry or server-side persistence.

See the source, reuse, CRS/scale and limitation registers in this directory. Architecture status remains Proposed as recorded in ADR-008.
