# BUS-DATA-TRUST-1A-C1B-C3 — Recoverable National Reconciliation Handover

## Gate status

C3 implementation is prepared for Technical Director review. It has not been dispatched against GitHub Actions or live sources. No hosted reconciliation result, planner acceptance, source authority change, publication, or deployment is claimed.

- Branch: `codex/atlas-bus-data-trust-1a-c1b-c3-recoverable-reconciliation`
- Starting SHA: `fff57b57b47dba8eea76e32ebdfc0c53c0d0c092`
- Final pushed SHA: included in the delivery handover; the commit cannot embed its own SHA without changing that SHA.
- Version/build: `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`

## Audited source evidence

The source artifacts and run metadata were inspected through the existing GitHub artifact mechanisms. No source endpoint was contacted.

| Evidence | Producer | Artifact | Verified identity |
|---|---:|---|---|
| Frozen primary raw snapshot | Run #37 `38533475680` | `atlas-reference-source-snapshot-38533475680`, artifact `11878857366` | Snapshot `13e2895be61c5bb5adaf8adec9896520b8224ff243766818d3ca920f0eae71e1`; digest `sha256:01018c145646fdf041ba0c91cbd91b842994f62a292815438a6866ed358db658`; 11 source archives |
| Run #38 primary preparation diagnostics | Run #38 `38546738997` | `atlas-reference-diagnostic-38546738997`, artifact `11885602895` | Digest `sha256:886389f1b9bd89ced29ad0782e9fa7f0728ff292bd93bed786d650b66319fea0`; coverage ledger and forensic reports survive; prepared service shards do not |
| Frozen TNDS raw comparator | Run #40 `38579244547` | `atlas-tnds-quarantined-38579244547`, artifact `11903662011` | 766,961,479 bytes; digest `sha256:7783327324f160b1bb3dfbd156bede32c57ababc4c790864d6bf9efe175b6f8e` |
| TNDS preparation evidence | Run #42 `38699091568` | `atlas-tnds-trust-evidence-38699091568`, artifact `11956363153` | Digest `sha256:96aae7d6c989876d077122c7c5dec757142250e4a23b14c628eba25480883822`; summaries/manifests only, no prepared service shards |

Run #42 reports counts EA 5,908; EM 21,798; NE 20,677; NW 41,451; SE 49,450; SW 55,095; WM 32,030; Y 56,278 (282,687 total). C3 uses these as a preparation-integrity check when Run #40 is prepared.

**Snapshot identity discrepancy for review:** the supplied C3 brief names Run #42 TNDS snapshot `bf44218fb78ea4d142842ca25d51ddf39b820f789571b0ab3a60fb272d97b0cb`. The downloaded Run #42 evidence artifact instead records `76ee662a30e5bcb0072c93f4dd3a8efe85c41446ca318a1d6f5700070f5bf058`. C3 does not substitute one for the other or hardcode either as Run #40's source identity: the raw Run #40 snapshot manifest is re-verified, bound to producer Run #40, and carried into the checkpoint. Technical Director review should resolve the discrepancy before a hosted reconciliation is accepted.

## Existing architecture and defect

Run #38's diagnostic artifact contains the source-window coverage ledger (including unresolved identity records), structural and forensic reports, and manifests. It does not contain the prepared primary service shard payload. Run #42 contains TNDS run evidence, source/prepared manifests, summary, and capacity report, but no compressed TNDS service shards. Both prepared national datasets therefore had to be recreated from the verified frozen raw artifacts for a live reconciliation.

The prior matcher grouped rows by region, then `_pair_rows` compared every primary row with every TNDS row. Its ambiguity check then rescanned the entire candidate-pair collection for each output pair. This made the dominant path quadratic in regional inputs and the ambiguity work quadratic in the already-expanded pair set.

## Indexed matching

The national path now indexes by region and normalized exact StopPoint ID. Within a shared stop bucket it groups only by (a) equal, validated identity bridges or (b) equal composite evidence (operator, origin, destination, and stop sequence). Composite pairs remain candidate evidence and never become exact corroboration. Route number, operator, service code, and route ID alone cannot establish service identity. Duplicate identities remain ambiguous.

Ambiguity degrees are calculated once per input row. Instrumentation records input rows, stop buckets, candidate pairs actually materialized, exact pairs, composite pairs, ambiguous stop groups, and unmatched rows. The deterministic 8-region regression uses 4,032 primary and 4,024 TNDS rows (over 16.2 million possible regional-product pairs) and asserts only 32 indexed candidate pairings, including exact, composite, and ambiguous evidence. It uses no wall-clock threshold.

London primary evidence is emitted as `OUTSIDE_TNDS_COMPARATOR_SCOPE`; it does not enter invalid identity counts or eight-region completeness. TfL and iBus authority are unchanged.

## Projection and checkpoint contracts

`reconciliation_projection.py` reads only already-prepared compressed service and stop shards. It emits service-stop evidence with native IDs, route/operator/endpoints, stop sequence, operating days, validity dates, archive/region lineage, snapshot identity, physical coordinates where present, call eligibility, and conservative identity-bridge flags. No bridge is invented. Unresolved GTFS records remain a separate source-window-bound collection from the primary coverage ledger; they are not turned into planner StopPoints.

