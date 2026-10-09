# BUS-ROBUSTNESS-1A4E-C1 — TfL Clipped-Pattern Closeout Handover

## Delivery record

- Repository: `transport-planner-toolkit`.
- Branch: `codex/atlas-bus-tfl-authoritative-evidence-c1`.
- Baseline: `8da1495101ac7d1c2e9f843b5951df2b6127a44a`.
- Corrected prior-candidate functional code SHA: `c40c26ff066de0a6335d6c7e6cc54648126c4010`. The earlier 1A4E handover's `ca1b0e6f23907dd53546ad617f95126e1d9b3795` implementation-SHA label was inaccurate because `c40c26f` also changed production sequence-match code. History was not rewritten.
- C1 implementation commit: `e390edb6088174ca2dd3ef67e883f698c4784365` (identical material-conflict review fact deduplication and production-path regression).
- Final tip: this handover commit; report the exact full SHA separately.
- Formal version: `2.0.0-alpha.15`; no release/version change.
- Local worktree must be clean after the handover commit and final suite.
- No merge, deployment, PR, iBus ingestion, or new national-data acquisition was performed. Do not infer remote parity; this task did not authorize pushing.

## C1 change and review boundary

TfL route-sequence evidence remains a generic sidecar. It completes endpoint topology only when a clipped timetable pattern links deterministically to the ordered route sequence. The sidecar does not alter the assessed pattern, GROUP/CIRC family selection, frequency, calendar, operating-period evidence, or service authority. Explicit endpoint conflicts remain fail-closed and reviewable.

Planner review items for exact endpoint conflicts are now keyed by the material conflict identity: side, line, direction, service type, matched branch/sections, the exact conflicting StopPoint set, and the opposite endpoint identity. Calendar profile, interval, and source-record IDs are deliberately excluded from this conflict identity. Thus repeated timetable calendars for the same place conflict become one actionable review fact, while different endpoints, branches, directions, or destinations remain distinct. Non-conflict unresolved facts keep their existing source/interval-based identity.

The new regression passes conflict records through `createBusAssessment` and the actual endpoint resolver with separate authoritative locality identities. Two calendar records with the same conflicting places collapse to one item; a third record with a different place remains separately reviewable. The earlier C1 matrix continues to cover unique/ambiguous clipped sequence matching, exact endpoint discrimination, wrong direction, short workings, sidecar isolation, non-material versus structural uncertainty, and supplementary BODS operator consensus without allowing operator metadata to relabel TfL timetable authority.

## Four-record 313 trace and matcher outcome

The complete Phase A record-level trace, including requested stop, direction, calendar, interval, every clipped ordered StopPoint ID, interval stop names, exact endpoints, the two TfL full sequences, route-section validity, and the before-state endpoint decision is in [the Phase A forensic trace](BUS-ROBUSTNESS-1A4E-C1-PHASE-A-313-FORENSIC-TRACE.md). The four source records were two facts, not four independent origin tasks:

| Assessed StopPoint | TfL direction | Relevant interval | Exact planner endpoint evidence | C1 result |
|---|---|---|---|---|
| `490001101K` | inbound | interval 0 to Chingford; interval 1 school-day Crown Road short working | interval-specific Chingford `490001063D`; Crown Road `490005843E` | full sequence links without widening interval terminus |
| `490008903E` | inbound | same inbound intervals as K, clipped at the assessed stop | same Chingford/Crown Road endpoints | same two source facts as K; no duplicate planner task |
| `490008903W` | outbound | interval 0 ordinary Potters Bar; interval 1 school-day Dame Alice Owen's extension | Potters Bar `210021000020`; school extension `210021085060` | full sequence links while keeping ordinary and restricted patterns separate |
| `490001101N` | outbound | same outbound intervals as W, clipped at the assessed stop | same Potters Bar/school endpoints | same two source facts as W; no duplicate planner task |

