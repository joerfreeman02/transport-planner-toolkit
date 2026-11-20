# ATLAS Bus Beta.2 — Waltham and principal-location hardening closeout

## Controlled change record

- Branch: `codex/atlas-bus-beta2-known-defects-hardening`
- Starting candidate SHA for this closeout: `ecd62a068031dccf729468d1c4fdc60a6f0d715a`
- Frozen Beta.1 `main`: `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`
- Status: Beta.2 engineering candidate for Technical Director review. No merge, release, tag, updater work, or Beta.1 change is part of this correction.
- Prepared data: immutable Run #75 Bus and TNDS manifests; verification used local, deterministic TfL/routing fixtures and made no acquisition or publication request.

## Root cause and Route 203 record comparison

The principal-location resolver treated the prepared `principalLocations` convenience array as a prerequisite. It returned an empty result when the array was absent and, even when the array existed, required an ordered call list to map the values safely. The planner then converted the empty array to `See route origin / destination`.

Inspection of the actual Run #75 Route 203 Long Lane records refined the initial diagnosis: the raw prepared service records do contain a non-empty `principalLocations` array (seven labels, in a legacy non-directional order). They do **not** contain `routePatternStopIds` or `routePatternStops`. Instead they carry the 39-call sequence in `circularPatternStopIds`, two endpoint IDs in `source.orderedPatternEndpoints`, exact origin/destination StopPoint IDs, and endpoint evidence. The old Browser assessment summary therefore exposed an empty *derived* `principalLocations` array after refusing unsafe mapping. It did not establish that the raw array itself was absent.

The earlier source-shaped Route 203 records had the ordered call shape needed by the resolver: aligned `routePatternStopIds` and `routePatternStops` with StopPoint IDs and call names/localities. The important field differences were the location of the sequence (`circularPatternStopIds` versus `routePatternStopIds`), the absence of call objects in the prepared Browser record, and the source-shaped diagnostic's aligned calls. Endpoint hints alone are not enough to identify downstream calls.

## Architectural correction

- Select the representative record using scheduled evidence at the displayed row's frequency-basis StopPoint. Pattern extent and activity still determine the representative choice; a populated convenience location array no longer ranks ahead of the exact pattern.
- Promote the prepared sequence to `routePatternStopIds` only when its first and last IDs exactly match the record's origin and destination StopPoint IDs. Hydrate ordered call names and NPTG localities from the frozen reference StopPoint/locality sidecars. Do not use names to prove identity or direction.
- Derive locations strictly after the assessed call. Closed loops rotate around the unique assessed StopPoint and exclude that anchor; an ambiguous repeated assessed StopPoint fails closed. Preserve trailing `arrival` cleanup, retain named facilities where they are useful, prefer locality transitions where available, and remove duplicate labels in journey order.
- Include the final proven locality/place. When the assessed call is the proven terminal, show the exact destination as the minimum useful result. When the call pattern or endpoint cannot be established, set state `unresolved`, show “Unresolved — review Sources & Checks”, and retain a material review item.
- Group principal-location uncertainty to one review item per public route issue, preserving affected sources and assessed StopPoint IDs.
- Keep principal-location findings visible in Sources & Checks and permit the planner acknowledgement to enable Word and map exports. No warning category creates a permanent export veto; unresolved evidence remains recorded for the planner and report reader.
- `See route origin / destination` is removed from normal planner-row rendering.

## Route 203 Browser and Word control

Long Lane replay point: `51.456210, -0.462970`, 400 m. The frozen Run #75 record pattern is hydrated through exact StopPoint IDs. Both displayed Route 203 directions resolve; neither includes the assessed stop or calls upstream of it.

- Towards Hounslow Bus Station: **East Bedfont → Hatton → Hatton Cross → Cranford → Hounslow West → Hounslow**.
- Towards Elmsleigh Bus Station: **Stanwell → Ashford Hospital Entrance → Ashford → Staines**.

The Browser and generated Word service table contain the same two direction-specific lists, confirmed by the final Playwright download/XML parity check. The service direction follows the actual ordered pattern after the assessed point. The supplied acceptance example placed Ashford Hospital Entrance before Stanwell; the frozen pattern at the selected Long Lane StopPoint encounters Stanwell first. The output preserves source call order rather than reordering those places to match that example.

The Browser run had no page errors, failed requests, or unintended external requests. Its general review items were two grouped TNDS complex-calendar items plus one stop-coverage item because the deterministic verification fixture returned no TfL StopPoint response; no Route 203 principal-location warning remained. The run retained BODS-led Route 555 and TNDS-only N555.

## Waltham Cross review and route controls

Waltham before this correction: **21 principal-location review items** (24 total review items in the previous closeout). After ordered-pattern derivation: **0 principal-location review items** (3 total). All 21 were resolved from exact ordered patterns and reference calls; none were hidden. The remaining items are unrelated to principal locations: unresolved Route 242 operator evidence and generic destination endpoint evidence for Routes 16 and 16C.

Route 310 still presents one planner row toward Hertford at the assessed stop. Its downstream pattern is derived from the selected timetable record; the accepted terminus presentation remains unchanged.

The complete golden controls passed for Route 25/25C directional and short-working cases, Routes 62/64/65, Route 242 variants, loops, Route 230/231, and Milton Keynes Route 5. Pipers production composition retains BODS-primary Route 230 and both distinct TNDS-only Route 231 directions. Route 310 remains one direction row. Route 203 passes both production-composition and Browser/Word controls.

## TNDS and review-noise status

The accepted outside-London hierarchy remains BODS primary with TNDS supplementary. This correction does not reopen hierarchy arbitration. Long Lane previously had 14 review items, including 12 TNDS-related; the prior cleanup reduced this to 4 / 2. With the two Route 203 principal-location warnings now resolved, the final deterministic Browser replay has **3 / 2** (two grouped calendar issues and one fixture-specific stop-coverage issue). Grouped material calendar warnings, genuine TNDS-only services, Pipers 231, BODS-led 555, and fail-safe TNDS-only N555 behavior remain intact. No generic BODS/TNDS disagreement noise was reintroduced.

## Verification

- `node tests/atlas/run-all.mjs` — **passed**, ending `ATLAS Alpha.15 deterministic suite passed.` Run in the established Run #75 verification scratch after mirroring the candidate source/test files; the prepared manifests and data were left unchanged.
- Focused bus-assessment, bus-service-assessment, and bus-presentation tests — passed.
- `python -m unittest discover -s tools/atlas-bus-data -p 'test_build_static_index.py'` using the bundled Python runtime — **19 passed**.
- Long Lane production-composition diagnostic — 5 stops, 2 Route 203 rows, no principal-location review items; zero live TfL requests.
- Long Lane Browser/Word audit — passed; two Browser rows match two Word rows; no page errors, failed requests, or external requests.
- `git diff --check` and Node syntax checks — run at final review.

## Remaining limitations

- The Run #75 prepared data reports as stale in the Browser; the interface advises refresh before formal use. Refresh is outside this correction.
- The deterministic Long Lane Browser fixture has incomplete TfL StopPoint coverage. This is retained as a review item and is not used to claim TfL coverage.
- The supplied Staines-order example differs from call order in the selected frozen pattern as described above; technical review should confirm that the Long Lane point and direction interpretation match the intended control. The result itself is consistent with the exact ordered pattern and Browser/Word agree.
- No live source acquisition, release, or deployment was performed.

## GitHub tooling adoption review

- Dependabot: already configured for weekly npm and GitHub Actions updates; retain it.
- Codecov: no adoption in this correction.
- OpenSSF Scorecard: no adoption in this correction.
- Sentry: no adoption in this correction.
- Renovate: deferred to avoid overlapping dependency automation with Dependabot.

No tooling was installed or newly configured.

## Final product accuracy closeout (2026-11-02)

This continuation began at `4394dc5f8be80661ed070f2e5b20461c9d1b1b95` on `codex/atlas-bus-beta2-known-defects-hardening`. The frozen `main` SHA remains `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. All verification used immutable Run #75 Bus (`1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f`) and TNDS (`2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`) manifests. No refresh, acquisition, publication, release, merge, or updater activity occurred.

### Defects corrected

- **Route 242 identity:** the service graph could join different operators through opposite-direction patterns at a shared terminal and through cross-feed bridge records. The guard now compares proven primary source authority, operator, ordered pattern and service days across shared named terminal identity, preventing that bridge while retaining same-operator/source reconciliation. A genuinely low-volume route branch that shares a substantial ordered trunk is folded into its same-operator principal row with the source journey and destination note retained. Frozen Waltham output now has exactly two rows: Uno towards Potters Bar, Mon–Fri typically every 60–85 minutes and Saturday every 60 minutes; Central Connect towards Welham Green, Sunday every 120 minutes. The single weekday Brookfield journey remains a note on Uno’s row.
- **Circular terminal frequency/period:** circular services use eligible departures from the selected terminal. Returning arrivals no longer create short artificial headways or extend useful departure periods. Route 16 displays approximately 30-minute core service and 08:15–21:40 weekdays / 07:10–19:38 Saturday. Route 16C displays approximately 60-minute Sunday service and 08:00–18:45. The selected frozen departure population supports 18:45; no later departure was inferred.
- **Route 212:** TNDS same-locality terminal evidence plus an ordered outward loop now produces circular wording. The row shows four Monday–Saturday journeys and 09:50–15:00.
- **Principal-location review warnings:** final planner rows can use a safe ordered locality pattern from a reconciled component member when the primary presentation record lacks locality calls. Warning reconciliation now runs against final resolved route and source identities; warnings remain when any final row for that identity is unresolved. The six reviewed route warnings are removed only after their final rows resolve. This replay also resolved the ordered locality chains for 217, 317 and 327 from their component patterns.
- **Route 279 wording:** destination labels are deduplicated in the generic short-working note. The exported wording is `Some route 279 journeys operate to Stamford Hill (Rookwood Road).`
- **Route 13/15 locations:** locality transitions take precedence where the reference pattern proves them. Route 13 removes the bare Railway Station and duplicated hospital main-road label; Route 15 now shows the ordered Waltham Cross–Waltham Abbey–Nazeing/Bumbles Green/Broadley Common–Harlow progression.

### Final Waltham route audit

The real Browser path rendered 20 planner rows across the 19 requested route numbers because Route 242 correctly has two operator identities. Browser and Word agree. Frequencies and periods below are at the selected Waltham Cross stop; source is the planner row's displayed timetable authority.

| Route | Operator | Direction / identity | Calendar, typical frequency and useful period | Principal locations | Source |
|---|---|---|---|---|---|
| 13 | Central Connect | Towards The Talbot | Mon–Fri ~30 min, Sat ~60 min; 06:30–18:10 weekdays, 08:40–15:40 Saturday | Waltham Cross, Waltham Abbey, Upshire, Epping, St Margaret's Hospital, Coopersale, North Weald | BODS |
| 14 | Central Connect | Towards Waltham Abbey (Princesfield Rd) | Mon–Fri 2/day; 07:50–20:25; no weekend service | Waltham Abbey, Highbridge Rdbt, Sun Street, Newteswell | BODS |
| 15 | Central Connect | Towards Harlow Town Centre Bus Station | Mon–Fri ~60–80 min, Sat ~60–120 min; 09:10–22:10 weekdays, 07:55–22:10 Saturday | Waltham Cross, Waltham Abbey, Nazeing, Bumbles Green, Broadley Common, Tylers Cross, Passmores, Harlow, Harlow Town Centre | BODS |
| 16 | Central Connect | Circular | Mon–Fri ~30 min, Sat about 30 min (irregular); 08:15–21:40 weekdays, 07:10–19:38 Saturday | Maynard Court, Gant Court, Waltham Abbey, Waltham Cross | BODS |
| 16C | Central Connect | Circular | Sunday ~60 min; 08:00–18:45; no weekday/Saturday service | Waltham Cross, Waltham Abbey, Loughton, Debden | BODS |
| 25C | Central Connect | Towards Harlow Town Centre Bus Station | Mon–Fri 1/day at about 16:05; no weekend service | Waltham Cross, Theobalds Grove, Cheshunt, Flamstead End, Turnford, Wormley, Abbotts Court, Harlow, Harlow Town Centre | BODS |
| 66 | Arriva Herts and Essex | Towards Loughton Station | Mon–Fri ~30–40 min, Sat ~30 min; 05:29–19:05 weekdays, 06:05–18:50 Saturday | Waltham Cross, Waltham Abbey, Loughton | BODS |
| 211 | Epping Forest Community Transport | Towards Breach Barns | Mon–Sat 4/day; 10:00–15:00 | Waltham Cross Railway Station, Quaker Lane, Parklands, Amesbury, Breach Barns, Waltham Abbey | TNDS |
| 212 | Epping Forest Community Transport | Circular via Waltham Cross Railway Station (outbound) | Mon–Sat 4/day; 09:50–15:00 | Waltham Cross Railway Station, Farm Hill Road, Gilsland, Foxes Parade, Waltham Abbey, Waltham Cross | TNDS |
| 217 | Arriva London North | Towards Turnpike Lane Bus Station | Mon–Fri ~10–15 min, Sat ~15–20 min, Sun ~20 min; 04:00–00:59 daily (next day) | Freezy Water, Bulls Cross, Manor Court, Enfield Wash, Forty Hill, Enfield, Turnpike Lane, West Green | TfL |
| 242 | Central Connect | Towards Welham Green Railway Station | Sunday ~120 min, 09:00–17:00; no Mon–Sat service | Waltham Cross, Theobalds Grove, Cheshunt, Flamstead End, Rosedale, Goffs Oak, Swanley Bar, Brookmans Park, Welham Green | BODS |
| 242 | Uno | Towards Potters Bar Railway Station | Mon–Fri ~60–85 min, Sat ~60 min; 06:25–20:20 weekdays, 07:05–17:40 Saturday | Waltham Cross, Theobalds Grove, Cheshunt, Flamstead End, Rosedale, Goffs Oak, Cuffley, Northaw, Potters Bar | BODS |
| 251 | Arriva Herts and Essex | Towards Waltham Abbey (Princesfield Rd) | Mon–Fri ~30–40 min, Sat ~30 min; 06:37–19:21 weekdays, 08:05–19:35 Saturday | Waltham Cross Railway Station, Quaker Lane, Amwell Court, Edward Court, Jubilee Court, Wormyngford Court, Broomfield Court, Tillingham Court, Geisthorp Court | BODS |
| 279 | Arriva London North | Towards Manor House Station | Mon–Fri ~5 min, Sat ~5–10 min, Sun ~10 min; 05:00–23:54 daily | Freezy Water, Enfield Wash, Enfield Highway, Ponders End, Lower Edmonton, Edmonton, Harringay, Stamford Hill, Manor House | BODS |
| 310 | Arriva Herts and Essex | Towards Hertford Bus Station | Mon–Fri ~15–20 min, Sat ~20 min, Sun ~30 min; 06:03–22:40 weekdays, 06:40–22:39 Saturday, 07:45–20:45 Sunday | Waltham Cross, Theobalds Grove, Cheshunt, Turnford, Wormley, Broxbourne, Ware, Chadwell, Hertford | BODS |
| 317 | Metroline Travel | Towards Enfield Town (Little Park Gardens) | Mon–Fri ~20 min, Sat ~20–30 min, Sun ~30 min; 05:00–00:59 Mon–Sat, 06:00–00:59 Sunday (next day) | Freezy Water, Bulls Cross, Manor Court, Enfield Wash, Forty Hill, Enfield, Enfield Town | TfL |
| 327 | Metroline Travel | Towards Elsinge Estate | Mon–Sat ~40 min; 07:00–19:59; no Sunday service | Bullsmoor Lane / Hertford Road, Langdale Gardens (EN8), Lea Valley High School | TfL |
| 491 | Metroline Travel | Towards North Middlesex Hospital | Mon–Fri ~20 min, Sat–Sun ~20 min; 06:10–23:45 Mon–Sat, 07:10–23:45 Sunday | Freezy Water, Enfield Lock, Brimsdown, Ponders End, Lower Edmonton, Edmonton, North Middlesex Hospital | BODS |
| A1 | Central Connect | Towards Waltham Abbey (Quaker Lane) | Mon–Fri ~60 min; 08:40–14:40; no weekend service | Waltham Cross Railway Station, Long Croft Drive, Lea Road, Highbridge Rdbt, Quaker Lane, Waltham Abbey | BODS |
| N279 | Arriva London North | Towards Charing Cross (Trafalgar Square) | Mon–Thu ~5–20 min, Fri–Sat ~20 min, Sun ~5–20 min; 00:00–04:45 daily (next day) | Freezy Water, Enfield Wash, Enfield Highway, Ponders End, Lower Edmonton, Edmonton, Tottenham Court Road Station, Leicester Square, Charing Cross | BODS |

Route 242's retained note is `Some route 242 journeys operate to Brookfield Centre`. Other evidenced branch and short-working notes remain attached to the generated report; the Route 279 wording above is singular and deduplicated. Pipers 230/231, Long Lane 203, 25/25C, 62/64/65, 657, MK5, PE1, TfL and acknowledgement controls passed the complete deterministic regression.

### Final review items and exports

The Waltham Browser/Word run has **7** remaining review items:

1. Route 16 destination endpoint: generic source endpoint retained because no exact endpoint identity was available.
2. Route 16C destination endpoint: generic source endpoint retained because no exact endpoint identity was available.
3. Route 217 origin endpoint: generic source endpoint retained because no exact endpoint identity was available.
4. Route 317 origin endpoint: generic source endpoint retained because no exact endpoint identity was available.
5. Route 327 origin endpoint: generic source endpoint retained because no exact endpoint identity was available.
6. TfL scheduled timetable information could not be checked for one or more services; available authoritative results and matching national evidence were retained.
7. TfL scheduled timetable information could not be checked for one or more services and no defensible national fallback was available; ATLAS did not assume zero service.

No principal-location warning remains. The real localhost browser audit had zero browser errors, failed requests, failed responses, or unintended external requests. It passed acknowledgement-gated export, Word with map, Word without map, standalone map, Browser/Word row parity, and the complete route assertions. The generated Word files and standalone map are preserved with the acceptance report outside the repository for review.

### Verification and checkpoint status

- `node tests/atlas/run-all.mjs` — **passed**, ending `ATLAS Alpha.15 deterministic suite passed.` The default sandbox initially blocked its ephemeral localhost harness (`ERR_NETWORK_ACCESS_DENIED`); the same suite then passed with the authorized loopback boundary enabled. Frozen Bus and TNDS manifest digests remained unchanged.
- Focused Beta.2 accuracy, Alpha.15 production-fidelity, and BUS-ROBUSTNESS-1A4 closeout tests — **passed**. The manual real-browser Waltham acceptance — **passed** with no failure entries.
- Route 242 and 212 remain source-grounded in frozen BODS/TNDS; Routes 491 and N279 are BODS-only in this snapshot. The remaining TfL evidence items above are disclosed; no unavailable live timetable was fabricated.
- Dependabot remains the existing dependency update mechanism. Codecov, OpenSSF Scorecard, Sentry and Renovate were reviewed; none was added or installed in this controlled closeout.
- The candidate remains Beta.2 engineering work and requires Product Owner retest. `main` remains frozen. No release, merge, tag or national data refresh is authorized by this record.

## Final Waltham consolidation and safe-checkpoint continuation (2026-10-30)

This continuation began with the candidate at `ecd62a068031dccf729468d1c4fdc60a6f0d715a`. At that point, nine intended source/test/documentation files were modified and generated audit/Word artifacts were untracked. A broad restore in the preceding fixture-recovery work had discarded earlier uncommitted changes; key rules were reconstructed from the audit and available evidence. The nine-file state was reviewed and checkpointed, but it is not represented as byte-for-byte preservation of the earlier uncommitted diff. The Run #75 reference worktree and its prepared data remained separate and unchanged. Temporary audit JSON/log and generated Word files are verification artifacts, not source changes.

The source-shaped Route 279 regression exposed a parser gap: the recurrence recognizer did not accept the source's plural `mins` frequency wording. It now accepts `min`, `mins`, `minute`, and `minutes`; a regression uses the actual `Mon-Fri: Typically every ~5 mins`, `Sat: Typically every ~5–10 mins`, and `Sun: Typically every ~10 mins` evidence. The generic classifier now recognizes the fixture's 44-call Rookwood pattern as a recurring strict prefix of the 47-call Manor House pattern. The exact-pin browser control nevertheless still renders two separate Route 279 rows. The recognition is not reaching final planner row consolidation, so the requested one-row presentation plus short-working qualification is **not complete**. This frozen Waltham replay returns BODS evidence for Route 279 and no live TfL timetable evidence; mixed TfL/BODS authority and presentation remain for Product Owner retest.

The real mixed-source browser replay also still renders two rows each for Routes 217, 317, and 327: an outward TfL row and an inbound BODS row ending at Waltham Cross. A synthetic regression for an exactly anchored reciprocal terminus pair passes, and Route 310 remains one useful outward row. The live fixture's inbound and outbound direction records use different StopPoints within the selected bus station and do not satisfy the current paired-row proof, so the generic correction has not yet resolved this observed Waltham shape. The four-route row-count issue remains open; no route number or site-specific exception was added.

Route 317's TfL row retains structured selected-StopPoint interval evidence: Mon–Sat approximately `05:00–00:59` next day and Sunday `06:00–00:59` next day. The Sources & Checks text confirms the structured boundaries are kept separate from exact scheduled departures, and frequency ranges do not generate synthetic journeys. The planner labels the interval approximate; this evidence is safe to retain.

The PE1 failure was a stale assertion, not a missing service. Its earlier selector could identify the Bourne row from `Bainton` in the *Austerby* principal locations. After selection by the displayed Bourne direction, the exact audit shows three distinct Route 202 rows: Peterborough (two journeys, 17:04–18:04), Austerby (one weekday journey at 07:10, via Bainton), and Bourne (one weekday journey at 07:45, via Phillips Court). The control now selects the Bourne destination explicitly and checks its distinct Phillips Court path. The Route 217 Word assertion also had an undersized 500-character search window; the generated Word text contains the correct TfL `04:00–00:59` interval, and the control now allows for the full rendered row.

The exact-pin browser and Word audit completed with no failures, browser errors, failed requests, or unintended external requests. Waltham reports 16 stops found, 15 assessed, and 23 selected service summaries. The planner-visible route set includes all requested routes (13, 14, 15, 16, 16C, 25C, 66, 211, 212, 217, 242, 251, 279, 310, 317, 327, 491, A1, N279). Routes 217, 279, 317, and 327 each still have two rows; 310 has one. The report's readiness is `READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_RE-ACCEPTANCE`, not a Waltham product-acceptance result.

Waltham Sources & Checks retains eight evidence items: Route 242 operator uncertainty; endpoint decisions for 16 and 16C; origin endpoint decisions for 217, 317, and 327; and two assessment-level TfL timetable coverage/interpretation items. TfL remains primary on the usable 217/317/327 evidence; exact ordered BODS stop-pattern and compatible operator evidence supplements TfL call labels while leaving TfL authority unchanged. Routes 491 and N279 remain BODS-only in this replay, so no live TfL timetable verification is claimed. Route 16C remains Sunday-only. Planner acknowledgement enabled Word export; map-on and map-off Word checks passed, and standalone map export completed.

Focused `bus-group-terminus`, `bus-assessment`, `tfl-bus-timetable`, Alpha.13 planner-summary, service-assessment, and 1A4/313 endpoint tests pass. The exact-pin browser/Word control passes its scripted controls after correcting the PE1 and Word assertion scope. The required full `node tests/atlas/run-all.mjs` did **not** pass: the restricted run first stopped on an `EPERM` rename while materializing a temporary TNDS browser fixture; retrying outside that sandbox passed the browser TNDS shard check but then failed `bus-timetable-merge.test.mjs:139` because the prepared TNDS shard set used by that run did not contain the expected Pipers Route 231 call. This failure is not yet classified as product regression or fixture mismatch; the suite has not been rerun against the complete frozen Run #75 shard set. The broader established Bus regression therefore remains unverified in this candidate.

This record does not claim Product Owner acceptance. Manual retest must inspect the Waltham inward rows, Route 279's final short-working presentation, and live TfL availability for Route 279. The full Bus suite must be rerun against the established Run #75 fixture set. Product Owner approval has not occurred.

## Set-and-forget engineering closeout (2026-11-02)

This final continuation started from candidate `9469d45683544497910e50df1669dafa39f3b136`; frozen `main` remains `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. This record supersedes the earlier open-blocker status above.

### Corrections and regression findings

- Waltham's inbound BODS and departing TfL patterns use different physical StopPoints in the same active NaPTAN StopArea (`210G432`). The previous physical-stop-only pairing left the arrival visible, and generic display names (`Bus Station` versus `Waltham Cross Bus Station`) prevented the proven pair from joining. The planner now requires an exact ordered arrival endpoint, exact departing start, reciprocal endpoint identity, compatible operator/route and shared active NaPTAN group; it then aligns the arrival display place with its proven departure. Similar names alone do not qualify. The multi-StopPoint regression and same-name/no-group negative control pass. Route 310 remains one departing row.
- Route 279's recurring Rookwood short working was correctly recognized but not consolidated because the 39-call shared corridor was followed by a long but genuine branch tail; the component walk stopped at its earlier queue. The planner now permits a proven recurring contained continuation across that separation. Browser and Word show one Manor House principal row with `Short workings: Some route 279 journeys operate to Stamford Hill (Rookwood Road).`; short-working source records remain in grouping evidence. The available Waltham fixture is BODS evidence; live TfL timetable evidence for 279 was not available, so TfL/BODS authority remains a Product Owner retest item.
- The first Pipers Route 231 failure came from an incomplete Run #75 fixture mount. The earlier temporary TNDS rename denial was a restricted-runner filesystem issue. Reconstructing the complete frozen fixture set resolved both environmental conditions; the suite's source-arbitration controls confirm Route 230 remains BODS-primary and Route 231 remains a genuine TNDS-only supplementary service. The Pipers regression was not weakened.
- The PE1 Route 202 audit had a stale three-row expectation: the Queensgate-arriving pattern is preserved in the departing rows' terminus evidence and the duplicate arrival row is suppressed by the approved terminal presentation rule. Two useful departing rows remain: Austerby and the distinct Bourne branch. The X4 control likewise expects its useful departing row at the Queensgate terminus plus the route-scoped, weekday-qualified Kings School short-working note; the reciprocal arriving direction is retained in terminus evidence.

### Final verification

- `node tests/atlas/run-all.mjs` — **passed**, ending `ATLAS Alpha.15 deterministic suite passed.` It ran in an isolated scratch checkout using the complete frozen Run #75 data. The Bus manifest SHA-256 was `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f`; TNDS was `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`; TfL iBus was `fe13f40eff9c260c2a426017ff2166539641d261a3332f0e752132ec2f1f432f`. Source fixture files were not modified.
- The complete suite passed the Pipers 230/231 hierarchy control and the golden controls for Route 25/25C, 62/64/65, 242 variants, loops, Route 657, MK5, timetable authority, principal locations, Word/map export and endpoint decisions.
- Focused checks passed for `bus-group-terminus`, `bus-assessment`, `bus-alpha13-planner-summary`, `tfl-bus-timetable`, `bus-service-assessment`, and `bus-robustness-1a4-313-principal-endpoint`. Node syntax checks and `git diff --check` passed. Python/static-index tests were not required because no source-data builder or index generation logic changed.
- The exact Waltham/PE1 Playwright audit passed with zero page errors, failed requests or unintended external requests. The planner showed all 19 requested routes: 13, 14, 15, 16, 16C, 25C, 66, 211, 212, 217, 242, 251, 279, 310, 317, 327, 491, A1 and N279. Routes 217, 279, 310, 317 and 327 each have one useful row. 16C remains Sunday-only. Routes 491 and N279 are BODS-only in this fixture and are not claimed as live-TfL verified.
- Waltham Sources & Checks contains **8** review items: Route 242 operator uncertainty; endpoint uncertainty for 16, 16C, 217, 317 and 327; and two assessment-level TfL timetable-availability items. The assessment is complete. Planner acknowledgement enabled Word and map exports; Browser/Word parity passed, map-on and map-off Word checks passed, and standalone A3 landscape map export passed.
- The PE1 audit passed with two Route 202 departures and one X4 departing row carrying its qualified school short-working note. The audit report status is `READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_RE-ACCEPTANCE`; this is engineering readiness, not Product Owner acceptance.

### Checkpoint and handover

- Final candidate SHA is recorded in the commit and final handover.
- The branch is not merged, tagged or published. Beta.1 and `main` remain frozen. No updater work or data refresh occurred.
- Product Owner acceptance has **not** occurred. Manual retest must confirm mixed TfL/BODS Route 279 presentation and review the eight disclosed Waltham evidence items. No live TfL timetable verification is claimed for Routes 279, 491 or N279.
- The local Product Owner acceptance environment is launched after the clean pushed checkpoint; its URL is included in the final handover and it remains running for the Product Owner.

