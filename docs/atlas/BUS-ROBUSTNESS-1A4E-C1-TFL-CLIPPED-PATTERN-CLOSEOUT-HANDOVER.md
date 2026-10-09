# BUS-ROBUSTNESS-1A4E-C1 — TfL Clipped-Pattern Closeout Handover

## Delivery record

- Repository: `transport-planner-toolkit`.
- Branch: `codex/atlas-bus-tfl-authoritative-evidence-c1`.
- Baseline: `8da1495101ac7d1c2e9f843b5951df2b6127a44a`.
- C1 implementation commit: `e390edb6088174ca2dd3ef67e883f698c4784365` (identical material-conflict review fact deduplication and production-path regression).
- Final tip: this handover commit; report the exact full SHA separately.
- Formal version: `2.0.0-alpha.15`; no release/version change.
- Local worktree must be clean after the handover commit and final suite.
- No merge, deployment, PR, iBus ingestion, or new national-data acquisition was performed. Do not infer remote parity; this task did not authorize pushing.

## C1 change and review boundary

TfL route-sequence evidence remains a generic sidecar. It completes endpoint topology only when a clipped timetable pattern links deterministically to the ordered route sequence. The sidecar does not alter the assessed pattern, GROUP/CIRC family selection, frequency, calendar, operating-period evidence, or service authority. Explicit endpoint conflicts remain fail-closed and reviewable.

Planner review items for exact endpoint conflicts are now keyed by the material conflict identity: side, line, direction, service type, matched branch/sections, the exact conflicting StopPoint set, and the opposite endpoint identity. Calendar profile, interval, and source-record IDs are deliberately excluded from this conflict identity. Thus repeated timetable calendars for the same place conflict become one actionable review fact, while different endpoints, branches, directions, or destinations remain distinct. Non-conflict unresolved facts keep their existing source/interval-based identity.

The new regression passes conflict records through `createBusAssessment` and the actual endpoint resolver with separate authoritative locality identities. Two calendar records with the same conflicting places collapse to one item; a third record with a different place remains separately reviewable. The earlier C1 matrix continues to cover unique/ambiguous clipped sequence matching, exact endpoint discrimination, wrong direction, short workings, sidecar isolation, non-material versus structural uncertainty, and supplementary BODS operator consensus without allowing operator metadata to relabel TfL timetable authority.

## Frozen Enfield 250 m acceptance replay

- Point: `51.6523584, -0.0783252`; radius: 250 m.
- V2 diagnostic URL: `http://127.0.0.1:8771/atlas/?review=v2#modules`.
- Replay completed 9 October 2026 at 12:31; 13 stops, 14 distinct routes, 44 detailed route × StopPoint pairs, 24 planner summaries.
- The clean final build header is injected from the current clean Git tip by the existing review server; verify it in the reopened browser after the final documentation commit.
- Planner-facing “Evidence items to review” now contains exactly three material, distinct exact-place conflicts: route 456 at `490006586W`, route 629 at `490009169S`, and route W8 at `490009169S`. W8's three calendar/pattern records share the same conflicting endpoint set and destination and are represented once. These three conflicts remain visible; none has been reclassified as safe.
- Route 313 retains “Towards Chingford Station” and “Towards Potters Bar Railway Station”. Dame Alice Owen's School remains a separate additional-service note; Crown Road (EN1) remains a separate short-working note. No 313 endpoint review was present in the acceptance evidence list.
- The live page retains its TfL/supplementary-national route-identity qualification and its frequency/operating-period qualification. These are disclosed rather than treated as resolved.
- The generated Word file `C:\Users\joe.freeman\Downloads\ATLAS Bus Assessment (10).docx` was inspected. It contains the 313 ordinary directions, school addition, and Crown Road short-working note, plus the planner-review qualification naming 456, 629, and W8. The Word summary does not duplicate W8 calendar items.

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
- Review server on port 8771 returned HTTP 200. Its build header is only declared for a clean worktree; refresh after the final commit, confirm the header matches the full final tip's seven-character prefix, and leave the server running with the Enfield assessment open for manual review.
- Run `node tests/atlas/run-all.mjs` against the final clean tip. A successful final run must exit 0 and end exactly `ATLAS Alpha.15 deterministic suite passed.` The legacy-isolation subprocess may require the already-used process-spawn permission.
- No repository changes other than this handover, its C1 implementation/test commits, and the earlier C1-scoped implementation/forensic trace are intended. Verify `git status --short` is empty.

## Recommendation

**READY FOR PRODUCT OWNER FINAL TFL/LONDON INTELLIGENCE ACCEPTANCE**, with the three material 456/629/W8 exact-place conflicts explicitly retained for manual decision. This recommendation means the build is ready for Product Owner inspection; it does not claim those endpoint conflicts are resolved or authorize merge/deployment. Stop after this closeout. Do not start 1B, polish, merge, or deploy.
