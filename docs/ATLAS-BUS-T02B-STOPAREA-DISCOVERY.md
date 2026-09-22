# ATLAS BUS — BUS-T02B-0 StopArea Architecture Discovery

Status: **Discovery complete; architecture decision approved; no production behaviour implemented**
Base: `a0c7972a8fa908f80b18be242e4d76aefad42d96`  
Branch: `codex/atlas-bus-t02b-stoparea-discovery`  
Formal release: `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`  
Live reference-data publication: Run #24, `35352167115-c670698dbf709a953d15b3927ee677fb502d1b3a`

This record is an evidence and architecture sprint. It does not implement
StopArea behaviour, alter the core radius contract, modify NPTG behaviour,
refresh national data, publish reference data, deploy Pages, or merge to
`main`.

## 1. Executive findings

1. NaPTAN is the authoritative structural source for national physical
   StopPoints and their StopArea membership. The official XML Access Nodes
   response contains `StopAreaRef` on each StopPoint and the corresponding
   StopArea records. The official schema guide separately defines
   `StopAreas.csv` and `StopsInArea.csv` with StopArea-to-ATCOCode membership.
2. The current official CSV Access Nodes response used by the national builder
   has no StopArea or group-membership column. The current prepared snapshot
   therefore cannot preserve the relationship.
3. The current TfL nearby StopPoint response exposes `stationNaptan`,
   `lineGroup`, `lineModeGroups`, and `children`. For the East View control,
   `stationNaptan` is the same `490G00006381` identifier as NaPTAN. However,
   `useStopPointHierarchy=true` and `false` returned the same 32 nearby
   records, and the two East View child records had empty `children` arrays.
   TfL is therefore valuable corroborating evidence, but NaPTAN remains the
   canonical structural authority for a provider-neutral national model.
4. A StopPoint is not guaranteed to have exactly one StopArea. In the current
   ATCO 210 XML, six StopPoints have two active StopArea references. The
   proposed ATLAS field must therefore be plural and preserve provenance.
5. T02A's core rule remains valid and must not be weakened: a StopPoint is a
   core selected stop only when its rounded ATLAS-calculated WGS84 distance is
   less than or equal to the requested radius. Group membership must not
   silently promote an out-of-radius StopPoint into core service evidence.
6. The earlier discovery recommendation of **Model 2 — core plus related
   context only** was considered but is superseded. The Technical Director has
   approved **core-triggered authoritative StopArea completion**: each active
   StopArea directly referenced by a genuinely in-radius CORE StopPoint
   qualifies, and every active direct physical member is included in the
   logical-stop assessment while retaining its actual distance and provenance.
7. StopArea and NPTG locality identifiers are structurally independent at
   runtime but are both source-identity metadata. If NPTG-1 is likely to follow
   before the next national refresh, one carefully bounded prepared-data schema
   migration can carry both while keeping their runtime semantics separate.

## 2. Evidence sources and acquisition

The authoritative DfT material states that NaPTAN data is available as CSV or
XML and can be downloaded nationally or by local authority/ATCO area. The
official API used for this discovery is:

- `https://naptan.api.dft.gov.uk/v1/access-nodes?atcoAreaCodes=490&dataFormat=xml`
- `https://naptan.api.dft.gov.uk/v1/access-nodes?atcoAreaCodes=210&dataFormat=xml`
- `https://naptan.api.dft.gov.uk/v1/access-nodes?atcoAreaCodes=490&dataFormat=csv`
- `https://naptan.api.dft.gov.uk/v1/nptg`

The source files were acquired read-only on 2026-09-22 into the operating
system temporary directory, not into the repository or any publication
repository.

Observed source metadata:

| Source | File metadata | Observed scope |
|---|---|---|
| ATCO 490 XML | `NaPTAN490.xml`, schema 2.1, source creation `2026-09-15T16:46:50.462272+01:00` | 21,288 StopPoints; 11,582 StopAreas |
| ATCO 210 XML | `Naptan210.xml`, schema 2.4, source creation `2026-08-25T00:00:00` | 6,854 StopPoints; 1,822 StopAreas |
| NPTG XML | schema 2.1, modification `2026-01-08T10:00:00`, revision 4348 | locality and district hierarchy |
| ATCO 490 CSV | current API response | StopPoint fields only; no `StopArea`, `Group`, or membership column |

