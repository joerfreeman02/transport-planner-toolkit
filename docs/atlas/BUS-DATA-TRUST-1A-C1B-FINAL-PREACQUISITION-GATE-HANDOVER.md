# ATLAS Bus Data Trust 1A C1B — Final Pre-acquisition Gate Handover

## Decision

C1B implements the local and remote-offline gates for TNDS TRUST. It does **not** authorize TNDS acquisition. Codex did not dispatch GitHub Actions, connect to TNDS, issue FTP `RETR`, expose credentials, publish, deploy, activate TNDS, change planner behavior, or change the version. Product Owner must run the zero-download remote preflight on the selected C1B commit after Technical Director review. The live path now checks for that successful same-commit preflight and its unexpired evidence artifact before metadata checks or archive transfer.

TNDS remains diagnostic comparator evidence only. The required Pipers Lane status remains exactly:

`PIPERS LANE — LIVE TNDS ACCEPTANCE CONTROL PENDING REMOTE TNDS RUN`

Version remains `2.0.0-alpha.15`.

## Repository and evidence identity

- Repository: `joerfreeman02/transport-planner-toolkit`
- Starting baseline: `69a2d68af61bd7f5fc097d25f7c5daf04b907499`
- Branch: `codex/atlas-bus-data-trust-1a-c1b-final-preacquisition-gate`
- Final commit SHA: see the post-push branch-tip verification accompanying this handover. (The branch tip includes this document, so its own commit ID is reported by the final verification.)
- Frozen primary snapshot root: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\data-snapshots\atlas-bus-data-acq-1-primary-20261013`
- Required snapshot ID: `cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde`; verified with 11 sources and 2,244,572,632 bytes.
- Exact C1 coverage ledger: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\work\atlas-bus-data-prep-1-c1-coverage-semantics-candidate-final\diagnostic-output\coverage-ledger.json`
- Required and verified ledger SHA-256: `aee79d3dd4a91b9c384021cd9c54989be89789e6e10a2aef467a55970c1c7731`.
- Neither frozen input was regenerated, copied into the repository, or modified. The bounded search remained within existing Transport Planner Toolkit snapshot, retained work/candidate, checkout, documentation, and temporary roots.

The new data-derived artifact is [`BUS-DATA-TRUST-1A-C1B-PRIMARY-IDENTITY-FORENSIC.json`](BUS-DATA-TRUST-1A-C1B-PRIMARY-IDENTITY-FORENSIC.json). Its SHA-256 is `7e5d43d8716b4c3cbd0a6e8b3d90508a5c7b2d0a2caf28748695ca545ad3b27f`. It does not replace C1 or C1A evidence.

## C1B primary identity forensics

The exact-identity diagnostic now lowercases identities on both sides, matching the production resolver’s case-insensitive exact equality. Original GTFS values remain in the report. Shape checks uppercase letters before deriving character shapes and remain descriptive only. No punctuation normalization, fuzzy or spatial matching, resolver change, or automatic repair was introduced.

The verified second pass conserves **4,908** unresolved scheduled calls across all nine primary BODS regions:

| Measure | Result |
|---|---:|
| Unique GTFS stop IDs | 161 |
| Unique nonblank GTFS stop codes | 0 |
| Unique route IDs | 80 |
| Unique route numbers | 78 |
| Unique operators | 38 |
| Unique trips | 3,255 |
| Exact case-insensitive ATCO matches | 0 / 4,908 |
| ATCO-shape-compatible / internal or non-ATCO stop IDs | 4,272 / 636 |
| Blank / present stop codes | 4,908 / 0 |
| Exact NaptanCode matches / nonmatches | 0 / 0 (all are blank) |
| Duplicate GTFS keys | 0 in agency, routes, stops, and trips tables across all nine regions |

