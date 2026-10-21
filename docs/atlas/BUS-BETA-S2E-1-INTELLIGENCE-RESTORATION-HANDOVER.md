# BUS-BETA-S2E-1 — Intelligence Restoration Handover

Status: **READY FOR MANUAL RE-ACCEPTANCE**. The Technical Director accepted the production correction and exact-final-SHA offline preflight as technically consistent. Manual acceptance of the frozen candidate remains the next review gate; this document does not claim that manual acceptance has already occurred.

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

No further GROUP, DEST, CIRC, source-arbitration or frequency correction is indicated by the final hosted tests.

## Final control results

### Waltham Cross — routes 13/13A/13B/13C

Production-composition audit of the exact candidate produced one planner family with principal route `13` and members `13`, `13A`, `13B`, and `13C`. The child destinations remain distinct: route 13 to The Talbot, 13A to St Margaret’s Hospital, 13B to Waltham Abbey (Princesfield Road), and 13C to Two Brewers.

Route 13C remains a separately visible branch because its destination/pattern is materially distinct. Family membership communicates its shared route family; it does not erase the branch endpoint or merge its timetable into the 13 principal. This preserves both the common family identity and the service a passenger can actually select.

The representative family timetable is approximately every 30 minutes Monday–Friday and every 60 minutes Saturday, with no Sunday service; the reported operating periods are approximately 06:30–18:10 weekdays and 08:40–15:40 Saturday. The deterministic diagnostic made zero live TfL requests and read the frozen national candidate. No Waltham-specific authority rule was added.

### Pipers Lane — routes 230/231

- **230:** three source records (one BODS, two TNDS) form one planner row. The Centrebus BODS pattern is the circular principal, with a proven same-physical-StopPoint closure and 34 ordered stops. TNDS remains a supplementary open-pattern variant in the audit and no longer vetoes BODS circular presentation. The planner reports approximately hourly service daily, approximately 06:10–20:10.
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
- **Warning scope:** the four national controls report no failed-source, unavailable-timetable or “needs review” warning. Warnings are limited to evidence actually observed: deterministic empty TfL response/scope and timestamp metadata, TNDS special-day operating metadata, and date-specific timetable changes. These remain visible as source/date caveats and do not erase valid national evidence.
- **Sources & checks / technical details:** the actual candidate’s BODS/NaPTAN and TNDS manifests and required shards loaded successfully for each control; no live TfL calls occurred. Source IDs, provider authority, pattern evidence, calendar evidence and unresolved grouping reasons remain available for technical inspection. Pipers 230 technical details identify BODS as the circular principal and TNDS as supplementary.
- **Browser Source column:** the real-candidate browser audit passed with Source in the final column after Operating period at stop (following the Include selector), as specified by the browser contract.
- **Word/browser parity:** the five-control real-candidate browser and Word audit passed. The Word output remained aligned with the browser planner rows and did not introduce source-specific duplication or omit the retained route/branch rows.

## Hosted validation and evidence

### Run #104 — frozen candidate / production-composition diagnosis

- Exact workflow run ID: `39602997240` (Run #104).
- Result: **success** on SHA `4408c790ca3ff88adee15f2da064c2002e0a4a7e`.
- Artifact: `12348395975`, `atlas-bus-beta-s2e1-normal-runtime-diagnostic-39602997240`, digest `sha256:08e3683cf60d753d78a3d5d364212a204c7471d8dbe12ea7b09a9e73d3302bbe`.
- Passed: full Bus-data Python suite; `node tests/atlas/run-all.mjs`; immutable Run #75 identity/provenance verification; five-control actual-candidate planner assertions; browser/Word audit; fixture-backed Chingford TfL route 657 golden regression.
- The strengthened Pipers 230 assertion passed: final planner row is circular and its principal source record is the Centrebus BODS pattern.

### Run #105 — exact-final-SHA zero-download preflight

- Workflow run ID: `39603015375` (Run #105).
- Result: **success** on exact SHA `4408c790ca3ff88adee15f2da064c2002e0a4a7e`.
- Artifact: `12347203937`, `atlas-tnds-trust-offline-preflight-39603015375`, digest `sha256:c2d4955d7171c5b2e80800e1d0615cce3d366dbb42b9af14c2030d84fa260356`.
- Evidence records `snapshotAcquired=false`, `tndsSecretsInjected=false`, `tndsFtpCalled=false`, `retrievalPerformed=false`, `boddsAcquired=false`, `publicationAttempted=false`, and `deploymentAttempted=false`; `plannerEligible=false`.
- Passed: full Bus-data, TNDS and workflow-contract suite; deterministic Alpha.15 suite; exact C1B offline selector/evidence checks.

## Safety, branch state and remaining gate

- Fresh source acquisition: **NO**.
- Candidate rebuild: **NO**.
- Candidate modification: **NO**.
- Publication/deployment: **NO**.
- PR/merge/release: **NO**.
- Local national extraction/preparation: **NO**; the existing `.tmp/` outputs were preserved.
- At the reviewed production SHA, the isolated worktree was clean and origin matched exactly. The documentation closeout advances branch HEAD; the closeout commit is verified clean and in origin parity after push. Its diff contains this document only; no production, test or workflow file changed.
- No new code defect was identified by the completed hosted candidate and regression gates. Remaining source caveats are special-day/date-specific timetable metadata and the unresolved corridors expressly listed above; these are surfaced rather than silently merged. The remaining acceptance gate is Product Owner manual re-acceptance of the unchanged Run #75 candidate.

**Recommended gate: READY FOR MANUAL RE-ACCEPTANCE.**
