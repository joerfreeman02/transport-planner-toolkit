# BUS-DATA-TRUST-1A-C1B-C2 — Run #40 Preparation Failure Closeout

## Control record

- Repository: `joerfreeman02/transport-planner-toolkit`
- Starting SHA: `ccaae2bdd35a59d34294d2f608e3d4d67d041dc5`
- Corrective branch: `codex/atlas-bus-data-trust-1a-c1b-c2-preparation-scale-closeout`
- Final pushed SHA: see the closeout commit on this branch; local/remote parity was verified after push.
- Version/build: `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914` (unchanged)

## Incident identity and preserved checkpoint

Run #40 (`38579244547`) used workflow `ATLAS Bus data refresh`, branch `codex/atlas-bus-data-trust-1a-c1b-c1-browser-dispatch-entry`, and commit `ccaae2bdd35a59d34294d2f608e3d4d67d041dc5`. Failed job: `115904488751`, “Run default-branch-compatible TNDS TRUST live diagnostic / Quarantined live TRUST acquisition and preparation”. The job ran from 14:18:01 to 14:56:23 UTC on runner `GitHub Actions 1000000759`.

The preserved raw artifact is `atlas-tnds-quarantined-38579244547`, artifact ID `11903662011`, size `766961479` bytes, digest `sha256:7783327324f160b1bb3dfbd156bede32c57ababc4c790864d6bf9efe175b6f8e`. Its producer is Run #40 at the starting SHA. No local copy was changed, replaced, or deleted during this sprint. The next live operation is constrained to restore and verify this artifact.

## Forensic conclusion

**PROVED — runner disk exhaustion.** The job check-run annotation reports:

`System.IO.IOException: No space left on device : '/home/runner/actions-runner/cached/2.337.0/_diag/Worker_20261014-141802-utc.log'`

The stack identifies the runner failing while writing/flushing its worker diagnostic log (`RandomAccess.WriteAtOffset`, `FileStream.Flush`, `HostTraceListener`, `Worker.RunAsync`). Run steps show the ZIP central-directory capacity check passed, then “Extract and prepare quarantined TNDS handoff” remained in progress when the job failed. This proves the runner filesystem filled; it does not prove OOM.

**STRONGLY SUPPORTED — the previous capacity/preparation design could exceed available disk after its initial check.** It estimated `max(10 GiB, 3 × all uncompressed member bytes + compressed archives)` once, then extracted every region and retained preparer work and final output together. It did not recheck free space while extracting or writing prepared output. The exact disk consumers, failing application write, and peak resource trajectory are unavailable.

**POSSIBLE / UNPROVED:** excessive national in-memory metadata, unbounded child output capture, Node heap exhaustion, pathological member cardinality, malformed/oversized TransXChange, duplicate/unsafe paths, deterministic preparer defect, or unrelated platform termination. The code review found resource risks in country-wide collections and `capture_output=True`, but the available incident evidence does not establish them as Run #40’s cause. The raw job log could not be retrieved: `gh run view --log-failed` returned `log not found: 115904488751`, and the GitHub job-log endpoint returned `BlobNotFound`. No OOM claim is made.

Run #39 was an offline preflight. It proved workflow and small synthetic behavior, but did not exercise extraction/preparation on the national raw archive or a high-cardinality, eight-region regional handoff. It therefore did not surface the disk trajectory observed in Run #40.

## Correction and bounded recovery path