The repeated-ID result is concentrated: **4,897** calls use repeated stop IDs; 11 distinct IDs appear once. The top ten IDs account for 2,658 calls (54.1565%). Top five routes account for 1,909 (38.8957%); top five operators account for 3,504 (71.3936%). This shows substantial repeated-stop and operator concentration, while no individual stop ID accounts for most of the total. The complete repeat-frequency distribution, regional/operator pairs, stop names, route/operator ranks, raw IDs, and per-region duplicate samples are in the JSON artifact.

Region totals are East Anglia 290, East Midlands 162, London 1,748, North East 430, North West 118, South East 1,519, South West 58, West Midlands 391, and Yorkshire 192. The case correction changes only forensic comparison semantics to match production; it found no new exact identities and does not change the resolver.

## Product Owner remote preflight settings

Use the existing **ATLAS Bus data refresh** manual dispatcher on GitHub. Select branch `codex/atlas-bus-data-trust-1a-c1b-final-preacquisition-gate` and set:

| Existing workflow input | Offline C1B preflight |
|---|---|
| `force_refresh` | `true` |
| `measure_only` | `true` |
| `resume_checkpoint_run_id` | blank |
| `prepared_schema` | `v2` |
| `v2_source_snapshot_run_id` | blank |
| `v2_expected_snapshot_id` | `TNDS-TRUST-PREFLIGHT-C1B` |
| `v2_expected_source_count` | blank |
| `v2_expected_total_bytes` | blank |

This mode checks out the selected `github.sha`, sets up Python and Node, runs the full `tools/atlas-bus-data` Python test discovery (including the deterministic synthetic eight-region real-preparer handoff and all TNDS/workflow contracts), then runs `node tests/atlas/run-all.mjs` and requires the exact line `ATLAS Alpha.15 deterministic suite passed.` It injects no TNDS secrets and contains no capability probe, archive acquisition driver, `RETR`, BODS/NaPTAN/NPTG acquisition, publication, or deployment step. It uploads secret-free preflight evidence.

## Eventual live settings (not run by Codex)

The existing default-branch dispatcher’s approved live selector remains `TNDS-TRUST-DIAGNOSTIC-C1A`:

| Existing workflow input | First live acquisition | Controlled retry from a prior raw checkpoint |
|---|---|---|
| `force_refresh` | `true` | `true` |
| `measure_only` | `true` | `true` |
| `resume_checkpoint_run_id` | blank | blank |
| `prepared_schema` | `v2` | `v2` |
| `v2_source_snapshot_run_id` | blank | explicit prior TRUST producer run ID |
| `v2_expected_snapshot_id` | `TNDS-TRUST-DIAGNOSTIC-C1A` | `TNDS-TRUST-DIAGNOSTIC-C1A` |
| `v2_expected_source_count` | blank | blank |
| `v2_expected_total_bytes` | blank | blank |

Within live TRUST only, `v2_source_snapshot_run_id` means the producer Actions run ID of a prior TNDS raw-quarantine artifact when supplied. In ordinary V2 frozen-source diagnostics it retains its original source-run meaning. This context-dependent use does not alter ordinary fresh/frozen V2 mapping.

The live job refuses to proceed without a successful `workflow_dispatch` run for this exact selected branch and commit, with the exact `atlas-tnds-trust-offline-preflight-<run-id>` artifact present and unexpired. The prior preflight run itself must have concluded successfully. Thus the offline rehearsal is enforced before metadata probing or RETR.

## Selector and V2 input guards

Only these exact case-sensitive values are approved after C1B:

- `TNDS-TRUST-PREFLIGHT-C1B`
- `TNDS-TRUST-DIAGNOSTIC-C1A`

Any other value beginning `TNDS-TRUST-` fails in `main-guard`, before `reference-source` or any source acquisition. Both approved selectors are excluded from the primary V2 source job. A normal non-TRUST expected snapshot ID with blank `v2_source_snapshot_run_id` also fails before acquisition, so it cannot be treated as a fresh acquisition hint. Blank expected IDs preserve ordinary fresh V2 behavior; explicit producer run IDs preserve frozen reuse.

## Recoverable live raw checkpoint and reuse

The live reusable workflow is `workflow_call` only. Its raw-stage order is:

