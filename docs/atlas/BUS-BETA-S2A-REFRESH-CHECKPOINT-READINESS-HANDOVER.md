# BUS-BETA-S2A Refresh Checkpoint Readiness Handover

## Decision

S2A improves the existing TNDS TRUST recovery path and adds an exact-commit offline-preflight entry for this branch. It does **not** make the standard current-data Beta candidate refresh safe to dispatch. The legacy v1 candidate workflow still acquires primary data and TNDS inside one Python process; it has no raw TNDS artifact upload boundary before extraction and no measure-only full-candidate checkpoint. S2B must remain undispatched until those paths are composed and covered by a workflow contract.

No live acquisition, publication, or deployment was performed for S2A.

## Starting state and version

- Repository: `joerfreeman02/transport-planner-toolkit`
- Branch: `codex/atlas-bus-beta-s2a-refresh-checkpoint-readiness`
- Starting SHA: `fef390bd4dfa569b8dfc2ff831e470747d95960a`
- Starting worktree: clean; the C2 local branch and its origin tracking branch both pointed at the requested SHA.
- Version/build remain `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`.

## Existing refresh architecture

### Standard v1 current refresh

`.github/workflows/atlas-bus-data-refresh.yml` runs the `build-validate` job for the standard v1 refresh. It makes an isolated `pages-site`, obtains last-known-good metadata, optionally restores a verified whole-candidate cache on production/main, then invokes `tools/atlas-bus-data/refresh_bus_data.py`.

In v1, the Python refresh downloads the NaPTAN CSV and all nine BODS GTFS feeds. It then logs into TNDS, selects one archive per region, downloads each archive into a temporary `tnds-raw` directory, and extracts that region during transfer. Candidate build, TNDS preparation, validation, deterministic checks, and capacity measurement follow. Thus, the standard v1 job has no immutable raw TNDS artifact upload step between download and extraction, and no reusable raw source snapshot for the NaPTAN/BODS downloads.

The verified whole-candidate cache is production/main oriented: it is created only after candidate validation, deterministic checks, and capacity checks pass. Measure-only and non-main candidate runs do not save that checkpoint.

### Existing snapshot and TRUST workflows

- `source_snapshot.py` provides an atomic 11-source XML NaPTAN/NPTG plus nine-region BODS snapshot, structural verification, per-source hashes/byte counts, aggregate snapshot identity, explicit frozen reuse, and materialisation without downloads. `atlas-reference-data-source.yml` uploads it immutably. Its retention is now 90 days.
- `acquire_tnds_snapshot` writes each regional ZIP atomically with progress metadata and only marks the snapshot complete after all eight regions validate. `load_and_verify_tnds_snapshot` checks exact region/path coverage, nonzero recorded sizes, ZIP readability, hashes, and aggregate snapshot identity.
- `atlas-bus-tnds-trust-diagnostic.yml` already offers metadata-only preflight, raw TNDS artifact upload before extraction/preparation, 90-day retention, exact named producer-run restore, capacity checks, and a prepared TNDS reconciliation-input checkpoint. It is a nonpublishing diagnostic workflow, not a complete Bus/TNDS candidate refresh.
- `candidate-checkpoint.mjs` validates and restores a whole Bus/TNDS candidate with producer identity, manifests, hashes, candidate compatibility fingerprint, validation state, and capacity. Its current creation boundary is after successful validation on main, so it does not provide S2B's requested review-candidate recovery boundary.

## S2A changes

1. Raw TNDS acquisition no longer reports `snapshot_available=true` before it has completed and passed `load_and_verify_tnds_snapshot`. The workflow's existing conditional upload therefore cannot treat an interrupted/incomplete regional acquisition as upload-ready. Region-level in-run progress remains intact; only a complete eight-region snapshot is an upload candidate.
2. Successful raw-artifact upload ID, name, digest, and producer run ID are now included in the secret-safe TRUST run evidence when the upload action exposes them. The raw manifest continues to record workflow/run/repository/commit, acquisition time, snapshot ID, and per-region hashes and bytes.
3. The exact-branch selector admits this S2A branch for offline preflight only. It does not admit S2A to the live TRUST diagnostic. The existing preflight remains noncredentialed and checks out the selected commit.
4. The offline preflight now checks the exact commit diff with `git diff --check`.
5. Primary source-snapshot artifact retention is 90 days, matching the raw TNDS recovery window.

## Restore and failure contract

For the existing TRUST path, `prior_producer_run_id` selects `atlas-tnds-quarantined-<run-id>` from the same repository and producer run. The restored manifest must identify that producer, repository, and exact eight-region raw snapshot. If the caller supplies an artifact ID/digest, the workflow validates those API values before download. A failed explicit restore fails the job; the fresh acquisition steps are conditional on the prior-run input being blank, so there is no silent FTP fallback.

The raw upload happens before ZIP extraction. If upload fails, later extraction/preparation steps do not run. The S2A fix also ensures a partial acquisition does not set the upload-ready output. A complete artifact is retained for 90 days.

