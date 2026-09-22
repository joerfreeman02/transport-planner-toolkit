# ATLAS BUS-DATA-V2-1A — Prepared Data V2 Foundation Forensic Closeout

Status: PR #52 update; documentation and bounded deterministic controls only. This is not a runtime StopArea completion, national refresh, publication, Pages deployment, or merge.

## Scope and safety boundary

The v2 foundation adds a versioned prepared-data contract, streaming authoritative NaPTAN/NPTG XML parsing, deterministic logical-group and locality sidecars, v2 adapter decoding, candidate validation, and bounded QA metadata. Existing v1 remains the default prepared schema for scheduled and production refreshes.

V2 is diagnostic-only in the workflow. A v2 request on `main` is permitted only with `measure_only=true`; it cannot enter the publication path. No full national v2 candidate was built for this sprint.

The approved architecture remains ADR-012. Runtime StopArea completion, recursive group traversal, NPTG runtime enrichment, grouping presentation, and national publication remain separate, bounded work.

## Source and parser contract

The v2 path accepts official NaPTAN XML (schema 2.1/2.4 and namespace variants), official NPTG XML, and the existing BODS regional GTFS path. XML is parsed with `xml.etree.ElementTree.iterparse`; completed records are cleared and raw source files are never emitted into public data.

Coordinates prefer WGS84. When WGS84 is absent, v2 uses the established NaPTAN British National Grid conversion and records the conversion method. Invalid or incomplete coordinates remain explicitly invalid and are not inferred. StopPoint `ModificationDateTime` is retained from element text or XML attribute representation.

Source provenance retains source creation metadata and content hashes. A parser timestamp is not substituted for source creation time: `checkedAt` belongs to refresh status, not to source metadata.

## Normalised records and QA

Physical StopPoint records retain v1 semantic fields and add plural `logicalGroupRefs`, `nptgLocalityCode`, `localityResolution`, status, modification time, coordinate method, and provenance. There is no scalar invented `stopAreaId`.

Logical-group sidecars use `atlas-prepared-logical-groups-v1`. Active member IDs must resolve to physical StopPoints; missing members are exposed in QA and an active group with unresolved members is rejected by candidate validation. Membership QA counts StopPoint membership across active groups, including multiple active memberships.

Locality sidecars use `atlas-prepared-nptg-localities-v1`, preserve direct `parentLocality` relationships, and preserve `districtId` with its `districtName`. Parent cycles and missing references are reported, not silently flattened. V2 hydrates the legacy `locality` and `parentLocality` fields before the existing v1 service-building path runs; it does not perform runtime NPTG acquisition.

The v2 manifest reports active StopPoints, logical groups, localities, districts, stop/service/group/locality shard counts, and parser QA counters.

## CLI and workflow contract

The builder CLI has two explicit contracts:

- v1 requires legacy `--naptan` CSV input;
- v2 requires `--naptan-xml` and `--nptg-xml` and rejects the legacy `--naptan` argument.

The workflow exposes `prepared_schema` with `v1` as the default and `v2` as an opt-in diagnostic choice. Scheduled and production paths remain v1. Publication and checkpoint-save gates remain unavailable to a v2 diagnostic run.

## Controlled v1/v2 parity evidence

The deterministic fixture builds v1 and v2 from the same GTFS, snapshot date, and generated timestamp. Physical semantic fields (`id`, name, indicator, direction, coordinates, locality and parent locality), service records, schedules, and principal-location semantics compare equal. BNG and WGS84 representations produce equal coordinates. Existing Cambridge/v1 regression coverage remains in the deterministic suite.

The v2 adapter continues to decode v1 and v2 physical/service shards. V2 sidecars are exposed for later runtime work; no current assessment path consumes them for grouping or destination presentation.

## Candidate validation and checkpoint safety

Candidate validation accepts both v1 and v2 bus manifests. For v2 it validates stop shard fields, physical StopPoint uniqueness, service-to-stop references, logical-group and locality sidecar schemas and identities, active member resolution, explicit unresolved-reference classification, district-name preservation, and absence of raw XML/CSV/ZIP leakage.

The candidate-generation compatibility fingerprint includes:

- `tools/atlas-bus-data/build_static_index.py`;
- `tools/atlas-bus-data/prepared_data_v2.py`;
- `tools/atlas-bus-data/refresh_bus_data.py`;
- the previously protected TNDS/domain inputs.

Current branch fingerprint:

`37b9c781b18e05fee6948388be3e023a076c66f1b1108a8f6a2a603305fdf60b`

The Run #24 fingerprint was:

`093d047c87482aba3d5b90844608046ece18bd673f9228dab504030883af223`

The deterministic checkpoint test proves that the v2 parser is fingerprint-covered, changing it changes the aggregate fingerprint, and a checkpoint carrying the Run #24 fingerprint fails closed. Therefore the old Run #24 checkpoint cannot be reused as a v2 candidate. No checkpoint was restored, created, or used by this sprint.

## Development/test identity

Formal release metadata remains unchanged:

`2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`

The exact engineering identity is the clean Git commit SHA recorded in the final PR handover and test output. A dirty worktree must not be presented as tested. The review server currently injects the historical label `BUS-TFL-COMPLETE · <short SHA>`; that label is not a valid semantic identity for this foundation and must be corrected before BUS-T03. No release metadata or review-server redesign is included here.

## Validation performed

Targeted Python controls cover the v2 CLI contract, WGS84/BNG/invalid coordinate handling, modification-time representations, locality/parent/district preservation, multiple active membership QA, source timestamp provenance, v1/v2 fixture parity, v2 sidecar validation, raw-source rejection, and duplicate sidecar identities.

The full deterministic Alpha.15 suite is required on the final clean branch HEAD after the documentation-only closeout commit. No full national candidate, manual planner assessment, production workflow, publication, Pages deployment, or merge is part of this sprint.

## Files and deferred work

Key implementation files are `tools/atlas-bus-data/prepared_data_v2.py`, `tools/atlas-bus-data/build_static_index.py`, `tools/atlas-bus-data/refresh_bus_data.py`, `tools/atlas-bus-data/validate_candidate.py`, and `src/atlas/adapters/prepared-bus-data-adapter.mjs`. Deterministic source fixtures and Python/JS tests are included in the branch.

Deferred work requires separate approval: controlled national-scale v1/v2 semantic parity, runtime StopArea completion, canonical group selection policy, NPTG runtime enrichment, presentation changes, and correction of the review-server development label.

No refresh, publication, Pages deployment, or merge is authorised by this record.
