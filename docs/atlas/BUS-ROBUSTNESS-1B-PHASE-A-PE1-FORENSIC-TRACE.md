# BUS-ROBUSTNESS-1B — Phase A PE1 forensic trace

## Executive finding

The historical failure was reproduced against the frozen prepared V2 cache
before implementation. Peterborough stop discovery succeeded, but the
all-or-nothing national timetable loader aborted the whole request when the
`0590B` service-shard prefix had no configured shard. Good evidence from the
other required prefixes was consequently discarded. The old Browser path then
treated route-bearing stops as unmatched and hid them from its recommended
selection, making incomplete timetable evidence look like no service.

The frozen cache contained no malformed or validation-failed PE1 shard. Those
failure modes are covered by deterministic fixture tests; the real PE1 trigger
was missing-shard coverage.

## Reproduction boundary

- Protected baseline: `737f26a108deba5f6fb22dac00bce02af4f87e6b`.
- Frozen national run: `36125621080`.
- Frozen snapshot hash: `8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9`.
- Prepared cache: local V2 review cache for run `36125621080`.
- Point: `PE1 2TL`, `52.577554, -0.242489`.
- Radius: `500 m`.
- No fresh national acquisition, TNDS activation, or source expansion was
  performed.

## Discovery and shard evidence

The frozen prepared manifest was `atlas-prepared-bus-data-v2`, snapshot date
`2026-10-09`, service-shard key length `5`, and grid cell `g210_m1`.

| Evidence | Result |
|---|---:|
| Nearby stops discovered | 57 |
| Stops with route metadata | 41 |
| Qualified StopArea groups | 10 |
| Completed StopArea members | 43 |
| Invalid/unresolved StopArea members | 0 |

Required service prefixes and configured paths were:

| Prefix | Prepared path(s) | Frozen result |
|---|---|---|
| `05901` | `services/05901-east_anglia.json.gz`; `services/05901-east_midlands.json.gz` | loaded |
| `0590B` | none configured | missing shard |
| `0590D` | `services/0590D-east_midlands.json.gz` | loaded |
| `0590P` | `services/0590P-east_anglia.json.gz`; `services/0590P-east_midlands.json.gz` | loaded |

The successful files were loaded independently. A direct request limited to
the 41 route-bearing stops returned 189 service records and route families
`1, 2, 3, 4, 4P, 5, 5A, 6, 23, 24, 25, 26, 26A, 27, 33, 37, 48, 60, 61,
62, 63, 101, 102, 201, 202, 415, 904, A, B, C, X4, X31`.

## Old failure chain

Before the fix, `servicesForStops` treated any required shard failure as a
whole-request failure. The exact PE1 result was `ok: false`, code
`unavailable_source`, service count `0`, and the warning that prepared
timetable coverage was unavailable for one selected stop area. The application
therefore had no service records to reconcile, every route-bearing stop ended
with `timetableMatch: false`, the recommended Browser selection excluded those
stops, and the Bus Service Summary was empty. The result was partial only in a
technical sense; its planner-facing shape could be read as “no routes/services”.

The old Browser warning mapper also converted any “no bus stops” warning into
“No bus stops were found within the selected distance” without checking whether
the result already contained stop records. That was the generic Waltham
contradiction described in the 1A4E handover.

## Post-fix control result

With shard isolation enabled, the same frozen PE1 cache retains the successful
shards and records one missing-shard diagnostic. The full assessment retains
all 57 discovered stop records, with 41 matched stops and 16 source-unavailable
route-less records from the missing `0590B` prefix. It retains 189 services,
126 service summaries, and 44 planner-facing service summaries. The review list
contains a deterministic `timetable-shard-failure` item identifying the
partial source state; no zero-service conclusion is emitted.

The Browser recommendation now keeps route-bearing stops whose timetable state
is `SOURCE_UNAVAILABLE` or `PARTIAL`, while genuine route-less “Other nearby”
records remain outside the recommended set. If a failed shard affects a stop
that has route metadata, the shared Browser/Word qualification states that the
route evidence was found but could not be checked and therefore was not treated
as absent.

The PE1 cache did not contain a malformed or validation-failed shard. The
focused BUS-ROBUSTNESS-1B tests exercise malformed payloads, invalid service
records, load failures, complete failure, partial matching, Browser selection,
and Word qualification without changing the frozen national data.
