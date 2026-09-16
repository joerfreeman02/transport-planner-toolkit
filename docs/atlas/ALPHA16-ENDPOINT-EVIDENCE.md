# ATLAS Bus Alpha.16 — Public Endpoint Evidence

Status: Alpha.16 endpoint-safety contract. This is a resolver change only; NPTG is not implemented or acquired.

## Safety rule

An unresolved endpoint is preferable to a confidently wrong public corridor. A stop locality, `principalLocations` value, assessment-area node, generic facility label, record activity, or locally observed pattern boundary is context—not proof of a public terminus. Presentation ranking consumes already-resolved endpoints and must never feed evidence back into endpoint inference.

## Evidence hierarchy

The resolver compares route-family endpoint pairs by evidence quality before support counts or pattern extent:

1. **Authoritative route-section identity** (including the current TfL route section matched to the timetable identity).
2. **Explicit public origin/destination** carried by a service record.
3. **Terminals of a complete ordered public pattern**, including independently reciprocal full-pattern evidence.
4. **A full route description** that identifies both public termini.
5. **Short-working terminals**, which may describe a variant but cannot displace a stronger principal pair.

Paired public direction/headsign evidence is a lower-confidence fallback. Generic infrastructure and arbitrary localities are not endpoint evidence. A newer, equally authoritative route-section identity outranks an older conflicting pair; the source validity and retrieval metadata remain available for review. A contradiction that cannot be reconciled safely leaves the affected direction unresolved.

## Complete pattern versus observed fragment

`routePatternCompleteness` distinguishes `complete`/`full` patterns from `partial` patterns. Only a complete pattern may contribute pattern-terminal or closed-loop evidence. A fragment around the assessment site can still support service inclusion, stop coverage and timetable calculations, but its local first/last stop cannot define the public corridor. Selected-stop locality is never substituted for a generic `Bus Station` endpoint.

Where only partial patterns and non-terminal local evidence exist, the row remains present with restrained unresolved endpoint wording. Endpoint uncertainty does not remove a scheduled service; Route 310 is an explicit acceptance sentinel for this invariant.

## Route families and variants

Evidence is ranked before activity, frequency, support counts, or pattern length. A shorter pattern that is a strict subsequence of a longer related complete pattern is treated as short-working evidence. It remains retained as a variant, while the stronger full public pair stays principal. Operator families are evaluated separately so one operator's endpoint evidence cannot resolve another operator's service.

Opposite open directions are oriented to the same two public termini. A circular presentation requires positive closed ordered-pattern evidence; equal labels such as `Bus Station` at both ends are insufficient. Mixed open/circular family evidence does not silently convert an open service into a loop.

## Planner-row provenance

Each planner row carries `publicEndpointEvidence` for its origin and destination. Each endpoint entry records:

- selected `value` and `resolved`/`unresolved` status;
- `evidenceClass` and source record IDs/providers;
- whether complete-pattern, reciprocal, and locality support contributed;
- whether the result was explicit and a compact confidence/safety label.

Unresolved endpoints retain the relevant service source IDs/providers without claiming endpoint support. TfL service records also retain route-section validity, retrieval time, cache status, and the corresponding timetable retrieval metadata so freshness can be distinguished from inference quality.

## Future locality-enrichment seam

The intended future flow is:

`existing endpoint evidence → optional shared locality evidence → public endpoint resolver`

An Alpha.17 NPTG integration may improve place identity, public naming, parent-locality context, and generic-terminus interpretation. It must not control service inclusion, frequency, calendars, operator, route family, ordered pattern, circularity, or source provenance. No NPTG acquisition, data, dependency, or resolver is part of this Alpha.16 change.
