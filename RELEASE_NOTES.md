# Release Notes — Sprint 4 Bus Foundation 1.9.0 release candidate

## Sprint 4 purpose

Establish Bus Assessment as the reference architecture for future transport modes while formalising shared contracts and protecting frozen baselines.

## Sprint 4 additions

- BUS-0.1.0 release-candidate workflow for site confirmation, mapped stop discovery, directional stop/service evidence, local save and professional-draft exports.
- Shared contract version 1.0.0 for mapping, export, diagnostics, Project Data Model context, module outputs and Knowledge Library records.
- Bus schema 1.0.0 and ADR-001 to ADR-007.
- Controlled identities DASH-1.0.0 and STATS-1.0.0.

## Review status

This is not approved for production until automated tests, frozen-baseline browser regression, professional acceptance and Technical Director release approval are recorded.

---

# Previous release — Sprint 3 Formatting and Exporting 1.7

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
