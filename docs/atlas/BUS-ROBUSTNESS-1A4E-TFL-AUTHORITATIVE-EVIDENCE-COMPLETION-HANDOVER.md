# BUS-ROBUSTNESS-1A4E — TfL Authoritative Evidence Completion Handover

## Delivery state

- Repository: `transport-planner-toolkit`.
- Branch: `codex/atlas-bus-tfl-authoritative-evidence-completion`.
- Worktree: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\atlas-bus-tfl-authoritative-evidence-completion`.
- Baseline: `01ef6769375b5288685e2486c66f50f469177075`.
- Implementation commit before this handover/test follow-up: `ca1b0e6f23907dd53546ad617f95126e1d9b3795`.
- Final tip: the final commit containing this handover; the exact full SHA is reported in the delivery message (a commit cannot include its own object ID in its tree).
- Formal version remains `2.0.0-alpha.15`.
- Remote parity: not checked and branch not pushed; this sprint request prohibited merge/deploy but did not request a push. No remote branch state is claimed.
- Worktree is expected clean after the final commit and full-suite run; verify at handover.
- No fresh national acquisition, TNDS activation, or bustimes.org runtime dependency was used.
- Frozen national snapshot: `36125621080` (prepared diagnostic review data; no fresh national data).

## Exact changed files

Implementation commit `ca1b0e6` changed:

- `src/atlas/adapters/tfl-bus-timetable-adapter.mjs`
- `src/atlas/adapters/authoritative-bus-timetable-adapter.mjs`
- `src/atlas/domain/bus-service-assessment.mjs`
- `src/atlas/domain/planner-endpoint-decision.mjs`
- `tests/atlas/run-all.mjs`
- `tests/atlas/tfl-bus-timetable.test.mjs`
- `tests/atlas/tfl-route-sequence-sidecar.test.mjs`

The completion commit additionally changes:

- `src/atlas/adapters/tfl-bus-timetable-adapter.mjs` (allow missing endpoint fields to be completed only from an exact complete ordered pattern match; explicit conflicts still fail closed).
- `tests/atlas/tfl-bus-timetable.test.mjs` (positive absent-origin case, duplicate-branch ambiguity, exact-endpoint conflict protection).
- `docs/atlas/BUS-ROBUSTNESS-1A4E-TFL-AUTHORITATIVE-EVIDENCE-COMPLETION-HANDOVER.md`.

No other files are intended to change.

## Architecture and safety boundary

```text
TfL timetable adapter ── timetable services + existing GROUP/CIRC inputs ──┐
                                                                          ├─ service assessment ── planner + Word
TfL Route/Sequence adapter ── tflRouteSequenceEvidence sidecar ────────────┘
                                      │
                                      └─ endpoint decision only when the complete
                                         ordered StopPoint pattern links exactly
```

`routeSequencesForLineDirections` lives at the TfL adapter boundary. The application adapter requests it after timetable composition, deduplicated by line, direction, and service-type set, and attaches its result as `tflRouteSequenceEvidence`. The service-assessment layer retains that separate evidence. Endpoint decision code consumes its endpoint IDs only when status is `resolved`.

The sidecar is not merged into `routePatternStopIds`, circular pattern, service-family/grouping fields, principal ranking, frequency, operating-period, calendar, or source-authority inputs. `tests/atlas/tfl-route-sequence-sidecar.test.mjs` compares those public fields before/after sidecar addition and asserts principal route 13 and subordinate 13C remain unchanged. This is the GROUP/CIRC separation proof; route-sequence data is not a GROUP or CIRC input.

### Requests, cache, failure, and provenance

- Official endpoint: `GET https://api.tfl.gov.uk/Line/{id}/Route/Sequence/{direction}?serviceTypes=Regular,Night` (service types are part of request identity).
- Parsing retains ordered exact StopPoint IDs, stop names, direction, branch ID, service type, source sequence index, and line identity. Sequences are not flattened together.
- Duplicate requests within the assessment are collapsed; concurrent identical requests are coalesced; cached success is reused for five minutes.
- Provenance records endpoint, source, authoritative scope, line/direction/service types, retrieved time, HTTP status, request count, cache status, unique request count, deduplicated reuse, failures, and ambiguous matches. Cache hits do not inflate network request counts.
- Invalid/mismatched responses and failed lookups cannot produce endpoint IDs. Unlinked or multiple candidate sequences remain ambiguous. No endpoint is inferred from route number, names, or convenience.
- The complete ordered timetable pattern must match the sequence exactly and contain the assessed stop. If the timetable origin/destination is already supplied, it must agree. Thus a genuinely absent origin can be hydrated for a fully matching pattern without overriding a conflicting exact endpoint.

## 313 origin forensic result

### Before

