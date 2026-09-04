# ADR-009: ATLAS 2.0 data-led foundation

- Status: Accepted for Alpha.1 engineering implementation
- Date: 2026-08-24
- Decision owner: Technical Director

## Context

The legacy Toolkit includes proven modules, manually maintained knowledge and experimental work at different acceptance levels. Volatile transport facts can become outdated, and AI-led research cannot provide a deterministic, reproducible evidence chain by itself.

The verified pre-ATLAS baseline is GitHub `main` at `551b7cbf6646e72f21842bf77b93633373a9cac2`. Bus 1.5.0 is intentional and stable; Drawing Generator remains WIP/live review.

## Decision

ATLAS will progressively replace AI-led factual transport research and manually maintained volatile transport knowledge with deterministic retrieval, calculation and validation from authoritative transport datasets.

AI is not required to establish factual transport evidence. Future optional AI may consume locked and verified ATLAS Evidence for drafting or presentation, but must not silently introduce new factual claims.

ATLAS will use shared transport-independent Site and Evidence models, with source-specific logic behind small adapters. Source errors, provenance, retrieval time, freshness and cache state are explicit. Stale evidence is never silently represented as live.

Development is additive under `/atlas/`; legacy modules remain untouched and recoverable until controlled migration and acceptance.

The Shared Library is not deleted in this increment. Its future role changes from volatile Bus/Rail facts toward stable methodology and configuration where justified.

## Consequences

Positive:

- factual evidence can be reproduced, tested and traced to its source;
- modules can reuse one confirmed Site and generic Evidence contract;
- source changes remain isolated from presentation code;
- mocked tests do not require public services;
- live-source limitations are visible rather than disguised.

Costs and constraints:

- authoritative services, licences, CORS, rate limits and change policies must be reviewed per adapter;
- source-specific freshness windows require approved methodology;
- a static browser cannot safely embed secret credentials;
- migration must remain incremental while legacy functionality is still required.

## Alpha.1 proof

The approved address is genuinely resolved through Nominatim, explicitly confirmed as a Site, and used to retrieve nearby stops from the official TfL Unified API. Returned stop facts are translated to Evidence and shown with source, endpoint, retrieval time, calculated distance, warnings and live/cache state.

No bus frequency, timetable, destination, route-grouping or report-prose claim is made.