The DfT API documentation is at
`https://naptan.api.dft.gov.uk/swagger/index.html`. The DfT schema and data
guidance are linked in the references at the end of this record.

## 3. Current ATLAS architecture audit

### 3.1 TfL StopPoint representation

`src/atlas/adapters/tfl-bus-stop-adapter.mjs` requests TfL nearby StopPoints
with `useStopPointHierarchy=false`. It calculates the ATLAS WGS84 haversine
distance, applies the accepted radius filter, deduplicates by StopPoint ID,
and returns a compact record containing:

```text
id, naptanCode, name, indicator, direction, latitude, longitude,
stopType, sourceId, timetableAuthority, routes, routeAuthorities,
distanceMetres
```

The adapter intentionally does not retain TfL `stationNaptan`, `lineGroup`,
`lineModeGroups`, or `children`.

### 3.2 Prepared and direct NaPTAN representation

`tools/atlas-bus-data/build_static_index.py` reads the official CSV and retains:

```text
id, naptanCode, name, indicator, direction, latitude, longitude,
stopType, busStopType, locality, parentLocality, areaCode, modifiedAt,
coordinateMethod, routes
```

The prepared manifest is currently `atlas-prepared-bus-data-v1`, with manifest
version `1.0.0`. Run #24 contains 375,566 prepared NaPTAN stops. The published
Bus tree measured 87,740,538 bytes across 1,371 files.

`src/atlas/adapters/naptan-bus-stop-adapter.mjs` parses the same StopPoint
CSV contract for direct area downloads. It also does not retain StopArea
membership.

### 3.3 Discovery merge and downstream identity

`src/atlas/application/bus-stop-discovery.mjs` merges cross-boundary TfL and
NaPTAN records by exact physical StopPoint ID. It preserves source and
timetable authority separately and merges route authorities. It does not
merge by name, proximity, bearing, route, stop letter, or logical group.

Downstream timetable and planner consumers remain StopPoint-scoped:

- service schedules are keyed by physical StopPoint IDs;
- selected service evidence checks `service.stopIds` against selected stop IDs;
- route authority is separate from timetable authority;
- the browser map, assessment register, Word evidence, and planner summaries
  all consume physical stop identity or service stop IDs.

The exact current loss point is therefore the source boundary and prepared
schema: the XML-only `StopAreaRef` relationship is discarded when the
CSV-derived stop record is built. TfL's `stationNaptan` is discarded in the
runtime adapter. No later component can reconstruct authoritative membership.

## 4. Authoritative NaPTAN findings

The official DfT data-manager guide defines:

- `StopAreaCode` as the StopArea primary key;
- `Name` and `StopAreaType` on StopArea;
- `StopAreaCode` plus `AtcoCode` as the composite membership in
  `StopsInArea.csv`;
- `NptgLocalityCode` on StopPoint, with locality names and parent locality
  information derived through NPTG.

The XML representation exposes the same relationship through `StopAreaRef`
inside a StopPoint. A StopArea may also contain a `ParentAreaRef`, and the XML
contains status/change attributes such as `Status`, `Modification`, creation,
modification, and revision values.

### 4.1 Membership cardinality and status

The observed controls establish that membership is not safely modelled as one
nullable scalar:

- ATCO 490: 21,281 StopArea references across 21,288 StopPoints; zero
  StopPoints had more than one reference in this extract; seven had none.
- ATCO 210: 5,301 StopArea references across 6,854 StopPoints; six StopPoints
  had two references; 1,559 had none.
- ATCO 490 contained 11,581 active and one inactive StopArea. Four inactive
  membership references were observed, each marked `Status=inactive` and
  `Modification=delete`.
- ATCO 210 contained 1,477 active and 345 inactive StopAreas. The extract had
  no inactive membership references.

Observed multiple-membership examples in ATCO 210 include:

```text
210021109155  Willian Road             210G11368,210G1828
210021401380  Mark Road                210G2628,210G2631
210021503400  Glevum Close             210G11314,210G2284
210021510050  Lyndon Mead              210G2028,210G2157
210021401314  Tewin Road               210G9481,210G9482
210021503367  Recreation Ground Path    210G11283,210G11337
```