The preceding 1A4D live Enfield replay recorded two origin review items at `490001101K` and `490001101N`. For the current live replay, the timetable route/pattern is corridor-clipped and its generic origin does not carry the exact full ordered line sequence needed to identify a timetable-specific branch. The checked inputs included the TfL timetable response, line route metadata, direction, service lineage, destination evidence, current origin evidence, route-pattern StopPoint IDs, reverse-direction data, and supplementary national evidence. The supplementary source remained secondary under existing TfL authority rules.

### Authoritative sequence found; link not proven

TfL's official route-sequence endpoint returned one Regular sequence per direction for line 313 in the observed response. The outbound sequence runs Chingford Station to Dame Alice Owen's School and includes intermediate Potters Bar-area StopPoints; the inbound sequence is reversed and includes the Enfield StopPoints. It is line/direction evidence, not a demonstrated timetable-specific branch mapping. A single full line sequence cannot prove which endpoint belongs to each corridor-clipped service pattern. Applying it would risk promoting the school extension or selecting an origin based on route number alone.

Accordingly, the requested 313 origin completion is **not achieved** for the live records. Exact endpoint IDs were not hydrated for the 313 items. Potters Bar Railway Station remains the ordinary principal destination; Dame Alice Owen's School remains separate additional/restricted-service evidence; Crown Road (EN1) remains a named short-working note. This is not a claim that all individual journeys have been resolved from the route-sequence evidence.

The synthetic focused test proves a previously absent origin can resolve when a complete ordered timetable pattern matches exactly. It does not make the live clipped 313 records match.

## Operator identity forensic result

Repository/source-path inspection and the live records did not find an already ingested authoritative, date-valid, service-lineage-aware operator identity path that deterministically supplies every affected TfL pattern. TfL schedule and route/sequence responses observed here do not include a contracted-operator field. Supplementary BODS evidence supplies an operator for some services (for example one 191 direction) but not consistently for 313/317 and cannot be promoted over conflicting TfL authority.

The operator remains absent in the live planner rows for the affected patterns: 191 has one direction with no operator and one with Arriva London; both 313 rows and both 317 rows have no operator. Blank values remain visible; no operator is guessed and no operator warning is represented as resolved. Existing tests retain the unresolved/ambiguous case and do not manufacture an identity.

