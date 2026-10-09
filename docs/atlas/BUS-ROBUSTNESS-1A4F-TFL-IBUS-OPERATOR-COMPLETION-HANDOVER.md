# BUS-ROBUSTNESS-1A4F — TfL iBus Operator Completion Handover

## Closeout identity

- Repository: `transport-planner-toolkit`.
- Worktree: `atlas-bus-tfl-ibus-operator-completion`.
- Branch: `codex/atlas-bus-tfl-ibus-operator-completion`.
- Baseline: `a5021c9891c749dbebe3b1cfa2840486d1ee59d6` (approved C2 tip).
- Version: `2.0.0-alpha.15`; unchanged.
- Functional implementation SHA: `35c83e3c1bc5edda119edfbb06626243a3116f99`.
- Final tip: this handover commit; its exact SHA is reported in the closeout response because a commit cannot contain its own SHA.
- Working tree is clean after the documentation commit. Branch remains local-only; no push or remote parity is claimed.
- Frozen national prepared-data run: `36125621080`. No fresh national acquisition and no TNDS activation.

## Exact files changed

The functional commits changed these 20 files:

- `atlas/assets/js/app.mjs`
- `atlas/data/tfl-ibus/20261009/operator-index.json`
- `atlas/data/tfl-ibus/manifest.json`
- `src/atlas/adapters/authoritative-bus-timetable-adapter.mjs`
- `src/atlas/adapters/tfl-ibus-operator-adapter.mjs`
- `src/atlas/domain/bus-service-assessment.mjs`
- `src/atlas/presentation/bus-word-export.mjs`
- `tests/atlas/alpha13-calendar-safety.test.mjs`
- `tests/atlas/alpha14-production-row-consolidation.test.mjs`
- `tests/atlas/alpha15-production-fidelity.test.mjs`
- `tests/atlas/bus-alpha13-planner-summary.test.mjs`
- `tests/atlas/bus-dest-endpoint-intelligence.test.mjs`
- `tests/atlas/bus-group-terminus.test.mjs`
- `tests/atlas/bus-planner-golden-rule.test.mjs`
- `tests/atlas/bus-qa-01-acceptance.test.mjs`
- `tests/atlas/bus-robustness-1a-calendar-simple.test.mjs`
- `tests/atlas/bus-robustness-1a4f-tfl-ibus-operator.test.mjs`
- `tests/atlas/run-all.mjs`
- `tests/atlas/tfl-operating-period-1b.test.mjs`
- `tools/atlas-review/build-tfl-ibus-operator-index.py`

This handover adds the 21st file. No other files are intended to change.

## Official TfL iBus source and acquisition

- TfL documentation: `https://ibus.data.tfl.gov.uk/ibus-static-data-documentation.pdf`.
- Version metadata: `https://ibus.data.tfl.gov.uk/Base_Version.xml`.
- Anonymous S3 listing: `https://s3-eu-west-1.amazonaws.com/ibus.data.tfl.gov.uk/` (region `eu-west-1`). Listing was confirmed accessible without credentials.
- `Base_Version`: `20261009`.
- `Valid_From`: `2026-10-08T00:00:00`.
- `Valid_To`: `2026-11-05T00:00:00` (exclusive upper bound).
- Metadata retrieval: `2026-10-09T13:18:28Z`; assessment date: `2026-10-09`.
- Objects used: `Base_Version.xml`; `Base_Version_20261009/Line_20261009.zip`; `Base_Version_20261009/Operator_20261009.zip`; `Base_Version_20261009/Pattern_data_313_20261009.zip`; `Base_Version_20261009/Stop_Point_20261009.zip`; and the 28 schedule objects `Base_Version_20261009/{operatorCode}/schedule_{operatorCode}_20261009.zip` for codes `AT, BE, CV, CX, DC, EB, FB, FT, HY, IF, KE, LC, LD, LG, LI, LO, LU, ME, ML, MN, MT, SK, SL, SN, SV, TE, TN, UN`.
- Source scan covered 792 listing objects and 28 schedule archives. It inspected 710,931 journey records, 31,837 blocks and 308,202 block-calendar records. The compact index retains six productive 313 patterns and 398 productive journeys; 111 matching 313 journeys are active on 9 October across the selected line's six patterns, and all active candidates resolve to the same operator.
- Initial source acquisition comprised 33 coherent inputs (the version XML plus 32 versioned ZIP objects), 130,685,457 bytes total. The previously completed deterministic rebuild used 0 downloads / 0 downloaded bytes, 33 cache hits / 130,685,457 cached bytes, and one public S3 listing request. Precise elapsed rebuild time was not retained. A later attempt to remeasure was blocked at the public listing request by `WinError 10061`; it did not download or modify any source archive. Cache: `%TEMP%\atlas-ibus-inspect-20261009` (local, outside Git). Derived index: `atlas/data/tfl-ibus/20261009/operator-index.json`, 148,750 bytes, SHA-256 `dd54d4646f0f673cbf4badd95d877e69f58e9fbe7beb14becbca956152928fb9`.
- Raw archives are not committed. The generated index and manifest are versioned; the manifest pins Base_Version, validity and index SHA-256, which the runtime verifies before using the index. A repeat build against the cached inputs reproduced the committed index hash exactly. Future production updater work is still required for scheduled, governed source refresh; this sprint does not redesign the national Bus updater.

