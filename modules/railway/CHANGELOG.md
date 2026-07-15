# Changelog

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