The implementation must preserve active/inactive semantics and must fail safe
when a membership points to a missing, inactive, malformed, or contradictory
StopArea record.

### 4.2 StopArea types

The observed XML includes `GPBS` paired on-street bus, `GBCS` bus/coach station,
`GCLS` interchange/complex group, plus rail, ferry, and tram/metro types. The
future Bus preparation must retain the source type rather than treating every
group as a simple opposite-stop pair.

### 4.3 Bulk format and refresh method

CSV is sufficient for current physical-stop preparation, route joins, and
coordinates, but the current Access Nodes CSV does not expose StopArea
membership. XML or an explicitly supported official membership export is
required for T02B. The preferred State C acquisition method is:

1. download the authoritative national NaPTAN XML through the DfT API;
2. validate XML schema/encoding and source metadata;
3. parse StopPoints, StopAreas, and StopAreaRefs/StopsInArea into a normalized
   intermediate model;
4. join NPTG locality identifiers separately;
5. emit deterministic prepared StopPoint and StopArea records;
6. validate all references, status rules, ordering, and counts before candidate
   checkpoint creation.

The builder should not mix XML and CSV rows opportunistically. A source-format
change must be explicit in the manifest and source hash.

## 5. TfL hierarchy findings

A live anonymous TfL request was made for the East View point using the same
nearby StopPoint family as ATLAS:

```text
https://api.tfl.gov.uk/StopPoint?stopTypes=NaptanPublicBusCoachTram
  &radius=1000&useStopPointHierarchy=true&modes=bus&categories=none
  &returnLines=true&lat=51.61298&lon=-0.0021
```

The equivalent request with `useStopPointHierarchy=false` was also made.
Both returned 32 records. For `490006381N` and `490006381S` both responses
contained:

```text
stationNaptan: 490G00006381
placeType: StopPoint
children: []
lineGroup.stationAtcoCode: 490G00006381
lines: 212, W16
```

This demonstrates a useful TfL parent/group identifier on each child record,
but not a complete child expansion in this nearby response. The direct
identifier lookup form was not a usable anonymous endpoint in this control
(HTTP 404), so no stronger claim is made about universal TfL hierarchy lookup.

The architecture conclusion is:

- NaPTAN `StopAreaCode` remains the canonical national structural identity.
- TfL `stationNaptan` can corroborate or enrich London records when the exact
  shared identifier is present.
- TfL hierarchy fields must not be used to invent a group when the response is
  incomplete or when identifiers do not reconcile exactly.
- TfL and NaPTAN membership should be retained as provenance, not silently
  collapsed into a timetable authority or route authority.

## 6. Proposed provider-neutral ATLAS model

The smallest safe model is normalized rather than repeating all group metadata
on every StopPoint. A prepared snapshot should contain a StopPoint reference
and a separate logical-group collection.

### 6.1 StopPoint additions

```json
{
  "id": "490006381N",
  "logicalGroupRefs": [
    {
      "source": "NaPTAN",
      "id": "490G00006381",
      "status": "active"
    }
  ]
}
```

`logicalGroupRefs` is an ordered array, not `stopAreaId`, because current
national evidence includes StopPoints with multiple StopArea references.
Existing physical identity, timetable authority, route authority, coordinates,
and service evidence remain unchanged.

### 6.2 Logical-group records

```json
{
  "id": "naptan:490G00006381",
  "provider": "NaPTAN",
  "providerId": "490G00006381",
  "name": "East View",
  "type": "GPBS",
  "status": "active",
  "parentGroupId": null,
  "locality": {
    "id": "E0034871",
    "name": "Highams Park",
    "parentId": "N0060403"
  },
  "coordinate": { "latitude": 51.61298, "longitude": -0.0021 },
  "memberStopPointIds": ["490006381N", "490006381S"],
  "membershipSources": ["NaPTAN", "TfL"]
}
```

Required invariants:

- physical StopPoints remain distinct and independently selectable;
- member IDs are sorted, unique, and referentially valid;
- group IDs are namespaced by provider in the internal model;
- exact shared identifiers may be reconciled only when the provider identity
  and source record agree;
