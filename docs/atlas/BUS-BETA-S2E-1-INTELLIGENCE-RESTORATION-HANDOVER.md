# BUS-BETA-S2E-1 — Intelligence Restoration Handover

Status: **C2 HISTORICAL; C3 MANUAL ACCEPTANCE REJECTED; C4 EVIDENCE CLOSEOUT BLOCKED**. Historical C1–C3 records remain intact. C4 Run #23 passed its hosted automated gates on the tested product SHA, but three requested evidence conclusions remain unproven.

## Accepted production revision and candidate provenance

- Reviewed production SHA: `4408c790ca3ff88adee15f2da064c2002e0a4a7e`.
- Branch: `codex/atlas-bus-beta-s2e-1-intelligence-restoration`.
- Immutable candidate: Run `39430415441`, artifact `12275615359`, name `atlas-bus-beta-review-candidate-39430415441`, digest `sha256:5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`, producer SHA `151199cc914c235870f444d26b03c2309edbd035`.
- The candidate was restored and inspected on hosted runners. It was not rebuilt or modified.
- Version/build remain `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`.

## Root causes and corrections

1. **Deterministic diagnostic boundary:** the production adapter composition attempted live TfL HTTP while the hosted diagnostic intentionally disabled it. The disabled request was treated as fatal even for national controls. The harness now supplies a deterministic successful empty TfL contribution for those controls. It does not weaken or replace production source composition. Chingford is protected by a separate fixture-backed TfL route 657 regression.
2. **Waltham route-family principal:** suffixed route variants could outrank the exact numeric route stem through endpoint and pattern evidence. A proven family containing its exact stem now selects that stem as the displayed principal; child routes retain their own evidence and destinations.
3. **Unscoped departure evidence:** whole-pattern evidence without a StopPoint ID could be counted at each assessed stop. Where such entries have no stop scope, the local stop schedule now supplies the frequency population.
4. **National circular arbitration:** an open TNDS supplementary route 230 pattern could replace/veto a closed BODS principal. Circular arbitration now selects by source authority (TfL, BODS, TNDS) before comparing evidence within the winning authority. Lower-ranked patterns remain auditable and cannot redefine the principal authority’s pattern.
5. **Review-row safety:** source, route, endpoint and ordered-pattern evidence is consolidated only when it supports one public service. Materially ambiguous corridors remain visible with an unresolved-review decision; there is no arbitrary two-row cap.

The C2 explicit no-service correction preserves source arbitration on operated days. No further GROUP, DEST, CIRC or frequency redesign is indicated by the final hosted tests.

## Final control results

### Waltham Cross — routes 13/13A/13B/13C

Production-composition audit of the exact candidate produced one planner family with principal route `13` and members `13`, `13A`, `13B`, and `13C`. The child destinations remain distinct: route 13 to The Talbot, 13A to St Margaret’s Hospital, 13B to Waltham Abbey (Princesfield Road), and 13C to Two Brewers.

Route 13C remains a separately visible branch because its destination/pattern is materially distinct. Family membership communicates its shared route family; it does not erase the branch endpoint or merge its timetable into the 13 principal. This preserves both the common family identity and the service a passenger can actually select.

The representative family timetable is approximately every 30 minutes Monday–Friday and every 60 minutes Saturday, with no Sunday service; the reported operating periods are approximately 06:30–18:10 weekdays and 08:40–15:40 Saturday. The deterministic diagnostic made zero live TfL requests and read the frozen national candidate. No Waltham-specific authority rule was added.

### Pipers Lane — routes 230/231

- **230:** three source records (one BODS, two TNDS) form one normal planner row. The Centrebus BODS circular is the principal pattern, with the proven same-physical-StopPoint closure and 34 ordered stops. Frozen BODS schedules support 15 departures Monday–Friday, 9 Saturday and zero Sunday at both assessed local stops. The normal browser and Word preserve the approximately hourly weekday/Saturday presentation and explicit Sunday no-service; TNDS does not fill that primary zero-service day. The circular interpretation and BODS Source label remain visible.
- **231:** two directional planner rows remain for the TNDS-only service: outbound about every 85–130 minutes (approximately 08:04–11:34) and inbound about every 68 minutes (approximately 11:18–18:02). They remain separate because they are opposite directions with distinct stop patterns and operating periods.
- The actual-candidate assertion verifies route 230 is circular and that the BODS Centrebus pattern is the selected principal.

### Chingford — protected TfL control

The fixture-backed TfL route 657 golden regression passed. The five-control candidate browser/Word audit also passed. The established Chingford control matrix retains usable summaries for routes 357, 444, 657 and W16, including their meaningful directional rows. No live TfL call was made by the deterministic national-candidate diagnostic.

### PE1 — final planner-row counts

`X4:2, 1:2, 2:2, 3:2, 4:2, 5:2, 6:1, 23:2, 24:1, 25:1, 27:2, 33:2, 37:1, 60:2, 61:2, 62:1, 63:2, 101:2, 102:4, 201:2, 202:3, 415:2, 904:1, 4P:3, A:1, B:1, C:2`.

The only routes above two rows are:

- **102 — four rows:** one supported Towngate East/Health Centre service group consolidates five source records while preserving three branch variants. A Queensgate Bus Station group remains unresolved because its evidence includes materially different Queensgate and Peterborough corridor endpoints. The inbound and outbound services remain separate directions; the outbound record is also marked unresolved rather than being merged on route number alone.
- **202 — three rows:** one outbound service, one inbound service toward Helpston, and a distinct inbound Bainton branch. The outbound group consolidates seven records and retains short workings. The first inbound group retains its branch/short-working evidence; the Bainton service has its own two source records and a different endpoint/corridor and journey count. Merging it would conceal the branch.
- **4P — three rows:** CallConnect inbound and outbound rural Ufford/Barnack services remain separate directions. The third row is a TransportConnect “Stamford CallConnect” service with a distinct city, hospital, railway-station and Bretton corridor. Similar branding is insufficient evidence to merge these separate service patterns/operators.

