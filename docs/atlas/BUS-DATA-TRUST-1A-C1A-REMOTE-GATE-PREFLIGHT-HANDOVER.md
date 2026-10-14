# BUS-DATA-TRUST-1A-C1A — Remote Gate Preflight Handover

**Current verdict: NOT READY FOR PRODUCT OWNER DISPATCH.** The workflow and deterministic handoff corrections are in place. The accepted frozen ACQ-1 BODS/NaPTAN snapshot and coverage ledger are not present in this checkout, so no new 4,908-row second-pass analysis is claimed. A compact status artifact records this evidence gap without inventing counts.

## Scope and identity

| Item | Value |
|---|---|
| Repository | `joerfreeman02/transport-planner-toolkit` |
| Branch | `codex/atlas-bus-data-trust-1a-c1a-remote-gate-preflight` |
| Required baseline | `3ec96e0d65126ab14738fd2670e4023453a72be4` |
| Version | `2.0.0-alpha.15` |
| Final SHA | To be recorded after implementation and documentation commits |

Started from the exact clean C1 baseline on a new branch. No `main` edits, merge, PR, live TNDS acquisition, Actions dispatch, planner activation, authority change, publication, deployment, or version bump occurred.

## Dispatch path correction

The C1 standalone workflow was only on the feature branch, so it could not serve as a pre-merge `workflow_dispatch` entry point. The dispatcher was verified in `origin/main` at `2fe88745419ca1197609e03c3e489b1b12b3aa20`; the TNDS workflow was absent there. It is now a `workflow_call` reusable workflow invoked by the existing `.github/workflows/atlas-bus-data-refresh.yml` form. The caller’s unique sentinel and exact input guard require a manual, non-main, v2, forced, measure-only run, with all unrelated snapshot fields blank. The trust job additionally requires the successful main guard. Scheduled events cannot satisfy the manual event condition; main is explicitly refused. The marker excludes the existing ordinary V2 source job and V1 jobs.

### Product Owner fields

After Technical Director review, open **Actions → ATLAS Bus data refresh**, select branch `codex/atlas-bus-data-trust-1a-c1a-remote-gate-preflight`, then choose **Run workflow** and set exactly:

- `force_refresh=true`
- `measure_only=true`
- `prepared_schema=v2`
- `v2_expected_snapshot_id=TNDS-TRUST-DIAGNOSTIC-C1A`
- `resume_checkpoint_run_id=blank`
- `v2_source_snapshot_run_id=blank`
- `v2_expected_source_count=blank`
- `v2_expected_total_bytes=blank`

The sentinel is a branch-only selector in the existing snapshot-ID field; it is not represented as a TNDS source snapshot ID. The standalone reusable workflow is not directly manually dispatchable before integration.

## Preparation contract and determinism

The C1 driver expected `<prepared>/atlas/data/bus-tnds/manifest.json`, while `prepare_tnds.mjs` emits `<prepared>/manifest.json` and `<prepared>/services/...`. The driver now consumes and validates the emitted path, exact eight-region coverage, shard containment, and the established manifest schema. The mandatory integration test creates a synthetic eight-region quarantined snapshot, calls the real driver handoff and real Node preparer, and checks that exact emitted manifest path. It repeats preparation with two different mocked runner clocks; immutable snapshot `createdAt` is passed as explicit `--preparedAt`. The test compares manifest and gzip shard hashes.

The Node CLI entrypoint now resolves `process.argv[1]` with `pathToFileURL`, so the actual preparer runs correctly on Windows as well as Linux. Timestamp parsing rejects missing, invalid, or timezone-free `createdAt` values.

## Acquisition and evidence controls

Regional archive selection requires exactly one candidate for EA, EM, NE, NW, SE, SW, WM, and Y. Duplicate, ambiguous, or missing region candidates fail closed; irrelevant, registration, and nonregional files are ignored. The synthetic FTP tests cover duplicate EA/Y, multi-region ambiguous names, missing regions, and irrelevant names.

