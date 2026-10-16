# BUS-BETA-S2A-C1 Review-Candidate Composition Handover

## Outcome

Implemented an isolated review-candidate workflow callable only through the exact-branch manual dispatcher. The path binds one verified 11-source primary snapshot and one complete eight-region raw TNDS snapshot to a full Alpha.15 Bus/TNDS review candidate. Its caller and reusable workflow have read-only GitHub permissions, and the candidate path preserves raw artifacts before preparation and a complete candidate checkpoint before downstream deterministic testing.

Version remains `2.0.0-alpha.15 / ATLAS-2.0.0-alpha.15-20260914`. No Beta declaration, release, merge, or pull request was created.

## Workflow and gates

Workflow: `.github/workflows/atlas-bus-beta-candidate.yml` (`ATLAS Bus Beta review candidate`), a `workflow_call`-only reusable workflow. GitHub requires a manually dispatched workflow file to exist on the default branch; because this sprint prohibits merge/PR, the manual entry remains the existing `.github/workflows/atlas-bus-data-refresh.yml`, which is default-branch dispatchable and calls the reusable candidate path only on the exact C1 feature branch. The C1 selector permits either the exact offline preflight or `review_candidate_mode=compose|restore_candidate`; candidate selection sets a distinct `review_candidate` mode that suppresses all existing freshness, source-acquisition, build, TRUST, and deployment jobs. Permissions on the candidate caller job and reusable workflow are `actions: read` and `contents: read`; no candidate-path publication credentials, environments, repository writes, or production activation steps are available.

Compose mode requires a successful workflow-dispatch run on the same exact SHA and branch, from `.github/workflows/atlas-bus-data-refresh.yml`, with an unexpired artifact named `atlas-tnds-trust-offline-preflight-<run-id>`. The gate runs before either source-family path. The C1 branch's offline-preflight selector accepts only `prepared_schema=v2`, `measure_only=true`, `force_refresh=true`, `v2_expected_snapshot_id=TNDS-TRUST-PREFLIGHT-C1B`, all candidate/producer/count/bytes/resume inputs blank, and `review_candidate_mode=disabled`. Candidate selection requires the legacy refresh and TRUST inputs at their disabled defaults and sets a non-empty guard mode that keeps every production job out. The C1 branch cannot enter the live TRUST selector.

## Composition and recovery stages

1. **Primary raw snapshot:** blank `primary_source_run_id` acquires via `source_snapshot.py --acquire`, verifies the exact 11 required files and hashes, then uploads `atlas-reference-source-snapshot-<run-id>` with 90-day retention before preparation. A supplied producer run requires the exact artifact ID/digest and exact artifact name/run association, downloads only that artifact, and uses `--mark-frozen-reuse`; errors stop without acquisition fallback.
2. **TNDS raw snapshot:** blank `tnds_source_run_id` runs the established metadata-only authentication/archive probe, then calls the TRUST `--acquire-only` verifier with credentials scoped only to fresh acquisition. The eight-region raw archive is uploaded as `atlas-tnds-quarantined-<run-id>` with 90-day retention before capacity checks or extraction. Explicit restore requires artifact ID/digest and producer run, verifies the exact artifact and raw manifest via `--verify-reused`, and has no credential or acquisition fallback.
3. **Capacity:** primary materialisation checks available disk against twice the verified compressed source bytes plus 1 GiB. TNDS `--capacity-only` verifies archive hashes and ZIP central-directory expansion, applying the existing 3 GiB reserve and per-region extraction guard. The production refresh path rechecks capacity immediately before preparation.
4. **Build:** `refresh_bus_data.py --prepared-schema v2 --review-only --acquisition-disabled` receives both explicit snapshots. It reuses `source_snapshot.materialise_for_preparation`, the current Bus `build_static_index.py`, and TRUST `prepare_tnds_handoff` / `prepare_tnds.mjs`. Missing either snapshot fails closed. The status and source manifests bind snapshot IDs and producer metadata; `review-source-provenance.json` also records artifact IDs/digests. The structural validator runs before checkpoint creation. Existing BODS `circularPatternStopIds` and TNDS `routePatternStopIds` are verified in the prepared files.
5. **Candidate checkpoint:** `review-candidate-checkpoint.mjs` measures every candidate file and writes `atlas-review-candidate-checkpoint-v1` with the exact commit, producer run, Alpha.15 identity, both source snapshot IDs/runs/artifacts, source-bound candidate fingerprint, creation time, file hashes, and `BUILT_STRUCTURALLY_VERIFIED_REVIEW_ONLY` state. Planner, production, and publication eligibility are false. The full candidate and checkpoint artifact are uploaded for 90 days before the deterministic Alpha.15 suite runs.
6. **Explicit candidate restore:** select `mode=restore_candidate` and provide the producer run, artifact ID, and digest. The workflow verifies exact artifact metadata, downloads only that artifact, checks commit/run identity and every file hash/fingerprint, reruns structural validation, then runs deterministic controls. A failed restore stops; no raw source acquisition occurs. Restores are intentionally commit-bound.
7. **Downstream state:** a separate `FULLY_VALIDATED_REVIEW_ONLY` validation artifact is emitted only if the deterministic suite passes. The immutable candidate checkpoint retains its built/structurally verified state; neither state grants planner or publication eligibility.