### Queensgate Bus Station — final planner-row counts

`X4:2, 1:2, 2:2, 3:2, 4:2, 5:2, 6:1, 23:2, 24:1, 25:1, 27:2, 33:2, 60:2, 61:2, 62:1, 63:2, 202:3, 415:2, 904:1, 5A:2, A:1, B:1, C:2`.

- **202 — three rows:** the same defensible outbound service, inbound Helpston service, and distinct Bainton inbound branch appear at Queensgate. Source-record consolidation and branch/short-working evidence match PE1; the third branch is retained rather than collapsed into a misleading corridor.

### X4, frequency and calendar

X4 has exactly two Stagecoach Midlands rows at both PE1 and Queensgate: one inbound and one outbound. At PE1, each direction has two weekday journeys and no weekend service (inbound about 15:55; outbound about 07:45). At Queensgate, the candidate supports weekday, Saturday and Sunday services: inbound typically every 40–70 minutes weekdays, about hourly Saturday and every two hours Sunday; outbound typically every 35–65 minutes weekdays, about every 60–70 minutes Saturday and every two hours Sunday. The operating-period lines remain direction-specific. No weekday/weekend populations were combined where the source calendar distinguishes them.

## GROUP, DEST, warnings and evidence presentation

- **GROUP:** exact numeric route-stem selection produces the Waltham route 13 family principal; 13A/13B/13C remain distinct members. Equivalent source records group only with supporting route-family, endpoint/place, ordered-pattern, physical-stop, lineage or timetable evidence. The row counts above two remain because of evidenced branches, directions or unresolved material corridors.
- **DEST:** endpoint resolution preserves branch destinations and source-supported endpoint choices. Route 13C retains Two Brewers. Route 102’s unresolved materially different corridor evidence remains explicit instead of being assigned a false common destination.
- **Warning scope:** the four national controls report no failed-source, unavailable-timetable or “needs review” warning. Raw TNDS SpecialDays metadata remains in technical diagnostics and is absent from normal Sources & checks; a concise date-specific caveat is shown only where relevant. Deterministic empty-TfL scope/timestamp and source-date context do not erase valid national evidence.
- **Sources & checks / technical details:** the actual candidate’s BODS/NaPTAN and TNDS manifests and required shards loaded successfully for each control; no live TfL calls occurred. Source IDs, provider authority, pattern evidence, calendar evidence and unresolved grouping reasons remain available for technical inspection. Pipers 230 technical details identify BODS as the circular principal and TNDS as supplementary.
- **Browser Source column:** the real-candidate browser audit passed with Source in the final column after Operating period at stop (following the Include selector), as specified by the browser contract.
- **Word/browser parity:** the five-control real-candidate browser and Word audit passed. The Word output remained aligned with the browser planner rows and did not introduce source-specific duplication or omit the retained route/branch rows.

## Hosted validation and evidence

### Run #104 — frozen candidate / production-composition diagnosis

