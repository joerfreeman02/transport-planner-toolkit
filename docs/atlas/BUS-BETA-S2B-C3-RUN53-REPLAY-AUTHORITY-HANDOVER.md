# BUS-BETA-S2B-C3 Run #53 Replay Authority Handover

## Change identity

- Branch: `codex/atlas-bus-beta-s2b-c3-run53-replay-authority`
- Starting SHA: `6946445d0b0475ce5adf65775c875377b9cb89c1`
- Version/build: `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`
- Scope: dispatcher-only authority for the existing offline preflight or one exact Run #53 frozen-source compose replay.

## Exact selector authority

On this branch, manual workflow dispatch accepts either the existing exact zero-download offline preflight (`review_candidate_mode=disabled`, `prepared_schema=v2`, `measure_only=true`, `force_refresh=true`, expected snapshot `TNDS-TRUST-PREFLIGHT-C1B`, with every acquisition, resume, source and candidate selector blank), or this single compose selector:

```text
review_candidate_mode=compose
prepared_schema=v1
measure_only=false
force_refresh=false
resume_checkpoint_run_id=
v2_source_snapshot_run_id=
v2_expected_snapshot_id=
v2_expected_source_count=
v2_expected_total_bytes=

primary_source_run_id=39217550518
primary_artifact_id=12169814614
primary_artifact_digest=sha256:2d6e925559a90f261d3c4f02490be271356c6fd57c6730a90aa2a1424b194ceb

tnds_source_run_id=39217550518
tnds_artifact_id=12171771295
tnds_artifact_digest=sha256:cd4e3b83a969eab66529ca59cbacb8a3f02ec9fd8e558b8edd7da2044e9ef7a1

candidate_checkpoint_run_id=
candidate_artifact_id=
candidate_artifact_digest=
```

The selector rejects altered producer IDs, artifact IDs or digests; any candidate restore input; any resume or TRUST/v2 input; a schema other than `v1`; `measure_only=true`; `force_refresh=true`; and every mode except `disabled` or `compose`. It emits `trust_mode=review_candidate` and `review_candidate_mode=compose` only after all pinned compose checks pass. The S2B-C3 branch is included only in the offline-preflight and isolated candidate job branch conditions. It is excluded from live acquisition and legacy build/publication/deployment routes.

## Preserved corrections and source controls

- S2B-C1 bounded TNDS XML preparation correction (192 MiB boundary) is unchanged.
- S2B-C2 primary restore destination remains `primary-restore/source-snapshot`; explicit frozen reuse and the closed exact-SHA preflight heredoc are unchanged.
- TNDS restore root remains `tnds-restore`.
- The explicit Run #53 primary input prevents fresh primary acquisition; the explicit TNDS producer prevents metadata/FTP/fresh TNDS acquisition steps from running.
- Candidate workflow retains read-only `actions: read` and `contents: read` permissions and its exact-SHA successful/unexpired preflight gate.
- This change does not dispatch compose, acquire sources, publish, or deploy.

## Tests and hosted gate

Before push, the focused review-candidate workflow contract suite passed (21 tests), the full Python Bus-data suite passed (290 tests), `node tests/atlas/run-all.mjs` passed, and `git diff --check` passed. After push, run only the exact-SHA zero-download offline preflight. Record the final SHA-bound hosted run and evidence artifact identifiers in the delivery result; those post-commit identifiers are kept outside this file so recording them does not change the verified SHA.

## Exact next replay dispatch

When the replay is explicitly dispatched, use workflow `atlas-bus-data-refresh.yml`, ref `codex/atlas-bus-beta-s2b-c3-run53-replay-authority`, and exactly the compose input block above. Do not provide any candidate checkpoint, resume, TRUST/v2 or other source selectors. The final-SHA offline preflight must remain successful and unexpired for that exact branch/SHA. This handover records the authorized selector; it does not dispatch it.
