# BUS-ROBUSTNESS-1A4A — 313 Principal Endpoint Closeout

## 1. Scope and identity

1. Sprint: `BUS-ROBUSTNESS-1A4A`.
2. Repository: ATLAS Transport Planner Toolkit.
3. Baseline: `8bb66f54180556f4e4e26a48bb4350c3c9c87f43`.
4. Working branch: `codex/atlas-bus-313-principal-endpoint-closeout`.
5. Protected branch: `codex/atlas-bus-final-accuracy-closeout`; it was not modified.
6. Implementation commit: `2a97aad` (`Fix principal endpoint variant override`).
7. Final tip: the commit carrying this handover document; report its exact SHA with the final handover.
8. Formal release remains `2.0.0-alpha.15`; no release, merge, deployment, publication or Alpha.16 work was performed.

## 2. Runtime evidence

9. The baseline was reproduced from a clean worktree at the exact requested commit.
10. The V2 review server was launched on loopback and the visible browser workflow was used.
11. Confirmed Enfield control: latitude `51.6523584`, longitude `-0.0783252`, radius `250 m`.
12. Browser baseline showed route `313` outbound as `Towards Dame Alice Owen's School`.
13. Baseline browser Sources and checks showed TfL stop discovery, TfL scheduled timetables plus DfT timetable evidence, OSRM access routing, and a complete result for the information shown.
14. The same panel retained the warnings that exact physical StopPoint references were not fully hydrated, TfL and supplementary national information conflicted, and the full route endpoints were not deterministic.
15. Detailed Evidence retained the 313 unresolved timetable patterns and endpoint-review records; no evidence was hidden or converted into a zero-service conclusion.
16. A second live runtime replay after the code fix processed 35 TfL timetable requests successfully, with 0 failed/unresolved requests in that run.
17. That replay still returned the ordinary 313 destination as `Destination not supplied` with endpoint ID `210021000020`; the named school-day record remained `Dame Alice Owen's School`.
18. Therefore the live source snapshot did not prove a named `Potters Bar` ordinary endpoint. ATLAS must not infer that name from an unresolved ID.
19. The live result remained `Towards Dame Alice Owen's School`, so the requested final live acceptance phrase `Towards Potters Bar` was not verified.
20. Waltham Cross remains the existing mixed TfL/BODS control with six route/stop evidence items requiring review; its unresolved evidence was not suppressed.

## 3. Root cause and implementation

21. The reproducible defect was in downstream endpoint reconciliation, not in the general same-physical-endpoint alias behavior.
22. `preferredServiceEndpointDecision()` previously treated any overlap in an unresolved principal's endpoint-ID set as sufficient to import an exact endpoint from another service variant.
23. A principal with an ambiguous set such as `{MAIN, SCHOOL}` could therefore receive the exact `SCHOOL` label from a restricted school-day variant.
24. The generic fix now anchors the fallback alias match to the principal's primary endpoint identity/StopPoint ID.
25. Exact principal identities still use the existing endpoint-identity alias path.
26. Same-physical-endpoint aliases therefore remain eligible for contextual enrichment.
27. A genuinely different endpoint variant can no longer replace the selected principal label.
28. `resolvedPlannerDestination()` now evaluates the planner-facing endpoint decision rather than only the raw source destination.
29. The review taxonomy uses that same resolved planner-facing decision, preventing a false `planner-route-identity` warning when endpoint evidence supplies the display name.
30. No route number, operator, school, locality, endpoint ID or `Potters Bar` string was hard-coded.

## 4. Focused regression and parity

31. Added `tests/atlas/bus-robustness-1a4-313-principal-endpoint.test.mjs`.
32. The new test fails on the untouched baseline with actual `School` versus expected `Main Station`.
33. The same test passes after the fix.
34. It verifies that the restricted school-day variant remains in structured calendar evidence.
35. It verifies Browser/Word output consumes the corrected principal row.
36. It verifies an endpoint-resolved display name counts as a resolved planner destination.
37. Existing endpoint-alias, 1A4, and Waltham runtime controls remain green.
38. The focused command set was:

    `node tests/atlas/bus-robustness-1a4-313-principal-endpoint.test.mjs`

    `node tests/atlas/bus-robustness-1a4-accuracy-closeout.test.mjs`

    `node tests/atlas/bus-endpoint-alias-closeout.test.mjs`

    `node tests/atlas/bus-group-1c-real-runtime.test.mjs`

    `node tests/atlas/bus-group-1d-real-runtime.test.mjs`

    `node tests/atlas/bus-group-1e-real-runtime.test.mjs`

## 5. Full suite and review state

39. Full command: `node tests/atlas/run-all.mjs`.
40. Final clean run exit code: `0`.
41. Final line: `ATLAS Alpha.15 deterministic suite passed.`
42. The first dirty-worktree run was not accepted as final because the review build identity correctly remained undeclared.
43. After the implementation commit made the worktree clean, the review-environment build identity checks passed.
44. The final clean V2 review server must remain running for Product Owner inspection; it must be started from the final clean tip so its header is `BUS-TFL-COMPLETE · <short final SHA>`.
45. No merge, push, deployment, publication, refresh, Alpha.16, BUS-ROBUSTNESS-1B or polish work was performed.

## 6. Changed files

- `src/atlas/domain/bus-planner-summary.mjs`
- `src/atlas/application/bus-assessment.mjs`
- `tests/atlas/bus-robustness-1a4-313-principal-endpoint.test.mjs`
- `tests/atlas/run-all.mjs`
- this handover document

## Recommendation

NOT READY for sprint acceptance: the generic downstream principal-endpoint override defect is fixed and the full deterministic suite is green, but the required live Enfield V2 acceptance row `Towards Potters Bar` was not evidenced because the current TfL snapshot supplied only an unresolved ordinary endpoint name. Product Owner review should either provide a current named ordinary endpoint evidence snapshot or explicitly accept the source limitation before changing this recommendation.
