# ADR-008: Drawing Generator spatial rendering

- Status: Proposed
- Date: 2026-08-14
- Owner: AI Engineering Toolkits programme / Product Owner

## Context

DG-0 must compose four fixed-scale A3 planning drawings while retaining an interactive editing map. A Leaflet screenshot does not provide a defensible relationship between projected metres and physical paper dimensions, and historic precedent PDFs are visual references rather than geospatial sources.

## Options

1. Print the Leaflet map at a selected zoom.
2. Render all issued geometry as projected SVG using a pure physical scale engine.
3. Use a hybrid SVG containing individually projection-placed raster tiles beneath controlled projected vectors.
4. Add a server-side GIS/CAD/PDF service.

## Decision

Use Leaflet/Leaflet.draw only for editing and review. Compose the issued map as hybrid SVG: individually transform rendered OSM Standard XYZ tiles into the exact EPSG:27700 view, then draw approved structured vectors above them. Calculate the projected map extent from the mode's physical frame dimensions and fixed denominator. Keep tile, Overpass, railway-classification and overlay adapters isolated. Use an explicit A3 landscape HTML/CSS sheet and browser Print / Save PDF for DG-0.

## Consequences

Scale/extent and every tile transform are testable; raster pixels provide context but never determine professional geometry. The static module remains deployable on GitHub Pages without a service dependency. C3 replaces the unsuccessful Overpass pseudo-basemap with recognizable OSM Standard raster cartography, fixed z13/z17 tile manifests, an 80-tile cap, visible attribution, failure-safe print blocking and fully mocked automation. It adds a public-provider runtime dependency for the basemap and therefore requires policy-compliant human viewport use and a future production-provider decision. More advanced label placement and authoritative source adapters remain deferred. This ADR is Proposed pending Product Owner review and does not establish a cross-tool shared spatial package.
