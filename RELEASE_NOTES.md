# Toolkit 2.1.0 production release

> Toolkit 2.3.0 is a deployed review build introducing EAS corporate browser theming, coordinate-only Google Maps verification and Copy coordinates controls. It remains unmerged pending workstation acceptance.

> A Toolkit 2.2.0 emergency corrective build is available on its review branch only. It must not be merged until Product Owner acceptance. See `docs/EMERGENCY_SHARED_LIBRARY_CORRECTIVE_REPORT.md`.

Builds: `TPT-SHARED-210-20260716`, `DASH-1.1.0-20260716`, `AA-1.3.0-20260716`, `RAIL-4.5.0-20260716`, `BUS-PROD-120-20260716`, `SHARED-LIB-1.1.0-20260716`.

Adds Railway in-module publishing, Bus route/service review, Railway-matched Bus site confirmation, paragraph-based wording, DOCX paragraph preservation and consistent “Ready to use” Dashboard tags. STATS19 remains unchanged.

## Previous release: Toolkit 2.0.0

Builds:

- Toolkit `TPT-SHARED-200-20260716`
- Bus `BUS-PROD-110-20260716`
- Shared Library `SHARED-LIB-1.0.0-20260716`

This release completes Sprint 4 Bus polish and introduces the approved interim shared-company-library architecture. Shared masters are readable without authentication. A locally entered fine-grained GitHub token enables allowlisted publication to the three approved knowledge files only.

Bus wording now refreshes automatically. The Bus Service Summary contains Route, Operator, Origin / destination, Principal locations, Operating period and Service pattern; it does not export a bare weekday-frequency column.

Accessibility AA-1.2.0, Railway RAIL-4.4.0, STATS19 STATS-1.0.0 and Dashboard DASH-1.0.0 behaviour remain protected.

Known limitations:

- The fine-grained token approach is an approved interim no-backend design; connected editors must protect and periodically review their token.
- Stop discovery continues to use controlled OSM fallback where direct NaPTAN infrastructure is unavailable; assisted research verifies identifiers.
- Local drafts remain browser-scoped until successfully published or manually exported.
- Automated DOCX structural and download testing passed. Final visual review in Microsoft Word is explicitly deferred to planner acceptance testing.
# Toolkit 2.4.0 — Library Manager

The Dashboard now opens a minimum safe Library Manager for the three shared transport libraries. Shared records remain readable without a token; maintenance stays local until reviewed and published using the existing Toolkit GitHub connection. Bus Stop records link directly to unambiguous composite Bus Route records. Research requests are mode-specific and generic “check website/timetable” responses are blocked from verified imports.
# Toolkit 2.5.0 — Research quality and validation

Railway and Bus research exports now carry one shared self-contained authoritative-source standard. Completed imports reject instructional placeholders, quarantine fully audited unresolved findings for review, accept sourced factual negatives, and block incomplete or ambiguous proposals from Shared Library publication.
