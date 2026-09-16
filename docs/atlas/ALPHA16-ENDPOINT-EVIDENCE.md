# ATLAS Bus Alpha.16 — Public Endpoint Evidence

Status: Alpha.16 endpoint-safety and route-identity contract. NPTG is not implemented or acquired.

## Safety rule

An unresolved endpoint is preferable to a confidently wrong public corridor. A stop locality, `principalLocations` value, assessment-area node, generic facility label, record activity, or locally observed pattern boundary is context—not proof of a public terminus. Presentation ranking consumes already-resolved endpoints and must never feed evidence back into endpoint inference.

## Evidence hierarchy

The resolver compares route-family endpoint pairs by evidence quality, freshness, and route identity. Duplicate feed aliases are not independent corroboration and record count is never a tiebreaker:

1. **Authoritative route-section identity** (including the current TfL route section matched to the timetable identity).
2. **Explicit public origin/destination** carried by a service record.
3. **Terminals of a complete ordered public pattern**, including independently reciprocal full-pattern evidence.
4. **A full route description** that identifies both public termini.
5. **Short-working terminals**, which may describe a variant but cannot displace a stronger principal pair.

Paired public direction/headsign evidence is a lower-confidence fallback only when reciprocal current evidence identifies the pair. Generic infrastructure and arbitrary localities are not endpoint evidence. A current authoritative route-section identity outranks conflicting national endpoint variants; source validity and retrieval metadata remain available for review. If the authoritative sections themselves are ambiguous, competing current national pairs remain unresolved.

## Route identity is independent of stop timetables

For TfL routes, the live `/Line/{ids}/Route` result is route-identity evidence. The stop-specific `/Line/{id}/Timetable/{StopPoint}` result is schedule evidence. Failure to parse a selected-stop TfL timetable does not erase an independently current route section. A matching national BODS/TNDS record may continue to provide the selected-stop schedule, departures, frequency, and calendar while the TfL section independently supplies the public route identity.

The national schedule remains labelled with its actual provider (for example, `BODS fallback after TfL unresolved`). It is never relabelled as a successful TfL timetable. The unsuccessful TfL route/StopPoint request remains in structured diagnostics; when current route identity and a current matching fallback schedule are both available, it is a timetable-source diagnostic rather than an endpoint-identity failure. Route metadata never establishes a departure, frequency, operating period, calendar, or selected-stop service presence.

Metadata is associated only when current valid TfL sections deterministically identify one oriented section for the matched national route/stop service. The association uses a unique metadata direction, headsign, or exact national origin that orients one section; it never chooses an old destination from a national variant. Expired/future sections are excluded. If more than one current section remains possible, no TfL identity is attached and the endpoint stays unresolved.

## Complete pattern versus observed fragment

`routePatternCompleteness` distinguishes `complete`/`full` patterns from `partial` patterns. Only a complete pattern may contribute pattern-terminal or closed-loop evidence. A fragment around the assessment site can still support service inclusion, stop coverage and timetable calculations, but its local first/last stop cannot define the public corridor. Selected-stop locality is never substituted for a generic `Bus Station` endpoint.

Where only partial patterns and non-terminal local evidence exist, the row remains present with restrained unresolved endpoint wording. Endpoint uncertainty does not remove a scheduled service; Route 310 is an explicit acceptance sentinel for this invariant.

## Freshness gate

Endpoint evidence from a prepared national snapshot is usable for a public endpoint only while its own source freshness is current. A stale or undated national endpoint cannot inherit live TfL freshness from another field in the same record. Fresh TfL timetable or national schedule evidence remains usable when only one supplemented endpoint field is stale; that stale field is excluded from endpoint selection while the schedule and detailed evidence remain. Freshness is assessed per endpoint, not by the record-level `timetableSource` label. A refresh is a data-pipeline follow-up; this Alpha.16 resolver change does not alter acquisition or updater scheduling.

## Route families and variants

Evidence is ranked before activity, frequency, support counts, or pattern length. A shorter pattern that is a strict subsequence of a longer related complete pattern is treated as short-working evidence. It remains retained as a variant, while the stronger full public pair stays principal. Operator families are evaluated separately so one operator's endpoint evidence cannot resolve another operator's service.

Opposite open directions are oriented to the same two public termini. A circular presentation requires positive closed ordered-pattern evidence; equal labels such as `Bus Station` at both ends are insufficient. Mixed open/circular family evidence does not silently convert an open service into a loop.

## Planner-row provenance

Each planner row carries `publicEndpointEvidence` for its origin and destination. A published endpoint must have a provider, acceptable evidence class, and freshness status that permits publication; otherwise its value is null and its status is unresolved. Each endpoint entry records:

- selected `value` and `resolved`/`unresolved` status;
- provider, source/API endpoint, retrieval or preparation time, freshness state, evidence class, route/section identifier, and source kind (`tfl-route-metadata`, `tfl-timetable`, `BODS`, or `TNDS`);
- source record IDs/providers;
- whether complete-pattern, reciprocal, and locality support contributed;
- whether the result was explicit and a compact confidence/safety label.

Unresolved endpoints retain the relevant service source IDs/providers without claiming endpoint support. Mixed-source summaries preserve the provenance of each field independently, so an endpoint supplied by BODS remains BODS-provenanced even when the timetable record is TfL-primary. TfL route-section validity, retrieval time, cache status, and the stop-specific timetable retrieval metadata remain distinct for audit.

## Future locality-enrichment seam

The intended future flow is:

`existing endpoint evidence → optional shared locality evidence → public endpoint resolver`

An Alpha.17 NPTG integration may improve place identity, public naming, parent-locality context, and generic-terminus interpretation. It must not control service inclusion, frequency, calendars, operator, route family, ordered pattern, circularity, or source provenance. No NPTG acquisition, data, dependency, or resolver is part of this Alpha.16 change.