### GitHub tooling adoption review

- Dependabot: existing weekly npm and GitHub Actions updates; retain.
- Codecov: no adoption in this correction.
- OpenSSF Scorecard: no adoption in this correction.
- Sentry: no adoption in this correction.
- Renovate: deferred to avoid overlapping dependency automation with Dependabot.

No tooling was installed or newly configured.

## 212 / 16C final timetable verification (2026-11-02)

This verification started from candidate `bfe18461cb712e87754021f2468ef4467c846bcb`; frozen `main` remains `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. The checks below use the immutable Run #75 prepared Bus/TNDS manifests (SHA-256 `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f` and `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`). No national data was refreshed.

### Route 212 — frozen TNDS dates explain the current difference

- Source record: `tnds:SE:essex_212_EFCT_PF_212_PF9000012-11_20200901_20261012_040141.xml:212_PF9000012-11`. The record is valid through 12 October 2026. Run #75's Bus manifest snapshot date is 19 October 2026 (manifest generated 20 October), so this TNDS record was already expired when that frozen snapshot was prepared.
- The ordered pattern starts at Waltham Cross Bus Station Stop C (`210021703420`), follows the circular route, and returns to Waltham Cross Bus Station (`210021700040`). The assessed frequency basis is the first Stop C call, `210021703420`; the returned terminal call does not supply the useful departure time.
- Frozen weekday and Saturday departure samples at that selected call are 09:50, 11:20, 12:52 and 15:00 (four journeys/day). No Sunday departures are represented. These are departures, not the later return arrivals. The prepared record does not retain a per-call pickup/setdown flag, so the distinction is grounded in the ordered pattern endpoints and the stop-scoped departure schedule.
- The current row remains **Mon–Sat: 4 journeys/day; approximately 09:50–15:00; no Sunday service**. This matches the frozen timetable evidence. The independently observed current departures around 09:30, 11:00, 12:30 and 14:30 are not in this expired TNDS service record. Classification: **frozen-data staleness / source incompleteness**, not an ATLAS circular-period defect. No current times were fabricated.
- Limitation: the frozen evidence cannot establish Route 212's timetable after 12 October 2026. The automatic updater/data refresh must acquire that later schedule before the row can be considered current.

### Route 16C — exact-origin short-working departure was lost in grouping

- Frozen BODS source: south-east route ID `6770341`, Central Connect Route 16C, in the Run #75 service shard. The circular pattern is ordered from Waltham Cross Stop C (`210021703430`) around the loop back to the same Stop C. Its validity is 19 October 2026–19 July 2027, covering the 2 November 2026 review date.
- The frozen full-loop Stop C schedule includes terminal observations at 08:00, 09:00, 09:43, 10:00, 10:43, 11:00, 11:43, 12:00, 12:43, 13:00, 13:43, 14:00, 14:43, 15:00, 15:43, 16:00, 16:43, 17:00, 17:43, 18:00, 18:43 and 19:43. The repeated calls around :43 are terminal return observations between hourly boarding departures, not extra departures.
- The same frozen BODS service has an explicit Stop C origin short working to Maple Gate at 18:45 (`south_east:6770341:0:b47bb4fbffda`) and another to Maynard Court at 19:45 (`south_east:6770341:0:b1360459a1f1`). The latter is the requested later Sunday departure. It is present in Run #75, is not excluded by its effective dates or calendar, and its exact origin is the assessed Stop C.
- Root cause: the principal timetable population removed all records classified as short workings before circular terminal normalization. That hid the valid 19:45 boarding journey. Normalizing the full-loop record in isolation also left an unpaired terminal return at 18:43 as the displayed end. This was a generic **application grouping/processing defect**, not a missing source record.
- Correction: for a proven circular terminal, exact-origin short-working departures at the selected StopPoint now join the passenger boarding stream before circular terminal-call normalization. Arrival-only events remain excluded. The frozen route still reads approximately every 60 minutes, with a Sunday useful period of **08:00–19:45**. The generic control asserts the source record ID and 19:45 end time; no route-specific time is hardcoded.
- Limitation: the prepared Run #75 representation exposes terminal call times and exact short-working endpoints, but not a GTFS pickup_type/setdown_type flag for every call. Endpoint role, stop-scoped schedule and ordered pattern provide the available distinction.

### Verification status for this correction

- `node tests/atlas/run-all.mjs` — **passed** against the complete Run #75 snapshot in an isolated verification checkout. The prepared snapshot manifest digests remained the exact Run #75 identities. The candidate checkout's local prepared-data mount was missing referenced shards, so the suite used the complete frozen-data checkout instead.
- Focused circular and Waltham regression tests passed, including route 16C's retained BODS `19:45` source record, route 16's unchanged `08:15–21:40` / `07:10–19:38` periods, route 212's frozen departure population, and circular terminal-call filtering.
- The real Run #75 Waltham browser-to-Word/map replay had no assertion failures, page errors, failed requests/responses or unintended external requests. It showed all 19 requested routes. Route 16 retained its accepted output; 16C remains Sunday-only with `08:00–19:45`; 212 remains `09:50–15:00` from the expired frozen schedule; both 242 identities remain present; 279 remains one Manor House row; 217/317/327 and 310 remain one useful row each; 491 and N279 remain present.
- Sources & Checks contains exactly **7** items: endpoint evidence for 16, 16C, 217, 317 and 327 plus two TfL timetable-availability items. No principal-location warning returned.
- Word with map, Word without map, reference removal for map-off, standalone A3 landscape PDF map, and browser/Word row parity passed. The audit status is `READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_RE-ACCEPTANCE`; it is not Product Owner acceptance.
- The frozen `main` SHA remains `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. No previously accepted Bus behaviour was intentionally changed except retaining the evidence-backed late boarding departure on the proven circular route 16C. Route 212 remains tied to its frozen schedule until the updater supplies newer national evidence.

## Headless cross-site regression correction (2026-11-02)

### Chingford TfL principal-location defect

The Product Owner's reported defect is reproducible at the adapter boundary: TfL timetable records carried ordered `routePatternStopIds` and a safely derived principal-location list, but did not carry the corresponding ordered `routePatternStops` labels. The final planner reconciliation requires those ordered calls to be present when it rechecks a principal record; the rows therefore became unresolved after cross-source reconciliation, even when the TfL-only pattern itself was complete. This made clean TfL-primary records appear to require BODS/TNDS component support.

The generic correction retains the ordered TfL StationInterval/StopPoint calls and names with the timetable record when the requested departure StopPoint is confirmed. It does not infer a call or depend on national feeds. Missing or mismatched patterns remain unresolved. The TfL-only planner regressions cover 357, 444, W16 and 657 and verify principal state `resolved`; the existing 657 timetable golden remains one school-day journey in each evidenced direction, no Saturday/Sunday service, and TfL source authority. The headless Browser/Word Chingford golden verifies both 657 directions at approximately 07:56 and 16:22 with the school-day-only qualification.

The frozen Run #75 source does not contain a captured TfL timetable response for the Chingford 357/444/W16 routes. Its national-only runtime diagnostic therefore cannot be presented as a replay of the Product Owner's live TfL golden. Final manual retest must confirm the actual 357/444/W16 stop-level rows and locations in the review environment.

### Heathrow Route 555 and N555 evidence

At Long Lane's Route 555 frequency-basis StopPoint `40004402007B` (Long Lane, opposite), Run #75 contains the outbound White Bus Services Heathrow Central record `london:104490:0:1f8a2dd1d99b` and the contained Hatton Cross record `london:104490:0:b17457fd8454`. Both are valid from 19 October 2026 through 19 July 2027, serve the same boarding point in the same passenger direction from Hepworth Way, and have ordinary active service profiles. The frozen weekday records show 7 Heathrow Central journeys plus 30 Hatton Cross journeys at this stop. The Hatton Cross service is a strict ordered-pattern subsequence of the longer Route 555 pattern. The corrected canonical population includes its recurring departures, removes exact same-stop/day/minute duplicates, and preserves opposite-direction and circular-terminal handling. The Browser row remains approximately every 30–40 minutes and retains the Hatton Cross short-working note. The regression requires a long, proven contained pattern with recurrent service, so the older Alpha.13 limited three-trip variant remains excluded as asserted.

The frozen Run #75 TNDS data also contains six N555 records from `square_WNGS_N555_N555.xml`, operated by Hallmark Connections Ltd. Their start date is 24 August 2024 and each has no `validTo`/expiry date. The records carry weekday-plus-weekend operating profiles and unresolved complex special-day profiles; the feed therefore surfaces six-pattern calendar review items rather than fabricated special-day conclusions. The TNDS manifest was generated 19 October 2026 at 07:45:16Z; the record-level publication date is not present in the prepared evidence. With no expiry encoded, these records were apparently active on the Run #75 snapshot date. This is a source-staleness/source-quality issue for a future updater/data refresh, not an ATLAS effective-date filtering defect. No N555-specific filter was added.

### Waltham Route 242 and review-item reconciliation

The generic final-row annotation filter now removes a short-working entry whose location equals a principal destination in the same public route group. The Waltham Browser and Word audit retain the distinct Uno variant `Dame Alice Owen's School (weekdays only)` and the separate Brookfield Centre note; no Route 242 short-working note repeats Potters Bar Railway Station. Both public 242 identities remain present.

The Product Owner's latest manual run reports 4 review items: Routes 16 and 16C destination-endpoint items plus the two TfL timetable-availability items. The frozen Run #75 headless Browser replay still reports 7: those same four, plus generic origin-endpoint items for 217, 317 and 327. Those three records have incomplete endpoint evidence in the deterministic fixture; the run does not contain the actual TfL route metadata/sequence responses needed to reproduce the manual reduction. The accepted headless golden assertions for 217/317/327 remain intact; no warning was deleted or downgraded to force the reported count. This 4-versus-7 difference remains an explicit manual-acceptance check.

### Headless cross-site outcomes

- Waltham Cross: 20 Browser rows; Routes 16/16C retain their accepted circular periods and Route 16C Sunday 08:00–19:45 departure; Route 212 retains its four frozen departures; both 242 identities, 217/317/327 and Route 310 remain. Word/Browser parity, map-on and map-off Word output, map-reference removal, and standalone A3 landscape map export passed. The frozen headless review count is 7 as described above.
- Chingford: the fixture-backed Browser/Word run passes both TfL Route 657 directions, weekdays only, one journey/day, no weekend service, with resolved principal locations. Separate TfL-only adapter/planner tests cover 357/444/W16 pattern retention. The full four-route live TfL output still needs Product Owner retest.
- Long Lane / Heathrow: two Route 203 Browser rows retain the ordered chains `Stanwell → Ashford Hospital Entrance → Ashford → Staines` and `East Bedfont → Hatton → Hatton Cross → Cranford → Hounslow West → Hounslow`. Route 555 is approximately every 30–40 minutes; both N555 directions remain source-backed. Browser-to-Word row parity and standalone Word export passed. The offline Run #75 replay uses BODS Route 203 because it has no captured TfL Route 203 response; it does not verify the acceptance control's expected TfL authority, which remains a manual check.
- Hoddesdon / The Drive: the Browser/Word replay retains Route 310 in both directions, Route 33, Route 907 and Route 907A with their separate directions, schedules and principal-location chains. The deterministic replay has 2 review items (Route 25B ordered-pattern evidence and incomplete NaPTAN stop coverage), neither a requested-route failure.
- All four Browser runs completed without assertion failures after the final harness correction. Their generated Word files were inspected for row parity. The Waltham replay additionally verified map-on/map-off Word and standalone map export.

### Verification and remaining acceptance

- `node tests/atlas/run-all.mjs` passed against an isolated checkout populated with the immutable Run #75 Bus and TNDS data. The manifest SHA-256 identities remained `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f` (Bus) and `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f` (TNDS).
- Focused TfL timetable, TfL-only principal-location, contained-short-working frequency, planner source-arbitration, Alpha.13 frequency, and Browser/Word wording tests passed. `git diff --check` passed.
- Dependabot: retain current weekly updates. Codecov, OpenSSF Scorecard and Sentry were not adopted. Renovate remains deferred to avoid overlapping dependency automation. No tooling was installed.
- This is an engineering candidate, not Product Owner acceptance. Manual retest must verify all four actual Chingford TfL routes and reconcile the reported 4 Waltham review items with the frozen headless 7-item result. No merge, tag, publication, updater run or data refresh occurred.

## Final frequency and pattern presentation closeout (2026-11-02)

This continuation began at `951b7a225d686ffcd609b26673cb90aa032c7539` on `codex/atlas-bus-beta2-known-defects-hardening`. Frozen `main` remains `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. Verification used the immutable Run #75 Bus and TNDS manifests (SHA-256 `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f` and `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`). No national data was refreshed.

### Route 203 weekend frequency

The Long Lane Run #75 replay uses BODS because the frozen candidate has no captured TfL Route 203 timetable response. At the two distinct assessed stops (`40004402007A` and `40004402007B`), each direction remains a separate row. The schedules contain repeated close gaps of roughly 3–5 minutes followed by the ordinary roughly 25–30 minute cadence. They are distinct scheduled times in overlapping same-direction patterns, not same-minute duplicates, cross-direction mixing, or a single route-specific short-working rule. The previous lower-quartile range calculation let this interleaved short-gap population set the displayed minimum.

The generic frequency calculation now removes equivalent duplicate minutes and excludes only an anomalously short lower tail when estimating typical headway; it retains the scheduled departures and uses a day-specific median threshold, so an ordinarily recurring short interval remains part of the typical service. The stop and direction populations stay separate. Focused tests cover duplicate minutes, interleaved short gaps, and weekday-like 20–25 minute variation.

Final headless Browser/Word frequencies are:

- Towards Elmsleigh Bus Station: Mon–Sat `Typically every ~20–25 mins`; Sun `Every ~27 mins`.
- Towards Hounslow Bus Station: Mon–Fri `Typically every ~20–25 mins`; Sat `Typically every ~20–30 mins`; Sun `Every ~29 mins`.

The frozen replay therefore preserves weekday outputs and produces the anticipated near-30-minute Sunday service. It does not establish the Product Owner's live TfL authority because that timetable was not captured in Run #75; live authority remains a manual check.

### Route 555 principal pattern and extension

At the outbound Long Lane frequency-basis stop `40004402007B`, the frozen BODS records include a 30-journey-per-day Hatton Cross pattern (`london:104490:0:b17457fd8454`) and a contained 7-journey-per-day Heathrow Central continuation (`london:104490:0:1f8a2dd1d99b`). They are valid during the representative week, serve the same stop in the same direction, and have a proven ordered-pattern containment relationship. The shorter pattern is the materially dominant recurring service; Heathrow Central is the less-frequent extension.

The generic planner presentation chooses a shorter contained pattern as the passenger-facing main pattern only when its selected-stop scheduled activity is at least twice the longer pattern and its destination is specifically named. The principal row now reads **Towards Hatton Cross Station**, retains the combined stop frequency (**Mon–Fri ~30–40 minutes; Sat–Sun ~30–35 minutes**), and carries one clear note: `Less frequent journeys continue beyond Hatton Cross Station to Heathrow Central Bus Station.` The Browser and Word controls confirm there is no duplicate peer row and no short-working annotation that mislabels either the dominant Hatton Cross pattern or Heathrow Central extension.

### N555 source limitation

No N555 filtering or effective-date logic change was made. Run #75 still contains six Hallmark Connections TNDS records beginning `2024-08-24` with no expiry date. They remain active according to the supplied metadata; this is a stale-source/data-refresh limitation, not an ATLAS date-filtering defect.

### Final golden controls and verification

- Pipers Browser/Word control: Route 230 remains a single BODS-primary circular row; Route 231 remains present as the genuine TNDS-only service. The focused source-arbitration regression passed.
- Wycliffe College: Route 62, 64 and 65 ordered principal-location direction controls passed in the full suite; the direct Wycliffe assessment test also passed.
- Milton Keynes Route 5: the complete frozen-data regression passed its BODS/TNDS source-authority and duplicate-peer controls.
- PE1 Route 202: the isolated stage-traced Browser/Word golden passed with distinct Austerby and Bourne branches, the Queensgate arrival evidence retained, and the stale duplicate arrival row suppressed.
- The complete headless Browser/Word audit passed Pipers, Waltham, Long Lane, Chingford 657, Hoddesdon/The Drive and PE1 controls with no browser errors, failed requests, or external requests. Its status is `READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_RE-ACCEPTANCE`; this is not Product Owner acceptance.
- `node tests/atlas/run-all.mjs` passed against the full immutable Run #75 Bus/TNDS data and the frozen TfL iBus reference index, ending `ATLAS Alpha.15 deterministic suite passed.` Focused frequency, planner correction, cross-site, Wycliffe, endpoint and presentation tests passed. Browser/Word parity, acknowledgement, map-on/map-off Word, standalone A3 map export, syntax and `git diff --check` passed.
- Dependabot remains the existing dependency automation. Codecov, OpenSSF Scorecard, Sentry and Renovate were not installed or newly configured; Renovate remains deferred to avoid overlapping Dependabot.

### Remaining Product Owner checks

Product Owner manual acceptance has not occurred. Retest Route 203 against the live TfL-primary response and Route 555 against the live current timetable; confirm the actual Chingford TfL 357/444/W16 rows; reconcile the Product Owner's four Waltham review items with the seven-item frozen headless replay; and review the source-staleness disclosures including N555. No merge, tag, release, publication, updater work or data refresh occurred.

## London resilience and Pipers 231 calendar closeout (2026-11-02)

### Tufton Road: TfL timetable failure with retained route topology

The read-only TfL check used Tufton Road control point 51.613869, -0.020303 and a 700 m stop radius. This is a reproducible street control point, not a supplied postcode. TfL returned 28 nearby StopPoints, including Chingford Mount Stop C (`490005180C`) and Stop E (`490005180E`) for Route 158. TfL Route metadata identifies Stratford Bus Station and Chingford Mount as the route ends. The outbound timetable request at Stop C succeeded; the inbound Stop E request returned HTTP 400: `No direction could be found for stop: 490005180E on line: 158. The line may not serve this stop.` Both inbound and outbound ordered route-sequence requests still succeeded. The inbound sequence contains 44 calls and ends at Stop E.

Root cause: TfL ordered-sequence requests were issued only for directions with successful TfL timetable service records. A failed direction was presented from a stop-scoped BODS fallback with no ordered pattern, so its principal locations became unresolved even though the TfL sequence remained available. The generic adapter now derives fallback sequence requests only from one unique exact route-section endpoint match, validates direction, service type, sequence endpoints and the assessed StopPoint, then attaches a `route-topology-only-for-timetable-fallback` evidence sidecar. It sets `scheduledTimetableUsed: false`; the national fallback's departure times, frequency and operating period remain the timetable evidence. No timetable journeys are fabricated from route topology. Ambiguous or incompatible section/sequence matches remain unresolved.

Focused integration coverage reproduces a failed timetable with a successful TfL sequence, verifies topology-based principal locations, confirms the BODS schedule remains unchanged, and rejects incompatible sequence endpoints. The separate local Run #75 Tufton-radius diagnostic used 29 prepared stops and covered routes 97, 158, 215, 357, 385, 397, 397A, 444, 657, N26 and W16. It is a national-data diagnostic, not a replay of the live TfL rows. Exact current TfL Browser output for every listed route/direction and the live Tufton Sources & Checks result remain Product Owner review items.

### TfL-primary endpoint warning reconciliation

TfL/BODS disagreement diagnostics already classified a supplementary conflict as audit-only when TfL route metadata established the final route identity. Service-summary aggregation nevertheless unioned endpoint StopPoint IDs from separate BODS rows into the final TfL planner decision, so a safely resolved TfL row could inherit planner-facing endpoint ambiguity.

The summary builder now selects TfL endpoint evidence for planner decisions only when every authoritative TfL record has named termini and matched route metadata or exactly one StopPoint ID for each endpoint. Supplementary BODS records and diagnostics remain in `rawServiceSummaries`. If TfL identity is absent, incomplete or conflicting, all endpoint sources remain in the decision and the warning stays actionable. Focused tests verify both cases.

### Pipers Lane Route 231 calendar

Frozen Run #75 uses archive `bed_51-231-_-y08-1.xml`, service code `51-231-_-y08-1`, valid 12 October 2026–31 July 2027. Eight prepared pattern variants have `calendarProfileId: ordinary`; profile records containing `SpecialDaysOperation` are marked `partial`. The immutable prepared evidence contains conflicting all-seven-day and Monday–Friday profiles, with specific Saturday-only profiles on some variants. The original XML payload is not present in this checkout, so the precise special-day meaning cannot be recovered from the prepared shard. The official operator timetable separates weekday and Saturday tables and contains no Sunday timetable.

Root cause: profile grouping used the broad `ordinary` category and unioned partially resolved day sets, promoting unsupported Sunday departures. The parser and runtime now handle such conflicts generically: they remove a partially resolved profile when a more-specific profile contradicts it, then retain the union of days supported by the most-specific partial profiles. The conflict remains qualified and original profile evidence stays available. A direct Monday–Friday plus Saturday fixture proves Sunday is never inferred. School/non-school separation and the 657, 16C and PE1 calendar controls remain covered.

The frozen-data Browser and Word output now shows:

- Route 231 towards Dunstable Asda: Mon–Fri 3 journeys/day; Saturday 2 journeys/day; no Sunday service. Approximate period: 08:04–11:34 weekdays and 09:04–11:34 Saturday.
- Route 231 towards Pepperstock: Mon–Fri 4 journeys/day; Saturday 1 journey/day; no Sunday service. Approximate period: 11:18–18:02 weekdays and one departure at approximately 11:18 Saturday.
- Route 230 remains one Centrebus circular row, approximately hourly Monday–Saturday, with no Sunday service.

Pipers Sources & Checks retains the incomplete NaPTAN stop-coverage item for Stop `021013524`. One calendar qualification is shown: `The frozen calendar profiles conflict; only days supported by the most specific profiles are shown. Confirm weekend service against the operator timetable.` Browser and Word rows match.

### Headless cross-site results and exact review items

The Browser/Word audit used the immutable Run #75 Bus/TNDS manifest digests recorded above. With `ATLAS_C4_TRACE_OPERATOR_STAGES=1`, all controls completed with no browser errors, failed requests/responses or external requests. Status: `READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_RE-ACCEPTANCE`, not Product Owner acceptance.

- Pipers: Routes 230 and 231 passed; one evidence item remains for incomplete NaPTAN stop coverage at `021013524`.
- Grove Road Chingford golden: Route 657 has two TfL rows, one school-day journey each way, no weekend service, and departures around 07:56 and 16:22. This fixture emitted no evidence-item warning.
- Waltham Cross: Route 16 and 16C periods, Sunday-only 16C 08:00–19:45, four frozen 212 departures, both 242 identities, and 217/279/310/317/327 rows remain. Seven evidence items remain: endpoint decisions for 16, 16C, 217, 317 and 327, plus two TfL timetable-availability items. One calendar qualification from partial TNDS profiles is also disclosed; the 212 four-departure frozen schedule is unchanged. This does not reconcile the Product Owner's separate four-item live result.
- Long Lane: both 203 directions remain, 555 is presented towards Hatton Cross, and both N555 directions remain. Six evidence items remain: complex TNDS calendars for 555 and N555; principal-location evidence for 482, 490 and H30; incomplete NaPTAN stop coverage at `40004402007A`.
- Waltham map-on/map-off Word, standalone A3 map, Browser/Word parity, acknowledgements and export contracts passed.

### Verification and remaining acceptance

- `node tests/atlas/run-all.mjs` passed against the complete immutable Run #75 checkout and frozen TfL iBus index, ending `ATLAS Alpha.15 deterministic suite passed.` Focused topology/fallback, endpoint authority, TNDS partial-calendar and no-Sunday tests passed. The full suite retained 657 school-day-only, 16C Sunday-only, PE1 415 Wednesday-only, Pipers 230, PE1 202, Waltham, Long Lane and Wycliffe controls.
- Dependabot remains the existing dependency automation. Codecov, OpenSSF Scorecard, Sentry and Renovate were reviewed but not installed or configured. Renovate remains deferred to avoid overlapping dependency automation.
- Product Owner manual acceptance has not occurred. Before release, replay every Tufton route/direction with captured TfL responses, confirm both exact Route 158 planner rows and live Sources & Checks reconciliation, then obtain Product Owner review. No main edit, merge, tag, publication, updater run or data refresh occurred.

### 3 November 2026 Product Owner rejection: Tufton and Pipers closeout continuation

The Product Owner rejected candidate `23e8d9ba5c5c334e52c53b7e806fd548f7c3a058` after a live Tufton assessment still showed Route 158 towards Chingford Mount as unresolved and 15 Sources & Checks items. Pipers Route 231 retained its corrected weekday/Saturday calendar, but internal partial-calendar language had leaked into planner rows and qualifications for TNDS evidence.

#### Tufton live evidence and unresolved reproduction gate

The final read-only headless Edge check on the ATLAS local origin called TfL at the Tufton control (`51.613869, -0.020303`, 700 m) at `2026-11-03T09:25:13Z`. TfL returned 28 StopPoints, including 11 StopPoint identities served by Route 158. Of the 11 requested route numbers, 10 appeared on returned TfL StopPoints; 397A did not. This StopPoint-only check is not the complete route/timetable assessment. Stop C (`490005180C`) timetable returned HTTP 200; Stop E (`490005180E`) returned HTTP 400 with `No direction could be found for stop: 490005180E on line: 158. The line may not serve this stop.` Route metadata returned two sections: inbound Stratford Bus Station (`490012904A`) to Chingford Mount Stop E, and outbound Chingford Mount Stop C to Stratford Bus Station (`490012904N`). The inbound and outbound route-sequence requests each returned HTTP 200 with one sequence.

Those live bodies were replayed through the current timetable and principal-location builders with the immutable Run #75 fallback evidence. For the 11 TfL StopPoints carrying Route 158, the adapter attached ordered TfL topology to the BODS fallback and the final summaries resolved both `towards Stratford Bus Station` and `towards Chingford Mount`; the latter uses `Chingford Mount` as its principal location. The Stratford-bound row remains separately derived from its own direction's ordered pattern. The Stop E BODS timetable remains explicitly `BODS fallback after TfL failure`; the captured topology was not treated as a scheduled TfL journey.

This does **not** reproduce the Product Owner's reported unresolved row or 15-item review list. The earlier captured-response replay's one-stop fixture also resolved, and the 11-stop adapter replay with the current live bodies resolves. The original full browser attempt did not produce result rows within its 10-minute wait. Therefore the exact live failure, the sequence/section ambiguity said to defeat the previous `23e8d9b` matcher, the full 11-route audit, and the exact Product Owner Sources & Checks list remain unverified. No Route 158 logic was changed, and no fixture is claimed to reproduce the rejection. The temporary direct-response capture is local diagnostic evidence only (`tmp/tufton-live-final-check.json`); it has not been promoted as a regression fixture because it does not encode the reported failure.

The previous topology matcher requires exactly one matching route section and one unique ordered sequence. The available live Route 158 evidence satisfies those conditions for the failed Stop E timetable. It does not establish why the Product Owner's application run selected or retained unresolved evidence. Additional accepted application-level evidence is required before changing this generic authority rule or claiming a root cause. **Tufton remains a release blocker.**

#### Pipers calendar presentation correction

Calendar conflict reconciliation still conservatively restricts TNDS operating days and keeps the original partial profiles in `calendarReconciliation`. It no longer adds an engineering warning to `serviceNotes` or `sourceWarnings`, and planner-row note assembly filters internal calendar-reconciliation language. A TNDS-only conflicting operating-day population now produces one concise route-level Sources & Checks item. If a safe BODS row already covers the same route and assessed StopPoints, an unrelated TNDS calendar conflict does not add a second planner-facing calendar warning.

The headless Run #75 Pipers Browser/Word replay at 700 m after the correction shows:

- One Route 230 BODS/Centrebus circular row, from Lyons Community Centre back to Lyons Community Centre; Monday–Saturday about hourly, no Sunday service; no internal calendar note. The prepared-data diagnostic still retains a separate open TNDS Route 230 projection in source-level evidence, but the Browser and Word planner tables expose only the BODS circular row.
- Route 231 towards Dunstable Asda: Mon–Fri 3 journeys/day, Saturday 2 journeys/day, no Sunday service.
- Route 231 towards Pepperstock: Mon–Fri 4 journeys/day, Saturday 1 journey/day, no Sunday service.
- Route 231 remains TNDS-only. The two directions share exactly one Sources & Checks item: `Route 231 operating-day records conflicted. ATLAS retained the supported days; verify the operator timetable before formal use.`

The exact Pipers 700 m Sources & Checks list contains two items: the Route 231 operating-day review above, and `Stop 021013524 · NaPTAN: Stop-source coverage was incomplete; the returned stop set does not establish an authoritative zero-stop conclusion.` The 1,200 m Route 46 Browser/Word replay shows two BODS/Centrebus directions and one TNDS/Centrebus South same-direction row; none exposes calendar-conflict wording. Its Sources & Checks list is the same two items, and the Word export has no internal calendar language. Focused tests cover conflict provenance, conservative Route 231 days, BODS-primary/supplementary-TNDS presentation, one grouped Route 231 review item, and prohibited internal wording in Browser and Word table outputs.

#### Verification and status

`node tests/atlas/run-all.mjs` passed with the immutable Run #75 Bus manifest (`1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f`) selected for the prepared-data integrity test and browser-test temporary files directed into the writable worktree. The full suite ended `ATLAS Alpha.15 deterministic suite passed.` The initial sandboxed run could not rename a temp shard in the protected system temp directory; the rerun used the permitted repository `tmp` directory and required local browser loopback access. Focused TNDS calendar, Browser/Word table, route-review deduplication and syntax checks passed. No live evidence fixture for the reported Tufton failure, full live cross-site browser replay, or Route 46 1,200 m Pipers acceptance replay is available from this continuation.

The candidate is **not ready for Product Owner re-acceptance**. Manual follow-up must first identify the exact live Route 158 record/evidence that produced the unresolved row and 15-item list, then capture the same complete Tufton assessment and verify the exact Route 230/231/46 Browser and Word presentation. No commit, push, merge, tag, release, publication or data refresh was made in this continuation; frozen `main` remains `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`.

### 3 November 2026 Tufton full-browser orchestration diagnosis and correction

This section supersedes the earlier statements above that no Route 158 logic was changed and that full-browser Tufton evidence was unavailable. The preserved Pipers edits were checkpointed before this work in `tmp/atlas-tufton-orchestration-pipers-recovery.patch` (SHA-256 `3376f729f4f4f83a559e91e84409b58fa5f6d5ec386258ce4a4133abbe467388`). They remain intact.

#### Full application trace and first divergence

The local URL `http://127.0.0.1:8771/atlas/?review=v2#bus` served **ATLAS Bus Assessment 2.0.0-beta.1**, not Beta.2. Its review status manifest also returned 404. Therefore this trace can diagnose the current local application path but cannot reproduce or certify the Product Owner's exact Beta.2 result.

