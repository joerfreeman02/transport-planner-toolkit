# BUS-DATA-TRUST-1A-C1B-C3-C1 — Region, Scale and Recovery Closeout

## Decision and scope

This corrective branch addresses the C3 findings for region identity, checkpoint compatibility, bounded national processing, and explicit Pipers Lane reference-route findings. The work remains diagnostic-only. It does not change planner behavior, source authority, or version declarations.

- Starting baseline: `39e142767946aa31ecf0f87544e6d7491ca90297`
- Branch: `codex/atlas-bus-data-trust-1a-c1b-c3-c1-region-scale-recovery-closeout`
- Closeout implementation commit: `0389db1` (`Fix C3 region identity and bounded checkpoint recovery`)
- Version/build: `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`
- `plannerEligible=false`, `plannerOutputChanged=false`, `sourceAuthorityChanged=false`

## Defects reproduced and corrections

### Primary region identity

The prepared primary manifest names regions `east_anglia`, `east_midlands`, `london`, `north_east`, `north_west`, `south_east`, `south_west`, `west_midlands`, and `yorkshire`. C3 uppercased these values, while the TNDS comparator expects `EA`, `EM`, `NE`, `NW`, `SE`, `SW`, `WM`, and `Y`. This made otherwise valid primary evidence fail the comparator's region contract. A single central contract now maps those eight native names explicitly and maps `london` to `LONDON`. Projected evidence retains `sourceRegion` and archive identity. Unknown primary names raise a projection-contract error. London remains `OUTSIDE_TNDS_COMPARATOR_SCOPE`.

The regression projects all nine names using the real manifest contract and checks the eight comparator mappings, London exclusion, and zero valid evidence lost to invalid identity due to the namespace mismatch. Unresolved raw-stop corroboration now requires both canonical region and exact stop string.

### Checkpoint retry compatibility

C3 coupled retry to the exact current commit, so a downstream reconciliation fix invalidated already prepared evidence. Checkpoints now retain original producer and preparation commits for traceability, alongside a projection/checkpoint schema and deterministic compatibility fingerprint. The fingerprint covers the projection, stream writer, checkpoint verifier, region normalizers, and region-manifest validator. It excludes downstream matcher/report logic.

Retry requires exact repository, controlled C3/C3-C1 branch lineage, ancestor producer commit, original source snapshot and artifact identity, projection/shard hashes, schema, fingerprint, and diagnostic flags. Tests prove same-commit retry and ancestor reuse after a reconciliation-only commit, while rejecting a changed fingerprint, wrong source/repository/lineage, missing checkpoints, and corrupt shards. Workflow restore also verifies artifact identity and expiration before use; hosted expiration behavior is covered by workflow contract tests, not by a live Actions run.

### Bounded national evidence processing

Preparation traverses service shards incrementally, uses a temporary SQLite stop index, and writes deterministic gzip JSONL shards by canonical region. The checkpoint manifest records side, source snapshot, source producer run, source artifact name/ID/digest, checkpoint producer run/commit/branch, prepared schema, source window, service/evidence totals, per-region counts, projection fingerprint/schema, ordered shard hashes, aggregate projection digest, and diagnostic flags. File and shard verification is incremental; it does not canonicalize a national payload into one `json.dumps` string.

Reconciliation loads one canonical region from each source at a time. It streams ledger rows directly into deterministic gzip output and updates hashes and bounded summaries as it writes. The scale instrumentation records service/evidence inputs, projected counts, shard and region counts, maximum simultaneous projection rows, maximum candidate bucket, candidate comparisons, exact matches, composite candidates, ambiguous groups, primary-only/TNDS-only rows, ledger rows, and the peak logical working-set unit. It does not claim process RSS.

An oversized duplicate identity group is represented by one deterministic `AMBIGUOUS_IDENTITY_GROUP` ledger entry with bounded samples; participants remain marked ambiguous and no winner is fabricated. Candidate expansion is capped at 4,096 pairs per identity key.

## Frozen source identity

The verified Run #40 TNDS identity is `76ee662a30e5bcb0072c93f4dd3a8efe85c41446ca318a1d6f5700070f5bf058`, run `38579244547`, artifact `atlas-tnds-quarantined-38579244547`, artifact ID `11903662011`, digest `sha256:7783327324f160b1bb3dfbd156bede32c57ababc4c790864d6bf9efe175b6f8e`. The previous `bf44218...` value is not used. Checkpoint/source verification binds the corrected snapshot and artifact identity.

