# ATLAS Bus Alpha.16 — NPTG Enrichment Contract

Status: design seam only. NPTG is not integrated into Alpha.16 and must not be acquired, cached, or used by the current planner.

## Boundary

The future presentation seam is:

```js
resolvePublicDestination(existingEvidence, optionalLocalityEvidence)
```

It may return a clearer public destination or locality label only when the existing service evidence remains authoritative and the optional locality evidence is deterministic. The result should carry the selected value, a qualifier where needed, confidence, and provenance. If the locality evidence is absent, stale, ambiguous, or conflicting, the existing evidence is retained.

NaPTAN identifies stops. BODS/TNDS and the existing timetable adapters identify services, operators, calendars, frequencies, route patterns, and source lineage. NPTG may enrich locality wording only; it is not a service, timetable, operator, or inclusion source.

## Alpha.16 invariants

Adding or removing NPTG must not change:

- discovered stops, assessed services, source-service count, route-family membership, or short-working consolidation;
- operator, calendar, frequency, timetable pattern, departure population, or service-note conclusions;
- source provenance, raw evidence, review status, or the decision to include/exclude a service;
- browser output versus Word output, apart from the explicitly enriched presentation label.

No NPTG field may be used to infer a missing timetable, repair a source identity, promote a review-required row, or suppress a route. The planner remains responsible for inclusion and service logic.

## Future updater and safety gate

The updater should use an authoritative DfT NPTG release with recorded release metadata, schema version, retrieval time, checksum, and source URL. Load into a staging snapshot, validate schema and key relationships, reject malformed or duplicate identifiers, and run non-triviality and catastrophic-collapse checks against the previous good snapshot. A failed or suspicious update remains quarantined; the previous good snapshot stays active and the diagnostic exposes age, status, and failure reason. Promotion must be isolated from the live planner and must never mutate timetable datasets.

Cadence should be configurable and observable rather than hard-coded into the planner. The updater must be idempotent, retain the previous-good snapshot, and make rollback a snapshot selection rather than a destructive rewrite.

## A/B acceptance suite

Run the same Alpha.16 assessment twice: once without NPTG and once with the staged NPTG snapshot. Compare service counts, route families, operators, calendars, frequencies, departure populations, source IDs, review items, and inclusion decisions. The only permitted differences are the documented public destination/locality presentation fields and their enrichment provenance. Include missing, stale, ambiguous, conflicting, duplicate, and catastrophic-collapse fixtures; all must fall back safely to existing evidence.
