# BUS-DATA-PREP-1-C1 — Coverage Semantics Handover

## Executive verdict

Local implementation and evidence gates pass on the isolated C1 branch. The branch has been pushed and is ready for Technical Director review, not acceptance: exact GitHub Actions execution remains outstanding because the available CLI/API dispatch credentials are invalid and no workflow-dispatch connector is available. No merge, deployment, or Beta promotion was performed.

## Repository, branch and baseline

- Repository: `transport-planner-toolkit`
- Branch: `codex/atlas-bus-data-prep-1-c1-coverage-semantics`
- Worktree: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\atlas-bus-data-prep-1-c1-coverage-semantics`
- Exact starting commit: `d3547aef45caacf267ebbbb4d2d288a52dbb4bcb`
- Starting worktree was clean; fetched remote `origin/codex/atlas-bus-data-prep-1-national-coverage-ledger` and verified the baseline before edits.
- Toolkit version/build remains `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`.
- Implementation commit and final branch SHA: recorded in the completion message; the working tree is checked before publication.

## Why C1 was required

The PREP-1 model overloaded bus-domain membership and expected timetable calls, treated lack of a resolved call as confirmed service absence, hid source-level unresolved GTFS stop identities behind stop classification, and allowed unrelated timetable failures to contaminate stop-local conclusions. The frozen workflow also hard-coded snapshot identity and called a legacy comparison with a live NaPTAN fallback.

## Authoritative stop-type interpretation

Authority consulted: Department for Transport, *NPTG and NaPTAN Schema Guide*, NaPTAN/NPTG schema 2.5, document v0.67, issued 8 January 2014; official PDF: <https://naptan.dft.gov.uk/naptan/schema/2.5/doc/NaPTANSchemaGuide-2.5-v0.67.pdf>. Consulted 13 October 2026. Stop-point location semantics are in Table 3-14 (PDF p.74); allowed StopType values are in Table 6-1 (PDF pp.102–103). The guide defines BCE as a station entrance, BST as a station interchange/access area, BCS as a station bay/stand/stance, and BCQ as a variable station bay. BCT is the on-street bus/coach stop type. BCP is the legacy `busCoachPrivate` value; the guide’s version history notes its replacement by a public/private flag in the 2010 schema line. BCP is therefore treated as bus-domain and timetable-call-context-dependent, not silently treated as either an entrance or a normal public boarding point.

The prepared-data contract now carries independent `busDomainEligible`, `timetableCallEligible`, and `timetableCallExpectation` fields. BCE/BST remain physical bus-domain infrastructure and StopArea members but are not timetable call points. BCT/BCS/BCQ are call-eligible. BCP eligibility is `null`/context-dependent and retained if explicit schedule evidence exists. The old `busPreparedEligible` alias remains for compatibility and means bus-domain membership only.

## 0590B forensic closeout

The ledger now inspects frozen BODS `stops.txt` independently of `stop_times.txt`; both tests use only exact allowed identities (GTFS `stop_id` = ATCO code or `stop_code` = NaPTAN code). The 0590B report carries each source StopPoint’s type, status, coordinates, StopArea refs, sibling/member types, independent BODS stops.txt records, stop_times call count/routes, unresolved identity evidence, and prior shard metadata.

The verdict is REVISED. All four active `0590BCE` records are station entrances in StopArea `059GPB25`; they remain physical bus-domain records but are not timetable call points. Each has zero exact BODS `stops.txt` identities and zero resolved calls. The prior `0590B` missing-shard defect was therefore not evidence of missing schedules at those entrances. In the same StopArea, 18 of 20 BCS members have exact GTFS `stop_id` = ATCO identity and resolved call evidence; `0590PC900` and `0590PQG17` have no current primary timetable identity/call and remain unconfirmed, not “no service.” Full per-stop detail and route list are in [BUS-DATA-PREP-1-C1-0590B-FORENSIC.md](BUS-DATA-PREP-1-C1-0590B-FORENSIC.md).

## Ledger semantics, trust and gates

Final states distinguish current timetable evidence, bus-domain non-call points, no current primary timetable evidence, unresolved identity, incomplete source, preparation rejection/error, inactive/legacy, and outside-scope records. Absence of a primary timetable match is never labelled confirmed service absence; the ledger explicitly emits `confirmedNoCurrentService: 0` and `serviceAbsenceConfidence: NOT_ESTABLISHED_BY_ABSENCE_FROM_PRIMARY_TIMETABLE_EVIDENCE`.

StopPoint structural classification and source identity trust are separate measures. All 436,777 relevant source StopPoints have a final state and the national gate passes with zero unclassified remainder and zero preparation errors. Across the frozen source window there are 42,159,591 relevant scheduled-call records: 42,154,683 resolved and 4,908 unresolved, with zero malformed records and balanced per-region identity conservation. The 4,908 remain source-level unresolved identity evidence and are not reassigned to StopPoints. Coverage reports 249,279 records with current timetable evidence, 161 active bus-domain non-call points, and 126,228 with no current primary timetable evidence. `confirmedNoCurrentService` is 0; absence from this primary timetable window is explicitly insufficient to establish absence of service.

## Runtime stop-scoping, PE1 and protected controls

The planner runtime now has exact-stop checked/failure evidence precedence. A stop with exact successful evidence is not contaminated by unrelated `failedRequests` or route-number-only unresolved evidence. Failures bind to their actual affected StopPoint IDs; repeated route numbers remain stop-scoped. Station infrastructure is not requested as a timetable shard. Shard review items attach to affected IDs when known.

Same-runtime Queensgate PE1 replay through adapter → application → Word-table builder: PREP-1 and C1 both retained 47 nearby stops, 38 route-bearing stops, 193 service records, and 132 service summaries. PREP-1 was `partial`, produced a missing 0590B shard diagnostic attached to BCE entrance stops, and labelled the four entrances `SOURCE_UNAVAILABLE`. C1 is `complete`, issues no 0590B shard request for those infrastructure points, labels them `NOT_A_TIMETABLE_CALL_POINT`, and retains the same Word service-summary table. Focused runtime tests, Waltham Cross, London, GROUP/DEST/CIRC regressions and the full Alpha.15 deterministic Node suite pass.

## Frozen-source workflow

The reusable diagnostic workflow now receives expected snapshot ID, source count and total bytes as required inputs and verifies all three strictly. The refresh workflow passes explicit operator-selected expected values. The legacy v1 shadow diagnostic is removed from frozen workflow gates; its script no longer has a live NaPTAN/BODS acquisition fallback and requires explicit local input files. No fresh national operational-data acquisition occurred in this sprint; only the existing frozen snapshot was verified and read. Remote GitHub Actions was not run: the configured GitHub CLI/API credential is invalid, and no authorized workflow-dispatch connector is available. Git transport credentials did permit pushing the branch. The exact remote execution is still required before acceptance.

## Candidate, evidence and verification

- PREP-1 control candidate remains at `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\work\atlas-bus-data-prep-1-national-coverage-ledger-candidate-final` and was not modified.
- Frozen snapshot remains at `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\data-snapshots\atlas-bus-data-acq-1-primary-20261013`; final strict verification returned the expected ID `cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde`, 11 sources and 2,244,572,632 bytes. No snapshot files were written.
- C1 candidate: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\work\atlas-bus-data-prep-1-c1-coverage-semantics-candidate-final`.
- C1 runtime bus tree: 1,630 files / 142,004,678 bytes, SHA-256 `19656c5dd1d35f3efcb0f7891d3e8e649b4ad3fe6975d3f3ab66fffe0759693c`. PREP-1 comparison: 1,630 files / 139,617,722 bytes, SHA-256 `41a3044cfdc115b00cb4ea32076f462a2b5b7e8e763d3710ac05a36ad1125c14`. Runtime-tree increase is 2,386,956 bytes (~1.71%).
- Whole diagnostic candidate: PREP-1 1,648 files / 2,118,288,810 bytes; C1 1,638 files / 561,044,700 bytes. C1 is 1,557,244,110 bytes (~73.5%) smaller and has no `.atlas-diagnostic-source-cache`; the PREP-1 control remains untouched. The reduced size is due to omitting copied raw BODS archives from the candidate, not dropping the verified input snapshot.
- Candidate fingerprint: `b4446f532cc6a8e0bc61f36969ba755b5a53ae0a78877b76685438bd43b01a04`. C1 prepared manifest SHA-256: `707C1CC360EA905FA2E3C57A72C4C5F41D064A9F20448FE85DC3F9533591FF5E`.
- Evidence SHA-256: `coverage-ledger.json` `AEE79D3DD4A91B9C384021CD9C54989BE89789E6E10A2AEF467A55970C1C7731`; `gap-report.json` `709D6BA6B670D4DD2C6C929D75F066B6063E6F1996BA31A9D8C20D9E1C702D2A`; `0590B-forensic.json` `782BA163FB4BC2E3DF69A4656F8DAAB8DC3030BC97F7F730940B2E964FAA4644`; `structural-scan.json` `017E1E998DD06A3C5D222826D7E4DC0DBF4F9DCB01A30F98E66FA0A1D66250EF`; `candidate-measurement.json` `419C9723AE4F547D457869449BF7F908627DCA6B32DF02D0AC81F661DD147690`; `PE1-review.json` `8A912099C332D5444CEFEDAB23AEA82C8B7A97E2707EBCCC215AC268E7C2A6D3`.
- PREP-1 controls: manifest SHA-256 `DD3015D3F82245070B65D7C5325B06227DAC463E304C196478FA0161DE0348DE`; coverage-ledger SHA-256 `105C59DF38D45BB94F8EACFA8ED3213B849609C72DFD8AAB12E87895D7245FE1`.
- Verification: 100 Python tests pass; full `node tests/atlas/run-all.mjs` passes with `ATLAS Alpha.15 deterministic suite passed.`; `git diff --check` passes. Candidate hard validation and the final national coverage gate pass; aggregate structural scan reports `runtimeIntegrity.failClosed: false` (347 retained source-anomaly findings, with zero unsupported structures and zero malformed required source records).
- Remote parity: branch `codex/atlas-bus-data-prep-1-c1-coverage-semantics` was pushed successfully to `origin`; the push created the upstream ref at the implementation SHA. GitHub CLI/API inspection and workflow dispatch were unavailable, so no Actions run is claimed. Exact GitHub Actions execution is required before acceptance.

