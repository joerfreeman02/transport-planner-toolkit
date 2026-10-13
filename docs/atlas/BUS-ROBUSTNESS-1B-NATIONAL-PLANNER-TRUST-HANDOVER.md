# BUS-ROBUSTNESS-1B — National partial-failure isolation and planner trust handover

## Executive verdict

**READY FOR TECHNICAL DIRECTOR REVIEW**, subject to the final Git/push status
reported with this handover. The national prepared-data path now isolates
missing, load-failed, malformed, and validation-failed service shards. Good
shards remain usable, affected stop/route evidence is explicitly unresolved,
and incomplete timetable data cannot be rendered as “no routes” or “no
service”. Version remains `2.0.0-alpha.15`.

No merge, deployment, main/master change, PR, fresh national acquisition,
TNDS activation, or accepted London redesign was performed.

## Identity

- Repository: `transport-planner-toolkit`.
- Branch: `codex/atlas-bus-robustness-1b-national-planner-trust`.
- Worktree: `atlas-bus-robustness-1b-national-planner-trust`.
- Protected baseline: `737f26a108deba5f6fb22dac00bce02af4f87e6b`.
- Version: `2.0.0-alpha.15`.
- Frozen national run: `36125621080`.
- Frozen snapshot hash: `8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9`.
- Implementation commit: `24c9c04ce05e5a96ef65316c381939df30176a05`.
- Final functional SHA/code tip: `814191a7dc030a41c309fd5d32bd4dc38bff5e3c`.
- Remote SHA verified after push: `814191a7dc030a41c309fd5d32bd4dc38bff5e3c`.
- Local/origin parity at verification: `0 ahead / 0 behind`.
- Worktree status at verification: clean.
- The final branch tip includes this handover record; its exact documentation
  commit is reported with the final Git verification in the task response.

## London pre-flight freeze gate

**LONDON FREEZE GATE PASSED.** No London code was changed during the gate.

### Route 313 Enfield Chase / Crown Road

The protected TfL route-sequence evidence contains exact ordered StopPoint
IDs. Inbound route 313 places Enfield Chase Station (`490001063D`) at the
route end and places the assessed Enfield Chase stops `490001101K` and
`490008903E` at sequence positions 17 and 18. Crown Road (`490005843E`) is at
position 23. The TfL timetable response has two interval patterns: interval 0
continues to Chingford; interval 1 is a school-day short working whose exact
destination is Crown Road (`490005843E`). The Word note “Some route 313
journeys operate to Crown Road (EN1) and Enfield Chase Station” is therefore
supported by a named endpoint and a distinct timetable interval, not by treating
an arbitrary intermediate stop as a terminus.

### TfL / supplementary disagreement

The protected C2 result records technical TfL/supplementary endpoint-topology
differences for routes 456, 629, and W8. TfL timetable route/direction and
planner destination remain deterministic: 456 remains “Towards Crews Hill”;
629 retains its Turkey Street/Wood Green directions and school-day-only
qualification; W8 retains both planner destinations, term-time marker,
frequency, and operating period. The differing fields were source endpoint or
topology identities, not planner-facing route, direction, destination,
frequency, period, calendar, stop-served, service-existence, or short-working
decisions. C2 classified them as technical/audit evidence and produced zero
actionable review items for those facts. The accepted 313 evidence and its
remaining source qualifications were not reopened.

## Root cause

The Phase A PE1 trace is in
`docs/atlas/BUS-ROBUSTNESS-1B-PHASE-A-PE1-FORENSIC-TRACE.md`.

The exact live frozen trigger was missing prepared service-shard coverage for
prefix `0590B`. The previous adapter loaded national service files as one
transaction: any missing, failed, malformed, or invalid shard returned a
whole-request failure and discarded service data already available from good
shards. At PE1 this converted 189 recoverable records from successful prefixes
into zero returned services. The application then marked route-bearing stops
unmatched, the Browser’s recommended selection removed them, and the Bus
Service Summary appeared empty.

## Implementation

`servicesForStops` now:

- derives the required shard keys from the selected StopPoints;
- loads each configured shard independently;
- records `missing`, `load-failed`, `malformed`, and `validation-failed`
  diagnostics with shard key, path, and affected stop IDs;
- merges valid successful service payloads by service ID and selected stop;
- returns `PARTIAL` provenance when any shard fails but at least one succeeds;
- records unresolved StopPoints, route identities, failed requests, and
  successful/failed shard counts;
- returns `SOURCE_UNAVAILABLE` / `UNRESOLVED` only when no usable shard data
  survives, never as a zero-service conclusion.

The application keeps these state distinctions:

- `MATCHED`: scheduled evidence was found;
- `NO_CURRENT_MATCH`: the authoritative timetable source completed and found no
  current match;
- `NO_ROUTES`: the authoritative stop source recorded no routes and timetable
  coverage was complete;
