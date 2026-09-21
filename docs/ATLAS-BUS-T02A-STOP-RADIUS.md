# ATLAS BUS — BUS-T02A Core Stop-Discovery Radius Contract

Status: implementation complete; awaiting Technical Director manual review.

Manual cycle: `BUS-T02`  
Formal release: `2.0.0-alpha.15`  
Release identity: `ATLAS-2.0.0-alpha.15-20260914`  
Run #24 publication: `35352167115-c670698dbf709a953d15b3927ee677fb502d1b3a`

## Scope and contract

Before BUS-T02A, TfL was used as a candidate-retrieval service with a
provider-side radius. The adapter calculated ATLAS distance but could retain a
valid provider-returned StopPoint when that calculated distance was outside the
requested radius. Prepared and direct NaPTAN discovery already filtered on the
ATLAS-calculated distance.

The adopted core stop-selection contract is now common to TfL and NaPTAN:

> Calculate WGS84 haversine straight-line distance from the confirmed
> assessment point to each authoritative StopPoint coordinate. Retain the
> StopPoint only when the rounded ATLAS distance in metres is less than or equal
> to the requested discovery radius.

The comparison is inclusive: `distanceMetres <= requestedRadiusMetres`.
Distances are rounded to the nearest metre before the comparison. Provider
radius filtering is only candidate retrieval; a provider response does not by
itself establish core-radius membership. Routed walking/cycling distance is a
separate downstream accessibility measurement and is not substituted for core
stop selection.

No StopArea expansion, opposite-stop inference, or logical stop-pair repair is
part of BUS-T02A.

## Code correction

`src/atlas/adapters/tfl-bus-stop-adapter.mjs` now applies the local radius
contract before inserting a StopPoint into the retained map. It also retains
deterministic duplicate handling: the nearer duplicate wins, with a lexical
serialized-record tie-breaker. A valid response whose every StopPoint is
outside the radius is a successful zero-stop result, not a source failure.
Malformed records and malformed-only responses retain their existing failure
semantics.

TfL provenance now reports `requestedRadiusMetres`,
`providerReturnedCount`, `retainedWithinRadiusCount`,
`excludedOutsideRadiusCount`, the WGS84 methodology, and the explicit inclusive
radius contract. The review control in
`tools/atlas-review/bus-t02a-radius-controls.mjs` records the provider-returned
and retained populations separately.

There are no route, site, locality, StopPoint-ID, or named-place conditions in
the production correction. A source search of the changed adapter found no
Normanshire, Waltham, Pipers, East View, or route-number special case.

## Deterministic evidence

The TfL tests cover 650 m retained, exactly 700 m retained, beyond-700 m
excluded, mixed responses, response-order independence, deterministic duplicate
selection, malformed handling, and a valid all-outside successful zero with
accurate provenance. The NaPTAN tests retain the existing behaviour and now
explicitly exercise an outside-radius national record. Existing discovery tests
remain unchanged in behaviour.

## Production-fidelity controls

The controls used Run #24 configuration and the live authoritative source. The
control tool does not write files or production data.

### Normanshire Drive — exact actual control

Address: 99 Normanshire Drive, Chingford Mount, Highams Park, London Borough
of Waltham Forest, Greater London, E4 9HB  
Confirmed point: `51.6165957, -0.0117893`  
Mode: Full Assessment  
Radius: 700 m  
Code under test: `d235df36a95889e70f67df3dcb3c9de2ddc299d2`

Before BUS-T02A, the live TfL response returned 20 StopPoints and all 20 were
retained. East View WT (`490006381N`) was calculated at approximately 765 m
and contributed routes 212 and W16. The resulting route population was:

`97, 158, 212, 215, 357, 385, 397, 444, 657, N26, W16`

After BUS-T02A, TfL again returned 20 StopPoints. ATLAS retained 19 and
excluded exactly one: East View WT (`490006381N`), calculated at 765 m. East
View WE was not returned and was not added by ATLAS. The retained route
population is:

