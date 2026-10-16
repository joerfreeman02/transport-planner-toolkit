# BUS-BETA-S1-C1 — Local service-family arbitration correction

Date: 2026-10-16  
Status: Engineering correction complete; Product Owner manual acceptance recommended  
Branch: `codex/atlas-bus-beta-s1-c1-local-family-arbitration`  
Starting SHA: `988a5c6c30986d744957bea2ae57ff20a1f97358`  
Version/build: `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`  
Final implementation SHA: `02eec7e128bbb1e1de4283bd5057e93a646668ba` (pushed and verified; this is the source-and-ADR implementation commit).

## Correction

The site-scoped BODS/TNDS merger now requires the same normalized public route, the exact non-empty local called StopPoint set, a known compatible operator family using the planner's existing compatibility rule, and matching normalized ordered physical StopPoint patterns. A single terminal repeat is removed only when it closes a circular pattern. Conflicting circular classification, explicit opposite direction markers, or different published pattern variants keep records separate. Endpoint wording can differ only when the ordered physical corridor matches. Missing physical patterns or operator identity fail closed.

This is local source arbitration only. No national BODS↔TNDS identity graph, fuzzy matching, nearest-stop guess, route-specific production rule, or user-facing source warning was added. TfL authority, iBus, calendar/frequency handling, Word schema, and version/build remain unchanged. Wider warning/completeness UX cleanup remains a separate Beta-closeout task. R46-I1 remains closed.

## Pipers evidence and results

- **230:** the prepared BODS shard contains service `south_east:118723:0:b7eada5524c4`, Centrebus, route 230, and the local Pipers `021013518` departure schedule. The governed R46-I1 handover supplies the 34-call ordered pattern, including the repeated first/last StopPoint. The deterministic TNDS fixture represents the documented Centrebus South route 230 shape with that final closure call omitted and differing destination wording. The merger emits one local service with BODS provenance and the unchanged BODS departure population; the duplicate TNDS departures cannot inflate frequency.
- **231:** the prepared TNDS file `atlas/data/bus-tnds/services/231-se.json` contains South Beds Dial-a-Ride route 231. With no equivalent local BODS service, it remains available with TNDS provenance.
- **Bounded replay limitation:** the preserved prepared TNDS pack has no route 230 TNDS service record. The 230 regression therefore uses the governed R46-I1 source shape and actual prepared BODS departure record; no reacquisition, national reprocessing, or R46-I1 rerun was performed. Ordered pattern details come from `docs/atlas/BUS-CIRC-1B-HANDOVER.md`; the timetable shard itself stores departure schedules rather than route pattern IDs.

Negative coverage retains unrelated operators, different corridors, same-number records without the exact local stop set, reverse directions, short workings, differing pattern variants, circular conflicts, missing patterns, and under-specified identities. Existing browser/UI and Word tests confirm browser source provenance and source-neutral Word output.

## Changed files

- `src/atlas/domain/operator-family.mjs` — shared operator-family compatibility and tokenization rule.
- `src/atlas/domain/bus-planner-summary.mjs` — reuses the shared compatibility implementation.
- `src/atlas/domain/bus-timetable-merge.mjs` — strong ordered-corridor arbitration and BODS-first selection.
- `tests/atlas/bus-timetable-merge.test.mjs` — Pipers 230/231, departure de-duplication, provenance, and negative separation cases.
- `tests/atlas/tnds-transxchange.test.mjs` — confirms route/operator/endpoints without physical pattern are insufficient.
- `docs/adr/ADR-015-bus-timetable-source-authority-and-site-supplementation.md` — narrow contract update; no national identity decision.
- `docs/atlas/BUS-BETA-S1-C1-ARBITRATION-CORRECTION-HANDOVER.md` — this record.

## Verification

- `node tests/atlas/bus-timetable-merge.test.mjs` — passed.
- `node tests/atlas/prepared-bus-data-adapter.test.mjs` — passed, 13 tests.
- `node tests/atlas/alpha15-production-fidelity.test.mjs` — passed.
- `node tests/atlas/alpha15-planner-service-group.test.mjs` — passed.
- `node tests/atlas/bus-ui-contract.test.mjs` — passed.
- `node tests/atlas/bus-word-export.test.mjs` — passed.
- `node tests/atlas/tnds-transxchange.test.mjs` — passed with updated physical-pattern expectation.
- `node tests/atlas/run-all.mjs` — passed; `ATLAS Alpha.15 deterministic suite passed.` The sandbox run hit the Windows temporary-directory rename `EPERM`; the elevated rerun completed successfully.
- `git diff --check` — passed (Git reported only its existing LF-to-CRLF conversion notice for the rewritten test file).

## Git and disposition

No release, Beta declaration, merge, or PR was created. The branch HEAD and worktree cleanliness are verified in the completion record. Recommend Product Owner manual acceptance of this bounded correction before any further BUS-BETA work.
