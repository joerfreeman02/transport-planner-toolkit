# Release notes — RAIL-4.0.1-20260715

## Import compatibility fix

- Completed-research imports now accept both the canonical top-level `fields` layout and the self-instructing workflow layout where the completed knowledge record is stored under `existingRecord`.
- Nested records are normalised before schema validation, identifier matching and safe merge.
- Existing completed JSON files produced from RAIL-4.0.0 can be imported without manual editing.
- All previous Railway discovery, mapping, routing, outputs and knowledge-library behaviour is retained.
