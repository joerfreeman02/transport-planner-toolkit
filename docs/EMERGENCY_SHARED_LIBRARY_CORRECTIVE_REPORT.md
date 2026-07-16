# Emergency shared-library corrective release

**Date:** 16 July 2026  
**Status:** Product Owner review build; not approved for merge  
**Toolkit:** 2.2.0 (`TPT-SHARED-220-20260716`)

## Root cause

Railway fetched the shared Rail master only to display its count. It never merged `rail-library.json` records into the library used by station matching, which remained the browser-local `tpt.rail.knowledge.v3` overlay. Bus loaded the shared stop and route masters, but its service review read only browser-local stop-route relationships. Dashboard counts therefore proved file access, not module consumption.

## Correction

The reusable shared client now validates each schema, requests timestamped/no-store masters independently, retains the last valid master, isolates per-file failures and reports network, cache, zero-record, rejected-schema and failure states. Railway builds an effective library from shared records plus the local overlay and matches stations against it. Bus matches discovered stops to shared stops and derives route-review records from shared stop/route relationships. No token is required to read; token handling and the publication allowlist are unchanged.

Bus now reports nine real stages: locating site; discovering stops; cleaning/pairing; walking routes; cycling routes; shared-stop matching; shared-route matching; rendering; complete. Discovery retains three sequential Overpass providers with firm timeouts and distinguishes provider failure from zero results. Accessibility results, marker popups and exports include coordinate-based Google Maps verification links.

## Acceptance evidence

Automated isolated Chromium contexts clear localStorage/sessionStorage and open module URLs directly. Deterministic St Margarets and Balaam Street fixtures proved Railway verified-field reuse and Bus stop/route reuse without a token or local overlay. Separate browser tests cover valid-cache fallback, rejected/failed masters and Accessibility link security. Static and automated regression suites cover Dashboard navigation, Railway, Bus, Accessibility, STATS19 opening, contracts and Word exports.

Physical second-workstation/second-network, Safari and manual visual/Word inspection remain Product Owner acceptance items. No master JSON file is changed by this corrective branch.
