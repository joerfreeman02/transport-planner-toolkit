# BUS-DATA-REMOTE-1A Artifact Restore Path Handover

## Recommendation

**REMOTE-1A ENGINEERING READY — PRODUCT OWNER FROZEN-REUSE DISPATCH REQUIRED**

Run #37 proved source acquisition, verification, immutable upload, artifact identity verification, and exact artifact download. Consumer verification failed only because the downloaded directory was nested under the artifact name. This sprint corrects that path and gates candidate-only checks on successful preparation. The corrected remote run has not yet been dispatched.

## Baseline and run #37 evidence

- Repository: `joerfreeman02/transport-planner-toolkit`
- Corrective branch: `codex/atlas-bus-data-remote-1a-artifact-restore-path`
- Required baseline: `c01ed58bd81063360942f47bae7c733a68d5632f`
- ATLAS version: `2.0.0-alpha.15`; no release version change.
- Failed proof run: **ATLAS Bus data refresh #37**, run ID `38533475680`, on `codex/atlas-bus-data-remote-1-github-pipeline-gate` at `c01ed58bd81063360942f47bae7c733a68d5632f`.

The source producer job passed its metadata probe, fresh acquisition of the authorised 11 sources, source snapshot verification, artifact naming, and immutable upload. Its verified remote snapshot was:

- Snapshot ID: `13e2895be61c5bb5adaf8adec9896520b8224ff243766818d3ca920f0eae71e1`
- Source count: `11`
- Total raw source bytes: `2327615358`
- Artifact name: `atlas-reference-source-snapshot-38533475680`
- Artifact ID: `11878857366`
- Compressed size: `1730356466` bytes
- GitHub artifact SHA-256: `01018c145646fdf041ba0c91cbd91b842994f62a292815438a6866ed358db658`

The diagnostic passed Alpha.15 deterministic tests, exact producer artifact ID/name/run verification, and download of the exact artifact. It failed at consumer snapshot verification because the `source-snapshot/manifest.json` file was nested one directory deeper than the verifier's input path. This was an extraction layout defect; it was not a source acquisition or source integrity failure.

Run #37's TNDS metadata-only probe succeeded with classification `RELIABLE_METADATA_ONLY` for the reported regional archives `EA`, `EM`, `NE`, `NW`, `SE`, `SW`, `WM`, and `Y`. The probe performed no archive retrieval. This is positive metadata-only evidence for later BUS-DATA-TRUST-1A; no TNDS archive was transferred or activated in REMOTE-1A.

The #37 snapshot is distinct from the accepted local ACQ-1 engineering snapshot (`cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde`, 11 sources, 2,244,572,632 bytes). Neither the local snapshot nor any historic data was modified.

## Extraction path correction

The #37 consumer downloaded with `actions/download-artifact@v4`, `artifact-ids: 11878857366`, and `path: source-input`. The observed extraction was:

```text
source-input/
  atlas-reference-source-snapshot-38533475680/
    source-snapshot/
      manifest.json
```

The verifier expected:

```text
source-input/source-snapshot/manifest.json
```

The pinned v4 action implementation shows that ID-based downloads normally append the artifact name directory. Its `merge-multiple` option instead extracts each selected artifact directly into the requested destination. The diagnostic download now sets `merge-multiple: true` while retaining the immutable `artifact-ids` input and the preceding API verification of artifact ID, name, producer run, and expiration status. It also explicitly checks for `source-input/source-snapshot/manifest.json` before invoking the verifier.

The resulting required layout is:

```text
source-input/
  source-snapshot/
    manifest.json
```

The consumer continues to verify the snapshot ID/count/bytes and source hashes, and V2 preparation still requires `--source-snapshot source-input/source-snapshot --acquisition-disabled`.

## Failure sequencing

National coverage, structural scan, hard candidate validation, and capacity measurement now run only when `prepare-v2` succeeds. Deterministic tests remain independent, as does the TNDS metadata-only probe. Evidence-log copying and artifact upload retain `if: always()`. The final fail-closed conclusion still fails when snapshot verification or any required gate does not succeed, including when candidate-dependent steps are skipped.

The V2 workflow remains non-publishable and non-deployable. No preparation, source acquisition, service semantics, or production workflow code was changed beyond this workflow infrastructure correction.

## Frozen-reuse rerun

The next proof must use the exact immutable artifact from #37. The source producer's explicit frozen reuse path restores `atlas-reference-source-snapshot-38533475680` from run `38533475680`, validates it, and marks the snapshot as frozen without claiming current freshness. Optional expected values are applied only in frozen-reuse mode:

- Snapshot ID: `13e2895be61c5bb5adaf8adec9896520b8224ff243766818d3ca920f0eae71e1`
- Source count: `11`
- Total bytes: `2327615358`

This rerun must not reacquire NaPTAN, NPTG, or BODS operational source data. No local source acquisition was performed for REMOTE-1A; only local repository tests were run.

## Verification

Required command:

```text
node tests/atlas/run-all.mjs
```

The workflow contract tests assert exact artifact identity verification, ID-based extraction into `source-input`, the required manifest path, frozen-reuse run-ID and expected values, producer-emitted metadata for fresh runs, acquisition-disabled preparation, candidate-gate sequencing, evidence upload after failure, V2 publication/deployment exclusion, and metadata-only TNDS probing.

The full suite passed with the exact sentinel:

```text
ATLAS Alpha.15 deterministic suite passed.
```

`git diff --check` passed. C1/C2 regression proofs remain included through `tests/atlas/run-all.mjs`. No Python preparation code was changed.

## GitHub tooling adoption review

Review only; no tool was installed or configured.

- **Dependabot:** already configured for weekly grouped npm and GitHub Actions updates; keep it as the single dependency-update bot.
- **Codecov:** no coverage upload or agreed coverage threshold exists; defer until coverage collection becomes a maintained gate.
- **OpenSSF Scorecard:** not configured; consider a later read-only security posture report and review its findings separately.
- **Sentry:** not configured; defer product telemetry until the owner agrees on privacy scope and retention for this static client.
- **Renovate:** would overlap with existing Dependabot coverage; no current gap warrants a second update bot.

## Exact Product Owner action

Start a **new** manual run from the corrected branch. Do not rerun failed jobs from #37, because they would use the old workflow revision.

1. GitHub → **Actions** → **ATLAS Bus data refresh** → **Run workflow**.
2. Select branch `codex/atlas-bus-data-remote-1a-artifact-restore-path`.
3. Set `prepared_schema` to `v2` and `measure_only` to `true`.
4. Set `v2_source_snapshot_run_id` to `38533475680`.
5. Set `v2_expected_snapshot_id` to `13e2895be61c5bb5adaf8adec9896520b8224ff243766818d3ca920f0eae71e1`, `v2_expected_source_count` to `11`, and `v2_expected_total_bytes` to `2327615358`.
6. Leave other inputs at safe defaults and run the workflow.

Review consumer extraction and snapshot verification, then preparation and downstream gates. Preserve the distinction between the local ACQ-1 snapshot and the #37 remote snapshot. Stop after REMOTE-1A; do not begin BUS-DATA-TRUST-1, acquire TNDS archives, polish, automate selective acquisition, publish, deploy, or promote Beta.
