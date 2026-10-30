# ATLAS Bus Beta.2 known-defects hardening

## Controlled change record

- Branch: `codex/atlas-bus-beta2-known-defects-hardening`
- Continuation starting candidate: `291c526cf4d71c7650c8eb218df6a6f7bee65342`
- Frozen Beta.1 `main`: `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`
- Status: engineering candidate. No merge, Beta.2 release, or Beta.1 baseline change is authorized by this work.
- Technical Director review: **not ready**; the full Bus suite has two failing controls, actual assessment Word parity and TNDS-heavy before/after counts remain unverified.

## Implemented corrections

### Directional principal locations

The summary uses the ordered, identity-aligned source pattern which has scheduled evidence at the representative assessed stop. It derives places only from downstream calls in the displayed direction; closed loops rotate from the assessed stop. When order or identity cannot be proven, it withholds the list and preserves a material review item. The BODS index builder now retains ordered route-pattern stop names and localities to support this check. Display cleanup removes only a trailing `arrival` suffix.

### BODS-primary / TNDS-supplementary hierarchy

The generic overlapping-effective-date warning and its planner-review taxonomy item have been removed. TNDS date, timetable, wording, operator-name, and operating-profile differences alone no longer cause a BODS/TNDS disagreement warning. A locally covered presentation is BODS-led, with combined provenance retained; the planner timetable-source label now gives BODS its correct priority when both sources are recorded. Existing strict local-pattern duplicate arbitration remains conservative so potentially genuine TNDS services are not silently discarded.

Pipers controls retain BODS-led Route 230 and visible TNDS-only Route 231. No route number is hardcoded. There is not yet a generic grouped unresolved-supplementary-identity item: ambiguous TNDS extras remain visible, but the real 555 case has not been reduced to a proven duplicate or a single grouped identity review. This remains open for manual source adjudication.

### Map, export references, and responsive layout

Word and PDF report references are derived from the selected export stop set. Orphan `Served at` references are removed, evidence-only stops receive no export marker number, and marker keys share the same deterministic numbering. Standalone map PDFs frame the confirmed site, selected stops, and applicable radius independently of the interactive map's last view. The one Leaflet map is retained while moving between persistent and results hosts; resize invalidation waits for measurable geometry.

Browser viewport checks exposed horizontal overflow at 390 px: the stop and service tables kept 1000/1050 px minimum widths despite the small-screen layout. The mobile CSS now removes those minimums. The test confirms map container and Leaflet geometry agree after resizing.

## Actual source-shaped findings

These local diagnostic outputs were generated in candidate scratch storage from the available regional source archives using the production Python builder, then composed with the frozen Run #75 supplementary records. The frozen Run #75 artifact itself was only read through a local junction and was not rebuilt or edited. These are diagnostic compositions, not a replacement prepared national dataset.

