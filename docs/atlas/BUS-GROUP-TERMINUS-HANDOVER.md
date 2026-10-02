# BUS-GROUP + TERMINUS INTELLIGENCE handover

## Scope and identity

This sprint adds public-service grouping and conservative terminus intelligence
on top of the accepted Alpha.15 planner implementation.

| Item | Value |
|---|---|
| Accepted starting SHA | `8a013d4127d8198e1f6222941a56fca5ce26b564` |
| Working branch | `codex/atlas-bus-group-terminus` |
| Production release | `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914` |
| Data policy | No source acquisition, publication, or deployment performed |
| Frozen diagnostic control | Run `36125621080`, snapshot `8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9` |

The production release identity is unchanged. The frozen snapshot is diagnostic
only (`FROZEN_DIAGNOSTIC_EXPLICIT`, non-production eligible) and is not promoted
or treated as current data.

## BUS-GROUP-1A corrective hardening

The corrective implementation remains deliberately bounded to the accepted
BUS-GROUP / PlannerServiceGroup / TerminusDecision architecture. It does not
change Alpha.15, circular semantics, BUS-DEST ownership, the main branch, or
publication/deployment state.

### Exactness and authority

`hasResolvedExactEndpointEvidence(service, side)` is now the authoritative
BUS-GROUP gate. An evidence container, raw GTFS ID, source-retained text,
`exactMatchMethod: unresolved`, conflict, or unresolved BUS-DEST decision is
not exact. Exactness requires a resolved StopPoint identity plus an accepted
exact-match method, an accepted exact BUS-DEST decision, or the existing
authoritative TfL ordered-pattern contract. Unresolved evidence remains
auditable but cannot prove place equivalence, deduplication, terminus status,
or arrival suppression.

Provider authority is selected from explicit provider/source fields before
presentation text. Therefore `source.provider = TfL` remains TfL authority for
`TfL + BODS supplementary`; genuine BODS or TNDS fallback remains national
authority and is not promoted to TfL. The deterministic authority order is
TfL > BODS/TNDS national > other/unknown.

### Audit and calendar semantics

`PublicServiceGroupingDecision` now retains separate structured collections for
`groupedSourceRecordIds`, `deduplicatedSourceRecordIds`,
`shortWorkingRecordIds`, `branchVariantRecordIds`,
`calendarVariantRecordIds`, `variantDestinationEvidence`, and retained
ambiguous records. A branch sharing only feed lineage is not a duplicate:
duplicate evidence requires exact endpoint overlap plus shared ordered-pattern
evidence or an explicit source-authority-copy relationship. The national N279
copy remains capable of appearing in `deduplicatedSourceRecordIds`; route 66
short-working evidence does not get that label merely because it is not the
principal record.

Mixed calendar notes are evaluated against the originating service/profile
when explicit calendar evidence exists, while unqualified legacy text keeps
the existing consolidated-population safety filter. School-day, term-time,
non-school-day, holiday, weekday/weekend, and limited-service qualifications
remain visible when material. The structured `routeVariantNote` retains
route-number → destination → qualification → source-record relationships;
legacy `routeGroupNote` wording remains compatible where no relationship would
be lost, and Word also emits the attributed variant note for parity.

### Service-relevant terminus and fail-safe ambiguity

Terminus selection no longer chooses the globally most common assessed
StopArea/place. It first restricts evidence to physical stops served by the
current service/group and exact endpoint/pattern evidence, then resolves the
service-relevant assessed place. If more than one plausible service-relevant
place remains equally supported, `TerminusDecision` is
`unresolved-review`, presentation is `none`, and arrival suppression is not
applied. Circular state remains unchanged and final circular interpretation is
reserved for BUS-CIRC.

### Generic fictional controls

`tests/atlas/bus-group-stop-1a-hardening.test.mjs` uses fictional route Q1,
fictional Alpha/Beta/Gamma locations, fictional StopAreas, and a fictional
operator. It proves unresolved-vs-resolved endpoint handling, authority
precedence, duplicate/short/branch/calendar audit separation, route-attributed
calendar notes, a smaller service-relevant terminus beating an unrelated
larger StopArea, and equal-distance ambiguity with no suppression. No
production logic contains Waltham, Hertford, Harlow, Loughton, Hammond Street,
North Weald, Charing Cross, Turnpike Lane, route-number, operator, or local
StopPoint/StopArea exceptions.

The new control is included in `tests/atlas/run-all.mjs`.

## BUS-GROUP-1B semantic-family presentation

BUS-GROUP-1B adds a second, explicitly presentation-level decision after
public-service grouping: `PublicRouteFamilyDecision`. It is not a replacement
for `PublicServiceGroupingDecision`, and it never relaxes the strict
`hasResolvedExactEndpointEvidence` gate used for place identity, deduplication,
terminus proof, or arrival suppression.

The family decision records the candidate numeric stem, member route numbers,
member planner-service identities, supporting common-trunk/corridor evidence,
operator compatibility, endpoint/terminal relationships, branch/member
relationships, calendars, reasons, and one of `proven-family`,
`separate-service`, `materially-divergent-member`, or `unresolved-review`.
There is no numerical confidence field. Route-family presentation is applied
only after route-number-specific public-service components have been formed, so
13 / 13A / 13B / 13C (and any other proven family) remains a row over distinct
child services rather than an unsafe public-service merge.

