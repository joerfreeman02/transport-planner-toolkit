# ADR-011: Prepared national bus data for the static ATLAS application

- Status: Accepted for Alpha.4 engineering implementation; Product Owner acceptance pending
- Date: 2026-09-04
- Owner: EAS Technical Director / Product Owner

## Context

NaPTAN is the authoritative national stop source and BODS the authoritative English local-bus timetable source, but their bulk datasets are too large for each planner assessment and NaPTAN has no suitable public radius endpoint. ATLAS is deliberately static, zero-recurring-cost software and cannot expose an employee credential in browser code.

## Options

1. Load national raw files in every browser assessment.
2. Add a hosted spatial database/backend.
3. Depend on a third-party paid nearby-stop/timetable service.
4. Transform official bulk files into controlled, browser-sized static indexes.

## Decision

Use option 4. A deterministic build transforms official NaPTAN CSV and nine public BODS regional GTFS downloads into gzip-compressed spatial stop cells and stop-ID-prefix service shards. The browser fetches a small manifest and only relevant shards. Input hashes, feed validity, representative dates, conversion methods and preparation time are retained. No raw bulk download or secret is delivered to users.

## Consequences

ATLAS remains static, authoritative, auditable, AI-independent and free of recurring software cost. Normal use requires no account or key and avoids 100 MB+ browser downloads. The repository gains a controlled prepared snapshot (about 80-90 MB) and a refresh obligation: rebuild from official sources at least when the eight-day warning is reached and before formal assessment if currentness is material. Static hosting must serve `.json.gz` files without altering their bytes; the browser performs gzip decompression. A future backend requires a superseding ADR and evidence that this approach no longer meets requirements.
