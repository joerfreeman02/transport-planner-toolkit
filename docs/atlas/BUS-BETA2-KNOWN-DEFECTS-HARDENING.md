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
