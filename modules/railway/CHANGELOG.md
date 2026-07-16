# Changelog

## RAIL-4.5.0-20260716

- Added in-module shared publication, refresh and status reporting.
- Split access/service wording into copy-ready paragraphs preserved in DOCX.

## RAIL-4.4.0-20260715

- Added a step-free access tick/cross column to the service-summary export.
- Added a service-pattern and journey-opportunities summary row after each station.
- Added a separate directional trains-per-hour Word export.

## RAIL-4.3.1-20260715

- Restored map and address controls by loading the repository-hosted map runtime instead of the unavailable external CDN script.

## RAIL-4.3.0-20260715

- Added shared EAS 2026 Word-compatible Access and Service table exports.
- Added rich clipboard export and genuine downloadable Word `.docx` output.
- Applied Roboto typography, orange headers, white header text, pale-grey banding and compact black rules derived from the EAS 2026 Word template.
- Preserved the frozen Railway 4.2.1 discovery, mapping, routing, deduplication, research and Knowledge Library behaviour.

## RAIL-4.2.1-20260715

- Marked as the stable frozen Railway baseline after successful user acceptance testing.
- Replaced the incomplete local Leaflet-compatible substitute with the full Leaflet 1.9.4 runtime already proven in Accessibility.
- Restored map panning, wheel/touch zooming, zoom controls, draggable site-marker behaviour and responsive map resizing.
- Corrected route-layer bounds and added explicit feedback when only an estimated distance exists and no route geometry can responsibly be plotted.
- Deduplicated station features by reliable identifier or normalised station name, mode and 300 m proximity while retaining separate rail modes.
- Added regression coverage for the map engine, route layers and station deduplication.

## RAIL-4.2.0-20260715

- Added top-level Assessment, Sources, and Research & Library tabs.
- Added dedicated walking, cycling, combined-route, fit-map, return-to-site, and clear-route controls.
- Replaced user-facing JSON frequency editing with readable direction/destination, TPH, and service-note rows.
- Simplified station review cards and moved source links into a consolidated Sources register.
- Kept research exchange and Knowledge Library controls out of the assessment review.
- Added persistent, accessible confirmation after saving a station record.
- Retained protected Knowledge Library merges and automatic pre-import backups.

## RAIL-4.1.0-20260715

- Fixed completed-research normalisation so blank nested identifiers cannot erase populated authoritative identifiers supplied by the completed research response.
- Added regression coverage for CRS, NaPTAN, other and OSM identifier preservation.

## RAIL-4.0.1-20260715

- Fixed completed research import error: `Record fields are required.`
- Added compatibility normalisation for `existingRecord.fields`.
- Added regression coverage for nested completed records.

## RAIL-4.0.0-20260714

- Added v2 assisted-research workflow and structured frequency schema.