- `SOURCE_UNAVAILABLE`: required timetable evidence could not be checked;
- `PARTIAL`: some evidence was usable but the assessment is not complete.

When route metadata exists on an affected stop, the shared source presentation
explicitly says timetable evidence was unavailable/incomplete and that the
routes were not treated as absent. Browser recommendation retains these
route-bearing rows for review. Genuine route-less “Other nearby” rows remain
separate and are not automatically selected.

The generic Browser warning mapper now suppresses a stale “no bus stops” text
when the result contains returned stops, while preserving the raw warning in
source evidence. This fixes the Waltham contradiction without altering Waltham
service intelligence.

Browser and Word use the same `partialTimetableQualification` wording, and
Word exports add the qualification as a deterministic summary row.

## Peterborough control

The frozen PE1 assessment discovered 57 stops, 41 with route metadata, 10
qualified StopArea groups, and 43 completed group members. Successful prepared
service files were the two `0590P` files, the two `05901` files, and the
`0590D-east_midlands` file. `0590B` was missing from the manifest. The fixed
full assessment retained 189 services, 126 service summaries, and 44 planner
service summaries; 41 stops matched and 16 route-less records remained source
unavailable because their prefix coverage could not be checked. The result is
`PARTIAL`, with an explicit `timetable-shard-failure` review item.

The old result was whole-request `SOURCE_UNAVAILABLE` with zero services and
no planner summaries. The fixed result retains the usable national evidence;
in a route-bearing affected-shard case, the Browser and Word qualification
prevents the source failure from reading as route absence.

## Waltham control

The protected Waltham control is six stops and 19 service summaries with the
accepted route families 13/13A/B/C, 15/15A, 16/16C, 66, 251, 279, 317, 327,
491, and N279 unchanged. The pre-existing OSRM review at StopPoint
`210021703430` remains a genuine access-routing review and is not forced into a
route. The contradiction was presentation-state logic: a generic “no bus
stops” warning was displayed even when stop records existed. The generic
warning mapper now emits that message only when the returned stop inventory is
empty. The accepted Waltham route/service inventory is unchanged.

## Protected regression controls

- Chingford: 357, 444, W16, and school-days-only 657 remain protected by the
  existing Alpha.15 controls; 657 remains one journey/day/direction.
- Enfield: the freeze gate confirmed 313, 191, 317, Crown Road, Enfield Chase,
  school-only, and TfL authority evidence remain protected. No Enfield
  redesign was introduced.
- Waltham, Pipers, GROUP, DEST, CIRC, endpoint aliases, calendars, term-time,
  school-only rules, operating periods, TfL source authority, iBus logic, and
  Browser/Word parity remain covered by the existing regression matrix.

## Files changed

- `atlas/assets/js/app.mjs`
- `atlas/index.html` (metadata-only Alpha.15 test-build marker required by the
  protected review-environment contract)
- `docs/atlas/BUS-ROBUSTNESS-1B-NATIONAL-PLANNER-TRUST-HANDOVER.md`
- `docs/atlas/BUS-ROBUSTNESS-1B-PHASE-A-PE1-FORENSIC-TRACE.md`
- `src/atlas/adapters/prepared-bus-data-adapter.mjs`
- `src/atlas/application/bus-assessment.mjs`
- `src/atlas/domain/bus-planner-trust.mjs`
- `src/atlas/domain/bus-source-presentation.mjs`
- `src/atlas/domain/review-item-taxonomy.mjs`
- `src/atlas/presentation/bus-word-export.mjs`
- `tests/atlas/bus-robustness-1b-national-planner-trust.test.mjs`
- `tests/atlas/prepared-bus-data-adapter.test.mjs`
- `tests/atlas/run-all.mjs`

The implementation scope is limited to national shard isolation,
planner-state/presentation handling, focused tests, the protected test-build
metadata correction, and these forensic/handover documents.

## Tests and limitations

Focused BUS-ROBUSTNESS-1B tests cover all 20 mandatory categories: complete,
missing, malformed, validation-failed, multiple-good-plus-bad, complete
failure, evidence retention, route metadata, affected-stop states, genuine
`NO_ROUTES`, genuine `NO_CURRENT_MATCH`, partial wording, recommendation
selection, Other nearby separation, Waltham stops-present warning behavior,
Word qualification, accepted Waltham inventory fixture coverage, OSRM review
retention, and Browser/Word parity. The final gate is:

```text
node tests/atlas/run-all.mjs
```

The exact final sentinel must be:

```text
ATLAS Alpha.15 deterministic suite passed.
```

The frozen PE1 cache demonstrated a real missing shard; malformed and
validation-failed PE1 payloads were not present in that frozen cache and are
therefore proven with deterministic fixtures. Live GUI/browser inspection was
not used, in accordance with the unattended-workday constraint. Remaining
known risks are the existing prepared-data freshness boundary and any future
source-shard/schema changes; the implementation fails closed for affected
evidence and preserves diagnostics rather than fabricating services.
