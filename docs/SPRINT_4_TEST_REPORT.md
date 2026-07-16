# Sprint 4 Bus Foundation — Superseded BUS-0.1.0 Test Report

> BUS-0.1.0 was rejected by the Technical Director. This report is retained as historical evidence and is superseded by `SPRINT_4_CORRECTIVE_REPORT.md`.

**Build:** TPT-BUS-190-20260716  
**Bus module:** BUS-0.1.0 / BUS-FOUNDATION-010-20260716  
**Starting baseline:** `f6f603f`  
**Test date:** 16 July 2026  
**Status:** Release candidate; Technical Director production approval not yet recorded

## Automated results

- Foundation engine suite: 13/13 passed.
- Shared Word export assertions: 13/13 passed.
- Foundation/file/identity regression: passed.
- Shared contract catalogue: 6/6 version 1.0.0 contracts parsed and passed.
- Bus domain/schema suite: 8/8 passed.
- Accessibility classification regression: 6/6 passed.
- Railway protected regression suite: 27/27 passed.
- `git diff --check`: passed after whitespace correction.
- Frozen module folder diff from `f6f603f`: no Accessibility, Railway or STATS19 source-file changes.

## Browser results

Environment: Codex in-app Chromium browser, local HTTP build.

### Dashboard

- Bus card appears as a release candidate and opens the module.
- TPT 1.9.0 and DASH-1.0.0 identities are visible.

### Bus Assessment

- Module loads without console errors.
- Leaflet map renders with zoom controls and OpenStreetMap attribution.
- UK address search returned selectable results.
- Selecting a result placed the site marker and enabled confirmation.
- Confirming the site enabled nearby-stop discovery.
- Live Overpass discovery returned mapped and tabulated stops.
- Stable source identifiers prevented exact duplicate records while same-name directional boarding points remained separate.
- Directional service entry accepted route, operator, direction, destination, representative period, frequency and source.
- Unsafe non-HTTP source protocols are rejected by domain validation.
- Save action displayed: “Your Bus Assessment record has been saved in this browser.”
- Sources and retrieval dates were displayed.
- Professional-draft CSV/Word controls were present; output includes release/schema/review metadata.

### Frozen-module smoke tests

- Accessibility AA-1.2.0 loaded with address, interactive map, site confirmation, facility discovery and export controls; no console errors.
- Railway RAIL-4.4.0 loaded with address, map pan/zoom, marker/site controls, station routing, research, sources and export controls; no console errors.
- STATS19 loaded with workbook import and record-card workflow; no console errors.

## Known limitations

- BUS-0.1.0 is a foundation release candidate, not a complete timetable platform.
- OpenStreetMap frequently lacks explicit stop direction; these values remain visibly “Direction not stated” until verified.
- Service/operator/frequency evidence is currently planner-entered and must be verified against current authoritative sources.
- Provider availability and source coverage affect candidate discovery; provider failure is not interpreted as no stops.
- Live professional acceptance on two representative company projects remains required before production approval.
- Full supported-browser, screen-reader and performance evidence remains required for the release decision.

## Release recommendation

The implementation is suitable for controlled planner acceptance testing. It must remain a release candidate until the outstanding professional, browser/accessibility and Technical Director release gates are completed.
