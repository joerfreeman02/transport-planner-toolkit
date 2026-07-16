# BUS-1.0.0 review release

Build: `BUS-RESET-100-20260716`

This Sprint 4 review build provides the first complete Bus Assessment vertical workflow. It remains isolated to `modules/bus/` and is not approved for `main`.

Known limitations:

- Browser stop discovery uses OSM with mapped NaPTAN/ATCO identifiers when present. Assisted research must verify identifiers before permanent reuse.
- External address, stop and routing providers can be unavailable or throttled; failure is visible and routing falls back to clearly labelled estimates.
- Knowledge Library data is stored in the current browser and should be exported for controlled backup/transfer.
- Research quality remains dependent on primary-source availability and completed JSON validation.

