# Drawing Generator current-source mapping

Status: **DG-0C3.3A live-review candidate; not accepted baseline.** Historic drawings are presentation precedents only and are not data inputs.

## C3.3A planner-facing presentation rules

Colour OSM is the default and remains available for every drawing. Greyscale and Normal/Faded treatment are optional, per-mode presentation controls that affect only the rendered OSM tile group; they never change source geometry, route geometry, controlled-vector colours or source status.

Rail line geometry is deliberately separate from station-mode evidence. A generic `railway=rail` feature is shown as neutral `RAILWAY`; it is not called London Overground. Only explicit OSM rail geometry evidence can produce National Rail, London Overground, London Underground, DLR or Tram/light rail presentation. The planner-facing Source & Audit summary distinguishes **USED** evidence from **REFERENCE** links. TfL cycle/bus material is reference-only in this credential-free browser module; current OSM/Overpass geometry remains the issued source.

Local bus presentation groups are an optional label/colour convention. Their members retain their stable source identity, geometry and provenance; a route may belong to no more than one group and ungrouped routes remain visible.

## OpenStreetMap / Overpass boundary

The browser sends the exact fixed-scale drawing bounding box to a replaceable Overpass endpoint. Relation output uses `out body center geom(<drawing bounds>)`, so bus and bicycle relations retain their tags and member identities while geometry is clipped to the issued frame. This avoids downloading every intersecting London route in full. Provider failure, timeout, malformed JSON and a genuine zero result remain distinct.

| Current evidence | Normalised class | Regional Plan | Local Context | Review rule |
|---|---|---|---|---|
| `route=bicycle`, `network=icn/ncn/rcn` | `cycle-network-primary` | solid green | solid green | proposed, planned, future, construction, disused, deprecated, abandoned or removed lifecycle evidence is withheld as review-only |
| `route=bicycle`, `network=lcn` | `cycle-network-local` | dashed green | dashed green | same lifecycle filter; a route reference is not required |
| `highway=cycleway` | `cycle-route` | not part of the Regional hierarchy | dashed green | non-current lifecycle evidence is review-only |
| `route=bus` relation with clipped member geometry | `bus-route` | not issued | red corridor with deterministic controlled route-group colour and route-number legend | missing line geometry becomes `BUS ROUTE GEOMETRY REQUIRES REVIEW`; it is never drawn as a point route |
| returned rail ways and mode-evidenced stations | `railway`, mode-specific station class | grey rail hierarchy | generic neutral rail; named mode only where explicitly evidenced | station/returned-rail consistency review remains unchanged |
| amenity/shop way or relation with a usable area | `community-candidate` | not issued | selectable exact source area | only a planner-selected candidate becomes a grey `community` area |
| amenity/shop node | `community-candidate` | not issued | selectable only after exact association | exactly one containing OSM building polygon is required; zero or multiple containing buildings remains review-only, with no buffer or fabricated shape |

Community overlay provenance stores candidate source ID, building source ID, association method and review state. Building-support geometry is query support only: it is removed from the normalised source set and never becomes general map clutter.

## TfL authority decision

TfL remains the preferred authority for confirming London bus route existence and publishes route/stop sequences and route topology through its open-data services. TfL also describes cycle-route data with route name, label, status and programme metadata. The official Unified API requires registered application credentials. DG-0C3.3 has no approved credentials or secret-management boundary, so it does not make anonymous TfL calls or fabricate an official supplement. OSM remains the geometry backbone; missing bus geometry is surfaced explicitly for planner review. A future TfL adapter must preserve current/future status, attribution and credential handling before it can affect issued evidence.

## Planner-facing separation

The editing map exposes separate Roads, Cycle, Rail, Bus, Water and Community-candidate controls. The issued drawing filters by drawing mode independently of editor visibility. Local Context intentionally suppresses the generic red main-road theme: its controlled hierarchy is site, bus route groups, relevant rail, strategic/regional and local cycles, and selected grey community areas over the rendered OSM context.

The **ISSUED DRAWING EXTENT** layer is created by the same `extentForDrawing` calculation used by the PDF renderer: 16,800 m × 12,250 m at 1:50,000 and 795 m × 712.5 m at 1:2,500.