The primary XML/BODS source snapshot is independently verifiable and explicitly reusable by source workflow run ID. The current standard v1 refresh does not consume this snapshot, and it does not acquire NPTG. The v2 snapshot workflow is diagnostic-only and is not joined to the TNDS raw workflow as a full candidate build.

## Capacity and publication safety

The TNDS TRUST path measures compressed ZIP total, central-directory member count and uncompressed sizes, largest regional expansion, and runner free disk. It requires free space for the raw snapshot plus three times the largest regional expansion plus a 3 GiB reserve. Extraction also checks the reserve while writing. Candidate publication measurement applies the existing bounded-root limits. The workflows do not establish an explicit raw-artifact size ceiling beyond the hosting service's limits; primary-source acquisition has no equivalent pre-acquisition disk gate.

The TRUST workflow has read-only `actions`/`contents` permissions and no Pages or deployment permissions. The S2A preflight is offline. The standard v1 workflow can publish/deploy on main when not in measure-only mode, so it must not be used for this S2B review candidate.

## Exact-SHA preflight

The existing TRUST offline-preflight job runs the complete Python Bus-data suite and deterministic Alpha.15 suite without TNDS credentials or source-download steps, and uploads `atlas-tnds-trust-offline-preflight-<run-id>` for 90 days. Its live TRUST caller verifies the successful workflow run's exact `head_sha`, branch, workflow path, and unexpired evidence artifact before it proceeds.

For this branch, the offline-only dispatch selection is:

| Input | Value |
|---|---|
| `force_refresh` | `true` |
| `measure_only` | `true` |
| `prepared_schema` | `v2` |
| `resume_checkpoint_run_id` | blank |
| `v2_source_snapshot_run_id` | blank |
| `v2_expected_snapshot_id` | `TNDS-TRUST-PREFLIGHT-C1B` |
| `v2_expected_source_count` | blank |
| `v2_expected_total_bytes` | blank |

The exact final commit still needs a successful GitHub Actions preflight artifact before it can satisfy the remote-artifact portion of the acceptance criteria. A later code change changes the SHA and requires a new preflight.

## S2B readiness and recommended sequence

**Do not dispatch a live current-data S2B candidate yet.** The existing raw TNDS, primary source, and validated production candidate checkpoints are separate workflow paths. They do not currently produce and verify one complete measure-only Bus/TNDS candidate from a single bound set of source artifacts, and the existing candidate checkpoint is unavailable to a non-main measure-only run. There is no safe exact set of live S2B dispatch parameters in the current workflow contract.

The next implementation must connect the exact-preflight gate to a review-only candidate workflow that: acquires or explicitly restores the 11-source NaPTAN/NPTG/BODS snapshot; acquires or explicitly restores the complete TNDS raw snapshot; uploads each immutable raw artifact before preparation; verifies artifact identity and source hashes; enforces capacity before extraction; builds and validates the complete candidate; saves a recoverable full-candidate checkpoint before downstream validation can discard it; and has no publication/deployment permissions. A restored explicit checkpoint must fail closed without source reacquisition.

## Automated tooling adoption review

- Dependabot: configured; no new installation milestone reached.
- Codecov: deferred pending a formal coverage baseline.
- OpenSSF Scorecard: later release/security milestone.
- Sentry: deferred pending telemetry/privacy architecture.
- Renovate: not added; it would duplicate Dependabot without an approved reason.

## Changed files

- `.github/workflows/atlas-bus-data-refresh.yml`
- `.github/workflows/atlas-bus-tnds-trust-diagnostic.yml`
- `.github/workflows/atlas-reference-data-source.yml`
- `tools/atlas-bus-data/tnds_trust_diagnostic.py`
- `tools/atlas-bus-data/test_source_snapshot.py`
- `tools/atlas-bus-data/test_tnds_trust_diagnostic.py`
- `tools/atlas-bus-data/test_tnds_trust_workflow_contract.py`
- `docs/atlas/BUS-BETA-S2A-REFRESH-CHECKPOINT-READINESS-HANDOVER.md`

## Verification record

- Python Bus-data suite: `python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v` — **267 tests passed**.
- Deterministic Alpha.15 suite: `node tests/atlas/run-all.mjs` — **passed**, including Pipers and candidate-checkpoint coverage.
- `git diff --check`: **passed**.
- Exact-SHA GitHub Actions offline-preflight run `38916353211`: **success** on commit `93289598c7792967fbd4a54bd0363ccf4899c50b`. Evidence artifact `atlas-tnds-trust-offline-preflight-38916353211` (artifact ID `12051714796`, digest `sha256:895e34b52763efe3171c5fd5dbf5be69308d295070d029944d8b37a86154a770`) was present and unexpired. Its record confirms success, the matching branch/SHA, no source acquisition, no TNDS credentials or FTP, and no publication/deployment.
- A documentation-only handover update follows that run; the exact SHA of the final documentation commit is preflighted separately and recorded in the final response.
- Live downloads / TNDS FTP: none performed.
- Publication / deployment: none performed.
- Final SHA, local/origin parity, and clean status: reported after the final handover commit and push.
