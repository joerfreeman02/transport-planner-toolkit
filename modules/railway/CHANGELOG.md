# Changelog

## RAIL-4.1.0-20260715

- Fixed completed-research normalisation so blank nested identifiers cannot erase populated authoritative identifiers supplied by the completed research response.
- Added regression coverage for CRS, NaPTAN, other and OSM identifier preservation.

## RAIL-4.0.1-20260715

- Fixed completed research import error: `Record fields are required.`
- Added compatibility normalisation for `existingRecord.fields`.
- Added regression coverage for nested completed records.

## RAIL-4.0.0-20260714

- Added v2 assisted-research workflow and structured frequency schema.
