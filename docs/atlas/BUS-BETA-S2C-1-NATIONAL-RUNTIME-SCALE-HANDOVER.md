# ATLAS Bus S2C-1 National Runtime Scale Handover

## Scope and guardrails

This change bounds prepared TNDS runtime work by splitting services into deterministic stop-indexed gzip shards, capped at 8 MiB decompressed per shard. The prepared candidate schema is `atlas-prepared-bus-tnds-v2`. Existing v1 manifests remain readable for backward compatibility. The Bus adapter loads only v2 shards relevant to the requested stops and bounds decompression before parsing.

If supplementary TNDS cannot be loaded, valid BODS services remain visible with `PARTIAL` completeness and an unresolved supplementary-source condition. The assessment remains review-required; BODS failure semantics are unchanged.

### Verified MA-01 causes

- **MA-01A:** Run #63's `02101-se.json.gz` Pipers shard is about 730 MB after decompression. The adapter previously used `Response.text()`, requiring one enormous JavaScript string. The gzip and JSON were valid; the runtime materialisation size was the failure. Across the whole candidate, the worst decompressed shard was over 3 GiB.
- **MA-01B:** after BODS loaded, a TNDS shard failure returned whole-call `sourceFailure`, discarding valid BODS services. The adapter now returns the BODS evidence with machine-readable TNDS unresolved/partial state and failed scope details. The assessment cannot become evidence-complete on that result.

### Runtime package contract

The v2 manifest lists deterministic descriptors containing each subshard path and its exact StopPoint IDs, plus compressed and decompressed byte counts. Service records are sorted by stable identity and partitioned without dropping records. The runtime requests only descriptors intersecting the assessment's stop IDs and checks the decompressed byte cap while streaming. Candidate validation checks the same package invariant. An oversized single service record fails preparation with an explicit error.

No live source acquisition, candidate rebuild, Run #63 mutation, publication, deployment, release, merge, or PR is authorised or performed by this implementation task. A new review candidate must be built from a future explicitly authorised frozen-source compose before manual acceptance can use the v2 candidate format. Manual acceptance remains outstanding.

## Run #63 scale evidence

The immutable local Run #63 prepared TNDS package was inspected read-only. It contains 668 shard files, 308,547 services, 3,597,371,296 compressed bytes and 106,338,819,646 decompressed bytes. 457 shards exceed the 8 MiB decompressed runtime ceiling. The largest shard is `services/43000-wm.json.gz`, at 136,865,086 compressed bytes and 3,289,454,433 decompressed bytes. This confirms that the existing runtime cannot safely treat a five-character stop-prefix shard as a bounded unit.

The implementation preserves each service record and its operator, calendar, schedule, and stop identity. Deterministic service ordering and stable shard ordinals make identical input produce identical shard layout. A single record larger than the configured ceiling fails explicitly; it is never silently omitted.

## Verification

The test coverage added or updated for this correction includes:

- deterministic bounded shard preparation, count and byte accounting, stable output, and over-limit record rejection;
- v2 manifest and descriptor validation, including path, stop IDs, compressed size, decompressed ceiling, and service identity count;
- adapter selection of only stop-relevant shards and bounded browser decompression;
- preservation of loaded BODS evidence when supplementary TNDS is unresolved, while keeping the assessment partial and under review;
- a headless Edge/HTTP end-to-end test from generated v2 candidate files through browser fetch/decode, service matching, BODS/TNDS composition, and planner assessment rows;
- an S2C-1 workflow selector restricted to the exact zero-download offline preflight inputs, with no live, candidate, publication, or deployment route.

Local verification completed before the handover-document follow-up:

- `python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v` — 295 tests passed.
- `node tests/atlas/run-all.mjs` — passed with `ATLAS Alpha.15 deterministic suite passed.`; includes the browser multi-shard test.
- Focused review-candidate and TRUST workflow contracts — 41 Python tests passed; Node review-candidate contract passed.
- `git diff --check` — passed.

The exact-final-SHA hosted preflight is rerun after this handover-document update. Its run identity and immutable evidence artifact are included in the accompanying handover summary.

## Acceptance boundary

The browser integration test uses generated bounded shards and validates the runtime path end to end. It does not establish manual acceptance for Run #63. Manual national-control testing (including Pipers Lane, Waltham Cross, and the Chingford control) remains required against a newly prepared v2 review candidate. Run #63 remains immutable.

### Remaining acceptance work

- A **new review candidate build is required** before manual acceptance because Run #63 retains the v1 oversized-shard package and must remain immutable.
- **No new source acquisition is required.** A future candidate may use the already-authorised frozen Run #53 inputs after separate Technical Director approval.
- Manual Pipers 230/231 arbitration, Waltham national/TfL coexistence, and Chingford controls remain outstanding against that v2 candidate; fixture controls are not a substitute.
- **MA-02 remains separate:** restore/verify route-terminus presentation; prove endpoint identity where TfL IDs differ from ordered-pattern national stop IDs; retest operator presentation on national/prepared evidence. S2C-1 did not rewrite GROUP, DEST, CIRC, terminus, or operator logic.
- Hosted final-SHA preflight run and its immutable evidence artifact are recorded in the accompanying handover summary. It must show successful suites and no source acquisition or deployment before S2C-1 is treated as engineering-complete.

## Revision record

- Starting revision: `0f63682c02fab669beb813f8c627200709fe3fbc`
- Implementation branch: `codex/atlas-bus-beta-s2c-1-national-runtime-scale`
- Final revision and hosted zero-download preflight: recorded in the handover summary accompanying this document
- Live downloads: none
- Publication/deployment: none