Proven family rows use a concise route label such as `13 / 13A / 13B / 13C`.
Each child remains in `routeFamilyMembers` with its own destination, operator,
calendar profile, frequency lines, operating-period lines, notes, and source
IDs. Family frequency is explicitly member-attributed; no combined rate is
asserted. Browser and Word consume the same family row and structured member
evidence.

National supplementary copies have a separate `hasPublicServiceCopyEvidence`
path. It may reconcile a TfL-authoritative row with a national copy using route,
direction, shared scheduled corridor, and source-authority evidence even when
the supplementary copy lacks independently exact far-end endpoint evidence.
That evidence is retained in `publicServiceEquivalenceEvidence`; exact endpoint
place identity remains strict. Named operator identity wins planner display,
while a genuinely unknown planner operator is blank and the unresolved detail
remains auditable.

The frozen Waltham regression projection is
`tests/atlas/fixtures/bus-group-1b-waltham-regression.mjs`. It is a compact,
network-free, source-traceable projection of frozen V2 run `36125621080` and
snapshot `8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9`.
It controls 16 physical stops, 21 route numbers and 86 route×StopPoint pairs;
the current replay exposed 40 route-specific public-service groups before
terminus/family presentation and 17 final planner rows, including two proven
family presentations. The earlier accepted 1A control remains separately
recorded above; these are observed 1B before/after values, not targets.

The 1B controls cover true 50 / 50A / 50B common-trunk family evidence, false
42 / 42A same-stem separation, 70 / N70 separation, authoritative plus
supplementary source-copy reconciliation, genuine branch separation, calendar
and member-attributed frequency preservation, terminus arrival suppression,
the Waltham 13-family, 66, 242, 279/N279, 310 and 16/16C controls, and
Browser/Word parity.

The same frozen V2 prepared cache was replayed for the retained regional
controls. `before` is the route-specific public-service-group count before
terminus/family presentation; `after` is the final planner-row count.

| Frozen control | Stops | Raw services | Before | After | Proven families | Unresolved family decisions | Planner operator placeholders |
|---|---:|---:|---:|---:|---:|---:|---:|
| Cambridge | 62 | 244 | 81 | 50 | 4 | 4 | 0 |
| Birmingham | 101 | 201 | 114 | 82 | 4 | 7 | 0 |

No national dataset was acquired or rebuilt for either replay; both used the
existing frozen prepared cache only.

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

The added deterministic tests are
`tests/atlas/bus-group-terminus.test.mjs` and
`tests/atlas/bus-group-stop-1a-hardening.test.mjs`. They cover TfL plus national-source
same-public-service grouping, exact endpoint-place equivalence, `13`/`13A` and
`279`/`N279` separation, short workings, divergent branches, operator/source
authority, alternate destinations, calendar safety, physical-journey identity,
linear terminus arrival suppression, through-service, uncertain endpoints,
circular preservation, fictional generalisation, ambiguity fail-safe, and
Browser/Word parity.

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
- `13`, `13A`, `13B`, and `13C` retain distinct child-service evidence under a
  concise proven-family presentation row. `279` and `N279` remain distinct.
  `16` and `16C` retain circular presentation and are
  not forced through terminal suppression.
- Source IDs, alternate destinations, branch/short-working classifications,
  endpoint StopPoint/StopArea evidence, and the canonical departure evidence
  remain on the planner row for audit and review.

The corrected canonical replay used only the existing prepared frozen cache
for run `36125621080` and snapshot
`8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9`:

| Measure | Corrected replay |
|---|---:|
| Physical stops | 16 |
| Distinct routes | 21 |
| Route×StopPoint pairs | 86 |
| Raw prepared service records | 97 |
| Planner rows | 21 |

The corrected replay retained the requested route controls: 310, 15, 217,
279, N279 and 491 remained separate public routes with proven Waltham Cross
terminus decisions; 279 and N279 did not collapse; 13/13A/13B/13C retained
their actual source-supported destinations; 242 retained Welham Green Railway
Station and Brookfield Centre; 279 retained Manor House Station; 16/16C
remained outside terminal suppression as circular controls; and route-variant
notes retained route numbers and destinations. The canonical replay produced
19 `proven-terminus` rows and two `not-assessed-endpoint` rows; no unresolved
terminus ambiguity was silently suppressed.

### Non-Waltham frozen-source controls

These controls used the same already-prepared national snapshot and the same
700 m Full Assessment path. No fresh acquisition was made.

| Control | Site and purpose | Stops | Raw service records | Planner rows / routes | Terminus and variants | Ambiguity / retained information |
|---|---|---:|---:|---:|---|---|
| Cambridge | Cambridge city centre, `52.2053, 0.1218`; dense multi-operator interchange and ordinary/variant coverage | 62 | 244 | 50 / 40 | 35 proven termini; 30 rows with variant notes, including route 1 short/route variants and route 3 variants | 0 unresolved-review rows; route/destination relationships and service-relevant termini retained |
| Birmingham | Birmingham city centre, `52.4796, -1.9026`; different region/operator mix with termini and short/route variants | 101 | 201 | 82 / 56 | 36 proven termini; 38 rows with variant notes, including routes 2, 4A, 5, 6, 9 and 10 | 0 unresolved-review rows; planner information retained without Waltham-specific rules |

The controls demonstrate the same generic domain rules outside Waltham. A
missing/unsupported endpoint remains `not-assessed-endpoint` rather than being
invented as a terminus; it is not an ambiguity claim and does not trigger
suppression.

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