At `51.613869, -0.020303` and 700 m, the completed browser assessment discovered 28 stops, 11 routes and 98 route/stop pairs. All 98 detailed pairs were processed across five batches; none was unprocessed. The user-facing safe-pair prompt is a staging/continue gate, not a request cap. The trace made 122 TfL calls and 22 route-sequence requests; the Route metadata request succeeded, and both Route 158 direction sequences returned HTTP 200. The Stop E timetable for 158 returned HTTP 400 while the Stop C timetable returned HTTP 200. Two OSRM requests succeeded. No application request was lost to pair limits, and sequence evidence was available in the failed-direction fallback path.

The exact first data divergence was inside `buildServiceSummaries`: the incoming Route 158 Stop E BODS fallback contained its full ordered 44-call pattern, seven locality values, and resolved sidecar with matching TfL topology endpoints. At the terminal assessed call, the summary builder reduced principal locations to `Chingford Mount` because it found no downstream calls. Endpoint resolution retained that reduced list and the planner still marked it resolved. The regression now covers the entire application path from the failed TfL timetable and successful sequence through fallback orchestration, service summary, planner summary and review generation. It asserts that the supported BODS localities survive and that the schedule stays BODS-authoritative.

The minimal correction in `src/atlas/domain/bus-service-assessment.mjs` retains the national pattern's localities and appends the proven destination only for a resolved, topology-only timetable-fallback sidecar whose full pattern endpoints exactly match both TfL topology and the source's ordered endpoints, when the assessed call is the terminal. It does not derive scheduled TfL journeys. Ambiguous, mismatched and incomplete topology remains subject to existing unresolved behavior.

#### Browser runtime, request scope and state

The earlier run exceeding ten minutes was caused by the diagnostic harness waiting for a terminal result without activating the app's explicit “Continue full assessment” staging action. Once continued, the first complete assessment took 162.6 seconds; the corrected full-browser run took 141.9 seconds. The app was not deadlocked. The 45-request/minute scheduler paced the full request set, and the 98-pair limit staged a user continuation rather than omitting pairs. No evidence showed repeated route metadata, late sequence evidence, or request-limit warning explosion. This is the measured runtime for the current local build; no Product Owner runtime target was available to compare against.

Cache/state checks produced equivalent Route 158 rows and the same two review items in all three modes: fresh context (122 TfL calls, 150.3 s), persistent context with cache (93 calls, 136.3 s), and force refresh (122 calls, 167.0 s). The source-result cache uses namespace `atlas.alpha13` with a five-minute TTL; the valid same-context repeat had 30 parseable entries. Cache state changed request count and elapsed time, but not Route 158 output or review count. No generic cache change was made.

#### Route 158 browser result and review items

After the correction, the full browser planner showed these exact principal-location rows:

- Inbound, Stratford Bus Station to Chingford Mount: Stratford New Town, Leyton, Walthamstow Central, Walthamstow, Blackhorse Road, Higham Hill, Highams Park, Chingford Mount. The timetable source remains `BODS fallback after TfL failure`.
- Outbound, Chingford Mount to Stratford Bus Station: Ainslie Wood Road, Higham Hill Road, St James's Street Station, Grange Park Road, Stratford Bus Station. Its existing TfL timetable evidence and row remain unchanged.

The corrected run showed two Sources & Checks items, not the reported 15: (1) W16 at Stop E, because the complete ordered call pattern for that service was unavailable; and (2) one generic TfL scheduled-timetable availability warning. No Route 158 principal-location review remained. Since the served page is Beta.1 and did not produce the reported 15 items, the exact cause of that Product Owner list is still unknown. The code correction resolves the traced terminal-locality loss in the current app but is not evidence that the exact Beta.2 rejection has been reproduced. Route 397A remains eligible from national evidence; it was not required to appear in the TfL StopPoint response.

#### Preserved Pipers result and cross-site verification

The post-correction Pipers Browser/Word audit retained the prior accepted behavior. At 700 m, Route 230 is one clean Centrebus circular row, Monday–Saturday about hourly and no Sunday service; Route 231 remains 3 weekday and 2 Saturday journeys towards Dunstable Asda, and 4 weekday and 1 Saturday journey towards Pepperstock, with no Sunday service. Neither planner rows nor Word tables expose internal calendar-profile wording. Sources & Checks contains exactly two items: the Route 231 operating-day conflict review and the incomplete NaPTAN stop-coverage item. At the 1,200 m control, Route 46 retains two Centrebus directions and one same-direction Centrebus South row, without calendar-conflict wording; its Sources & Checks has the same two items. Browser/Word results matched.

#### Wycliffe and Milton Keynes Route 5 Browser/Word replays

The Wycliffe replay used the Run #75 control `Stroud, GL5 3DS` (`51.745347, -2.218151`, 1,400 m). Browser and Word presented the same principal rows: Stagecoach West route 62 towards Stonehouse (Horsemarling Lane), route 64 towards Merrywalks and Gloucester Transport Hub arrival, and route 65 towards Dursley (Long Street). All three showed BODS as the timetable source, and no internal calendar-reconciliation wording appeared in their table rows. The exact six Sources & Checks items were: Route 72SN operating-day conflict; Route 72SS operating-day conflict; incomplete prepared timetable evidence at stop `1600FLX49`; unresolved ordered calls for BODS routes BG3 and KBC301; and incomplete NaPTAN coverage at stop `1600GLA36781`. None concerned routes 62, 64 or 65.

The Milton Keynes Route 5 replay used `52.040000, -0.760000`, 700 m, on the same immutable Run #75 manifests. The browser and Word tables each contained exactly two rows: Arriva Beds and Bucks towards Water Eaton (Buttermere Close), and Arriva Beds and Bucks towards Wolverton Tesco. Each final planner row retained one BODS record plus its matching TNDS source records, and BODS remained the displayed primary source. The Browser/Word principal locations and direction labels matched; Route 5 had no duplicate peer row or route-specific review item. Underlying composition included 2 BODS and 44 TNDS raw Route 5 records, reconciled into the two directions. The complete control had 20 unrelated Sources & Checks items: operating-day conflicts for 34, 134, FL4 and VL6; unresolved operator evidence for 100; complex special-day evidence for C1, C3, X2 and X3; incomplete ordered calls for 3, 3A, C10, C11, MK1, X5, X14 and X33; two LOOP endpoint-identity reviews; and incomplete NaPTAN stop coverage. No item concerned Route 5.

The broad deterministic Browser/Word audit completed all eight controls (Pipers 700 m, Pipers Route 46 1,200 m, Waltham cross and nearest-stop, Long Lane Route 203, Chingford, Hoddesdon, and PE1) with zero audit failures, browser errors or failed requests. Wycliffe and Route 5 Browser/Word replays also completed with zero audit failures, browser errors or failed requests. The immutable Run #75 `node tests/atlas/run-all.mjs` suite passed and ended `ATLAS Alpha.15 deterministic suite passed.` The dedicated review-environment browser test passed formal acknowledgement gating and produced four map exports (normal, nearest-stop group, nearest-stop group after pan/zoom, and spread-stop). Syntax and `git diff --check` checks passed.

The preserved Pipers changes, Tufton correction, regression coverage and this hardening record have passed their automated checkpoint gates. Starting candidate HEAD remains `23e8d9ba5c5c334e52c53b7e806fd548f7c3a058`; frozen `main` and `origin/main` remain `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. Product Owner acceptance has not occurred. This checkpoint is an engineering candidate only; no merge, tag, public release, publication, updater, or data refresh is authorized here. GitHub tooling review: Dependabot remains the existing weekly updater; Codecov, OpenSSF Scorecard and Sentry were not adopted; Renovate remains deferred to avoid overlapping Dependabot. No tooling was installed or configured.

## Full product recovery continuation (2026-11-03)

### Starting state and candidate handling

- Starting local HEAD: `d556898bd4550653a26be1a3ec4d079b839f9085`, branch `codex/atlas-bus-beta2-known-defects-hardening`; the remote hardening branch was at the same SHA at the start of this continuation.
- Frozen local `main` and `origin/main`: `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`.
- Starting worktree was clean. Current changes remain uncommitted and unpushed because the actual Tufton review-v2 replay still has a material Route W16 principal-location review and live TfL timetable failures. No merge, tag, release, updater, publication or data refresh occurred.
- Prepared Run #75 Bus and TNDS hashes remain `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f` and `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`.

### Tufton stop identity and route evidence

The current full review-v2 replay used `51.613869, -0.020303`, 700 m. The live TfL response contained 28 StopPoints, 26 within the requested radius; exact prepared StopArea completion yielded 28 discovered/grouped/selected physical records. No same-name merge removed Stop E. The prior Product Owner report's approximately 11 reportable stops / 10 routes is not reproduced by this current live response; no old raw response was available to compare record-for-record.

| Physical StopPoint | Indicator | Distance | Current exact route evidence |
|---|---:|---:|---|
| `490005180E` | Stop E | 426 m | TfL routes 97, 158, 215, 397, N26, W16; exact NaPTAN adds BODS-only 397A |
| `490005180C` | Stop C | 397 m | TfL routes 158, W16 |
| `490005178K` | Brook Crescent K | 409 m | TfL routes 357, 444, W16 |
| `490005178H` | Brook Crescent H | 487 m | TfL routes 357, 444, 657, W16 |
| `490005180S` | `->S`, Chingford Mount | 415 m | live TfL and exact physical record show no routes; retained as a distinct no-route stop and excluded from service rows |

Stop `490005180S` is not Stop E. The source IDs and coordinates differ (`490005180S`: 51.61732, -0.01800; `490005180E`: 51.61732, -0.01761). TfL returned an empty `lines` list for S. ATLAS retains that stop without inventing a line, while E remains independently discovered and service-eligible. The old approximately 462 m wording is not an exact identity; the current live record is 415 m from the supplied point.

At exact Stop E, immutable Run #75 NaPTAN lists route 397A. Run #75 BODS GTFS and TNDS both have matching Central Connect weekday timetable evidence there (one departure at 21:21; no Saturday/Sunday service). TfL's current StopPoint response does not list 397A. Generic exact-ID reconciliation now unions route associations while preserving TfL for TfL-listed routes and assigning BODS to NaPTAN-only routes. London orchestration excludes explicit non-TfL-only routes from TfL's batched metadata/timetable calls and retains their scheduled national evidence at the exact stop. In the first live rerun, sending the newly discovered 397A to the batched TfL route metadata endpoint caused a 404 that also prevented Route 158 topology resolution. That was corrected by authority-scoping TfL requests; no route or operator is hardcoded.

### Route 158 and presentation root cause

The first product-path divergence remains the UI recalculation: `currentBusResult.plannerServiceSummaries` already contains endpoint-resolved rows, but `selectedResult()` and `renderAssessment()` rebuilt planner summaries from raw `serviceSummaries`. That dropped the resolved full chain before Browser and Word presentation. A shared result helper now preserves the resolved rows and provides compatibility for results that do not include them.

The current actual review-v2 Browser and Word export both show the Chingford-bound Route 158 locations in order: **Stratford New Town, Leyton, Walthamstow Central, Walthamstow, Blackhorse Road, Higham Hill, Highams Park, Chingford Mount**. Both directions remain distinct. The displayed operator is Arriva London North. Stop E's live TfL timetable request returned HTTP 400, so the timetable fallback is transparently national evidence; ordered TfL route topology resolved the location chain, without treating topology as a TfL timetable.

The same full review also exposed Route W16's unresolved fallback principal pattern. Sources & Checks contains two items: the Route W16 principal-location evidence item at Stop E and one assessment-level TfL timetable warning. The current run completed assessment and enabled acknowledgement/export, but this unresolved Route W16 result is a material acceptance failure, not a clean Tufton pass. Live TfL returned HTTP 400 for `158/Timetable/490005180E` and `W16/Timetable/490005180E`; these outcomes are retained and not converted to zero service. Current Route 158 Browser and Word operators are Arriva London North. Current route 397A appears in both planner directions as Central Connect, source BODS.

### Review-v2 root and Pipers actual application replay

The prior Pipers `inspectScope` failure was reproduced against the actual review-v2 application before timetable assessment. The temporary review wrapper mounted the candidate checkout itself where the server expected the directory containing immediate `bus/` and `bus-tnds/` roots. That produced HTTP 404 for the required manifest path. Mounting the alternate Run #75 checkout initially failed the server's realpath containment check because its TNDS directory was a junction outside the root. Mounting the complete physical Run #75 directory fixed both routes; Bus and TNDS manifest requests now return HTTP 200 with the expected hashes. This review-server adjustment lives under ignored `tmp/`; it is not part of the application commit.

The full actual review-v2 Pipers replay used `51.852700, -0.454343`, 700 m, a fresh headless Edge context, live timetable/routing sources and only a pinned geocoder response. `inspectScope` succeeded (11 stops, 1 discovered route, 2 route-stop pairs); the full assessment completed with 11 selected stops. Browser and Word both contain exactly one Route 230 circular Centrebus/BODS row (Monday–Saturday about hourly, no Sunday) and two distinct Route 231 TNDS/South Beds Dial-a-Ride directions: Dunstable Asda (Mon–Fri 3/day, Saturday 2/day, no Sunday) and Pepperstock (Mon–Fri 4/day, Saturday 1/day, no Sunday). Exactly one planner-actionable Route 231 calendar item remains. No internal parser or calendar-reconciliation wording appears in those rendered rows. Acknowledgement succeeded, Word export succeeded, map export succeeded (729,067 bytes), and the run had no page exceptions or failed requests.

### Automated path, baseline and current-control matrix

The previous fixture-based manual audit did not represent the exact Product Owner execution environment. In this continuation, Tufton and Pipers were run in the actual `/atlas/?review=v2#bus` application with the corrected physical Run #75 mount, production app bundle/adapters, live TfL and OSRM, real prepared manifests/shards/reference assets, workflow continuation, Browser summary and downloaded Word/map artifacts. The one intentional test substitution was the geocoder response to pin each supplied control coordinate. These diagnostic scripts are temporary and are not an integrated nine-control acceptance harness; therefore path equivalence for final release is **NO**.

| Control | Current continuation status | Evidence / limitation |
|---|---|---|
| Tufton | **FAIL** | Actual review-v2 assessment completes; Route 158 Browser/Word chain and 397A are restored; Route W16 remains unresolved and live TfL returned two 400 responses; Sources & Checks has 2 items. |
| Pipers | **PASS** | Actual review-v2 full assessment; 11 stops; 230 and both 231 directions match across Browser/Word; one calendar item; acknowledgement and map export passed. |
| Waltham Cross | **NOT EXERCISED** | Earlier closeout evidence exists, but this candidate's full actual review-v2 path was not replayed in this continuation. |
| Grove Road / Chingford | **NOT EXERCISED** | Not fully replayed through the actual review-v2 assessment and export flow in this continuation. |
| Long Lane | **NOT EXERCISED** | Earlier offline/Browser controls exist; not replayed through this candidate's current live review-v2 flow here. |
| Hoddesdon | **NOT EXERCISED** | Earlier deterministic Browser/Word evidence exists; no current actual review-v2 replay here. |
| Wycliffe | **NOT EXERCISED** | Earlier Browser/Word evidence exists; no current actual review-v2 replay here. |
| Milton Keynes Route 5 | **NOT EXERCISED** | Earlier Browser/Word evidence exists; no current actual review-v2 replay here. |
| PE1 | **NOT EXERCISED** | Earlier Browser/Word evidence exists; no current actual review-v2 replay here. |

Frozen Beta.1 core behavior and the complete Beta.2 retention matrix have not been re-exercised across all nine actual application controls in this continuation. Existing deterministic regression coverage remains in the suite, but it cannot replace those product-path replays. Prior documented cross-site results remain historical evidence, not a current release gate.

### Verification, files and release status

`node tests/atlas/run-all.mjs` passed against the immutable Run #75 Bus root and ended `ATLAS Alpha.15 deterministic suite passed.` This run included the UI contract correction for `plannerServiceSummariesForResult`. Focused stop identity/route-association, authoritative timetable orchestration, and planner-summary tests passed. Actual Tufton and Pipers Browser/Word parity, acknowledgements and map exports were checked as described above. `git diff --check` and syntax checks must be repeated after final edits.

Tracked files currently changed: `atlas/assets/js/app.mjs`; `src/atlas/adapters/authoritative-bus-timetable-adapter.mjs`; `src/atlas/application/bus-stop-discovery.mjs`; `src/atlas/domain/bus-planner-summary.mjs`; and tests `bus-alpha13-planner-summary.test.mjs`, `bus-stop-structure.test.mjs`, `bus-ui-contract.test.mjs`, `review-environment.test.mjs`, `tfl-bus-timetable.test.mjs`. No code or documentation checkpoint was committed or pushed. Manual Product Owner re-acceptance remains outstanding and has not been performed.

GitHub tooling adoption review remains: Dependabot is configured for weekly npm and GitHub Actions updates; Codecov, OpenSSF Scorecard and Sentry were not adopted; Renovate remains deferred to avoid overlapping dependency automation. No tooling was installed.

**PRODUCT OWNER PATH AND AUTOMATED ACCEPTANCE PATH ARE MATERIALLY EQUIVALENT — NO**

**READY FOR FINAL BETA.2 PRODUCT OWNER RE-ACCEPTANCE — NO**

## Product Owner rejection evidence correction continuation (2026-11-06)

### Evidence and starting state

- Inspected all five supplied Word assessments and four screenshots before editing. They were treated as defect reports and regression examples, not golden output. The Word files were parsed for route, stop, frequency, principal-location and source notes; screenshots were checked for the rendered Sources & Checks and stop-route wording.
- Confirmed the candidate starts at SHA db6717f1f9c52a83525f32fe01e85afc86ade8c5 with a clean worktree before changes. main and origin/main remain frozen at 8f1d8ae50405ec4acf38dd66d6c8f60896a5649e. The existing accepted Beta.1 endpoint remains 108d898221f84c78c061db4f81335dcd911d6a0e. No dataset refresh, merge, tag, release, publication or updater work occurred.
- The user-required application reproduction was completed before this correction in the existing full review-v2 workflow. It reproduced stop-wide timetable wording, exact route-stop failures being suppressed by another stop's successful route request, premature destination insertion ahead of downstream principal locations, endpoint evidence warnings on Routes 16/16C at 210021703430, a Route 231/TNDS day conflict at 021013516, and six unsupported Route N555 special-day profiles. A correct control was preserved: the two Route 65 corridors toward Dursley remain materially distinct.

### Corrections and controlled replays

- Timetable review evidence is now attached to the exact selected route and stop, carries the unresolved provider, and keeps an exact-stop BODS fallback labelled as BODS. A successful request for the same public route at another stop no longer suppresses this issue. A recorded route with no current exact-stop match gets its own review item without making an absence claim elsewhere.
- Stop route lists in Browser and Word no longer inherit another route's warning. Both use the same heading, “Routes recorded or matched at stop”; detailed qualifications remain in Sources & Checks with the affected route/stop/provider.
- Principal locations retain the ordered downstream calls before appending an exact verified destination. The change is topology-based and route-neutral; endpoint clipping and circular handling remain covered.
- Cross-provider arbitration now ignores provider-specific pattern identifiers only when each supplied variant has an exact or high-similarity ordered corridor match and compatible calendar evidence. Material branches, different operators, and conflicting explicit calendar profiles remain distinct. BODS stays primary and TNDS departures are not added to its schedule.
- The deterministic immutable Run #75 Pipers Route 46 replay after the change reports 25 stops, 2 route numbers, 10 route-stop pairs, 3 Route 46 service summaries and 2 planner rows (previously 3 Route 46 planner rows). The selected outbound summary is the BODS-primary Park Square → Bridge Street service; the unrelated return and Ridgedown short-working remain separate. The diagnostic reports no deterministic TfL live requests and does not claim browser or Word parity.
- Focused suites passing after these edits: alpha12-source-completeness, bus-robustness-1b-national-planner-trust, bus-presentation, bus-ui-contract, bus-service-assessment (22), bus-word-export, bus-qa-01-acceptance, bus-robustness-1a4e-c2-endpoint-semantics, and the new bus-timetable-merge-semantic tests.
- alpha12-evidence-integrity-audit could not complete in the restricted run because Windows denied the test's temporary atomic rename (EPERM). bus-timetable-merge.test could not start because this checkout has no atlas/data/bus-tnds/manifest.json; its immutable data root is external. The complete tests/atlas/run-all.mjs attempt stopped at tnds-runtime-shard-browser.test.mjs because the playwright module is not installed. The user-required test gate therefore remains incomplete. git diff --check reported no whitespace errors.

### Review and release disposition

- This worktree is intentionally uncommitted at db6717f; current corrections remain a dirty worktree. No commit or push is authorized by the supplied prompt until its complete engineering gates pass.
- The local review endpoint http://127.0.0.1:8771/atlas/?review=v2#bus could not be reached from this restricted runtime (localhost socket access denied). No claim is made that it serves the edited worktree, nor were post-correction full Browser/Word exports or all ten review-v2 controls verified.
- Exact Browser/Word row parity, all ten review-v2 controls, complete Run #75 regression, immutable Beta.1 comparison, and the GitHub tooling review remain required gates. The new deterministic Pipers Route 46 diagnostic is not a substitute for those full-app checks.
- No changes were made to main, national data, updater workflows, publication, release, or deployment state.

**READY FOR FINAL BETA.2 PRODUCT OWNER RE-ACCEPTANCE — NO**

## Final evidence triage and controlled closeout (2026-11-06)

This section supersedes earlier same-day statements above where the full ten-control replay or the new exact-response classification produced a later result. This is a source/evidence closeout; it does not authorize release.

### Repository and preserved candidate

- Starting and current committed HEAD: `d556898bd4550653a26be1a3ec4d079b839f9085`, on `codex/atlas-bus-beta2-known-defects-hardening`; the candidate parent is `23e8d9ba5c5c334e52c53b7e806fd548f7c3a058`. The previous report's `23e8d9b` remote value was a stale remote-tracking observation of the parent, not GitHub's branch tip. Read-only GitHub `ls-remote` now reports the branch at `d556898`. This worktree has no configured upstream. Local `main` and `origin/main` remain `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`.
- No commit or push was made. The candidate worktree remains dirty with the previously reviewed corrections, their regression coverage, and this documentation. The existing recovery artifact was reverified at `tmp/atlas-beta2-final-recovery-final-2026-11-06.patch` (SHA-256 `2D386494D20B693F7E96E3FD49FCE227587B5864EDECEB2BED41AE4E2C64D519`). A separate fresh patch is generated after this documentation edit and recorded in the handover; the prior artifact is preserved.
- Immutable Run #75 Bus/TNDS manifest hashes remain `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f` and `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`. No national refresh or `main` update occurred.

### Waltham Cross: exact TfL 400 responses and present result

The six observed HTTP 400s were TfL's explicit not-served/no-direction response, not provider outages. They concern the same assessed point, StopPoint `210021703440` (Bus Station adj.), for routes 217, 279, 317, 327, 491 and N279. For each URI below, the response body was: `No direction could be found for stop: 210021703440 on line: {route}. The line may not serve this stop.`

- `/Line/217/Timetable/210021703440`
- `/Line/279/Timetable/210021703440`
- `/Line/317/Timetable/210021703440`
- `/Line/327/Timetable/210021703440`
- `/Line/491/Timetable/210021703440`
- `/Line/N279/Timetable/210021703440`

The narrow TfL adapter correction recognizes only that exact API error form as `NO_CURRENT_MATCH`, and keeps the status and body in provider diagnostics. Other 400s and all 500s remain failures. TfL has authority for these routes at other returned London StopPoints, and the adapter continues the route-level cross-boundary checks there. BODS/TNDS stop records and timetables remain their own primary evidence for routes with national route authority; no zero-service conclusion was invented. The current full review-v2 replay has no HTTP failure classification for those six calls, no generic TfL outage warnings, and a **complete** assessment with only these two current review items:

1. `Route 16 · Stop 210021703430 · BODS: Destination endpoint decision requires review: Generic source endpoint was retained because no exact endpoint identity was available; no place was inferred.`
2. `Route 16C · Stop 210021703430 · BODS: Destination endpoint decision requires review: Generic source endpoint was retained because no exact endpoint identity was available; no place was inferred.`

For reconciliation, the prior four-item presentation was those two endpoint items plus the two generic messages below, which the new exact response classification retired because they falsely described the six 400s as failed timetable checks:

- `TfL scheduled timetable information could not be checked for one or more services. ATLAS retained available authoritative results and used matching national timetable evidence where available. Review the affected service evidence before formal use.`
- `TfL scheduled timetable information could not be checked for one or more services, and no defensible national fallback was available. ATLAS did not assume zero service; review the incomplete evidence before formal use.`

Current Browser rows retain routes 16, 16C, 212, 217, both distinct 242 operators, 279, 310, 317, 327, 491 and N279. 16C remains Sunday-only; 212 retains four source departures on Mon–Sat and no Sunday on the frozen record; both 242 operators remain distinct. Browser/Word parity passed. The two generic endpoint items are still reviewable material source limitations; the complete label does not waive them.

### Long Lane: transient 500s, current six-to-two reconciliation

The earlier replay's three TfL HTTP 500s were transient requests for routes 482/490 at Cargo Centre N/S StopPoints `490004355N` and `490004355S`. No such failures recurred in the current full replay and available fallbacks remained source-labelled. The previous six-item Sources & Checks state was made up of the two items still present (Route 555 and N555 complex TNDS `SpecialDaysOperation` calendars at stops `40004402007A, 40004402007B`), the former Route 490 (`490011966W`) and H30 (`490004355N`) principal-call mapping warnings, and the two generic timetable-failure messages that had described the three 500s. In the current result only the exact two calendar items remain:

- `Route 555 · Stop 40004402007A, 40004402007B · TNDS: TNDS supplied 6 timetable patterns with unsupported complex special-day operating profiles; operating days remain unresolved and no timetable days were fabricated.`
- `Route N555 · Stop 40004402007A, 40004402007B · TNDS: TNDS supplied 6 timetable patterns with unsupported complex special-day operating profiles; operating days remain unresolved and no timetable days were fabricated.`

