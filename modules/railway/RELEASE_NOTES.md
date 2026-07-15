# Release notes — RAIL-4.1.0-20260715

## Assisted-research identifier integrity fix

- Completed-research imports now preserve authoritative identifiers supplied at the outer station-record level when the nested completed record still contains blank placeholders.
- CRS, NaPTAN, TfL, other and OSM identifiers are merged field-by-field, preferring a populated nested value and otherwise retaining the populated outer value.
- Automated regression coverage now reproduces the blank-nested-identifier case and verifies that every researched identifier survives normalisation.
- The full RAIL-4.0.1 discovery, mapping, routing, station inclusion, research export/import, Knowledge Library and Transport Statement output functionality is retained.
