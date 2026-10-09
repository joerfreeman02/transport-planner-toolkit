# BUS-ROBUSTNESS-1A4E-C1 — Phase A 313 forensic trace

Recorded before any C1 implementation or test-file edits. Baseline: `8da1495101ac7d1c2e9f843b5951df2b6127a44a`, branch `codex/atlas-bus-tfl-authoritative-evidence-c1`, V2 build header `BUS-TFL-COMPLETE · 8da1495`. Frozen Enfield assessment: 51.6523584, -0.0783252; 250 m; 13 stops; 14 distinct routes; 44 detailed route × StopPoint pairs. Full assessment completed from the existing prepared V2 data. The baseline review list contains exactly four items, all TfL origin endpoint decisions:

| Assessment StopPoint | Existing item | Current decision |
|---|---|---|
| `490001101K` | Route 313 · Stop 490001101K · TfL | Origin unresolved; generic source endpoint retained; no place inferred. |
| `490008903E` | Route 313 · Stop 490008903E · TfL | Same decision. |
| `490008903W` | Route 313 · Stop 490008903W · TfL | Same decision. |
| `490001101N` | Route 313 · Stop 490001101N · TfL | Same decision. |

All four are Category C source endpoint reviews, not timetable-availability failures. In the detailed records, TfL is authoritative and the operator is `not supplied`; no compatible BODS service was attached to these 313 records. The source retains the selected StopPoint, route, direction, interval/calendar, raw endpoint wording, endpoint IDs and ordered stop IDs. The four UI tasks collapse to two underlying direction/pattern facts: K and E expose the same inbound short-working pattern; W and N expose the same outbound ordinary pattern. They must not be deduplicated across those two different patterns. The separate full and short-working intervals remain distinct evidence.

## TfL route metadata and full sequence topology

Public TfL API responses were retrieved directly on 2026-10-09 (anonymous requests; no API key):

- `GET https://api.tfl.gov.uk/Line/313/Route?serviceTypes=Regular,Night` — HTTP 200; lineId/name `313`.
- `GET https://api.tfl.gov.uk/Line/313/Route/Sequence/inbound?serviceTypes=Regular,Night` — HTTP 200; lineId `313`, direction `inbound`; one sequence: `branchId: 0`, `nextBranchIds: []`, `prevBranchIds: []`, `serviceType: Regular`; 37 ordered stops.
- `GET https://api.tfl.gov.uk/Line/313/Route/Sequence/outbound?serviceTypes=Regular,Night` — HTTP 200; lineId `313`, direction `outbound`; one sequence: `branchId: 1`, `nextBranchIds: []`, `prevBranchIds: []`, `serviceType: Regular`; 42 ordered stops.

The direction sequences are each single, non-forking branches. The sequence response has `stopPoint` (each item has `id` and `name`), not `stopPointSequence`; the current parser accepts both shapes. These responses do not supply `orderedLineRoutes` or a route-section ID; those values are absent, not inferred. The matching route-section metadata does not supply a stable section ID either. Preserve these optional fields when present, and do not invent values when the current TfL response omits them.

`routeSections` returned exactly these current Regular sections (no separate Night section):

| Direction | Name / endpoint wording | Exact endpoint IDs | Validity |
|---|---|---|---|
| outbound | Chingford Station → Dame Alice Owen's School | `490001063D` → `210021085060` | 2026-09-19 through 2026-12-23 |
| inbound | Dame Alice Owen's School → Chingford Station | `210021085060` → `490001063D` | 2026-09-19 through 2026-12-23 |

The inbound full ordered StopPoint IDs are:

`210021085060 → 210021000010 → 210021001500 → 210021001520 → 210021001540 → 490010203E → 490012744E → 490014774S → 490008301S → 490004172S → 490011728S → 49003148B → 490006191S → 490005895S → 490013527E → 490001099CC → 490006587E → 490001101K → 490008903E → 490004902E → 490010933E → 490007396E1 → 490015329E → 490005843E → 490007258P → 490011753E → 490003082E → 490009813D → 490014555E → 490008749E → 490012009E → 490007924E → 490011083E → 490005172M → 490012619L → 490004663H → 490001063D`

The outbound full ordered StopPoint IDs are:

`490001063D → 490012617E → 490012558G → 490012619J → 490005182N → 490011083W → 490007924W → 490012009W → 490008749W → 490014555W → 490009813C → 490003219W → 490008101E → 490007258D → 490006576B → 490005843W → 490015329W → 490007396W2 → 490003937W → 490004902W → 490008903W → 490001101N → 490006586W → 490001099CA → 490012195N → 490005895N → 490006191W → 490008427N → 490002140ZZ → 490007634Q → 490011728N → 490004172N → 490008301N → 490014774N → 490012744W → 490010203N → 210021000500 → 210021000520 → 210021000540 → 210021000560 → 210021000020 → 210021085060`