Current status is **complete**, with 14 planner rows, no HTTP failures, and the two source-calendar review items. Route 203 has two TfL-primary rows. Its final Browser frequencies are toward Elmsleigh: Mon–Sat ~20–25 min, Sun ~27 min; toward Hounslow: Mon–Fri ~20–25 min, Sat ~20–30 min, Sun ~29 min. Route 555 retains the White Bus Services Hatton Cross dominant main pattern at Long Lane (about 30–40 minutes Mon–Fri and 30–35 minutes Sat–Sun) and the Heathrow Central continuation note: `Less frequent journeys continue beyond Hatton Cross Station to Heathrow Central Bus Station.` The Heathrow continuation is evidence-backed at 7 frozen journeys against 30 Hatton Cross journeys. N555 remains Hallmark Connections Ltd, TNDS-sourced, with calendar qualification: days are not fully confirmed. Do not claim the old six warnings remain current, or treat the two unresolved complex calendars as harmless.

### Wycliffe Route 64 and Hoddesdon Route 33

- Route 64 toward Merrywalks presents `Stroud Merrywalks A` because the exact selected BODS pattern ends at the assessed terminal StopPoint; its full ordered sequence has no calls after the selected terminal and therefore no downstream locality chain to summarize. The complete ordered sidecar evidence and exact terminal identity agree. The opposite direction retains `Stroud → Cainscross → Ebley → Ryeford → Stonehouse → Oldend → Gloucester → Tredworth → St Pauls`. This is a legitimate terminal-only directional result, not a reason to hardcode Route 64. Wycliffe remains **partial** for unrelated Route 72SN/72SS calendar conflicts and a missing `1600F` timetable shard at `1600FLX49`; those are unresolved source limitations, not proof that Route 64 is defective.
- Hoddesdon Route 33 toward Sainsbury's was a software defect: the assessment selected an ordered call pattern but planner summarization discarded its complete exact-ID locality sidecar. The generic fallback now consumes it only when every ordered StopPoint ID exactly matches. The regression includes a blank unmapped upstream label and rejects any sequence mismatch. Current Run #75 replay resolves both Route 33 directions, including the downstream Sainsbury's endpoint, without inferred places; the assessment is complete with no Route 33 review item.

### PE1 and Tufton/Pipers warning integrity

- PE1's exact remaining items are `Route 4P · Stop 0590PQG20 · BODS: Principal locations could not be safely mapped because a complete ordered call pattern is unavailable; review the source journey pattern.` and `Route 102 · Stop 2700LMDT2386 · TNDS: Destination endpoint decision requires review: Exact endpoint evidence contains materially conflicting place identities; the strongest safe source presentation was retained for technical review.` These are unresolved source evidence, not defects proven by this replay. The two Delaine Route 202 branches (Austerby and Bourne) and genuine service identities remain; Route 415 remains Wednesday-only in the underlying reviewed golden, with its one Wednesday journey and no inferred other-day service. Browser/Word parity passed; the current live-snapshot replay has two review items and is complete, which does not clear them.
- Tufton 158 still has both Arriva London North directions; W16 has both Stagecoach London directions; 397A remains two Central Connect BODS/TNDS directions. Exact TfL 400s for 158 and W16 at Stop E `490005180E` say `No direction could be found for stop: 490005180E on line: {route}. The line may not serve this stop.` The recovered topology is used for locations only, while TfL/BODS timetable source labels stay truthful. One further full Tufton replay traced the generic Sources & Checks warning to W11 outbound, assessed at StopPoint `490009752E`, across ordinary, school-day and non-school-day service profiles. The service carries `material-identity-ambiguity` for `direction`, `principalLocations` and `routePatternStopIds`; TfL route metadata is incomplete, so BODS cannot safely resolve the TfL identity. Operator presentation is Stagecoach London by unanimous BODS supplementary evidence, but timetable authority remains `TfL + BODS supplementary`; principal places are `Walthamstow Stadium, Cecil Road, North Countess Road`. The exact visible warning is `TfL and supplementary national evidence disagree on an unresolved route identity for one or more London services. ATLAS retained the authoritative TfL schedule; inspect the affected service evidence before formal use.` It is a material unresolved source conflict. Although the screen says complete and shows zero review items, the warning prevents acceptance; do not omit or waive it. 158/W16 diagnostic differences are audit-only and are not the source of this warning.
- Pipers 700 m and Route 46 1,200 m controls complete with one Route 231 calendar review each. Route 230 stays one Centrebus circular service, Mon–Sat about hourly, no Sunday. Route 231 remains South Beds Dial-a-Ride with 3 weekday / 2 Saturday Dunstable journeys and 4 weekday / 1 Saturday Pepperstock journeys, no Sunday; internal calendar diagnostics are absent from Browser/Word row text. Sources & Checks fell from two items to one because the earlier NaPTAN incomplete-coverage warning is now supported by complete source evidence: `preparedNaPTANStructural.available` and prepared StopPoints are available, all requested IDs match, and `exactUnmatchedIds`, `unresolvedIds`, `missingIds` and `malformedIds` are empty. The warning was resolved through improved evidence completeness, not suppressed. The remaining Route 231 operating-day conflict is preserved.

### Direct Beta.1 baseline, ten actual review-v2 controls, and retention

The accepted Beta.1 baseline at `108d898221f84c78c061db4f81335dcd911d6a0e` was served from its isolated detached worktree without modifying its files. A fresh headless Pipers review-v2 workflow executed site selection, point confirmation, assessment setup, stop discovery, `inspectScope`, full assessment, result and Sources & Checks, then Word and map exports. It produced 11 stops, 1 route, 2 assessed pairs, 19 services and 3 Browser/Word rows; all 3 rows matched, map PDF downloaded (536,153 bytes), no HTTP or application errors occurred, and there was no acknowledgement gate because the result had no review items. This establishes representative core workflow parity, not a full cross-site Beta.1 replay or proof that live source values must match across versions. The script's only diagnostic note was that the Beta.1 assessment module predates the Beta.2 locality-sidecar hardening hook.

| Control | Final status | Current review items | Replay checks |
|---|---|---|---|
| Tufton 700 m | COMPLETE, **blocked by W11 material conflict** | Sources & Checks warning traces W11 outbound at `490009752E`; no review drawer item | 24 Browser/Word rows matched; map passed; no page errors; two exact TfL no-direction 400s |
| Pipers 700 m | COMPLETE with review | Route 231 TNDS calendar | 3/3 parity; acknowledgement and map passed |
| Pipers Route 46 1,200 m | COMPLETE with review | Route 231 TNDS calendar | 8/8 parity; acknowledgement and map passed |
| Waltham 700 m | COMPLETE with review | Route 16 and 16C generic destination endpoint identity | 20/20 parity; acknowledgement where gate shown; map passed; six TfL 400s are explicit no-current-match |
| Grove Road 250 m | COMPLETE | None | 8/8 parity; map passed; no acknowledgement gate applicable |
| Long Lane 400 m | COMPLETE with review | Route 555/N555 complex special-day calendars | 14/14 parity; acknowledgement and map passed; current replay has no HTTP failures |
| Hoddesdon 700 m | COMPLETE | No Route 33 review | 21/21 parity; acknowledgement and map passed |
| Wycliffe 1,400 m | PARTIAL | Route 72SN/72SS calendar conflicts and `1600F` shard unavailability | 54/54 parity; acknowledgement and map passed; partial is not a pass |
| MK5 700 m | COMPLETE with review | 11 route/calendar/operator/endpoint items outside Route 5 | 89/89 parity; acknowledgement and map passed |
| PE1 500 m | COMPLETE with review | Route 4P ordered pattern and Route 102 endpoint identity | 54/54 parity; acknowledgement and map passed |

All ten full app contexts executed the UI-driven discovery and assessment orchestration, common Browser/Word field comparison, map export, and acknowledgement where the review gate appeared. There were no application page errors or missing local data-root assets. HTTP 400s on Tufton and Waltham were source responses and are documented above. The Product Owner and headless workflow are materially equivalent for the tested workflow (**YES**); this does not mean Product Owner manual acceptance occurred.

| Retained golden | Result |
|---|---|
| Waltham 16/16C/212/217/242/279/310/317/327/491/N279 | **FAIL acceptance gate** — rows retained and six no-direction calls classified; generic 16/16C endpoints remain under review. |
| Grove Road 357/444/W16/657 | **PASS** — includes school-day-only 657, one journey each direction, no weekend. |
| Long Lane 203/555/N555 | **FAIL acceptance gate** — rows/weekend frequencies/555 extension retained; 555/N555 special-day calendars remain unresolved. |
| Pipers 230/231/46 | **FAIL acceptance gate** — rows/operators/directions retained; Route 231 calendar conflict remains disclosed. |
| Tufton 158/W16/397A | **FAIL acceptance gate** — routes/operators/directions/authority retained; W11 material identity conflict blocks acceptance. |
| Hoddesdon 33/310/907/907A | **PASS** — rows retained; Route 33 ordered-location defect corrected generically. |
| Wycliffe 62/64/65 | **FAIL acceptance gate** — rows retained and Route 64 terminal output is valid; unrelated source conflicts/shard make assessment partial. |
| MK5 Route 5 BODS/TNDS | **PASS for Route 5 golden** — two Arriva Beds and Bucks directions, no duplicate peer; unrelated 11 review items remain. |
| PE1 Route 202 branching and Route 415 | **FAIL acceptance gate** — branches/identity retained and Wednesday-only 415 source behavior preserved; 4P/102 reviews remain. |
| Source hierarchy, no fabricated service/calendar, operator and Browser/Word integrity | **PASS automated** — full deterministic suite and all ten parity checks passed; source-review blockers remain. |

### Tests, tooling and final disposition

- Focused source-adapter, TfL timetable, TfL operating-period, and bus-assessment regression tests passed. Full `node tests/atlas/run-all.mjs` passed against immutable Run #75 with `ATLAS_TEST_BUS_DATA_ROOT=../atlas-beta2-final-verification/atlas/data/bus`, ending `ATLAS Alpha.15 deterministic suite passed.` The first unpinned/default-root attempt failed on an old incomplete manifest; the Run #75-pinned execution is the passing result. Localhost test harness required the authorized loopback boundary.
- Browser/Word service-field parity passed in all ten current review-v2 controls. All ten map exports passed. Acknowledgement was checked where the review gate existed. Beta.1 representative replay also passed Word/map parity, with no acknowledgement needed.
- Dependabot is configured for weekly npm and GitHub Actions updates. Codecov, OpenSSF Scorecard, Sentry and Renovate remain uninstalled/unconfigured; no adoption milestone was reached and none was installed in this sprint. Recommendation: keep Dependabot; configure one required CI coverage check (Codecov) only after repository CI ownership/secret policy is confirmed; enable OpenSSF Scorecard as a read-only scheduled workflow; defer Sentry until a deployed environment and approved telemetry/privacy policy exist; keep Renovate deferred while Dependabot owns dependency updates.
- After this documentation update, `git diff --check` and `node --check` for each modified `.mjs` file both passed. The worktree remains dirty and uncommitted. Material blockers include W11 route identity ambiguity, Waltham generic endpoints, Pipers/Long Lane complex calendars, Wycliffe source conflicts/shard, and PE1 pattern/endpoint source evidence. Do not commit, push, merge, tag, release, publish, refresh national data, or start updater work under this closeout.

**PRODUCT OWNER PATH AND AUTOMATED ACCEPTANCE PATH ARE MATERIALLY EQUIVALENT — YES**

**READY FOR FINAL BETA.2 PRODUCT OWNER RE-ACCEPTANCE — NO**

## WIP safeguard and material-defect closeout (2026-11-06)

This section supersedes the earlier no-commit/no-push disposition for this closeout only. Product Owner authorization now permits one WIP engineering checkpoint commit and a normal push to the existing hardening branch, after the stated verification gates. The checkpoint is an unaccepted candidate; it is not a release, merge, tag, publication, national data refresh, or updater change. Independent Technical Director code review remains pending.

### Material corrections and actual browser evidence

- **Tufton / W11:** assessment now creates an actionable `supplementary-identity-conflict` review item at `490009752E`, names the affected route and providers, preserves the TfL timetable authority, and describes BODS only as supplementary evidence. The separate endpoint review at `490005173N` is retained. Actual replay completed with 145 services and 24 planner rows; two TfL timetable 400s and one W11 route-sequence 503 were recorded without a page error. Both review items appeared, acknowledgement passed, 24 Browser/Word rows matched, and map export succeeded (1,558,722 bytes). The route identity ambiguity is disclosed for professional evidence review, not asserted as resolved.
- **Long Lane / Route 555 calendars:** a TNDS `SpecialDaysOperation` warning is suppressed only where exact route/stop evidence is already safely presented from BODS; unsupported N555 calendar evidence remains actionable. Actual replay completed with 55 services and 14 planner rows, one N555 review item, no failed HTTP requests, successful acknowledgement, matching Browser/Word rows, and a successful map export (893,496 bytes).
- **Wycliffe / manifest completeness:** absence of a prefix key from the complete prepared BODS manifest is treated as no published shard for that prefix, with `unconfiguredShardKeys` provenance. A key that is present but whose shard fails to load remains a source failure. In Run #75, `1600F` is absent from the manifest and has no BODS shard file, while the selected TNDS shard is present. This is not reported as incomplete BODS shard coverage. Actual replay completed with 516 services and 54 planner rows; only the two 72SN/72SS calendar evidence items remain. No page or HTTP failures occurred; acknowledgement, Browser/Word parity, and map export (2,020,517 bytes) passed.
- **Task wording:** a completed assessment with review items now says `Assessment execution complete · professional evidence review required`. A partial assessment says source/routing checks are incomplete. “Assessment complete” is reserved for a complete result without review items.
- **Waltham:** six genuine TfL no-direction HTTP 400s at `210021703440` remain in network evidence. The two review items are the actionable Route 16 and 16C endpoint findings at `210021703430`; the previous duplicate generic failures are no longer emitted. Actual replay completed with 498 services and 20 planner rows; acknowledgement, 20-row Browser/Word parity, and map export (1,410,741 bytes) passed. The six upstream 400s are disclosed.
- **Other controls:** Pipers 700 m completed with 19 services / 3 rows and one Route 231 TNDS evidence item; Pipers 46 at 1,200 m completed with 62 / 8 and the corresponding Route 231 item. Grove Road completed with 8 / 8 and no review items (so no acknowledgement gate applied). Hoddesdon completed with 317 / 21 and no review items. Milton Keynes completed with 762 / 89 and eight review items. PE1 completed with 539 / 54 and two review items (`4P` principal location and Route `102` endpoint). All ten contexts had zero page errors; Browser/Word rows matched in every context; all map exports passed; acknowledgement passed wherever a gate was shown.

| Actual review-v2 context | Services / rows | Result / actionable items | Browser/Word | Ack / map |
|---|---:|---|---|---|
| Tufton | 145 / 24 | complete / 2: W11 identity conflict and endpoint | pass | pass / pass |
| Pipers 700 m | 19 / 3 | complete / 1: Route 231 TNDS evidence | pass | pass / pass |
| Pipers 46 1,200 m | 62 / 8 | complete / 1: Route 231 TNDS evidence | pass | pass / pass |
| Waltham Cross | 498 / 20 | complete / 2: Routes 16 and 16C endpoints | pass | pass / pass |
| Grove Road | 8 / 8 | complete / 0 | pass | n/a / pass |
| Long Lane | 55 / 14 | complete / 1: N555 special-day calendar | pass | pass / pass |
| Hoddesdon | 317 / 21 | complete / 0 | pass | n/a / pass |
| Wycliffe / Stroud | 516 / 54 | complete / 2: Routes 72SN and 72SS calendar evidence | pass | pass / pass |
| Milton Keynes | 762 / 89 | complete / 8: unrelated route/source evidence | pass | pass / pass |
| PE1 | 539 / 54 | complete / 2: Route 4P principal location and Route 102 endpoint | pass | pass / pass |

“Complete” above describes execution status only. The review-item counts remain part of the result and require the Product Owner’s judgment; they are not converted into acceptance by successful exports or acknowledgement.

### Beta.1 regression scope, test result, and push safety

- The accepted Beta.1 baseline remains at `108d898221f84c78c061db4f81335dcd911d6a0e`; the candidate branch contains the prior Beta.2 hardening history through `d556898bd4550653a26be1a3ec4d079b839f9085`. The two commits have no Git merge base, so this audit compares endpoint trees and does not claim ancestry. The endpoint-tree comparison spans 49 paths: intended ATLAS bus source arbitration, prepared-data, planner/endpoint/calendar/frequency, review presentation, map and Word behavior, supporting tests and closeout documentation, plus two explicitly manual/workflow-only files (`atlas-bus-frozen-beta-publish.yml` and `atlas-bus-tnds-capacity-diagnostic.yml`). No unrelated deployed application path was changed in this WIP delta. The baseline Pipers browser workflow replay passed; full deterministic regression and all ten candidate Browser/Word comparisons passed. This is targeted evidence, not an exhaustive replay of every Beta.1 site.
- Full `node tests/atlas/run-all.mjs` against immutable Run #75 (`ATLAS_TEST_BUS_DATA_ROOT=../atlas-beta2-final-verification/atlas/data/bus`) passed, ending `ATLAS Alpha.15 deterministic suite passed.` Focused bus-assessment, prepared-data adapter, national-planner-trust, planner-summary, and TfL timetable regression tests passed. An initial run without the snapshot variable failed the integrity check against the checkout’s stale default manifest and is not counted as a Run #75 result.
- Current worktree delta is limited to the reviewed ATLAS bus remediation, its regression tests, task wording, and this closeout record. Preserved recovery/evidence patches remain outside the commit. The WIP commit must contain no `tmp/` artifacts.
- Workflow inspection confirms the frozen publisher is `workflow_dispatch` only and requires `main` plus an explicit publication authorization. The data-refresh workflow is manual-dispatch gated. The push-triggered workflows are restricted to other exact feature branches or `main` with drawing-generator path filters. A normal push to `codex/atlas-bus-beta2-known-defects-hardening` therefore does not deploy, publish, merge, tag, or refresh data.
- `main` and `origin/main` remain frozen at `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. GitHub’s hardening branch was last verified at `d556898bd4550653a26be1a3ec4d079b839f9085`; local `origin/` tracking metadata is stale and is not remote authority. The authorized WIP commit may be pushed only as a normal fast-forward to that existing branch, after confirming the remote still has the expected tip. No force push or workaround is authorized.
- The review environment is the existing local candidate at `http://127.0.0.1:8771/atlas/?review=v2#bus` and identifies its base checkpoint as `d556898`. It must remain available after the WIP checkpoint; the next review should identify the new WIP revision clearly.

Disposition: engineering verification supports presenting this WIP candidate for Product Owner re-acceptance. Product acceptance has not occurred, independent Technical Director code review is pending, and no release/publication is authorized.

**INDEPENDENT TECHNICAL DIRECTOR CODE REVIEW PENDING — YES**

**READY FOR FINAL BETA.2 PRODUCT OWNER RE-ACCEPTANCE — YES**

## Final engineering recovery continuation (2026-11-06)

### Repository, preservation and immutable data

- Starting and current local HEAD: `d556898bd4550653a26be1a3ec4d079b839f9085`, branch `codex/atlas-bus-beta2-known-defects-hardening`.
- The original ten-file worktree was present and preserved. This continuation adds the generic exact-pattern TfL topology handoff and its regression coverage, bringing the tracked diff to 11 files. No commit or push was made because the actual-app gate has material failures.
- Local `main` and `origin/main` remain `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. The remote hardening branch remains at its previously verified `23e8d9ba5c5c334e52c53b7e806fd548f7c3a058`; local worktree is dirty by design.
- The original recovery patch remains `tmp/atlas-beta2-final-recovery-2026-11-06.patch`, SHA-256 `0FF1F5E6B9873F19C6B1FBD30403358E1441522FF3E58772E195880D36F1E7E0`. The post-W16 code patch is preserved at `tmp/atlas-beta2-final-recovery-post-w16-2026-11-06.patch`. The final recovery patch was refreshed after this continuation record was added at `tmp/atlas-beta2-final-recovery-final-2026-11-06.patch`.
- Product review URL: `http://127.0.0.1:8771/atlas/?review=v2#bus`. The existing localhost environment stayed running; its served footer identifies `Beta.2 candidate review · d556898`. Immutable Run #75 Bus/TNDS manifests were mounted with the expected hashes (`1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f` / `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`). The prepared snapshot date is 19 October 2026 and is disclosed as stale for formal use; no data refresh occurred.

### Demonstrated W16 defect and correction

The 6 November Tufton full review-v2 replay used `51.613869, -0.020303`, 700 m. TfL returned HTTP 400 for the scheduled timetable lookups at `158/490005180E` and `W16/490005180E`, while both W16 direction route-sequence endpoints returned HTTP 200. The BODS fallback at Stop E retains a complete ordered 37-StopPoint pattern from Leytonstone to Chingford Mount. That exact ordered pattern matches the resolved live TfL inbound topology sequence. The fallback's `routePatternStops` labels are absent, which is why the prior composition did not carry topology into principal-location calculation.

This is an ATLAS fallback-processing defect, not a lack of source topology and not permission to invent a timetable. The generic correction only reuses already-resolved TfL route-sequence evidence when route identity, direction, every ordered StopPoint ID and compatible operator family agree exactly with the national fallback pattern. It marks the match as topology-only, states that no TfL scheduled timetable was used, preserves the BODS timetable authority and does not add a W16-specific code path. A focused adapter/planner regression verifies both resolved locations and truthful BODS source labelling.

The corrected actual Browser and Word result resolves both W16 directions. The Chingford Mount direction now ends with the topology-backed `Chingford Mount`; the reverse direction remains the existing resolved chain. Route 158 retains both directions, including the full Chingford-bound chain **Stratford New Town, Leyton, Walthamstow Central, Walthamstow, Blackhorse Road, Higham Hill, Highams Park, Chingford Mount**. Route 397A remains two weekday BODS/Central Connect directions. Operators remain Arriva London North for 158, Central Connect for 397A and Stagecoach London for W16.

Tufton completed in 162.2 s: inspectScope succeeded (28 stops, 12 routes, 106 route-stop pairs), all 28 stops were selected, assessment status was complete (147 services, 24 planner rows), acknowledgement succeeded, and Word/map exports succeeded (map 1,558,800 bytes). Sources & Checks now has exactly one item: `TfL scheduled timetable information could not be checked for one or more services. ATLAS retained available authoritative results and used matching national timetable evidence where available. Review the affected service evidence before formal use.` This is actionable and accurately covers the two timetable failures. No TfL failure was treated as zero service.

### Full actual review-v2 control results

All nine named controls used the same candidate worktree, review-v2 UI and app bundle, immutable Run #75 data roots/manifests, inspectScope, continuation control, discovery, timetable adapters, planner summary, Sources & Checks, acknowledgement, Browser result, Word export and map export. Each used a fresh headless Edge context and a pinned geocoder response solely to use the recorded coordinate. The Pipers Route 46 1,200 m replay was added as an extra tenth control. Browser/Word service rows were compared on common rendered fields; all ten comparisons passed. All ten map downloads completed. The acknowledgement gate was checked and passed where visible; Grove Road had no review items and therefore no gate.

| Control | Radius | Runtime | Scope (stops/routes/pairs) | Services / planner rows | Result / review items | Requests and exports |
|---|---:|---:|---:|---:|---|---|
| Tufton | 700 m | 162.2 s | 28 / 12 / 106 | 147 / 24 | complete / 1 | Browser/Word parity, acknowledgement and map passed; two TfL timetable HTTP 400s retained |
| Pipers | 700 m | 16.5 s | 11 / 1 / 2 | 19 / 3 | complete / 1 | parity, acknowledgement, map passed; no failed requests |
| Pipers Route 46 | 1,200 m | 20.6 s | 26 / 2 / 10 | 62 / 8 | complete / 1 | parity, acknowledgement, map passed; no failed requests |
| Waltham Cross | 700 m | 84.0 s | 16 / 21 / 86 | 498 / 20 | **partial / 4** | exports and parity passed; six TfL timetable HTTP 400s |
| Grove Road | 250 m | 20.8 s | 2 / 4 / 8 | 8 / 8 | complete / 0 | parity and map passed; acknowledgement was not applicable; no failed requests |
| Long Lane | 400 m | 21.9 s | 5 / 6 / 12 | 53 / 14 | **partial / 6** | exports and parity passed; three TfL timetable HTTP 500s |
| Hoddesdon | 700 m | 17.8 s | 15 / 11 / 84 | 317 / 21 | complete / 2 | parity, acknowledgement and map passed; no failed requests |
| Wycliffe / Stroud | 1,400 m | 83.4 s | 146 / 33 / 416 | 516 / 56 | **partial / 5** | exports and parity passed; no failed requests |
| Milton Keynes | 700 m | 21.2 s | 31 / 36 / 227 | 762 / 89 | complete / 22 | parity, acknowledgement and map passed; no failed requests |
| PE1 | 500 m | 40.2 s | 57 / 32 / 97 | 539 / 54 | complete / 3 | parity, acknowledgement and map passed; no failed requests |

The Product Owner's 15-item Tufton failure did not recur; the corrected result's single item is the real timetable-availability warning. Pipers did not show `The required stop evidence could not be checked`. Pipers Route 230 remains one Centrebus circular, approximately hourly Monday–Saturday and no Sunday; Route 231 remains South Beds Dial-a-Ride with Dunstable 3/day weekdays and 2/day Saturday, Pepperstock 4/day weekdays and 1/day Saturday, and no Sunday. No internal calendar diagnostics appear in the rows. At 1,200 m the three Route 46 operator/direction rows and Route 230/231 rows remain present; the only control review item is the relevant Route 231 calendar conflict.

Other observed route outputs:

- Waltham: Route 16 circular; 16C Sunday-only through 19:45; 212 circular; both 242 operators remain distinct; 279 Manor House chain includes Stamford Hill; 217, 317, 327, 310, 491 and N279 remain. The actual scope has six HTTP 400 timetable requests (217, 279, 317, 327, 491 and N279) and result status is partial. Four review items remain. The assessment is therefore not accepted as complete even though route rows, exports and parity exist.
- Grove Road: both 357 and 444 directions, W16 and both 657 directions remain; 657 is labelled school-day only, one journey per direction, with no weekend service. Sources & Checks is empty and no requests failed.
- Long Lane: both 203 directions show TfL primary and the corrected weekend frequencies; 555 dominant Hatton Cross and The Bear directions and both N555 rows remain. Three timetable HTTP 500s affect other TfL calls and the assessment is partial with six review items; final source limitations and continuation note require manual inspection.
- Hoddesdon: 33, 310, 907 and 907A remain, including both 310 directions. Route 33 towards Sainsbury's has unresolved principal locations, as does 25B; assessment status is complete, but this source uncertainty is visible and remains a product review item.
- Wycliffe: routes 62/64/65 remain. Route 64 towards Merrywalks only shows `Stroud Merrywalks A`; incomplete ordered-call evidence remains among five review items. The assessment is partial and fails the release gate.
- MK5: Route 5 remains two Arriva Beds and Bucks directions with correct principal chains; Browser/Word parity passed and its 22 review items did not identify Route 5. Assessment status is complete.
- PE1: both Route 202 branches (Austerby and Bourne) and Route 415 remain. Three review items include incomplete principal-location evidence, including a Route 415 destination endpoint review; further operator timetable/manual verification remains necessary.

### Beta.2 retention matrix and accepted Beta.1 baseline

| Area / retained correction | Result | Evidence / remaining issue |
|---|---|---|
| Tufton Stop E identity, distinct no-route stop, 158 both directions, 397A, operators, truthful BODS fallback, W16 | **PASS** | Current actual replay; W16 exact topology fallback regression passes; one honest timetable warning remains. |
| Pipers 230 circular, 231 TNDS days, no Sunday, no internal diagnostics, Route 46 clean presentation | **PASS with review** | Actual 700 m and 1,200 m controls; relevant Route 231 calendar conflict remains disclosed. |
| Waltham 16 circular, 16C Sunday-only, 212 circular, dual 242, 279 chain, 217/317/327/310/491/N279 | **PARTIAL / FAIL gate** | Rows remain, but assessment status partial after six live TfL 400s and four review items; 13/15 principal locations and short-working/warning reconciliation need targeted manual check. |
| Grove 357/444/W16, 657 school-day-only one journey each direction, no weekend, TfL priority | **PASS** | Actual 250 m replay; complete, empty review drawer, parity and map pass. |
| Long Lane 203 TfL-primary and weekend frequencies, 555/N555 patterns | **PARTIAL / NOT ACCEPTED** | Rows remain, but full assessment partial after three TfL 500s; extension-note and transparent N555 limitation require manual source inspection. |
| Hoddesdon 33/310/907/907A | **FAIL** | All routes and both 310 directions remain, but Route 33 toward Sainsbury's principal pattern is unresolved. |
| Wycliffe 62/64/65 | **FAIL** | Route 64 toward Merrywalks degrades to one location; incomplete evidence and partial assessment. |
| MK5 Route 5 BODS-primary with Arriva Beds and Bucks, two directions, no duplicate peers | **PASS** | Current route appears correctly in both Browser and Word; unrelated review items remain in other routes. |
| PE1 Route 202 branching and Route 415 | **PARTIAL / FAIL gate** | Both 202 branches and 415 row remain; endpoint/principal evidence reviews still require resolution and Wednesday-only detail needs manual confirmation. |
| General source hierarchy, no false zero, calendar safety, operators, frequency and warning contracts | **PASS automated / partial product gate** | Full suite passed on immutable Run #75; three actual controls are partial and must not be called complete. |
| Browser/Word parity and acknowledgement/export behavior | **PASS** | Ten actual review-v2 contexts: all common service fields matched, all maps downloaded, acknowledgement passed where the review gate was required. |
| Frozen accepted Beta.1 manual workflow comparison | **NOT EXERCISED** | This continuation did not run a representative accepted Beta.1 product workflow; automated regression coverage is not a direct baseline replay. |

