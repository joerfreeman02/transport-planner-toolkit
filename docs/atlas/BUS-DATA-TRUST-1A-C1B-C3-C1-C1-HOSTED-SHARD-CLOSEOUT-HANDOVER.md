# BUS-DATA-TRUST-1A-C1B-C3-C1-C1 — Hosted Wiring and Bounded Shards

## Handover

- Starting SHA: `0cc275f1646c16284f12e19397a92896da92ba9f`
- Branch: `codex/atlas-bus-data-trust-1a-c1b-c3-c1-c1-hosted-shard-closeout`
- Final implementation SHA: recorded after the closeout commit below
- Version/build: `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`
- Recommendation: suitable for Technical Director hosted-preflight review only. No hosted preflight or national run was performed.

## Corrections

### 1. London source-side classification

`reconcile()` iterates source sides as `PRIMARY` and `TNDS`, but the London branch compared `side` with lowercase `primary`. The branch now checks `PRIMARY`. A regression supplies London rows on both sides and verifies they produce separate `OUTSIDE_TNDS_COMPARATOR_SCOPE` rows: the primary row carries its primary evidence/native IDs and no TNDS IDs; the hypothetical TNDS row carries its TNDS IDs and no primary IDs. Both remain planner-ineligible and do not change source authority.

### 2. Hosted `CHECKPOINT_BRANCH`

The reconciliation shell command consumed `CHECKPOINT_BRANCH`, but its step environment did not define it. The reusable workflow now binds `CHECKPOINT_BRANCH: ${{ github.ref }}`. The workflow contract extracts the reconciliation step, checks all four required provenance variables (`CHECKPOINT_RUN_ID`, `CHECKPOINT_BRANCH`, `CHECKPOINT_COMMIT`, and `CHECKPOINT_REPOSITORY`) are supplied, and checks the invocation consumes each one. A runtime regression confirms a blank branch is rejected before the reconciliation function is called.

Earlier workflow tests checked artifact restore, producer identity, and invocation arguments but did not compare the invocation's shell variables with the step's `env` block. That left the undefined branch variable undetected.

### 3. Bounded stop-identity shards and reconciliation

C3-C1 emitted one gzip file per region and loaded both whole-region row lists. Its `chunk_rows` value did not cap shard size. The new checkpoint schema uses deterministic `region + SHA-256 prefix of normalized StopPoint ID` comparison buckets. The same normalized stop and canonical region always resolve to the same bucket on PRIMARY and TNDS. Within a bucket, evidence is sorted and written in physical gzip shards that do not split a stop identity; normal shards are capped at 25,000 rows. Every file is hashed incrementally and appears in a deterministic ordered manifest. London uses its own region namespace and buckets.

Checkpoint creation streams evidence into a temporary SQLite spool, groups by normalized stop identity, and emits bounded shards. If one identity group exceeds 25,000 rows, it is written alone as an explicitly marked oversized shard, retains its full evidence in the checkpoint, and records a hash of the oversized identity. Verification streams each file, checks row counts and hashes, checks that each row belongs to the declared bucket, and rejects an identity split across consecutive shards.

The reconciler now streams all checkpoint rows into a temporary disk-backed SQLite index instead of retaining regional lists. It queries one normalized stop identity at a time. A comparison unit with at most 25,000 combined rows may enter the comparator; larger identity groups bypass candidate expansion and produce one bounded `AMBIGUOUS_IDENTITY_GROUP` ledger row with counts and at most 20 evidence/route samples per side. No winner is manufactured. The ledger continues to be written and hashed incrementally.

Instrumentation records comparison bucket count, largest combined stop identity group, maximum primary/TNDS/combined rows loaded for a comparison unit, oversized groups, candidate comparisons, and ledger rows. This records logical working units, not process RSS.

## Run #42-order rehearsal

The rehearsal lazily emits three scheduled-stop evidence rows per service for each known Run #42 regional service count:

| Region | Services |
| --- | ---: |
| EA | 5,908 |
| EM | 21,798 |
| NE | 20,677 |
| NW | 41,451 |
| SE | 49,450 |
| SW | 55,095 |
| WM | 32,030 |
| Y | 56,278 |
| **Total** | **282,687** |

This produced 848,061 evidence rows per side, three times the service count. The test verified matching identities on both sides resolve to the same region/bucket and that aggregate projection hashes are repeatable. It exercised the full checkpoint-to-ledger path without constructing a national Cartesian product.

For this deterministic fixture, the largest loaded normal comparison unit was 5,908 rows from PRIMARY plus 5,908 from TNDS, 11,816 combined. The largest single normalized stop identity contained 112,556 rows combined; it was kept on disk and summarized as an oversized ambiguity. The rehearsal verified that oversized sample loading remains bounded, candidate comparisons are zero for the fixture's unbridged identities, and the ledger is streamed.

## Preserved contracts and limits

The C3-C1 region mappings, native region/archive provenance, region-scoped unresolved-stop corroboration, frozen Run #37 primary identity, and corrected Run #40 TNDS snapshot/artifact identity remain unchanged. Checkpoint compatibility still permits downstream-only retry when the projection fingerprint matches and rejects projection changes. Pipers Lane route findings and Peterborough BCE/BST non-call protections remain in place. Planner, TfL/iBus/BODS authority, route grouping, destination grouping, calendar semantics, and planner runtime were not changed. TNDS remains a diagnostic comparator only.

The rehearsal is synthetic. No live source acquisition, hosted artifact restore, Actions execution, current-freshness check, or Product Owner acceptance was tested. Remaining live risks include hosted artifact availability/retention, GitHub workflow/API behavior, real evidence distribution and disk consumption, and temporary SQLite throughput on the hosted runner. These require later authorized hosted gates.

## Next gates — document only

Do not execute these settings in this sprint.

Gate A after Technical Director acceptance:

- `force_refresh = false`
- `measure_only = true`
- `prepared_schema = v2`
- `resume_checkpoint_run_id = blank`

Only after Gate A acceptance, Gate B:

- `force_refresh = true`
- `measure_only = true`
- `prepared_schema = v2`
- `resume_checkpoint_run_id = 38579244547`

Gate B must reuse the verified Run #40 TNDS artifact and must reacquire nothing.

## GITHUB TOOLING ADOPTION REVIEW

- Dependabot: configured; retain.
- Codecov: defer pending a formal coverage baseline.
- OpenSSF Scorecard: later release/security-governance milestone.
- Sentry: defer pending telemetry/privacy architecture.
- Renovate: do not duplicate Dependabot absent a clear reason.

This sprint creates no new installation milestone.

## Verification and release

- Full Python suite: `Ran 243 tests in 123.520s — OK`.
- Run #42 three-stop scale rehearsal: passed with exact loaded-row maxima of 5,908 primary, 5,908 TNDS, and 11,816 combined.
- Node suite passed with `ATLAS Alpha.15 deterministic suite passed.` The in-sandbox attempt hit Windows `EPERM` on the updater test's temporary-directory rename; the required rerun outside the sandbox passed.
- `git diff --check`: passed.
- Final implementation/pushed SHA and clean local/origin parity are recorded in the final handover.
- No Actions dispatch, source acquisition, PR, merge, publication, or deployment occurred.
