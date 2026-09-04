# ATLAS SITE-1 test record

Date: 2026-08-24

Version/build: `2.0.0-alpha.2` / `ATLAS-2.0.0-alpha.2-20260824`

## Automated results

- 55 deterministic checks passed: Site 10, Site Selector 7, Evidence 6, source adapter 7, Nominatim 9, TfL 8, legacy isolation 1 and review environment 7.
- Focused SITE-1 browser workflow passed: map load, zoom controls, candidate centring, marker drag, map click, coordinate validation, confirmation, original-coordinate preservation, failed-search fallback, moved-point TfL request and stale Bus-evidence clearing.
- ATLAS browser smoke, planner UX and DEV-ENV browser suites passed with no page, console or local-request failures.
- Planner visual checks passed at 1440×1000 and 1024×768; the map measured at least 650×420 and 500×390 respectively.
- The actual `OPEN ATLAS REVIEW.bat` launcher opened Alpha.2 on loopback port 8769; the normal stop workflow remains available.
- All 12 protected legacy path groups still match baseline `551b7cbf6646e72f21842bf77b93633373a9cac2`.

## Required Product Owner regression

Deterministic input: `first floor millers house stanstead abbotts`

The strict mocked request returns no result. SITE-1 then issues the generic building-level variant `millers house stanstead abbotts`; a supplied fixture candidate is shown as an unconfirmed possible match. No Millers House coordinate is hard-coded in application code.

## Live sources

- Live Millers House check: both strict and building-level queries returned HTTP 200. The strict query returned no candidate; the building-level query returned one current candidate: `The Millers House, The Maltings, The Maltings Business Centre, Stanstead Abbots, ... SG12 8HN`, source `way/312644191`, at `51.78793, 0.0088092`. Planner map review and confirmation remain mandatory.
- Live Crystal Palace control: Nominatim resolved `33, Westow Street ... SE19 3RW`; TfL returned HTTP 200 and 31 nearby-stop records.
- Live browser CORS workflow: three Nominatim HTTP 200 responses and one TfL HTTP 200 response; 31 evidence rows; no failed source requests or page errors.

Live results record provider behaviour at the stated date and are not permanent factual guarantees.

## Manual visible review

The launcher page displayed Alpha.2 and the interactive map. The in-app review surface could not complete its own live Nominatim call during the visible check, and the designed fallback remained usable: the complete Product Owner description was retained, map click produced `Chosen on map`, and confirmation became available. Independent normal Chromium and Node live checks succeeded as recorded above.