TfL Route/Sequence returned one non-forking Regular branch per direction: inbound `branchId: 0`, 37 ordered StopPoints; outbound `branchId: 1`, 42 ordered StopPoints; both had empty `nextBranchIds` and `prevBranchIds`. The responses had no `orderedLineRoutes` or route-section ID. Route metadata supplied exact directional endpoint pairs and validity `2026-09-19` through `2026-12-23`, but no stable section ID. The matcher therefore uses exact line/direction, compatible service type, assessed-stop membership, ordered subsequence and available exact endpoint/section/validity evidence; it does not invent absent IDs or select by route number, name, first candidate, or longest sequence. Ambiguous materially different branches fail closed.

The endpoint gate now treats a corridor-clipped interval edge as distinct from the linked full-route endpoint. It admits the deterministically linked full endpoint without changing `routePatternStopIds`; existing exact endpoint conflicts still fail closed. The ordinary outbound 313 remains Potters Bar, Dame Alice Owen's School remains the separate restricted addition, and Crown Road remains the inbound short working. GROUP, CIRC, frequency, calendar, and operating-period fields remain isolated from the sidecar.

The four baseline Category-C unknown-origin items were duplicated across the K/E inbound and W/N outbound stop records. C1 resolves those generic 313 items. Subsequent live assessment exposed five *different* exact-place conflict tasks: route 456 once, route 629 once, and W8 three times across calendar/pattern records. The final C1 conflict-identity key removes the two repeated W8 presentations while preserving the materially different 456, 629, and one W8 conflicts. Thus the live review count is 4 baseline 313 items → 5 material exact-place conflicts before conflict deduplication → 3 distinct material conflicts at closeout. No material conflict is suppressed; the acceptance target of zero avoidable planner items is met.

## Operator evidence result and bounded source proposal

The deterministic BODS operator tests cover 191/313/317 behavior: a compatible unanimous operator consensus can fill an empty TfL operator; conflicting operator candidates do not fill; incompatible lineage does not fill; and BODS never overrides a supplied TfL operator or becomes timetable authority. In the frozen live Enfield evidence, supplementary BODS does not deterministically fill all affected service patterns: 191 has an operator only on one direction, while the affected 313 and 317 rows remain blank. No operator is guessed.

Because existing evidence remains insufficient, the bounded next-source proposal is TfL iBus Static Data only as a future separately approved investigation—not ingestion in C1. Pin one coherent dated base version; link the exact TfL timetable journey/pattern to its block and `Block.Operator_Code` plus the corresponding operator-name record; preserve validity dates, source version, retrieval time, archive checksum/ETag, exact lineage, and ambiguity. Never mix records from different base versions. C1 does not activate or ingest iBus.

## Frozen Enfield 250 m acceptance replay

- Point: `51.6523584, -0.0783252`; radius: 250 m.
- V2 diagnostic URL: `http://127.0.0.1:8771/atlas/?review=v2#modules`.
- Replay completed 9 October 2026 at 12:31; 13 stops, 14 distinct routes, 44 detailed route × StopPoint pairs, 24 planner summaries.
- The clean final build header is injected from the current clean Git tip by the existing review server; verify it in the reopened browser after the final documentation commit.
- Planner-facing “Evidence items to review” now contains exactly three material, distinct exact-place conflicts: route 456 at `490006586W`, route 629 at `490009169S`, and route W8 at `490009169S`. W8's three calendar/pattern records share the same conflicting endpoint set and destination and are represented once. These three conflicts remain visible; none has been reclassified as safe.
- Route 313 retains “Towards Chingford Station” and “Towards Potters Bar Railway Station”. Dame Alice Owen's School remains a separate additional-service note; Crown Road (EN1) remains a separate short-working note. No 313 endpoint review was present in the acceptance evidence list.
- The live page retains its TfL/supplementary-national route-identity qualification and its frequency/operating-period qualification. These are disclosed rather than treated as resolved.
- The generated Word file `C:\Users\joe.freeman\Downloads\ATLAS Bus Assessment (10).docx` was inspected. It contains the 313 ordinary directions, school addition, and Crown Road short-working note, plus the planner-review qualification naming 456, 629, and W8. The Word summary does not duplicate W8 calendar items.

