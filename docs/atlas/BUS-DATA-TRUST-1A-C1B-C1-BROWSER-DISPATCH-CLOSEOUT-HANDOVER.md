# BUS-DATA-TRUST-1A-C1B-C1 Browser Dispatch Closeout

## Status

Ready for independent Technical Director review. The corrected browser path uses the existing default-branch workflow and only its four established `workflow_dispatch` inputs. No GitHub-hosted Actions run has been dispatched.

- Branch: `codex/atlas-bus-data-trust-1a-c1b-c1-browser-dispatch-entry`
- Exact starting baseline: `40ea0d58ab00b87f970ca472f021d9022cbc276b`
- Final validated implementation SHA: `5b34c51b68cb75d5b8e3d6b6e46dddf106a8c558`.
- The final handover-only commit and pushed branch HEAD SHA are recorded in the engineering handover accompanying this document.
- Version/build: `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914` (unchanged)

## Why the prior C1B browser dispatch was not accepted

The C1B instructions depended on `v2_source_snapshot_run_id`, `v2_expected_snapshot_id`, `v2_expected_source_count`, and `v2_expected_total_bytes`. Those controls are not present in the actual `origin/main` browser schema, so they were not accepted as Product Owner dispatch requirements. This closeout binds the supported TRUST modes to the exact controlled feature branch and the four inputs exposed by the default-branch workflow. It does not claim C1B was accepted for live acquisition.

The workflow contract test reads and parses `origin/main:.github/workflows/atlas-bus-data-refresh.yml`. It found exactly:

- `force_refresh` (boolean)
- `measure_only` (boolean)
- `resume_checkpoint_run_id` (string)
- `prepared_schema` (choice: `v1`, `v2`)

The exact-branch selector references only these four browser inputs. It does not read the four branch-only `v2_*` inputs.

## Product Owner dispatch settings

Use **ATLAS Bus data refresh** from the default-branch workflow list, select the exact branch above, and use these settings:

| Mode | `force_refresh` | `measure_only` | `prepared_schema` | `resume_checkpoint_run_id` |
|---|---:|---:|---|---|
| Offline preflight | `false` | `true` | `v2` | blank |
| First live TNDS TRUST acquisition | `true` | `true` | `v2` | blank |
| Controlled raw snapshot reuse | `true` | `true` | `v2` | exact numeric prior TNDS TRUST producer run ID |

On this exact branch, every other manual dispatch combination fails closed in `main-guard`; nonnumeric reuse IDs fail before a reusable workflow is called. These special meanings do not apply on another feature branch or on `main`. The existing production checkpoint-resume meaning remains in effect everywhere else.

## Trust and isolation controls

- Offline preflight calls the existing C1B reusable workflow in `offline_preflight` mode, checks out `github.sha`, runs the full Python suite and deterministic Alpha.15 Node suite, verifies the exact `ATLAS Alpha.15 deterministic suite passed.` sentinel, and uploads bounded secret-free evidence. The offline caller passes no TNDS credentials; the offline callee has no capability probe or acquisition driver.
- Live TRUST calls the existing `live_trust` reusable workflow. Before metadata access it still requires a successful earlier `workflow_dispatch` of the same workflow in the same repository, exact branch and commit, plus the exact unexpired `atlas-tnds-trust-offline-preflight-<run id>` evidence artifact. Reuse continues through the run-bound raw artifact restore and full C1B manifest, region, archive, ZIP, hash, identity, and quarantine verification.
- All three selected modes skip freshness/build production, reference-source, reference-diagnostic, Pages publication, and deployment jobs. The TRUST reusable workflow retains only `actions: read` and `contents: read` permissions.
- No planner, source-authority, TfL/iBus, Word export, or browser behavior was changed. The accepted 4,908-call forensic evidence was not regenerated.

## Files changed

- `.github/workflows/atlas-bus-data-refresh.yml` — exact-branch selector outputs, fail-closed mapping, and isolation gates.
- `tools/atlas-bus-data/test_tnds_trust_workflow_contract.py` — default-branch schema parsing and TRUST selector / isolation regressions.
- `tests/atlas/reference-data-workflow-contract.test.mjs` — updated production workflow assertions for the new TRUST output gate.
- `docs/atlas/BUS-DATA-TRUST-1A-C1B-C1-BROWSER-DISPATCH-CLOSEOUT-HANDOVER.md` — this handover.

## Verification

- `python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v` — passed, 203 tests. Ran with the bundled Python runtime and writable temporary directory because the Windows Store `python.exe` shim and default sandbox temp directory were unavailable.
- `node tests/atlas/run-all.mjs` — passed; output ended with the exact `ATLAS Alpha.15 deterministic suite passed.` sentinel. The local review-environment test required loopback access; it passed in the approved local test run.
- `git diff --check` — passed.
- No GitHub-hosted test or Actions dispatch occurred.

## Closeout state

- No TNDS contact, FTP authentication, `RETR`, source acquisition, publication, deployment, merge, or PR occurred.
- The branch is intended to be pushed for review only; no PR is part of this sprint.
- Pipers Lane remains pending live TNDS evidence.
- The 4,908 primary forensic result remains diagnostic evidence only; this browser-entry correction does not establish a new root cause.

## GitHub tooling adoption review

- **Dependabot:** already configured in `.github/dependabot.yml` for weekly grouped npm and GitHub Actions updates; retain it as the dependency-update bot.
- **Codecov:** not configured. Defer until coverage reporting and thresholds have clear owners.
- **OpenSSF Scorecard:** not configured. Consider a later security-posture review with minimal workflow permissions and reviewed action pins.
- **Sentry:** not configured. Defer until operational telemetry, privacy, and event-retention requirements are agreed.
- **Renovate:** not configured. Do not add alongside Dependabot now; it would duplicate the current dependency-update role.