1. Require successful same-commit C1B offline preflight and its nonexpired artifact.
2. For a first acquisition, authenticate and perform metadata-only archive checks. For a retry, download the artifact by exact producer run ID and exact name.
3. For a first acquisition, acquire and verify the eight-region raw snapshot without extraction.
4. Upload `atlas-tnds-quarantined-<current-run-id>` with 90-day retention **before** capacity inspection or preparation. Partial acquisition directories may be uploaded for forensics, but the driver never labels incomplete acquisition complete.
5. Check available disk space from ZIP central directories only.
6. Extract and prepare only after the capacity gate passes; write prepared and failure evidence.

Reuse downloads only `atlas-tnds-quarantined-<selected-run-id>` from that same Actions run and repository. A successful download proves the artifact remains available (an expired artifact fails the step); the driver then verifies the quarantine manifest, exactly eight expected region paths, each archive’s declared size and SHA-256, ZIP validity, recomputed snapshot ID, quarantine/runtime-ineligible flags, and producer run ID/repository. A reused snapshot records `currentFreshnessClaimed: false`. The downloaded contents land directly at `$RUNNER_TEMP/tnds-quarantined-snapshot`, where `manifest.json` is expected; no extra artifact-name directory is assumed.

The metadata-only first-run gate checks login, one uniquely classified archive for each of EA, EM, NE, NW, SE, SW, WM, and Y, positive SIZE, valid MDTM, and `retrievalPerformed == false`. Its validator fails before the acquisition step for missing or ambiguous archives or incomplete metadata. Credentials are scoped only to the live metadata and acquisition steps; they are absent from the offline job and are never printed.

Capacity inspection opens ZIP central directories but does not extract members. It records total and per-region compressed bytes, uncompressed member bytes, member count, expansion ratio, free runner bytes, and status. The conservative rule is:

`free bytes >= max(10 GiB, 3 × total uncompressed member bytes + total compressed source bytes)`

Insufficient capacity records `CAPACITY_BLOCKED`, retains the verified raw artifact, and prevents extraction. The live job timeout is 360 minutes, the current GitHub-hosted job maximum; the raw checkpoint remains necessary because that maximum cannot remove transfer or preparation failures. See [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes).

## Evidence states and static end-to-end path audit

The evidence distinguishes preflight failure, metadata failure, acquisition failure, raw snapshot verification, capacity block, extraction failure, preparation failure, and prepared handoff success (with raw-artifact upload outcome also recorded). It contains stage outcomes, safe exception types, and no username, password, environment dump, raw XML, or unrestricted parser output. Both successful and failed paths remain diagnostic-only, planner-ineligible, nonpublishing, and nondeploying.

