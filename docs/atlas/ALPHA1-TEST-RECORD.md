# ATLAS 2.0 Alpha.1 test record

Date: 2026-08-24  
Baseline: `551b7cbf6646e72f21842bf77b93633373a9cac2`  
Implementation: `97c94e7733419c103a0c22d592c7c5d083ce23c7`

## Legacy regression gate

The gate ran against the clean verified baseline before ATLAS implementation. Twelve of seventeen deterministic suites passed. Five failures were explained as stale test expectations already present on the clean baseline; none was caused by ATLAS and none invalidated isolation.

| Command | Result | Recorded detail |
|---|---:|---|
| `node tests/run-tests.mjs` | Pass | 13 assertions |
| `node tests/regression-check.mjs` | Pass | Clean baseline identities, Bus 1.5 and STATS19 marker passed |
| `node tests/bus-foundation.test.mjs` | Pass | 10 tests |
| `node tests/emergency-bus-hotfix.test.mjs` | Pass | Emergency Bus baseline checks |
| `node tests/bus-route-family-hotfix.test.mjs` | Pass | Route-family checks |
| `node tests/contracts.test.mjs` | Pass | 6 contract tests |
| `node tests/classification.test.mjs` | Pass | Accessibility classification |
| `node tests/classification-regression.mjs` | Pass | Accessibility regression |
| `node tests/research-workflow.test.mjs` | Pass | Basic research workflow |
| `node tests/word-export.test.mjs` | Pass | 16 Word/export tests |
| `node modules/accessibility/tests/classification-regression.mjs` | Pass | Accessibility module classification |
| `node modules/railway/tests/regression-check.mjs` | Pass | 29/29 Railway assertions |
| `node tests/research-workflow-completion.test.mjs` | Pre-existing fail | Expects later guided Bus `busPrimaryAction`, absent after intentional Bus 1.5 restoration |
| `node tests/research-quality.test.mjs` | Pre-existing fail | Expects later `TPTResearchQuality.enhanceBusRequest` hook, absent from restored Bus 1.5 |
| `node tests/library-manager.test.mjs` | Pre-existing fail | Hard-coded counts 69/38/16 no longer match baseline data 70/50/33 |
| `node tests/emergency-sprint1a.test.mjs` | Pre-existing fail | Expects a later readable Bus import report removed by Bus 1.5 restoration |
| `node tests/sprint1c.test.mjs` | Pre-existing fail | Expects later Combined Site Research/Bus controls absent from Bus 1.5 |

Git history confirms the affected expectations predate the intentional restoration commits `7f075f9`, `5bb6c77` and `d4a0ab8`. They should be corrected separately; they are not silently waived.

Browser gate:

| Command | Result | Recorded detail |
|---|---:|---|
| `node tests/accessibility-google-browser.mjs` | Pass | Accessibility browser workflow |
| `node tests/bus-browser-smoke.mjs` | Pass | Map, address, 20 stops, routing and failure state |
| controlled dashboard/Rail Playwright probe | Pass | Dashboard build, five Ready cards including Drawing, Railway map/shared controls, STATS19, zero page errors |
| `node tests/core-polish-browser.mjs` | Pre-existing fail | Script still expects four Ready cards; verified dashboard has five after Drawing was added |
| `node modules/bus/tests/browser-smoke.mjs` | Inconclusive | Existing script did not complete; the root Bus live smoke above passed |

## Separate Drawing Generator WIP checks

These checks passed but do not change Drawing Generator's WIP/live-review status.

| Command | Result |
|---|---:|
| `node modules/drawing-generator/tests/drawing-generator.test.mjs` | 71 passed |
| HF2, HF3, HF4 and HF4A deterministic files | 5/5 suites passed |
| `node modules/drawing-generator/tests/browser-smoke.mjs` | Pass; four modes and zero page errors |
| `node modules/drawing-generator/tests/pdf-qa.mjs` | Pass; four temporary A3 PDFs |

Existing Drawing worktree outputs were not changed, deleted or committed.

## ATLAS deterministic tests

Command: `node tests/atlas/run-all.mjs`

- Site: 6 passed
- Evidence: 6 passed
- source-adapter contract: 7 passed
- Nominatim adapter: 5 passed
- TfL adapter: 7 passed
- legacy isolation: 1 passed, all 12 protected path groups match the baseline
- total: 32 checks passed

Normal automated tests use fixtures/mocked responses and do not depend on a public API.

## ATLAS fixture browser test

Command: `node tests/atlas/atlas-browser-smoke.mjs`

Result: pass. Visible version, top navigation, explicit Site confirmation, three geocoding requests, one TfL request, two Evidence rows, live/cache states and zero page errors were verified.

## Controlled live-source verification

Node adapter command: `node tests/atlas/live/tfl-crystal-palace-smoke.mjs`

- started: `2026-08-24T10:01:12.760Z`
- completed: `2026-08-24T10:01:15.728Z`
- query: `33 Westow Street, Crystal Palace, London`
- confirmed property: OpenStreetMap `way/189209061`, `51.4184213, -0.0821281`
- TfL response: HTTP 200, 31 nearby stops in 700 m
- first result: Westow Street, `490015491H`, 65 m calculated straight-line distance
- anonymous request: yes
- embedded key: no
- warnings: normalised/locality-reduced address retry; TfL supplied no dataset timestamp/version

Real browser/CORS command: `node tests/atlas/live/browser-cors-smoke.mjs`

Result: pass on 2026-08-24. Three Nominatim and one TfL responses were HTTP 200, 31 Evidence rows rendered, and there were zero failed source requests and zero page errors. A 1440 px live-result screenshot was visually reviewed; layout, statuses, Site provenance and the evidence table were readable.

## Final interpretation

The documented legacy failures exist at the verified pre-ATLAS commit and are isolated from the additive implementation. ATLAS deterministic, browser, live adapter and live browser/CORS verification all passed. This is an engineering-complete candidate, not Product Owner acceptance.

