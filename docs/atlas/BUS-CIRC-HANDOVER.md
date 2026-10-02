# BUS-CIRC circular / loop-service intelligence handover

## Scope and identity

| Item | Value |
|---|---|
| Accepted BUS-GROUP starting SHA | `2f443376b1a91b371aa2ace9d54d4fe14e1d203f` |
| Branch | `codex/atlas-bus-circ` |
| Production release | `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914` |
| Data policy | Frozen local cache only; no source acquisition, rebuild, publication, deployment, bank switch, or merge |

The branch was created from the exact accepted SHA. BUS-GROUP, BUS-DEST,
StopArea/NPTG, source reconciliation, calendar, operator, frequency, routing,
and production-pipeline behaviour remain outside BUS-CIRC scope.

## Architecture and evidence hierarchy

`src/atlas/domain/circular-service-decision.mjs` owns the auditable
`CircularServiceDecision`. It retains public route identity, source pattern and
record IDs, ordered StopPoints, ordered StopAreas/logical places, endpoint
decisions, repeated-place evidence, closure evidence, geometry, branch and
short-working evidence, source circular assertions, orientation evidence,
classification, reason, and principal locations.

The hierarchy is deterministic:

1. complete ordered StopPoint/StopArea pattern;
2. exact physical StopPoint or exact authoritative StopArea/logical-place
   closure;
3. explicit direction/orientation metadata, or deterministic geometry when
   available;
4. source circular wording/flags retained as evidence only.

Names, endpoint wording, locality repetition, geographic proximity, and a
source circular flag cannot prove circularity. No confidence score is used.
Browser and Word consume the same row-level decision and
`plannerCircularWording`; neither infers circularity independently.

Different physical stands may close a loop when their exact authoritative
StopArea/logical-place IDs match. Physical StopPoint IDs remain visible in the
evidence. Same-name or nearby stops with different structured identity do not
close a loop.

An open ordered pattern is linear. Reverse `A → B → C` / `C → B → A` patterns
remain separate ordinary directions. `A → B → C → B → A` is classified
`out-and-back`; an internal repeat without endpoint closure is `partial-loop`.
Endpoint-only source assertions are `unresolved-review`. A proven loop gets an
orientation only from explicit authoritative `clockwise`/`anticlockwise`
metadata; otherwise it is displayed simply as circular.

Variant evidence is classified as principal pattern, genuine branch /
Additional service, contained Short working, distinct public service, or
unresolved. The annotation key includes route, location, and ordered pattern
evidence. One pattern cannot be both Additional services and Short workings;
different branch and contained-short patterns may coexist.

## Frozen controls

### Waltham 16

Actual frozen records in `tests/atlas/fixtures/bus-group-1d-waltham-runtime.json`
contain:

- `Bus Station → Bus Station`, source `circular: true`,
  `orderedPatternEndpoints: [210021703430, 210021703430]`, with no complete
  `routePatternStops`/`routePatternStopIds` sequence;
- `Highbridge Rdbt → Bus Station`, open endpoints;
- `Bus Station → Quaker Lane`, open endpoints.

The endpoint-only circular assertion is not enough. Final classification is
`unresolved-review`; the planner exposes the accepted non-circular route-family
structure and emits no circular planner annotation.

### Waltham 16C

The frozen records contain:

- `Bus Station → Bus Station`, source `circular: true`,
  `orderedPatternEndpoints: [210021703430, 210021703430]`, with no complete
  ordered StopPoint sequence;
- `Maple Gate → Bus Station`;
- `Bus Station → Maple Gate`;
- `Bus Station → Maynard Court`;
- `Maynard Court → Bus Station`.

Final classification is `unresolved-review`; no source-label-only circular
presentation survives. The distinct Maple Gate/Maynard Court evidence remains
auditable through the accepted group/variant model.

### Pipers route 230

The prepared frozen record is
`south_east:118723:0:b7eada5524c4`, Centrebus, `Lyons Community Centre →
Lyons Community Centre`, with `circular: true` and principal locations:
`Luton Airport Parkway Rail Station`, `Luton Station Interchange`, `Woodside`,
`Slip End`, `Pepperstock`, `Kinsbourne Green`, `Luton Airport`.

The record has no ordered StopPoint/StopArea pattern. The source label is
therefore evidence only: final classification is `unresolved-review`, with no
false circular planner wording. This is not a request to acquire or rebuild
TNDS/BODS data.

The frozen review manifest has BODS, NaPTAN and NPTG but no TNDS payload.
Routes C and 231 therefore remain a known review-source coverage limitation;
BUS-CIRC does not attempt to repair or activate that source.

## Regression and presentation results

The frozen Waltham GROUP controls continue to pass. The production-shaped
controls preserve 13-family presentation, 66 Hammond Street short working,
217 named-operator identity, 242, 251, 279, 310 Hertford, 317/327/491, A1,
N279 separation, TfL calendars, and human Additional-services wording.

The prior duplicate-category defect is covered by the 25C/16C controls and
`bus-circ.test.mjs`: the same destination/pattern is retained under one
semantic category only. Separate branch and contained-short evidence is
covered by the branch/short variant assertions and the Alpha.15 planner-group
controls, where both categories remain available when their evidence keys are
different.

The existing frozen regional replay remains unchanged: Cambridge
(`52.2053, 0.1218`) is 62 stops / 244 raw services / 173 summaries / 48 rows;
Birmingham (`52.4796, -1.9026`) is 101 / 201 / 196 / 80. These controls use
the frozen cache only and retain ordinary directions, route separation, and
zero unresolved regional rows.

Focused controls:

- `node tests/atlas/bus-circ.test.mjs`
- `node tests/atlas/alpha14-production-row-consolidation.test.mjs`
- `node tests/atlas/alpha15-planner-service-group.test.mjs`
- BUS-GROUP 1B/1D/1F/1G controls

The complete deterministic runner reached all functional BUS-CIRC,
BUS-GROUP, Alpha.12–15, Browser/Word, isolation, and frozen review controls.
The final review-environment identity check is intentionally run after commit,
because it refuses to claim a clean executable build from a dirty worktree.

## Product Owner checklist

Open the committed review build; confirm 16/16C/230 show no unsupported circular
claim, 310/66/217/242/279/N279 remain stable, and Browser and Word show the
same human wording. Confirm no source acquisition or production version change.

## GitHub tooling adoption review

No GitHub tooling adoption changes are included in BUS-CIRC. For follow-up
review: Dependabot and Renovate would overlap, Codecov requires repository
coverage-policy approval, OpenSSF Scorecard is useful for public supply-chain
signals, Sentry is not justified for this local/frozen review scope, and main
branch protection should continue to require review and passing deterministic
checks. This branch is not merged and production remains Alpha.15.