The exact unresolved questions are whether the source-authoritative origin identities on route 456 (`490006586W`), route 629 (`490009169S`), and W8 (`490009169S`) should resolve to one or another of the exact TfL endpoint place candidates. Prepared/runtime StopPoint, StopArea, and locality evidence disagrees materially for each. ATLAS keeps the strongest safe TfL presentation and cannot choose among conflicting exact place identities without an authoritative resolution. These are actionable, not avoidable duplicate tasks.

The remaining 456, 629, and W8 exact-place conflicts are material endpoint disagreements supported by different exact StopPoint/StopArea evidence. They are not avoidable calendar duplicates and must stay flagged for technical inspection. The redundant W8 presentation was avoidable and is now removed.

## Bounded controls

- Waltham Cross Bus Station, 250 m (`51.685520, -0.031123`): 6 stops, 19 service summaries; protected routes retained. One OSRM access-routing review remains (`210021703430`); the page also reports no bus stops within the selected distance despite the returned stop records. Record these as source/control anomalies, not as resolved.
- Chingford Mount / Normanshire Drive, 250 m (`51.616596, -0.011789`): 2 stops, 8 service summaries, no planner review items. Routes 357, 444, 657, and W16 are present. Route 657 remains school-days-only with the two evidenced journeys (07:55 toward Bancroft's School; 16:26 toward Salisbury Hall Sainsbury's).

These bounded controls were completed on the preceding C1 review build. The final deduplication is scoped only to material endpoint-conflict review identity and is covered by a deterministic regression.

## Adoption-tool review (no installation or configuration)

- Dependabot already exists in `.github/dependabot.yml` for weekly npm and GitHub Actions updates; retain it.
- Codecov would require repository/app authorization and a CI coverage/upload policy; defer until coverage reporting and token/privacy requirements are approved.
- OpenSSF Scorecard is a candidate read-only posture assessment; review repository visibility, workflow permissions, and administration requirements before enabling automation.
- Sentry requires explicit approval of runtime telemetry, precise-location/PII handling, scrubbing, and retention; defer.
- Renovate overlaps dependency-update ownership with Dependabot; do not add both without an explicit ownership policy.
- No tool was installed, activated, or reconfigured.

## Verification and handoff

- Focused C1 test: `node tests/atlas/bus-robustness-1a4e-c1-clipped-pattern-closeout.test.mjs` passes after the deduplication change.
- Complete deterministic suite on the clean final tip exits 0 and ends exactly `ATLAS Alpha.15 deterministic suite passed.` It includes the protected GROUP/DEST/CIRC, alias, school-only, calendar, authority, operating-period, and Browser/Word parity matrix.
- Review server on port 8771 returned HTTP 200. Its build header is only declared for a clean worktree; refresh after the final commit, confirm the header matches the full final tip's seven-character prefix, and leave the server running with the Enfield assessment open for manual review.
- Run `node tests/atlas/run-all.mjs` against the final clean tip. A successful final run must exit 0 and end exactly `ATLAS Alpha.15 deterministic suite passed.` The legacy-isolation subprocess may require the already-used process-spawn permission.
- No repository changes other than this handover, its C1 implementation/test commits, and the earlier C1-scoped implementation/forensic trace are intended. Verify `git status --short` is empty.

## Recommendation

**READY FOR PRODUCT OWNER FINAL TFL/LONDON INTELLIGENCE ACCEPTANCE**, with the three material 456/629/W8 exact-place conflicts explicitly retained for manual decision. This recommendation means the build is ready for Product Owner inspection; it does not claim those endpoint conflicts are resolved or authorize merge/deployment. Stop after this closeout. Do not start 1B, polish, merge, or deploy.
