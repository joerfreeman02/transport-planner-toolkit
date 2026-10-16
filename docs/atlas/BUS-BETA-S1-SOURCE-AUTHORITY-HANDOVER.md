# BUS-BETA-S1 — Site-scoped source authority handover

Date: 2026-10-16
Status: Engineering implementation complete; Technical Director review and manual acceptance pending
Branch: `codex/atlas-bus-beta-s1-site-source-authority`
Starting SHA: `e7a5c6125416ff11433e622e561e04d03d6ecf09`
Version/build: `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`

## Architecture implemented

The prepared-data flow remains BODS and TNDS local StopPoint shards → `mergeBusTimetableSources` → existing service and planner intelligence → browser summary and existing Word export. No prepared-data schema rewrite was required. Direct TfL authority and its existing iBus enrichment remain outside the changed arbitration logic.

## Source arbitration contract

The arbitration component only sees records scoped to selected eligible local StopPoints. A TNDS record is suppressed in favour of BODS only when both records have the same normalized public route, the same non-empty local called StopPoint set, the same normalized operator, positive compatible direction/corridor evidence, and no conflicting circular classification. Ordered origin/destination pairs must agree where present. If the evidence is incomplete or conflicts, both records are retained. Route number alone is never an equivalence key.

Equivalent local evidence contributes only the BODS timetable, avoiding duplicate planner input and frequency. Exact local TNDS evidence with no equivalent usable BODS local record remains available to the planner, including a TNDS-only local service. Existing source completeness and shard diagnostics remain internal and fail closed; this change does not infer that an unresolved BODS raw stop is physically local.

## Provenance and outputs

Each planner summary now retains a primary source label selected by authority (`TfL`, `BODS`, then `TNDS`), and the browser's Table 3.3 shows that label in a compact Source column. Existing route data and source detail remain available. The Word export contract is unchanged and has no source column or technical source warnings. No new planner-facing warning text was added.

## Files changed

- `src/atlas/domain/bus-timetable-merge.mjs` — conservative local equivalence and BODS-first arbitration.
- `src/atlas/domain/bus-planner-summary.mjs` — primary source provenance on planner rows.
- `atlas/index.html`, `atlas/assets/js/app.mjs`, `atlas/assets/css/atlas-shell.css` — browser Source column and badge.
- `tests/atlas/bus-timetable-merge.test.mjs`, `tests/atlas/run-all.mjs` — arbitration and provenance contract coverage.
- `tests/atlas/bus-ui-contract.test.mjs`, `tests/atlas/bus-word-export.test.mjs` — browser label and Word source-neutrality assertions.
- `docs/adr/ADR-015-bus-timetable-source-authority-and-site-supplementation.md`, `docs/adr/README.md` — source authority decision.
- `docs/atlas/BUS-BETA-S1-SOURCE-AUTHORITY-HANDOVER.md` — this handover.

## Verification

Exact tests run:

- `node tests/atlas/bus-timetable-merge.test.mjs` — passed.
- `node tests/atlas/prepared-bus-data-adapter.test.mjs` — 13 passed.
- `node tests/atlas/alpha15-production-fidelity.test.mjs` — passed; existing Alpha.14 red/Alpha.15 green replay (25C, 66, 242, 310, A1 and 317).
- `node tests/atlas/alpha15-planner-service-group.test.mjs` — passed.
- `node tests/atlas/bus-ui-contract.test.mjs` — passed.
- `node tests/atlas/bus-word-export.test.mjs` — passed.
- `node tests/atlas/run-all.mjs` — passed, `ATLAS Alpha.15 deterministic suite passed.` The sandbox initially blocked one temp-directory rename; rerunning with the required execution permission completed successfully.
- `node tests/atlas/bus-data-prep-1-c2-control-runtime-proof.mjs '..\\work\\atlas-bus-data-prep-1-c1-coverage-semantics-candidate-final' PE1-2TL-HISTORIC` — passed against the preserved matching BODS snapshot (`a23523…`): complete assessment, 191 source records, 126 service summaries, 40 planner rows, no failed shards or review items.
- `node tests/atlas/bus-data-prep-1-c2-control-runtime-proof.mjs '..\\work\\atlas-bus-data-prep-1-c1-coverage-semantics-candidate-final' QUEENSGATE-0590B` — passed against the same snapshot: complete assessment, 157 source records, 96 service summaries, 38 planner rows, no failed shards or review items; all four BCE infrastructure records are `timetableCallEligible: false` and `NOT_A_TIMETABLE_CALL_POINT` at PE1; Queensgate runtime control confirms the BCE non-call rule.

The full deterministic suite also passed Alpha.13/14/15 planner and Browser/Word parity controls, BUS-QA-01/02/03, BUS-CIRC (including Waltham and Pipers fixtures), TfL operating-period and authority regressions, GROUP/DEST/endpoint alias tests, and school-day/calendar tests. The Waltham Cross production replay passed through the Alpha.15 fidelity fixture. The existing regression suite exercises Chingford routes 357/444/W16 and school-day 657; a separate physical-site Chingford runtime replay was not available in this bounded fixture set.

## Known limitations and exclusions

- The accepted C2 control script is pinned to BODS aggregate `a23523…`. The sprint baseline's packaged manifest has `1afc9b…`; controls therefore used the preserved C1 candidate at the accepted hash. The baseline's packaged data was not rewritten.
- Exact StopPoint recovery can establish a service only when prepared TNDS evidence independently calls that exact eligible local StopPoint. An unresolved raw BODS stop cannot be mapped to a physical local StopPoint without deterministic evidence; no fuzzy recovery is attempted.
- Equivalence is deliberately conservative. Different or unreported operator/direction evidence may retain two records even when they later appear related. Review fixtures can guide a bounded refinement if that creates a demonstrated production issue.
- No national PRIMARY↔TNDS identity bridge, fuzzy stop matching, user-facing data warning, live source reacquisition, TfL authority change, planner-intelligence redesign, version change, Beta declaration, release, or R46-I1 evidence edit was made.

## GitHub tooling adoption review

- Dependabot: configured; no change in this sprint.
- Codecov: deferred pending a formal coverage baseline.
- OpenSSF Scorecard: later release/security milestone.
- Sentry: deferred pending telemetry/privacy architecture.
- Renovate: no duplicate installation alongside Dependabot.

No tooling installation milestone was reached; no Technical Director tooling action is required.

## Next step

Technical Director review of ADR-015 and this source arbitration boundary, followed by Joe Freeman's manual acceptance of the browser source labels and the bounded site controls. Keep version `2.0.0-alpha.15` / build `ATLAS-2.0.0-alpha.15-20260914`; do not declare Beta or dispatch BUS-BETA-S2 before that review and acceptance.
