# DG-0 data-source register

All automatic drawing content is structured vector evidence. The Leaflet editing basemap is excluded from print; issued context is a restrained subset of the checksummed OSM vector snapshot projected into the exact drawing extent.

| Layer | Provider/retrieval | Classification | Attribution | Failure/manual fallback |
|---|---|---|---|---|
| Address centre | OpenStreetMap Nominatim JSON search, deliberate user action | Selected result supplies WGS84 centre only | OpenStreetMap contributors | Enter coordinates manually. Never creates a boundary. |
| Issued contextual areas/places | OSM through Overpass; selected `landuse`, `natural` and `place` tags | Pale `context-area` polygons and collision-managed `context-place` labels beneath controlled overlays; excluded from legend | OpenStreetMap contributors, ODbL 1.0 | The sheet remains usable with reviewed overlays and a visible source warning; no raster screenshot fallback. |
| Issued contextual roads | OSM through Overpass; secondary/tertiary ways for all modes, plus residential/unclassified/living-street ways for local modes | `context-road-major` / `context-road-minor`; pale, unlabelled and excluded from legend | Same | Same; local street density is deliberately not requested for regional output. |
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

The generated Overpass query and exact BNG-derived WGS84 bounding box are recorded with provider endpoint, UTC retrieval time, drawing build/type, source identifiers, raw/normalised counts, classification counts, warnings, attribution, prior provider failures and SHA-256 checksum. The downloadable JSON snapshot includes the classified feature geometries so a review state can be preserved locally. Live project snapshots must not be committed.

Presentation grouping does not alter the source snapshot. The renderer records all contributing source identifiers on each generalised presentation feature and groups only connected features with the same class and returned identity. Disconnected same-name ways remain separate.

Provider order is `overpass-api.de`, `overpass.kumi.systems`, then `overpass.private.coffee`, with a bounded timeout per endpoint. Network, timeout, HTTP, malformed and all-provider-failed states are warnings/errors, not zero results. A valid response with an empty `elements` array is the only zero-feature state.

## Licensing

OSM-derived data must retain `Map data (c) OpenStreetMap contributors, ODbL 1.0` on the drawing. Nominatim and public Overpass services are used without an availability SLA; production-scale/bulk use would require an approved hosted provider or self-hosted service and an explicit usage-policy review.