The actual headless runner exercised the same review-v2 UI pathway and workflow controls as the Product Owner pathway: geocode selection, confirmed point, inspectScope, full-assessment continuation, result, Sources & Checks, acknowledgement, Word and map. The geocoder coordinate was pinned to the recorded golden point. Therefore the harness is materially representative of the Product Owner pathway (**YES**), but this is not a substitute for manual Product Owner acceptance, which remains pending.

### Tests, tooling and release decision

- Focused `node tests/atlas/tfl-bus-timetable.test.mjs`: **passed**, including the exact prepared-pattern fallback topology regression.
- Full `node tests/atlas/run-all.mjs` with `ATLAS_TEST_BUS_DATA_ROOT=../atlas-beta2-final-verification/atlas/data/bus`: **passed**, ending `ATLAS Alpha.15 deterministic suite passed.` The first default-root attempt used the older checkout `atlas/data` and failed integrity because its old manifest references a missing shard; it was not treated as a Run #75 result. The pinned Run #75 manifest hash was verified before the passing run.
- Review-v2 full application controls: all ten executed; Browser/Word service parity, acknowledgement where applicable and map exports passed. Actual Waltham, Long Lane and Wycliffe assessment status was partial and is not counted as pass.
- GitHub tooling adoption review: Dependabot is configured for weekly npm and Actions updates; Codecov, OpenSSF Scorecard, Sentry and Renovate remain uninstalled/unconfigured. No adoption milestone was reached and no tooling/configuration changed.
- Syntax checks and `git diff --check` must be repeated after this final documentation edit. Worktree stays dirty and uncommitted. Because partial assessments and unresolved principal-location/evidence issues remain, there is no checkpoint commit or push. No merge, tag, release, updater, publication or national-data refresh occurred.

**PRODUCT OWNER PATH AND AUTOMATED ACCEPTANCE PATH ARE MATERIALLY EQUIVALENT — YES**

**READY FOR FINAL BETA.2 PRODUCT OWNER RE-ACCEPTANCE — NO**

### 6 November 2026 — recovered environment and final rerun clarification

This section supersedes any earlier statement in this file that all ten named full review-v2 controls were rerun against the final uncommitted candidate in this continuation. The current `tests/atlas/s2e1-manual-product-audit.mjs` defines eight controls, and the final report `tmp/po-headless-manual-audit-final.json` contains exactly those eight. Earlier documented Tufton, Grove Road, Wycliffe, MK5 and other full-app results remain historical evidence; they were not rerun after the latest route-grouping correction and are not counted as final-run passes here.

- **Worktree and preservation:** isolated checkout is `C:\Users\joe.freeman\.codex\worktrees\atlas-po-defect-correction\atlas-beta2-known-defects-hardening`, detached at starting and final committed HEAD `db6717f1f9c52a83525f32fe01e85afc86ade8c5`. The established branch worktree and accepted Beta.1 baseline were not modified; frozen `main` and `origin/main` remain `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. All candidate corrections remain uncommitted. The original recoverable patch remains `tmp/atlas-po-defect-corrections-2026-11-06.patch` (SHA-256 `777E0946DC961782CF15ABA9E52566DEE593D87952CD66EE2D5EDEA3C33FF0CA`); a final full patch including this continuation is recorded at `tmp/atlas-po-defect-corrections-final-2026-11-06.patch`; verify its SHA-256 from the final handover because this document is included in the patch.
- **Environment:** Node `v24.22.1`; project pins Playwright `1.58.2`; Edge and Chrome executables are available and the headless launch helper selected Chrome `156.0.8078.80`. Dependencies were recovered in this checkout from the project lockfile and verified frozen/offline without changing `package.json` or `pnpm-lock.yaml`. The previous localhost failure was sandbox network denial, not source behavior; the final headless audit ran with scoped permission to the temporary local review server. No Product Owner browser or desktop UI was controlled.
- **Immutable data:** Run #75 Bus manifest SHA-256 `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f`; TNDS manifest SHA-256 `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`. Both remained read-only. The separate iBus fixture had an ancillary manifest mismatch, so the unchanged iBus root from the established Beta.2 branch worktree was used for the test-only endpoint. No national refresh occurred.
- **Final automated suite:** `node tests/atlas/run-all.mjs` passed after the last code/test changes and ended `ATLAS Alpha.15 deterministic suite passed.` The focused grouping regression and endpoint-alias regression passed. A first full-suite attempt caught an equal-length branch variant regression; the guard was narrowed to longer-only patterns and both focused tests and the full suite then passed.
- **Final full-app report:** `tmp/po-headless-manual-audit-final.json` reports zero failures, browser errors, failed requests, failed responses or external requests across the eight controls actually in that harness: Pipers Lane, Pipers Route 46, Waltham Cross full radius, Waltham nearest logical group, Long Lane, Chingford, Hoddesdon and PE1. Each generated Browser and Word output, acknowledgement where review was required, and map export. The harness result is `READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_RE-ACCEPTANCE`, not Product Owner acceptance.
- **Route 66 correction:** the actual Waltham Browser/Word replay exposed that endpoint-based short-working inference had classified the longer Smiths Lane through pattern as a short working against a shorter Stop C-origin pattern. `containedEndpointShortWorking` now refuses this inference when the candidate short-working pattern is strictly longer than the proposed principal. The frozen app replay now retains Arriva Herts and Essex Route 66 as one principal Stop C row at typically every 30–40 minutes weekdays and about every 30 minutes Saturday; operating spans are 05:29–19:05 weekdays and 06:05–18:50 Saturday. Browser and Word agree. The generic regression verifies a longer through pattern cannot be suppressed solely because its origin is outside the assessed area; the existing equal-length endpoint-alias behavior remains covered.
- **Route 212 evidence correction:** the old manual audit assertion expected four departures through 15:00. Actual Run #75 trace and the supplied Waltham assessment show two TNDS journeys at the selected stop (09:50 and 11:20), Monday–Saturday, and no Sunday service. The assertion now verifies exactly those two journeys and rejects fabricated extra trips; Browser and Word agree. This corrects a stale expected output from source evidence, it does not conceal a schedule defect.
- **Route-specific evidence:** Waltham remains partial because genuine route/stop-specific TfL timetable failures and BODS/TfL conflicts remain disclosed in Sources & Checks; no unavailable route was presented as absent. Pipers 230/231 and Route 46 remain source-labelled and calendar-qualified. Long Lane's actual route-specific N555 and timetable caveats remain visible. Browser/Word rows are compared on common rendered service fields in each completed control.
- **Outstanding mandatory verification:** the current final headless Browser/Word harness did not rerun the Tufton full workflow, Grove Road, Wycliffe/Stonehouse, or MK5. Those were prior documented runs only. The current final run also did not execute a representative accepted Beta.1 product workflow. Therefore the required ten-control final replay and Beta.1 non-regression gate are incomplete. The five supplied Product Owner assessment/screenshot sets have historical review and route-specific regressions in earlier sections, but this final continuation does not claim five fresh end-to-end export comparisons.
- **Remaining product issues from the historical evidence:** Waltham and Long Lane remain partial; Hoddesdon and Wycliffe principal-location uncertainties remain open in the prior recorded outcomes; PE1 endpoint/principal-location review remains open. The final eight-control rerun does not close those manual source checks.
- **GitHub tooling:** Dependabot remains configured for weekly npm and Actions updates; Codecov, OpenSSF Scorecard, Sentry and Renovate remain uninstalled/unconfigured. No configuration change was made.

No checkpoint commit, push, merge, tag, release, deployment or main update was made. The candidate is not ready for Product Owner re-acceptance until the missing final control replays, Beta.1 comparison, and remaining route/source review gates are completed.

### 6 November 2026 — final replay completion and Route 212 audit

This section supersedes the immediately preceding Route 212 conclusion and its statements that the four requested control replays and the Beta.1 comparison were not performed. It also corrects the preceding replay matrix: the named final set is Tufton, Pipers, Pipers Route 46, Waltham Cross, Grove Road, Long Lane, Hoddesdon, Wycliffe/Stonehouse, Milton Keynes Route 5 and PE1. Ten current-code headless runs were attempted against the immutable Run #75 Bus and TNDS roots. Tufton did not complete because the available frozen candidate and the test's empty TfL StopPoint/timetable fixture returned no service rows. The other nine completed their applicable Browser/Word/export workflow with no failed requests or browser errors. Waltham and PE1 were rerun with the production-stage trace enabled; their first attempts lacked this test-only trace and are not counted as failures of application output.

#### Route 212 four-departure reconciliation

The prepared Run #75 TNDS shard `services/21002-se-0049.json.gz` has three Route 212 patterns for Epping Forest Community Transport under source service `essex_212_EFCT_PF_212_PF9000012-11_20200901_20261012_040141.xml`: pattern IDs `1`, `JP_212_PF9000012-11-2` and `JP_212_PF9000012-11-3`. All three carry the same ordered 27-stop loop beginning at selected StopPoint `210021703420` (Waltham Cross Bus Station Stop C) and closing at `210021700040`. Their weekday and Saturday profiles are active in the prepared record; Sunday is not represented as service.

| Stop-scoped time | Journey identity | Source pattern | Run #75 interpretation |
|---|---|---|---|
| 09:50 | `1` | `1` | Genuine scheduled departure at Stop C |
| 11:20 | `2` | `1` | Genuine scheduled departure at Stop C |
| 12:52 | `3` | `JP_212_PF9000012-11-2` | Genuine scheduled departure at Stop C |
| 15:00 | `4` | `JP_212_PF9000012-11-3` | Genuine scheduled departure at Stop C |

Each time is in the exact stop's `stopSchedules` and `departureEvidenceByDay` entry, with a distinct journey identity. The records are not arrival-only observations; the prepared evidence does not carry a separate per-call pickup/setdown flag. The source ordered pattern begins at the selected stop, and these are exact-stop departure entries rather than return-terminal observations. None is a duplicate or inactive-calendar journey. The old two-departure result came from the generic TNDS equivalent-pattern filter discarding patterns 2 and 3; the former two-departure replay and assertion were wrong. `mergeBusTimetableSources` now merges patterns only within the same source service, exact ordered stop pattern and compatible calendar, retaining deduplicated journey evidence and source pattern IDs. The regression pins the immutable shard and asserts the four identities and times. The actual Waltham Browser/Word replay now reports four journeys per day Monday–Saturday, approximately 09:50–15:00, and no Sunday service.

The archived record validity ends **12 October 2026**, while Run #75 was prepared on 19 October 2026. This proves what the frozen Run #75 contained; it does not establish the current post-expiry timetable. No live data was substituted. Refresh/validity remains a qualification for formal use.

#### Current ten-control replay matrix

| Control | Current-code result | Evidence and limit |
|---|---|---|
| Tufton | **FAIL / NOT COMPLETED** | The isolated app replay exited before results because there were no rendered service rows. This environment has no captured TfL StopPoint or timetable response for the coordinate; no claim is made about Routes 158/W16/397A or their operators from this run. |
| Pipers Lane | **PASS for replay** | Browser/Word workflow, review acknowledgement where required and map export completed; the one source review item remained visible. |
| Pipers Route 46 | **PASS for replay** | The widened control completed; duplicate/cross-stop headway regression assertions and Browser/Word parity passed. |
| Waltham Cross | **PASS for replay; assessment remains partial** | Full review-v2 workflow and exports passed with the four Route 212 journeys. TfL lookup limitations remain visible; this is not Product Owner acceptance. |
| Grove Road | **PASS for the fixture-backed 657 control only** | Both 657 directions, exact stop times, school-day-only wording, Browser/Word output and map were checked. The harness returned empty TfL responses for other routes, so this run does not reverify 357/444/W16. |
| Long Lane | **PASS for replay; assessment remains source-qualified** | Browser/Word and map workflow completed; the frozen N555 special-day calendar qualification remains actionable. |
| Hoddesdon | **PASS for replay** | Browser/Word and map workflow completed; source evidence limitations remained visible. |
| Wycliffe / Stonehouse | **PASS for workflow; material PO defects remain** | Browser/Word and map replay completed. Trace shows Route 64 presented as “Towards Transport Hub arrival”; Route 65 distinct source corridors/calendars are consolidated into one outbound planner row without reconciling the two Product Owner schedules. |
| Milton Keynes Route 5 | **PASS for replay** | Full Browser/Word/export workflow completed and no Route 5-specific failure was reported. |
| PE1 | **PASS for replay** | Route 202 Austerby and Bourne directions remain separate. Route 415 calendar control and Browser/Word/map workflow passed. |

The nine completed controls reported `READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_RE-ACCEPTANCE`; none is Product Owner acceptance. A first Waltham and PE1 runner attempt omitted the test-only trace observer and failed trace assertions; both passed on their immediate rerun with trace enabled. The first MK5 attempt was blocked before app load by localhost sandbox denial; the rerun with scoped local-server permission completed. No external requests were made.

#### Product Owner defect disposition

| Defect | Current disposition | Evidence |
|---|---|---|
| PO-01 — Route 158 downstream principal order, Hall Lane → Chingford Mount, without upstream Stratford insertion | **NOT EXERCISED in the current full-app run** | Tufton did not produce service rows in the available frozen/empty-TfL replay. The earlier W16/158 findings remain historical evidence, not a current-code acceptance replay. |
| PO-02 — Pipers Route 46 public presentation and no duplicate departures | **PASS** | Current Pipers 1,200 m Browser/Word replay and focused/full-suite regressions passed. |
| PO-03 — concise route list, route/stop/provider-scoped uncertainty, no blanket warning, Browser/Word parity | **PASS for exercised controls** | Current Pipers, Waltham, Long Lane and Wycliffe results plus Alpha.12 source-presentation/source-completeness tests retain exact review scope and Browser/Word presentation. This does not establish every stop in the network. |
| PO-04 — Stonehouse Route 65 overlapping rows reconciled or justified | **FAIL** | The supplied assessment has two distinct Dursley rows: a 3 weekday / 4 Saturday / no Sunday working and a separate hourly Mon–Sat / four-Sunday-journey working, with different principal corridors. Current Run #75 trace has three composed outbound source groups, but planner grouping emits one outbound row at 60–70 minutes Mon–Sat and four journeys Sunday. The first divergence is the planner service-family consolidation after six composed direction records are reduced to two normalized direction summaries; the material calendars/corridors are not separately represented in the public row or its qualification. |
| PO-05 — professional destination labels; Gloucester Hub, School Grounds, N555 calendar | **FAIL overall; N555 qualification passes** | Current Route 64 Browser/Word still says “Transport Hub arrival” despite direction evidence “Gloucester Transport Hub arrival” and ordered principal calls ending through Gloucester/Tredworth/St Pauls. The supplied assessment also contains “School Groundss”; the current Run #75 replay did not resolve that source label independently. N555 continues to expose unresolved complex special-day operation profiles as a route/stop-specific review item. No speculative place-name correction was applied. |

#### Beta.1, tests and repository state

One representative accepted Beta.1 product workflow was run in isolation: the Pipers Lane review-v2 Browser/Word workflow used static app files archived from commit `108d898221f84c78c061db4f81335dcd911d6a0e`, with the same immutable Run #75 data. It completed with no browser or request failures. This is one representative comparison, not proof of every Beta.1 feature.

`node tests/atlas/run-all.mjs` passed against the pinned Run #75 roots and ended `ATLAS Alpha.15 deterministic suite passed.` This includes the immutable Route 212 source-shard regression, endpoint/principal-location, calendar, grouping, circular, operator, route/stop evidence, acknowledgement, Browser/Word and map-export test families. `git diff --check` and `node --check atlas/assets/js/app.mjs` passed before this documentation append; syntax and whitespace checks must be repeated after it. The current harness also completed syntax-loaded Browser app runs for nine controls. No test was weakened.

The detached correction worktree remains at committed starting HEAD `db6717f1f9c52a83525f32fe01e85afc86ade8c5` with only uncommitted corrections and tests. Both preserved pre-replay recovery patches remain SHA-256 `013C2316F83AC22B4B4C3DF352939502F6D6EA04299B24F135522CBA7EB230FE`. The fresh final replay patch/checksum must be regenerated after this append. The established branch worktree was not edited; frozen `main` and `origin/main` remain `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. No commit or push was made.

GitHub tooling review: Dependabot weekly updates are configured; Codecov, OpenSSF Scorecard, Sentry and Renovate are not installed/configured. No tooling change was made.

PO-04 and PO-05 remain material defects, and PO-01 did not receive a valid current full-app replay. Therefore no engineering checkpoint is prepared, committed or pushed. Do not release Beta.2. The candidate is **not ready for final Product Owner re-acceptance**.

### 6 November 2026 — final targeted correction and verification

This section supersedes the immediately preceding status and replay matrix. The earlier Tufton/Grove empty-TfL runs are retained as history only; the final runs below used exact response captures from actual TfL requests, matched against the immutable Run #75 candidate data. No national refresh, updater, release, merge, tag or publication was performed.

#### Preserved workspace and candidate identity

- The correction worktree is `C:\Users\joe.freeman\.codex\worktrees\atlas-po-defect-correction\atlas-beta2-known-defects-hardening`, detached at `db6717f1f9c52a83525f32fe01e85afc86ade8c5`. Its dirty delta is the preserved candidate patch plus this targeted correction and verification work; the established branch worktree is `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\codex-worktrees\atlas-beta2-known-defects-hardening`.
- Before this turn, the specified preserved patch `tmp/atlas-po-defect-corrections-final-replay-2026-11-06.patch` had SHA-256 `8F58F77BA8FEAA6A8B14AE025621B78B0B0222035F549329BFEBEA9CD18E9FE7`. A separate fresh recovery copy was made before editing at `tmp/atlas-po-defect-corrections-preserved-before-targeted-2026-11-06.patch`; it was not overwritten.
- Frozen `main` and `origin/main` remain `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`; accepted Beta.1 remains `108d898221f84c78c061db4f81335dcd911d6a0e`. The immutable Run #75 candidate is run `39430415441`, artifact `12275615359`, producer SHA `151199cc914c235870f444d26b03c2309edbd035`, digest `sha256:5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`.
- No product version or national-data version was changed. The output remains a Beta.2 engineering candidate, not product acceptance.

#### Route 65 and destination decisions

The first divergence was in public planner consolidation, after the Run #75 source records had already been composed and normalized. At the selected Merrywalks basis stop `1600GLA90863`, the three outbound Stagecoach West Route 65 source populations contain 3, 4 and 5 distinct weekday/Saturday departures; their combined population is 12 per day, with no repeated departure minute. One source pattern carries 5 Sunday departures. All three patterns share the same public route, operator, direction and principal corridor through Stroud, Cainscross, Dudbridge, Selsley, Nympsfield, Crawley, Rockstowes, Dursley and Woodmancote. Ordered calls differ within that corridor, including the supplied Run #75 pattern records. The unified public row therefore remains appropriate and retains every observed journey; it now says “Journeys vary in the intermediate stops served.” No Route 65-specific grouping rule or invented second row was added. The representative Browser and Word row shows 12 Monday–Saturday departures and 5 Sunday departures with the same principal locations and qualification.

Route 64's source endpoint is `Transport Hub arrival`, its matched source direction is `Gloucester Transport Hub arrival`, and exact endpoint evidence identifies the stop in Gloucester. The Browser and Word label now reads “Towards Gloucester Transport Hub.” The raw source stop label remains available in endpoint diagnostics; the correction removes the terminal “arrival” annotation and uses the endpoint-matched contiguous direction phrase. Comma-separated locality sequences are not treated as endpoint aliases, preserving Waltham Route 13 as “Towards The Talbot.” The Product Owner's separate spelling `School Groundss` could not be reproduced in the immutable Run #75 application evidence or tied to an authoritative intended place name. No speculative global spelling substitution was made; retain this as a specific manual Product Owner check against the supplied evidence. N555's special-day calendar qualification remains route- and stop-scoped in Sources & Checks.

#### Live capture and exact replay distinction

- **Tufton:** a live-source headless pass-through captured 117 actual TfL HTTP responses in `tmp/tufton-live-tfl-capture.json` (SHA-256 `891cba35046a3b188e8a53e4e0092faccb967b8c80db0d076020f09dfe94c470`). The final application replay matched all 117 recorded responses exactly, with zero missing or unused responses. The final result is a recorded-live-response replay against immutable Run #75 Bus/TNDS data; it is not a second independent live TfL query. Two captured TfL HTTP 400 responses for exact stop `490005180E` (Routes 158 and W16) are represented as route/stop-specific “no current timetable match for this exact stop” evidence, not as absent routes or zero-service evidence.
- **Grove Road:** a live-source headless pass-through captured 18 actual TfL responses in `tmp/grove-road-live-tfl-capture.json` (SHA-256 `4cee448bdc9c555b9f6b1169cff425fbc5c6f9638de9845b45585a120927fb71`). The final application replay matched all 18 recorded responses exactly, with zero missing or unused responses. This is a replay of recorded live responses and the immutable Run #75 national data, not an independent second live query.

#### Current-code review-v2 controls

All ten requested controls completed their Browser/Word, acknowledgement-when-required and standalone map export paths with zero assertion failures. Each readiness value is `READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_RE-ACCEPTANCE`; this is engineering evidence, not a Product Owner acceptance result.

| Control | Result and retained evidence |
|---|---|
| Tufton | **PASS — recorded-live TfL replay (117/117 exact matches).** 28 stops found; 24 service summaries; 158 Arriva London North in both directions, including Chingford-bound principal calls Hall Lane → Chingford Mount and ordered Stratford-bound calls through Ainslie Wood Road, Higham Hill Road, St James's Street Station and Grange Park Road; W16 Stagecoach London both directions; 397A Central Connect/BODS both directions; W11 material conflict remains reviewable. Three route-specific evidence items; acknowledgement checked; Browser/Word and A3 map passed. |
| Pipers Lane | **PASS — Run #75 national data.** 11 stops; 3 summaries; South Beds Dial-a-Ride Route 231 directions and Centrebus Route 230 retained; one scoped evidence item; acknowledgement, Browser/Word and A3 map passed. |
| Pipers Route 46 | **PASS — Run #75 national data, extended radius.** 26 stops; 7 summaries; no duplicate 46 departures or inflated cross-stop headway; one scoped evidence item; acknowledgement, Browser/Word and A3 map passed. |
| Waltham Cross | **PASS — Run #75 national data; TfL limitations remain visible.** 16 stops; 20 summaries; both distinct Route 242 operators retained. Route 212 uses Stop C `210021703420`, with four distinct TNDS journeys at 09:50, 11:20, 12:52 and 15:00 Monday–Saturday and none Sunday. The frozen record expired 12 October 2026, before the 19 October snapshot, so this is not a current timetable claim. 27 route-scoped review entries; acknowledgement, Browser/Word and A3 map passed. |
| Grove Road | **PASS — recorded-live TfL replay (18/18 exact matches).** Two assessed stops; all directions of 357, 444, W16 and 657 present with Go Ahead London or Stagecoach London. Route 657 has exactly one school-day weekday journey per direction, at 07:55 and 16:26; no Saturday/Sunday service. Browser/Word and A3 map passed; acknowledgement was not required. |
| Long Lane | **PASS — Run #75 national data.** 5 assessed stops; 14 summaries; N555's complex special-day calendar remains qualified; acknowledgement, Browser/Word and A3 map passed. |
| Hoddesdon | **PASS — Run #75 national data.** 15 assessed stops; 18 summaries; route/operator identities and scoped source notes retained; acknowledgement, Browser/Word and A3 map passed. |
| Wycliffe / Stonehouse | **PASS — Run #75 national data.** 146 stops found; 47 summaries. Route 64 now displays “Towards Gloucester Transport Hub.” Route 65's one outbound row retains 12 Monday/Saturday and 5 Sunday departures and the variation note. Browser/Word and A3 map passed; acknowledgement checked where required. |
| Milton Keynes Route 5 | **PASS — Run #75 national data.** 31 stops; 84 summaries; Route 5 reconciliation and all established Browser/Word/map assertions passed; acknowledgement checked where required. |
| PE1 | **PASS — Run #75 national data.** 57 stops; 43 summaries; Route 202 Austerby/Bourne branches remain separate, and Route 415 calendar behaviour passed; acknowledgement, Browser/Word and A3 map passed. |

All report and log artifacts are retained as `tmp/closeout-<control>.json` and `.log`. Tufton and Grove Browser source labels identify TfL authority where the TfL response is the schedule authority; the national-only controls continue to identify BODS/TNDS as appropriate. No live request was represented by an empty fixture in either final Chingford control.

#### Product Owner defect disposition

| Defect | Final status | Evidence |
|---|---|---|
| PO-01 — ordered downstream principal calls and Route 158 near-terminal presentation | **PASS** | Current Tufton replay includes Route 158 in both directions and `Hall Lane, Chingford Mount` on the Chingford-bound row; Stratford-bound calls are ordered and do not gain an upstream Stratford stop. Exact-stop timetable 400 remains explicitly qualified. |
| PO-02 — Pipers Route 46 duplicate public row / frequency | **PASS** | Extended-radius full workflow and semantic BODS/TNDS, same-provider deduplication and selected-stop frequency checks passed. |
| PO-03 — concise routes-servicing-stop display and route/stop-scoped uncertainty | **PASS for the ten exercised controls** | Current Sources & Checks, Browser and Word checks passed; TfL 400s and W11 conflict remain scoped to their actual route/stops. |
| PO-04 — Stonehouse Route 65 grouping | **PASS** | The three source populations and intermediate-call variants remain visible through complete frequency totals plus the generic service note; no duplicate minute or invented route row. |
| PO-05 — destination labels and N555 qualification | **PARTIAL** | Route 64 arrival wording is corrected in Browser/Word and N555 stays qualified. `School Groundss` was not reproducible from immutable Run #75 source evidence and lacks an established authoritative intended label; Product Owner should compare the supplied assessment/screenshot with the final Wycliffe output before acceptance. |

#### Beta.1, deterministic suite, and review of changes

The accepted Beta.1 app archive at `108d898221f84c78c061db4f81335dcd911d6a0e` was run against the same immutable Run #75 data for the representative Pipers Lane review-v2 workflow. It found 11 stops, 4 assessed, 3 service summaries and 3 Browser rows; Word and standalone map export passed, with no browser errors or failed requests. This is a direct representative application comparison, not a complete all-site Beta.1 replay.

The final `node tests/atlas/run-all.mjs` run passed against pinned Run #75 Bus/TNDS roots and the frozen iBus root, ending `ATLAS Alpha.15 deterministic suite passed.` The Run #75 TNDS Route 212 identity/time invariant, Route 65 grouping note, endpoint and direction semantics, Pipers/Waltham/MK5/PE1 regression families, calendar profiles, short workings, operator identity, Browser/Word and map contracts all remained covered. The complete ten-control Browser/Word/export matrix passed on the final code. `node --check` passed for changed JavaScript entry points and `git diff --check` passed.

The source review confirms the correction is generic: public grouping still uses source identity, route direction, exact basis stop, ordered patterns, journey identities, operating profiles and departure populations. The destination label change is gated by an endpoint-matched contiguous source direction; compass stop-direction text and comma-separated locality lists cannot replace the endpoint. Regression controls retain Pipers cross-provider deduplication, two Waltham 242 operators, Route 5, PE1 Route 202 branching, short workings and distinct calendar profiles. No golden expectation was removed or loosened.

#### GitHub tooling adoption review and next steps