- **Waltham Cross / 310:** both BODS-led displayed directions now derive downstream places from the assessed representative stops. Toward Waltham Cross from `210021701630`: Theobalds Grove Railway Station, Spitalbrook, Broxbourne, Wormley, Turnford, Cheshunt, Theobalds Grove. Toward Hertford from `210021701740`: St Margarets, Great Amwell, Ware, Chadwell, Hertford. TNDS rows with different directions/patterns remain separately visible; no cross-source disagreement item is generated. The actual 310 assessment DOCX was not generated in the browser.
- **Heathrow / 203:** at Long Lane, Hounslow-bound from `40004402007B`: East Bedfont, Hatton, Hatton Cross, Cranford, Hounslow West, Hounslow. Staines-bound from `40004402007A`: Ashford Hospital Entrance, Stanwell, Ashford, Staines. The directional lists do not cross-contaminate. No source-disagreement warning is generated. The actual 203 assessment DOCX was not generated in the browser.
- **Heathrow / 555 and N555:** the available current BODS records include route 555 in both directions, with local downstream places toward Hatton Cross and The Bear. TNDS also supplies route 555 records with different local patterns and a White Bus operator label; they remain supplementary rows because strict local identity is not proven. TNDS N555 records are Hallmark-branded, have current local patterns, and have no corresponding BODS N555 record at the assessed stops; they remain visible as a distinct supplementary service. No generic date-disagreement warning is produced. The route-family source shape supports treating N555 as distinct; the same-number 555 variants are not yet conclusively classified as covered duplicates versus additional services. No single grouped identity item currently captures that remaining ambiguity.
- **Wycliffe / Stroud, 62/64/65:** BODS downstream outputs are coherent in both directions. Route 62 from Wycliffe `1600GLS314` toward Horsemarling Lane: Post Office, The Nippy Chippy, Grosvenor Road; toward Transport Hub from Pearcroft `1600GLS313`: Bridgend, Stanley Downton, Leonard Stanley, Kings Stanley, Middleyard, Selsley, Dudbridge. Route 64 from Ryeford Road North `1600GLS309` toward Merrywalks: Ebley, Stroud; from `1600GLS310` toward Transport Hub: Stonehouse, Oldend, Nastend, Nupend, Whitminster, Moreton Valence, Hardwicke. Route 65 from Wycliffe `1600GLS314` toward Transport Hub: Stroud Green, Standish, Little Haresfield, Haresfield, Hardwicke, Quedgeley, Kingsway; from Pearcroft `1600GLS313` toward Long Street: Nastend, Eastington, Claypits, Cambridge, Slimbridge, Draycott, Lower Cam. The actual 62/64/65 assessment DOCX files were not generated in the browser.
- **TNDS review noise:** no real-assessment before/after total review-item count was captured. Available source-shaped results show no generic effective-date disagreement item; the TNDS-heavy real-count acceptance gate remains open. A missing/malformed supplementary TNDS coverage manifest in the browser environment is surfaced as an unresolved source item while loaded BODS evidence is retained; it is a source-availability issue, not an ATLAS directional-data conclusion.

## Verification evidence

### Passing focused and data-bound controls

- `tools/atlas-bus-data/test_build_static_index.py`: **19 passed**. The builder retains ordered route-pattern stops.
- Bus assessment and planner-summary tests: passed, including no warning for a differing TNDS validity interval and a single BODS-led presented row.
- `bus-timetable-merge`: passed using a current v2 stop-prefix shard; it retains the genuine local Route 231 call.
- `prepared-bus-data-integrity`: passed against the v2 dataset: 375,664 active NaPTAN stops, 1,367 referenced shards, and 9 BODS regions.
- `bus-qa-03-integrity`: passed.
- `tnds-runtime-shard-browser`: passed, fetching/serving/composing 53 shards.
- Existing focused route, calendar, map-layout, map-reference, map-PDF, Word-export contract, and UI-contract tests passed in the earlier full-suite run. Golden-route controls observed passing include 25C, 66, 242, 310, 657, 230/231, route variants, and calendar profiles. Milton Keynes Route 5 duplicate and the remaining named golden controls pass where included in those runs.

### Playwright/browser

All four local browser checks pass individually with the workspace-scoped temporary directory and localhost server:

- `review-environment-browser.mjs`: full Word download, normal and nearest map exports, same-selection byte-identical map after deliberate pan/zoom, and 22-stop geographically spread export; no page errors or failed local assets.
- `atlas-browser-smoke.mjs`: workflow, confirmation, results, map/marker references, cache behavior, routes, and service summary.
- `planner-ux-browser.mjs`: responsive desktop/laptop/mobile layouts, Leaflet geometry after resize, Sources & Checks, source failure fallback, non-London handling, and plain-language presentation.
- `site-selector-browser.mjs`: search refinement, drag and map selection, coordinate validation, explicit confirmation, assessment-point edits, and stale-result clearing.

