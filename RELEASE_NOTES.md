# Release Notes - Sprint 3 Formatting and Exporting 1.7

## Purpose

This release aligns the Accessibility and Railway report-table exports with the EAS 2026 Word template while retaining the accepted Railway functional baseline.

## Baseline retained

- Accessibility discovery, classification, mapping and routing
- STATS19 Collision Record Cards existing working tool
- Railway 4.2.1 map, movable site marker, walking/cycling routes, station de-duplication, directional TPH, research and Knowledge Library behaviour
- Bus Assessment placeholder

## Added

- Accessibility category heading rows that explain the differing facility-distance groups
- Railway step-free access ticks/crosses and per-station service/journey summary rows
- Separate Railway directional-TPH Word export
- Shared EAS 2026 table formatter used by both modules
- Rich Word-table copy with a plain-text fallback
- Genuine `.docx` downloads with A4 page settings, Roboto typography, orange headers and alternating grey rows
- Accessibility local-facilities report table
- Railway station-access and directional service-summary report tables
- Cross-module export regression tests

## Not changed

This sprint does not alter station discovery, map interaction, route plotting, classification, assisted research or library merge logic.