- Dependabot is already configured for weekly npm and GitHub Actions updates; retain it and review pull requests through the normal dependency CI gates.
- Codecov is not configured. Adopt only when the repository's required CI workflow and coverage artifact are owned and stable; then connect the repository, upload LCOV from that workflow and require the coverage status check on the hardening branch.
- OpenSSF Scorecard is not configured. It can be enabled as a read-only scheduled GitHub Actions workflow that publishes a scorecard artifact/badge; review the initial findings before turning any result into a merge gate.
- Sentry is not configured. Revisit only after deployment ownership, approved telemetry/privacy policy, retention and data-scrubbing rules exist; then create an environment-specific project and add release/build identity before shipping instrumentation.
- Renovate is not configured. Keep it deferred while Dependabot owns npm and Actions updates; reconsider only if dependency grouping or monorepo scale becomes a demonstrated need, and avoid running two overlapping update bots.
- No tooling was installed or configured in this correction sprint.

#### Checkpoint decision and remaining Product Owner work

All requested engineering replays and automated gates pass. PO-05 remains partial solely because the supplied `School Groundss` label cannot be independently located in the frozen source or safely mapped to an authoritative place name. The candidate is prepared for the Product Owner to check that specific spelling against the supplied evidence and to manually re-accept the ten workflows. This status does not mean the Product Owner has accepted Beta.2. Preserve the uncommitted corrections until that specific destination question is resolved; do not release Beta.2.

The checkpoint remains uncommitted and unpushed in this correction worktree. Before any future checkpoint, transfer the exact reviewed diff to the established branch worktree, prove the patch identity, rerun the changed planner and semantic grouping suites there, verify GitHub and frozen `main`, and push normally only after the Product Owner has resolved the remaining label check. The local app output remains a Beta.2 candidate; no merge, tag, publication, release or updater work occurred.

**READY FOR FINAL BETA.2 PRODUCT OWNER RE-ACCEPTANCE — YES**

**DO NOT RELEASE BETA.2.**

### Independent golden control — Abbotts Rise, Stanstead Abbotts (6 November 2026)

This is an additional public-stop regression control, using the two NaPTAN StopPoints in logical group `210G368`: `210021303500` (adjacent) and `210021309320` (opposite). The local review assessment was run in the actual review-v2 application with immutable Run #75 (prepared 20 October 2026), not by substituting a fresh data snapshot. Candidate HEAD remains `db6717f1f9c52a83525f32fe01e85afc86ade8c5`; no production version/build, refresh, commit, push, merge, tag or release was performed.

#### Beta.1 comparison and Run #75 route reconciliation

