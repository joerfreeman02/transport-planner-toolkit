# ADR-008: Drawing Generator spatial rendering

- Status: Proposed
- Date: 2026-08-14
- Owner: AI Engineering Toolkits programme / Product Owner

## Context

DG-0 must compose four fixed-scale A3 planning drawings while retaining an interactive editing map. A Leaflet screenshot does not provide a defensible relationship between projected metres and physical paper dimensions, and historic precedent PDFs are visual references rather than geospatial sources.

## Options

1. Print the Leaflet map at a selected zoom.
2. Render all issued geometry as projected SVG using a pure physical scale engine.
3. Add a server-side GIS/CAD/PDF service.

## Decision

Use Leaflet/Leaflet.draw only for editing and review. Compose the issued map as deterministic SVG after transforming approved structured vectors to EPSG:27700. Calculate the projected map extent from the mode's physical frame dimensions and fixed denominator. Use an explicit A3 landscape HTML/CSS sheet and browser Print / Save PDF for DG-0. Keep provider, railway-classification and overlay adapters isolated.

## Consequences

Scale/extent are testable and raster pixels do not determine geometry. The static module remains deployable on GitHub Pages without a service dependency. C2 adds restrained structured OSM context inside the same projected SVG and deterministic collision/repetition control; it does not add raster tiles to the issued sheet or an authoritative hosted-data dependency. More advanced curved label placement and authoritative source adapters remain deferred. Proj4 precision, browser print settings and public-provider availability remain documented constraints. This ADR is Proposed pending Product Owner review and does not establish a cross-tool shared spatial package.