- `membershipSources` records corroboration and never changes timetable
  authority;
- opposite StopPoints are never replaced by one timetable identity;
- missing, inactive, duplicate, or malformed membership is quarantined or
  omitted with explicit manifest counts;
- no name, route, proximity, indicator, bearing, or coordinate fallback is
  permitted in the production relationship resolver.

The model remains useful to later BUS-GROUP, BUS-DEST, mapping, and export
work, but this sprint does not consume it in planner behaviour.

## 7. Core radius and logical-group policy options

The accepted T02A contract is unchanged:

```text
core selected StopPoint iff rounded ATLAS WGS84 distance <= requested radius
```

Boundary example: StopPoint A is 695 m from the assessment point and belongs
to StopArea X; StopPoint B belongs to X and is 710 m away.

| Model | Core result | Strengths | Risks / implications |
|---|---|---|---|
| 1. Strict core only | A selected; B excluded from the assessment | Preserves the literal 700 m meaning; simplest deterministic service population; no route inflation | Loses visible structural context; opposite-side completeness can look surprising; mapping cannot explain the related member without a second query |
| 2. Core plus related context | A is core; B is retained as authoritative related context and labelled out-of-radius; B does not automatically contribute core evidence | Preserves radius semantics while exposing the reason for the relationship; supports later mapping and review; controlled completeness analysis | Requires separate core/context status in outputs; UI/Word contracts must prevent context from appearing as assessed service; more schema and validation work |
| 3. Logical-group expansion | A causes B to become selected despite 710 m | Maximizes group-level visibility and may improve apparent opposite-stop completeness | Changes the meaning of a 700 m assessment; promotes service evidence outside the requested radius; risks route inflation and boundary discontinuities; complicates planner, map, and Word semantics |

### Final Technical Director decision — supersedes the discovery recommendation

The earlier Model 2 recommendation was **not approved**. The approved policy
is **CORE-TRIGGERED AUTHORITATIVE STOPAREA COMPLETION**.

The policy is deliberately two-phase:

1. A physical StopPoint is CORE only when its rounded ATLAS-calculated WGS84
   straight-line distance is less than or equal to the requested radius.
2. For every CORE StopPoint, each directly referenced active authoritative
   NaPTAN StopArea qualifies. The assessment population is then the union of
   every active direct physical member of those qualified StopAreas.

Completed members retain their actual distance, physical identity, membership
provenance, and an explicit status such as
`GROUP_COMPLETED_OUTSIDE_CORE_RADIUS`. They are not falsely marked as within
the radius. They may contribute legitimate route, timetable, direction,
frequency, operating-period, and planner-summary evidence when independently
supported by authoritative timetable data.

This decision avoids arbitrarily splitting a logical bus stop at the radius
boundary while retaining a deterministic radius qualification gate. It allows
professional opposite-direction completeness without arbitrary route inflation,
because no group qualifies unless at least one direct member is genuinely
within the radius and membership comes from authoritative structure.

### Final boundary and recursion rules

- East View / Normanshire at 700 m: WT is approximately 765 m and WE
  approximately 794 m. Neither is CORE, so StopArea `490G00006381` does not
  qualify and route 212 remains absent. No route-specific exception is valid.
- A group-completed member never triggers another StopArea. The only permitted
  graph is `CORE SET → directly referenced active StopAreas → active direct
  members → STOP`.
- If a CORE StopPoint has multiple active direct StopArea references, all such
  groups qualify independently; expansion remains non-recursive.
- Large and complex groups are not truncated or capped by an arbitrary member
  count or distance limit. Candidate QA must measure member count,
  member-to-member span, maximum completion distance, inactive/missing members,
  malformed groups, and outlier geometry.

This is the approved architecture for a later implementation sprint; it was
not implemented by BUS-T02B-0.

## 8. Real control evidence

All controls below are read-only extracts from official DfT XML and NPTG.
They are not production exceptions.

### 8.1 East View logical pair — ATCO 490

