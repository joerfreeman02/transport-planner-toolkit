# BUS-GROUP + TERMINUS INTELLIGENCE handover

## Scope and identity

This sprint adds public-service grouping and conservative terminus intelligence
on top of the accepted Alpha.15 planner implementation.

| Item | Value |
|---|---|
| Accepted starting SHA | `06dbb19e9545d19c24879cf72227e209dcb96cf5` |
| Working branch | `codex/atlas-bus-group-terminus` |
| Production release | `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914` |
| Data policy | No source acquisition, publication, or deployment performed |
| Frozen diagnostic control | Run `36125621080`, snapshot `8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9` |

The production release identity is unchanged. The frozen snapshot is diagnostic
only (`FROZEN_DIAGNOSTIC_EXPLICIT`, non-production eligible) and is not promoted
or treated as current data.

## Runtime architecture

The new decision flow is:

```text
source service summaries
  -> BUS-DEST exact endpoint decisions
  -> PublicServiceGroupingDecision
  -> PlannerServiceGroup
  -> shared planner rows
       -> Browser Table 3.3
       -> Word Table 3.3
```

`src/atlas/domain/bus-grouping.mjs` is pure domain logic. It does not perform
source access and does not contain route-number exceptions. The planner summary
builder supplies the same group, public-service decision, endpoint decision,
terminus decision, calendars, provenance, and canonical departures to both
presentation paths.

## Public-service grouping rules

- Route identity is normalised conservatively. `13` and `13A`, `279` and `N279`,
  and unrelated same-number stems remain separate unless deterministic lineage,
  ordered-pattern, or exact-endpoint evidence supports a relationship.
- Operator spelling and missing operator fields are compatible evidence, not
  identity. A reliable operator is displayed; missing/operator-placeholder text
  is retained in raw provenance but is not promoted as the public operator.
- Exact BUS-DEST endpoint place identity can join different stand wording only
  when the endpoint decision is exact. StopArea, logical/place, and exact
  StopPoint evidence are carried in the decision. Fuzzy destination text is not
  a join key.
- The decision retains source IDs, provider/authority lineage, ordered pattern
  evidence, principal pattern, short-working records, branch variants, alternate
  destinations, calendar profiles, and unresolved/ambiguous records.
- Short workings are recognised only as strict ordered subsequences of a
  principal pattern, with exact endpoint-place agreement where an endpoint stand
  differs. A longer or more active variant is selected as principal without
  discarding the short-working evidence.
- Branches and materially different destinations stay visible as notes or
  separate groups when the evidence cannot establish one public direction.
- Physical journeys are deduplicated only when their structured journey identity
  agrees. Same-minute journeys with different identities remain distinct.
- School-day, term-time, weekday, weekend, and other calendar qualifications
  remain profile-qualified within the consolidated row; they are not broadened
  into ordinary daily operation.
- Source authority is deterministic: TfL exact evidence outranks national
  timetable evidence, which outranks other/unknown sources for tie-breaking.

## Terminus intelligence

`TerminusDecision` is produced only from exact BUS-DEST endpoint evidence.
Nearby stands in one exact StopArea/place are allowed to prove one terminus,
but a nearby stop is not itself treated as an assessed terminus merely because
it shares a name or is within the search radius.

The decision records:

- assessed endpoint place and exact endpoint-side evidence;
- arrival and departure source records and StopPoint IDs;
- the ordered pattern position supporting the endpoint;
- `proven-terminus`, `through-service`, `not-assessed-endpoint`, or
  `unresolved-review` status;
- presentation intent (`departing-only`, `arrival-only-suppress`,
  `departing-and-arriving`, or `none`).

For a proven linear terminus, an arrival-only duplicate is suppressed when a
departing row proves the same assessed place. Its source IDs remain in the
departing row's audit evidence. A through-service is never suppressed. Circular
services continue through the existing circular classification and are not
forced into terminal wording.

## Tests and controls

