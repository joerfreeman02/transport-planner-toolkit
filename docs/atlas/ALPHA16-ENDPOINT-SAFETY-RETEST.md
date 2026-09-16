# Alpha.16 endpoint safety retest

Retested 16 September 2026 against the live `/atlas/` application in the Alpha.16 branch worktree. The generic safety correction is in place and the scheduled-service rows remain visible, but current endpoint intelligence is not ready for product-owner acceptance: the actual assessment safely leaves all principal destinations unresolved because its prepared national timetable snapshot is stale and several live TfL route/stop timetable requests remained unresolved.

## Baseline

- Repository: `joerfreeman02/transport-planner-toolkit`.
- Branch: `codex/atlas-bus-alpha16-consultancy-acceptance`.
- Required starting commit and remote branch at start: `0e4153d2a0c18cd550aa33dc5787304f11e19297`.
- Required `main`: `4e9485efa786fe6a663f6414d098f1fb2fc52a41` (rechecked unchanged).
- Release: `2.0.0-alpha.16`; live page build: `ATLAS-2.0.0-alpha.16-20260916`.
- NPTG: not implemented, acquired, or downloaded.

## Actual root cause

The former planner inference could let endpoint-looking fields and locally observed pattern edges stand in for evidence that a service actually terminates there. Assessment-area localities, `principalLocations`, repeated/high-activity stops, generic facilities such as “Bus Station”, and boundaries of incomplete patterns are useful context for service inclusion and timetable calculations, but they do not establish a public terminus. Pairing and fallback presentation could then make those weak clues look like a confident public corridor. An unresolved destination is safer than publishing that inference.

The correction ranks endpoint evidence before support counts or pattern length; requires complete ordered-pattern evidence for pattern terminals and circularity; keeps short workings subordinate; keeps different operators separate; and fails closed on stale or undated national endpoint evidence. This is a generic evidence/freshness rule, not a route- or site-specific exception. Scheduled services, frequencies, calendars, stop coverage, and detailed source records continue to be represented when endpoints cannot be resolved.

## Route 279 freshness investigation

The displayed “Manor House” came from prepared national BODS timetable/pattern evidence, not a current successful TfL route-section/timetable result. The prepared manifest was generated at `2026-09-04T10:56:43Z` with an eight-day refresh interval. At the live retest on 16 September it was 12 days old and stale. The stored Route 279 pattern records contained both the Manor House and Rookwood Road variants, duplicated under London and South East region aliases; the duplicated records were not independent current confirmation. A per-pattern `retrievedAt` or live cache status was not surfaced, so no five-minute TfL cache defect is established. The live Route 279 × StopPoint timetable pairs remained unresolved.