The planner workflow browser records the missing `/atlas/data/bus-tnds/manifest.json` request as a visible supplementary-source failure. It does not record page exceptions. The full browser report is a mocked Crystal Palace assessment, not the supplied 310/203/62/64/65 assessment data.

### Generated artefacts

Stored under candidate scratch `tmp/beta2-verification/visual/`:

- `nearest-stop-group-map.pdf`
- `nearest-stop-group-map-after-pan-zoom.pdf` — byte-identical to the first compact map
- `normal-assessment-map.pdf`
- `spread-stop-map.pdf`
- `full-assessment.docx`

Each map is one A3 page. Visual review confirmed the site, radius, selected-stop markers, references, key, and scale. The spread map has 22 numbered stops and a 2 km radius without an irrelevant extent. Microsoft Word opened the DOCX; the embedded normal map and stop-summary references 1 and 2 were visually present. The DOCX renderer could not be used because LibreOffice is not installed. Only the generated fixture report was reviewed in Word; real case Word/browser parity, qualifications, acknowledgements, and orphan-reference checks remain open.

## Full-suite blockers and CI

`node tests/atlas/run-all.mjs` does not pass in this checkout. It stops at the existing `tests/atlas/bus-qa-02-frequency.test.mjs:143` expectation: expected “Timetable varies between school and non-school days.”, actual empty text. The focused reproduction fails independently; the changed hierarchy files do not implement that assessment-profile note. Continuing the remaining modules after that failure exposed a second existing data-bound blocker in `bus-robustness-1a4f-tfl-ibus-operator.test.mjs:247`: the checked-in manifest digest differs from the digest computed from the locally linked Run #75 bytes. Other modules continued after skipping each known blocker and passed through the reviewed modules; this is not a full-suite pass.

The candidate branch was pushed to `origin`; the remote branch head matched the local commit at push verification. No GitHub Actions workflow ran for that commit (`actions/runs?head_sha=8ac8fd22260298550cf5f764deab1c308ddc02ad` returned zero runs). The repository has no applicable branch push/pull-request workflow for this candidate. The only relevant push workflow inspected is restricted to historical branch names; other CI is manual/reusable or belongs to the Drawing Generator. No CI run is claimed. A safe, narrowly scoped future CI workflow should run the ATLAS Bus suite on this branch family without changing production behavior.

## Remaining limitations and manual acceptance

The real BODS-primary/TNDS-supplementary source shapes support corrected downstream outputs, Pipers 231 survival, and removal of generic date-conflict noise. They do not complete the acceptance gates for a grouped ambiguous supplementary identity, a real TNDS-heavy count comparison, full passing regression, or actual-case Word parity.

Technical Director and Product Owner review should use the frozen Run #75 comparison material and supplied assessments to:

1. Compare both Route 310 directions and the Long Lane 203 directions against the source journeys.
2. Review Stroud routes 62/64/65 against the supplied map and patterns.
3. Decide whether the same-number TNDS 555 records are duplicates or additional local services; confirm N555 remains a separate TNDS-only service. If identity remains genuinely ambiguous, require one grouped identity review item.
4. Run one TNDS-heavy assessment and record total review items and warning classes before/after, verifying that real services survive.
5. Generate 310, 203, 555/N555, and 62/64/65 DOCX reports and compare Browser and Word principal locations, qualifications, selected-stop references, and review acknowledgement.
6. Resolve QA-02 and the TFL iBus digest mismatch, then run the complete ATLAS Bus regression.
7. Review the candidate branch and CI result before manual acceptance. Do not merge or release Beta.2 as part of this verification.

## GitHub tooling adoption review

- **Dependabot:** already configured; retain it.
- **Codecov:** no adoption in this corrective sprint.
- **OpenSSF Scorecard:** no adoption in this corrective sprint.
- **Sentry:** no adoption in this corrective sprint.
- **Renovate:** deferred to avoid overlapping dependency automation with Dependabot.

No tooling was installed or newly configured for this sprint.