- Exact workflow run ID: `39602997240` (Run #104).
- Result: **success** on SHA `4408c790ca3ff88adee15f2da064c2002e0a4a7e`.
- Artifact: `12348395975`, `atlas-bus-beta-s2e1-normal-runtime-diagnostic-39602997240`, digest `sha256:08e3683cf60d753d78a3d5d364212a204c7471d8dbe12ea7b09a9e73d3302bbe`.
- Passed: full Bus-data Python suite; `node tests/atlas/run-all.mjs`; immutable Run #75 identity/provenance verification; actual-candidate planner diagnostics for Waltham, Pipers, PE1 and Queensgate; five-control browser/Word audit; fixture-backed Chingford TfL route 657 golden regression.
- The strengthened Pipers 230 assertion passed: final planner row is circular and its principal source record is the Centrebus BODS pattern.

### Run #105 — exact-final-SHA zero-download preflight

- Workflow run ID: `39603015375` (Run #105).
- Result: **success** on exact SHA `4408c790ca3ff88adee15f2da064c2002e0a4a7e`.
- Artifact: `12347203937`, `atlas-tnds-trust-offline-preflight-39603015375`, digest `sha256:c2d4955d7171c5b2e80800e1d0615cce3d366dbb42b9af14c2030d84fa260356`.
- Evidence records `snapshotAcquired=false`, `tndsSecretsInjected=false`, `tndsFtpCalled=false`, `retrievalPerformed=false`, `boddsAcquired=false`, `publicationAttempted=false`, and `deploymentAttempted=false`; `plannerEligible=false`.
- Passed: full Bus-data, TNDS and workflow-contract suite; deterministic Alpha.15 suite; exact C1B offline selector/evidence checks.

## S2E-1-C2 — final bug-elimination closeout

### Starting point, correction and regression lock

- Verified starting branch HEAD: `d86d4b4ed29073205fc4140f6c86de43b51402ad` on `codex/atlas-bus-beta-s2e-1-c1-manual-corrections`.
- C2 code/test SHA validated by hosted Run #151: `276e7c5850bd86f5a162e8ea388333c2f656e050`.
- **Pipers 230 root cause:** planner departure authority was compared by route, calendar profile and a semantic key containing endpoints. The BODS weekly timetable had no Sunday departure entries, so it did not participate in Sunday’s entry-based authority comparison; a different-endpoint TNDS route-230 pattern then supplied Sunday journeys. The normal row consequently claimed Mon–Sun service despite frozen BODS showing no Sunday service.
- **Production correction:** keep existing per-pattern arbitration for operating days, and treat an explicitly empty local day from a higher-authority source as no-service evidence across endpoint variants. This is provider-ranked and data-driven; it does not hardcode route, operator, frequency or calendar. TNDS-only route 231 remains available. On days with primary departures, distinct source semantics remain eligible; the existing provider-local journey identity collision regression continues to pass.
- **Legacy audit reconciliation:** the five-control internal diagnostic had treated pre-composition planner counts as final visible row counts, capped PE1 route 102 at two, required X4 calendar text in the wrong fields, and interpreted retained raw SpecialDays metadata as user-facing warning spam. Those predicates were moved to appropriate evidence checks. The actual normal-product browser/Word audit now gates rendered Pipers row/source/circular/calendar behavior, PE1 route 102 distinct labeled presentations without a maximum, X4 regular service plus qualified school short working, concise Sources & checks, and browser/Word parity. Raw source metadata remains available to technical diagnostics.
- Regression protection added for BODS-primary weekly service with an explicit Sunday zero, same-route TNDS Sunday departures with different endpoints, BODS circular authority and retained TNDS-only 231. Existing distinct-provider semantic and Chingford/TfL regressions also pass.

### Exact hosted evidence — Run #151

- Workflow run: **#151**, ID `39747744400`, result **success**, event `workflow_dispatch`, branch `codex/atlas-bus-beta-s2e-1-c1-manual-corrections`, SHA `276e7c5850bd86f5a162e8ea388333c2f656e050`.
- Diagnostic artifact: ID `12411893340`, name `atlas-bus-beta-s2e1-normal-runtime-diagnostic-39747744400`, digest `sha256:2500e8021b58b061e26ed5b8ff8560dd8f37f1c93a8be09f9572f806eb1eb2bb`.
- The complete Bus-data Python suite and `node tests/atlas/run-all.mjs` passed. The deterministic empty-TfL boundary, immutable Run #75 identity/provenance verification, actual-candidate planner diagnostics, five-control candidate browser/Word diagnostic, normal-product browser/generated-DOCX audit, and fixture-backed Chingford route-657 golden regression all passed.
- Pipers route 230 now passes browser and Word checks for one principal row, Centrebus BODS source, circular note, approximately hourly service, and BODS Sunday no-service. Route 231 remains present.
- Waltham route/family and false-warning controls passed. PE1/Queensgate acceptance passed without an arbitrary route-102 row cap; X4 remains a regular public service with its Kings School short-working qualification. Chingford TfL routes and route 657 school-day semantics passed.
- Source column visibility, responsive table overflow checks, technical-details suppression, concise Sources & checks, and browser/Word route parity passed.
- Candidate provenance remains Run `39430415441`, artifact `12275615359`, digest `sha256:5cad24e0a47c4a77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`, producer SHA `151199cc914c235870f444d26b03c2309edbd035`.
- Fresh acquisition: **NO**. Run #75 rebuild/modification: **NO**. Publication/deployment: **NO**. Main merge/release: **NO**. Version/build unchanged: `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`.
- The first hosted attempt at C2 exposed an over-broad initial authority comparison through the pre-existing test requiring distinct cross-provider route semantics to survive. That attempt was not accepted. The correction was narrowed to explicit primary no-service days; the full final Run #151 suite passed.

### Tooling adoption review

- Dependabot: configured.
- Codecov: deferred until a meaningful coverage baseline exists.
- OpenSSF Scorecard: deferred to a later release/security milestone.
- Sentry: deferred pending telemetry/privacy architecture.
- Renovate: not required alongside Dependabot.
- **No new GitHub tooling installation milestone.**
## Safety, branch state and remaining gate

- Fresh source acquisition: **NO**.
- Candidate rebuild: **NO**.
- Candidate modification: **NO**.
- Publication/deployment: **NO**.
- PR/merge/release: **NO**.
- Local national extraction/preparation: **NO**; the existing `.tmp/` outputs were preserved.
- The C2 code/test worktree is in the isolated non-OneDrive checkout. The only pre-existing untracked item, `tools/atlas-bus-data/tmpotdqoq2p/`, was preserved and not staged or modified. This handover update is documentation-only and is included in the final exact-SHA hosted validation; the historical dirty OneDrive `main` checkout was not accessed or changed.
- No new code defect was identified by the completed hosted candidate and regression gates. Remaining source caveats are special-day/date-specific timetable metadata and the unresolved corridors expressly listed above; these are surfaced rather than silently merged. The remaining gate is Technical Director review before any manual re-acceptance authorization. The unchanged Run #75 candidate remains immutable.

**C2 gate: READY FOR TECHNICAL DIRECTOR REVIEW.**

## S2E-1-C3 — final intelligence correction checkpoint

### Branch and implementation

- Branch: `codex/atlas-bus-beta-s2e-1-c3-final-intelligence-correction`.
- Verified starting SHA: `487f5b05a07e5dcfcf62b55132101e13ccd2f68a`.
- Pushed implementation SHA: `8bc4f7a3e1e3eff18f0d388d32ca6415f4dd74b8`, directly based on the verified starting SHA. Origin points to this SHA.
- The C3 delta changes the planner's use of explicit per-stop departure evidence: an explicit empty/filtered stop population no longer falls back to denser route aggregate departures. Route-level calendar notes contributed only by recognized short-working/branch/calendar variant records are not promoted over an unrestricted principal service; the variant note remains visible.
- When a failed TfL request is redundant because the same route/service is resolved at another selected stop and a same-stop national fallback exists, the lookup remains in provenance and its fallback evidence remains available, but that redundant failure alone does not add an incomplete/fallback review warning. Material unresolved requests still warn.
- The S2E-1 frozen Run #75 diagnostic selector now admits this exact branch and remains restricted to the exact immutable candidate; the diagnostic workflow has no acquisition, publication, or deployment path.

### C3 regression coverage and local test evidence

- Added direct frequency assertions for explicit representative-stop records, including a day with no representative-stop service despite denser records at another selected stop.
- Added audit assertions that redundant cross-stop lookup failures remain traceable without creating a false material warning, while genuinely unresolved evidence still warns.
- Strengthened actual-candidate diagnostic and normal-product browser/Word gates for Waltham 217, Pipers 230/231, PE1 routes 1/5/33, X4's retained Kings School variant note, and route-level qualification scope for 27/101/201. Waltham's normal-product browser/Word gate uses the deterministic route 217 TfL operating-period fixture; it does not issue live TfL HTTP.
- Local lightweight tests passed: `alpha12-evidence-integrity-audit`, `alpha15-planner-service-group`, `alpha13-calendar-safety`, `alpha13-summary-closeout`, `bus-robustness-1a2-enfield-variant`, `bus-robustness-1a4f-tfl-ibus-operator`, `tfl-operating-period-1b`, `review-candidate-workflow-contract`, and `s2e1-diagnostic-workflow-contract`; updated diagnostic scripts passed `node --check`; `git diff --check` passed. One initial Alpha.12 run hit a Windows sandbox temporary-directory rename restriction; it passed when its temporary files were directed into the isolated checkout.
- The focused tests confirm Enfield calendar precedence, route 629/657 school-only semantics, iBus operator precedence over BODS corroboration, and operator/source separation. The production app already wires the date-valid checked iBus static operator adapter. This C3 change does not modify that authority path.

### Candidate/hosted status and gate

- Immutable candidate remains Run `39430415441`, artifact `12275615359`, digest `sha256:5cad24e0a47c4a77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`, producer SHA `151199cc914c235870f444d26b03c2309edbd035`. It was not downloaded, rebuilt, or modified in C3.
- No local national-data extraction, preparation, exhaustive scan, candidate build, or live source acquisition occurred. No publication, deployment, main merge, release, or version/build change occurred.
- Native `gh auth status` was checked: the configured token is invalid. No credential was requested and no login flow was automated. C3 now uses a repository-level push trigger instead of manual dispatch.
- `.github/workflows/atlas-bus-beta-s2e1-c3-push-validation.yml` triggers only on pushes to the exact C3 branch. Its job additionally checks the `push` event, exact repository and exact ref, has only `actions: read` / `contents: read`, and calls the existing reusable frozen-candidate diagnosis with only `mode: normal_runtime_diagnosis`. Concurrency cancels stale runs when a newer C3 commit is pushed.
- The reusable diagnosis checks the immutable Run #75 artifact ID, digest, producer SHA and expiry before restore; it restores but never builds or modifies the candidate. It has no acquisition, publication, deployment, release or main-merge job. The automatic workflow-contract test locks the trigger, branch/repository guards, read-only permissions, reusable-workflow call and absence of refresh/deploy paths.
- The exact-SHA workflow remains the gate for every pushed C3 correction; hosted iteration history and the latest completed gate are recorded below.

### Hosted C3 iteration — follow-up corrections

- The first automatic exact-SHA run completed the full deterministic suites and immutable-candidate restore, then exposed two issues: a Pipers gate incorrectly required route 46 to be present, and a PE1 school short-working qualification was still promoted to the whole X4 service through the separate planner-annotation path.
- Pipers route 46 is not a required positive for this frozen control. The prior bounded Run #24 forensic record found no route-46 scheduled evidence at any of the 11 inside-radius stops; the Run #75 normal-product browser likewise rendered no route-46 row. The regression now checks that any evidenced route-46 row does not inherit the five-minute cross-stop frequency, without manufacturing a service or failing when there is no candidate evidence.
- Planner annotations now identify variant services through both service IDs and source-record IDs. When an unrestricted principal exists, a calendar qualification belonging only to a short-working is not emitted as a whole-route qualification. The qualified Kings School variant remains visible through the route-variant annotation.
- Run #2 (`39762385485`, exact SHA `d3edaf09f8712d056aceb60504d7216b43e3687a`) passed the full Bus-data Python suite but failed the full deterministic ATLAS suite at an existing branch/calendar regression: the school-only qualification was no longer visible after scoping. The failure exposed a duplicate short-working evidence key where a qualified calendar record followed an unqualified short-working record; the annotation now merges the qualification onto the retained short-working entry.
- Focused planner/calendar/UI/workflow-contract regressions pass locally after that correction. Pipers/PE1 hosted-candidate gates were skipped in Run #2 because the deterministic suite failed first; the next push-triggered exact-SHA run will exercise them.
- Run #3 (`39762753422`, exact SHA `fffb5aabc0d4b922e49a7416af28889a5e7fa24b`) passed both full suites and restored the immutable candidate. The actual-candidate planner diagnostic failed, and the browser/Word audit reported that PE1 X4 no longer showed the qualification beside its visible Kings School short working. The Pipers browser control rendered only routes 230/231, consistent with the bounded evidence that route 46 is absent from this 700 m control. The report did not preserve planner-annotation internals after assertion failure, so the diagnostic now writes its compact route/group/planner-note evidence before returning the failure; this will distinguish a product defect from a reporting/gate mismatch on the next hosted SHA.
- Run #4 (`39764858668`, exact SHA `e8a4cbc4bb7feb2a87a5a408f1a180d069664421`) passed both full suites but again failed the actual-candidate diagnostic and PE1 browser acceptance. The diagnostic artifact still had no first-control runtime report, showing that the failure occurs before planner assertions; a stage/error envelope now captures inspectScope, assess, or prepared-only failures with source-request counts and candidate identity. It also preserves the annotated planner rows before any candidate assertion. The next hosted run will provide the exact failure.
- Run #5 (`39765779293`, exact SHA `53732bad35592a4a5bb34ef6ec89ca71a1301930`) passed both full suites and produced the missing Waltham report. Its failure was an invalid Waltham 217 assertion in the national-only diagnostic: with live TfL deliberately replaced by an empty deterministic fixture, the report correctly contains BODS route 217 with its national-source operating span of 00:05–00:25, while the separate normal-product browser acceptance supplies the fixture-backed TfL 04:00–00:59 span and passes. The assertion belongs only in the fixture-backed browser/Word control and has been removed from the empty-TfL national diagnostic. The national diagnostic now continues across all four controls even when an earlier control fails, preserving their separate reports.
- Run #6 (`39766957946`, exact SHA `6d789578932e60753122f80c86a23c851606559b`) passed the full Bus-data Python suite, the full deterministic ATLAS suite, immutable Run #75 verification, five-control candidate browser/Word diagnostics, and the fixture-backed Chingford route-657 regression. Its normal-product browser/Word gate still failed PE1 because the school-day-only X4 Kings School short working appeared in an internal route-variant string but not in the rendered structured short-working note. The actual-candidate gate also rejected PE1/Queensgate route 1/5/33 five-minute text; comparison with the already accepted C2 Run #151 (`39747744400`) proved those exact PE1 route/direction frequency lines were unchanged from that accepted baseline. The blanket ban was therefore an unsupported predicate, not a C3 regression. It has been replaced by exact PE1 baseline assertions, while the candidate diagnostic continues to require those route rows.
- Run #6 report analysis traced the X4 display omission to variant identity: planner grouping recognized the canonical service ID as a short working, but the structured annotation loop checked only raw `sourceRecordIds`. The correction now checks both canonical and raw source IDs, with a focused regression where they differ. These changes are pushed as a new exact-SHA checkpoint; the automatic hosted C3 validation must complete before any readiness claim.
- Run #7 (`39768395218`, exact SHA `bf1db966fd872387ca0a4b3cf62a25f9c38cdcaa`) passed both full suites, immutable Run #75 verification, the five-control actual-candidate browser/Word audit, the rendered normal-product browser/Word acceptance, and the fixture-backed Chingford golden regression. Its only failing assertion was the Queensgate diagnostic requiring route 101, although `queensgate.focusRoutes` explicitly contains neither 101 nor 201; route 27 is the only member of the 27/101/201 calendar-control set selected there. The gate now checks those calendar routes only when the current control declares them as focus routes, preserving all three PE1 checks and the Queensgate route-27 check. This is a diagnostic-scope correction, not a service-data or product-rule change; the final hosted resolution is Run #12 below.
- The historical dirty OneDrive `main` checkout was not modified. The C3 checkout is isolated beneath the repository's worktree directory; its exact SHA and clean status are verified after each push and recorded in the final handover response.

### Hosted C3 iteration — X4 rendered short-working closeout

- Run #8 (`39769296843`, exact SHA `d849cbebaed8cc036775216b6792104b89dcb682`) passed every gate then present, but its candidate report showed that X4's Kings School planner note still had no qualification. The browser/Word predicate was also too broad: it could combine an unqualified X4 note with a separate route-27 school-day note and pass. The acceptance predicate was tightened to require route-specific evidence.
- Run #9 (`39770630823`, SHA `1a4c9333b8a04fbaaa2048b2f80e944a57fde81d`) and Run #10 (`39771974081`, SHA `b60a45f03fa59604052c1d7f00df593ad0f87c90`) passed both full suites, immutable Run #75 restore/provenance, actual-candidate diagnostics and five-control candidate browser/Word audit. Both failed only the rendered PE1 X4 browser assertion. A route-specific Word paragraph assertion replaced the cross-paragraph matcher, and the hosted failure was surfaced as a check annotation for diagnosis.
- Run #11 (`39772827949`, SHA `3a84d0c7cadb1cf63c968bd29d613a3f1f37800e`) exposed the remaining product cause: when route-level annotation consolidation encountered duplicate route/endpoint short-working entries, it kept the first unqualified entry and discarded a later qualified entry from the other direction. This erased the school-day qualification from the rendered planner note even though the candidate's short-working identity and source note were available.
- `attachRouteNotes` now enriches a retained duplicate endpoint annotation with the later scoped qualification, upgrades its semantic kind to `short-working` where applicable, and preserves stronger pattern evidence. Regression coverage builds both X4 directions with the same Kings School short working and verifies that the qualified entry survives route-level consolidation. The browser acceptance now asserts that X4 and its Kings School qualification occur in the same rendered note; the Word check requires them in the same short-working paragraph.
- Run #12 (`39773557164`, exact SHA `5663ae56e3e18dc76ea4fdb7570089dcf7acec00`) completed successfully. The full Bus-data Python suite and full `node tests/atlas/run-all.mjs` passed; immutable Run #75 identity, restore and checkpoint provenance passed; actual-candidate planner diagnostics passed; five-control candidate browser/Word audit passed; normal-product browser/generated-Word acceptance passed; fixture-backed Chingford route-657 golden regression passed; and the candidate control-matrix report uploaded successfully.
- Run #12 used the push event on the exact C3 branch and exact SHA. It restored only immutable Run #75 (`39430415441`, artifact `12275615359`, digest `sha256:5cad24e0a47c4a77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`, producer SHA `151199cc914c235870f444d26b03c2309edbd035`). The workflow has no source-acquisition, candidate-build, candidate-mutation, publication, deployment, release or main-merge job. No live source download or national data preparation was performed.
- Run #12 uploaded report artifact `12423462572`, digest `sha256:a98222bb1039b6838d4d6aa26890fefb90f583aa6fd9b831a82f88dbb7e181be`; it remains an unexpired diagnostic artifact. Version/build remain `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`.
- The automation itself remains the exact-branch push trigger documented above. Each documentation or code push also creates a fresh exact-SHA hosted validation; no manual Actions dispatch or credential is needed.

**C3 gate: READY FOR TECHNICAL DIRECTOR REVIEW.** Run #12 is green on exact implementation SHA `5663ae56e3e18dc76ea4fdb7570089dcf7acec00`; this handover documentation update also uses the exact-branch push trigger and therefore receives its own exact-SHA hosted validation.

## S2E-1-C4 — final product trace and evidence closeout

Status: **BLOCKED — TECHNICAL DIRECTOR DECISION REQUIRED.** C3 manual acceptance was rejected after planner-facing frequency, warning, and qualification defects were observed. C4 corrected the proven defects, but the evidence below does not prove every remaining control.

### Tested product, candidate, and hosted result

- Branch: codex/atlas-bus-beta-s2e-1-c4-final-product-trace.
- C4 tested product SHA: 2cc207baea330664c743db027d9e11b3ed7959ee. The documentation reconciliation commit is separate and is not the SHA tested by Run #23.
- Hosted Run #23: ID 39804940981, conclusion success, exact head SHA 2cc207baea330664c743db027d9e11b3ed7959ee.
- Run #23 report artifact: ID 12436993174, name atlas-bus-beta-s2e1-normal-runtime-diagnostic-39804940981, digest sha256:f2bebf1acd24f48c5c6e83ab87c9d8d0bbfefe6ac946fb4153eb7301d0eec7fb.
- Immutable candidate: Run 39430415441, artifact 12275615359, digest sha256:5cad24e0a47c4a77a8ec8616d746bf9f538404420fcb9505f297607632e1a471, producer SHA 151199cc914c235870f444d26b03c2309edbd035. It was restored and verified; it was not rebuilt or modified.

## Run #75 provenance correction — 2026-10-23

The canonical Run #75 artifact digest is `sha256:5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`. The previously transcribed value `sha256:5cad24e0a47c4a77a8ec8616d746bf9f538404420fcb9505f297607632e1a471` was a provenance-record transcription error, not a change to or integrity failure of the candidate. Repository history traces its first occurrence to C3 handover commit `f31123a10ed4c188077a53ab1de1885f8eac4ca4`; C4’s targeted guard/report references were then added in evidence-only commit `485e4f2b5ae6b9bcb19a4619bc94b329d03cf862`. The original Run #75 upload log records the canonical SHA-256 for the uploaded artifact ZIP, and current GitHub artifact metadata reports the same digest. Artifact ID `12275615359`, name `atlas-bus-beta-review-candidate-39430415441`, producer Run `39430415441`, producer SHA `151199cc914c235870f444d26b03c2309edbd035`, and size `2,549,732,499` bytes are unchanged. No candidate bytes were rebuilt, replaced, or modified. Earlier dated handover entries retain their original wording for audit history; their transcribed digest is superseded by this correction.
- Hosted gates passed: complete Bus-data Python suite; complete deterministic ATLAS suite; immutable candidate identity/provenance; actual-candidate planner diagnostic; six-control candidate Browser/Word audit; rendered normal-product Browser/generated-Word audit; and Chingford route 657 golden regression.
- The normal-product Browser/Word audit covered Pipers, Waltham, Chingford, and PE1. The separate candidate Browser/Word audit covered six controls using the prepared national-data adapter; it did not compose Enfield TfL/iBus services through the production authoritative adapter.
- No production code changed after Run #23. No fresh source acquisition, candidate rebuild/modification, publication, deployment, main merge, release, or version/build bump occurred. Version/build remain 2.0.0-alpha.15 / ATLAS-2.0.0-alpha.15-20260914.

### Pipers Lane — route 46 control/radius difference; route 230 retained

- The hosted Pipers control used 51.852700, -0.454343, with a 700 m radius. The three preserved C4 reports (Runs #15, #16, and #23) use the same point and discover the same 11 stops.
- Those stops include Hillcrest Park and Manor Road for routes 230/231. None lists route 46; the reports contain no route-46 planner row or selected-stop timetable population.
- The Product Owner’s prior real Word assessment identifies route 46 at Woodside Animal Farm, approximately 1,216 m away, and Caddington Hall, approximately 1,228 m away. Both are outside the hosted 700 m radius. The control therefore cannot be expected to show those route-46 rows.
- Conclusion: **CONTROL/RADIUS DIFFERENCE — NO C4 PRODUCT DEFECT PROVEN.** Route 46 is not frequency-validated by the hosted Pipers control; no route-46 logic was added or forced into scope.
- Route 230 remains one Centrebus BODS principal circular row via Caddington Woods/Chaul End Road. The actual Browser and Word output shows Mon–Sat approximately every 60 minutes, 06:10–20:10, and Sunday no scheduled service. Frozen selected-stop evidence was 15 weekday, 9 Saturday, and 0 Sunday BODS departures. TNDS remains supplementary. Route 231 remains two separate TNDS directional rows.

### PE1 route 202 — inbound identity comparison remains unresolved

Run #23 presents three route-202 rows at Queensgate: outbound toward Peterborough; inbound toward Austerby; inbound toward Bourne Bus Station.

- Both inbound rows use assessed stop 0590PQG09, ordinary weekday calendars, no weekend service, and show two journeys/day with a 07:10–07:45 period.
- The Austerby row groups BODS records east_midlands:4866:1:d15e1d4bfd6c (destination Austerby) and east_midlands:4866:1:7dc60243305e (destination Bus Station) with TNDS pattern JP_PF0007016:2-45 (destination Bourne).
- The Bourne Bus Station row uses TNDS patterns JP_PF0007016:2-46 and JP_PF0007016:2-48. Its Monday selected-stop population reports VJ38 at 07:10 and VJ39 at 07:45. The Austerby row reports VJ37 at 07:10 and a BODS departure at 07:45 without a journey identity.
- These are different source records and reported TNDS journey IDs, but the same times and stop. The compact Run #23 planner report does not contain the ordered pattern stop sequences, terminal stop identities, or sufficient vehicle-journey lineage to decide whether these are genuinely distinct public patterns or overlapping representations.
- Conclusion: **UNRESOLVED.** The rows were not collapsed solely due to matching frequency, and differing source IDs were not treated as proof of distinct services. No route-202 production change is justified until the frozen candidate pattern/vehicle lineage is compared.

### Enfield — routes 313 and 329 operator evidence

- The committed TfL iBus index is Base_Version 20261009, valid 8 October through (exclusive) 5 November 2026.
- **313:** the index contains six productive patterns and 111 active journeys for 22 October 2026, with operator code MN / Arriva London North. The normal app loads the index manifest and the production authoritative adapter applies iBus enrichment to composed TfL services when the route pattern, assessed stop, and exact endpoints match. The existing focused adapter test verifies a matching indexed 313 service and operator retention through the service and Word projection. Run #23 did not exercise an actual Enfield 313 TfL service through the production Browser and generated Word rows. Thus the complete requested rendering trace is **UNCONFIRMED**; no loss of operator in the actual product path has been demonstrated.
- **329:** the applicable indexed version contains no Service_Line mapping and no productive iBus pattern for route 329. The available Run #23 Enfield normal-runtime report does not establish an alternate same-public-service operator record. The correct evidence-based result is to leave operator blank unless such defensible corroboration exists. Run #23 did not exercise an actual Enfield 329 row through the production Browser and Word, so that rendered blank is **UNCONFIRMED**.
- No operator was fabricated, and no production change was made.

### Other C4 planner-facing controls

- **Waltham:** route 217 retains Arriva London North and the fixture-backed full operating span 04:00–00:59 next day in Browser and Word. The six redundant TfL review warnings and unavailable/incomplete stop-summary contamination are removed. Three specific endpoint-identity review items remain for routes 217, 317, and 327 at stop 210021703420; these are retained as unresolved evidence rather than globally suppressed. The 13 family remains principal 13 with distinct 13A/13B/13C branches and destinations; 13C remains visible within the family.
- **PE1 frequencies:** route 1 toward Werrington shows approximately every 10 minutes irregular Mon–Sat and about every 20 minutes Sunday. Route 5 toward Yaxley shows about every 30 minutes weekdays, 30–45 minutes Saturday, and 60 minutes Sunday. Route 33 shows about every 10–50 minutes toward Roman Close and about every 60 minutes toward City Hospital, Mon–Sat.
- **PE1 qualification/calendar:** route 101 has ordinary public-service rows without the unjustified whole-route non-school-day qualification. X4 remains two regular directional rows, with Kings School represented as a scoped short working. Route 27 retains ordinary service and its scoped school-day branch. Chingford 657 remains school-day-only in the fixture-backed golden regression.
- **PE1 route 102:** four rows remain because the candidate contains supported Towngate/Health Centre service evidence and materially conflicting Queensgate/Peterborough endpoints. The unresolved corridor is retained for review; there is no arbitrary two-row cap.
- **Sources & Checks and parity:** the normal-product report records three route-specific Waltham endpoint items and incomplete-stop/date-specific context; browser Source-column, technical-details visibility, normal Sources & Checks, and Browser/Word material parity assertions passed. There were no Browser console errors, failed requests, failed responses, or external requests in the Run #23 normal-product audit. Four empty-status-manifest responses were intentional local fallbacks, not HTTP failures.

### Remaining gate and tooling review

- Pipers 46 is resolved as a control/radius distinction, not a proven product defect.
- PE1 202 physical-pattern equivalence remains unresolved.
- Enfield 313 operator rendering and Enfield 329 intentional blank have not been demonstrated through the production Browser/Word path.
- Therefore C4 is not ready for manual Product Owner acceptance. Technical Director review remains first.
- Dependabot: configured.
- Codecov: deferred pending a meaningful coverage baseline.
- OpenSSF Scorecard: deferred to a later release/security milestone.
- Sentry: deferred pending telemetry/privacy architecture.
- Renovate: not required alongside Dependabot.

**C4 gate: BLOCKED — TECHNICAL DIRECTOR DECISION REQUIRED.**

## S2E-1-C4 — final correction and evidence closeout — 2026-10-23

This append-only record supersedes the earlier C4 “blocked / unresolved” status above. Historical C1–C3 and earlier C4 findings remain intact for audit history. The reviewed production/runtime SHA is `ae59a3db383a9eb6a89ff1ba0ea0c12248b8f525`; it passed the complete hosted C4 regression as Run #40 before this documentation-only append.

### Run #75 provenance reconciliation

The canonical immutable identity remains Run `39430415441`, artifact `12275615359`, name `atlas-bus-beta-review-candidate-39430415441`, producer SHA `151199cc914c235870f444d26b03c2309edbd035`, size `2,549,732,499` bytes, digest `sha256:5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`. The earlier value `sha256:5cad24e0a47c4a77a8ec8616d746bf9f538404420fcb9505f297607632e1a471` was a transcription error. Its earliest traceable C4 record is the C3 formal handover commit `f31123a10ed4c188077a53ab1de1885f8eac4ca4`; C4 guard/report references using that value followed in evidence-only commit `485e4f2b5ae6b9bcb19a4619bc94b329d03cf862`. The original Run #75 upload log and GitHub's current artifact metadata agree on the canonical digest. Artifact/run/name/producer/size are unchanged; no candidate bytes were rebuilt, replaced, or modified. Earlier dated handovers are preserved rather than silently rewritten.

### Route 313 — proven integrity-gate root cause and general correction

The first loss was the iBus operator-index integrity check, before operator enrichment. The Windows working-tree index bytes were CRLF and matched the manifest's old SHA-256 `39b0eae384ec7a44115f898b940b3f35213577195706d38a82fa97707d2610de`; the committed GitHub/Linux blob is LF and hashes to `5efcf64bfe1e158ecac52a8df8609984600b90ddd9b1b25b5112de7f6e24ebc1`. The manifest therefore rejected the valid index in the hosted Browser path, making the iBus operator adapter unavailable; later layers had no enriched operator to propagate. The adapter-level match had already demonstrated productive 313 pattern `6018`, journey `438477`, code `MN`, operator `Arriva London North`.

The smallest platform-independent correction is in commit `3dceeabd0d1fe736ed2e3f16508abda78dc745e5`: update `atlas/data/tfl-ibus/manifest.json` to the canonical committed-blob digest and mark `atlas/data/tfl-ibus/20261009/operator-index.json -text` in `.gitattributes`, so raw bytes remain stable across Windows and Linux. `tests/atlas/bus-robustness-1a4f-tfl-ibus-operator.test.mjs` now checks the exact raw-byte hash against the manifest. No route/operator/stop-specific production rule was added, and the indexed operator data file itself was not changed.

Successful hosted Enfield Browser/Word evidence is Run #39 (`39926450647`) on SHA `ae59a3db383a9eb6a89ff1ba0ea0c12248b8f525`: the production route-313 Browser row and generated Word row both show **Arriva London North**. The focused report records zero Browser console errors, failed requests, and failed responses.

### Route 329 — legitimate candidate-backed control and safe unresolved result

The control is Enfield Town / Genotin Road, `51.65167, -0.07946`, assessed stop `490006588R`. This point is inside Greater London, where the production app selects TfL stop discovery. The deterministic local API-boundary fixture projects only the exact Run #75 NaPTAN candidate stop identity, coordinates, and route associations; it supplies no timetable or operator. The full production stop discovery, timetable composition, planner, Browser, and Word paths then run against the immutable candidate. No live TfL HTTP request is made and no service evidence is fabricated.

Run #75 has scheduled route-329 BODS evidence at this stop in two distinct records: `london:10984346:0:fba58a0087c5` reports Arriva London North and `london:138490:0:619f986f0e42` reports Arriva London. The applicable 20261009 iBus index has zero route-329 `Service_Line` mappings and zero productive patterns. The production composer therefore cannot select one unambiguous approved operator from the available evidence. It retains the exact unresolved item `Route 329 · Stop 490006588R · timetable source: ... remained unresolved`; the Browser has no resolved 329 service row and exposes the evidence in Sources & checks, while generated Word contains the explicit route-329 review row with Operator blank. This is evidence-driven fail-safe behavior, not proof of a route-329 operator defect. No operator is inferred. A future source record that disambiguates the applicable public service can be evaluated through the same general path.

The targeted C4 Browser/Word report is Run #39, artifact `12489976011`, digest `sha256:10c7a56649c0bcdb770b079dc73c2684d982f032d452da6f902a363cf85c2ceb`. Its readiness is `READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_RE-ACCEPTANCE`; this does not authorize manual acceptance.

### Preserved PE1 route 202 result

Run #40 retained three defensible planner rows: one outbound toward Peterborough Bus Station, one inbound toward Austerby/Helpston, and a separate inbound toward Bourne Bus Station via Bainton. They remain distinct because their candidate pattern/branch identities and principal locations differ. Similar selected-stop times do not establish duplicate public journeys. The Run #40 actual-candidate planner diagnostic and six-control Browser/Word audit passed; the three visible route-202 rows remain in Browser and Word.

### Complete hosted C4 regression

Run #40 (`39926708107`) succeeded as `workflow_dispatch` on exact runtime SHA `ae59a3db383a9eb6a89ff1ba0ea0c12248b8f525`. Every required job step passed:

- full Bus-data Python suite: **309 tests passed**;
- full deterministic ATLAS Alpha.15 suite: **passed**;
- immutable Run #75 identity/expiry verification, exact restore, and retained checkpoint provenance: **passed**;
- actual-candidate planner diagnostic and six-control actual-candidate Browser/Word audit: **passed**;
- rendered normal-product Browser/generated-Word acceptance audit for Pipers, Waltham, Chingford, and PE1: **passed**;
- fixture-backed Chingford route 657 golden regression: **passed**;
- deterministic empty-TfL diagnostic boundary and candidate control-matrix artifact upload: **passed**.

Run #40 report artifact `12489174997`, name `atlas-bus-beta-s2e1-normal-runtime-diagnostic-39926708107`, digest `sha256:748ae02b9747e82e8e49e9809bb4e6239d9b4f6bc35861a91ecee036705bedf8`, was unexpired at verification. The report identifies Run #75 as its candidate and reports acquisition, publication, and deployment as false. Run #40 keeps the Chingford route 657 school-day golden, the Waltham 13/13A/13B/13C family, Pipers 230 circular/231 supplementary presentation, PE1 frequencies/short workings, and the accepted three-row route-202 result under the full gates.

### Final branch, files, limits, and governance

- Branch: `codex/atlas-bus-beta-s2e-1-c4-final-product-trace`.
- Starting branch HEAD before this final correction cycle: `85154a2568d821ece17c9332f388d3571bf42008`.
- C4 runtime SHA tested by Run #40: `ae59a3db383a9eb6a89ff1ba0ea0c12248b8f525`. This formal handover append advances documentation HEAD only; it does not change that tested runtime SHA.
- Exact runtime/evidence files changed since the accepted C4 baseline: `.gitattributes`; `.github/workflows/atlas-bus-beta-s2e1-c4-push-validation.yml`; `.github/workflows/atlas-bus-data-refresh.yml`; `atlas/data/tfl-ibus/manifest.json`; `tests/atlas/bus-robustness-1a4f-tfl-ibus-operator.test.mjs`; `tests/atlas/s2e1-diagnostic-workflow-contract.test.mjs`; `tests/atlas/s2e1-manual-product-audit.mjs`; and `tests/atlas/s2e1-normal-runtime-candidate-diagnostic.mjs`. This formal handover file is the documentation-only addition. No application `.mjs` Bus behavior or candidate data was changed in this correction.
- The isolated checkout is outside OneDrive; local HEAD matched origin and the worktree was clean at Run #40 dispatch. The protected dirty OneDrive `main` checkout was not touched.
- No live national/TfL acquisition, candidate rebuild or modification, publication, deployment, main merge, release, version/build bump, or BUS-POLISH work occurred. Version/build remain `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`.
- Dependabot: configured. Codecov: deferred pending coverage baseline. OpenSSF Scorecard: later security/release milestone. Sentry: deferred pending telemetry/privacy architecture. Renovate: not required alongside Dependabot.

**C4 gate: READY FOR TECHNICAL DIRECTOR REVIEW. Product Owner manual acceptance remains unauthorized until that review is complete.**