The ordered names aligned index-for-index with those IDs are:

- inbound: `Dame Alice Owen's School → Potters Bar Station → Potters Bar Tesco → Highview Gardens → Park Avenue → New Cottage Farm → St John's Senior School → Windrush → Holly Cottage → Botany Bay / the Robin Hood → Roundhedge Way → Chase Farm Hospital / the Ridgeway → Drapers Road → Culloden Road → The Ridgeway → Enfield Chase Station → Enfield Town / Church Street → Enfield Town Station → Ladysmith Road → Cecil Avenue → Percival Road → Great Cambridge Road → Baird Road → Crown Road / Southbury Station → Glyn Road → Royal British Legion → Alexandra Road → Mollison Avenue / Ponders End → Wharf Road → King George Sailing Club → Kings Head Hill / Sewardstone Road → Hawksmouth → Pole Hill Road → Chingford Green → Station Road / the Green → Buxton Road → Chingford Station`.
- outbound: `Chingford Station → Station Road / Chingford Station → Stanley Road → Station Road / the Green → Chingford Police Station → Pole Hill Road → Hawksmouth → Kings Head Hill / Sewardstone Road → King George Sailing Club → Wharf Road → Ponders End Station → Scotland Green Road → Ponders End High Street → Glyn Road → Enfield Bus Garage / Southbury Station → Crown Road → Baird Road → Great Cambridge Road → Percival Road → Cecil Avenue → Ladysmith Road → Enfield Town Station → Enfield Town / Cecil Road → Enfield Chase Station → Slades Hill → Culloden Road → Drapers Road → Harefield Close → Chase Farm Hospital / Main Entrance → Hadley Road → Roundhedge Way → Botany Bay / the Robin Hood → Holly Cottage → Windrush → St John's Senior School → New Cottage Farm → Park Avenue → Highview Gardens → Potters Bar Tesco → Darkes Lane → Potters Bar Station → Dame Alice Owen's School`.

The inbound assessment stops K/E occur at sequence indexes 17/18; Crown Road `490005843E` is index 23; Chingford `490001063D` is index 36. The outbound assessment stops W/N occur at indexes 20/21; Potters Bar Station `210021000020` is index 40; the school extension stop `210021085060` is index 41. (Indexes are zero-based.)

## Exact four stop-level TfL timetable records

All four `GET /Line/313/Timetable/{stopId}` responses returned HTTP 200, lineId/name `313`, exactly one timetable route, two ordered station intervals (`id` 0 and 1), and schedules named `Mon-Fri Non-Schooldays`, `Mon-Fri Schooldays`, `Saturday`, `Sunday`. The route object contains `stationIntervals` and `schedules`; it has no route-section ID, `serviceType`, or `orderedLineRoutes`. The interval IDs on `knownJourneys` select the relevant patterns; preserve that association and the source calendar.