The added deterministic test is
`tests/atlas/bus-group-terminus.test.mjs`. It covers TfL plus national-source
same-public-service grouping, exact endpoint-place equivalence, `13`/`13A` and
`279`/`N279` separation, short workings, divergent branches, operator/source
authority, alternate destinations, calendar safety, physical-journey identity,
linear terminus arrival suppression, through-service, uncertain endpoints,
circular preservation, and Browser/Word parity.

The accepted canonical frozen control remains:

| Measure | Accepted baseline |
|---|---:|
| Physical stops | 16 |
| Distinct routes | 21 |
| Route×StopPoint pairs | 86 |
| Planner rows before BUS-GROUP | 39 |
| Planner rows after BUS-GROUP + TERMINUS | 21 |

The final offline replay of the frozen diagnostic cache measured the same `16`
physical stops, `21` distinct routes, and `86` route×StopPoint pairs, then
reduced the accepted `39` pre-group planner rows to `21` public planner rows.
The reduction is grouping and terminal-presentation work only; it is not a
claim that any source timetable was refreshed.

The principal replay controls are:

- `310`, `15`, `217`, `491`, `242`, `279`, and `66` retain proven Waltham
  Cross terminal evidence; arrival-only terminal duplicates are suppressed only
  where a departing proof exists.
- `66` retains Hammond Street short-working evidence; `242` retains Welham
  Green Railway Station and Brookfield Centre; `279` retains Manor House
  Station; and the route-specific calendar notes remain visible.
- `13`, `13A`, `13B`, and `13C` remain distinct public route rows. `279` and
  `N279` remain distinct. `16` and `16C` retain circular presentation and are
  not forced through terminal suppression.
- Source IDs, alternate destinations, branch/short-working classifications,
  endpoint StopPoint/StopArea evidence, and the canonical departure evidence
  remain on the planner row for audit and review.

Browser and Word continue to consume the same planner rows, service notes,
grouping decisions, terminus decisions, and source evidence. No live source or
TNDS acquisition was made for this replay; the existing frozen diagnostic cache
was read offline only.

The repository also contains the network-free Alpha.15 production fixture used
by the existing acceptance suite (`12` planner rows for that smaller fixture).
It is not the 39-row frozen run and must not be presented as a replacement for
the canonical diagnostic control. No new canonical publication was produced by
this sprint.

## GitHub tooling adoption review

This sprint made no GitHub governance or third-party tooling changes. The
existing `.github/dependabot.yml` configuration is retained: weekly grouped
npm and GitHub Actions updates, with no automerge. Codecov and OpenSSF
Scorecard are not configured; the recommended follow-up is a repository-owner
decision on coverage reporting after a baseline and Scorecard as a
GitHub Action/check. Sentry is not applicable to this domain-only change; it
may be reconsidered for browser-runtime failures with a privacy review.
Renovate is not configured and should not be introduced alongside Dependabot
without one clear dependency-automation owner. Main-branch protection was not
changed; the prior repository review found it not enabled, so any future policy
should be decided by the repository owner and may require PR review, required
status checks, and the organisation's preferred history/signing rules.

Validation command:

```text
node tests/atlas/run-all.mjs
```

The full suite must be run from the committed clean branch because the review
environment deliberately injects its `BUS-TFL-COMPLETE · <short SHA>` marker
only for clean executable code. Focused BUS-GROUP, BUS-DEST, Alpha.13/14/15,
production-fidelity, calendar, legacy-isolation, and Browser/Word checks pass
with the working implementation.

## Review risks and remaining manual checks

- Review the frozen Waltham Cross diagnostic control manually in Browser and
  Word after the branch is clean, with special attention to `66`, `15`, `310`,
  `13`, `242`, `217`, `279`, `N279`, `491`, and any branch/short-working notes.
- Confirm that exact endpoint evidence is shown in Detailed Evidence and that
  unresolved or conflicting endpoints remain reviewable rather than silently
  grouped.
- Confirm that arrival-only terminal rows are absent only where a departing
  proven-terminus row exists, and that through-service/circular rows remain.
- Any future refresh, publication, deployment, or release-version change is a
  separate controlled decision and is outside this sprint.
