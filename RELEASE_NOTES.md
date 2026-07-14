# Sprint 1 Review Build 1.0 — Release Notes

## Implemented
- Address/postcode geocoding and coordinate input
- Clickable and draggable site pin with mandatory confirmation
- Editable walking and cycling search radii
- One primary facility-data request with sequential mirror failover
- One optional wider-catchment extension
- Strict category-specific classification
- One nearest valid result per category
- Batch walking and cycling routing for speed
- On-demand route geometry on the map
- Manual add, edit, reject and include controls
- CSV export, copyable table and factual draft wording
- Diagnostics panel and bounded network timeouts
- No service-worker caching

## Automated checks completed
- JavaScript syntax check
- Strict GP classification rules
- Convenience-store category isolation
- Adult-learning exclusion from FE/sixth-form results
- Separation of National Rail, Underground, Overground and DLR
- Correct map tile convention and Leaflet initialisation order

## Not live-tested in this execution environment
The execution environment cannot make the same browser-side calls as the deployed GitHub Pages application. The first deployed urban-site test remains required.

## Known limitations
- OpenStreetMap completeness varies
- Public APIs can be rate-limited or blocked by corporate networks
- OS grid reference and What3Words input are deferred
- DOCX/PDF/map-image exports are deferred until the core result engine passes review
