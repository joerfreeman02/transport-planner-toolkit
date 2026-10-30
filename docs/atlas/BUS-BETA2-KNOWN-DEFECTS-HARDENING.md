# ATLAS Bus Beta.2 — principal-location hardening closeout

## Controlled change record

- Branch: `codex/atlas-bus-beta2-known-defects-hardening`
- Starting candidate SHA: `6a062b672777b009e9a893c44c2ef016cac87f01`
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
- Hard-block Word export while any `directional-principal-location` review item remains. The existing Sources & Checks acknowledgement still controls general review items and does not override this hard gate. Standalone map export remains under its existing acknowledgement gate because it contains no principal-location service rows. No internal engineering diagnostics are added to the client Word report.
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
