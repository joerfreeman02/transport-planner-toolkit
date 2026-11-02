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