The snapshot manifest carries non-secret producer workflow/run ID, repository SHA, repository/ref, immutable `createdAt`, expected region count, completed region count, and source hashes. Snapshot verification checks all eight unique expected archive paths, ZIP validity, bytes, hashes, and recomputed snapshot identity. An interrupted acquisition remains in the explicit incomplete state and preserves its partial manifest and available raw bytes.

The driver persists a secret-safe evidence record before acquisition and updates it at each stage; errors emit only the error class. The reusable workflow uploads evidence with `if: always()` and uses `if-no-files-found: warn`; it uploads the raw quarantine folder on success or failure when it exists. The record excludes credentials, raw XML, unrestricted parser output, and environment dumps. No workflow step publishes or deploys; permissions are read-only.

## Cross-source identity and primary forensics

Exact service identity in `tnds_reconciliation.py` now requires a same, stop-scoped, explicitly validated `identityBridge`; arbitrary equal keys in `nativeIds` are provenance only. Tests cover operator, route, generic service code collisions, unvalidated bridges, and the valid explicit bridge.

The forensic tool now includes duplicate-safe streaming GTFS indices: duplicate IDs are counted, sampled, removed from join indices, and cannot silently become last-row-wins evidence. Its second pass verifies and streams the frozen NaPTAN XML for exact `AtcoCode` and `NaptanCode` membership and diagnostic shape profiles. No fuzzy, spatial, or automatic identity resolution is enabled. New requested unique counts, repeated raw stop identifiers/codes, concentration summaries, and a new compact artifact require running the tool against the exact accepted snapshot and ledger.

**Forensic result status:** C1’s preserved artifact remains the evidence for 4,908 unresolved rows, with all 4,908 joining to trip/stop rows and consistent trip-to-route lineage; all have `resolvedStopPointId=null`. The C1A status artifact `BUS-DATA-TRUST-1A-C1A-PRIMARY-IDENTITY-FORENSIC.json` records null second-pass counts and `C1A_SECOND_PASS_INPUTS_NOT_AVAILABLE`; it is not a substitute for the requested data result. C1A counts and exact NaPTAN classification remain unproduced because the frozen snapshot/ledger are absent. Do not interpret the 4,908 rows as missing services. Do not overwrite `BUS-DATA-TRUST-1A-C1-PRIMARY-UNRESOLVED-FORENSIC.json`.

## Preserved decision boundaries

- Pipers Lane remains **PIPERS LANE — LIVE TNDS ACCEPTANCE CONTROL PENDING REMOTE TNDS RUN**.
- TNDS remains diagnostic comparator only; no fallback, route injection, BODS override, or TfL override was added.
- No protected planner, TfL/iBus authority, timetable, grouping, or presentation behavior was intentionally changed.
- No live TNDS run was started. Future Actions execution remains a Product Owner action after review.

## Tests and remaining work

Full Python discovery passed: **188 tests**. All workflow contract tests passed, including a check that `origin/main` contains the existing manual dispatcher and does not contain the feature-only reusable workflow. The synthetic eight-region real-preparer handoff/determinism test and semantic-failure evidence/raw-snapshot preservation test passed. `node tests/atlas/run-all.mjs` passed with the exact sentinel `ATLAS Alpha.15 deterministic suite passed.` The first sandboxed Node attempt was blocked by local-loopback `EACCES`; the successful rerun used unsandboxed local execution for its loopback-only review-server test. `git diff --check` passed before the final review; it will be repeated before commit.

The required C1A forensic artifact and its 4,908 conservation/count assertions remain outstanding until the exact frozen snapshot and ledger are made available. Consequently this branch is not ready for PO dispatch. No GitHub tooling was installed or configured.

## GITHUB TOOLING ADOPTION REVIEW

Reviewed Dependabot, Codecov, OpenSSF Scorecard, Sentry, and Renovate. Dependabot is already configured. No tool installation or configuration was made in C1A.
