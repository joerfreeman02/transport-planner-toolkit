# BUS-DATA-REMOTE-1 GitHub Pipeline Gate Handover

## Decision

**REMOTE ENGINEERING READY — PRODUCT OWNER GITHUB DISPATCH REQUIRED**

The reusable workflow handoff and its local deterministic contract are implemented. The full remote gate is not passed because no GitHub Actions run has been dispatched from this branch.

## Repository and baseline

- Repository: `joerfreeman02/transport-planner-toolkit`
- Branch: `codex/atlas-bus-data-remote-1-github-pipeline-gate`
- Required baseline: `ac4ed89a6ac6dc5dd80465b8613687006d1f62a9`
- Baseline verification: fetched `origin`; local HEAD and the C2 remote branch both matched the required SHA, divergence `0/0`, clean worktree.
- Version: `2.0.0-alpha.15`; no version or release metadata change.
- Functional SHA: recorded in the task completion report as the commit containing the workflow and test changes.
- Final pushed SHA: recorded in the task completion report after the handover commit and push.

## Source producer contract

`.github/workflows/atlas-reference-data-source.yml` now verifies the snapshot and its source hashes before upload. The verifier's JSON result is the only input to the metadata output step. Reusable workflow outputs include:

- `snapshot_artifact` and immutable `snapshot_artifact_id`;
- exact verified `snapshot_id`, `source_count`, and `total_bytes`;
- `producer_run_id`.

The snapshot artifact is uploaded only after verification. Its per-run name and v4 artifact ID identify that upload. A failed acquisition or verification prevents the source job succeeding, so the calling diagnostic job is skipped.

## Fresh and frozen runs

- **Fresh remote diagnostic:** leave `v2_source_snapshot_run_id` blank. The source workflow acquires the authorised 11-source set, verifies it, and emits its actual metadata. The caller passes those outputs to the consumer; no pre-known snapshot hash is required.
- **Explicit frozen reuse:** provide an exact prior source workflow run ID. The source job downloads that run's run-specific artifact, verifies the copied bytes, marks reuse as frozen without a current-freshness claim, and can check any supplied expected ID/count/bytes. There is no latest-artifact lookup.

The accepted local ACQ-1 snapshot remains `cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde` (11 sources, 2,244,572,632 bytes) and was not changed. A future remote snapshot may have a different ID if authorised sources have changed; that is reported as a separate remote diagnostic snapshot, not treated as a mismatch with the local engineering snapshot.

## Diagnostic consumer and failure behaviour

The caller passes the producer's artifact name, artifact ID, run ID, snapshot ID, source count, and total bytes. Before download, the diagnostic queries GitHub's artifact API and fails unless the exact artifact ID has the expected name and producer run and is not expired. It then downloads by artifact ID and independently verifies snapshot ID, source count, total bytes, and all source hashes.

V2 preparation runs only after producer identity verification, artifact restore, consumer snapshot verification, last-known-good restore, and release metadata preflight succeed. It continues to use:

```text
--source-snapshot source-input/source-snapshot --acquisition-disabled
```

Thus preparation cannot fall back to live NaPTAN/BODS/NPTG acquisition. Coverage, aggregate structural scan, hard validation, Alpha.15 deterministic checks, and candidate capacity are diagnostic gates. Evidence collection can run after failure, but a failed gate fails the diagnostic job.

The V2 caller does not enter the production build job. Production publication, Pages artifact upload, and Pages deployment are all conditioned on `prepared_schema != 'v2'`; the diagnostic reusable workflow has read-only `actions` and `contents` permissions and contains no publication or deployment step. A remote diagnostic failure therefore leaves deployed production data untouched. Raw source archives are not added to the end-user Pages artifact or diagnostic evidence artifact; the normal Pages upload remains the generated `pages-site` tree with bounded prepared data.

The remote source set remains NaPTAN, NPTG, and nine BODS regional sources. No TNDS archive acquisition or activation was added. The metadata-only TNDS capability probe remains. Selective weekly per-source acquisition is still ACQ-AUTO work and is not claimed complete.

## Files changed

- `.github/workflows/atlas-reference-data-source.yml`
- `.github/workflows/atlas-reference-data-diagnostic.yml`
- `.github/workflows/atlas-bus-data-refresh.yml`
- `tests/atlas/reference-data-workflow-contract.test.mjs`
- `tests/atlas/automated-refresh-contract.test.mjs`
- `docs/atlas/BUS-DATA-REMOTE-1-GITHUB-PIPELINE-GATE-HANDOVER.md`

No Python preparation logic or C1/C2 service semantics were changed. The full suite continues to include the protected C1/C2 regression proofs, including BCE/BST, BCT/BCS/BCQ, BCP, 0590B, stop-scoped evidence, GROUP, DEST, CIRC, calendar, term-time, frequency, operating-period, TfL, iBus, and endpoint behavior.

## Verification

Required command:

```text
node tests/atlas/run-all.mjs
```

Result: passed with the exact final sentinel:

```text
ATLAS Alpha.15 deterministic suite passed.
```

The suite needed workspace-local temporary storage and local loopback access for existing review-environment tests; it completed successfully with those environment constraints addressed. Python source files were not changed, so no separate Python test run was required. `git diff --check` passed.

## GitHub tooling adoption review

Review only; no tool was installed or configured in this sprint.

- **Dependabot:** already configured in `.github/dependabot.yml` for weekly grouped npm and GitHub Actions updates. Keep it as the single dependency-update bot and retain review before merging.
- **Codecov:** no configuration or coverage upload exists, and the Alpha.15 deterministic suite currently establishes pass/fail regressions rather than a maintained coverage threshold. Defer until coverage collection and a meaningful threshold are agreed.
- **OpenSSF Scorecard:** not configured. A useful later read-only security posture report for the public repository; review findings first, then prioritize changes to workflow permissions and action pinning separately.
- **Sentry:** not configured. This toolkit is a static client with no service backend in this sprint; defer product telemetry until the owner has selected a privacy-safe event scope and retention policy.
- **Renovate:** not configured. It would overlap with the existing weekly Dependabot configuration; do not add a second update bot unless a concrete Dependabot gap appears.

## Remote execution and next step

No remote dispatch occurred. `gh auth status` reports the saved `joerfreeman02` login token is invalid. No browser, computer control, credential extraction, PAT creation, or push-trigger workaround was used.

After this branch is pushed, the Product Owner's exact manual action is:

1. Open GitHub → **Actions** → **ATLAS Bus data refresh** → **Run workflow**.
2. Select branch `codex/atlas-bus-data-remote-1-github-pipeline-gate`.
3. Set `prepared_schema` to `v2` and `measure_only` to `true`.
4. Leave `v2_source_snapshot_run_id`, `v2_expected_snapshot_id`, `v2_expected_source_count`, and `v2_expected_total_bytes` blank.
5. Run the workflow.

Then review the source producer result, producer artifact metadata, independent consumer re-verification, preparation and gate results, and the evidence artifact. If all gates pass, record the remote run and its actual snapshot ID/count/bytes separately from local ACQ-1 before Technical Director review. Stop after REMOTE-1; do not publish, deploy, activate TNDS, begin BUS-DATA-TRUST-1, BUS-POLISH, ACQ-AUTO, or promote Beta.
