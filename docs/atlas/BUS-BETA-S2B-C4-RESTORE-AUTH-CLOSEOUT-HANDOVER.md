# BUS-BETA-S2B-C4 Restore Authentication Closeout

## Scope

Branch: `codex/atlas-bus-beta-s2b-c4-restore-auth-closeout`

Starting SHA: `16258e8424ac3c80fd6095c3a72fa74a74010f78`

Version: `2.0.0-alpha.15`

Build: `ATLAS-2.0.0-alpha.15-20260914`

This closeout repairs the frozen-artifact restore failure reported by hosted
Run #59. It does not reacquire source data, prepare a candidate, publish, or
deploy.

## Run #59 evidence

Run `39239210651` (Run #59) used branch
`codex/atlas-bus-beta-s2b-c3-run53-replay-authority` at SHA
`16258e8424ac3c80fd6095c3a72fa74a74010f78`.

The exact-SHA offline-preflight gate, explicit restore validation, primary
artifact metadata verification, primary artifact download, S2B-C2 nested
restore path, `mark-frozen-reuse`, and verification of all eleven primary
sources succeeded. This is hosted proof that the S2B-C2 primary restore fix
worked.

The run then failed at **Verify exact TNDS restore artifact metadata** with:

```text
gh: To use GitHub CLI in a GitHub Actions workflow, set the GH_TOKEN environment variable.
Process completed with exit code 4.
```

The TNDS artifact was not downloaded, TNDS preparation was not reached, the
S2B-C1 192 MiB preparation correction was not exercised, and no candidate
checkpoint was created.

## Corrections

Every step that calls `gh api` in
`.github/workflows/atlas-bus-beta-candidate.yml` now declares
`GH_TOKEN: ${{ github.token }}` in its own environment:

- Verify exact primary restore artifact metadata (preserved existing binding).
- Verify exact TNDS restore artifact metadata (added missing binding).
- Verify exact candidate restore artifact metadata (added latent missing binding).

The workflow retains only `actions: read` and `contents: read` permissions.
Token values are not printed. Frozen restore steps receive no TNDS FTP username
or password.

Compose now checks both raw artifact records before downloading either raw
artifact. The restore sequence is:

1. Exact-SHA successful preflight gate.
2. Explicit restore-parameter validation.
3. Verify primary artifact metadata.
4. Verify TNDS artifact metadata.
5. Restore the primary artifact.
6. Verify/materialise the frozen primary snapshot.
7. Preserve a newly acquired primary snapshot before preparation when the
   primary selector is blank.
8. Restore the TNDS artifact.
9. Verify the frozen TNDS snapshot.
10. Check TNDS capacity.
11. Prepare the review candidate.

The fresh primary and fresh TNDS selector conditions are unchanged. C4's
compose selector pins both producer run IDs, so its authorized replay cannot
enter either fresh acquisition path.

The S2B-C1 finite 192 MiB TNDS XML preparation boundary, S2B-C2 download
destination `primary-restore/source-snapshot`, explicit `mark-frozen-reuse`,
closed preflight Python heredoc, TNDS restore root `tnds-restore`, and all
Run #53 IDs/digests remain intact. Source authority remains TfL direct primary
in London, BODS primary outside London, and TNDS supplementary under
site-scoped arbitration. Planner and Browser/Word presentation logic are
unchanged.

## C4 dispatch authority

The C4 branch accepts only:

- zero-download offline preflight: `prepared_schema=v2`,
  `measure_only=true`, `force_refresh=true`,
  `v2_expected_snapshot_id=TNDS-TRUST-PREFLIGHT-C1B`, with every other selector
  blank and `review_candidate_mode=disabled`; or
- `review_candidate_mode=compose`, `prepared_schema=v1`,
  `measure_only=false`, `force_refresh=false`, all resume/v2/candidate inputs
  blank, and the exact Run #53 primary and TNDS artifact identities listed
  below.

`restore_candidate`, arbitrary artifact identities, fresh-acquisition
selectors, main-branch authority, publication, and deployment are not enabled
on C4. Offline preflight and review-candidate compose are routed through their
isolated jobs. The Pages deployment job remains main-only and requires the
ordinary production trust mode.

## Frozen Run #53 identities

Primary snapshot:

- Producer run: `39217550518`
- Artifact: `12169814614`
- Digest: `sha256:2d6e925559a90f261d3c4f02490be271356c6fd57c6730a90aa2a1424b194ceb`

TNDS snapshot:

- Producer run: `39217550518`
- Artifact: `12171771295`
- Digest: `sha256:cd4e3b83a969eab66529ca59cbacb8a3f02ec9fd8e558b8edd7da2044e9ef7a1`

These identities are frozen; do not replace or reacquire them.

The exact later replay selector is:

```text
workflow: .github/workflows/atlas-bus-data-refresh.yml
ref: codex/atlas-bus-beta-s2b-c4-restore-auth-closeout
review_candidate_mode: compose
prepared_schema: v1
measure_only: false
force_refresh: false
resume_checkpoint_run_id: blank
all v2 inputs: blank
primary_source_run_id: 39217550518
primary_artifact_id: 12169814614
primary_artifact_digest: sha256:2d6e925559a90f261d3c4f02490be271356c6fd57c6730a90aa2a1424b194ceb
tnds_source_run_id: 39217550518
tnds_artifact_id: 12171771295
tnds_artifact_digest: sha256:cd4e3b83a969eab66529ca59cbacb8a3f02ec9fd8e558b8edd7da2044e9ef7a1
all candidate-checkpoint inputs: blank
```

This implementation does not dispatch that compose selector.

## Regression coverage and validation

The focused review-candidate workflow contract inspects every step containing
`gh api` and requires a local usable `GH_TOKEN` binding. It also checks the
three named metadata steps, read-only permissions, fail-fast ordering, pinned
Run #53 identities, fresh/restore selectors, no credentials in frozen restore,
and the non-publishing candidate route. The suite is included in
`tests/atlas/run-all.mjs`.

GitHub tooling review remains: Dependabot configured; Codecov deferred pending
a coverage baseline; OpenSSF Scorecard deferred to a release/security
milestone; Sentry deferred pending telemetry/privacy architecture; Renovate
not required alongside Dependabot.

Local validation:

- `python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v` —
  passed, 290 tests.
- `node tests/atlas/run-all.mjs` — passed; Alpha.15 deterministic suite.
- `node tests/atlas/review-candidate-workflow-contract.test.mjs` — passed.
- `git diff --check` — pending final commit review.

Hosted final-SHA zero-download preflight: pending final commit and push. Record
the run, evidence artifact ID/digest, and skipped-job results here after it
completes.

## Source acquisition and release controls

No live source acquisition or Run #53 compose replay is part of this
implementation. The hosted final-SHA gate is the exact zero-download offline
preflight only; it must skip candidate compose, source acquisition, and
publication/deployment. No Beta, PR, merge, release, publication, or
deployment is part of this closeout.
