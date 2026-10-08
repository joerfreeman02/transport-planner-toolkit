# BUS-ROBUSTNESS-1A4B — Authoritative Endpoint Hydration Closeout

## 1. Scope and identity

1. Sprint: `BUS-ROBUSTNESS-1A4B`.
2. Repository: ATLAS Transport Planner Toolkit.
3. Baseline: `1fc8c8ae865b0290e3e5decf1f65696f7ccd9800`.
4. Working branch: `codex/atlas-bus-authoritative-endpoint-hydration-closeout`.
5. Prior accepted branch `codex/atlas-bus-313-principal-endpoint-closeout` was not modified.
6. Frozen review source: national snapshot `36125621080`; no fresh national acquisition was performed.
7. Implementation commit before final handover recording: `9dfd851` (`Close out authoritative endpoint hydration`).
8. Formal release remains `2.0.0-alpha.15`; no merge, deployment, publication, Alpha.16, BUS-ROBUSTNESS-1B or polish work was performed.

## 2. Root cause and implementation

8. The Enfield 313 ordinary endpoint ID `210021000020` is present in the existing authoritative V2 NaPTAN reference shard with the name `Potters Bar Railway Station`.
9. The prepared adapter previously rejected valid authoritative records whose mode was `bus_coach`, so the reference record could not be used for exact endpoint hydration.
10. The planner endpoint resolver previously requested only full physical prepared StopPoint records. The endpoint’s full physical record is not present in the relevant grid shard, although the authoritative reference record is available.
11. The prepared adapter now accepts the authoritative bus modes `bus` and `bus_coach` for exact stop and StopArea member eligibility.
12. The provider-neutral ATLAS reference-data boundary now exposes `resolveReferenceStopPointsByIds()`.
13. Planner endpoint decisions first use full physical hydration and then use the existing authoritative reference-data boundary for unresolved IDs. Reference-only evidence can supply the exact human endpoint name, locality evidence and provenance without arbitrary domain/presentation HTTP requests or webpage scraping.
14. Existing downstream BUS-ROBUSTNESS-1A4 principal-endpoint protection remains in place: a school-day or other variant cannot replace the principal endpoint merely because its endpoint-ID set overlaps. Same-physical endpoint aliases remain eligible for enrichment.
15. Conflicting persisted and authoritative evidence remains a conflict-review decision; it is not silently hidden.
16. Production source contains no hard-coded Enfield route, endpoint ID, `Potters Bar` or school name.

## 3. Focused controls and parity

18. Added `tests/atlas/bus-robustness-1a4b-authoritative-endpoint-hydration.test.mjs` and included it in `tests/atlas/run-all.mjs`.
19. The focused control proves generic endpoint resolution from authoritative reference metadata, `bus_coach` eligibility, fail-closed unresolved ordinary variants, conflict review, school-day calendar retention, and Browser/Word parity.
20. Focused commands passed:

    `node tests/atlas/bus-dest-endpoint-intelligence.test.mjs`

    `node tests/atlas/prepared-bus-data-adapter.test.mjs`

    `node tests/atlas/bus-robustness-1a4-313-principal-endpoint.test.mjs`

    `node tests/atlas/bus-robustness-1a4b-authoritative-endpoint-hydration.test.mjs`

21. The focused 1A4B control passed with:

    `PASS BUS-ROBUSTNESS-1A4B authoritative endpoint hydration, fail-closed variant handling, conflict review, and Browser/Word parity.`

## 4. Full suite and review state

22. Full command: `node tests/atlas/run-all.mjs`.
23. The first full run reached the review-environment build identity guard but correctly stopped because the worktree was intentionally dirty before the implementation commit.
24. The clean-tip full suite then passed with exit code `0` and ended exactly:

    `ATLAS Alpha.15 deterministic suite passed.`

25. The final V2 review server is running on loopback port `8772` from the clean branch tip. Its ATLAS response is HTTP `200` with `BUS-TFL-COMPLETE · 9dfd851` before this final handover-only amend; the final post-amend SHA must be rechecked.
26. Required live Enfield control completed at latitude `51.6523584`, longitude `-0.0783252`, radius `250 m`: assessment status `complete`, 13 stops, 73 service summaries, and the ordinary 313 endpoint resolved to `Potters Bar Railway Station` from endpoint ID `210021000020`. The school-day endpoint evidence remained separately represented in the source/runtime controls.
27. Waltham Cross mixed-source control completed against frozen run `36125621080`: 16 physical stops, 79 service summaries, BODS and TfL evidence, and the existing honest source warnings retained, including six unresolved TfL request identities in that run.
28. The dedicated clean-branch browser control passed with two fixture evidence rows, navigation and site-selector checks, no page errors and no failed local requests.

## 5. Changed files

- `src/atlas/adapters/prepared-bus-data-adapter.mjs`
- `src/atlas/domain/bus-planner-summary.mjs`
- `src/atlas/domain/planner-endpoint-decision.mjs`
- `src/atlas/reference-data/atlas-reference-data.mjs`
- `tests/atlas/bus-robustness-1a4b-authoritative-endpoint-hydration.test.mjs`
- `tests/atlas/run-all.mjs`
- this handover document

## Recommendation

READY FOR PRODUCT OWNER MANUAL ACCEPTANCE. The endpoint name is now sourced through the existing authoritative reference-data boundary; the implementation does not invent a name, scrape a webpage, or make arbitrary live requests from the domain or presentation layer.
