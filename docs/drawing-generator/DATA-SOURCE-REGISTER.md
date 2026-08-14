# DG-0 data-source register

All automatic drawing content is structured vector evidence. The editing basemap is visual context and is excluded from print.

| Layer | Provider/retrieval | Classification | Attribution | Failure/manual fallback |
|---|---|---|---|---|
| Address centre | OpenStreetMap Nominatim JSON search, deliberate user action | Selected result supplies WGS84 centre only | OpenStreetMap contributors | Enter coordinates manually. Never creates a boundary. |
| Main/A roads | OSM through Overpass POST; `highway=trunk/primary` and links | `main-road` | OpenStreetMap contributors, ODbL 1.0 | Provider state shown; reviewed LineString/MultiLineString overlay. |
| Motorways | OSM through Overpass; `highway=motorway` and links | `motorway` | Same | Reviewed line overlay. |
| Railway | OSM through Overpass; `railway=rail/subway/light_rail/tram` | `railway`, preserving rail type | Same | Reviewed line overlay. |
| Stations | OSM node/way/relation station evidence | Current TPT Railway `hasRailEvidence`/`modeForTags` semantics, adapted locally and equivalence-tested | Same | Reviewed point overlay; no unsupported mode is invented. |
| Cycle routes | OSM cycleways and bicycle-route relations | Local `cycle-route`; relation `strategic-cycle` with network retained | Same | Controlled cycle overlay and professional review. National/regional hierarchy remains source-dependent. |
| Waterways | OSM river/canal ways | Canal or explicit boat evidence → `waterway`; uncertain rivers → `waterway-review` warning | Same | Review-only evidence or controlled overlay; no navigability claim without evidence. |
| Bus routes | OSM bus-route relations, requested only in local modes | `bus-route`, label from ref/name | Same | Imported/drawn route group is the deadline-safe primary fallback; completeness is not claimed. |
| Community candidates | OSM selected amenity/shop tags, requested only in local modes | `community-candidate`; user must select before inclusion | Same | User draws/imports/adds a reviewed consideration. Automatic professional relevance is not claimed. |
| Site/routes/manual layers | User-supplied GeoJSON or Leaflet.draw | Validated controlled class/style | User evidence; no OSM attribution unless derived from OSM | User edits, hides or deletes. Route selection is always professional/user-controlled. |

## Query and snapshot

The generated Overpass query and exact BNG-derived WGS84 bounding box are recorded with provider endpoint, UTC retrieval time, drawing build/type, source identifiers, raw/normalised counts, classification counts, warnings, attribution, prior provider failures and SHA-256 checksum. The downloadable JSON snapshot includes the classified feature geometries so a review state can be preserved locally. Live project snapshots must not be committed.

Provider order is `overpass-api.de`, `overpass.kumi.systems`, then `overpass.private.coffee`, with a bounded timeout per endpoint. Network, timeout, HTTP, malformed and all-provider-failed states are warnings/errors, not zero results. A valid response with an empty `elements` array is the only zero-feature state.

## Licensing

OSM-derived data must retain `Map data (c) OpenStreetMap contributors, ODbL 1.0` on the drawing. Nominatim and public Overpass services are used without an availability SLA; production-scale/bulk use would require an approved hosted provider or self-hosted service and an explicit usage-policy review.
