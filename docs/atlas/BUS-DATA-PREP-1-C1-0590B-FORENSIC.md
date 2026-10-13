# BUS-DATA-PREP-1-C1 — 0590B Forensic Closeout

## Finding

The four active `0590BCE` StopPoints at Queensgate Bus Station are entrance/access records, not timetable boarding points. All four remain present in the physical StopPoint and StopArea data (`059GPB25`), are bus-domain eligible, and have `timetableCallEligible: false`. None has an exact BODS identity in `stops.txt` or a resolved BODS `stop_times.txt` call. Their C1 state is `BUS_DOMAIN_NON_CALL_POINT`; this is not a claim that the station has no service.

The NaPTAN schema guide defines BCE as a bus/coach station entrance, BCS as a station bay/stand/stance, and BCQ as a variable bay. BCT is the on-street bus/coach stop type. [Department for Transport, NPTG and NaPTAN Schema Guide 2.5, v0.67, Table 3-14 and Table 6-1](https://naptan.dft.gov.uk/naptan/schema/2.5/doc/NaPTANSchemaGuide-2.5-v0.67.pdf). The corrected result is therefore a revised PREP-1 closeout: the old missing `0590B` timetable shard was an invalid test for these BCE records, not evidence of missing bus schedules.

## Exact source records

| StopPoint | Indicator | Latitude, longitude | StopArea | Bus domain | Timetable call | C1 state | Exact BODS `stops.txt` / resolved calls |
|---|---|---:|---|---|---|---|---|
| `0590BCE01L` | North Entrance | 52.5752095, -0.2463300 | `059GPB25` | Yes | No | `BUS_DOMAIN_NON_CALL_POINT` | None / 0 |
| `0590BCE02L` | South Entrance | 52.5739013, -0.2466331 | `059GPB25` | Yes | No | `BUS_DOMAIN_NON_CALL_POINT` | None / 0 |
| `0590BCE03U` | East Entrance | 52.5745257, -0.2462982 | `059GPB25` | Yes | No | `BUS_DOMAIN_NON_CALL_POINT` | None / 0 |
| `0590BCE04U` | West Entrance | 52.5745673, -0.2466803 | `059GPB25` | Yes | No | `BUS_DOMAIN_NON_CALL_POINT` | None / 0 |

## StopArea member corroboration

The `059GPB25` source StopArea contains 25 StopPoints: the four BCE entrances, 20 BCS station bays, and one TXR taxi rank. The independent raw GTFS `stops.txt` scan found exact ATCO StopPoint-ID matches for 18 of the 20 BCS members. Those same 18 members have resolved scheduled-call evidence; the two remaining BCS members (`0590PC900` and `0590PQG17`) have no matched `stops.txt` identity or current primary call in this frozen source window. Their absence is recorded as no current primary timetable evidence, not confirmed no service.

The call-bearing station members and their resolved route labels are:

| BCS StopPoint | Routes in frozen BODS window |
|---|---|
| `0590PQG01` | 2 |
| `0590PQG02` | 3 |
| `0590PQG03` | 1 |
| `0590PQG04` | 101, 102 |
| `0590PQG05` | 3 |
| `0590PQG06` | 33, X31 |
| `0590PQG07` | 5, 5A |
| `0590PQG08` | 415, 6, 904 |
| `0590PQG09` | 201, 202, 27, 48, X4 |
| `0590PQG10` | A, B, C |
| `0590PQG10A` | 27 |
| `0590PQG11` | 61, 62, 63 |
| `0590PQG12` | 5, 5A |
| `0590PQG13` | 2 |
| `0590PQG14` | 1 |
| `0590PQG15` | 23, 24, 25, 26, 26A |
| `0590PQG16` | 37, 4 |
| `0590PQG571` | 101, 102, 201, 202, 415 |

Raw identity provenance uses only exact allowed relationships: `stops.txt.stop_id` equal to the NaPTAN ATCO StopPoint ID, or `stops.txt.stop_code` equal to a NaPTAN code. The 18 identified BCS members matched by the former rule. Some exact identities occur in both East Anglia and East Midlands feeds; regional duplicates are preserved as source evidence, not interpreted as distinct physical StopPoints.

## Same-runtime QUEENSGATE-0590B replay

Both candidates were assessed at QUEENSGATE-0590B, Queensgate Bus Station, Peterborough (`52.5701, -0.2498`) through the real prepared-data adapter → bus assessment application → Word-table builder path. The original C1 proof used the then-default 700 m radius; it was never the historical PE1 2TL (`52.577554, -0.242489`) control. C2 separately records an exact 500 m QUEENSGATE-0590B run.

| Result | PREP-1 control | C1 |
|---|---:|---:|
| Nearby StopPoints retained | 47 | 47 |
| Route-bearing StopPoints | 38 | 38 |
| Prepared service records | 193 | 193 |
| Service summaries | 132 | 132 |
| Assessment status | `partial` | `complete` |
| 0590B shard diagnostic | Missing shard incorrectly attached to the BCE entrance set | No shard request for BCE infrastructure |
| BCE runtime outcome | `SOURCE_UNAVAILABLE` | `NOT_A_TIMETABLE_CALL_POINT` |
| Word service-summary table | Present | Present |

All four entrances remain available for physical discovery; the timetable adapter no longer fabricates a failed timetable check for them. Service and Word output counts remain identical in this controlled replay.

## Evidence and limits

The source is the immutable diagnostic snapshot `cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde`. The machine-readable records are in the C1 candidate’s `diagnostic-output/0590B-forensic.json`, derived from the exact snapshot plus the PREP-1 prior-candidate manifest. The data window is not a claim about live operations. `stop_times.txt` evidence is schedule evidence, not real-time operation; the two BCS members without a matched call remain unconfirmed rather than being declared unserved.