`reconciliation_checkpoint.py` binds each projection to source snapshot, original source producer run, artifact name/digest where available, repository, preparation commit/schema, source-window basis, row and regional counts, and a canonical projection SHA-256. Flags enforce diagnostic-only, no freshness claim, no planner eligibility, no authority change, and no publication eligibility. Retry verification fails closed for missing or corrupt projections, wrong source/producer/artifact/repository/schema/commit/branch, or changed row totals.

The primary diagnostic workflow uploads `atlas-primary-reconciliation-checkpoint-<run-id>` after frozen Run #37 restoration and acquisition-disabled v2 preparation. The TNDS workflow uploads `atlas-tnds-reconciliation-checkpoint-<run-id>` after exact Run #40 restoration, bounded regional preparation, Run #42 count checks, and projection creation. These are separate jobs/runners. A later reconciliation failure leaves both uploaded artifacts available.

The C3 reconciliation workflow verifies the selected producer run and both expected artifact names through GitHub metadata before downloading them. Retry also requires the C3 branch, repository, and exact compatible commit. It restores both checkpoint artifacts and does not call either national preparation workflow. Missing, expired, or invalid checkpoints fail before any expensive stage.

## Reconciliation outputs and controls

`run_reconciliation.py` validates full eight-region TNDS evidence, the primary source-window coverage ledger, and both checkpoint hashes before matching. It writes the full compressed `reconciliation-ledger.json.gz`, summary/category/regional reports, source-window basis, checkpoint manifests, run evidence, and bounded category/region/control samples. All report flags remain diagnostic-only and planner-ineligible.

The comparison `asOf` is derived deterministically from the earlier of the primary and TNDS immutable source-window dates. A mismatch is reported as source-window context and service-level validity differences remain `SOURCE_WINDOW_DIFFERENCE`.

Pipers Lane is assessed at 51.852700, -0.454343 within 700 m. Product reference routes 46, 230, 231, and C are review controls only; the report lists evidence from restored projections and does not manufacture missing routes. It includes nearby physical stops, call eligibility, primary/TNDS evidence, reconciliation categories, and exact unresolved raw-stop references where available.

Peterborough / Queensgate is assessed at 52.577554, -0.242489 within 500 m. The report lists stops and services from the restored projections, plus discovered `0590BCE*`/`0590BBST*` infrastructure and its distance from the control. Such infrastructure is explicitly non-call and is not counted as timetable absence. The supplied coordinate/radius and the station-entrance vicinity are retained separately so out-of-radius entrances are not silently treated as nearby stops.

The current primary unresolved summary derives from the restored snapshot's coverage ledger, checks that the ledger snapshot matches the checkpoint, counts calls/raw GTFS stop identities/routes/regions, and reports exact TNDS raw-stop references without changing the resolver. Operator lineage and service-level identity remain explicitly unavailable where the coverage ledger does not provide them. The historical 4,908 count is not copied into a new source window.

## Workflow settings (documented only; not run)

Gate A — hosted zero-source preflight:

- `force_refresh = false`
- `measure_only = true`
- `prepared_schema = v2`
- `resume_checkpoint_run_id = blank`

Gate B — after Technical Director acceptance, frozen artifact reuse and reconciliation:

- `force_refresh = true`
- `measure_only = true`
- `prepared_schema = v2`
- `resume_checkpoint_run_id = 38579244547`

Checkpoint retry uses `force_refresh = true`, `measure_only = true`, `prepared_schema = v2`, and the exact prior C3 checkpoint producer run ID. It validates artifacts and compatibility before restore and skips both primary and TNDS preparation.

The live selector supplies no TNDS secrets, source acquisition, FTP, RETR, publication, or deployment. The primary frozen-source workflow restores Run #37 only. These modes were not dispatched in C3.

## Verification

- `python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v`: **228 tests, OK**.
- Focused reconciliation/checkpoint/projection/workflow-contract selection: **66 tests, OK**.
- `node tests/atlas/run-all.mjs`: **passed** with exact sentinel `ATLAS Alpha.15 deterministic suite passed.` Its output included 17 numbered group summaries (146 tests in those summaries) and 212 individual `PASS` records; those are separate reporting formats and are not added together.
- The Node suite required the writable workspace temp path and permitted loopback for its local review-server tests; no external source endpoint was contacted.
- `git diff --check`: clean.
- Final branch/origin parity, worktree cleanliness, and pushed SHA are confirmed in the completion handover.

## Remaining risks and limits

- No real C3 national projection or live control result exists until the later hosted Gate B run.
- Run #42's documented snapshot ID differs from the value in its verified evidence artifact, as described above.
- The historical unresolved ledger includes GTFS stop identities, trip IDs, route IDs/numbers, and names but not operator IDs. The C3 report preserves that lineage limit.
- No deterministic cross-source service identity bridge is emitted by current primary/TNDS preparation. Thus the live report may show many conservative composite candidates and primary-only/TNDS-only evidence; this is intentionally not converted into agreement.
- No planner/browser/Word/manual acceptance is part of this diagnostic sprint.

## GitHub tooling adoption review

- **Dependabot:** configured; retain.
- **Codecov:** defer until a formal coverage baseline and ownership are agreed.
- **OpenSSF Scorecard:** consider in a later release/security-governance milestone.
- **Sentry:** defer pending telemetry and privacy architecture.
- **Renovate:** do not duplicate Dependabot without a clear reason.

C3 creates no new GitHub tooling installation milestone.
