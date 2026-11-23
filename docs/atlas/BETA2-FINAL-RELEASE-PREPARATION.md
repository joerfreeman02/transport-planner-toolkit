# ATLAS Bus Beta.2 — Final release preparation

**Date:** 20 November 2026
**Candidate branch:** `codex/atlas-bus-beta2-blockers-20261118`
**Candidate base:** `94ff148a35a82f1bf45a9d8da5aa617b599e4a75`
**Candidate version:** `2.0.0-beta.1` (unchanged pending Product Owner approval)
**Prepared data:** immutable Run #75; no source acquisition or refresh was run.

This is a release preparation and engineering handover. It is not Product Owner acceptance, a release approval, a merge, or a deployment.

## Corrections in this checkpoint

1. **Peterborough 4P presentation.** Professional service tables no longer use the internal phrase “Unresolved — review Sources & Checks” for a missing principal-location pattern. The fallback now reports that a demand-responsive service area is shown and that specific locations were not supplied. Where retained published service text identifies both CallConnect and a demand-responsive area, the report also explains that operations are flexible, timetable times are notional, and journeys must be booked in advance. The source record and its unresolved pattern are retained for internal review.
2. **Text entities.** Common named and numeric HTML entities are decoded once at the planner-facing text boundary. Rendered text remains text; no HTML interpretation is introduced and source snapshots are not modified. “Merck Sharpe &amp; Dohme” and “Z &amp; S Buses” now present as “Merck Sharpe & Dohme” and “Z & S Buses”.
3. **Hoddesdon Route 907A.** The Run #75 retained records show two distinct source populations at the same Brookfield Centre destination: Lister Hospital-origin Sunday journeys (7) and Stevenage Bus Station-origin Sunday journeys (2). The summary labels both origins and reports the figures separately; it does not add them into an ambiguous total or change the Route 907/907A schedules.
4. **Route-family note scope.** Where separate source variants share the same destination name, the planner note includes their origins. Other route-family summaries keep their prior presentation.

The corrections are covered in `tests/atlas/beta2-final-release-blockers.test.mjs` and the presentation, assessment, and manual product audit tests. Existing source identity, service grouping, calendars, frequency, authority, boarding roles, and Run #75 inputs are preserved.

### Source evidence

