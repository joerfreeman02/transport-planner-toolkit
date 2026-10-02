# BUS-CIRC-1A ordered BODS pattern evidence handover

## Identity and scope

| Item | Value |
|---|---|
| Required starting SHA | `205ebbbedd02219ebdc1bcbd33d2da159b55a669` |
| Branch | `codex/atlas-bus-circ` |
| Production | Alpha.15 (`2.0.0-alpha.15`) |
| Source policy | No source acquisition; no publication, activation, deployment, merge, or Alpha.16 |

This corrective change is deliberately limited to the existing optional
`routePatternStopIds` contract and the exact BUS-DEST endpoint evidence needed
to interpret it. It does not redesign BUS-CIRC, BUS-GROUP, calendars, operator
reconciliation, or the publication pipeline.

## Root cause and implementation

`tools/atlas-bus-data/build_static_index.py` already sorted BODS
`stop_times.txt` rows and held every ordered call in `calls`. It then used that
sequence only to create a service-pattern signature, while persisting only
`source.orderedPatternEndpoints`. Consequently the downstream adapter,
assessment, planner grouping, and `CircularServiceDecision` had no complete
BODS pattern to inspect.

`process_trip()` now derives `routePatternStopIds` directly from the existing
sorted calls. Resolved calls use the exact NaPTAN StopPoint ID. An unmatched
call is retained as `gtfs:<region>:<gtfs_stop_id>` (or a position-qualified
`gtfs:<region>:unresolved:<position>` fallback when the source row has no stop
identity). No NaPTAN identity is fabricated, stops are not deduplicated, and
repeated endpoints remain repeated. The same compact ordered identities are
used for the pattern signature and endpoint evidence.

The prepared adapter, service assessment, planner grouping, and circular
decision already accepted this optional field. No prepared schema or version
bump was required. Older records without the field still load and remain
`unresolved-review` when the available evidence is insufficient.

Circular endpoint closure now combines a complete ordered pattern with exact,
non-conflicted BUS-DEST endpoint decisions. The physical endpoint IDs must
match the decision’s exact endpoint IDs, and closure may then use the same
authoritative StopArea/logical-place ID. Source wording, destination text,
same-name matching, locality, and proximity remain non-authoritative.

## Tests added

The Python builder tests cover stop-sequence order, exact NaPTAN identity,
unmatched GTFS traceability, repeated endpoints, serialized prepared output,
and unchanged v2 versioning. BUS-CIRC tests cover endpoint StopArea evidence
with different physical stands plus propagation through the prepared adapter,
service summaries, and planner grouping. Existing generic loop, out-and-back,
partial-loop, orientation, false-positive, branch/short, Waltham, Pipers, and
Word controls remain in the same suite.

## Frozen-source proof status

The current checkout contains the derived prepared bank and its frozen
manifest, but does not contain the raw `tmp/bus-data` BODS archive directory
required by `run-build.mjs`/`build_static_index.py`. Therefore this checkout
cannot honestly produce the requested raw GTFS full-pattern summaries for
Waltham 16/16C or Pipers 230, nor perform the authorised derived national
review-candidate rebuild or candidate replay. No replacement pattern was
hand-authored and no source was acquired to bypass that limitation.

The available derived evidence records are:

- Waltham 16: route ID `6770339`, `Bus Station → Bus Station` source circular
  assertion with endpoint-only `[210021703430, 210021703430]`, plus open
  Highbridge Rdbt and Quaker Lane variants; current decision remains
  `unresolved-review` with no circular planner wording.
- Waltham 16C: route ID `6770341`, `Bus Station → Bus Station` endpoint-only
  source assertion `[210021703430, 210021703430]`, plus Maple Gate and Maynard
  Court variants; current decision remains `unresolved-review` with no
  circular planner wording.
- Pipers 230: south-east BODS route ID `118723`, prepared record
  `south_east:118723:0:b7eada5524c4`, `Lyons Community Centre → Lyons
  Community Centre`, source circular assertion, but no ordered pattern;
  current decision remains `unresolved-review` with no circular wording.

The prepared manifest records the frozen source identities, including BODS
aggregate SHA256 `1afc9b982913056d7c0c4c25fbd4a4580399e974c030528f0fa66a15c06bf35b`
and NaPTAN SHA256
`e2f865542306359dcb6cc1c5288775979cdd3d55a76d21c98e5b6beb34e81f9a`. These
are manifest evidence only; there was no before/after raw-source hash check
because the raw snapshot is not present locally.

## Regression and presentation status

The prior frozen Waltham BUS-GROUP controls, Cambridge and Birmingham frozen
review controls, duplicate Additional/Short classification, and shared
Browser/Word wording remain protected by the existing deterministic suites.
The candidate-size delta and real Waltham/Pipers candidate replay remain
pending raw frozen-source availability. The active prepared bank was not
modified or activated. Its current derived size is 87,272,247 bytes across
1,371 files; no candidate delta can be claimed without rebuilding from the
missing raw snapshot.

## GitHub tooling review

No tooling adoption changes were made. Dependabot configuration exists but
repository Dependabot alerts are disabled; Renovate would overlap with the
existing weekly Dependabot update path. Codecov needs an explicit coverage
policy, OpenSSF Scorecard is useful for public supply-chain signals, Sentry is
deferred for this local/frozen review, and main-branch protection should be
enabled with review and deterministic checks before any production merge.

## Product Owner acceptance gate

Once the exact frozen raw BODS archives are restored locally, run the targeted
16/16C/230 extraction first, verify source hashes, build one separate review
candidate, measure size, replay Waltham and Pipers, run Browser/Word, and only
then consider the candidate for review. Do not publish, activate, deploy,
merge, or change the Alpha version as part of BUS-CIRC-1A.
