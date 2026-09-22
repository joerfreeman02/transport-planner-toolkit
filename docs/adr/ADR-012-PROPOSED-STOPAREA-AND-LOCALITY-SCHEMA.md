# ADR-012 (PROPOSED): Prepared StopArea and NPTG locality metadata

Status: **PROPOSED — NOT APPROVED**  
Date: 2026-09-22  
Scope: future BUS-T02B / NPTG-1 implementation planning

## Context

The current `atlas-prepared-bus-data-v1` snapshot preserves physical NaPTAN
StopPoints but loses authoritative StopArea membership because the current CSV
Access Nodes representation does not carry the XML `StopAreaRef` relationship.
TfL nearby StopPoint records can expose `stationNaptan`, but TfL hierarchy
responses are not sufficient by themselves to define a nationwide canonical
group model.

The current prepared stop rows also carry locality names but not the complete
authoritative NPTG locality identifier/hierarchy. StopArea and NPTG are
different concepts and must not acquire coupled runtime semantics.

## Proposed direction

Subject to Technical Director approval, supersede the prepared-data schema with
a versioned metadata envelope that can carry both:

- normalized NaPTAN StopArea membership and group records; and
- NPTG locality identifiers and hierarchy.

The two metadata families must retain independent source provenance, hashes,
validation counts, and runtime consumers. Physical StopPoint identity and
timetable authority remain unchanged.

Use plural, namespaced group references because a StopPoint may have multiple
StopArea memberships. Preserve active/inactive status and fail closed on
unresolved or contradictory references.

## Radius policy proposal for approval

The preferred policy to consider is **core plus related context**:

- retain the accepted T02A core-radius result unchanged;
- expose exact authoritative related members outside the radius as context;
- never allow context members to contribute core timetable/service evidence
  without a separate approved product decision.

Models based on strict exclusion and logical-group expansion remain documented
alternatives. This ADR does not approve any of them.

## Consequences if approved

- the prepared schema and manifest version must increment;
- the candidate-generation compatibility fingerprint changes;
- old Run #24 checkpoints cannot be resumed as compatible candidates;
- a full fresh national acquisition and candidate validation are required;
- State C capacity and rollback gates must measure the larger snapshot;
- no active Bus/TNDS publication changes until the new candidate passes all
  gates and receives separate acceptance.

## Open decisions

1. Technical Director approval of the provider-neutral field names and shard
   layout;
2. final selection of the radius/group policy;
3. whether NPTG-1 is sufficiently specified to share the same metadata-schema
   migration;
4. exact XML/schema-version support and State C acquisition implementation;
5. final UI, map, Word, and planner treatment of related context.

No implementation, refresh, publication, deployment, or merge is authorized by
this proposed ADR.