| Stop record | TfL direction | Interval 0 — ordered service stops after queried StopPoint | Interval 1 — school-only extension/short-working | Schedule journey counts and interval IDs |
|---|---|---|---|
| `490001101K` | inbound | `490008903E → 490004902E → 490010933E → 490007396E1 → 490015329E → 490005843E → 490007258P → 490011753E → 490003082E → 490009813D → 490014555E → 490008749E → 490012009E → 490007924E → 490011083E → 490005172M → 490012619L → 490004663H → 490001063D` | `490008903E → 490004902E → 490010933E → 490007396E1 → 490015329E → 490005843E` (Crown Road) | Non-school 54: `[0]`; school 55: `[0,1]`; Sat 51: `[0]`; Sun 36: `[0]` |
| `490008903E` | inbound | `490004902E → 490010933E → 490007396E1 → 490015329E → 490005843E → 490007258P → 490011753E → 490003082E → 490009813D → 490014555E → 490008749E → 490012009E → 490007924E → 490011083E → 490005172M → 490012619L → 490004663H → 490001063D` | `490004902E → 490010933E → 490007396E1 → 490015329E → 490005843E` (Crown Road) | Non-school 54: `[0]`; school 55: `[0,1]`; Sat 51: `[0]`; Sun 36: `[0]` |
| `490008903W` | outbound | `490001101N → 490006586W → 490001099CA → 490012195N → 490005895N → 490006191W → 490008427N → 490002140ZZ → 490007634Q → 490011728N → 490004172N → 490008301N → 490014774N → 490012744W → 490010203N → 210021000500 → 210021000520 → 210021000540 → 210021000560 → 210021000020` (Potters Bar Station) | Same stops, then `210021085060` (Dame Alice Owen's School) | Non-school 55: `[0]`; school 56: `[0,1]`; Sat 53: `[0]`; Sun 38: `[0]` |
| `490001101N` | outbound | `490006586W → 490001099CA → 490012195N → 490005895N → 490006191W → 490008427N → 490002140ZZ → 490007634Q → 490011728N → 490004172N → 490008301N → 490014774N → 490012744W → 490010203N → 210021000500 → 210021000520 → 210021000540 → 210021000560 → 210021000020` (Potters Bar Station) | Same stops, then `210021085060` (Dame Alice Owen's School) | Non-school 55: `[0]`; school 56: `[0,1]`; Sat 53: `[0]`; Sun 38: `[0]` |

The V2 detailed record fields relevant to endpoint reconciliation are:

- **K/E interval 1:** TfL, route 313, inbound, calendar `school-day`; origin raw `Origin not supplied`, origin ID absent; destination raw `Destination not supplied`, destination ID `490005843E` (Crown Road (EN1)); ordered assessed pattern is the queried K/E stop through the six interval stops above. Destination resolves to the exact Crown Road StopPoint; origin is the generic unresolved endpoint. This is the same source interval/pattern at K and E.
- **W/N interval 0:** TfL, route 313, outbound, calendars ordinary/non-school and school patterns using interval 0; origin raw `Origin not supplied`, origin ID absent; destination is Potters Bar Railway Station, exact ID `210021000020`; ordered assessed pattern is the queried W/N stop through the interval-0 stops above. Origin is the generic unresolved endpoint. This is the same source interval/pattern at W and N.
- **W/N interval 1:** school-day pattern adds only `210021085060` after Potters Bar; detailed evidence labels the raw origin Chingford Station and retains the school destination. It is not interchangeable with interval 0.
- **K/E interval 0:** same inbound branch to Chingford Station `490001063D`; interval 1 ends at Crown Road and must remain a short working, not be widened to Chingford.

The route-section comparison is performed against the complete candidate sequence, while the interval endpoint remains the timetable's own endpoint:

| Source interval | Complete candidate sequence | Section identity/validity result | Exact interval terminus relation |
|---|---|---|---|
| K/E inbound interval 0 | Inbound Dame Alice Owen's School → Chingford full section | Candidate full sequence endpoints match the inbound section; Regular; validity overlaps 2026-09-19–2026-12-23 | Chingford is the interval terminus and full-section destination; never replace it with the full branch origin. |
| K/E inbound interval 1 | Same inbound full sequence | Candidate full sequence endpoints match the same inbound section; Regular; validity overlaps | Crown Road is an interior short-working terminus; retain its exact `490005843E` ID. |
| W/N outbound interval 0 | Outbound Chingford → Dame Alice Owen's School full section | Candidate full sequence endpoints match the outbound section; Regular; validity overlaps | Potters Bar Railway Station `210021000020` is an interior ordinary terminus; retain it. |
| W/N outbound interval 1 | Same outbound full sequence | Candidate full sequence endpoints match the same outbound section; Regular; validity overlaps | Dame Alice Owen's School `210021085060` is the school-restricted extension terminus. |

TfL's `Line/{id}/Route` metadata does not include a stable route-section ID in the observed response, so matching evidence is based on the exact direction, full endpoint IDs, service type, and overlapping validity. It would be inaccurate to claim that the timetable interval itself is a full route section: the full branch is identity evidence only; each interval retains its own ordered pattern and terminus.

The four planner review item messages are byte-for-byte equivalent apart from their StopPoint IDs: `Origin endpoint decision requires review: Generic source endpoint was retained because no exact endpoint identity was available; no place was inferred.` They arise because baseline sequence linking requires the source pattern to equal the *entire* route-sequence stop list and its first/last IDs. The timetable records are deliberately clipped at the assessed StopPoint and/or at their interval terminus, so that condition cannot match the 37/42-stop complete line sequences. The two exact duplicates by source-fact key are K/E interval 1 inbound and W/N interval 0 outbound; retaining four planner tasks adds no distinct endpoint fact. The two underlying facts still differ materially and remain separately testable.

## Required C1 matching guardrails established by this trace

1. Match exact line and direction, `serviceType`, the assessed StopPoint, and all source ordered StopPoint IDs as a directionally ordered subsequence; retain calendar and timetable interval identity when present.
2. A unique sequence/section may fill only the endpoint that the timetable record does not identify. Preserve exact interval endpoints: Crown Road remains the inbound school short-working terminus; Potters Bar remains the ordinary outbound terminus; the extra school stop is restricted to interval 1/schoolday evidence.
3. Carry `branchId`, `nextBranchIds`, `prevBranchIds`, `serviceType`, ordered stop IDs/names, and optional `orderedLineRoutes` through the sidecar without adding full-route stops to timetable/planner pattern fields. Fail closed if multiple materially different sequences remain.
4. Section direction, exact route-section endpoint IDs/names, service type, and validity must agree when those fields are available. Do not equate the full route section terminus with an individual short-working endpoint.
5. Mark the duplicate stop-level origin review materiality at the shared route/direction/pattern/calendar fact level. Do not suppress unrelated service variants or endpoint conflicts.