Recommended source, not added in this sprint: TfL iBus Static Data at [ibus.data.tfl.gov.uk](https://ibus.data.tfl.gov.uk/), including the dated `Base_Version.xml` and operator/schedule/pattern data. The relevant data model exposes `Block.Operator_Code` and the corresponding operator-name record. A bounded follow-up would pin one coherent base version, link the exact dated TfL timetable journey/pattern to its block and operator, and carry validity dates plus source version, retrieval time, archive checksum/ETag, exact service lineage, and ambiguity state. TfL documents that static data is generally refreshed about fortnightly and has validity windows; records from different base versions must not be mixed. This source expansion was deliberately not implemented because the sprint explicitly requires stopping where the approved architecture lacks the needed source.

Official references: [TfL iBus static-data documentation](https://ibus.data.tfl.gov.uk/ibus-static-data-documentation.pdf); [TfL Unified API](https://tfl.gov.uk/info-for/open-data-users/unified-api?intcmp=29422); [TfL bus tender search](https://tfl.gov.uk/forms/13923.aspx). The tender search is useful contract evidence but is not a demonstrated exact journey-to-operator mapping for these service patterns.

## Enfield variant replay

The 9 October 2026 live Enfield Town / 250 m V2 assessment retained 24 planner service summaries and showed these actual route-pattern results for the previously generic-note routes:

| Route | Current classification from replay | Planner-facing result |
|---|---|---|
| 192 | Two ordinary opposite-direction patterns; no alternate structural endpoint established by this replay | Both directions retained; no generic variant note and no dagger |
| 231 | Two ordinary opposite-direction public-service patterns; no generic alternate-endpoint note | Both directions retained |
| 317 | Two ordinary directions; endpoint/origin quality remains dependent on exact evidence | Both directions retained; operator blank; no generic variant note |
| 329 | One observed direction at the assessed point; no distinct structural alternate evidenced | Ordinary direction retained; no generic note |
| 377 | One observed direction; Sunday has no scheduled service | Calendar/period evidence, not a structural alternate; no generic note |
| N29 | One night direction toward Trafalgar Square / Charing Cross | Named direction retained; no generic note |
| W8 | One observed direction, marked † under the existing separate-timetable rule | Existing timetable qualification retained; no generic note |

No route in this list was classified as a newly proven alternate origin or true short working from the live review data. That absence is not proof that no off-corridor journey exists; the replay only supports the classification stated. The known named 313 Crown Road short working remains. The phrase “Additional short workings and timetable variants operate.” did not appear in the exported report. Browser and Word use the shared planner summaries; Word export was generated from the live assessment and retained the same 313 additional-service and named Crown Road short-working labels.

## Live Enfield result and remaining review items

- Replay: same Enfield Town Station coordinate (`51.6523584, -0.0783252`), 250 m radius, V2 diagnostic route, prepared snapshot `36125621080`; no fresh national acquisition.
- HTTP: diagnostic review server at `http://127.0.0.1:8771/atlas/?review=v2#modules` returned the current page. Visible header was `BUS-TFL-COMPLETE · ca1b0e6` on alpha.15. This was a diagnostic build, not a final acceptance build.
- Result: “Assessment complete”; 13 ordinary stop records; one “Other nearby stop records — no route information currently available” record remains separate; 24 planner service summaries; 14 distinct route numbers in the route inventory.
- Word export: `ATLAS Bus Assessment (7).docx`, exported 9 October 2026 at 11:15; its route rows and 313 additional/short-working notes were inspected. No document was edited.
- Enfield evidence-item count before this sprint's replay: 2 (the 1A4D K/N items).
- Enfield evidence-item count after: 4.

All four current Category-C review items are:

1. Route 313, StopPoint `490001101K`: origin endpoint decision requires review; generic source endpoint retained because no exact endpoint identity was available.
2. Route 313, StopPoint `490008903E`: same unresolved exact-origin issue.
3. Route 313, StopPoint `490008903W`: same unresolved exact-origin issue.
4. Route 313, StopPoint `490001101N`: same unresolved exact-origin issue.

The review UI also notes a TfL/supplementary-national route identity conflict for one or more London services; TfL schedule authority was retained. Separately, the page reports that structured frequency/operating-period boundaries were retained without synthesizing departures. These points do not clear the four exact-origin review items.

For each origin item, the unknown is the exact branch-specific origin StopPoint for this timetable service. The TfL timetable/route metadata and the official direction sequence were checked; available line-level sequences do not bind the corridor-clipped timetable pattern to a unique branch endpoint, and supplementary evidence does not resolve the conflict under current authority rules. A planner could manually open TfL's official route/timetable detail and establish which branch applies to the specific scheduled journey/service before relying on that origin. This is routine official public-data research, so the product acceptance target is not met: **NOT READY**.

The required bounded live Chingford/Normanshire and Waltham Cross controls were not run because the sprint makes them conditional on a clean Enfield result. No final clean Product Owner review build was launched or left running. Stop the task's diagnostic server during closeout; do not use the older unrelated review servers as evidence.

## Regression matrix and test status

Focused deterministic route-sequence tests cover ordered exact-ID parsing, line/direction mismatch, empty sequences, exact ordered pattern linking, absent endpoint completion for a complete exact pattern, conflicting existing destination protection, duplicate matching branches remaining ambiguous, request deduplication, cache reuse, request counts, failed/invalid responses, and bounded total TfL requests. The dedicated sidecar test proves GROUP-facing pattern and principal/subordinate family isolation.

The full alpha.15 suite includes the previous 1A4, 1A4A, 1A4B, 1A4C, 1A4D, GROUP, DEST, CIRC, endpoint-alias, calendar/term-time, TfL source-authority, school-only, browser/Word, and operating-period controls. A sandboxed attempt stopped at the legacy-isolation guard because child `git init` received `EPERM`; that attempt is not counted. The suite was rerun against clean commit `c40c26ff066de0a6335d6c7e6cc54648126c4010` with process-spawn permission. It exited 0 and ended exactly `ATLAS Alpha.15 deterministic suite passed.` The final follow-up commit changes only this handover's recorded result; the suite is rerun after it as the final clean verification.

Recorded unchanged expectations covered by the included suite: route 13 principal with 13A/B/C subordinate; route 15 principal with 15A subordinate; route 16/16C circular/frequency/period behavior; routes 66/251 named Hammond Street short workings; route 279 compact principal/Stamford Hill with Manor House and separate N279; route 317 Enfield Town (Little Park Gardens); 327/491; N279 Charing Cross; 357/444/W16/657; Pipers frozen inventory; school-only 629; W8 dagger/calendar; TfL-over-BODS authority; and shared Browser/Word service summaries. Any skipped live controls remain explicitly skipped above.

## GitHub tooling adoption review (no changes made)

- Dependabot: consider for GitHub-native dependency update PRs and security alerts.
- Codecov: consider if coverage reporting is needed in CI; confirm repository privacy and upload-token policy first.
- OpenSSF Scorecard: consider a read-only repository posture check and remediation backlog.
- Sentry: consider only if runtime error reporting is approved; review PII/location-data handling and retention before enabling.
- Renovate: consider if configurable automated dependency grouping and scheduling are preferred to Dependabot. Avoid running both update bots without an ownership policy.

Nothing was installed or reconfigured in this sprint.

## Final recommendation

**NOT READY — NOT READY FOR PRODUCT OWNER FINAL TFL/LONDON INTELLIGENCE ACCEPTANCE.** The new boundary is bounded and isolated, and the synthetic exact-link case behaves safely, but the live Enfield replay has four unresolved routine TfL 313 origin items and an operator-source gap. Do not merge, deploy, promote to Beta, begin BUS-ROBUSTNESS-1B, or begin BUS-POLISH.