The route does not use the legacy v1 all-in-one acquisition path. It does not change TfL authority, BODS primary authority, TNDS supplementary status, site-scoped arbitration, fuzzy matching, GROUP, DEST, CIRC, planner output, Word export, or the national model.

## Verification

Local verification on the implementation before hosted preflight:

- `python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v`: **274 passed** (183.119 seconds).
- `node tests/atlas/run-all.mjs`: **passed**, including Alpha.15, BUS-CIRC, Pipers/source arbitration, Browser/Word parity, and review-environment controls.
- `test_review_candidate_workflow_contract`, `test_tnds_trust_workflow_contract`, and `test_c3_workflow_contract`: **34 passed** in the focused rerun after dispatcher wiring.
- Source snapshot tests: **11 passed**; TRUST workflow contract tests: **19 passed**; C3 workflow contract tests: **9 passed** in the earlier isolated runs.
- Candidate checkpoint test: **passed** in the Node suite and direct run.
- Python bytecode compilation: **passed** for changed Python modules.
- `git diff --check`: **passed** before commit.

Hosted exact-SHA offline preflight on implementation commit `6ea1569e44d2fd21217dba2e46420e236634c895`:

- Run `38921194226`: **success** on `codex/atlas-bus-beta-s2a-c1-review-candidate-composition` at that exact SHA.
- Evidence artifact `atlas-tnds-trust-offline-preflight-38921194226`, ID `12054761221`, digest `sha256:3a3cbbe93e523bd7ceb70ceecd711767126c01922b5c7ba8c2784094451ab866`, retained through 2027-01-14.
- Hosted Python and deterministic Alpha.15 steps passed; exact-commit `git diff --check` passed.
- Primary-source acquisition, live TNDS, candidate composition, legacy build, publication, and deployment jobs were skipped.

The hosted result became available after the implementation commit. This evidence is exact for the implementation SHA above. The handover evidence update itself is documentation-only and receives a separate commit; a final offline preflight is required on that resulting branch head before any S2B dispatch. Its run metadata is returned in the final handover so the validated SHA is not changed after dispatch.

No fresh NaPTAN/NPTG/BODS or TNDS acquisition, source download, candidate composition, publication, or deployment was performed during S2A-C1.

## Exact proposed S2B dispatch

After this branch is pushed and its final exact-SHA preflight succeeds, manually dispatch `.github/workflows/atlas-bus-data-refresh.yml` on this same branch and SHA. Its isolated C1 selector calls `.github/workflows/atlas-bus-beta-candidate.yml` with:

| Input | Value |
|---|---|
| `review_candidate_mode` | `compose` |
| `prepared_schema` | `v1` (disabled default for this isolated selector) |
| `measure_only` | `false` |
| `force_refresh` | `false` |
| `resume_checkpoint_run_id` | blank |
| `v2_source_snapshot_run_id` | blank |
| `v2_expected_snapshot_id` | blank |
| `v2_expected_source_count` | blank |
| `v2_expected_total_bytes` | blank |
| `primary_source_run_id` | blank (fresh acquisition) |
| `primary_artifact_id` | blank |
| `primary_artifact_digest` | blank |
| `tnds_source_run_id` | blank (fresh acquisition) |
| `tnds_artifact_id` | blank |
| `tnds_artifact_digest` | blank |
| `candidate_checkpoint_run_id` | blank |
| `candidate_artifact_id` | blank |
| `candidate_artifact_digest` | blank |

The existing successful offline-preflight evidence must still be unexpired and match the exact selected SHA and branch at dispatch time. This is the one supported S2B dispatch path; do not select the TRUST live mode or any legacy source/build path. Fresh primary and TNDS acquisition are intentional in S2B and are not run during S2A-C1.

## Change inventory

- `.github/workflows/atlas-bus-beta-candidate.yml`
- `.github/workflows/atlas-bus-data-refresh.yml`
- `tools/atlas-bus-data/refresh_bus_data.py`
- `tools/atlas-bus-data/test_review_candidate_workflow_contract.py`
- `tools/atlas-bus-data/test_tnds_trust_workflow_contract.py`
- `tools/atlas-data-publication/review-candidate-checkpoint.mjs`
- `tests/atlas/review-candidate-checkpoint.test.mjs`
- `tests/atlas/run-all.mjs`
- `docs/atlas/BUS-BETA-S2A-C1-REVIEW-CANDIDATE-COMPOSITION-HANDOVER.md`
- `docs/atlas/BUS-BETA-S2A-REFRESH-CHECKPOINT-READINESS-HANDOVER.md` (historical final-S2A preflight clarification)

## Tooling adoption review

- Dependabot: configured; no new installation milestone.
- Codecov: deferred pending a formal coverage baseline.
- OpenSSF Scorecard: later release/security milestone.
- Sentry: deferred pending telemetry/privacy architecture.
- Renovate: not added because it would duplicate Dependabot without an approved reason.

## Final handover

- Starting SHA: `c6251116abb1da5ebce12fe200a15d124c99eab0`.
- Validated implementation SHA: `6ea1569e44d2fd21217dba2e46420e236634c895`.
- Handover update commit, final branch SHA, and its exact-SHA preflight: pending.
- Branch/local-origin parity and clean worktree: confirmed for the implementation commit; recheck after the handover update.
- Live source downloads: none.
- Publication/deployment: none.
- S2B safe to dispatch: **not yet**; repeat the offline preflight after the handover-only commit so its evidence matches the final branch SHA.
