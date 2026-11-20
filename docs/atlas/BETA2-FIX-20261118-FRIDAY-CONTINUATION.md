# ATLAS Beta.2 — Friday 20 November continuation

**Status:** unreleased WIP; Technical Director review: NO; Product Owner re-acceptance: NO. Continue only on `codex/atlas-bus-beta2-blockers-20261118` in the isolated worktree `C:\Users\joe.freeman\.codex\worktrees\atlas-beta2-blockers-20261118\atlas-beta2-known-defects-hardening`. Preserve the original dirty review checkout at `C:\Users\joe.freeman\.codex\worktrees\atlas-po-defect-correction\atlas-beta2-known-defects-hardening` and the verified recovery patch (SHA-256 `92E9F654815F2C8EE1B3634096B095C688EF72E39FA4F5559C6EE8074C7D3D22`).

## First action

Find a working Python 3 interpreter and run `tools/atlas-bus-data/test_build_static_index.py`. The current session had no runnable Python; do not call that test passed until it runs successfully.

## Remaining blockers and sequence

1. Re-run the final focused JS checks and the full deterministic ATLAS suite using the frozen Run #75 Bus/TNDS and verified TfL iBus manifests. Do not refresh data.
2. Reproduce and correct only the 13-control audit regressions: Waltham Route 212 frequency-basis ID, Abbotts Rise Route 25B family membership, PE1 Route 202 arriving-journey terminus evidence. First identify each first incorrect transformation; protect the out-of-scope grouping architecture.
3. Obtain a text-readable copy or manually inspect the official June 2026 Route 231 PDF. Map evidence to exact stop identities `021024640`, `021028151`, `021013516`; reconcile effective date, direction, calendar and journey identity against Run #75 without rewriting the snapshot. Keep warnings at the supported physical stop.
4. Confirm current Route 16/24 role disclosures in actual Browser and Word output, preserving the independent Route 24 endpoint warning and Route 16C Sunday 19:45 control.
5. Re-run the complete 13-control Browser/Word/map audit with captured TfL evidence; document every remaining failure without broadening scope.
6. Verify isolated/original worktrees, backup hashes, staged path list and diff. Create an explicitly WIP local checkpoint and normal-push only if the remote branch has not advanced and the push is fast-forward. Otherwise retain the local checkpoint and create a Git bundle. Never force-push, merge, tag, release, deploy, change version, or refresh national data.

Frozen baselines: Run #75 Bus manifest `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f`; TNDS manifest `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`; iBus manifest `3090e1da6da21878725d0b30343757bd32c65fcdd56d9fdecb6f6ae6c75b5d53` with declared index hash `39b0eae384ec7a44115f898b940b3f35213577195706d38a82fa97707d2610de`. Candidate version is `2.0.0-beta.1`; do not present it as an accepted release.

## Sprint 1 verification supplement — 20 November 2026

### Branch reconciliation

The isolated sprint branch started at `343f3c1520baa95b5a3d7765002a89e2ab93fd87`, parent `db6717f1f9c52a83525f32fe01e85afc86ade8c5`. The previous hardening branch is `6013d8521bb11852b39555bfa972269130fa1847`, parent `3d0fea1fa507e485bf0833ad9d00feca97de56e5`; the frozen common base is `db6717f1f9c52a83525f32fe01e85afc86ade8c5`. The branches were not merged or cherry-picked. A blob comparison of the 30 files changed by the previous hardening commit found 20 byte-identical files in the sprint candidate and 10 with later divergent content; none of those paths had reverted to their common-base blob. The divergent files are subsequent candidate changes to assessment/presentation, role handling, audit coverage, review identity and documentation. The unchanged application, grouping, timetable-merge, source-presentation and acceptance-test blobs retain the corresponding earlier hardening content. Full frozen-data and Browser checks below exercise the combined candidate.

The previous 13-control run's three reported assertions were trace-collection failures. Their assertions read `route212Trace`, Abbotts `routeTraces`, and `pe1202StageTrace`, but the audit collected those values only when `ATLAS_C4_TRACE_OPERATOR_STAGES=1`; the original run omitted that variable. The audit now fails early with an explicit setup message when those controls are selected without the required trace. The assertions remain intact.

### Three reported controls

- **Waltham Route 212:** actual production planner trace has frequency basis StopPoint `210021703420` (Stop C); Run #75 retains four distinct departures at 09:50, 11:20, 12:52 and 15:00 on Monday-Saturday, with no Sunday service. No source-identity transformation defect was found.
- **Abbotts Rise Route 25B:** actual nearest-group trace retains a structured Route 25 family member with five distinct weekday departures, three Saturday departures and zero Sunday departures. Its two source records remain separate child variants: Station Road `2 weekday / 2 Saturday`, Sainsbury's `3 weekday / 1 Saturday`.
- **PE1 Route 202:** actual terminus trace suppresses duplicate Queensgate-arriving planner rows while preserving six BODS/TNDS source IDs in `arrivalEvidence` and `suppressedArrivalSourceRecordIds` for each useful departing pattern (Bourne Bus Station and Austerby). Both distinct departing rows, their selected-stop times and Browser/Word parity passed.

### Verification results

- Python runtime: bundled workspace Python `3.12.14`, `C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt\dependencies\python\python.exe`. `python -m unittest discover -s tools/atlas-bus-data -p "test_build_static_index.py"` passed **21/21**. The removed `sourceWarnings` assertion was invalid at the prepared-data layer: that record contract retains structured `nonBoardingCalls`; the assessment-layer warning is separately covered by the passing service-assessment regression.
- `node tests/atlas/run-all.mjs` passed: **ATLAS Alpha.15 deterministic suite passed**, using the immutable Run #75 Bus/TNDS manifests and the verified iBus manifest listed above. It includes Browser/Word parity, terminus suppression, role evidence and the route-family controls. The first run hit sandbox temp-file/ephemeral-port restrictions; the same suite passed on a permitted retry without changing the tests or data.
- Actual full 13-control Browser/Word/map replay: `tmp/atlas-beta2-friday-current-13-control-audit.json`. Result: **READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_RE-ACCEPTANCE**. All 13 controls passed; all 13 Word exports and all 13 standalone A3 maps passed. Captured TfL replay matched **135/135** responses, with zero misses, unused responses, failed browser requests or unexpected external requests. Two expected TfL HTTP 400 timetable responses remain scoped to Tufton StopPoint `490005180E` and remain visible as source evidence for review.
- The earlier clean `6013d85` hardening checkout also passed the three trace-dependent assertions when run with the required trace setting; it failed the later Wycliffe Route 65 wording check, which is the subsequent candidate change. The current WIP Browser replay passed Wycliffe too.
- The three apparent Sprint 1 regressions are resolved as invalid audit setup, not product defects. No product code was changed in this sprint supplement; no Run #75 data was modified or refreshed.

### Status and remaining work

The unreleased candidate remains version `2.0.0-beta.1`; Browser identity was `343f3c1`, application-code fingerprint `64aefd9d02e6561a77261228127a30037cd4b35c339b4b52a4281847571be075`. Route 231 June 2026 exact-stop publication reconciliation remains the release blocker recorded above. Technical Director review is recommended after this WIP checkpoint; Product Owner acceptance and release are not claimed. Dependabot remains configured; Codecov, OpenSSF Scorecard and Sentry remain deferred; Renovate remains deferred in favour of Dependabot. No tooling was installed.

The controlled Sprint 1 checkpoint, push result, final GitHub SHA and worktree state are recorded in the final handover for this assignment.
