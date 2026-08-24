# ATLAS SITE-1 architecture

Version: `2.0.0-alpha.2`

Build: `ATLAS-2.0.0-alpha.2-20260824`

Starting checkpoint: `8fd8fe94a6b623819ca3e779348f00206bed39fd`

## Shared Site Selector

SITE-1 establishes one reusable ATLAS Site before any downstream assessment begins. The application layer at `src/atlas/application/site-selector.mjs` controls selection, adjustment, confirmation and invalidation; the domain record remains in `src/atlas/domain/site.mjs`.

| Concept | Purpose |
|---|---|
| Site identity | Retains the planner's complete address, building name or site description and the selected provider address where applicable. |
| Geocoding evidence | Retains provider, record identifier, query, strategy, retrieval time and the original provider coordinates. |
| Assessment point | Retains the final latitude/longitude, establishment method, adjustment flag and confirmation time used by downstream modules. |

Top-level Site latitude/longitude deliberately mirror the final assessment point so existing Alpha.1 consumers remain compatible. They do not overwrite `site.geocoding.latitude` or `site.geocoding.longitude`.

## Address-search strategy

Search is explicit and rate-limited; there is no type-ahead. Ordered variants are deduplicated and stop at the first successful source response:

1. the complete planner query;
2. harmless spacing and numbered-street punctuation normalisation;
3. removal of recognised leading floor/unit/suite descriptors while retaining building name and settlement;
4. the existing conservative numbered-address locality reduction;
5. locality-only centring only after a removable descriptor and comma-separated locality were supplied.

ATLAS never invents a postcode, town or candidate. Broader results remain possible matches until the planner checks the map and confirms the assessment point.

## Map and manual fallback

The selector reuses the repository's local Leaflet 1.9.4 assets and the proven legacy behaviours: pan/zoom, map click, draggable marker, manual decimal coordinates and explicit confirmation. OpenStreetMap tiles are requested only for deliberate interactive review and retain attribution.

If search returns no match or is unavailable, the supplied description remains recorded and the planner can choose the point directly on the map. Manual coordinates are secondary progressive disclosure. Invalid world coordinates are rejected.

## Downstream gate

Bus controls are disabled until confirmation. A map click, marker drag or coordinate change returns the Site to an unconfirmed state, disables Bus, hides and clears earlier Bus evidence, and requires confirmation again. TfL requests use the final confirmed top-level coordinates.

## Legacy behaviour reused

- Local Leaflet runtime and OpenStreetMap mapping approach.
- Map click and draggable site marker interaction.
- Manual coordinate validation and marker synchronisation.
- Explicit confirmation before downstream work.

Legacy Accessibility files remain unchanged and protected by isolation tests.

## Known limitations

- One assessment point only; multiple pedestrian/vehicular accesses are outside SITE-1.
- No site-boundary drawing, reverse geocoding or project persistence.
- Address candidates and map tiles depend on current public source availability.
- A planner must still use professional judgement to choose the correct access point.
- Bus route/service discovery, Rail, Accessibility migration, Drawings, Report Builder and Projects remain outside this increment.
