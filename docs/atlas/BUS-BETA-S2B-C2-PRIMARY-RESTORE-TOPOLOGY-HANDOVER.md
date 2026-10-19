# BUS-BETA-S2B-C2 Primary Restore Topology Handover

## Change identity

- Branch: `codex/atlas-bus-beta-s2b-c2-primary-restore-topology`
- Starting SHA: `bf52f6a28fa99e3e59cf187181787f4d407b713d`
- Version/build: `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`
- Scope: correct Run #56's primary artifact extraction root and close the exact-SHA preflight script heredoc.

## Run #56 failure

Run `39234609510` passed branch/SHA and preflight gates, then verified the exact Run #53 primary artifact metadata and digest. It failed at `test -d primary-restore/source-snapshot` because the artifact had been uploaded from `source-snapshot`, which makes its contents the artifact root.

The old download destination `primary-restore` yielded `primary-restore/manifest.json` and `primary-restore/sources/...`, while the consumer expected a nested `primary-restore/source-snapshot/manifest.json` and `primary-restore/source-snapshot/sources/...`. The download destination is now `primary-restore/source-snapshot`; the existing test and `--mark-frozen-reuse` consumer use that same root and emit the verified preparation input at `source-snapshot`.

The regression test now binds the download destination, directory check, frozen-reuse input, output root, and no-acquisition explicit restore branch. A local round-trip fixture models artifact contents extracted into the nested destination, then runs `mark_frozen_reuse` and `load_and_verify`.

## Exact-SHA preflight

The compose gate's Python here-document was missing its closing `PY`, which caused Bash to report that it reached end-of-file while looking for the delimiter. The closing marker now appears before the next workflow step, and a workflow contract test checks that the script closes exactly once.

The refresh dispatcher has an S2B-C2 selector restricted to the exact `v2`, measure-only, forced `TNDS-TRUST-PREFLIGHT-C1B` offline preflight with all acquisition and restore inputs blank. This branch is admitted to the offline preflight job only. It is excluded from the live source job, candidate composition route, legacy build, and deployment conditions.

Run the exact-SHA offline preflight on the pushed final commit using:

- `prepared_schema=v2`
- `measure_only=true`
- `force_refresh=true`
- `v2_expected_snapshot_id=TNDS-TRUST-PREFLIGHT-C1B`
- all source, restore, candidate, and resume selectors blank
- `review_candidate_mode=disabled`

The associated Actions run ID and evidence artifact ID/digest are reported in the delivery result. They are kept outside this commit so recording post-commit evidence does not change the SHA it verifies.

## Source and publication controls

- Frozen Run #53 primary source: run `39217550518`, artifact `12169814614`, digest `sha256:2d6e925559a90f261d3c4f02490be271356c6fd57c6730a90aa2a1424b194ceb`.
- Frozen Run #53 TNDS source: run `39217550518`, artifact `12171771295`, digest `sha256:cd4e3b83a969eab66529ca59cbacb8a3f02ec9fd8e558b8edd7da2044e9ef7a1`.
- No fresh primary or TNDS acquisition is authorized or performed by this correction.
- TNDS restore was audited: artifact contents extract to `tnds-restore`, verification reads `--snapshot tnds-restore`, and the verified tree is copied to the runner temporary `tnds-quarantined-snapshot`. Fresh metadata/acquisition steps require a blank `tnds_source_run_id`.
- No publication, deployment, merge, PR, or release is authorized or performed.

## Run #53 replay inputs

The follow-up compose replay uses only these frozen raw artifacts and leaves candidate restore inputs blank:

- `mode=compose`
- `primary_source_run_id=39217550518`
- `primary_artifact_id=12169814614`
- `primary_artifact_digest=sha256:2d6e925559a90f261d3c4f02490be271356c6fd57c6730a90aa2a1424b194ceb`
- `tnds_source_run_id=39217550518`
- `tnds_artifact_id=12171771295`
- `tnds_artifact_digest=sha256:cd4e3b83a969eab66529ca59cbacb8a3f02ec9fd8e558b8edd7da2044e9ef7a1`
- `candidate_checkpoint_run_id`, `candidate_artifact_id`, and `candidate_artifact_digest` blank

This handover does not dispatch the replay. The final delivery reports whether the corrected restore is safe to dispatch based on exact-SHA preflight and test evidence.
