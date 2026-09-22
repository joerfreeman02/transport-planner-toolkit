# ADR-012: Prepared StopArea and NPTG locality metadata

Status: **APPROVED**
Date: 2026-09-22  
Scope: future BUS-DATA-V2 FOUNDATION, BUS-T02B, and NPTG-1 implementation planning

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

## Decision

Supersede the prepared-data schema with one versioned metadata migration,
`atlas-prepared-bus-data-v2`, that can carry both:

- normalized NaPTAN StopArea membership and group records; and
- NPTG locality identifiers and hierarchy.

The two metadata families retain independent source provenance, hashes,
validation counts, and runtime consumers. Physical StopPoint identity and
timetable authority remain unchanged. StopArea and NPTG runtime semantics
remain separate implementation sprints.

Use plural, namespaced group references because a StopPoint may have multiple
StopArea memberships. Preserve active/inactive status and fail closed on
unresolved or contradictory references.

## Approved StopArea completion policy

The approved policy is **CORE-TRIGGERED AUTHORITATIVE STOPAREA COMPLETION**:

1. A physical StopPoint is CORE when rounded ATLAS-calculated WGS84
   straight-line distance is less than or equal to the requested radius.
2. Provider-side radius behaviour remains candidate retrieval only.
3. Every active StopArea directly referenced by a CORE StopPoint qualifies.
4. Every active direct physical member of each qualified StopArea joins the
   logical-stop assessment population.
5. A completed member retains actual distance, physical identity, provenance,
   and explicit completion status, such as
   `GROUP_COMPLETED_OUTSIDE_CORE_RADIUS`.
6. A completed member may contribute legitimate route, timetable, direction,
   frequency, operating-period, and planner-summary evidence when independently
   supported by authoritative timetable data.

No recursive expansion is permitted. A group-completed member cannot qualify a
new StopArea. The algorithm is exactly:

```text
CORE SET
→ directly referenced active StopAreas
→ union of active direct members
→ STOP
```

If a CORE StopPoint has multiple active direct StopArea references, every such
group qualifies. Physical StopPoints and timetable identities remain distinct.

The earlier discovery Model 2 recommendation—core plus related context only—
is superseded and is not approved.

## Structural authority and representation

NaPTAN `StopArea`, `StopAreaRef`, and `StopsInArea` are the canonical national
logical-stop authority. TfL `stationNaptan` may corroborate London membership
only where exact identifiers reconcile. Names, routes, proximity, bearing,
direction, stop letters, coordinates, and planner intuition are not membership
rules.

The model uses plural provider-neutral references equivalent in semantics to
`logicalGroupRefs[]` plus normalized logical-group records. A scalar
`stopAreaId` is rejected because source evidence demonstrates multiple valid
StopArea membership.

Large and complex authoritative groups must not be arbitrarily truncated. BUS-
DATA-V2 and its runtime implementation must QA member count, member-to-member
span, maximum completion distance, inactive/missing members, malformed groups,
and unusually large/outlier geometry. No arbitrary group-size or distance cap is
approved by this ADR.

## Shared v2 metadata migration and NPTG boundary

The v2 metadata envelope carries both:

- authoritative StopArea/group structure; and
- authoritative NPTG locality identity/hierarchy, including evidenced locality
  code/name, parent and higher hierarchy, district identifiers/names, and source
  provenance.

This is one shared **data-schema** migration to avoid two unnecessary schema
migrations, compatibility fingerprint changes, full national acquisitions, and
State C validation cycles. It does not combine runtime functionality:
BUS-T02B remains the StopArea runtime sprint and NPTG-1 remains locality
foundation only. NPTG-1 must not independently change service inclusion,
operator, frequency, timetable semantics, BUS-GROUP, or circular handling.

## Consequences

- the prepared schema and manifest version must increment;
- the candidate-generation compatibility fingerprint changes;
- the old Run #24 checkpoint is incompatible with v2 candidate generation and
  cannot be resumed as a v2 candidate;
- a full fresh national acquisition and candidate validation are required;
- State C capacity and rollback gates must measure the larger snapshot;
- Run #24 remains the rollback baseline until a v2 candidate is separately
  accepted;
- no active Bus/TNDS publication changes until the new candidate passes all
  gates and receives separate acceptance.

## Deferred implementation decisions

1. final provider-neutral field names and shard layout within v2;
2. exact XML/schema-version support and State C acquisition implementation;
3. final UI, map, Word, and planner wording, which remains BUS-POLISH scope;
4. implementation sequencing for BUS-T02B and NPTG-1.

This ADR approves architecture only. It does not authorize implementation,
refresh, publication, deployment, or merge of the future v2 runtime work.
