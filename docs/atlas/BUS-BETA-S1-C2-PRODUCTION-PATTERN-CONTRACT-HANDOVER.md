# BUS-BETA-S1-C2 — Production route-pattern contract

Date: 2026-10-16  
Status: Engineering correction complete; manual acceptance remains pending  
Branch: `codex/atlas-bus-beta-s1-c2-production-pattern-contract`  
Starting SHA: `ddb3c0e6e541c0463ddf38f69b77f191a0a0b5db`  
Version/build: `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`  
Final implementation SHA: `99d879231d3f5af608707aabeba53f81d9e5df77`.

## Root cause and discovery

C1's test read a Pipers BODS record from the repository's 2026-09-04 prepared v1 snapshot. That historical shard contains timetable schedules but predates the builder's ordered-pattern field. The test then manually injected `routePatternStopIds`, which was not evidence delivered by that shard.

The production preparation code already carries the needed deterministic evidence. `tools/atlas-bus-data/build_static_index.py` walks ordered GTFS `stop_times.txt`, resolves each physical stop by exact ATCO/NaPTAN identity, retains unresolved source calls as explicit GTFS identities, and emits the ordered sequence as `circularPatternStopIds`. The field is written on prepared service objects and copied into service shards. The BODS builder deliberately keeps this full-pattern field separate from its existing `routePatternStopIds` planner contract.

The TNDS TransXChange adapter already emits `routePatternStopIds` from ordered JourneyPattern timing links, plus the associated `patternVariants`. `normalisePreparedService` preserves both BODS and TNDS pattern fields; `scopedScheduledService` spreads the normalized service and narrows only schedules, so the ordered sequence reaches `mergeBusTimetableSources` unchanged.

## Correction and contract

No production code or prepared schema change was needed. The existing BODS `circularPatternStopIds` field is reused by C1 arbitration; the existing TNDS `routePatternStopIds` field remains unchanged. The C1 Pipers regression now reads a bounded prepared-format BODS service fixture generated from an ordered GTFS fixture through the real `process_region`/`process_trip` preparation path. It does not inject or synthesize a pattern after loading the prepared record. The test also passes the record through `normalisePreparedService` before arbitration.

The fixture reproduces the governed Pipers 230 physical call sequence and loop-closing repeat, Centrebus operator, local Pipers StopPoint and a 15-departure Monday schedule. The paired TNDS record represents the governed Centrebus South shape with the terminal loop-closing StopPoint omitted and different endpoint wording. Arbitration retains one BODS service and its original departure population. The prepared TNDS-only route 231 remains available with TNDS provenance.

## Compatibility and limitations

- The current v1/v2 service payload is an open object record; `circularPatternStopIds` is an additive field and does not require a schema-version change. Runtime normalization and site scoping preserve it.
- The checked-in September 4 v1 BODS national snapshot is not rewritten or regenerated. It predates this field and still has no Pipers route-pattern evidence. Newly prepared BODS shards produced by the current builder include it. A future data refresh is needed before that historical bundled snapshot itself has the field at runtime.
- The Pipers BODS contract regression uses a bounded synthetic GTFS source fixture, built through the production preparation path, because the historical BODS source archive is not present locally. The TNDS 230 source record is likewise absent from the prepared TNDS pack; the paired case uses the closed R46-I1 governed shape. No national data was reacquired or reprocessed.
- No fuzzy matching, route-number-only suppression, national identity bridge, user-facing warning, timetable calculation change, or unrelated production behavior change was introduced. Version/build remains Alpha.15. R46-I1 remains closed.

## Changed files

- `tools/atlas-bus-data/test_build_static_index.py` — bounded builder-generated Pipers service and contract test.
- `tests/atlas/fixtures/pipers-bods-prepared-service.json` — small prepared-format service fixture emitted from the production GTFS builder path.
- `tests/atlas/bus-timetable-merge.test.mjs` — consumes the prepared BODS field through runtime normalization; removes the manual pattern injection.
- `docs/atlas/BUS-BETA-S1-C2-PRODUCTION-PATTERN-CONTRACT-HANDOVER.md` — this record.

## Verification

Commands and results:

- `python tools/atlas-bus-data/test_build_static_index.py` — passed, 19 tests (using the bundled Python runtime).
- `node tests/atlas/bus-timetable-merge.test.mjs` — passed, including production-shaped Pipers 230/231, no duplicate departure population, Browser BODS provenance, and source-neutral Word output.
- `node tests/atlas/prepared-bus-data-adapter.test.mjs` — passed, 13 tests.
- `node tests/atlas/tnds-transxchange.test.mjs` — passed.
- `node tests/atlas/alpha15-production-fidelity.test.mjs` — passed.
- `node tests/atlas/alpha15-planner-service-group.test.mjs` — passed.
- `node tests/atlas/bus-ui-contract.test.mjs` — passed.
- `node tests/atlas/bus-word-export.test.mjs` — passed.
- `node tests/atlas/run-all.mjs` — passed; `ATLAS Alpha.15 deterministic suite passed.`
- `git diff --check` — passed; Git emitted only its LF-to-CRLF notice for the rewritten merge test.

## Disposition

No merge, PR, release, or Beta declaration. Recommend Product Owner manual acceptance only after reviewing the updated prepared-pattern evidence path and the bounded Pipers regression.
