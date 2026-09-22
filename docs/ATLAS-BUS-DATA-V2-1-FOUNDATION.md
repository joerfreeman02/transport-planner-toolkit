# ATLAS BUS-DATA-V2-1 — Prepared Data V2 Foundation

Status: branch foundation only; runtime StopArea completion and NPTG runtime use remain separate sprints.

## Scope and safety boundary

This change adds a versioned prepared-data v2 contract, streaming authoritative XML parsers, deterministic logical-group and locality sidecars, v2 adapter decoding, and bounded QA metadata. The existing v1 CSV/BODS path remains the default and its planner behaviour is unchanged.

It does not implement runtime StopArea completion, recursive group traversal, NPTG runtime enrichment, grouping presentation, or national publication. No full national v2 build, Bus refresh, TNDS publication, Pages deployment, or merge was performed by this work.

The approved architecture remains ADR-012: a future core assessment may trigger bounded authoritative StopArea completion; recursion and speculative inference are excluded from this foundation.

## Source and parser contract

The v2 source foundation can acquire and hash:

- official NaPTAN XML (`dataFormat=xml`), including the observed schema versions 2.1 and 2.4 and namespace variation;
- official NPTG XML (`/v1/nptg`), including locality parent and district references;
- the existing BODS regional GTFS and TNDS acquisition paths.

The XML parser uses `xml.etree.ElementTree.iterparse` and clears completed StopPoint, StopArea, locality, and district records. It does not load the national XML document as one in-memory tree. Unknown roots, missing/unsupported schema versions, malformed XML, malformed required records, invalid coordinates, and invalid identifiers are rejected or quarantined with deterministic QA counters; they are never converted into inferred planner facts.

The parser is namespace-agnostic by local element name but records the source namespace and schema version in provenance. The accepted v2 prepared manifest is `atlas-prepared-bus-data-v2`, version `2.0.0`.

## Normalised v2 records

Physical StopPoint records retain the existing v1 fields and add:

- `nptgLocalityCode`;
- plural `logicalGroupRefs`, each with source, source ID, canonical ID, membership status, target existence, and provenance;
- record status and provenance.

There is no scalar `stopAreaId` field. No group or locality is invented when the source does not provide a reference.

Logical-group sidecars use `atlas-prepared-logical-groups-v1` and contain canonical ID, provider, source ID, name, type, status, parent group reference, coordinate, locality reference, sorted unique member StopPoint IDs, missing/inactive membership lists, geometry QA, and provenance.

Locality sidecars use `atlas-prepared-nptg-localities-v1` and contain canonical ID, code, name, parent and higher-locality references, district reference, source locality type, coordinate, and provenance.

Physical stops, services, logical groups, and localities are emitted as deterministic gzip JSON shards. No raw source XML is copied into the prepared output and no monolithic national metadata blob is produced.

## QA contract

NaPTAN QA records active/inactive groups, no/one/multiple group membership, inactive/deleted memberships, missing group targets, duplicate memberships, malformed records, parent groups, and unsupported structure counters. Group geometry QA records member count, maximum member-to-member span, maximum distance from the group coordinate, missing and inactive members, multiple-membership members, and coordinate outliers.

NPTG QA records malformed records, missing parent localities, missing districts, locality cycles, and unsupported structure counters. Cycles are reported; parent chains are not silently flattened.

## Fixtures and controls

Deterministic fixtures cover:

- East View, including two physical members and a GPBS group;
- an ATCO-210 national pair and a 2.4 namespace/schema variant;
- multiple group references;
- inactive group/membership records;
- parent group references;
- NPTG parent and district references;
- cyclic locality parents;
- malformed root input.

The live source evidence used for the foundation was read-only official DfT evidence for ATCO areas 490 and 210 and NPTG. It was not used to run a national refresh. Observed controls include East View `490G00006381`, Market Oak Lane `210G9367`, Waltham Cross Bus Station `210G432`, and the complex `210G2249` group. Exact national output size is intentionally not claimed until a controlled full v2 candidate build is authorised; v1 Run #24 is a historical reference only (375,566 prepared stops, 1,371 published files, approximately 87.7 MB payload).

## Compatibility and runtime boundary

The v1 adapter continues to accept `atlas-prepared-bus-data-v1`. It also decodes v2 physical StopPoint and service shards. v2-only `logicalGroupsForStops` and `localitiesForStops` methods are exposed for later runtime work; on v1 they return an explicit empty result with a warning that the sidecars are absent. No assessment path calls these methods in this sprint.

The v2 service builder reuses the v1 physical StopPoint map and BODS service interpretation. It does not alter route discovery, national timetable evidence, calendar semantics, destination presentation, grouping, circular classification, or Word layout. Semantic parity must be rechecked by the controlled candidate build before runtime adoption.

## Compatibility fingerprint

Starting candidate-generation fingerprint:

`093d047c87482aba3d5b90844608046ece18bd673f9228dab504030883af223`

Final branch fingerprint after this foundation:

`fdd63a8be73c24f5aa697cf5ec6ddfacab0c0835f91029a3dc38710620daa0a0`

The changed protected inputs are exactly:

- `tools/atlas-bus-data/build_static_index.py` — adds the opt-in v2 XML/sidecar build path while leaving the v1 default path intact;
- `tools/atlas-bus-data/refresh_bus_data.py` — adds opt-in v2 NaPTAN XML/NPTG acquisition and hashing while leaving the v1 default refresh path intact.

The other protected candidate-generation inputs are unchanged, including `atlas/config/atlas-release.json`. Formal release identity remains `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`.

## Validation performed

- Python builder/parser tests: `8` passed.
- Python refresh/build contract tests: `28` passed.
- Prepared-data adapter tests: `12` passed, including v1 compatibility, v2 physical/service decoding, and v2 sidecar access.
- Full deterministic Alpha.15 suite: passed through the review-environment guard; the clean-worktree rerun is required after the documentation commit so the review server can bind the exact final commit SHA.

The full national candidate has not been regenerated in this sprint. A future controlled build must compare v1/v2 service semantics, shard references, record counts, QA counters, and memory behaviour before any runtime or production use.

## Files in this foundation

- `tools/atlas-bus-data/prepared_data_v2.py` — bounded XML parsing and normalisation;
- `tools/atlas-bus-data/build_static_index.py` — opt-in v2 prepared build path plus unchanged v1 path;
- `tools/atlas-bus-data/refresh_bus_data.py` — opt-in XML source acquisition and hashes;
- `src/atlas/adapters/prepared-bus-data-adapter.mjs` — backward-compatible v1/v2 decoding;
- `tests/fixtures/atlas-bus-data-v2/` — deterministic source-shape fixtures;
- v2 parser tests are embedded in `tools/atlas-bus-data/test_build_static_index.py`, with adapter coverage in `tests/atlas/prepared-bus-data-adapter.test.mjs`.

## Deferred work

The following require separate approval and bounded runtime sprints:

1. core-triggered authoritative StopArea completion;
2. canonical NaPTAN group selection and parent policy;
3. NPTG locality runtime enrichment;
4. grouping/destination presentation and UI changes;
5. a controlled full national v2 candidate build and semantic parity report.

No refresh, publication, Pages deployment, or merge is authorised by this record.