## Evidence architecture and matching

The bounded path is official raw source → single-version validated builder → compact Base_Version-specific operator index/manifest → TfL timetable enrichment. The deterministic lineage is:

`Service_Line_No` → `Line.Contract_Line_No` → productive `Pattern` → ordered `Stop_In_Pattern` / `Stop_Point` NaPTAN sequence → productive, date-active `Journey` → `Block` → `Operator_Code` → `Operator_Name`.

- The official `Line` record maps passenger-facing `Service_Line_No 313` to `Contract_Line_No 313` and `Logical_Line_No 518`; code does not assume the service and contract numbers are interchangeable.
- Only `Pattern.Type = 1` and `Journey.Type = 1` evidence is retained. Direction is aligned through ordered StopPoint/end-point evidence and assessed-stop membership; the TfL inbound/outbound label is not mechanically equated to iBus direction 1/2.
- On 9 October 2026, the relevant matched ordinary patterns include `Pattern_Idx 815` (direction 1) and `6913` (direction 2); all active matching journeys use `Operator_Code MN`, `Arriva London North`. For example, productive journeys `438363` / `438366` on pattern 6913 use block `19158`, whose 9 October calendar bit is true; journey `438476` on pattern 6014 uses block `19163`, also active that date. Patterns 6018/6019 and 6912 represent other productive route variants/short workings; their date-active candidates also resolve to MN. Inactive calendar rows do not supply operator evidence.
- Builder and runtime validation reject mixed Base_Version records. Every joined entity and retained journey carries `20261009`; the manifest/index validity metadata must agree. No cross-version fallback is implemented.
- iBus contributes operator identity only. TfL timetable journeys, ordered route topology, `routePatternStopIds`, endpoint choices, calendars, frequency and operating-period calculations remain on their existing paths. Route topology is not promoted to exact journey endpoints.
- Authority order is direct TfL timetable operator → deterministic active TfL iBus → unanimous BODS supplementary operator when both TfL operator paths are empty. A direct-TfL/iBus disagreement retains the direct TfL operator with audit evidence. An iBus/BODS disagreement retains iBus and records BODS as audit-only. Multiple active iBus operators fail closed as ambiguity.
- Planner rows retain raw source summaries. The Word provenance label now derives from those source records when the projection has no top-level source field; a mixed or incomplete set is labelled explicitly rather than being silently represented as a single source.

## Operator results and 313 protections

- **191:** Arriva London remains in both Brimsdown Station / Edmonton Green directions; provenance follows the actual source records (TfL timetable, iBus, or BODS consensus) and is not inferred from the operator name.
- **313:** Arriva London North in both ordinary directions, Towards Chingford Station and Towards Potters Bar Railway Station, from active TfL iBus evidence (`MN`, Base_Version `20261009`). The deterministic source evidence agrees across all relevant active matching patterns; no multi-operator ambiguity remains.
- **317:** Metroline Travel remains in both Little Park Gardens / Waltham Cross directions; provenance follows the actual source records and is not inferred from the operator name.
- Browser and Word use the same resolved planner-row operator value. The Word table includes a separate operator-provenance column; the regression specifically covers planner-row source projection. The final clean V2 Word export was inspected: both 313 ordinary directions show `TfL iBus Static Data · Base_Version 20261009`; 317 rows show `BODS supplementary consensus` where that is the actual source.
- Dame Alice Owen's School remains a separate restricted/additional 313 service. Crown Road (EN1) remains the named short working. Enfield's principal Chingford and Potters Bar directions remain. Frequency, calendar, operating period, GROUP, DEST, CIRC, and endpoint semantics are unchanged by operator enrichment.
- Direct TfL timetable operator values take precedence. No direct-TfL/iBus disagreement was found for the accepted 313 rows. The operator index itself has no competing active operator for the matched 313 evidence.