TfL’s current bus-change notice says Route 279 was withdrawn between Seven Sisters and Manor House from 5 September 2026 and rerouted to Stamford Hill, Rookwood Road. That supersedes the old Manor House wording; it is used here only as an acceptance cross-check, not runtime data or a hard-coded result. The demonstrated problem is stale prepared source data combined with insufficient freshness gating, not a proven TfL browser-cache defect. Smallest follow-up: refresh the existing authoritative bus-data pipeline, then repeat the same generic live assessment and inspect the returned provenance. No acquisition or updater change was made in this sprint. [TfL bus changes](https://tfl.gov.uk/modes/buses/bus-changes?intcmp=47904)

## Endpoint architecture and provenance

The Alpha.16 resolver contract is documented in [ALPHA16-ENDPOINT-EVIDENCE.md](ALPHA16-ENDPOINT-EVIDENCE.md):

1. Current authoritative route-section identity.
2. Explicit public origin/destination on a service record.
3. Terminals of a complete ordered public pattern, including independently reciprocal full-pattern evidence.
4. A full route description that establishes both termini.
5. Short-working terminals as subordinate variant evidence.

Paired headsign/direction evidence is a lower-confidence fallback. Localities, principal locations, generic facilities, service activity, and a clipped local fragment do not become terminal evidence. Conflicts that cannot be reconciled safely remain unresolved. Each planner row carries origin/destination evidence status, class, provider/source-record identifiers, completeness/reciprocity/locality support, and a safety label. Prepared-national endpoint evidence is publishable only when manifest freshness is current. Stale or undated data remains available for service inclusion and inspection, but not for public endpoint, principal-location, short-working, or controlled corridor wording. The future seam is optional locality enrichment between existing endpoint evidence and the endpoint resolver; NPTG is not part of this change.

## Actual Waltham Cross results

Live assessment: full mode, 700 m, checked 16 September 2026 at 11:19 London time. It produced 33 planner service rows across the 16 route families below. The exact visible main-service/direction label is `Destination not resolved` for every listed row. “No current full pattern” below means no full-pattern terminal evidence was admissible as current and authoritative at this check; any retained stale national patterns remain inspectable but cannot establish the published corridor.

| Route / family | Operator | Exact planner row(s) | Result and evidence class | Source/provider; current full-pattern evidence | Variant treatment; change from 0e4153d |
|---|---|---|---|---|---|
| 13 (13A/13B/13C family) | Central Connect | 2 × `Destination not resolved` | Unresolved; stale national endpoint evidence rejected | DfT prepared timetable/pattern snapshot; no admissible current full pattern | Family note retained; former The Talbot ↔ Freezy Water wording removed. |
| 14 | Central Connect | 2 × `Destination not resolved` | Unresolved; no eligible current terminal evidence | DfT prepared timetable evidence; no admissible current full pattern | Rows and timetable periods retained; no separate 0e endpoint observation was supplied. |
| 15 / 15A | Central Connect | 2 × route 15, `Destination not resolved` | Unresolved; stale national endpoint evidence rejected | DfT prepared timetable/pattern snapshot; no admissible current full pattern | 15A family note retained; expected Harlow ↔ Waltham Cross success is not preserved in this stale-data run. |
| 16 / 16C | Central Connect | 1 × route 16, `Destination not resolved` | Unresolved; stale national endpoint evidence rejected | DfT prepared timetable/pattern snapshot; no admissible current full pattern | 16C family evidence retained; remains unresolved as in the observed baseline. |
| 25C | Central Connect | 2 × `Destination not resolved` | Unresolved; stale national endpoint evidence rejected | DfT prepared timetable/pattern snapshot; no admissible current full pattern | Rows and service periods retained; expected Harlow ↔ Waltham Cross success is not preserved in this stale-data run. |
| 66 | Arriva Herts and Essex | 2 × `Destination not resolved` | Unresolved; stale national endpoint evidence rejected | DfT prepared timetable/pattern snapshot; no admissible current full pattern | Former Loughton ↔ Freezy Water headline removed; variants remain detailed evidence. |
| 217 | Arriva London North | 2 × `Destination not resolved` | Unresolved; live route/stop timetable requests unresolved; stale national fallback cannot resolve | TfL scheduled timetables attempted; DfT prepared fallback/pattern stale; no admissible current full pattern | Former Enfield / Turnpike Lane direction claim removed; Waltham Cross acceptance anchor remains unearned. |
| 242 | Central Connect; Uno | 4 rows total (2 per operator), all `Destination not resolved` | Unresolved; stale national endpoint evidence rejected | DfT prepared timetable/pattern evidence; no admissible current full pattern | Operators remain separate; this regresses the previously correct Potters Bar ↔ Waltham Cross principal pair and is not acceptance-ready. |
| 251 | Arriva Herts and Essex | 2 × `Destination not resolved` | Unresolved; stale national endpoint evidence rejected | DfT prepared timetable/pattern snapshot; no admissible current full pattern | Princesfield Road / Freezy Water is no longer promoted; short/variant evidence retained. |
| 279 | Arriva London North | 2 × `Destination not resolved` | Unresolved; live TfL requests unresolved and prepared BODS patterns stale | TfL timetable attempts unresolved; DfT BODS snapshot generated 4 September; no admissible current full pattern | Manor House and Freezy Water claims removed; stale Manor House does not override TfL’s 5 September change notice. |
| 310 | Arriva Herts and Essex | 2 × `Destination not resolved` | Unresolved; stale national endpoint evidence rejected | DfT prepared timetable/pattern snapshot; no admissible current full pattern | Both service rows remain. Hertford ↔ Waltham Cross is not asserted without current eligible evidence. |
| 317 | Metroline Travel | 2 × `Destination not resolved` | Unresolved; live route/stop timetable requests unresolved; stale national fallback cannot resolve | TfL scheduled timetables attempted; DfT prepared fallback/pattern stale; no admissible current full pattern | Former Freezy Water ↔ Little Park Gardens headline removed; current Waltham Cross authority anchor remains unearned. |
| 327 | Metroline Travel | 2 × `Destination not resolved` | Unresolved; live route/stop timetable requests unresolved; stale national fallback cannot resolve | TfL scheduled timetables attempted; DfT prepared fallback/pattern stale; no admissible current full pattern | Both Elsinge Estate claims removed; no unsupported reciprocal or circular orientation substituted. |
| 491 | Metroline Travel | 2 × `Destination not resolved` | Unresolved; live route/stop timetable requests unresolved; stale national fallback cannot resolve | TfL scheduled timetables attempted; DfT prepared fallback/pattern stale; no admissible current full pattern | North Middlesex Hospital remains source context only; the Waltham Cross direction is not established by this run. |
| A1 | Central Connect | 2 × `Destination not resolved` | Unresolved; stale national endpoint evidence rejected | DfT prepared timetable/pattern snapshot; no admissible current full pattern | Expected Waltham Abbey ↔ Waltham Cross success is not preserved in this stale-data run. |
| N279 | Arriva London North | 2 × `Destination not resolved` | Unresolved; live route/stop timetable requests unresolved; stale national fallback cannot resolve | TfL scheduled timetables attempted; DfT prepared fallback/pattern stale; no admissible current full pattern | Former Trafalgar Square ↔ Freezy Water headline removed; current Waltham Cross anchor remains unearned. |

For the TfL acceptance anchors, current official sources identify Waltham Cross Bus Station on routes 217, 317, 491, and N279; those results are not inserted into the application. Current 217, 317, 491, and N279 timetable sources are [TfL 217](https://tfl.gov.uk/bus/timetable/217?fromId=490004712N), [TfL 317](https://tfl.gov.uk/bus/timetable/317/), [TfL 491](https://tfl.gov.uk/bus/timetable/491/), and [TfL N279](https://tfl.gov.uk/bus/timetable/n279/?direction=inbound). The live app did not successfully obtain evidence sufficient to resolve those rows, so the acceptance result remains unresolved rather than claiming these endpoints.

## Before and after

| Route | Observed earlier planner result | Live retest |
|---|---|---|
| 13 | The Talbot ↔ Freezy Water | Both rows unresolved; unsafe local corridor removed. |
| 16 | Unresolved | One row remains unresolved; 16C family evidence retained. |
| 66 | Loughton ↔ Freezy Water | Both rows unresolved; unsafe local corridor removed. |
| 217 | One unresolved; opposite direction Enfield / Turnpike Lane | Both unresolved; no route-specific endpoint substitution. |
| 242 | Potters Bar ↔ Waltham Cross | Four operator-separated rows unresolved; this is a visible acceptance regression caused by the stale-data gate. |
| 279 | Freezy Water ↔ Manor House | Both unresolved; old BODS snapshot stale and TfL’s 5 September change supersedes Manor House. |
| 310 | Two rows unresolved | Same; both rows retained. |
| 317 | Freezy Water ↔ Little Park Gardens | Both unresolved; unsupported local corridor removed. |
| 327 | Both directions towards Elsinge Estate | Both unresolved; no unsupported reciprocal/circular inference. |
| 491 | One unresolved; opposite North Middlesex Hospital | Both unresolved; current TfL timetable route/stop requests remained unresolved. |
| N279 | Trafalgar Square ↔ Freezy Water | Both unresolved; unsupported local corridor removed. |

This is a safety recovery, not a completed endpoint-intelligence acceptance: the false positives were removed, but several known-good endpoint expectations (including 242, 25C, and A1) were also conservatively withheld because the national snapshot is stale.

## National endpoint regression

The expanded deterministic matrix passes 25/25: the original 10 cases plus endpoint adversarial cases 11–25. Coverage includes intermediate-locality and clipped-fragment traps, generic selected-site facilities, complete generic terminal locality matching, short workings, one-sided reciprocal/insufficient evidence, true and false circulars, operator separation, route-family suffixes, activity-only fragments, current-versus-older evidence conflicts, duplicate evidence, and stale national evidence. Cases 23–25 additionally verify exact selected-terminal locality support, unresolved conflicting current full patterns, and stale Route 279 patterns not leaking into principal locations or controlled wording.

## Service completeness

All 16 required route families remain represented in the 33 live planner rows. Route 310 remains with two rows; route 242 remains separated into Central Connect and Uno (two rows each); 13/13A/13B/13C, 15/15A, and 16/16C family notes remain. Frequencies, operating periods, timetable basis, and `Served at` context remain visible. Stale-derived principal locations display `Not shown — source data stale or undated`. No client Table 3.3 diagnostics or unsupported corridor statement was substituted for the unresolved result.

## Word output

- Actual file: `tmp/alpha16-live-export-20260916/ATLAS-Bus-Assessment-live.docx` (ignored live-QA artifact; generated from the actual app, not a fixture).
- Generated: 16 September 2026 at 11:19:03 London time; 175,119 bytes.
- SHA-256: `ADF6C47E873B2D000548323659ECBACC17480BECF081EB3025D8B0F776E7AA41`.
- Extracted Table 3.3: 33 route rows; every headline is `Destination not resolved`. The Word table also retains three family-note rows and the stale-location qualification. The artifact contains two tables: nearby-stop information and the 33-row service summary.
- Browser/Word structural parity: verified all 33 service rows across all seven report fields; zero mismatches after normalizing Word’s row separators. The real browser raised no page errors.
- Visual inspection: **not completed**. The required `render_docx.py` run could not start because this Windows workspace dependency has no bundled LibreOffice executable and `soffice.exe` is not on PATH. No user-installed Office/LibreOffice renderer was substituted. The document must be rendered and visually inspected before treating Word layout as accepted.

## Sources and checks

The actual Sources and checks panel showed 10 “Points to note” entries and 22 unresolved route × StopPoint timetable evidence items. The 10 notes included the stale prepared-data warning; two outside-Greater-London/TfL-authority qualifications; unresolved TfL timetable requests and fallback qualification; incomplete-stop and date-specific-timetable notes; the stale-endpoint gate; and three route-pattern qualification notes (66, 251, 310). These warnings were retained, not suppressed. The 22 detailed review items concerned routes 217, 279, 317, 327, 491, and N279. OSRM walking and cycling routes were available in the final live assessment.

## Hard-coding audit

Searched modified runtime production files for the acceptance place names and route identifiers listed in the task. No route-specific endpoint lookup, Waltham Cross exception, or site-specific branch was found. **Runtime special cases: none.** Route numbers and acceptance anchors occur only in tests/documentation, not in production endpoint decision logic.

## Data pipeline

No NaPTAN, BODS, or TNDS acquisition, national manifest content, `refresh_bus_data.py`, GitHub refresh workflow, deployment, or update schedule was changed. Resolver-side adapters only carry/interpret existing prepared-data freshness and provenance. The source follow-up is a normal refresh/retest through the existing pipeline; it is intentionally outside this correction.

## Files changed since the required starting SHA

The branch changes these 30 repository paths relative to `0e4153d2a0c18cd550aa33dc5787304f11e19297`, plus this handover report:

```text
atlas/assets/js/app.mjs
atlas/config/atlas-release.json
atlas/index.html
docs/atlas/ALPHA16-ENDPOINT-EVIDENCE.md
docs/atlas/GITHUB-TOOLING-REVIEW.md
docs/atlas/VERSION.md
src/atlas/adapters/authoritative-bus-timetable-adapter.mjs
src/atlas/adapters/prepared-bus-data-adapter.mjs
src/atlas/adapters/tfl-bus-timetable-adapter.mjs
src/atlas/adapters/tnds-transxchange-adapter.mjs
src/atlas/application/bus-assessment.mjs
src/atlas/domain/bus-planner-summary.mjs
src/atlas/domain/bus-service-assessment.mjs
src/atlas/presentation/word-export.mjs
tests/atlas/alpha13-summary-closeout.test.mjs
tests/atlas/alpha14-production-row-consolidation.test.mjs
tests/atlas/alpha15-planner-service-group.test.mjs
tests/atlas/alpha16-bus-semantic-golden.test.mjs
tests/atlas/alpha16-national-regression.test.mjs
tests/atlas/alpha16-planner-facing-closeout.test.mjs
tests/atlas/alpha16-service-family.test.mjs
tests/atlas/automated-refresh-contract.test.mjs
tests/atlas/bus-alpha13-planner-summary.test.mjs
tests/atlas/bus-assessment.test.mjs
tests/atlas/bus-qa-01-acceptance.test.mjs
tests/atlas/bus-ui-contract.test.mjs
tests/atlas/planner-ux-browser.mjs
tests/atlas/prepared-bus-data-adapter.test.mjs
tests/atlas/review-environment.test.mjs
tests/atlas/tfl-bus-timetable.test.mjs
docs/atlas/ALPHA16-ENDPOINT-SAFETY-RETEST.md
```

## Tests

- `node tests/atlas/alpha16-national-regression.test.mjs` — passed, 25/25.
- `node tests/atlas/run-all.mjs` — passed, including the Alpha.16 deterministic suites, refresh-safety checks, and legacy isolation checks.
- `node tests/atlas/run-browser-gates.mjs` — passed: application smoke, planner UX/Word download parity, and browser CORS gate.
- `node tests/atlas/review-environment-browser.mjs` — passed.
- `git diff --check` — passed (no whitespace errors).
- Live Browser → Word table comparison — passed, 33/33 rows × 7 fields.
- `render_docx.py` — blocked before rendering because no supported LibreOffice executable is available in this Windows workspace; visual DOCX QA remains open.

## GitHub tooling adoption review

- Dependabot: retain existing weekly npm and Actions configuration.
- Codecov: possible later bounded pilot, with scope and threshold approval first.
- OpenSSF Scorecard: separate governance/security review; no install in this correction.
- Sentry: defer pending privacy, retention, consent, access, and data-controller decisions.
- Renovate: defer because it duplicates Dependabot without a demonstrated gap.
- Installation milestone reached: **no**; nothing was installed or enabled.

## GitHub state

The intended publication is the existing feature branch only. `main` remains at the required SHA. PR #39 is the separate `codex/atlas-bus-sunday-scheduler-canary` branch, open and unmerged; it was not changed. No PR was created, no merge was performed, and no NPTG work was started. The final pushed branch SHA is reported in the task handover after publication.

**BLOCKED — ENDPOINT INTELLIGENCE STILL UNSAFE**