| Field | Evidence |
|---|---|
| StopArea | `490G00006381` |
| Name / type / status | East View / `GPBS` / active |
| StopArea coordinate | `51.61298, -0.00210` |
| Locality | `E0034871` Highams Park; parent `N0060403` London; district Waltham Forest |
| Members | `490006381N` Stop WT, `51.61285,-0.00249`, bearing N; `490006381S` Stop WE, `51.61310,-0.00176`, bearing SW |
| Source evidence | NaPTAN XML `StopAreaRef=490G00006381` on both child records; TfL `stationNaptan=490G00006381` on both live records |
| Run #24 prepared relationship | Not preserved; current stop fields contain neither StopArea reference nor group record |

### 8.2 Ordinary national opposite pair — ATCO 210

| Field | Evidence |
|---|---|
| StopArea | `210G9367` |
| Name / type / status | Market Oak Lane / `GPBS` / active |
| StopArea coordinate | `51.7367124672, -0.4466879613` |
| Locality | `E0013729` Bennetts End; parent `E0013763` Hemel Hempstead; district Dacorum |
| Members | `210021410114` Market Oak Lane SW-bound, bearing SW225, `51.7374062491,-0.4467945181`; `210021410126` Market Oak Lane NE-bound, bearing NE45, `51.7366834025,-0.4478910071` |
| Source evidence | Active NaPTAN StopArea with two active StopAreaRefs |
| Run #24 prepared relationship | Not preserved in the prepared stop array |

### 8.3 Bus station / multi-stand control — Waltham Cross

| Field | Evidence |
|---|---|
| StopArea | `210G432` |
| Name / type / status | Bus Station / `GBCS` / active |
| StopArea coordinate | `51.6855869431, -0.0312082342` |
| Locality | `E0013720` Waltham Cross; district Broxbourne |
| Members | `210021703420` Stop A; `210021703425` Stop B; `210021703430` Stop C; `210021703435` Stop D; `210021703440` adj; all `BCS` |
| Source evidence | One active bus-station StopArea with five active physical stands |
| Run #24 prepared relationship | The live control retained physical StopPoints and timetable authority, but no StopArea membership |

### 8.4 Complex multi-member control — St Peter's Street

| Field | Evidence |
|---|---|
| StopArea | `210G2249` |
| Name / type / status | St Peter's Street / `GCLS` / active |
| StopArea coordinate | `51.7537638594, -0.3371382013` |
| Locality | `E0014212` St Albans; district St Albans |
| Members | 11 physical StopPoints: `210021503158`, `210021503160`, `210021503180`, `210021503200`, `210021503220`, `210021503240`, `210021508490`, `210021508500`, `210021508520`, `210021508540`, `210021508580` |
| Indicators | SW-bound, Stop 1, Stop 3, Stop 4, Stop 5, Stop 2, Stop 13, Stop 12, Stop 11, Stop 10, Stop 14 |
| Source evidence | One active complex group with mixed stop types/indicators and 11 members |
| Run #24 prepared relationship | Not preserved |

## 9. Prepared-data schema impact

### 9.1 Proposed revision

The current `atlas-prepared-bus-data-v1` should not be silently extended. A
future revision should introduce a new schema, tentatively
`atlas-prepared-bus-data-v2`, with:

- `logicalGroupRefs` on each prepared StopPoint row;
- a deterministic `logicalGroups` collection, likely in separate spatial or
  ID-prefix shards rather than repeated in every stop shard;
- group fields: provider, provider ID, canonical namespaced ID, name, type,
  status, parent group ID, coordinates, locality IDs, sorted member IDs, and
  membership provenance;
- explicit source metadata for NaPTAN XML, optional NaPTAN CSV comparison, and
  NPTG XML;
- counts for missing members, inactive records, duplicate memberships, groups
  omitted by type/status, and reconciled TfL corroboration.

`stopFields` must remain an ordered manifest contract. The adapter must decode
the v2 field list rather than rely on a hard-coded positional assumption.

### 9.2 Validation and ordering

Candidate validation must prove:

- every active group member exists as a valid prepared StopPoint;
- every StopPoint group reference resolves or is explicitly quarantined;
- inactive/deleted memberships do not become active relationships;
- duplicates are removed by exact provider identity, not by name;
- each array is sorted by stable source ID;
- group records are deterministic across repeated builds;
- existing service stop IDs, timetable authorities, calendar fields, and route
  authorities are byte/semantic-equivalent apart from the new metadata;
