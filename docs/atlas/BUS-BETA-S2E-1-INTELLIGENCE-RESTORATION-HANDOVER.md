# BUS-BETA-S2E-1 — Intelligence Restoration Handover

Status: **READY FOR TECHNICAL DIRECTOR REVIEW**. C2 corrected the remaining frozen-candidate calendar defect and passed the exact-SHA hosted regression and normal-product browser/Word audits. Product Owner manual acceptance has not occurred.

## Accepted production revision and candidate provenance

- Reviewed production SHA: `4408c790ca3ff88adee15f2da064c2002e0a4a7e`.
- Branch: `codex/atlas-bus-beta-s2e-1-intelligence-restoration`.
- Immutable candidate: Run `39430415441`, artifact `12275615359`, name `atlas-bus-beta-review-candidate-39430415441`, digest `sha256:5cad24e0a47c4a77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`, producer SHA `151199cc914c235870f444d26b03c2309edbd035`.
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
