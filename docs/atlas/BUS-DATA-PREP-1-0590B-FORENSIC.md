# BUS-DATA-PREP-1 0590B forensic control

## Verdict

The new V2 candidate does not silently lose 0590B timetable evidence. Four
active bus-eligible NaPTAN StopPoints exist under prefix `0590B`; none has a
corresponding BODS stop or current scheduled call in the frozen nine-region
source set. Each receives the explicit final state
`CONFIRMED_NO_CURRENT_SERVICE`.

## Stop-by-stop trace

| StopPoint | NaPTAN | Active | Bus-eligible | BODS stop/call | Prepared service/shard | Final state | Root cause |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `0590BCE01L` | Queensgate Bus Stn | yes | yes | none / 0 | none | `CONFIRMED_NO_CURRENT_SERVICE` | BODS omission/incomplete publication |
| `0590BCE02L` | Queensgate Bus Stn | yes | yes | none / 0 | none | `CONFIRMED_NO_CURRENT_SERVICE` | BODS omission/incomplete publication |
| `0590BCE03U` | Queensgate Bus Stn | yes | yes | none / 0 | none | `CONFIRMED_NO_CURRENT_SERVICE` | BODS omission/incomplete publication |
| `0590BCE04U` | Queensgate Bus Stn | yes | yes | none / 0 | none | `CONFIRMED_NO_CURRENT_SERVICE` | BODS omission/incomplete publication |

For every row the deterministic chain is:

`NaPTAN StopPoint exists and is active → StopType BCE is bus/coach eligible →
all nine frozen BODS archives are checked → no raw BODS stop and no scheduled
stop_time resolves to the StopPoint → no prepared service evidence → no
service shard allocation → explicit confirmed-zero ledger state`.

The candidate forensic artifact is
`diagnostic-output/0590B-forensic.json`. The national ledger is
`diagnostic-output/coverage-ledger.json`; both are stored with the durable
candidate, not in normal Git history.

## Old snapshot comparison

The accepted comparison manifest contains no `0590B` service-shard key. The
new candidate also contains no `0590B` service shard, but the reason is now
proved rather than inferred from a missing file: the authoritative frozen BODS
inputs contain no corresponding stop or scheduled journey for these four
active NaPTAN records. The root cause is therefore
`BODS omission/incomplete publication`, not an ATLAS sharding defect and not a
vague “missing shard” conclusion.

## Interpretation boundary

This control proves the result against the exact BUS-DATA-ACQ-1 frozen source
window. It does not assert that another source family, a later BODS window, or
TNDS would agree. Cross-source reconciliation remains BUS-DATA-TRUST-1 work;
TNDS was not acquired or activated in this sprint.