## Live engineering controls

- **Enfield Town, 250 m** (`51.6523584, -0.0783252`): final clean V2 replay had 13 stops, 14 distinct routes, 44 detailed route × StopPoint pairs, and 24 planner service summaries. Route inventory remained `121, 191, 192, 231, 307, 313, 317, 329, 377, 456, 629, N29, W8, W9`. Both 313 ordinary directions display Arriva London North; 191 remains Arriva London and 317 Metroline Travel. Dame Alice Owen's School and Crown Road remain separately qualified. The final Planner review queue contains zero avoidable endpoint-review items. The exported Word report shows the iBus provenance label on both 313 rows.
- **Chingford Mount / Normanshire Drive, 250 m** (`51.616596, -0.011789`): live replay returned 2 stops and routes 357, 444, 657 and W16. There were no planner review items. Route 657 remained school-days-only: one journey/day toward Bancroft's School at about 07:55 and one/day toward Salisbury Hall Sainsbury's at about 16:26; no false general-service dagger was introduced.
- **Waltham Cross Bus Station, 250 m** (`51.685520, -0.031123`): live replay returned 6 stops and 19 summaries. Protected families 13/13A/B/C, 15/15A, 16/16C, 66, 251, 279, 317, 327, 491 and N279 were present. Other existing route rows were not altered. The known contradictory “no bus stops were found within the selected distance” note persisted despite stop rows, and the OSRM review remained at StopPoint `210021703430`. Both are retained for BUS-ROBUSTNESS-1B; neither was changed.
- Frozen national snapshot remains `36125621080` (prepared snapshot `8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9`); diagnostic-only, not production-eligible. V2 preparation reused this frozen artifact. No fresh national acquisition, TNDS activation, third-party operator source, or new credentials were used.

## Testing and protected behavior

- Focused test: `node tests/atlas/bus-robustness-1a4f-tfl-ibus-operator.test.mjs` passed, including all 25 mandatory source, matching, fail-closed, authority-precedence, Browser/Word parity, and timetable-invariance cases. The Word test exercises provenance through the planner-row projection.
- Full suite: `node tests/atlas/run-all.mjs` passed on the implementation tip. The first sandboxed attempt was blocked because the legacy isolation guard needs to spawn a temporary `git init`; the approved test-only retry completed with exit code 0 and ended exactly: `ATLAS Alpha.15 deterministic suite passed.`
- GROUP, DEST, CIRC, aliases, route-pattern-stop identity, calendar/term-time, school-only, TfL source authority, frequency, operating periods, route families and Browser/Word calculation parity remain covered by the unchanged Alpha.15 deterministic regression matrix.
- No accepted route/timetable intelligence is intentionally rewritten by iBus enrichment; no frequency-derived departures are synthesized. The iBus adapter mutates only operator value/provenance and audit diagnostics.

## Review runtime and final acceptance

- Review URL: `http://127.0.0.1:8773/atlas/?review=v2#modules` (`?review=v2`). The clean V2 server returned HTTP 200. Its visible header was verified against the clean final tip, and the final Enfield assessment remains open for Product Owner review. The server is left running.
- Final recommendation: ready for Product Owner final TfL/London intelligence acceptance. Do not begin 1B, polish, merge, deploy, or Alpha.16 work.

## GitHub tooling adoption review (no changes)

- **Dependabot:** retain as the current dependency-update baseline.
- **Codecov:** defer pending an explicit coverage policy and repository approval.
- **OpenSSF Scorecard:** candidate for a read-only security-posture review; do not enable/configure in this sprint.
- **Sentry:** defer until telemetry, privacy and security review is approved.
- **Renovate:** no adoption now; it duplicates the existing Dependabot role.

## Recommendation

**READY FOR PRODUCT OWNER FINAL TFL/LONDON INTELLIGENCE ACCEPTANCE**