The primary frozen source remains snapshot `13e2895be61c5bb5adaf8adec9896520b8224ff243766818d3ca920f0eae71e1`, Run #37 `38533475680`, artifact `atlas-reference-source-snapshot-38533475680`, ID `11878857366`, digest `sha256:01018c145646fdf041ba0c91cbd91b842994f62a292815438a6866ed358db658` (11 sources). No live freshness is claimed and neither source was reacquired.

## Scale rehearsal

The deterministic Run #42-order rehearsal traverses the known 282,687 services across EA 5,908; EM 21,798; NE 20,677; NW 41,451; SE 49,450; SW 55,095; WM 32,030; and Y 56,278. Its first exercise lazily emits one compact evidence row per service, a strict lower bound, and verifies eight shards, maximum one row loaded by the writer, incremental hashing/writing, and stable aggregate digests.

The end-to-end synthetic rehearsal creates 282,687 evidence rows on each side, processes regions in bounded units, compares disjoint identities (zero candidate comparisons), and writes 565,374 ledger rows incrementally. It asserts simultaneous loaded projection rows are at most twice the largest region (112,556), with the logical unit recorded as one canonical region per checkpoint plus one prepared shard during projection. No national primary-by-TNDS product is created. This is a deterministic synthetic rehearsal, not a live source run or an RSS measurement.

## Pipers Lane and Peterborough controls

Pipers Lane remains 51.852700, -0.454343, 700 m, FULL. Services 46, 230, 231, and C each receive an evidence-derived `referenceServiceFindings` entry with source evidence IDs, reconciliation categories, source windows, and an explanation. An absent route is described as not evidenced in the frozen source windows; no route is manufactured. Site wording uses source inventory/comparator coverage and `manualAcceptancePending`, not a claim of complete site evidence.

Peterborough remains PE1 2TL at 52.577554, -0.242489, 500 m. BCE records `0590BCE01L`, `0590BCE02L`, `0590BCE03U`, and `0590BCE04U` remain non-call infrastructure; missing timetable calls are not treated as service loss. BUS-ROBUSTNESS-1B protections remain in place.

TNDS remains a diagnostic independent comparator. It cannot inject routes, fill planner gaps, override BODS/TfL/iBus, become planner-eligible, or act as a runtime fallback. TfL and iBus authority are unchanged.

## Verification

- Focused region/checkpoint/reconciliation/compatibility suite: 22 tests passed after the deterministic gzip-shard format change.
- Run #42 scale rehearsal: 2 tests passed; 282,687 service cardinality and 565,374 ledger rows exercised.
- Full Python suite: `Ran 240 tests in 107.498s — OK`.
- `node tests/atlas/run-all.mjs`: passed; terminal success line: `ATLAS Alpha.15 deterministic suite passed.` The in-sandbox attempt hit Windows `EPERM` on a test temp-directory rename; rerun outside the sandbox passed.
- `git diff --check`: passed.

## Gate settings and live limitations

This branch does not dispatch workflows or acquire sources. Live artifact availability/expiration, hosted runner behavior, current source freshness, and Product Owner acceptance remain untested. Do not dispatch Gate A as part of this sprint.

Gate A, if separately authorized after Technical Director review: `force_refresh=false`, `measure_only=true`, `prepared_schema=v2`, `resume_checkpoint_run_id` blank.

Gate B, if separately authorized: `force_refresh=true`, `measure_only=true`, `prepared_schema=v2`, `resume_checkpoint_run_id=38579244547`. This reuses the frozen TNDS artifact and does not request a fresh TNDS, BODS, NaPTAN, or NPTG acquisition.

For a later compatible retry, use the verified C3-C1 checkpoint producer run ID; retain the same four browser controls and do not add branch-only browser inputs.

## GitHub tooling adoption review

- Dependabot: configured; retain.
- Codecov: defer pending a formal coverage baseline.
- OpenSSF Scorecard: consider in a later release/security-governance milestone.
- Sentry: defer pending telemetry and privacy architecture.
- Renovate: do not duplicate Dependabot without a clear reason.

This corrective sprint creates no new installation milestone.

## Handover status

The closeout implementation commit above is the reviewed change set. The pushed branch tip, local/remote equality, clean worktree, and changed-file inventory are reported in the final handover. No Actions dispatch, source acquisition, PR, merge, publication, or deployment occurred.