- `prepare_tnds_handoff` now extracts one region, invokes the existing TransXChange preparer for that region, moves its output shards into the established top-level `services/` layout, and removes that region’s extracted XML and temporary regional output before proceeding.
- The aggregate manifest retains the existing `atlas-prepared-bus-tnds-v1` schema, exact eight-region coverage, generated timestamp, region counts, service counts, shard paths, and quarantine counters. Completed regions are processed in the fixed `TNDS_REGIONS` order; preparer output remains deterministic.
- Extraction copies in 1 MiB chunks and checks free space throughout, preserving a 3 GiB reserve. The preflight now models retained compressed archives plus three times the largest regional uncompressed input plus that reserve. Node checks the same reserve before work-file appends and shard materialization, including expected shard bytes.
- Python sends preparer stdout to `DEVNULL`; stderr is read only on failure and reduced to a short tail. Safe persisted evidence includes bounded error categories and does not include source XML or credentials. A failed regional run leaves the immutable raw snapshot intact.
- ZIP target duplication and unsafe paths still fail closed. StopPoint shard keys are constrained to safe filename characters. Per-file TransXChange input remains bounded by the existing 64 MiB ceiling and fails explicitly when exceeded.
- The C2 exact-branch selector accepts offline mode with `force_refresh=false`, `measure_only=true`, `prepared_schema=v2`, and blank resume ID. Live mode requires `force_refresh=true`, `measure_only=true`, `prepared_schema=v2`, and resume ID exactly `38579244547`; fresh acquisition is rejected on this branch. Reuse passes blank TNDS credentials, skips metadata/authentication and acquire steps, restores the artifact by producer run ID, and verifies artifact name, repository, producer identity, source hashes, and manifest. Reuse evidence states `currentFreshnessClaimed=false`.
- TRUST remains planner-ineligible and non-publishing. Production freshness/build/publication/deploy paths are gated off when the TRUST selector is active.

## Synthetic national rehearsal

The Python integration test creates eight ZIP archives and runs the real Python-to-Node preparation chain with 36 XML files per region (288 total), 288 services, 576 distinct StopPoint IDs, 16 shard keys per region, and each service represented across two shard keys. It asserts one preparer subprocess per region, no buffered stdout, exact eight-region aggregate coverage, all services retained, multiple shard files materialized, and completed regional input cleanup. Two-clock replay hashes of the established manifest and shard set are identical. Node’s existing 1,800-file materialization stress test and explicit oversized-XML rejection also pass.

## Test results

- `python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v` — **207 tests passed**.
- `node tests/atlas/run-all.mjs` — **passed**, ending with `ATLAS Alpha.15 deterministic suite passed.` The first sandbox attempt was blocked by loopback EACCES; the same requested command passed when rerun with local loopback access.
- Focused regional national-preparation and workflow-contract tests — **passed** as part of the full Python suite; the eight-region real-preparer rehearsal passed.
- `git diff --check` — passed before commit.

## Scope and remaining uncertainty

No Actions workflow was dispatched. No TNDS/FTP/RETR request, source acquisition, PR, merge, publication, or deployment occurred during this corrective sprint. The Run #40 raw artifact remains untouched. TfL, iBus, BODS, source authority, planner behavior, service grouping, route/calendar/operator logic, Word export, browser presentation, Pipers Lane, and the accepted 4,908-call finding were not changed.

The hosted national run remains unverified. The revised gate and reserve checks fail closed when the modeled space becomes unsafe, but ZIP member metadata and each active region’s parser/index structures still scale with that region. Actual hosted disk behavior and national service cardinality must be confirmed by the separately authorized reuse run. No memory estimate is represented as an RSS proof.

Pipers Lane remains **LIVE TNDS ACCEPTANCE CONTROL PENDING REMOTE TNDS RUN**. The 4,908 unresolved primary scheduled calls remain unresolved only at exact BODS/GTFS-to-NaPTAN StopPoint identity; they are not relabeled as missing services and no fuzzy matching was introduced.

## GitHub tooling adoption review

- Dependabot: already configured; retain.
- Codecov: defer until coverage baseline and ownership are formalized.
- OpenSSF Scorecard: consider during later release/security governance.
- Sentry: defer pending telemetry and privacy architecture.
- Renovate: do not duplicate Dependabot without a clear reason.

This corrective sprint creates **no new installation milestone**.

## Next Product Owner sequence — document only

After Technical Director review:

1. **GATE 1 offline preflight:** `force_refresh=false`, `measure_only=true`, `prepared_schema=v2`, `resume_checkpoint_run_id` blank. It must run on the final corrective SHA and be independently accepted.
2. **GATE 2 verified raw reuse:** `force_refresh=true`, `measure_only=true`, `prepared_schema=v2`, `resume_checkpoint_run_id=38579244547`. It must restore Run #40’s artifact and must not reacquire TNDS.

Neither gate was run in this sprint.
