# DG-0 data-source register

The issued sheet combines rendered OSM Standard cartography with separately controlled vector evidence. Raster context is visual orientation only; professional claims remain traceable vectors or reviewed user overlays.

| Layer | Provider/retrieval | Classification | Attribution | Failure/manual fallback |
|---|---|---|---|---|
| Address centre | OpenStreetMap Nominatim JSON search, deliberate user action | Selected result supplies WGS84 centre only | OpenStreetMap contributors | Enter coordinates manually. Never creates a boundary. |
| Issued rendered basemap | OSM Standard XYZ, exact `https://tile.openstreetmap.org/{z}/{x}/{y}.png`; fixed z13 regional / z17 local; only intersecting tiles | Projection-aware per-tile affine placement beneath vectors; visual context only | OpenStreetMap contributors, ODbL 1.0 | All controlled vectors remain intact. Print is blocked and exact visible warning says `BASEMAP FAILED TO LOAD - REVIEW REQUIRED`. Provider is replaceable. |
| Main/A roads | OSM through Overpass POST; `highway=trunk/primary` and links | `main-road` | OpenStreetMap contributors, ODbL 1.0 | Provider state shown; reviewed LineString/MultiLineString overlay. |
| Motorways | OSM through Overpass; `highway=motorway` and links | `motorway` | Same | Reviewed line overlay. |
| Railway | OSM through Overpass; `railway=rail/subway/light_rail/tram` | `railway`, preserving rail type | Same | Reviewed line overlay. |
| Stations | OSM node/way/relation station evidence | Current TPT Railway `hasRailEvidence`/`modeForTags` semantics, adapted locally and equivalence-tested | Same | Reviewed point overlay; no unsupported mode is invented. |
| Cycle routes | OSM cycleways and bicycle-route relations | Highway cycleways become `cycle-route`. Current `icn`/`ncn`/`rcn` relations become `cycle-network-primary`; current `lcn` relations become `cycle-network-local`. A route `ref` is not required. Proposed/planned/future/construction/disused/abandoned evidence and unsupported network values remain `cycle-review`. Returned network/ref/name/operator/cycle-network metadata is retained. | Same | Review-only relation evidence requires a reviewed planner overlay before inclusion. See `TFL-CYCLE-EVIDENCE.md` for the non-runtime authoritative-source hierarchy. |
| Waterways | OSM river/canal ways | `waterway` only when `boat=yes` or `motorboat=yes`; all other river/canal evidence → `waterway-review` warning. | Same | Review-only evidence or controlled overlay; a canal is not treated as navigable merely by its type. |
| Main roads / motorways | OSM highway ways | `highway=trunk/primary` becomes functional `main-road`; `highway=motorway*` becomes `motorway`. An A-road statement is made only where an explicit `A...` ref is returned. | Same | Labels preserve returned ref/name (`A406 - North Circular Road`, for example); otherwise the legend says only `MAIN ROAD`. |
| Bus routes | OSM bus-route relations, requested only in local modes | `bus-route`, label from ref/name | Same | Imported/drawn route group is the deadline-safe primary fallback; completeness is not claimed. |
| Community candidates | OSM selected amenity/shop tags, requested only in local modes | `community-candidate`; user must select before inclusion | Same | User draws/imports/adds a reviewed consideration. Automatic professional relevance is not claimed. |
| Site/routes/manual layers | User-supplied GeoJSON or Leaflet.draw | Validated controlled class/style | User evidence; no OSM attribution unless derived from OSM | User edits, hides or deletes. Route selection is always professional/user-controlled. |

## Query and snapshot

The generated Overpass query requests professional transport/candidate evidence only; landuse, natural, place and minor/residential pseudo-basemap harvesting is excluded. The exact BNG-derived WGS84 bounding box is recorded with provider endpoint, UTC retrieval time, drawing build/type, source identifiers, raw/normalised counts, classification counts, warnings, attribution, prior provider failures and SHA-256 checksum. The downloadable JSON snapshot includes classified feature geometries so a review state can be preserved locally. Live project snapshots must not be committed.

Presentation grouping does not alter the source snapshot. The renderer records all contributing source identifiers on each generalised presentation feature and groups only connected features with the same class and returned identity. Disconnected same-name ways remain separate.

Provider order is `overpass-api.de`, `overpass.kumi.systems`, then `overpass.private.coffee`, with a bounded timeout per endpoint. Network, timeout, HTTP, malformed and all-provider-failed states are warnings/errors, not zero results. A valid response with an empty `elements` array is the only zero-feature state.

## Licensing

OSM-derived data must retain `Map data (c) OpenStreetMap contributors, ODbL 1.0` on the drawing. OSMF tile-policy controls applied in C3 are: exact official URL, visible attribution, native browser referer/user agent and caching, no prefetch/offline archive/bulk scan, a replaceable provider, fixed zooms and an 80-tile viewport cap. Automated tests intercept every tile. Nominatim, public Overpass and public OSM tiles have no availability SLA; production-scale use requires an approved provider or self-hosted service.