## GitHub Tooling Adoption Review

- Dependabot — worthwhile after C1 acceptance for repository dependency alerts and update PRs; no configuration change in this sprint.
- Codecov — useful only after a stable test-coverage baseline and CI upload path are agreed; not an immediate C1 dependency.
- OpenSSF Scorecard — sensible after repository workflow permissions and release boundaries are reviewed; no installation now.
- Sentry — not a fit for this offline deterministic data-preparation sprint; consider only with an authorized production telemetry/privacy design.
- Renovate — overlaps Dependabot; choose one updater after governance review rather than installing both.

This sprint does not reach an installation milestone. Tool adoption is deferred until C1 review and should start with repository-native security/update automation, not runtime telemetry.

## Known limits, deferred work and recommendation

No fresh source was acquired; no TNDS source was acquired or activated. The source snapshot’s approximately 4,908 unresolved scheduled-call identities cannot be mapped to individual NaPTAN stops without a permitted exact identity; they remain source-level unresolved evidence. `CONFIRMED_NO_CURRENT_SERVICE` is intentionally not claimed. Further source-identity reconciliation belongs to BUS-DATA-TRUST-1. BUS-POLISH and production-updater work were not started.

Final technical-director recommendation and any remote-readiness blocker will be entered only after all required local checks finish.