1. The existing `atlas-bus-data-refresh.yml` workflow remains the default-branch manual dispatcher.
2. Product Owner selects the C1B feature branch in the dispatch form; the run is tied to that ref’s SHA.
3. `main-guard` checks manual/non-main context, diagnostic V2 requirements, and selector/input contracts.
4. Live TRUST requires the exact C1A sentinel; offline rehearsal requires the exact C1B sentinel.
5. The prefix guard rejects any other `TNDS-TRUST-` value before source jobs.
6. Live reusable workflow requires a successful offline preflight for the same branch SHA before metadata or RETR.
7. Both reusable modes check out `github.sha`, not an implicit default branch.
8. TNDS secrets are mapped only from the live caller and injected only in metadata/acquisition steps.
9. `tnds_capability_probe.py` logs in and runs metadata commands only; validator requires no RETR.
10. `select_tnds_region_archives` classifies only approved archive filenames to comparator regions.
11. Missing or duplicate region candidates reject the directory before SIZE/MDTM and before RETR.
12. Only the live acquisition driver invokes `acquire_tnds_snapshot`; no BODS/NaPTAN/NPTG source is acquired there.
13. FTP transfer uses existing retry policy and a 120-second FTP socket timeout.
14. Each durable source is downloaded through a `.part` file and atomically checkpointed after validation; no incomplete part is a completed source.
15. Each archive is ZIP-validated and recorded with byte count and SHA-256.
16. Full snapshot verification requires exactly one verified archive for each of eight regions and recomputes the snapshot ID.
17. Raw artifact upload is a separate workflow step before capacity and preparation.
18. Optional reuse is enabled only by a numeric explicit prior producer run ID.
19. `download-artifact` fetches the exact artifact from exact run/repository into the snapshot root.
20. Restored `manifest.json` is expected at that root; no nested artifact directory is assumed.
21. Driver verifies producer run/repository, all source hashes/bytes, ZIP validity, eight-region identity, recomputed snapshot ID, and quarantine flags.
22. Central-directory capacity inspection executes after checkpoint and before extraction.
23. Extraction targets `$RUNNER_TEMP/tnds-extracted-input/<REGION>`.
24. Archive paths reject absolute, parent traversal, and drive-prefixed members.
25. Duplicate resolved extracted paths fail closed.
26. `prepare_tnds.mjs` receives the extracted root and prepared output root.
27. `preparedAt` comes from immutable snapshot `createdAt`, and output `generatedAt` must match it.
28. Prepared output is `$RUNNER_TEMP/tnds-prepared-output`.
29. Driver reads `<prepared-output>/manifest.json`.
30. Every referenced service shard must remain inside prepared root and exist.
31. Handoff requires exactly all eight TNDS regions.
32. Per-region service counts are recorded in evidence and summary.
33. A zero-service region fails in the existing region coverage validator.
34. Successful evidence includes `tnds-trust-evidence.json`, source/prepared manifests, summary, and capacity report.
35. Failure evidence is generated or updated under `$RUNNER_TEMP/tnds-evidence` and uploaded with the capability report.
36. Reusable workflow permissions are limited to `actions: read` and `contents: read`.
37. TRUST reusable workflow has no Pages publication actions or publication credentials.
38. TRUST reusable workflow has no deployment action or Pages write/id-token permission.
39. `plannerEligible`, `runtimeActive`, publication, and deployment flags remain false; no planner input or activation step exists.
40. Conclusion can only represent diagnostic preflight or quarantined preparation, not live acceptance; Pipers Lane remains pending remote TNDS evidence.

Protected transport planner behavior, TfL authority, version, and publication state were not changed.

## Tests and remaining runtime-only facts

- Full local Python discovery: **197 tests passed** (`python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v`).
- TNDS/workflow targeted discovery: **71 tests passed** during focused regression review.
- The synthetic eight-region real preparer/handoff test passed and produced deterministic manifests/shards under two different clocks.
- Mixed-case ATCO and NaptanCode equality, no punctuation normalization, malformed selector blocking, offline no-secret/no-acquisition contracts, same-commit rehearsal gate, run-bound artifact reuse, central-directory capacity measurement, capacity block, and raw-preservation-on-preparation-failure are covered.
- `node tests/atlas/run-all.mjs` passed and printed the exact sentinel `ATLAS Alpha.15 deterministic suite passed.` The runner’s local review-server tests needed the approved unsandboxed local execution permission after the sandbox returned loopback `EACCES`; they remained local and did not contact TNDS or GitHub.
- `git diff --check` passed; it emitted only Git’s Windows line-ending notices.

Runtime-only unknowns remain: current TNDS authentication acceptance, live directory listing and exact archive filenames, live SIZE/MDTM behavior, archive transfer duration and retry outcome, real archive ZIP validity, runner free-space sufficiency for the measured archives, and eventual real-data semantic quality. No remote result is fabricated.

## GITHUB TOOLING ADOPTION REVIEW

- Dependabot: no configuration or dependency changes needed for this bounded workflow gate.
- Codecov: no coverage service setup is required by the existing Python/Node test workflow.
- OpenSSF Scorecard: no repository policy or permissions change is needed for this sprint.
- Sentry: no runtime telemetry integration is relevant to the offline/recoverable acquisition gate.
- Renovate: no dependency automation change is needed.

No GitHub tooling was installed or configured.