`97, 158, 215, 357, 385, 397, 444, 657, N26, W16`

The consequences are limited to the corrected core stop set: route 212 is no
longer present because no legitimate selected in-radius StopPoint serves it;
it was not preserved artificially. Routes 215, 385, and 397 each retain both
planner directions, with no unresolved timetable identities in the control.
Route 444 retains both approved directions exactly:

- Towards Chingford Station
- Towards Turnpike Lane Bus Station

W16 remains present with three planner rows; its selected-stop evidence is
updated only because WT is no longer in the core population. The control
reported 87 timetable requests after correction versus 89 before, consistent
with removing the out-of-radius stop. The only new selection warning is the
explicit one-stop radius-exclusion warning.

### Waltham Cross

Control point: `51.6857829, -0.0330001`  
Mode: Full Assessment  
Radius: 700 m

Before and after, the prepared/direct national control returned 16 stops and
retained all 16. No provider-returned stop was excluded by the new TfL local
check because the point is outside Greater London and the selected national
path was already locally filtering. The route population and planner rows are
unchanged. The sparse Stop H evidence remains present for the same TfL
cross-boundary route patterns (including 217, 279, 317, 327, 491, and N279),
and the control continues to report the same 16 unresolved timetable request
identities. No timetable parser change was made.

### Pipers Lane national control

Control point: `51.852700, -0.454343`  
Mode: Full Assessment  
Radius: 700 m

Before and after, NaPTAN returned and retained 11 stops, with no radius
population change. The route population remains `230, 231`; the same three
planner rows remain (one route-230 row and two route-231 rows). This control
does not alter its existing destination or grouping behaviour.

## StopArea and logical-stop evidence

BUS-T02A deliberately selects CORE STOP records only. It does not expand a
logical StopArea and does not infer an opposite stop from names, bearings,
route numbers, stop letters, or proximity.

Read-only source-model discovery found:

- The current official NaPTAN API exposes bulk/ATCO-area Access Nodes and NPTG
  resources. The CSV Access Nodes response contains StopPoint records but no
  StopArea membership field.
- The official NaPTAN XML Access Nodes response contains StopArea references;
  for example both East View N and S carry the logical StopArea reference
  `490G00006381`. NaPTAN’s `StopsInStopArea` schema model provides the
  StopArea-to-ATCOCode membership that a future implementation can use.
- The Run #24 prepared Bus snapshot currently exposes stop fields such as
  `id`, `name`, coordinates, area and routes, but not StopArea/StopsInStopArea
  membership. It therefore cannot support a safe nationwide logical-group
  expansion in this sprint.
- TfL supports StopPoint hierarchy/parent relationships, but the current
  TfL stop query intentionally uses `useStopPointHierarchy=false`; BUS-T02A
  does not reinterpret that response as a logical-group expansion.

BUS-T02B should be a separate approved data/model task. It should preserve
authoritative StopArea identity and StopsInStopArea membership in the prepared
snapshot, define a provider-neutral logical-group model, specify how core
radius selection interacts with group membership at the boundary, and define
deterministic deduplication and provenance. It must not add an out-of-radius
StopPoint merely to restore a service direction.

## Compatibility and exclusions

The protected candidate-generation files and formal release metadata were not
changed. The base candidate-generation compatibility fingerprint is:

`093d047c87482aba3d5b90844608046ece18bd673f9228dab504030883af223`

The branch fingerprint remains identical. No refresh, reference-data
publication, Bus/TNDS publication, Pages deployment, version increment, or
merge was performed.

The remaining limitation is intentional: logical StopArea expansion and
inferred stop pairing remain outside BUS-T02A and require BUS-T02B evidence and
approval. Provider data, timetable availability, and date-specific source
semantics can still produce explicit partial or unresolved evidence; the
radius correction does not turn such evidence into fabricated service.

## Review recommendation

The implementation satisfies the BUS-T02A acceptance scope and is:

**READY FOR TECHNICAL DIRECTOR MANUAL REVIEW**

