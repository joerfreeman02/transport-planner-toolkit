# ATLAS 2.0 architecture

Status: Alpha.1 engineering baseline  
Version: `2.0.0-alpha.1`  
Build: `ATLAS-2.0.0-alpha.1-20260824`

## Purpose

ATLAS progressively establishes transport facts through deterministic retrieval, calculation and validation against authoritative data. AI is not needed to establish factual evidence. A future optional drafting layer may consume locked, verified Evidence, but must not silently introduce new factual claims.

Alpha.1 is additive. The existing Toolkit dashboard and legacy modules remain the recoverable product while ATLAS modules are introduced and accepted through controlled increments.

## Permanent product-language requirement

ATLAS must speak transport-planner language, not software language. Normal workflows must present the site, assessment action, professional result, source, checked time, status and relevant cautions without requiring knowledge of APIs, endpoints, schemas, adapters, caches, HTTP or other implementation details.

Technical provenance remains available through progressive disclosure for audit and diagnosis. This presentation rule does not weaken the Site, Evidence, source-adapter, freshness or failure contracts described below. The formal non-technical planner usability test is defined in [UX-PRINCIPLES.md](UX-PRINCIPLES.md).

## Alpha.1 structure

```text
/atlas/ browser shell
    |
    +-- Site confirmation workflow
    |       +-- Nominatim geocoding adapter
    |
    +-- nearby-stop workflow
            +-- TfL StopPoint adapter
                    |
                    +-- generic Evidence records

/src/atlas/domain          Site and Evidence invariants
/src/atlas/adapters        source-specific translation and provenance
/src/atlas/infrastructure  HTTP failure modes and conservative cache contract
```

The UI imports adapters; it does not contain source parsing or transport calculations. Adapters return explicit result envelopes for success, failure, timeout, invalid response, source unavailability, provenance, retrieval time and cache state.

## Domain boundaries

### Site

`Site` is transport-module independent. It retains the supplied address, display address, WGS84 coordinates, geocoder identity and record, source endpoint/query, retrieval time, validation state, warnings and errors. A candidate is not usable for transport evidence until the user explicitly confirms it.

Future Bus, Rail, Accessibility, STATS19 and Drawing work should consume the same confirmed Site concept rather than independently resolving locations.

### Evidence

`Evidence` represents one controlled fact. It retains subject, evidence type, value and units; authoritative source, record and endpoint; retrieval and source dataset time/version where available; calculation method; validation and confidence; warnings; and freshness/cache metadata.

Missing source metadata is not invented. An unavailable value must use an explicit controlled state.

### Source adapters

The small adapter boundary converts external source records into ATLAS domain objects. Alpha.1 implements only:

- Nominatim address search and explicit candidate confirmation;
- TfL nearby public bus/coach/tram stop retrieval;
- straight-line distance calculated with the Haversine formula;
- deterministic fixtures for normal tests.

Future TfL, NaPTAN, BODS, National Rail, Network Rail and STATS19 adapters can implement the same boundary without changing UI ownership of facts.

## Freshness and failure rules

- Live results are labelled live/current with their retrieval time.
- A cache hit is labelled cached/valid and retains its original retrieval time.
- Alpha.1 uses conservative operational TTLs, not approved transport methodology.
- A stale cache is reported but never silently substituted after a live-source failure.
- Timeout, HTTP error, invalid payload, empty result and unavailable source remain distinct states.
- The browser contains no TfL key, other secret, authentication or AI dependency.

## Application shell

## Maintenance reuse rule

Maintenance work must first audit and reuse the existing source-adapter, prepared-data, assessment-warning, validation and deployment-status paths. A corrective change may adapt those boundaries when the existing contract is insufficient, but must not create a parallel diagnostics, fallback or deployment system without explicit architectural approval.

`/atlas/` is independent from the legacy dashboard and provides Report Builder, Modules and Projects navigation. Only the Bus authoritative-data proof is active. Other statuses are deliberately honest: legacy, migration planned, planned, or WIP/legacy.

Report generation, frequency analysis, timetables, professional route grouping, other module migrations, authentication and a backend are outside Alpha.1.

## Legacy and Shared Library

No protected legacy module file is changed by Alpha.1. The isolation test compares twelve protected path groups with baseline `551b7cbf6646e72f21842bf77b93633373a9cac2`.

The Shared Library is not deleted. Its eventual role should move away from volatile Bus/Rail facts and toward stable methodology or configuration where justified. Existing functionality remains recoverable until replacements are accepted.
