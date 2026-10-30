# ATLAS Bus Beta.2 known-defects hardening

## Controlled change record

- Branch: `codex/atlas-bus-beta2-known-defects-hardening`
- Continuation starting candidate: `291c526cf4d71c7650c8eb218df6a6f7bee65342`
- Frozen Beta.1 `main`: `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`
- Status: engineering candidate. No merge, Beta.2 release, or Beta.1 baseline change is authorized by this work.
- Technical Director review: **not ready**. QA-02 and the canonical iBus digest control now pass, but the complete suite and data-integrity controls cannot run from this sparse checkout; real TNDS-heavy before/after counts, grouped 555 identity review, and actual assessment Word/browser parity remain unverified.

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

The QA-02 calendar regression has been corrected in the final closeout continuation; focused QA-02, Alpha.13 calendar-safety, and Route 657 controls pass. The full suite still does not complete from this checkout: after ten early modules and the 53-shard TNDS browser control pass, bus-timetable-merge.test.mjs stops because atlas/data/bus-tnds/manifest.json is absent. The prepared NaPTAN/BODS data tree is also absent (prepared-bus-data-integrity and QA-03 fail on missing atlas/data files). The worktree sparse-checkout rules exclude /atlas/data/**; no full national dataset is present in this worktree. This is an incomplete regression run, not a pass.

The previously observed iBus mismatch was produced while the local data path was overlaid with Run #75 files. The earlier failure record reports index bytes with SHA-256 5efcf64b… against a manifest expectation beginning 39b0…. The Run #75 overlay and its manifest are no longer present in the current checkout, so the stale manifest's full digest and the exact linked file bytes cannot be independently re-hashed here. GitHub confirms the candidate and frozen main each contain the same 340,286-byte iBus index (SHA-256 5efcf64bfe1e158ecac52a8df8609984600b90ddd9b1b25b5112de7f6e24ebc1) and the same manifest with that exact expected digest. The iBus test passes against these canonical files. The test source has no candidate-only change. Therefore the digest issue is a local Run #75 overlay/manifest mismatch, not a candidate data change; a same-overlay Beta.1 rerun was not possible because that overlay is gone.

The candidate branch was pushed previously and had no Actions run. The repository has no applicable branch push/pull-request workflow for this candidate. A narrowly scoped CI workflow is not added in this closeout: the current full suite depends on frozen prepared national data omitted from the source checkout, so defining deterministic CI data inputs and separating those external-data gates needs the later lifecycle/CI design. No CI pass is claimed.
## Remaining limitations and manual acceptance

The real BODS-primary/TNDS-supplementary source shapes support corrected downstream outputs, Pipers 231 survival, and removal of generic date-conflict noise. They do not complete the acceptance gates for a grouped ambiguous supplementary identity, a real TNDS-heavy count comparison, full passing regression, or actual-case Word parity. The QA-02 mixed-calendar note has since been restored and its focused controls pass. The tracked TfL iBus manifest/index digest pair also passes after the Run #75 overlay was removed.

Technical Director and Product Owner review should use the frozen Run #75 comparison material and supplied assessments to:

1. Compare both Route 310 directions and the Long Lane 203 directions against the source journeys.
2. Review Stroud routes 62/64/65 against the supplied map and patterns.
3. Decide whether the same-number TNDS 555 records are duplicates or additional local services; confirm N555 remains a separate TNDS-only service. If identity remains genuinely ambiguous, require one grouped identity review item.
4. Run one TNDS-heavy assessment and record total review items and warning classes before/after, verifying that real services survive.
5. Generate 310, 203, 555/N555, and 62/64/65 DOCX reports and compare Browser and Word principal locations, qualifications, selected-stop references, and review acknowledgement.
6. Restore the frozen Run #75 overlay in a controlled read-only test environment, verify its manifest/index bytes against the recorded mismatch, and run the complete ATLAS Bus regression with prepared data mounted at the expected paths.
7. Review the candidate branch and CI result before manual acceptance. Do not merge or release Beta.2 as part of this verification.

## Final hardening continuation

The candidate began this continuation at 829e76604dd7c6551e07d722b933013a5c257759. Mixed school/non-school calendars now retain the neutral Timetable varies between school and non-school days. note when both profiles appear across scheduled component rows. False whole-row school-only and non-school-only labels remain suppressed. Focused QA-02, Alpha.13 calendar safety, Route 657 calendar, and simple calendar Browser/Word controls pass. Root cause: the generic row-scope check required the combined neutral note to occur on each individual component record, even though its evidence is split across the school and non-school records; the combined-row qualification check now proves both profiles across the represented scheduled records.

Canonical iBus verification: GitHub candidate and frozen main have identical index blob 90e88205a5b37f20cc82eddcb98b49ebedb32929, exact SHA-256 5efcf64bfe1e158ecac52a8df8609984600b90ddd9b1b25b5112de7f6e24ebc1 (340,286 bytes), and identical manifest blob cba0d41c7baf100936fd86597215c591a526b9c1 expecting that digest. The canonical test passes. The former Run #75 overlaid index itself had the reported 5efcf64b… hash; its stale linked manifest expected 39b0…. The junction was removed and its source files are not available in this checkout, so the full linked manifest hash and a same-overlay Beta.1 reproduction remain unverified. The root cause is isolated to test data mounted from the Run #75 overlay, but the stale manifest bytes cannot be archived or rechecked here.

Current checks: test_build_static_index.py passes (19 tests); focused calendar controls pass; TfL iBus operator test passes; map reference and PDF controls pass; Word export contract passes; TNDS runtime shard browser passes for 53 shards; four browser checks pass after site-selector-browser.mjs was switched to the shared Edge-capable launcher. The review-browser map export remains byte-identical after pan/zoom; normal and spread map exports also completed. The full run-all.mjs result is incomplete: it stops at the missing prepared TNDS manifest; direct prepared-data integrity and QA-03 checks stop on absent files. Ten deterministic modules printed 90 passing individual checks before the runner's TNDS manifest dependency; the TNDS runtime browser separately passed. No complete suite count is available.

There is no new candidate 310 or Heathrow Word output. The supplied Heathrow, Waltham Cross, Kimpton, and Stroud documents are input/reference files, not candidate Browser/Word parity evidence. No actual TNDS-heavy before/after review-item totals were captured. The same-number TNDS 555 patterns remain unresolved as additional identity versus duplicate; a grouped supplementary-identity review item is not implemented. TNDS-only Hallmark N555 remains visible as supplementary evidence and is not removed. These gates keep the candidate not ready for Technical Director review.

CI: no applicable branch push/PR workflow exists and no workflow run was produced. A new workflow is deferred because a meaningful CI run first needs a defined immutable prepared-data fixture boundary; do not run the national-data updater in Bus CI. The next sprint architecture remains application release and routine Bus refresh as independent lifecycle operations.

## GitHub tooling adoption review

- **Dependabot:** already configured; retain it.
- **Codecov:** no adoption in this corrective sprint.
- **OpenSSF Scorecard:** no adoption in this corrective sprint.
- **Sentry:** no adoption in this corrective sprint.
- **Renovate:** deferred to avoid overlapping dependency automation with Dependabot.

No tooling was installed or newly configured for this sprint.