- no group changes the core-radius selection set;
- source counts and hashes are recorded in the manifest.

### 9.3 Version, checkpoint, and fingerprint effect

The manifest schema/version must increment. The current State C candidate
compatibility fingerprint is:

`093d047c87482aba3d5b90844608046ece18bd673f9228dab504030883af223`

Changing `tools/atlas-bus-data/build_static_index.py`, the NaPTAN acquisition
format, or the prepared adapter necessarily changes the candidate-generation
compatibility inputs. Therefore BUS-T02B implementation **would invalidate
that fingerprint** and must not attempt to reuse a Run #24 checkpoint produced
under the current contract.

The safe process is a full fresh national acquisition and candidate build,
followed by deterministic validation and new compatibility evidence. An old
checkpoint may remain archived for audit/rollback, but it is not compatible for
resume unless a separately approved compatibility bridge proves equivalence.

### 9.4 Snapshot-size estimate

Run #24's current Bus publication is 87,740,538 bytes across 1,371 files for
375,566 stops. A normalized sidecar is strongly preferred. A first-order
estimate for one compact group-reference array per stop plus group records is:

```text
additional uncompressed JSON: approximately 8–20 MB
additional gzip/static payload: approximately 3–8 MB
expected total publication: approximately 91–96 MB
```

This is an engineering estimate, not a measured national rebuild. Actual size
depends on the number of distinct StopAreas, membership cardinality, namespace
encoding, and shard strategy. State C capacity validation must measure the real
candidate before checkpoint save and publication.

## 10. NPTG interaction review

NPTG supplies locality identity and hierarchy, not service inclusion or
timetable semantics. A future NPTG-1 prepared-data addition would likely carry:

```text
nptgLocalityCode
localityName
parentLocalityCode
parentLocalityName
grandParentLocalityCode/name where required
nptgDistrictCode/name
source locality type and source version
```

The current prepared rows already carry locality names and parent locality
names, but not the authoritative locality identifiers or a complete hierarchy.

Answers to the required interaction questions:

1. StopArea and NPTG are structurally independent enough to publish as
   separate runtime features. StopArea describes physical access-node grouping;
   NPTG describes place/locality hierarchy.
2. Separate implementation would create two avoidable schema migrations and
   potentially two full national refreshes if both are required before the
   next publication. Separate functional rollout is still safe.
3. One future prepared-data revision can carry both authoritative StopArea
   membership and NPTG identifiers/hierarchy, provided the fields, source
   hashes, validation counters, and runtime consumers remain separately scoped.
4. Combining only the data-schema migration reduces refresh and checkpoint
   churn. Combining StopArea selection behaviour with NPTG locality behaviour
   would create an oversized coupled sprint and is not recommended.

Recommendation: if NPTG-1 is authorized before the next national rebuild,
define one v2 metadata envelope and implement the two runtime features
separately. If NPTG-1 is not yet sufficiently specified, implement a
StopArea-only v2 rather than delaying authoritative grouping behind speculative
locality work.

## 11. State C implications

No State C repository was modified. A future implementation would require:

- new source acquisition and hash fields in the candidate manifest;
- candidate validation for StopArea/NPTG referential integrity and counts;
- refreshed A/B candidate data with the active bank unchanged until validation;
- checkpoint identity/fingerprint generated from the new schema and source
  hashes;
- full fresh candidate generation rather than resume of the old compatible
  checkpoint;
- publication measurement of the larger Bus snapshot and Pages capacity;
- explicit rollback to the prior Bus/TNDS publication if any downstream gate
  fails;
- no change to the A/B TNDS bank semantics or service publication contract.

The schema metadata can be prepared without changing the active publication,
but no publication is authorized by this discovery sprint.

## 12. Proposed BUS-T02B implementation test matrix

The existing deterministic suite must remain intact. The implementation should
add tests for:

