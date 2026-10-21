# BUS-BETA-S2E-1 planner intelligence restoration

Status: **NOT READY FOR MANUAL RE-ACCEPTANCE**. This is the forensic baseline and a partial corrective checkpoint. The PE1/Queensgate output, source arbitration, warning presentation, and browser runtime still require hosted final-SHA validation.

## Provenance and environment

- Starting SHA: `f025e53603b6be2ba729d649c45a9b88ee377d5c`.
- Branch: `codex/atlas-bus-beta-s2e-1-intelligence-restoration`.
- Baseline implementation SHA: `96e0012da5fcc2b9d76e08297c3e434277628253`.
- Candidate: Run `39430415441`, artifact `12275615359`, digest `sha256:5cad24e0a47c4a77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`, producer SHA `151199cc914c235870f444d26b03c2309edbd035`.
- Hosted diagnostic: Run `39586034190`, report artifact `12340485134`, digest `sha256:bb05f1d986cf57f0feda9640734e965f696dd25273f5b2cd6ee76fc687e9caa2`.
- The diagnostic verified the immutable candidate/checkpoint, reported all five controls complete, and reported no failed source shards. No acquisition, national preparation, publication, or deployment ran.
- Version/build remain `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`.
- National candidate extraction/preparation was not run locally. `.tmp/` outputs were preserved.

## Baseline evidence and first observed stages

### Waltham Cross

The frozen candidate returned 25/12/6/15 raw records for routes 13/13A/13B/13C. Providers per route were respectively BODS+TNDS (6+19), BODS+TNDS (4+8), BODS+TNDS (2+4), and BODS+TNDS (2+13); canonical raw operator was Central Connect for all four. The scripted assessment produced a route 13 principal row with principal family route 13. It also emitted two separate route 13C rows. Thus the first unresolved divergence from the reported manual 13A/13C presentation is between the assessment produced by the diagnostic harness and the product's actual normal browser path; the row-identity-only contract tests do not resolve that difference. No site-specific rule has been added.

Other Waltham routes with more than two baseline rows were 14 (3), 66 (3), 242 (4), 251 (3), 310 (3), 25C (3), and A1 (3). The baseline report preserves the route-level row details, but these excess rows have not yet been individually adjudicated as public branches versus source/pattern fragments.

### Pipers Lane

The candidate returned complete source status and no failed shards. Route 230 had three raw records (one BODS and two TNDS) and became two service summaries and two planner rows. The BODS row displayed Centrebus and about hourly service; the TNDS row displayed Centrebus South, also about hourly, but with a reported 96 weekday departures and 6.79 buses/hour. Its source record contains 3,168 Monday evidence entries for a 33-stop ordered pattern (96 × 33), while the local stop schedules are stop-scoped. This proves whole-pattern evidence reached the frequency calculation path; it does not by itself prove that every TNDS departure represents a distinct public journey.

The route 230 BODS principal has a proven closed loop on the same physical StopPoint. The combined decision was nevertheless linear because the route-family resolver let an open TNDS pattern and feed-local direction markers veto that BODS loop. The first classification failure is the route-family circular arbitration in `resolveCircularServiceDecision`, after source records have loaded.

Route 231 had 16 TNDS records, two service summaries and two planner rows; no BODS records were present. It is therefore a legitimate TNDS-only case and must remain available. Routes 46 and C were not returned at this Pipers control by the captured focus set; the complete manifest/control report remains in the hosted diagnostic artifact.

### Chingford

The protected control produced two rows each for 357, 444, 657 and W16, with two BODS raw records and summaries per route. This is consistent with the expected two meaningful directions in the baseline candidate. The Alpha.15 deterministic fixture suite separately protects 657 school-day and TfL behavior; browser and Word parity on the real candidate remains pending.

### PE1 and Queensgate

Baseline PE1 route counts above two: `1:3, 2:3, 3:4, 4:3, 5:3, 6:3, 23:3, 24:3, 25:3, 27:4, 33:4, 37:3, 60:3, 61:3, 62:3, 63:3, 101:4, 102:6, 201:4, 202:5, 415:4, 904:3, 4P:3, A:3, B:3, C:3, X4:5`.

Baseline Queensgate counts above two: `1:4, 2:4, 3:4, 4:4, 5:4, 6:3, 23:4, 24:4, 25:4, 27:3, 33:4, 60:3, 61:3, 62:3, 63:3, 202:3, 415:4, 904:3, 5A:3, A:3, B:3, C:3, X4:4`.

The first confirmed split mechanism is `buildServiceSummaries` grouping by route, raw operator spelling, direction key, origin/destination, stop direction and calendar profile before planner grouping. This creates separate BODS/TNDS summary populations for equivalent services and endpoint variants. The captured baseline shows matching BODS/TNDS frequencies for several PE1 services (for example route 1) but separate rows. However, the complete per-route distinction between real branches, timetable fragments, source duplication and local terminus arrivals has not yet been completed. X4's winning evidence/calendar also remains to be proven. BCE call/non-call semantics have not been re-audited in the browser.

## Corrections in this checkpoint

- `departureEvidenceForRecords` now uses a local stop schedule when explicit journey evidence has no `stopPointId`; unscoped whole-pattern entries can no longer be counted again at each assessed stop.
- Circular contradiction checks now compare patterns from the principal provider, while all cross-provider variants remain in the diagnostic decision. This preserves the 310 same-provider linear safeguard and prevents a supplementary feed from vetoing a proven BODS loop.
- Operator display chooses names from the highest-ranked authority represented in the planner component. This only applies after sources have safely formed one component; it does not yet solve unmatched PE1 BODS/TNDS summary rows.
- Browser Service Summary columns are now ordered `Route, Operator, Direction / main service pattern, Served at, Principal locations, Typical frequency, Operating period at stop, Source` after the Include selector. Word remains source-neutral.

## Validation completed

Passed locally (lightweight targeted Node tests):

- BUS-CIRC, BUS-CIRC-1C, Alpha.13 planner summary and closeout.
- Alpha.14 production-row consolidation, Alpha.15 production fidelity, and Alpha.15 planner service group.
- BUS-QA-02 frequency and BUS-GROUP-1A source/authority hardening.
- Word export and browser UI contract.
- New S2E stop-scoped departure and BODS-principal circular checks.
- `node --check` for the edited domain modules and `git diff --check`.

Not yet completed:

- full Python Bus-data suite and `node tests/atlas/run-all.mjs` on GitHub-hosted runners;
- source arbitration for equivalent real-candidate BODS/TNDS services;
- all PE1/Queensgate >2-row reason adjudications and general consolidation fix;
- real-candidate post-fix audit and rendered browser smoke test;
- Sources & checks / technical-details review;
- exact-final-SHA hosted zero-download preflight;
- Word/browser real-candidate comparison;
- final clean worktree and origin-parity check.

## Safety and remaining defects

No fresh acquisition, candidate rebuild, publication, deployment, PR, merge, or release was performed. No candidate files were modified. No derived-data builder change has been shown necessary. The browser Source order and domain corrections have fixture/unit evidence only and are not a substitute for the real-candidate hosted gates. Source hierarchy remains TfL > BODS > TNDS; no universal BODS/TNDS identity bridge was added.

Remaining acceptance blockers include planner grouping and source arbitration at PE1/Queensgate, the actual browser-vs-harness Waltham discrepancy, warning/technical-detail presentation, and all hosted final-SHA validations. Therefore the S2E-1 status remains **NOT READY FOR MANUAL RE-ACCEPTANCE**.
