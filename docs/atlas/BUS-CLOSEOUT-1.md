# ATLAS BUS — BUS-CLOSEOUT-1C

## Final forensic gap-closure handover

PR: [#48](https://github.com/joerfreeman02/transport-planner-toolkit/pull/48)  
Production `main`: `c670698dbf709a953d15b3927ee677fb502d1b3a`  
1C executable control head: `1a00bd64e9b4ffe795d78618ce35609a13364e3b`  
Run #24 publication: `35352167115-c670698dbf709a953d15b3927ee677fb502d1b3a`

This is a documentation and forensic handover for Technical Director review. No merge, deployment, publication, Bus refresh, secret/configuration change, Pages change, reference-data change or unrelated branch change was performed.

## Production source boundary

The final controls used the deployed Run #24 Bus/TNDS publication generated at
`2026-09-18T13:46:55Z`, with Bus BODS hash
`8a2764d2309d4908b71280bdd0708cddb68b242d1a5c2b8fdfcac4bd85a17b2c` and active
TNDS Bank A roots A1/A2/A3. The stale checkout-local fixture tree was not used
for acceptance evidence. Every register was generated from a clean Git worktree,
with an exact expected SHA.

## 1C implementation and boundaries

- Single-profile ordinary, school-day, term-time, non-school-day, holiday, other-resolved and unresolved operating-period lines are asserted alongside frequency lines. Ordinary remains unqualified; every non-ordinary label is explicit; generic `Calendar-specific service` is prohibited. `src/atlas/domain/service-calendar.mjs` was not changed.
- `createBusAssessment` now assigns `reviewItemTaxonomy(code).category` through one deterministic constructor on every path, including incomplete zero-stop stop-source coverage. Normal, zero-stop and unknown/future-code tests are present.
- Pipers forensics independently searches Run #24 BODS and TNDS for routes `46` and `C` at every inside-radius StopPoint, regardless of metadata routes, and separately searches named outside-radius route-46 candidates.
- Production semantic registers now include `principalLocations`, `principalLocationsText`, `calendarProfileId`, `calendarProfileIds`, served/representative stop, operator, destination, direction, frequency and operating-period fields.
- No application code inserts route 46 or C. No checkpoint-generation compatibility file changed.

## 1C production-fidelity controls

The clean base register was generated at production `main` SHA
`c670698dbf709a953d15b3927ee677fb502d1b3a`. The clean branch register was
generated at executable SHA `1a00bd64e9b4ffe795d78618ce35609a13364e3b`. Both
used the exact same Run #24 publication and the comparator passed all four
controls with semantic parity. Approved differences remain limited to concise
calendar wording and Word qualification wording/count.

| Control | Stops | Service summaries | Planner rows | TfL requests | Word service rows |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normanshire 400 m | 7 | 14 | 14 | 35 | 14 |
| Normanshire 700 m | 18 | 14 | 14 | 83 | 14 |
| Pipers Lane 700 m | 11 | 4 | 3 | 0 | 3 |
| Waltham Cross 700 m | 16 | 126 | 42 | 22 | 42 |

The registers retain exact StopPoint IDs, coordinates, distances, authorities,
routes, access routing, source-service identities, request identities, planner
semantics, review categories and DOCX hashes.

## Normanshire reconciliation

The accepted 700 m Run #24 set is 18 stops and is identical between base and
branch. The current set contains no East View stop and no route 212; the older
wider manual output was a different/stale source-set observation. No service
inclusion was altered to reproduce it. The unresolved live TfL identities remain
routes 215, 385 and 397. Route 397A remains a tracked mixed-source / London
Service Permit case for later mixed-source handling unless the BUS-CLOSEOUT
investigation proves it is directly part of the current completeness defect.
Route 444 remains `Towards Chingford Station` and `Towards Turnpike Lane Bus
Station`.

## Waltham Cross reconciliation

The accepted 700 m Run #24 set is 16 stops and is identical between base and
branch. The current source-derived population includes 211 and 212; the
historical count difference is a source/assessment observation, not a grouping
or service-inclusion change in 1C.

## Pipers route-46/C forensic result

The coordinates `51.852700, -0.454343` and radius 700 m are the current
BUS-CLOSEOUT fixture only. They are not an approved historical golden point:
project evidence recovered only an older note that route 230 was the live result
and that historical 46/231/C expectations were not forced. No authoritative
prior point, operating mode, radius and publication-date tuple was recoverable
from the project evidence.

The 1C forensic record independently queried 11 inside-radius StopPoints. None
had route-46 or route-C scheduled evidence, and none carried route 46 or C in
Run #24 metadata. It also independently inspected 10 named outside-radius
route-46 candidates. Woodside Animal Farm StopPoints `021024644` and
`021024645` are 725 m and 741 m away; Caddington Hall StopPoints
`210021428210` and `210021428130` are 922 m and 958 m away. The outside-radius
route-46 records have explicit BODS/TNDS evidence IDs in the JSON report. The
independent route-C search found no candidate or scheduled evidence. No route
was inserted into the assessment.

The machine-readable result is
`work/bus-closeout-1c/forensics/BUS-CLOSEOUT-1C-pipers-route-46-C-forensics.json`.
It records `fixtureStatus: current-fixture-not-historical-golden`, the exact
publication, the 11/10 independent query counts, per-stop coordinates/distances,
metadata routes, BODS/TNDS evidence IDs and evidence classifications.

## Checkpoint compatibility

Base and branch retain the exact fingerprint:

`atlas-candidate-generation-compatibility-v2 / 093d047c87482aba3d5b90844608046ece18bd673f9228dab504030883af2232`

The 1C branch did not change `src/atlas/domain/service-calendar.mjs` or any
candidate-generation/checkpoint compatibility input.

## Validation evidence

1. Full `tests/atlas/run-all.mjs` passed.
2. Alpha 15 production-fidelity acceptance passed.
3. Calendar profile matrix and operating-period assertions passed.
4. Planner summary and Browser/Word parity passed.
5. Word qualification adversarial tests passed.
6. Assessment normal, partial and zero-stop paths passed.
7. Deterministic review taxonomy tests passed.
8. Provenance and clean-worktree fail-closed tests passed.
9. Production control registers passed on base and branch.
10. Base-vs-branch comparator passed all four controls.
11. Pipers forensic capture passed at the exact executable SHA.
12. Recovery-0F.2 checkpoint compatibility tests passed.
13. Legacy isolation guard passed.
14. Review-environment tests passed.
15. Bus/TNDS parser and source-merge tests passed.
16. TfL timetable and request-budget tests passed.
17. Alpha 13/14 planner consolidation tests passed.
18. Route 444 direction integrity remained exact.
19. Route 397A remained outside the immediate 215/385/397 completeness defect unless later evidence proves otherwise.
20. No hosted GitHub CI result is claimed; the PR has no configured hosted checks.

## Corrected control artifacts

Under `work/bus-closeout-1a/production-controls/`:

- `BUS-CLOSEOUT-1A-production-control-register-1c-final-base.json`
- `BUS-CLOSEOUT-1A-production-control-register-1c-final-branch.json`
- `ATLAS BUS-CLOSEOUT-1A — 1c-final-branch — normanshire-drive-400m.docx`
- `ATLAS BUS-CLOSEOUT-1A — 1c-final-branch — normanshire-drive-700m.docx`
- `ATLAS BUS-CLOSEOUT-1A — 1c-final-branch — pipers-lane-700m.docx`
- `ATLAS BUS-CLOSEOUT-1A — 1c-final-branch — waltham-cross-700m.docx`

The final executable control SHA is the branch commit above. Any later branch
head used for PR submission must be proven documentation-only by its Git diff;
no post-control executable, test or forensic-tool change is permitted.

## Production state and handover

The repository is ready for Technical Director verification. Run #24 remains
the latest production refresh; no later refresh was dispatched. No publication,
Pages deployment, secret/variable/configuration change or reference-data
repository change occurred during this closeout work.

**READY FOR TECHNICAL DIRECTOR MANUAL REVIEW — NOT READY FOR PRODUCTION.**
