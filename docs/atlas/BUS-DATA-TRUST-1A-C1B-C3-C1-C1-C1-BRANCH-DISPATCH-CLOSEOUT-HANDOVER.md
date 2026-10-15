# BUS-DATA-TRUST-1A-C1B-C3-C1-C1-C1 Branch Dispatch Closeout

## Outcome

- Repository: `joerfreeman02/transport-planner-toolkit`
- Controlled branch: `codex/atlas-bus-data-trust-1a-c1b-c3-c1-c1-c1-branch-dispatch-closeout`
- Starting SHA: `19ad9e68ba7044ed3ab6d10819dabdd16ded5c9e`
- Final implementation SHA: `c52324b037d8d96c43f4d5bd22f4da5c17127fa0` (branch-control and regression changes; this handover is committed immediately after it)
- Version/build: `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`
- The full pushed branch SHA, including this handover, is recorded in the completion message for this sprint.

## Defect and correction

The C3-C1-C1 candidate branch was missing from the exact-branch TRUST allow-lists. The main selector therefore emitted an empty `trust_mode`; downstream offline-preflight, live TRUST, primary restore/preparation, reconciliation and checkpoint-retry jobs also excluded the candidate. The reconciliation workflow's producer-run check and `run_reconciliation.py` rejected it as outside the controlled lineage.

The new branch is now explicitly admitted alongside the two earlier C3/C3-C1 branches. All checks remain exact-name allow-lists; arbitrary `codex/*` branches remain outside the TRUST path. Older controlled branches remain available for checkpoint ancestry and retry compatibility.

## Branch-control locations inspected

Repository-wide searches covered each occurrence of the previous C3/C3-C1 names and exact TRUST branch checks. Relevant locations inspected and corrected were:

- `.github/workflows/atlas-bus-data-refresh.yml`: checkpoint-resume guard, top-level browser selector, and exact-ref conditions for browser offline preflight, TNDS live TRUST, frozen primary source restore, primary preparation, live reconciliation and checkpoint retry.
- `.github/workflows/atlas-bus-data-c3-reconcile.yml`: API producer-run `CONTROLLED_BRANCHES` check. `CHECKPOINT_BRANCH: ${{ github.ref }}` remains supplied to the reconciliation process.
- `.github/workflows/atlas-reference-data-diagnostic.yml`: controlled-branch TNDS-probe skip and its matching fail-closed conclusion condition, used by primary preparation.
- `tools/atlas-bus-data/run_reconciliation.py`: accepted ref and short-name forms for checkpoint lineage validation.
- `tools/atlas-bus-data/test_c3_workflow_contract.py` and `test_tnds_trust_workflow_contract.py`: selector, job, retry, provenance and fail-closed contracts.
- `tools/atlas-bus-data/test_c3_c1_checkpoint_compatibility.py` and `test_run_reconciliation.py`: current-branch lineage acceptance and unrelated-branch rejection.
- Historical handover documents and checkpoint fixtures were checked. Their older branch identities remain unchanged because they record past producer runs and prior sprint evidence.

## Dispatch contract proofs

- Gate A on the current branch with `workflow_dispatch`, `prepared_schema=v2`, `measure_only=true`, `force_refresh=false` and a blank `resume_checkpoint_run_id` resolves to `trust_mode=offline_preflight` with a blank prior producer run ID.
- Gate B on the current branch with `workflow_dispatch`, `prepared_schema=v2`, `measure_only=true`, `force_refresh=true` and `resume_checkpoint_run_id=38579244547` resolves to `trust_mode=c3_live_trust` with producer run `38579244547`.
- A controlled numeric run ID other than the reserved Gate B producer resolves to `c3_checkpoint_retry`; regression coverage exercises `38579244546`.
- An unrelated branch resolves to no TRUST mode. The regression checks the current exact branch and the workflow guard's three explicit controlled names.
- Job contracts admit the current branch to offline preflight, TNDS live TRUST, frozen primary restore, primary preparation, live reconciliation and checkpoint retry, each subject to its existing mode and success conditions.
- Reconciliation producer verification retains repository, workflow, event, artifact and commit-ancestor checks. The Python reconciler accepts the current branch and rejects an unrelated branch before comparison. Earlier C3/C3-C1 lineages remain accepted.
- The current-branch checkpoint compatibility test reuses an ancestor checkpoint with the same projection fingerprint; existing source, repository, commit and fingerprint checks remain in force.

## Changed files

- `.github/workflows/atlas-bus-data-refresh.yml`
- `.github/workflows/atlas-bus-data-c3-reconcile.yml`
- `.github/workflows/atlas-reference-data-diagnostic.yml`
- `tools/atlas-bus-data/run_reconciliation.py`
- `tools/atlas-bus-data/test_c3_workflow_contract.py`
- `tools/atlas-bus-data/test_tnds_trust_workflow_contract.py`
- `tools/atlas-bus-data/test_run_reconciliation.py`
- `tools/atlas-bus-data/test_c3_c1_checkpoint_compatibility.py`
- `docs/atlas/BUS-DATA-TRUST-1A-C1B-C3-C1-C1-C1-BRANCH-DISPATCH-CLOSEOUT-HANDOVER.md`

No Bus intelligence, regional mappings, checkpoint fingerprints, comparison-unit sizing, source authority or planner-eligibility code changed. TNDS remains diagnostic-only and planner-ineligible.

## Verification

- Focused workflow-selector and C3 contract tests: 9 passed.
- Focused TNDS workflow-contract tests: 16 passed.
- Focused reconciliation tests: 4 passed.
- Focused checkpoint-compatibility tests: 6 passed.
- Full command `python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v`: 246 passed, 0 failures (120.154 seconds). Local Windows temp was directed into the writable worktree for SQLite fixtures.
- `node tests/atlas/run-all.mjs`: passed; exact sentinel `ATLAS Alpha.15 deterministic suite passed.` The local Windows sandbox initially blocked the updater fixture's temporary atomic rename; the same local command passed outside the sandbox.
- `git diff --check`: passed.

## Tooling adoption review

- Dependabot: configured; retain.
- Codecov: defer pending a formal coverage baseline.
- OpenSSF Scorecard: later release/security milestone.
- Sentry: defer pending telemetry/privacy architecture.
- Renovate: do not duplicate Dependabot absent a reason.

This correction creates no tooling-installation milestone.

## Hosted validation and exclusions

No GitHub Actions workflow was dispatched. No source acquisition, TNDS authentication, FTP, BODS/NaPTAN/NPTG download, PR, merge, publication or deployment occurred. Hosted Gate A and Gate B remain live validation steps; this closeout proves their branch and input contracts statically and through local regressions only. Beta promotion and Bus intelligence freeze are not declared.
