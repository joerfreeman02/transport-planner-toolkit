# BUS-DATA-REMOTE-1B — Full Preflight Hardening Handover

## Executive result

The REMOTE-1B changes harden frozen snapshot replay, source-artifact handoff, diagnostic output validation, and failure behavior while preserving Alpha.15 and the diagnostic-only boundary. The branch started from the exact REMOTE-1A baseline and contains no acquired national data or generated candidate artifacts.

## Baseline and scope

- Repository: `transport-planner-toolkit`
- Required baseline: `79653e793e3f0834c3022c93b6f7ff7f0d9464dd`
- Branch: `codex/atlas-bus-data-remote-1b-full-preflight-hardening`
- Release identity remains `2.0.0-alpha.15`.
- No source acquisition, TNDS archive transfer, workflow dispatch, publication, deployment, merge, or Beta promotion was performed.
- The #37 source snapshot identity remains distinct from the local ACQ-1 snapshot. #37 is `13e2895be61c5bb5adaf8adec9896520b8224ff243766818d3ca920f0eae71e1` (11 files, 2,327,615,358 bytes); local ACQ-1 remains `cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde`.

## Files changed

- `.github/workflows/atlas-reference-data-source.yml`
- `.github/workflows/atlas-reference-data-diagnostic.yml`
- `tools/atlas-bus-data/refresh_bus_data.py`
- `tools/atlas-bus-data/tnds_capability_probe.py`
- `tools/atlas-bus-data/verify_prepared_handoff.py` (new)
- `tools/atlas-bus-data/test_refresh.py`
- `tools/atlas-bus-data/test_remote_preflight.py` (new)
- `tests/atlas/reference-data-workflow-contract.test.mjs`
- `docs/atlas/BUS-DATA-REMOTE-1B-FULL-PREFLIGHT-HARDENING-HANDOVER.md` (new)

## Defects found and corrections

### Frozen preparation date

Frozen-source preparation previously selected `snapshotDate` from the runner’s current UTC date. That could change representative dates and active timetable inclusion decisions on a replay of the same source bytes.

The `--source-snapshot` path now uses the date component of the verified manifest’s original `createdAt` acquisition timestamp. The timestamp must parse as an ISO-8601 date-time and include a timezone. Its original written date component is retained; it is not converted into another timezone. `verifiedAt`, frozen reuse metadata, and the runner clock are not consulted. Missing, malformed, or timezone-naive `createdAt` values fail closed. The non-snapshot legacy path still uses the current UTC date.

The deterministic replay test mocks two different runner dates and checks identical snapshot dates, representative dates, and active-service decisions. It also checks that later frozen-reuse metadata cannot replace the original acquisition date, and malformed or absent acquisition timestamps fail.

### TNDS metadata probe output path

The metadata-only probe now creates its output parent directory before writing. Its `retrievalPerformed` value remains `false`; it uses directory listing, size, and modification-time metadata only. A focused test writes beneath a previously nonexistent nested directory with no credentials and confirms no archive retrieval.

### Prepared-output handoff and downstream gates

The diagnostic workflow now runs `verify_prepared_handoff.py` only after successful V2 preparation. It parses the Bus manifest, status manifest, coverage ledger, gap report, and 0590B forensic report; checks their expected schemas; checks diagnostic-only/non-production status; matches the recorded source snapshot ID in status, coverage, and forensic evidence to the verified input ID; and confirms all manifest-referenced candidate shards are present and readable JSON (including gzip JSON).

Coverage, structural scan, hard validation, and capacity measurement now require both successful preparation and successful handoff. The TNDS metadata probe remains independent. Evidence assembly/upload remains `always()`. The final fail-closed conclusion includes handoff failure. Thus a missing or mismatched output cannot be mistaken for a successful downstream diagnostic.

### Frozen source artifact paths and evidence

The frozen-reuse job checks `prior-source/source-snapshot/manifest.json` immediately after exact-name/run artifact restoration and before `--mark-frozen-reuse`. It separately checks `source-snapshot/manifest.json` after the copy/mark step and before verification/upload. The established artifact download contracts remain unchanged: source reuse downloads by exact artifact name/run into `prior-source`, and the consumer restores by artifact ID with `merge-multiple: true` into `source-input`, then verifies `source-input/source-snapshot/manifest.json`.

After verification, both source modes produce `source-probe/evidence/source-snapshot-mode.json`. Fresh mode retains `source-probe/freshness.json`. Frozen mode records `mode: explicit frozen reuse`, the original source run ID, verified snapshot ID/count/bytes, and `currentSourceFreshnessClaimed: false`; it does not claim current remote freshness. The artifact upload intentionally includes all of `source-probe/`.

For #37, the known original immutable artifact is `atlas-reference-source-snapshot-38533475680`, artifact ID `11878857366`, digest `sha256:01018c145646fdf041ba0c91cbd91b842994f62a292815438a6866ed358db658`; compressed size 1,730,356,466 bytes. REMOTE-1A’s corrected consumer path is retained.

## Remainder-of-action audit