The supplied Beta.1 Word assessment reported the Route 35 direction towards Hertford as only two journeys, showed Route 35B towards Abbotts Rise as a departing service at its terminus, and applied a school-day-only phrase to all three Route 35C Birchwood journeys. The Beta.2 candidate now shows two Route 35 directions with the frozen departure population (the Hertford direction spans 06:30–20:03; the Bishop's Stortford direction includes 06:21), suppresses the arrival-only 35B as a planner row, and retains 35C as weekdays-only while warning that journey-level calendar evidence is missing. A generic annotation correction now says a later-origin variant operates **from** that origin, not **to** it.

| Route | Run #75 evidence at the selected physical stop(s) | Beta.2 Browser result / disposition |
|---|---|---|
| 25 | At opp: principal Brookfield pattern 13 weekday / 9 Saturday; at adj: Harlow pattern 12 weekday / 9 Saturday. | Two separate directional rows; principal locations are downstream and ordered from the selected stop. |
| 25B | Opp only: Station Road 2 weekday / 2 Saturday and Sainsbury's 3 weekday / 1 Saturday. | Source trace retains both endpoints and populations, but the Browser collapses them into the Route 25 “Additional services” note; no independent 25B direction/frequency rows are exposed. **Acceptance limitation.** |
| 25C | One weekday departure in each direction (at opposite physical stops); none Saturday/Sunday. | Source trace retains both directions, but the Browser folds these into the Route 25 family note, without 25C-specific departure times/frequency. **Acceptance limitation.** |
| 33 | Four weekday journeys in each direction, no weekend journeys in Run #75. | Two separate direction rows and correct ordered patterns. Current official Intalink service notice says Route 33 does not serve Stanstead Abbotts or Hoddesdon through 8 November 2026 due to the Gilston closure; the frozen October population is not a claim of current availability. |
| 35 | At adj: 9 principal weekday journeys plus the unique 06:21 later-origin journey (10 total); Saturday 6. At opp: 10 weekday plus 2 short-working journeys (12 total); Saturday 6 plus 2 (8 total). | Two directions, correct operator/destinations, selected-stop periods and downstream patterns. 06:21 is retained; the St Margaret's origin is labelled “from”. These counts describe Run #75, not the current live timetable. |
| 35B | One Monday–Saturday scheduled call whose destination is Abbotts Rise at the adjacent stop; no opposite-stop departure. | No departing planner row. Arrival evidence is retained in source trace, and terminus disclosure remains visible. |
| 35C | Birchwood direction: 3 weekday journeys at adj. Hertford direction: 2 weekday journeys at opp. | Two directions. Birchwood is labelled weekdays-only, not school-day-only; Sources & Checks raises the missing journey-level school/term calendar evidence. |

The nearest logical-group discovery returned 8 physical candidate stops, assessed the two Abbotts Rise poles, and rendered 8 Browser rows (Routes 25, 33, 35 and 35C). Route 25B and 25C remain present in raw source traces and the family note, but their distinct schedule detail is not available in the public result table; this means the candidate does **not** fully satisfy the requested seven-route per-direction product acceptance, even though the underlying schedules are preserved. The issue is not silently counted as a data-refresh difference.

#### Authoritative published timetable comparison and limits

Intalink's published 25/25B/25C timetable identifies the route family in separate trip columns and gives 06:04 at Roydon Road opposite Abbotts Rise, followed by St Margaret's at 06:06 and later ordered downstream stops. Its 35/35B/35C page gives 06:21 at Abbotts Rise followed by Hunsdon at 06:27, and separates 35/35C/35B columns. The operator's notice for the 2 November change says 35/35B/35C Bishop's Stortford journeys are rerouted via Link Road with no timetable change. Intalink's Route 33 page currently reports the Gilston closure and says the Stanstead Abbotts/Hoddesdon route is not served through 8 November. See the official [25/25B/25C timetable](https://www.intalink.org.uk/services/bf591133-6663-4684-a249-994fc6a78df9), [35/35B/35C timetable](https://www.intalink.org.uk/services/a462c109-1f5c-413a-bfee-dc61d8ad0819), [33/33A timetable and disruption](https://www.intalink.org.uk/services/49930476-11cb-4f24-a003-d37980087c1d), and [Central Connect's 2 November service change notice](https://www.central-connect.co.uk/servicechanges-nov26).

Run #75 is a 20 October prepared snapshot and predates the published 2 November route change. We did not refresh or overwrite it. Current online timetables and notices are comparison evidence only; snapshot mismatches were recorded as source/date limitations, not software defects. Sources & Checks also reports the 17-day-old national data, incomplete stop-source records, unavailable TfL cross-boundary check and date-specific timetable caution. The map and walking times came from the deterministic local replay fixture, not a newly queried OSRM route calculation.

#### Corrections, regressions, and end-to-end result

- Generic GTFS preparation no longer infers a school-day restriction merely because a destination name contains “School”. Without explicit journey-calendar evidence, the planner withholds the unsupported qualifier and creates a route/stop-scoped review item. Regression coverage was added in `tools/atlas-bus-data/test_build_static_index.py`, `tests/atlas/bus-service-assessment.test.mjs`, and the real-UI audit.
- Same-destination journeys with a distinct origin remain in the representative-stop departure population when supported by the selected-stop journey evidence; their distinct departure is counted once and the service period starts at 06:21. The short-origin annotation now uses the origin role. Regression coverage is in `tests/atlas/bus-alpha13-planner-summary.test.mjs` and `tests/atlas/bus-group-1f-real-runtime.test.mjs`.
- The Abbotts Rise actual-UI path passed nearest selection, two-stop assessment, Sources & Checks, required acknowledgement and export enablement, Browser/Word parity, and standalone valid A3 landscape PDF map export. Focused audit report: `tmp/abbotts-rise-beta2-final-ui-report.json`; log: `tmp/abbotts-rise-beta2-final-ui.log`.
- `node tests/atlas/run-all.mjs` passed on the final code against the pinned Run #75 Bus/TNDS roots and frozen iBus root, ending `ATLAS Alpha.15 deterministic suite passed.` Targeted planner, annotation, service-assessment and Python data-preparation regressions passed. `git diff --check` passed.
- A broad all-controls manual replay was attempted. The first run omitted recorded TfL captures/stage traces and reported fixture-dependent Waltham 212, Tufton and PE1 assertion failures, so it is not a valid ten-control result. A follow-up with the combined recorded captures and stage tracing was interrupted before producing its final report; therefore a fresh complete ten-control Browser/Word replay was not established. The focused Abbotts UI run and the complete automated Run #75 suite passed.

#### GitHub tooling and checkpoint status for this control

Dependabot weekly npm/Actions updates remain configured. Codecov and OpenSSF Scorecard remain candidates for later CI maturity; Sentry remains deferred pending telemetry/privacy ownership; Renovate remains deferred while Dependabot owns npm and Actions. No tooling was installed. Worktree remains uncommitted at base `db6717f1f9c52a83525f32fe01e85afc86ade8c5`, with the existing recovery patch preserved and this control appended. `main` remains at frozen `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. Nothing was pushed.

**Abbotts Rise engineering replay: PASS with product-acceptance limitations.**

**READY FOR BETA.2 PRODUCT OWNER RE-ACCEPTANCE — NO** — the Browser does not expose Route 25B and 25C as independently auditable direction/frequency rows, and a clean complete manual golden-control replay was not established in this continuation. Do not release Beta.2.

GitHub reachability check: `git ls-remote origin refs/heads/codex/atlas-bus-beta2-known-defects-hardening refs/heads/main` could not resolve `github.com` (`Could not resolve host: github.com`). Therefore remote branch HEAD and live `origin/main` could not be independently confirmed in this run; only local `main` resolves to the frozen SHA above. No push was attempted.

### Route-family review and safe end-of-day closeout — 6 November 2026

This entry supersedes the provisional Abbotts acceptance limitation above that treated the absence of standalone 25B/25C rows as a blocker. The Product Owner asked for the 25 family to be compared with the approved Waltham 13 family before changing row structure. The evidence supports **REFINE**: keep proven family variants consolidated under the principal public directions and make the child destinations and materially different schedule populations explicit in a generic family note. Do not add separate 25B/25C table rows and do not combine their frequency with Route 25.

#### Source evidence and route-family decision

The nearest-stop UI reproduced logical group `210G368` with physical StopPoints `210021303500` and `210021309320`. The candidate used immutable Run #75 (prepared 20 October 2026). The selected BODS services are all Central Connect, share the Abbotts Rise/Hoddesdon trunk, retain exact source-record lineage, and have compatible direction patterns. Route 25B contributes two child destination patterns in the Brookfield direction; Route 25C has one weekday trip toward Waltham Cross and one weekday trip toward Harlow. The resulting public family is real, while the child destinations and calendars are not interchangeable.

| Service member and frozen source IDs | Run #75 trips at the assessed stop | Beta.2 note |
|---|---|---|
| 25B → Station Road — `south_east:6770385:0:14fa1574e4b8` | Mon–Fri 2/day; Sat 2/day; Sun 0 | Station Road count shown separately. |
| 25B → Sainsbury’s — `south_east:6770385:0:e53e3ee8866b` | Mon–Fri 3/day; Sat 1/day; Sun 0 | Sainsbury’s count shown separately; no false shared 5/3 pattern. |
| 25C → Waltham Cross Bus Station — `south_east:12315124:0:f8ce81409145` | Mon–Fri 1/day; Sat/Sun 0 | Waltham Cross corridor is identified as a weekday-only, one-per-day service. |
| 25C → Harlow Town Centre Temp Bus Station — `south_east:12315124:1:5d726c4b4cbf` | Mon–Fri 1/day; Sat/Sun 0 | The same-destination Harlow trip is now disclosed even though it adds no new principal location. |

Route 25 retains its two directional rows. The observed planner frequencies remain principal-service values: towards Brookfield Centre, typically every 60–65 minutes Mon–Fri and about every 60 minutes Saturday; towards Harlow Town Centre Temp Bus Station, typically every 55–60 minutes Mon–Fri and every 60 minutes Saturday. Neither the 25B population nor the two 25C journeys is added to those rows. The four source records above remain visible as family-member provenance. The UI audit confirms each 25B destination count separately, each 25C direction separately, no weekend service for 25C, and Browser/Word parity.

The first family-note pass still hid the 25C Harlow child because its destination duplicated the principal route. It also reported a combined 25B 5 weekday / 3 Saturday total beside two destinations with different operating counts. The final generic correction derives low-volume family-member counts by exact origin/destination from the member’s raw scheduled evidence, deduplicates equal departure events, and preserves each child destination’s days. It adds a constrained availability note for a family member that has the same principal destination but materially different counts or calendar. It does not display low-frequency counts above the existing materiality threshold, create route-specific behaviour, change the family frequency, or enlarge the row count. A synthetic same-destination family control verifies that a variant with identical evidence does not create a spurious note.

The comparison with the existing Route 13/13A/13B/13C presentation follows the same rule. Waltham Route 13 retains its principal frequency while its child notes now qualify the split schedule evidence: Route 13B’s two Railway Station Saturday trips and three Waltham Abbey (Princesfield Road) weekday trips are no longer presented as one shared 3/2 profile. Browser and Word tests protect the same wording. The generic standard is to group a proven family when its member destinations and material schedules can be communicated accurately; retain distinct rows where the family note cannot preserve the service identity or passenger-relevant distinction.

#### Beta.1 content comparison and seven-route reconciliation

The supplied Beta.1 Word export was read from its OOXML table content. Its opening describes two nearest logical-group stops, seven public routes and nine timetable patterns. It shows two Route 25 principal directions, one Route 25B direction to Sainsbury’s, and one Route 25C direction to Waltham Cross. A separate note says 25B also serves Station Road but gives no Station Road schedule. It does not disclose the one-per-weekday 25C Harlow direction. Its Route 35 Hertford row says two journeys/day; its 35B note merely says it also serves Abbotts Rise; its 35C row carries both “School-day journeys only” and “weekdays only”.

| Route | Beta.2 nearest-stop Browser result | Review disposition |
|---|---|---|
| 25 | Two rows: Brookfield and Harlow. The Browser shows ordered downstream locations, with principal frequencies kept independent of child routes. | PASS; family frequency remains principal-only. |
| 25B | Kept in the Route 25 family note: Station Road 2 weekday/2 Saturday; Sainsbury’s 3 weekday/1 Saturday; no Sunday. | PASS; separate child destination counts avoid the old shared-frequency implication. |
| 25C | Kept in the Route 25 family note: Waltham Cross and Harlow, each one weekday journey and no weekend service. | PASS; both opposing directions are traceable and the Harlow child is no longer hidden. |
| 33 | Two distinct Central Connect directions, 4 weekday journeys each; no weekend service in Run #75. Downstream locations remain direction-specific. | PASS against the frozen snapshot. Current published Intalink disruption says the route does not serve Stanstead Abbotts/Hoddesdon through 8 November 2026; this later source state was not substituted into Run #75. |
| 35 | Two distinct directions. To Bishop’s Stortford, the operating period starts at 06:21; to Hertford it spans 06:30–20:03 on weekdays. | PASS; the second direction is no longer shown as only two journeys. |
| 35B | No boardable planner row at Abbotts Rise. Source evidence stays traceable and the note says “terminating arrivals only; no departures from this stop”. | PASS; terminal calls are not advertised as departing service. |
| 35C | Two directions: 2 weekday journeys to Hertford and 3 weekday journeys to Birchwood High School; no weekend service. | PASS with a route/stop-specific calendar review warning. Weekdays are supported; a school-day restriction is not. |

The content-level Beta.1/Beta.2 comparison is reproducible from the supplied Beta.1 export and the final Browser/Word audit. The packaged DOCX renderer could not visually render Beta.1 because the bundled environment has no LibreOffice executable. No visual page-to-page comparison is claimed. Beta.2 Browser and Word both contain the complete refined family note; Word service rows retain the same principal route frequencies as Browser.

#### Eleven required review-v2 controls

The full headless audit executed all eleven required controls and two retained supplemental controls (Waltham nearest-group and the Chingford 657 control). All per-control assertions passed; there were no audit failures or external requests. Each control completed stop discovery/selection, assessment, Sources & Checks inspection, acknowledgement/export gating, Word generation/parity checks and valid A3 landscape PDF map generation. Grove Road had no review gate to acknowledge; its acknowledgement was correctly not required and export was enabled. The other ten named controls had their required acknowledgement checked before export.

| Required control | Browser rows | Assessment and review disposition |
|---|---:|---|
| Tufton | 24 | W11 BODS/TfL identity and Route 158/W16 exact-stop timetable evidence remain explicit review items. Recorded TfL response for the Chingford Mount exact-stop timetables returned HTTP 400; no departure was fabricated. |
| Pipers Lane, 700 m | 3 | Route 231 operating-day conflict and incomplete NaPTAN stop coverage remain visible. |
| Pipers Route 46, 1,200 m | 7 | Same candidate dataset and stop-coverage notices; Route 46 BODS/TNDS reconciliation golden passed. |
| Waltham Cross | 20 | Route 217/317/327 TfL vs BODS direction/identity conflicts remain route/stop-scoped; 13 family, 16/16C, 212, 242 and other golden assertions passed. |
| Grove Road | 8 | Assessment complete; no review acknowledgement required. Captured TfL Browser/Word control passed. |
| Long Lane | 14 | N555 complex special-day profiles remain unresolved and explicitly reviewable. |
| Hoddesdon | 18 | Route 32A school/term metadata has no journey-level calendar evidence; warning remains visible. |
| Wycliffe / Stonehouse | 47 | School metadata and Route 72SN/72SS calendar conflicts remain visible; Route 65 grouping control passed. |
| Milton Keynes Route 5 | 84 | Existing school-calendar, unresolved endpoint and stop-source evidence remain visible; source-copy reconciliation control passed. |
| PE1 | 43 | School-calendar and Route 4P incomplete ordered-location warnings remain visible; Route 202 branches passed. |
| Abbotts Rise nearest pair | 8 | 25/25B/25C family, 33/35 directions, 35B terminus, 35C calendar and exact Browser/Word family notes passed. |

The full audit used the retained 135-response captured live TfL set for London controls: all 135 matched, with zero misses or unused responses. This is replayed captured evidence, not fresh live TfL evidence. OSRM map-routing values in the review fixtures are deterministic evidence and are not represented as fresh route calculations. The status manifest is absent from Run #75 and the checkout; the isolated review app returned 204 No Content and correctly reported that independent status source unavailable.

#### Full engineering verification and source limitations

- `node tests/atlas/run-all.mjs` passed after the final planner change with the immutable Run #75 Bus/TNDS roots and frozen iBus root; final output: `ATLAS Alpha.15 deterministic suite passed.`
- Focused Route 13 family wording, Route 25 family, Browser/Word parity, terminal-arrival, planner summary, service-assessment and semantic BODS/TNDS tests passed. The Abbotts real review-v2 control passed after the final source-variant assertions.
- `tools/atlas-bus-data/test_build_static_index.py`: 20 tests passed using the configured bundled Python runtime.
- `node --check` passed for the changed planner and audit modules; `git diff --check` passed.
- No source data was refreshed. Run #75 remains the 20 October snapshot. Current official timetables/notices are a separate comparison: Intalink currently notes the Route 33 closure through 8 November; Central Connect’s 2 November change notice reroutes 35-family Bishop’s Stortford journeys via Link Road with no timetable change. These later facts do not rewrite the frozen source schedules.
- Route 35C journey-level school/term calendar remains unresolved. Abbotts NaPTAN source coverage is incomplete. Route 33’s currently published disruption and the prepared snapshot date differ. Tufton has unresolved W11 identity evidence and no current 158/W16 timetable match at the exact audited stop. These are explicit source limitations, not claims that a route is absent.
- Other named golden controls were exercised in Run #75 and the actual review-v2 workflow: Waltham 13 family/16/16C/242/212/279; Pipers 46/230/231; Stonehouse 65; Milton Keynes 5; PE1 202; Tufton 158/W16/397A/W11; and the Abbotts route family. The full deterministic suite and all-control Browser/Word/map replay passed its assertions.

#### Worktree, GitHub and checkpoint state

Starting and final candidate HEAD are `db6717f1f9c52a83525f32fe01e85afc86ade8c5`. The current review worktree remains detached at that commit with the pre-existing Beta.2 WIP plus the generic family-note correction and regression/documentation updates uncommitted. The separate hardening branch worktree is still on `codex/atlas-bus-beta2-known-defects-hardening` at `db6717f`; no transfer was attempted. The accepted Beta.1 baseline worktree remains at `db6717f` according to the worktree inventory, but its path is outside this task’s readable workspace and was not modified. Local `main` and GitHub `main` both remain `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. The GitHub API independently confirms remote hardening-branch HEAD remains `db6717f1f9c52a83525f32fe01e85afc86ade8c5`. No commit, push, merge, tag, deploy, release, version/build change or data refresh was performed.

Existing recovery patches were preserved, including `tmp/atlas-po-defect-corrections-verified-final-2026-11-06.patch` (SHA-256 `F704E59DD34A07F19A45AEEAD984A851F13B431065702672F1EA74C31FADD38B`) and the pre-family-review patch (SHA-256 `3DE33CC18F139319602DEBFFDB2383125E991387576F0DF15F7E1800A88E0ED5`). A new final patch hash will be recorded after the final diff is captured.

#### GitHub tooling adoption review

No tooling was installed or reconfigured. Dependabot is already configured for weekly npm and GitHub Actions updates. Codecov and OpenSSF Scorecard remain optional CI/security maturity candidates; Sentry remains deferred until telemetry and privacy ownership are defined; Renovate remains deferred while Dependabot owns npm and Actions. There is no newly approved installation milestone in this closeout.

**Route-family engineering outcome: REFINE.** The new Abbotts product control passes. Manual Product Owner re-acceptance remains outstanding; no Beta.2 release is authorised.

### Final Product Owner acceptance defect review — 9 November 2026

#### Input provenance and review environment

The five current Product Owner Word exports were identified and hashed, but their document XML contains no review-build identifier, assessment-point coordinates, search mode, radius, Run #75 marker, or source-manifest fingerprint. Their physical stop tables and the supplied Sources & Checks screenshots therefore cannot be bound to one exact assessment input solely from the artifacts. The 9 November filenames and SHA-256 values are:

| Product Owner report | SHA-256 |
|---|---|
| Abbotts Rise / Roydon Road | `054F1CBA291F1FB17A883D9F49CAB2FC89FA6FA7AA96EF67859616D5DFCFA6D4` |
| Waltham Cross / Berkley Avenue | `3CD498EB64C963838BAC8F2A0B0FF8F8D85983062A27FC3D09C75ADDBD194066` |
| Tufton Road | `92B1E0AC4E26C3D9FB70165FE86DD3674CA756247CB6A4068B02CADDB8E02CD6` |
| Pipers Lane | `A29BE97EDA33C8A04D999B92CFCF49243F7947BB070A62488AE4D4276F40A7C5` |
| Stonehouse | `86C373C0A7EBB3F53AEDAE4DD3C80F09A1BED9A030A298BC16FA9F063F636E16` |

The intended application JavaScript from checkpoint `6013d8521bb11852b39555bfa972269130fa1847` has SHA-256 `B78F5516B6843ABD1E740EA733BA381DA5716C48C501C2D005FA08DF4306DE65` and is served by the 8771 review app. Its HTML contains contradictory candidate labels: `db6717f` in the review-candidate marker and `6013d85` in the bus build marker. The review proxy source also advertises `db6717f`. This environment is not unambiguously identified as 6013 at the user-facing marker level. No review proxy or production code was edited to conceal that mismatch.

The headless replay used immutable Run #75 candidate run `39430415441`, artifact `12275615359`, digest `sha256:5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`; Bus manifest `sha256:1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f`; and TNDS manifest `sha256:2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`. Bus data was prepared 20 October 2026 and TNDS 19 October 2026. No national data acquisition was attempted. The iBus index in the review bundle is LF-hashed `5efcf64bfe1e158ecac52a8df8609984600b90ddd9b1b25b5112de7f6e24ebc1` while its manifest expects `39b0eae384ec7a44115f898b940b3f35213577195706d38a82fa97707d2610de`; this prevented the full Run #75 suite from clearing its iBus integrity assertion with that root.

#### Reproduced workflows

The actual headless review-v2 UI audit exercised 13 controls with acquisition, publication and deployment disabled. Twelve controls produced Browser rows, Word exports, A3 map PDFs, acknowledgement state and Sources & Checks results; all had a valid map signature. The Tufton control rendered no service rows because the audit had no live TfL capture for that exact point. The run exited 1 with `tufton: Normal rendered Bus assessment has no service rows`; this is a fixture/workflow limitation, not evidence that the Word routes are absent.

The Waltham 700 m replay returned 27 review entries rather than the Product Owner screenshot's eight, while nearest-group mode returned 12. The Word assessment lacks the search mode and stop selection needed to identify which is comparable. Abbotts replay returned the one scoped 35C calendar item at StopPoint `210021303500`, matching the supplied screenshot's route and stop identity. Pipers replay returned one Route 231 TNDS conflict, but at StopPoint `021028151`, while the supplied screenshot identifies `021013516`; this replay does not establish identical Product Owner input. The assessment status correctly read `Assessment execution complete · source or routing checks incomplete` for incomplete controls.

The repeat note `Journeys vary in the intermediate stops served.` is reproduced in actual Pipers Browser/Word output for both Route 231 directions. Its source code adds the note whenever any named route-pattern call is absent from another record. That rule does not distinguish a real corridor branch or short working from call-level variation, day profiles, supplementary records, or duplicates. The specific route-pattern comparison required to safely replace or scope the note is not in the Word artifacts or audit output. No blanket suppression was applied; this defect remains open.

#### Route-specific findings

- **Pipers Route 231:** The current report changes the Dunstable Asda Saturday population from two to three. The immutable TNDS preparation exposes multiple pattern/calendar records at the assessed control; at least one 08:04 journey population is represented both as an all-days pattern with partial `SpecialDaysOperation` metadata and as a separate weekday-only record. Other records supply 09:04 and 11:34 populations. Prepared records do not retain raw vehicle-journey IDs sufficient to prove whether the 08:04 Saturday trip should count, and the screenshot warning is for a different StopPoint from the 1,200 m control replay. The defensible Saturday count remains **unresolved between two and three**; the source warning must stay scoped to its actual stop. No count correction was made.
- **Waltham Route 16:** Frozen BODS service `south_east:6770339:0:303ca11ab560` at Stop C `210021703430` has Saturday schedule minutes including both 19:10 and 19:38 in the prepared shard (`services/21002-south_east.json.gz`, SHA-256 `cb85ad21001962b179b507765f34e8593e526e294fdab4ecac2a954afd79920f`). The prepared record has no journey IDs or arrival/departure roles. The original GTFS stop-time source was not available locally, so 19:38 cannot be established as a boardable departure or a return arrival. The current report's 19:10 and previous 19:38 are not reconciled. This remains a release-blocking uncertainty.
- **Stonehouse Route 65:** The Product Owner's two rows use Pearcroft Road stop `1600GLS313`. The earlier one-row engineering claim used Merrywalks stop `1600GLA90863`, a different assessment population, so the outputs are not comparable. Run #75 BODS shard `services/1600G-south_west.json.gz` (SHA-256 `edfbE869a696e252753e029de0f6e5b107a07b637f294483e8938a357b487a9c`) contains distinct ordered Route 65 patterns at Pearcroft, including `south_west:132064:1:c78449922048` and `south_west:132064:1:f893552b3362`; it also contains duplicate Elmore Village Hall entries `...:2d95c93cf4ad` and `...:82607368c09e` at the same 17:51 time. The two corridor populations are distinguishable, but overlapping/duplicate departures and the exact public-row grouping are not fully reconciled from the current Word export. Preserve both pending a like-for-like assessed-stop trace.
- **Stonehouse destination text:** the 9 November Word export's introductory sentence leaks `Transport Hub arrival` although its route table has a matched Gloucester endpoint. The narrative builder included raw destination and principal-location text. Generic removal of a trailing `arrival` annotation was added, with a Word narrative regression. `School Groundss` is present in the Product Owner Word export but was not tied to an immutable Run #75 source record at the comparable assessment point. No destination was invented or rewritten; this remains an explicit source-label review item.
- **Tufton:** the Word report contains the cited 158, W16 and 397A patterns, but no Product Owner Sources & Checks screenshot was supplied. The no-live-capture exact-control audit produced no rows and cannot explain the panel observation. No warning was fabricated. The Word date sentence conflated the calendar assessment date with the age of frozen timetable data; the note builder now distinguishes assessment generation date, calendar date, application retrieval date, and available BODS/TNDS/NaPTAN preparation dates, and it does not use a prepared-data timestamp as an assessment date.
- **Review-note punctuation:** the short-working merge could join a full stop and semicolon (`served.;`). Sentence joining now normalizes terminal punctuation and is covered by a regression.

#### Verification and decision

Focused tests passed: Word export/narrative, simple calendar presentation, Enfield Browser/Word variant presentation, and Alpha.13 planner summary/punctuation. The actual Pipers 1,200 m workflow passed Browser/Word/map and Sources & Checks assertions, but it did not match the screenshot's warning StopPoint. The 13-control headless audit failed only at Tufton because its exact TfL response fixture was absent; it does not establish PO equivalence for any report lacking point/radius/mode metadata.

`node tests/atlas/run-all.mjs` did not pass: it stopped at the frozen iBus index-versus-manifest hash mismatch above. Later suite gates were therefore not reached. The repeated generic pattern note, Pipers Saturday count, Waltham 16 terminal departure identity, Tufton panel/build provenance, Stonehouse report-input identity, and exact two-row Route 65 grouping remain unresolved. No additional commit or push is justified. Local and GitHub `main` both remain `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`; the existing hardening branch on GitHub remains `6013d8521bb11852b39555bfa972269130fa1847` (read-only ref verification). The detached worktree remains at `db6717f1f9c52a83525f32fe01e85afc86ade8c5` with the pre-existing uncommitted hardening changes and the focused presentation fixes from this review. Release remains prohibited; Product Owner manual acceptance remains outstanding.

### Environment reconciliation and controlled acceptance recovery — 9 November 2026

This continuation preserves the detached WIP at `db6717f1f9c52a83525f32fe01e85afc86ade8c5`, the pre-existing changes, and the previously reported recovery patch (`tmp/atlas-po-acceptance-review-final-2026-11-09.patch`, SHA-256 `6128CE0410BEBA42A924BA41285C3EEEC88D691676F7F6681C3C2004F315CC46`). No production version, source dataset, `main`, or remote branch was changed. The updated recovery patch is recorded separately below.

#### Frozen iBus pairing and candidate identity

The failed command resolved `ATLAS_TEST_TFL_IBUS_ROOT` to `C:\Users\joe.freeman\AppData\Local\ATLAS\manual-acceptance\bus-s2d1\review-root\atlas\data\tfl-ibus`. Its manifest SHA-256 is `14b416823cb648c869750db90939bac33a027f2f91485322f08c2d9c4394914f` and expects index `39b0eae384ec7a44115f898b940b3f35213577195706d38a82fa97707d2610de`; its mounted `20261009/operator-index.json` SHA-256 is `5efcf64bfe1e158ecac52a8df8609984600b90ddd9b1b25b5112de7f6e24ebc1`. This was a mixed mount.

Two complete existing pairs were verified. The frozen calendar-stability dataset at `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\atlas-bus-tfl-ibus-calendar-stability\atlas\data\tfl-ibus` has manifest SHA-256 `3090e1da6da21878725d0b30343757bd32c65fcdd56d9fdecb6f6ae6c75b5d53` expecting 39b and index SHA-256 `39b0eae384ec7a44115f898b940b3f35213577195706d38a82fa97707d2610de`. The hardening-branch dataset at `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\codex-worktrees\atlas-beta2-known-defects-hardening\atlas\data\tfl-ibus` has manifest SHA-256 `872ced235cee25ba37e1d48c3d446ae8dc8478332fb78f898987d1152e69580a` expecting 5ef and index SHA-256 `5efcf64bfe1e158ecac52a8df8609984600b90ddd9b1b25b5112de7f6e24ebc1`. Both are valid; the index byte hashes differ because of line endings while normalized JSON content matches. The full suite used the verified 39b pair. No checksum, manifest, index, integrity check, or frozen data was changed.

The immutable Run #75 Bus manifest is SHA-256 `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f` (snapshot 19 October; prepared 20 October 2026). The TNDS manifest is `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f` (TNDS 2.5 preparation 19 October). The iBus index is from 9 October. The headless audit used frozen candidate run `39430415441`, artifact `12275615359`, digest `sha256:5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`.

The isolated 13-control run served source modules from the detached WIP root. `atlas/index.html` SHA-256 is `402a620d61cef1e14e3484bda2c0f145eaa97526cfa91a6bcfa6687f988e36c9`; `atlas/assets/js/app.mjs` is `b78f5516b6843abd1e740ea733ba381da5716c48c501c2d005fa08df4306de65`. The loaded WIP service-assessment and planner-summary modules were `b1e4f4aa1aaa48a1e8670b59809895914994d6138cef12334142dea3fa26640b` and `1b8c023a836013be48d6886ca64404b5b9d1aff733fcfbddb93ed8ef627f8bd7`.

The existing 8771 proxy explains its conflicting visible markers: `tmp/atlas-beta2-final-review-server.mjs` (SHA-256 `bbec36f54b2599d1ef13700dbee15fc9a3e55793b697c94d0294ab8a86cad894`) resolves `rootDir` from its launch directory and hard-codes `shortSha='db6717f'`; the static checkout HTML retains `6013d85`. The two labels originate in proxy metadata and the base HTML, not mixed/cached application JS. The Product Owner's visible browser was not controlled. The isolated audit used its own localhost server and WIP application root, but the 8771 label remains unsuitable to identify an uncommitted WIP by itself.

#### Route evidence reconciliation

- **Pipers Route 231:** At Hillcrest Park O/S StopPoint `021024640`, the frozen TNDS record `tnds:SE:bed_51-231-_-y08-1.xml:51-231-_-y08-1:pattern:JP_51-231-_-y08-1-1-O-2` has weekday and Saturday times 08:04, 09:04, 11:34. Saturday evidence retains journey identities for those times. The separate `JP_51-231-_-y08-1-2-O-1` 08:04 row is weekday-only and must not be counted on Saturday. The records carry `SpecialDaysOperation` metadata and remain partial. South Beds Dial-a-Ride's currently linked 1 September 2025 timetable shows two mutually exclusive weekday 08:04 columns (school / school holiday), plus 09:04 and 11:34; its Saturday pattern starts at Brickhill Park 08:58, serves Aley Green / The Chapel at 09:04, and does not print a Hillcrest Park time. Thus the frozen snapshot contains three Saturday times at this stop, but the current operator timetable does not validate two or three Saturday departures at this exact StopPoint. Keep the Run #75 source values and review qualification; do not call either count current verified service. The screenshot StopPoint `021013516` (Sports and Social Club), replay StopPoint `021028151` (Hillcrest Park, opposite direction), and outbound `021024640` are distinct physical/timetable bases. The operator PDF has stop names but no NaPTAN IDs, so the exact point-to-PDF association is not proven.
+- **Waltham Route 16:** Frozen BODS service `south_east:6770339:0:303ca11ab560` at Stop C `210021703430` has 19:10 and 19:38 but no per-time trip identity or arrival/departure role. Central Connect's Saturday timetable for 10 October 2026 labels 19:10 at Stop C “pick up only” and 19:38 “set down only”. Current published evidence therefore identifies 19:10 as boardable and 19:38 as a terminal arrival. The immutable candidate UI still includes 19:38 in its period; the historic prepared record cannot be silently rewritten or safely reclassified from its available fields. This is a material acceptance blocker, not a proven software defect in Run #75.
+- **Abbotts Rise:** The actual nearest-group replay used `51.78711445, 0.01104605` and assessed two public stops. Browser and Word show correct downstream Route 25 directions; the structured Route 25 family trace retains Route 25B's five weekday / three Saturday journeys as Station Road (2/2) and Sainsbury's (3/1) variants and both weekday-only Route 25C directions. Route 35 appears in both directions and is not collapsed to two daily journeys. Route 35B has no planner departure row at terminal Abbotts Rise and is disclosed as terminating arrivals only. Route 35C's three weekday journeys are not marked school-day-only; a Sources & Checks item says no journey-level calendar evidence was supplied. Central Connect's 7 November timetable shows multiple pick-up-only 35-family departures at Hertford and stop-specific set-down-only calls; its 2 November notice reroutes Stortford-bound journeys via Link Road without a timetable change. The frozen Run #75 source and current operator timetable remain separate dates. The Word files lack point/radius/mode/build metadata for exact whole-report comparisons.
+- **Stonehouse Route 65:** The Pearcroft Road replay used StopPoint `1600GLS313`, `51.74319, -2.27813`, radius 120 m. It returned two distinct Stagecoach West rows towards Dursley and two matching Word rows: an early Stonehouse/Oldend/Nastend path with Village Hall supplementary service, and a longer daytime/Sunday Cambridge/Slimbridge path. The duplicate Run #75 Elmore Village Hall records at 17:51 contribute one displayed departure. Browser and Word both name intermediate variations (including Passage Road, The Ship Inn, Primary School, and Railway Station); acknowledgement, Word export and A3 map passed. The earlier Merrywalks StopPoint `1600GLA90863` is a different assessment. This reconciles frozen candidate grouping at Pearcroft; exact current Stagecoach departure parity was not independently established from a current timetable.
+- **Tufton:** The full 135-response TfL capture matched all requests, with zero misses, unused responses, failed browser requests, or external requests. At `51.613869, -0.020303`, 700 m, the Browser/Word/map workflow rendered 158, W16 and 397A and three actionable Sources & Checks items: W11 route-identity disagreement at `490009752E`; no current exact-stop TfL timetable match for 158 at `490005180E`; and the equivalent W16 exact-stop no-match. The two captured TfL 400 responses were reconciled to the 158/W16 items. This proves the audited scope displayed a panel; the PO Word report lacks assessment-point metadata, so a different PO run cannot be excluded.

#### Presentation changes and verification

The repeated generic note `Journeys vary in the intermediate stops served.` is now replaced by a concise note that names up to four differing calls and indicates if more vary. The Pearcroft Browser and Word outputs show specific call names; existing branch and short-working details remain. The focused regression checks the named variation.

- `node tests/atlas/bus-service-assessment.test.mjs` — **25 passed**.
- `node tests/atlas/run-all.mjs` with the immutable Run #75 Bus/TNDS roots and verified 39b iBus pair — **passed**, ending `ATLAS Alpha.15 deterministic suite passed.`
- Full headless review-v2 audit — **13/13 controls passed** with operator-stage tracing enabled. All 135 recorded TfL responses matched; there were zero misses, unused responses, failed browser requests, or external requests. Browser/Word, maps, Sources & Checks, and acknowledgement checks passed where required. Two expected Tufton TfL 400 responses were scoped to review items. Report readiness: `READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_RE-ACCEPTANCE`.
- Additional Pearcroft Route 65 Browser/Word/map replay — **passed**, with two distinct rows in each output, acknowledgement checked, valid A3 PDF signature, and no external or failed requests.
- Existing deterministic Beta.1 compatibility controls passed in Run #75. A separate exact Beta.1 UI replay at Product Owner coordinates cannot be reconstructed because the Word exports omit coordinates, search mode, radius, and data-manifest identity.

The remaining material gates are Route 16's current-vs-frozen stop-role mismatch, Pipers current-vs-frozen Saturday call-pattern and partial special-day evidence, missing PO input metadata, and the stale 8771 marker. The full suite and all 13 controls pass, but those facts do not establish Product Owner acceptance.

#### Final Git and tooling status

WIP remains detached at `db6717f1f9c52a83525f32fe01e85afc86ade8c5`; the established hardening branch/worktree and GitHub branch remain at `6013d8521bb11852b39555bfa972269130fa1847`. GitHub's read-only branch endpoint confirms remote `main` is `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`, unchanged from local `main`. The worktree remains intentionally dirty; no changes were transferred, committed, or pushed. The accepted Beta.1 source was not written.

**GitHub tooling adoption:** Dependabot weekly npm and Actions updates are already configured. Codecov, OpenSSF Scorecard, Sentry and Renovate remain review candidates. No installation milestone was reached or authorised; no tooling was installed or reconfigured.

**Engineering result: NOT READY for final Product Owner re-acceptance. Keep Beta.2 unreleased.**

#### Current operator-source references

- South Beds Dial-a-Ride's currently linked [Route 231 timetable PDF](https://www.sbdar.co.uk/wp-content/uploads/231_Timetable_change_1st_September_2025.pdf) and [public bus services page](https://www.sbdar.co.uk/our-services/public-bus-services/); the PDF is dated 1 September 2025.
- Central Connect's [Route 16 timetable for Saturday 10 October 2026](https://www.central-connect.co.uk/services/TMSB/16?date=2026-10-10&direction=clockwise), including Stop C pickup/set-down roles.
- Central Connect's [Route 35 family timetable for Saturday 7 November 2026](https://www.central-connect.co.uk/services/TMSB/35?date=2026-11-07&direction=inbound) and [2 November service-change notice](https://www.central-connect.co.uk/servicechanges-nov26).
- Central Connect's [Route 25 family timetable](https://www.central-connect.co.uk/services/TMSB/25?date=2026-11-09&direction=inbound).
- Stagecoach West's [network overview for Gloucester, Stroud, Stonehouse and Dursley](https://www.stagecoachbus.com/about/west/gloucester). The exact current Route 65 stop-level timetable was not retrieved in this review.

### Final source-evidence and candidate-identity closeout — 9 November 2026

This section supersedes earlier environment-marker and Pearcroft verification statements where they conflict. The work remains an uncommitted continuation at detached HEAD `db6717f1f9c52a83525f32fe01e85afc86ade8c5`; all existing tracked edits and `tests/atlas/bus-timetable-merge-semantic.test.mjs` were preserved. The earlier recovery patch `tmp/atlas-po-acceptance-review-final-2026-11-09-updated.patch` was re-hashed and remains SHA-256 `8A6D83561869F5E148DE5AD87D28556BA87ECC1757199147A51AEB336ADE1FA2`.

#### Source findings and actual product replay

- **Route 16 at Waltham Cross Stop C (`210021703430`):** Central Connect's published 10 October 2026 timetable identifies 19:10 as pick-up only and 19:38 as set-down only. In immutable Run #75, BODS service `south_east:6770339:0:303ca11ab560` retains both minutes in the same Stop C schedule but has neither per-journey identifiers nor pickup/set-down roles. The actual Browser/Word replay presents a Saturday operating period ending at 19:10, matching the operator-confirmed last useful boarding departure. That output is externally corroborated, but the prepared Run #75 schedule alone cannot prove the two roles or support a generic role rule. No code correction or route/time-specific inference was introduced; keep the operator corroboration explicit and do not rewrite Run #75.
- **Pipers Route 231:** The exact outbound StopPoint is Hillcrest Park O/S `021024640`; inbound Hillcrest Park opposite is `021028151`, and the separately reported Sports and Social Club point is `021013516`. Run #75 at the outbound point contains 08:04, 09:04 and 11:34 in Saturday schedules, while a second 08:04 population is weekday-only. The currently linked South Beds Dial-a-Ride PDF has weekday school/holiday 08:04 alternatives and a Saturday pattern through Aley Green / The Chapel, without a Hillcrest Park NaPTAN identifier or printed Hillcrest Park time. Accordingly, the frozen UI's `Sat: 3 journeys/day` must not be represented as operator-verified Saturday service; current operator parity at this physical point is unresolved. The existing Source & Checks warning is scoped to `021028151`, not `021024640`; this warning/table scope mismatch is a remaining blocker. Observations from different StopPoints were not combined and frozen TNDS data was not changed.
- **Stonehouse Route 65:** A dedicated actual Browser/Word/map replay at Pearcroft Road `1600GLS313` (51.74319, -2.27813; 120 m) passed. Browser and Word each retain two distinct Stagecoach West patterns towards Dursley: the early Oldend/Nastend/Nupend pattern and the Cambridge/Slimbridge pattern. Both have distinct ordered principal-location lists; Village Hall supplementary journeys remain disclosed. An initially failed parity assertion matched rows by the shared destination label and paired the wrong rows. The audit now pairs by principal-location pattern, and the replay passes with no application change for this control. Merrywalks is a different stop and is not used as a like-for-like comparison.
- **Candidate identity:** The former proxy exposed a Git short SHA while the UI's other label could identify a different checkpoint; neither label fingerprinted dirty served assets. `tools/atlas-review/review-server.mjs` now computes a deterministic SHA-256 over served code assets (excluding data), reports Git revision and dirty state separately, embeds a shared marker in the review page, and exposes `/__atlas-review/identity`. Status shares the application-code fingerprint. The identity record includes worktree/root identifiers, code-file count/hash, version, Run #75 Bus/TNDS manifest hashes, iBus manifest plus declared index/hash match, and explicit selected stop IDs, mode and radius in each isolated audit report. The full headless run's app hash was `62de788139eef22a4d74ddbe6068d1bb2c3304b5b12c80aeae2e4768b0fc6ee7`; marker: `ATLAS review 2.0.0-beta.1 · git db6717f · code 62de788139ee · worktree dirty`. The code stayed at version `2.0.0-beta.1`; no national data or production version was changed.

#### Verification record

The frozen inputs were unchanged: Run #75 Bus manifest `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f`, TNDS manifest `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`, and verified iBus manifest `3090e1da6da21878725d0b30343757bd32c65fcdd56d9fdecb6f6ae6c75b5d53` with its declared `20261009/operator-index.json` hash `39b0eae384ec7a44115f898b940b3f35213577195706d38a82fa97707d2610de` matching. The Bus/TNDS/iBus roots were kept separate and immutable.

- The final immutable `node tests/atlas/run-all.mjs` rerun passed with those verified roots, ending `ATLAS Alpha.15 deterministic suite passed.` The 8 review-environment tests and review-v2-runtime test passed immediately before the full suite; the suite itself repeated both runtime gates.
- Review-environment and review-v2 runtime focused tests passed after adding the identity endpoint and asset marker. The additional Pearcroft isolated headless replay passed site assessment, Sources & Checks, acknowledgement, Browser/Word parity, and valid A3 map export. Report: `tmp/po-pearcroft-route65-identity-closeout-2026-11-09.json`.
- The enriched 13-control headless Browser/Word/map audit passed all controls with the identity API and page marker matching; all 135 captured TfL responses matched, with zero misses, unused responses, failed browser requests or external requests. The two expected TfL 400 responses at `490005180E` remained scoped to the 158/W16 review items. Report: `tmp/po-acceptance-full-audit-identity-final-2026-11-09.json`. Controls covered Pipers, Waltham, Abbotts Rise, Tufton, Grove Road, Long Lane, Chingford, Hoddesdon, Wycliffe/Stonehouse, Milton Keynes and PE1.
- Accepted Beta.1 data and frozen main were not edited. The Beta.1 deterministic compatibility/golden assertions are in the full Run #75 suite; an exact historical UI replay cannot be established from PO Word files because those exports omit assessment location, mode, radius, build and manifest identity.
- Route 16's exact stop-role metadata and Route 231's operator-vs-frozen exact-stop Saturday evidence remain unresolved. Passing software checks do not remove those evidence limitations. Product Owner manual acceptance remains outstanding; engineering disposition is **NOT READY for final re-acceptance**.

#### GitHub, patch and tooling

The detached worktree still has the intended uncommitted WIP. The established hardening branch and its GitHub ref remain at `6013d8521bb11852b39555bfa972269130fa1847`; frozen local and GitHub `main` remain `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. The current diff was not transferred, committed, pushed, merged, tagged, deployed or released because source-evidence gates remain open. A fresh full patch and its hash are recorded in the final handover; the prior recovery patch above remains intact.

GitHub tooling review: Dependabot already has weekly npm and GitHub Actions update schedules. Codecov and OpenSSF Scorecard are optional CI/security candidates; Sentry should wait for telemetry/privacy ownership; Renovate overlaps the existing Dependabot scope. No tooling was installed or reconfigured. No installation milestone is approved in this closeout.

Current operator evidence: [South Beds Dial-a-Ride Route 231 PDF](https://www.sbdar.co.uk/wp-content/uploads/231_Timetable_change_1st_September_2025.pdf), [South Beds public bus services](https://www.sbdar.co.uk/our-services/public-bus-services/), and [Central Connect Route 16 timetable for 10 October 2026](https://www.central-connect.co.uk/services/TMSB/16?date=2026-10-10&direction=clockwise).

### BETA2-FIX-20261118 — final release-blocker correction (WIP)

This is an **unreleased engineering checkpoint** on isolated branch `codex/atlas-bus-beta2-blockers-20261118`, based on `db6717f1f9c52a83525f32fe01e85afc86ade8c5`. The original dirty review worktree remains separate and must not be rewritten. The full deterministic suite passed against the immutable Run #75 Bus/TNDS manifests (`1195f19b55d476600060d89b4a56517e039032f39a9f917ad49647ffec89df4f` and `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`). TfL iBus data used its independently verified 9 October manifest/index pair. No data refresh occurred.

#### Blocker dispositions

- **A — Waltham Route 16 boarding eligibility: SOURCE-LIMITED, SAFELY DISCLOSED.** The Run #75 BODS Stop C record has 19:10 and 19:38 but no journey identity or stop-time pickup/drop-off role. The published Central Connect timetable identifies 19:10 as pick-up-only and 19:38 as set-down-only; the 16C Sunday 19:45 control remains in the audit. The generic prepared-data code now retains explicit GTFS restricted-pickup calls as evidence, excludes them from departures, frequency and periods, and exposes unknown terminal-role limitations from frozen BODS records in Sources & Checks. This cannot retroactively repair missing Run #75 roles.
- **B — Route 24 at Redricks Lane/River Way: SOURCE-LIMITED, SAFELY DISCLOSED.** The existing Run #75 representation lacks exact per-journey pickup/drop-off roles and cannot establish that 18:51 is a boardable departure or prove an earlier final boarding time. The candidate now discloses that uncertainty for a selected BODS terminal where role evidence is absent. The independent endpoint identity warning remains separately recorded. Do not claim the period ends earlier without exact-stop evidence.
- **C — Pipers Route 231: STILL BLOCKED on exact-stop/source reconciliation; no frozen rows or warnings were changed.** Run #75 TNDS is snapshot/preparation evidence, not the current published timetable. The June 2026 Parish Council document is explicitly labelled effective June 2026, but is a scanned four-page PDF with no extractable timetable text in this environment. The earlier operator PDF effective 1 September 2025 gives weekday Hillcrest Park times (08:04, 09:04, 11:34), while its Saturday table lists 09:04 at Aley Green/The Chapel and 11:18 on the return at The Chapel, not a NaPTAN identity. StopPoints `021024640` (outward Hillcrest Park), `021028151` (opposite Hillcrest Park) and `021013516` (Sports and Social Club) are not interchangeable. A replay warning at `021028151` does not establish the screenshot warning at `021013516`; exact June PDF stop/time reconciliation remains open. The 700 m replay retains the 231 calendar conflict at the actual selected stop; no unsupported Saturday trip was deleted.
- **D — Route 417 separated operating windows: FIXED AND VERIFIED in focused tests and full suite.** Material gaps are now found from exact selected-stop scheduled departures (gap threshold is `max(180 minutes, 4 × median interdeparture gap)` and requires at least four unique departures). The control schedule renders `Mon: Approx. 08:13; Approx. 19:13–23:13`; ordinary three-trip low-frequency and overnight controls remain unsplit. Browser and Word share the same period model, and no departures are synthesized. Route 279's 15-hour gap control consequently renders distinct windows; journey times and counts are unchanged.

#### Verification and open candidate regressions

- `node tests/atlas/bus-service-assessment.test.mjs` — **29 passed**, including boarding-role exclusion, unknown-terminal disclosure, separated operating windows, ordinary low-frequency and overnight controls.
- `node tests/atlas/bus-alpha13-planner-summary.test.mjs` — passed before the final role-warning addition; rerun is included in the final checkpoint verification.
- `node tests/atlas/run-all.mjs` with the complete frozen Bus, TNDS and verified iBus roots — **passed**, ending `ATLAS Alpha.15 deterministic suite passed`. Re-run is required after the final generic warning change.
- `node tests/atlas/s2e1-manual-product-audit.mjs` — actual headless Browser/Word/map workflow completed 13 controls using 135 recorded TfL responses (0 misses, 0 unused, no external requests or failed browser requests; two expected TfL 400 responses remain at Tufton). Three assertions remain failed in the recovery candidate: Waltham Route 212 frequency-basis identity, Abbotts Rise Route 25B structured family membership, and PE1 Route 202 arriving-journey terminus evidence. These are candidate regression blockers; no out-of-scope grouping change is included here. This run does not establish exact Route 24/231 publication parity.
- The new Python data-preparation regression test is **NOT RUN** because this environment has no working Python interpreter (the available WindowsApps aliases are zero-byte). Install/locate a valid interpreter Friday, then run `tools/atlas-bus-data/test_build_static_index.py` before any verified engineering claim.
- The 13-control audit report is `tmp/atlas-beta2-fix-20261118-13-control-audit.json`; Run #75 and iBus manifest identities are recorded above. No browser or live external timetable acquisition was used.

Candidate version remains `2.0.0-beta.1`; no build/version metadata or prepared data changed. Readiness is **NOT READY for Technical Director review** until the three browser regressions, Route 231 exact-stop publication evidence and the Python test are resolved/retested. Product Owner acceptance remains separate and outstanding. No release is authorized.

#### Safe checkpoint and tooling

This WIP is isolated from the original detached dirty worktree. Original recovery patch SHA-256: `92E9F654815F2C8EE1B3634096B095C688EF72E39FA4F5559C6EE8074C7D3D22`; a copied backup remains under the isolated branch's ignored `tmp/atlas-beta2-blockers-2026-11-18-recovery/`. The intended controlled files are the preserved candidate files plus the role/window corrections, their regressions and this record; no frozen source data or release metadata is staged. Commit/push status is reported in the final handover after verification.

GitHub tooling review: retain existing weekly **Dependabot**; **Codecov** and **OpenSSF Scorecard** remain candidates after stable CI ownership; defer **Sentry** pending telemetry/privacy ownership; keep **Renovate** deferred while Dependabot owns dependency automation. Nothing was installed or reconfigured.

Sources reviewed: [Caddington Parish Council — 231 timetable notice (valid June 2026)](https://caddingtonparish.gov.uk/notice/integrated-bus-timetable/), [South Beds Dial-a-Ride — 1 September 2025 Route 231 PDF](https://www.sbdar.co.uk/wp-content/uploads/231_Timetable_change_1st_September_2025.pdf), and [Central Connect — Route 16 timetable](https://www.central-connect.co.uk/services/TMSB/16?date=2026-10-10&direction=clockwise). The official June PDF was reachable but contains no extractable text; its stop-by-stop times are therefore not asserted here.

#### Final verification supplement — 18 November 2026

After adding the generic terminal-role disclosure, `node tests/atlas/bus-service-assessment.test.mjs` passed **29/29**, `node tests/atlas/bus-alpha13-planner-summary.test.mjs` passed both suites, JavaScript syntax checks passed and `git diff --check` passed. The final `node tests/atlas/run-all.mjs` rerun passed with `ATLAS Alpha.15 deterministic suite passed` against the same frozen roots/manifests. The Python data-preparation test remains not run because no working Python executable is installed.

The final actual 13-control Browser/Word/map replay is `tmp/atlas-beta2-fix-20261118-13-control-audit-final.json`. It exercised 13 controls with the candidate app code fingerprint `64aefd9d02e6561a77261228127a30037cd4b35c339b4b52a4281847571be075`, matched all 135 captured TfL responses (no misses/unused), had zero failed browser requests and no external network requests. Two expected TfL HTTP 400 timetable responses at StopPoint `490005180E` remain in the Tufton review. Word exports completed for 12/13 controls and standalone PDF maps for 10/13; the three controls failing assertions aborted before completing their remaining exports. The final candidate remains **NOT READY** because Waltham 212's Stop C frequency-basis identity, Abbotts Rise Route 25B structured family membership and PE1 Route 202 arriving-journey terminus evidence still fail.

GitHub API readback confirms `main` remains `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`, the existing hardening branch remains `6013d8521bb11852b39555bfa972269130fa1847`, and the dedicated sprint branch did not exist before checkpointing. The exact local commit, normal-push result or recovery bundle SHA, and final worktree states are in the handover below.

#### Route 24/417 exact-stop snapshot detail

Run #75's Harlow NaPTAN shard identifies River Way Rdbt as StopPoint `1500TMPLFLD2` (adjacent, southwest-bound); River Way `1500IM2689` and opposite `1500IM2689B` are separate physical stops. The frozen Route 24 terminal record `south_east:6770381:0:086c271586d9` carries weekday 18:51 at `1500TMPLFLD2` but no per-journey boarding role. The operator timetable published for 14 October 2026 explicitly marks River Way Rdbt 18:51 “set down only”; therefore the source-side claim is supported, but Run #75 cannot safely encode that role retroactively. This is the reason Route 24 remains source-limited despite the new generic disclosure.

At River Way opposite `1500IM2689B`, Run #75 Route 417 service `south_east:13605380:0:28fab45a3e0a` has Monday-Saturday minutes 494, 1154, 1214, 1274, 1334 and 1394 (08:14; 19:14–23:14), a long gap confirmed by a published 417 timetable at the adjacent Tesco stop. The Route 417-shaped regression uses the Product Owner's stated exact-stop sample (08:13; 19:13–23:13) and proves separated presentation and Browser/Word parity; the full 13-control audit did not run a separate Redricks UI scenario. The UI-specific exact-stop output remains a Friday confirmation item. See [Central Connect Route 24 operator timetable](https://www.central-connect.co.uk/services/TMSB/24?date=2026-10-14&direction=clockwise) and [Route 417 timetable stop sequence](https://bustimes.org/services/417-old-harlow-harlow).

#### Friday Sprint 1 reconciliation and final trace replay — 20 November 2026

The dedicated continuation branch began at `343f3c1520baa95b5a3d7765002a89e2ab93fd87`, based on common ancestor `db6717f1f9c52a83525f32fe01e85afc86ade8c5`. Previous hardening branch `6013d8521bb11852b39555bfa972269130fa1847` descends from `3d0fea1fa507e485bf0833ad9d00feca97de56e5`. No history operation was performed. Blob comparison across all 30 files changed in the prior hardening commit found 20 current blobs match byte-for-byte, 10 have later divergent content, and none reverted to the common-base blob. The common application-assessment, bus-grouping, source-presentation, timetable-merge, semantic-merge and relevant acceptance-test files remain identical to the previous hardening candidate. Later divergent files contain follow-up candidate changes covered by full regression and actual-product audit.

The apparent Waltham 212, Abbotts Rise 25B and PE1 202 failures were caused by running the acceptance audit without `ATLAS_C4_TRACE_OPERATOR_STAGES=1`. Their assertions read stage-trace properties populated only with that flag. The audit harness now stops with an explicit missing-trace setup error instead of reporting absent trace values as product failures; assertions were not weakened.

Actual production trace results:

- Waltham Route 212 uses Stop C `210021703420`; Monday-Saturday retain four distinct Run #75 journeys (09:50, 11:20, 12:52, 15:00), Sunday none.
- Abbotts Rise Route 25B remains a structured Route 25 family member. It retains five weekday and three Saturday trips across two distinct destination variants: Station Road has 2 weekday/2 Saturday; Sainsbury's has 3 weekday/1 Saturday; neither has Sunday service.
- PE1 Route 202 suppresses duplicate Queensgate-arriving rows while retaining six BODS/TNDS arrival source IDs on each useful departing pattern's terminus evidence. Bourne Bus Station and Austerby retain distinct times and Browser/Word parity.

The traced full audit on the current WIP candidate is `tmp/atlas-beta2-friday-current-13-control-audit.json`: all 13 controls, all 13 Word outputs and all 13 standalone landscape A3 maps passed. Captured TfL replay matched all 135 responses; there were zero misses, unused responses, failed browser requests or unexpected external requests. Two expected TfL HTTP 400 responses remain visible and scoped as Tufton source-review evidence at StopPoint `490005180E`. Audit identity: candidate `343f3c1`, build `2.0.0-beta.1`, application-code SHA-256 `64aefd9d02e6561a77261228127a30037cd4b35c339b4b52a4281847571be075`.

Bundled workspace Python 3.12.14 ran `python -m unittest discover -s tools/atlas-bus-data -p "test_build_static_index.py"`: **21/21 passed**. One assertion expecting `sourceWarnings` directly on prepared GTFS output was invalid for that layer's contract, which retains structured `nonBoardingCalls`; the application derives the user-facing warning at service-assessment time, covered by its own regression. Full `node tests/atlas/run-all.mjs` passed: **ATLAS Alpha.15 deterministic suite passed**, using immutable Run #75 Bus/TNDS and verified iBus roots. A sandbox temp-file error and a Windows ephemeral-port access denial occurred on preliminary attempts; the same full suite completed successfully on retry without code or data changes.

No production behavior, candidate data, release version or build metadata changed in Sprint 1. The three audited controls are verified; exact-stop reconciliation of Route 231 against the June 2026 publication remains open and is still a release blocker. Dependabot remains configured; Codecov, OpenSSF Scorecard and Sentry remain deferred; Renovate remains deferred in favour of Dependabot. Nothing was installed or configured. Checkpoint, push and final worktree status follow in the sprint handover.
## Friday Sprint 2 verification addendum — 20 November 2026

The Route 231 outward mismatch at Hillcrest Park O/S `021024640` is classified as a **source-version/currentness limitation; no software defect established**. The June 2026 Caddington Parish Council timetable (effective 22 June) shows one Saturday departure at 09:04 at Hillcrest Park, while immutable Run #75 TNDS generated 19 October contains three distinct outward Saturday times and a service record valid 12 October 2026–31 July 2027. The operator site still links its September 2025 PDF; no post-October operator timetable was found. TNDS special-day metadata is partial. Duplicate same-minute identities are not additional departures. The existing calendar warning is on the separate inbound stop `021028151`, so it does not resolve this outward discrepancy. Keep Run #75 unchanged; Technical Director judgement remains required.

Actual uninstrumented Browser/Word checks retained: Pipers Route 231 outward Hillcrest stop and three Saturday departures with the inbound calendar warning; Waltham Route 16 Saturday through 19:10 (excluding the 19:38 set-down-only call) and Route 16C Sunday through 19:45 with the exact BODS role warning; Route 24 at `1500TMPLFLD2` with 18:51 source time and terminal-role/endpoint review items; and Route 417 at opposite `1500IM2689B`, distinct from adjacent `1500IM2689`, with separate 08:14 and 19:14–23:14 windows. Acknowledgement gates, Word warning exclusion, and A3 map exports passed. No production code, Run #75 data, version, build, or release record changed.

The traced 15-control Browser/Word/A3 audit passed 15/15 each; TfL replay matched 135/135 responses with no misses, unused responses, failed browser requests, or unexpected external requests. Separate uninstrumented Pipers, Waltham 16/16C, exact Route 24, and exact Route 417 checks passed. `node tests/atlas/run-all.mjs` passed (ATLAS Alpha.15 deterministic suite); Python `test_build_static_index.py` passed 21/21. Details and artifact names are recorded in `BETA2-FIX-20261118-FRIDAY-CONTINUATION.md`.

Dependabot remains configured; Codecov, OpenSSF Scorecard, and Sentry remain deferred; Renovate remains deferred in favour of Dependabot. Nothing was installed. Product Owner re-acceptance remains outstanding; Beta.2 remains unreleased.
## Friday Sprint 3 — final source-accuracy and pre-acceptance gate — 20 November 2026

**Starting checkpoint:** `99c2fa528be01f75704383cb365dcdae4fff1853` on `codex/atlas-bus-beta2-blockers-20261118`; frozen Beta.1 main remains `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. The original recovery worktrees, patches, and Run #75 candidate were preserved.

### Route 231 — exact source/calendar conclusion

The current South Beds Dial-a-Ride public-services page identifies Route 231 and Hillcrest Park among the served places, but its linked operator PDF is still dated 1 September 2025. That PDF's Saturday table calls at Aley Green/The Chapel at 09:04 and 11:18; it does not prove a Saturday call at either Hillcrest NaPTAN stop. Caddington Parish Council's separately published timetable is marked valid from June 2026 and explicitly lists Woodside, Hillcrest Park outbound at 09:04 and Woodside, opposite Hillcrest Park inbound at 11:18 on Saturday. Its weekday table has the school/non-school alternatives; those duplicate 08:04 column entries are not simultaneous departures. The published June table says no service Sundays/public holidays.

Run #75 TNDS manifest is `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`, prepared 19 October 2026. Its exact service `51-231-_-y08-1`, operator South Beds Dial-a-Ride, is valid 12 October 2026–31 July 2027. At outward `021024640`, the retained variants include Saturday 08:04 (`JP_51-231-_-y08-1-1-O-2`) and 09:04/11:34 (`...-3-O-2`); the weekday-only variant `...-2-O-1` also has 08:04. These are three distinct scheduled minute values, not same-minute duplicate inflation. The associated regular-day evidence carries `SpecialDaysOperation` with `resolutionStatus: partial`; special-date operation is not established by the prepared record. The opposite inbound `021028151` and the distinct inbound `021013516` remain separate physical stop identities. The sole existing route-calendar review item is at `021028151`; it does not resolve the outward calendar question.

The underlying TNDS TransXChange archive was not present in the immutable Run #75 prepared-data tree (which contains prepared service shards and manifest, not raw XML); the actual XML `SpecialDaysOperation` values therefore could not be independently re-read from this local frozen candidate. A current Bus Times rendering dated 13 November 2026 also shows the three outward times, but explicitly attributes its data to TNDS; it is not independent operator confirmation. No newer operator-published timetable was found.

**Classification: source-limited with explicit residual risk; no software defect established.** The frozen candidate consistently presents `Mon-Sat: 3 journeys/day` and approx. 08:04–11:34 at outward Hillcrest. The later-declared TNDS pattern supports those times for its valid period, while the later-than-September-2025 independent operator publication located (the Parish Council June 2026 table) supports one Saturday time at Hillcrest. It is not enough to establish whether 08:04 and 11:34 became valid operator journeys after June, or which special dates apply. The professional risk is that a formal output may overstate Saturday availability at this physical stop. Do not call it verified current operator operation, override the frozen snapshot, or mark this discrepancy resolved on TNDS parity alone. Technical Director judgement/operator confirmation remains required.

### Route 24 — boarding-role conclusion

Current Central Connect's Route 24 operator page lists River Way Rdbt `1500TMPLFLD2` at 18:51 as **“This stop is for set down only.”** The exact Run #75 BODS service row (`routeId 6770381`, Central Connect, pattern ending at `1500TMPLFLD2`, valid from 19 October 2026) retains a weekday 18:51 scheduled value at that StopPoint, but contains no `nonBoardingCalls` or stop-specific departure-role evidence. The raw GTFS source archive/`stop_times.txt` is not retained in the frozen prepared-data tree, so this candidate cannot establish whether that call's original `pickup_type` was absent/default or explicitly regular. No Run #75 data was edited.

The generic preparation code reads GTFS `pickup_type` (defaulting an absent GTFS field to the specification's regular-pickup value); types 1, 2 and 3 are retained as `nonBoardingCalls` with their source types and omitted from ordinary stop schedules. Assessment extracts stop-scoped schedule/evidence, filters explicit `arrival` and `conditional-pickup` roles from departure populations and periods, and creates a BODS terminal-role review warning when role evidence is unavailable. The 18:51 value survives because the prepared schedule has no non-boarding role marker. Nothing in the retained raw input proves a generic transformation dropped an available flag, and a global rule to discard role-unknown terminal values would suppress legitimate boardable calls. No generic code correction is justified by this evidence; no route, stop or time exception was added.

**Classification: source-limited with explicit residual risk; release decision still blocked.** The actual normal Browser and Word outputs both reach 18:51, while Sources & Checks states that boarding eligibility cannot be independently confirmed from the frozen BODS snapshot. The operator page establishes that this exact call is not boardable. Because the approved clean Word contract excludes internal warnings, the Word document may leave an 18:51 service-period endpoint that a reader could misread as a boarding opportunity. This is a material professional risk, not a verified software fix. Do not claim 18:51 is boardable or use it as a confirmed last boarding time; obtain a source refresh/role-preserving authoritative record or a separately approved product decision before release.

### Protected routes and actual-product checks

- Uninstrumented Waltham Cross Browser/Word replay retained Route 16 Saturday through 19:10 at `210021703430`, omitted the later 19:38 set-down-only call, preserved the terminal-role warning in Sources & Checks, and retained Route 16C Sunday through 19:45. Word contained no internal-review warning.
- Uninstrumented exact-stop River Way replay at opposite `1500IM2689B`, while retaining adjacent `1500IM2689` as a different stop, showed Route 417 Harlow windows 08:14 and 19:14–23:14; no continuous daytime window was synthesized. Browser/Word parity, acknowledgement, clean Word and A3 map passed.
- Uninstrumented Route 231 Pipers Lane replay retained outward `021024640` at three Saturday journeys, separate inward `021028151`, the supported calendar review item on the inward stop, required acknowledgement and a clean Word. All four normal-product route controls (231, 16/16C, 24 and 417) produced valid standalone A3 maps.

### Nearest-group ranking and existing availability behavior

`selectNearestStopGroup()` ranks only stops with valid routed-walking distances; straight-line separation is used only for constrained group membership after the walking-ranked anchor is chosen. The new adversarial regression proves that radially-nearer Stop A loses to walking-nearer Stop B, and that a failed walk for Stop A does not trigger straight-line fallback. The application test separately proves the existing timetable behavior: it checks the nearest physical/logical group first; after a confirmed `NO_MATCH`, it may try a farther group and return that farther group if a scheduled service is established. An `UNRESOLVED` result keeps the nearer group instead. This preserves the existing nearest-served-group behavior without changing routing or timetable eligibility.

**Product decision to record:** if “absolute nearest” means the nearest physical/logical group must remain selected even when its timetable is conclusively empty, current nearest mode does not meet that interpretation in the confirmed-NO-MATCH case. This assignment did not authorize a redesign. Product Owner/Technical Director must decide separately whether nearest mode names the closest physical group or searches for the closest group with usable scheduled service. The distinction must be covered in the acceptance instructions.

### Sprint 3 verification and checkpoint

The full deterministic suite passed after the adversarial tests, ending `ATLAS Alpha.15 deterministic suite passed`, against frozen Run #75 Bus, TNDS, and verified iBus inputs. Python preparation suite passed **21/21**. The actual traced Run #75 headless Browser/Word/A3 audit passed **16/16 controls**, with no assertion failures; all **135/135** recorded TfL responses matched, with no misses, unused responses, failed requests or unexpected external requests. The four uninstrumented controls above each passed. The audit included acknowledgement gating, review-warning exclusion from Word, Browser/Word passenger-fact parity, Word map-on/off assertions and standalone A3 map checks. Expected Tufton TfL HTTP 400 evidence remains scoped and visible in Sources & Checks.

Only the two nearest-group test files and the two engineering handover documents changed. There was no production-source or prepared-data change, no national refresh, and no version/build bump. The candidate remains `2.0.0-beta.1`; prepared Run #75 manifests remain Bus `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f`, TNDS `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`, and iBus `3090e1da6da21878725d0b30343757bd32c65fcdd56d9fdecb6f6ae6c75b5d53` with index `39b0eae384ec7a44115f898b940b3f35213577195706d38a82fa97707d2610de`.

For the isolated later manual review, use the existing `startReviewServer()` in `tools/atlas-review/review-server.mjs` with this worktree as `rootDir`, the frozen Run #75 `atlas/data` directory as `v2DataRoot`, the verified iBus directory as `tflIbusDataRoot`, and `openBrowser: false`; verify `/__atlas-review/identity` before giving the URL to the Product Owner. The generated app URL uses `?review=v2`; open its `#bus` route. Use a candidate with clean Git identity and show the known Route 231 and 24 caveats before broad assessment testing. This gate does not claim Product Owner acceptance or release readiness.

### Sprint 4 — Product Owner nearest-group contract correction

The Product Owner approved the nearest-group rule: the selected logical group is anchored to the eligible physical stop with the shortest valid routed walking distance from the confirmed site. Straight-line distance cannot replace a valid walk or serve as a fallback when routing fails. Authoritative group membership may include its associated StopPoints. Timetable availability does not change the selected group: a match keeps its service, unresolved evidence keeps the group and its limitation, and confirmed `NO_CURRENT_MATCH` keeps the group while explicitly reporting that no current match was established. This is an authorized requirement correction, not a speculative redesign. The optional 2,000 m expansion applies only when no valid routed nearest group was identified inside the initial scope; a no-match at a selected group never triggers expansion or a farther-group fallback. Full-radius mode remains unchanged.

The prior Alpha.5 test that expected a farther served group after confirmed `NO_CURRENT_MATCH` was intentionally replaced because it contradicted this explicit Product Owner decision. The focused suite now covers walking versus radial ranking, `MATCHED`, `NO_CURRENT_MATCH`, `UNRESOLVED`, failed routing, authoritative multi-StopPoint grouping, no-match wording, full-radius behavior, and expansion only when no routed nearest group was found. No route-specific behavior changed. Route 24's BODS terminal boarding-role uncertainty and Route 231's current-timetable/calendar limitations remain as previously documented release blockers.

Sprint 4 verification: focused nearest tests passed (12 domain/presentation, 6 application), Browser/Word wording tests passed, and the complete deterministic ATLAS Alpha.15 suite passed against immutable Run #75. Python preparation tests were **not run** because no Python interpreter is installed or available in this environment; no interpreter or tooling was installed. The existing 16-control actual Browser/Word/A3 replay passed with **0 assertion failures**, and the captured TfL replay matched **135/135** responses with no misses, unused responses, failed browser requests or unexpected external requests. Two expected TfL HTTP 400 responses at Tufton StopPoint `490005180E` remained scoped source evidence. The Abbotts Rise and Waltham Cross uninstrumented nearest Browser/Word/A3 replays passed; Waltham full-radius Browser/Word/A3 replay also passed. Each required acknowledgement was checked before export; Word remained professionally clean and standalone A3 maps were valid. The normal-product audit uses a temporary runner copy only to omit test-stage trace assertions; it never changes the tracked audit script or production source.

The Abbotts Rise replay retained exactly the two public StopPoints `210021303500` and `210021309320`, showed both Route 25 directions, preserved Route 25B's Station Road and Sainsbury's variant counts (2/2 and 3/1 weekday/Saturday) in its structured family note, retained both Route 35 directions, kept Route 35C's three weekday journeys without unsupported school-day wording, and stated Route 35B as terminating arrivals only. Sources & Checks retained the unresolved Route 35C calendar item and Route 35B terminal-role limitation. The separate traced replay verified Route 25B as a structured Route 25 family member with five weekday and three Saturday distinct journeys and both source records.

The Python suite remains a required outstanding environment verification, so engineering verification is **incomplete for that check** even though the full deterministic and browser acceptance runs passed. Route 24 terminal boarding-role uncertainty and Route 231 current-timetable/calendar limits remain release blockers. Sprint 4 supersedes the provisional nearest-served-group interpretation above. The Route 24/231 source findings, Run #75 manifest identities, and clean professional Word warning policy are unchanged.

## Friday Sprint 5 — manual-acceptance materiality and output polish — 20 November 2026

**Base:** `26e3c52e8cf736203c1ca078e122c16e947e7018` on `codex/atlas-bus-beta2-blockers-20261118`; frozen `main` remains `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. This sprint preserves the pre-existing candidate state and Run #75 inputs. No source refresh, version/build change, publication, merge, release, or deployment occurred.

### Materiality and review presentation

The Waltham Cross full-radius replay now groups review evidence by review reason, source, exact StopPoint, and route-normalized cause. A topic retains every affected route and expandable original evidence record; grouping does not remove or rewrite raw evidence. The normal UI displayed **13 review topics covering 42 actionable records**, plus a separate expandable diagnostic section retaining **9 records** that required no separate planner action. The acknowledgement starts unchecked and the export gate remains closed until the reviewer checks it. Diagnostics do not satisfy or bypass acknowledgement for actionable evidence. Browser/Word and standalone A3 checks confirmed internal review text remains out of Word and map exports.

The supplied rejection screenshot described 30 records (about 20 BODS role records, six unresolved TfL requests at StopPoint `210021703440`, two calendar records and two endpoint records). The reproducible full-radius application replay instead assessed 15 StopPoints and exposed 51 raw review records before safe diagnostic classification: 20 BODS boarding-role, 19 unresolved TfL request identities across the assessed stops, two TNDS operating-day, five endpoint, three route-identity and two assessment-wide records. The observed 42 actionable plus nine diagnostic records reconcile to those 51 raw records. The difference from the screenshot is retained as a scope/evidence discrepancy; the screenshot was not treated as an unquestionable expected total, and no evidence was silently discarded.

Only an unresolved supplementary TfL exact-stop request can become diagnostic when that exact stop is BODS-primary, has a clean exact-route/stop BODS summary, and no TfL timetable authority applies. Original source evidence remains attached. TfL-primary unresolved records remain actionable; cross-source material route-identity conflicts, calendar conflicts, endpoint uncertainty, and boarding-role uncertainty remain actionable. This is generic source-authority/actionability logic, not route/site/operator-specific suppression. Existing circular-route boundary warnings and true terminal endpoint risks remain; a selected interior stop on a circular pattern is no longer incorrectly treated as a terminal.

### Output corrections

- Route 13's service qualification now names a bare `School` source label neutrally as “the stop labelled ‘School’”; it does not imply a school-day calendar. The actual Waltham replay showed one qualification and no duplicate note.
- Repeated “Intermediate stop patterns vary” introductions are consolidated without losing their distinct examples; a regression checks Browser/Word summary behavior. The Waltham replay did not itself produce a duplicate Route 279 note.
- Route 657 no-service weekend periods no longer inherit the school-day qualifier. Actual Browser/Word output reads `Mon-Fri (School days): 1 journey/day; Sat-Sun: No scheduled service` and the corresponding operating-period text, with the journey qualification separately limited to school-day journeys. No journey or calendar data were changed.

### Verification evidence

- Focused suites passed: `bus-service-assessment` 29 tests; `bus-assessment` 20 tests; review-topic grouping, UI contract, calendar wording, planner-summary, and all associated syntax checks passed.
- Full `node tests/atlas/run-all.mjs` passed with the exact sentinel `ATLAS Alpha.15 deterministic suite passed` using frozen Run #75 roots.
- Required static-index Python suite passed **21/21**. Broader Python discovery was **310/311**: one unrelated `test_c3_c1_scale_rehearsal.py` lineage assertion expects producer `39e142767946aa31ecf0f87544e6d7491ca90297`, which is not an ancestor of this Beta.2 branch. That test and lineage policy were left unchanged.
- Traced 16-control Browser/Word/A3 replay passed **16/16**, matching **135/135** captured TfL responses with no misses, unused responses, failed browser requests, or unexpected external requests. Two expected TfL HTTP 400 responses for Routes 158 and W16 at StopPoint `490005180E` remain represented as source evidence. Five uninstrumented Waltham, Chingford, Long Lane, Pipers Lane, and Abbotts Rise Browser/Word/A3 controls also passed, including initial acknowledgement/export gating.
- Word visual review used hidden read-only Microsoft Word PDF rendering and Poppler rasterization. Waltham Cross (three pages) and Chingford (one page) were inspected; no clipping or unreadable table split was observed. Waltham summary tables continue cleanly across the page break.
- All five uninstrumented Word/map exports were generated and parity assertions passed. Full Waltham Sources & Checks is still appropriately incomplete because material review records remain.

The current replay evidence is in ignored `tmp/atlas-sprint5-16-control-traced-tfl-replay-verified.json` and `tmp/atlas-sprint5-uninstrumented-*.json`; generated PDFs/page images and Word artifacts remain under ignored `tmp/`. Runtime identity in the traced report reflects the pre-sprint server commit (`26e3c52`) while serving dirty candidate code; it is not the post-checkpoint identity. A fresh local review server must be identified after checkpointing.

Known Route 16/16C endpoint/boarding evidence, Route 24 terminal-role limitation, Route 231 source/currentness and calendar evidence, Tufton captured HTTP 400s, and other previously documented source limitations were not broadened or “fixed” by suppressing warnings. Frozen Run #75 manifests remain Bus `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f`, TNDS `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`, iBus `3090e1da6da21878725d0b30343757bd32c65fcdd56d9fdecb6f6ae6c75b5d53`, and iBus index `39b0eae384ec7a44115f898b940b3f35213577195706d38a82fa97707d2610de`.

GitHub tooling review: Dependabot remains configured; Codecov and OpenSSF Scorecard remain deferred pending stable CI/ownership; Sentry remains deferred pending telemetry/privacy ownership; Renovate remains deferred in favour of Dependabot. Nothing was installed or reconfigured.

## Sprint 6 — plain-English Sources & Checks — 20 November 2026

**Base:** `b092e2a48a419fae57a825aab19b8dd337b76688` on `codex/atlas-bus-beta2-blockers-20261118`; frozen `main` remains `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. This correction changes planner explanations only. Timetable calculations, source hierarchy, source records, review classification and prepared Run #75 data are unchanged.

Each actionable topic now explains what the source evidence did, what that means for this assessment and what the planner should check. Topics retain their routes, exact StopPoint, source labels, underlying record counts and expandable original evidence. Acknowledgements remain unchecked initially; export remains gated. Supplemental diagnostics retain their records in a separate expandable area and do not satisfy the acknowledgement gate.

- An exact-stop TfL gap is explained as “no timetable was returned for this StopPoint,” not proof that a route does not run. The displayed-frequency basis is named only when every affected route row establishes the same different StopPoint. In the Waltham replay, displayed Routes 217, 317 and 327 frequency is based on `210021703420`; the unmatched exact-stop lookup is `210021703440`.
- BODS terminal warnings say that the snapshot does not establish whether boarding is permitted. They do not claim the service is unboardable or remove it.
- TNDS operating-day conflicts remain actionable and direct planners to check the operator timetable for the assessment date. Endpoint uncertainty says that an exact destination identity was unavailable and ATLAS did not infer a place. Cross-provider conflicts name the sources and state which schedule remains primary.
- Assessment-wide notes use plain provider names and explain practical scope. National snapshot freshness is expressed as an age (31 days in this replay). Frequency-range methodology remains available in a separate disclosure.

The UI prioritizes actionable-topic count, with underlying records shown as secondary information. Topics expose “What happened?”, “Effect on this assessment”, and “What to do”; raw evidence remains expandable. Word and A3 continue to omit internal review detail and retain the existing acknowledgement safety gate.

### Acceptance-count discrepancy — remains open

The requested Waltham presentation described **6 topics / 30 records**. The reproducible 700 m Run #75 application replay selected and assessed 15 StopPoints and displayed **13 actionable topics / 42 records**, plus **9 supplemental diagnostic records**. The raw 51 records reconcile to 20 BODS boarding-role, 19 unresolved TfL request identities, 2 TNDS calendar, 5 endpoint, 3 route-identity and 2 assessment-wide records. No topics or records were suppressed to force the requested count; all nine diagnostics remain inspectable. Product Owner retest against the requested count remains blocked until the parties confirm the site, radius, snapshot and assessment scope used for that expected total.

**Controlled manual retest:** Open the local review URL in the handover and confirm the build marker names the final checkpoint SHA. In Bus, recreate the same confirmed Waltham Cross site selection, choose full-radius mode at 700 m, and verify the selected StopPoints and Run #75 date before comparing Sources & Checks. Check the topic count, underlying-record count and expandable source records before acknowledging anything. If the control still expects 6/30, capture its site point, radius, selected StopPoints and candidate/data identity for reconciliation; do not dismiss records or export as accepted until the scope mismatch is resolved. Then spot-check the exact-stop TfL, boarding-role, calendar and endpoint explanations described above.

### Verification

- Focused review-topic, planner-source-note and UI-contract tests passed. Syntax checks for the changed app, domain helpers and audit passed; `git diff --check` passed.
- Full deterministic `node tests/atlas/run-all.mjs` passed with explicit frozen Run #75 Bus, TNDS and TfL iBus roots, ending `ATLAS Alpha.15 deterministic suite passed`. Initial attempts without the frozen roots/local browser allowance failed on fixture setup; the final configured run passed.
- Static-index preparation suite passed **21/21**.
- Actual uninstrumented Waltham 700 m and Chingford browser controls reported zero failures, browser errors and external requests. Waltham still displays 42 actionable records and 9 supplemental diagnostics. Browser/Word and A3 assertions passed; the expanded screenshot is under ignored `tmp/atlas-plain-language-waltham-shots/`.
- The full traced Browser/Word/A3 replay passed **16/16 controls** against immutable Run #75. Recorded TfL responses matched **135/135**, with zero misses, unused responses, failed requests, or unexpected external requests. The only two HTTP 400 responses were the expected Tufton requests for Routes 158 and W16 at StopPoint `490005180E`; the two matching browser console messages correspond to those source responses. The report is `tmp/atlas-acceptance-plain-language-16-control.json`; captured responses came from the existing `abbotts-golden-tfl-capture.json` fixture.

No production version/build, source data or updater changed. No national refresh occurred. No source warning was hidden. GitHub tooling review remains unchanged: Dependabot configured; Codecov and OpenSSF Scorecard deferred pending stable CI/ownership; Sentry deferred pending telemetry/privacy ownership; Renovate deferred in favour of Dependabot. Nothing was installed or reconfigured.

\n
