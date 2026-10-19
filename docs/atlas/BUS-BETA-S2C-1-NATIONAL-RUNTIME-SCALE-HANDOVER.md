# ATLAS Bus S2C-1 National Runtime Scale Handover

## Scope and guardrails

This change bounds prepared TNDS runtime work by splitting services into deterministic stop-indexed gzip shards, capped at 8 MiB decompressed per shard. The prepared candidate schema is `atlas-prepared-bus-tnds-v2`. Existing v1 manifests remain readable for backward compatibility. The Bus adapter loads only v2 shards relevant to the requested stops and bounds decompression before parsing.

If supplementary TNDS cannot be loaded, valid BODS services remain visible with `PARTIAL` completeness and an unresolved supplementary-source condition. The assessment remains review-required; BODS failure semantics are unchanged.

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

The hosted final-SHA preflight is run after the implementation is committed and pushed. Its exact run identity and evidence artifact are included in the handover summary accompanying this document.

## Acceptance boundary

The browser integration test uses generated bounded shards and validates the runtime path end to end. It does not establish manual acceptance for Run #63. Manual national-control testing (including Pipers Lane, Waltham Cross, and the Chingford control) remains required against a newly prepared v2 review candidate. Run #63 remains immutable.

## Revision record

- Starting revision: `0f63682c02fab669beb813f8c627200709fe3fbc`
- Implementation branch: `codex/atlas-bus-beta-s2c-1-national-runtime-scale`
- Final revision and hosted zero-download preflight: recorded in the handover summary accompanying this document
- Live downloads: none
- Publication/deployment: none