1. **Producer identity:** consumer verifies artifact ID, name, expiry, and producer run through the Actions API before use.
2. **Extraction:** producer and consumer paths match the reviewed single-artifact extraction contracts; consumer uses `merge-multiple: true` and asserts the nested manifest path.
3. **Snapshot verification:** hashes, snapshot ID, source count, and total bytes are separately checked against workflow inputs before interpretation.
4. **Last-known-good:** missing non-OK manifest responses are omitted rather than synthesized as zero-valued JSON. If the LKG Bus manifest is absent or incomplete, `baseline_metrics` now returns no usable baseline, and preparation falls back to the bundled site baseline. Malformed JSON also returns no LKG baseline. A useful baseline retains the existing 50% collapse threshold and regional checks. If neither LKG nor bundled data provides usable metrics, absolute validation still requires national-scale stops/services and, for V2, all nine BODS regions; the diagnostic does not label missing data as authoritative zero counts.
5. **Release metadata:** the release file is staged and parsed before preparation; version/build must be non-empty. No version or build identity is changed.
6. **V2 preparation:** requires the verified snapshot and `--acquisition-disabled`. `refresh_bus_data.py` fails if acquisition is disabled without an explicit snapshot. The snapshot path materializes the verified source bytes only; it does not invoke the live acquisition branches.
7. **Coverage ledger:** produced by preparation under `pages-site/diagnostic-output`; the standalone handoff now verifies all three coverage outputs and their provenance.
8. **Coverage gate:** runs only when both preparation and handoff succeeded; nonzero unclassified remainder or preparation errors fail it.
9. **Structural scan:** runs only after both gates. It reads manifest-referenced locality, group, and reference-stop shards; handoff now prechecks all candidate shards to avoid misleading missing-file cascades.
10. **Hard validation:** runs only after both gates and checks candidate manifests, schemas, shard content, and national scale.
11. **TNDS probe:** always independently attempts metadata-only inspection. It now safely creates `diagnostic-output/` even when all candidate gates are skipped. It never issues `RETR` or reads an archive.
12. **Capacity measurement:** runs only after both gates; its output parent is explicitly created by the workflow.
13. **Deterministic Alpha.15 suite:** runs from a pristine checkout before workspace creation, retains a log even when its gate fails, and does not authorize publication.
14. **Evidence upload:** remains `always()` and warns for optional paths that were never created; it does not turn missing evidence into a successful gate.
15. **Final conclusion:** checks snapshot verification, release staging, preparation, handoff, all candidate gates, deterministic suite, TNDS probe, and capacity. Skipped required gates count as non-success.

The reusable diagnostic workflow has read-only `actions`/`contents` permissions. The top-level V2 path is excluded from production build, Pages artifact upload, and deployment conditions. No V2 publisher is called. No hidden live-source acquisition is available in the frozen prepare command.

## Runner disk review

Run #37 measured 2,327,615,358 raw bytes and a 1,730,356,466-byte compressed artifact. The frozen source producer temporarily holds the restored source tree plus its copy (about 4.66 GB), with a conservative extra 1.73 GB if compressed upload staging is local at the same time: about 6.38 GB of known snapshot-related data before checkout/tooling overhead. The diagnostic runner restores about 2.33 GB and copies it into preparation staging, about 4.66 GB before prepared candidate output. These are separate Ubuntu jobs/runners.

GitHub documents 14 GB SSD storage for standard `ubuntu-latest` hosted runners. The known source-reuse peak is below that nominal capacity. The preparation staging uses the same compressed GTFS ZIP inputs rather than expanding a second raw archive tree; prepared shards add output size. #37 did not run preparation, so exact candidate output size and free disk at peak are not measured. Capacity is therefore plausible against the documented runner size but still needs runtime confirmation from the next authorized diagnostic run. No source evidence is deleted to save disk.

## Tests executed

- Python: `python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v` — 107 tests passed (all `tools/atlas-bus-data/test_*.py` files, including the new regressions).
- Targeted deterministic workflow contract: `node tests/atlas/reference-data-workflow-contract.test.mjs` — passed.
- Full suite: `node tests/atlas/run-all.mjs` — passed, including C1/C2 and legacy-isolation protections.
- Required full-suite sentinel: `ATLAS Alpha.15 deterministic suite passed.`
- `git diff --check` — passed before final commit.

No local operational NaPTAN/NPTG/BODS acquisition or TNDS archive retrieval was performed. Tests used fixtures/synthetic manifests. No Alpha.16, Beta, or production identity change was made.

## GitHub tooling adoption review

- **Dependabot:** already enabled for weekly npm and GitHub Actions updates in `.github/dependabot.yml`; grouped updates and PR limits are configured.
- **Codecov:** no Codecov workflow/config was found. Not added; the current suite is deterministic and no coverage threshold requirement was supplied.
- **OpenSSF Scorecard:** no Scorecard workflow was found. Consider as a separate repository-governance task; not enabled in this diagnostic sprint.
- **Sentry:** no Sentry integration was found. The repository is a static client application and this sprint changes no production runtime telemetry; not added.
- **Renovate:** no Renovate configuration was found. It would overlap the existing Dependabot update automation; keep one dependency-update owner unless a future migration is explicitly chosen.

No tooling was installed or reconfigured.

## Product Owner dispatch handover

Do not dispatch until this branch is reviewed and merged by the Product Owner’s normal process. Then run the existing `ATLAS Bus Data Refresh` workflow manually on `main` with:

| Input | Value |
|---|---|
| `prepared_schema` | `v2` |
| `measure_only` | `true` |
| `force_refresh` | `false` |
| `resume_checkpoint_run_id` | empty |
| `v2_source_snapshot_run_id` | `38533475680` |
| `v2_expected_snapshot_id` | `13e2895be61c5bb5adaf8adec9896520b8224ff243766818d3ca920f0eae71e1` |
| `v2_expected_source_count` | `11` |
| `v2_expected_total_bytes` | `2327615358` |

This explicitly reuses #37 and keeps `currentSourceFreshnessClaimed` false. The `measure_only=true` value is required for the diagnostic V2 path on `main`; publication and deployment remain disabled.

## Runtime-only follow-up

The next approved run must confirm the actual Ubuntu free-disk headroom and prepared-candidate size. The #37 artifact itself is known and independently identified, but its V2 candidate has not yet been prepared. All other remaining behavior is covered by local fixtures/contracts; a remote run is intentionally left to the Product Owner.