1. a simple two-member active StopArea;
2. a group straddling the requested-radius boundary;
3. all group members inside the radius;
4. all group members outside the radius;
5. a bus station with multiple stands;
6. a complex group with more than two members and mixed indicators;
7. a StopPoint with multiple StopArea references;
8. a missing StopArea reference;
9. a malformed group record;
10. an inactive/deleted group;
11. an inactive/deleted membership;
12. duplicate membership rows with deterministic de-duplication;
13. TfL `stationNaptan` and NaPTAN exact-ID reconciliation;
14. TfL/NaPTAN mismatch retained as separate provenance, not merged by name;
15. national-only discovery;
16. London TfL discovery;
17. cross-boundary NaPTAN + TfL discovery;
18. deterministic provider ordering and stable shard output;
19. unchanged timetable StopPoint identities;
20. unchanged core-radius semantics at 699/700/701 m;
21. core-triggered group-completed members retain completion status and may
    contribute only independently supported authoritative service evidence;
22. no route-specific, StopPoint-specific, site-specific, coordinate-specific,
    or locality-name-specific behaviour;
23. unchanged route authorities and timetable authorities;
24. unchanged services, frequency, calendar, circular, grouping, Word, and UI
    semantics when only logical metadata is added;
25. compatibility rejection for an old checkpoint/fingerprint against v2 data.

## 13. Risks and limitations

- The DfT API's current CSV endpoint is insufficient for membership; the
  refresh must add XML or another official membership representation.
- XML schema versions differ between current area extracts (2.1 and 2.4), so
  the parser must support the official version family explicitly and record
  the source schema version.
- Some StopPoints have no membership and some records are inactive; absence
  must not be converted into inferred grouping.
- Some StopPoints have multiple memberships; a scalar `stopAreaId` would lose
  data.
- TfL's nearby response exposes a parent-like identifier but did not expand
  children in the tested control; hierarchy semantics need a broader bounded
  sample before any TfL-specific runtime policy is approved.
- The snapshot-size figure is estimated until a full national XML build is
  run. That build is outside this discovery sprint.
- Model 2 needs explicit presentation contracts so related context is not
  mistaken for assessed service.
- Because the candidate-generation fingerprint changes, checkpoint resume
  compatibility is a hard State C gate, not a documentation detail.

## 14. Proposed ADR status

`docs/adr/ADR-012-STOPAREA-AND-LOCALITY-SCHEMA.md` is now **APPROVED**. It
records core-triggered authoritative StopArea completion, the shared v2
StopArea/NPTG metadata migration, the non-recursive boundary, and the full
fresh-candidate requirement. It does not authorize implementation in this
documentation-only assignment.

## 15. Hosted-check clarification

The earlier wording that a Bus-specific hosted deterministic check passed was
incorrect and is superseded. Independent Technical Director verification
observed **Drawing Generator CI, Run #68, success** on PR head
`d4b693ae00c0c2a6dd4864ad9b3c3dcd3d131b6c`.

No Bus-specific hosted deterministic check was observed. This PR is
documentation-only, so no Bus runtime CI is required for this merge.

## 16. Approved next direction

The next proposed implementation sprint is **BUS-DATA-V2 FOUNDATION**. Its
scope is the shared prepared-data metadata foundation for authoritative
StopArea structure and NPTG locality structure, without initially changing
planner-facing runtime behaviour. It must not begin as part of this assignment.

## 17. Tooling adoption review

Status only; no tooling changes:

- Dependabot: present.
- Codecov: not configured.
- OpenSSF Scorecard: not configured.
- Sentry: not configured.
- Renovate: not configured.
- Main branch protection: not enabled in the prior repository review.

## References

- [DfT NaPTAN and NPTG data sets and schema guides](https://www.gov.uk/government/publications/national-public-transport-access-node-schema/naptan-and-nptg-data-sets-and-schema-guides)
- [DfT NaPTAN guide for data managers](https://www.gov.uk/government/publications/national-public-transport-access-node-schema/naptan-guide-for-data-managers)
- [DfT NaPTAN user guide](https://www.gov.uk/government/publications/national-public-transport-access-node-schema/html-version-of-schema)
- [Official NaPTAN/NPTG API Swagger](https://naptan.api.dft.gov.uk/swagger/index.html)
- [TfL Unified API portal](https://api-portal.tfl.gov.uk/)