- LincsBus states that CallConnect is pre-bookable and demand-responsive, and that a passenger cannot board without a reservation: [CallConnect FAQs](https://lincsbus.com/callconnect/callconnect-faqs/).
- LincsBus explains the booking window and availability qualifications: [CallConnect app and booking information](https://lincsbus.com/callconnectapp/).
- The published 4P timetable entry explicitly marks its times as notional and requiring advance booking: [4P Stamford & Peterborough CallConnect timetable reference](https://bustimes.org/services/4p-stamford-peterborough-callconnect-stamford-pete).
- Route 907A origin labels and counts come from the separate retained Run #75 source identities `south_east:3051755:0:51aad27383ce` (Lister Hospital to Brookfield Centre) and `south_east:3051755:0:f17d80f2683b` (Stevenage Bus Station to Brookfield Centre), replayed at Hoddesdon Clock Tower. They are disjoint journey populations in the retained source, not overlapping counts.

## Verification and disposition

| Check | Result |
|---|---|
| Focused presentation, assessment, blocker, group runtime, and candidate checkpoint tests | Passed |
| Full deterministic Node suite using Run #75 Bus, TNDS, and iBus roots | Passed: `ATLAS Alpha.15 deterministic suite passed` |
| Python static-index suite | Passed: 21/21 |
| Full Python preparation suite | 310/311 passed; one pre-existing lineage test failed as described below |
| Full Run #75 Browser/Word/A3 audit | Passed: 16 controls, zero assertion failures; exact final report `tmp/release-blocker-16-control-code-final-retry.json` |
| Recorded TfL replay | 135/135 recorded requests matched; zero misses, unused responses, failed requests, or unexpected external requests; two expected HTTP 400 responses at Tufton StopPoint `490005180E` remained visible as scoped evidence |
| Required standalone controls | Abbotts Rise full-radius, Hoddesdon, and PE1 actual Browser/Word outputs passed their audit assertions |
| Actual Word visual inspection | PE1 and Hoddesdon Word exports opened in desktop Word. PE1 service-table fallback and booking note were visible and legible; Hoddesdon route 907A origin counts were separated. No internal review instruction or literal `&amp;` was visible in inspected output text. Six-page PE1 and three-page Hoddesdon documents rendered with embedded maps and service tables. |
| Syntax and whitespace | Changed JavaScript files passed `node --check`; `git diff --check` passed after documentation updates |
| Acknowledgement and export gate | Full audit assertions passed; acknowledgement remained required and no bypass was introduced |

The broad Python result is **not** treated as a software correction failure in this worktree. Its single error is `test_run_42_three_stop_evidence_per_service_is_bounded_and_reconciles_incrementally`: the fixture requires checkpoint producer commit `39e142767946aa31ecf0f87544e6d7491ca90297` to be an ancestor of this controlled branch. It is not an ancestor of the reviewed Beta.2 history (`git merge-base --is-ancestor` returned 1). The lineage assertion was not weakened, no unrelated history was merged, and the fixture/test was not rewritten. Disposition: retain the failure as a known branch-lineage/environment gate for Technical Director review; run that controlled checkpoint rehearsal on its intended lineage before any wider release claim.

Run #75 identities remain Bus manifest `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f`, TNDS manifest `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`, and iBus manifest `3090e1da6da21878725d0b30343757bd32c65fcdd56d9fdecb6f6ae6c75b5d53`, with declared iBus index `39b0eae384ec7a44115f898b940b3f35213577195706d38a82fa97707d2610de`. No prepared data was changed.

## Release-risk register

| Risk | Classification | Disposition for controlled internal use |
|---|---|---|
| Route 24 set-down-only terminal call | Source/boarding-role limitation; a terminal arrival may not offer useful boarding | Keep service-role warning in Sources & Checks. A planner must verify the operator's current boarding permission before relying on the terminal call. Do not claim it as an ordinary departing service. |
| Route 231 Saturday/calendar conflict | Conflicting source evidence and calendar limitation | Preserve the selected supported days and the source conflict warning. Verify the current operator timetable for Saturday use. Do not infer missing operating days. |
| Route 16/16C terminal role and endpoints | Source-identity and endpoint uncertainty | Keep unresolved endpoint/terminal warnings visible internally; independently confirm exact boarding/alighting point and direction before use. |
| Supplementary TfL evidence gaps | Secondary evidence coverage limitation | National-authority records remain primary outside TfL's returned StopPoint records; TfL evidence can supplement or explicitly fall back where documented. Show request failures and source identities; never describe a gap as no service. |
| Frozen Run #75 data freshness | Snapshot is immutable and not a live timetable feed | State the snapshot date and refresh before formal reliance. This closeout did not refresh national data. |
| Remaining source-data discrepancies, including N555/555 | Upstream provider data limitation | Retain review qualifications; do not fabricate schedules, calendars, or replacement journeys. N555/555 remains a known TNDS source-data limitation and was not reopened. |
| Broad Python checkpoint lineage failure | Test fixture/repository-lineage limitation | Preserve the failing ancestry assertion. Technical Director to decide whether the required checkpoint test belongs in this branch's release gate or must be run from its producer lineage. |

These are professional review responsibilities and source limitations, not evidence that every national timetable has been independently verified. The newly corrected entity, missing principal-location presentation, and ambiguous same-destination Route 907A note were confirmed software presentation defects and are addressed in this checkpoint.

**Recommendation:** a controlled internal Beta.2 deployment can be considered only after Technical Director review, Product Owner re-acceptance, and explicit acceptance of the source and freshness qualifications above. The 310/311 broad Python result should remain on the approval record. Do not make a blanket “all timetables verified” claim. This document does not grant deployment approval.

## Prepared release plan — not executed

### Version and build

Keep the working candidate at `2.0.0-beta.1` until Product Owner acceptance of Beta.2. If approved, use `2.0.0-beta.2` and a new date/SHA build marker generated by the existing build process. Do not pre-label this working branch as an accepted release.

### Integration and pre-merge gates

1. Technical Director reviews the exact candidate SHA, scoped diff, release risks, test evidence, and Python lineage disposition.
2. Product Owner accepts the actual candidate in the isolated review environment and records acceptance against the exact SHA.
3. Confirm the feature branch is a fast-forward of the frozen approved base and that `main` is unchanged; fetch and inspect both refs immediately before integration.
4. Re-run focused tests, the full deterministic Node suite, Python static-index tests, the agreed Python checkpoint/lineage rehearsal, the 16-control Browser/Word/A3 audit, and the 135-response TfL replay against immutable Run #75. Verify source manifests and absence of refresh/acquisition.
5. Merge by the repository's approved normal integration procedure only after all required checks are green or the documented lineage disposition is explicitly accepted. Do not force-update the branch or `main`.
6. Run release validation on the resulting exact `main` SHA. Add a release tag only after separate release approval; tag only the validated `main` SHA.

### Recovery and rollback

Before integration, record the current accepted `main` SHA and retain the exact current deployment package. If validation fails before deployment, stop and keep `main` unchanged. After an approved deployment, rollback means restoring the prior accepted package/build and pointing the internal application back to its recorded main SHA using the established operations procedure; preserve logs and user reports, then re-run post-rollback smoke checks. Never rewrite `main` history or force-push to recover.

### Internal staff checklist

- Confirm the approved Beta.2 version/build, exact SHA, Run #75 manifest identity, and snapshot date in About/release notes.
- Read the route-specific limitations above; keep professional planner review in place.
- Check Sources & Checks for each assessment and acknowledge actionable evidence before export.
- Confirm the site, logical stop group, physical stops, direction, boarding role, days/calendars, and service qualification against operator evidence where material.
- Report source discrepancies and output issues with the build SHA and assessment timestamp; do not treat a missing provider record as proof of no service.
- Do not promise fresh national data or automatic updating.

### Post-deployment smoke tests

1. Open the internal app and confirm the approved version/build and candidate identity.
2. Complete one controlled nearest-stop assessment and one full-radius assessment using the agreed golden controls.
3. Confirm map rendering, physical stop selection, route/direction rows, Sources & Checks, mandatory acknowledgement, Browser/Word parity, and standalone A3 map export.
4. Confirm review warnings stay out of professional Word/A3 text while factual service qualifications remain.
5. Inspect logs for uncaught errors or unexpected external requests; do not start source refresh as a smoke test.
6. Record the actual operator and snapshot freshness caveats in the deployment record.

### Release-note draft

**ATLAS Bus Beta.2 candidate hardening:** improved truthful presentation for demand-responsive services with unresolved principal-location data; added the source-supported CallConnect pre-booking/notional-time qualification; corrected one-pass HTML entity decoding in report-facing text; and distinguished separate Route 907A Brookfield Centre journey populations by origin. Timetable/source snapshot remains Run #75 and may be stale. Existing Route 24, Route 231, Route 16/16C, TfL supplementary coverage, and N555/555 source limitations remain subject to planner verification. This is not a claim that all national schedules have been checked.

### Product Owner acceptance checklist

- Review the exact committed SHA and displayed version/build in the local review environment.
- Confirm PE1 Route 4P wording and booking qualification in Browser and Word.
- Confirm Hoddesdon Route 907A shows Lister Hospital-origin 7 Sunday journeys and Stevenage Bus Station-origin 2 Sunday journeys separately.
- Confirm Hoddesdon and Milton Keynes provider names display without HTML entity strings.
- Confirm the seven supplied control assessment types and the full 16-control audit results, including acknowledgement and map exports.
- Review and explicitly accept or reject the route/source/freshness risks and the documented 310/311 lineage disposition.
- Record approval against the exact candidate SHA. Product Owner re-acceptance does not itself merge or deploy.

## Architecture and tooling follow-up

No architecture change, CSS modularisation, dead-code cleanup, FORGE GitHub migration, or automatic updater work was included. The national automatic updater remains the next engineering priority only after accepted Beta.2 deployment. Tooling review: Dependabot remains configured; Codecov, OpenSSF Scorecard, and Sentry remain deferred; Renovate remains deferred in favour of Dependabot. No tooling was installed or changed.

## Operational status

This checkpoint contains only the reviewed application/presentation correction, regression coverage, and handover documentation. The local review environment must identify the final committed candidate SHA and immutable Run #75 roots before the review URL is handed to the Product Owner. No merge, tag, release, deployment, source refresh, or updater work is authorized by this preparation record.

## RE-1-C1 release-engineering addendum — 23 November 2026

The later RE-1-C1 correction supersedes this document's assumption that hosted Run #75 contains a coherent iBus mount. The original Run #75 artifact remains immutable; its mounted iBus manifest/index pair is mixed. A separately provenance-bound historical iBus pair from the retained C1 source branch now supplies the frozen regression fixture while preserving the Run #75 Bus/TNDS roots. The current live iBus manifest/index was independently read and verified as a coherent, distinct publication.

The app-only release boundary now requires the exact selected application checkout for tests and assembly, an exact reviewed-file manifest, and a separately approved live-data identity. Hosted validation cannot be complete without an exact hosted 135-response replay; the retained capture includes assessment coordinates and workstation-specific metadata, so it was not placed in public GitHub artifacts. Hosted replay, full Browser/Word/A3 audit, Python static-index run, live-identity approval, and end-to-end rollback remain release gates. The successful Beta.1 publication run `40340530395` independently establishes the published application source as `108d898221f84c78c061db4f81335dcd911d6a0e` and its run-specific data publication version; the exact Pages ZIP itself is no longer available as a downloadable Actions artifact. No production operation was performed. See [the RE-1 handover](BETA2-RE1-RELEASE-ENGINEERING-HANDOVER.md#re-1-c1-correction--23-november-2026) for the source hashes, test outcomes, exact limitations, and approval checklist.

## RE-1-C2 final evidence addendum — 23 November 2026

A privacy-reviewed deterministic 135-response replay fixture is now checked in at `tests/atlas/fixtures/tfl-replay/tfl-replay-c2.json.gz`; it preserves the recorded response bodies/status/order, including the two HTTP 400 responses, while redacting workstation-specific metadata and pseudonymizing only two assessment-coordinate query pairs. Its independent SHA-256 is `a08322168fc8651c37ba3b412ef315513a707ba02c142c28f11f145df433c1f0`. The pre-merge workflow now runs the full 16-control Browser/Word/A3 acceptance on ordinary push/PR events against the exact PR head SHA and fails if report privacy/completeness checks are missing. See the C2 handover addendum for source provenance, transformations and test evidence.

The approved live-data identity must hash the full status manifest as well as the source config and Bus/TNDS/iBus identities. A local candidate digest was computed from the 23 November public metadata, but it is not Product Owner approval. The status is diagnostic-only and not production-eligible, the data candidate timestamp is 20 October, and iBus validity ended 5 November. The proposed Beta.2 app-only artifact was assembled locally from application SHA `365b1d34ff5117a3e015edea6e57d8c252cf8675`, with the current configuration/status/iBus files preserved and national payload trees excluded; incorrect approval digest verification failed closed. No deployment or data refresh ran.

The historical Beta.1 source package can be rebuilt from published app SHA `108d898221f84c78c061db4f81335dcd911d6a0e`, but the exact published ZIP is not retained. Its attempted 16-control replay did not satisfy the Beta.2 acceptance contract and did not establish acknowledgement/Word/A3 parity. Treat historical recovery as partial. Full hosted exact-head validation, a passing rollback rehearsal with complete payload availability, administrator policy verification, Technical Director acceptance, Product Owner acceptance, and separate deployment authorization remain required. Production and main remain unchanged.
