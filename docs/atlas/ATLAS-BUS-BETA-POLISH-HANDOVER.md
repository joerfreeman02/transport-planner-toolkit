# ATLAS Bus Beta Polish Handover

## Revision and scope

- Accepted frozen-intelligence baseline: `b3ad244dc98253da2f95a8ea9d0274ab32140f6f` (`atlas-bus-beta-intelligence-accepted-2026-10-23`).
- Polish branch: `codex/atlas-bus-beta-polish`.
- Polish worktree: `C:\Users\joe.freeman\AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\ATLAS\codex-workspaces\bus-polish`.
- Runtime before the current SaaS correction: `5c9307cc257a1387ceb0d2edc02a974cd2977832`.
- Final combined-mockup correction runtime SHA: `38cc166864a96aeccef8ceeb037dc5c46a087d39` (`Keep the persistent map clear of result panels`).
- The final combined ATLAS Bus mockup is the primary layout reference for this correction. Its unsupported placeholder features were omitted; the earlier storyboard informed platform language, and real ATLAS functionality remains authoritative.
- The final desktop build has six guided stages: Find location; Confirm assessment point; Assessment settings; Run assessment; Results; Export.
- Runtime validation completed before the separate documentation reconciliation. That documentation-only commit contains no application, test, workflow, or data changes.
- The local Product Owner review server is available at `http://127.0.0.1:8769/atlas/` from this isolated polish worktree.
- This sprint changes presentation, wording, navigation, and presentation tests only. It does not change Bus source hierarchy, service identity, route arbitration, timetable composition, calendar, frequency, operator, qualification, warning, or fail-closed evidence logic.

## Work delivered

- Added the supplied production ATLAS logo, tagline logo, mark, reversed logo, header lockup, and favicon unchanged under `atlas/assets/branding/`.
- Added the supplied FORGE lockup unchanged as a secondary product-family brand. ATLAS remains the primary header/hero brand; FORGE appears in secondary surfaces.
- Rebuilt the application shell around the approved EAS | ATLAS header lock-up, dark navy header, orange active navigation, compact hero, and truthful Modules/About navigation. Unsupported Projects and Report Builder pages are removed. Module cards share one hand-drawn SVG icon style and accurately label existing, Beta, and planned modules.
- Kept the large map persistent and prominent beside the guided workflow. The six stages make location search, explicit map review and point confirmation, settings, assessment, results, and Word export separately legible. The workflow keeps both nearest logical stop-group assessment using routed walking access and configurable full-radius assessment.
- Constrained the sticky map to the setup workspace so it stays prominent while planners work through the guided steps and cannot overlap the separate Results panel.
- Kept assessment settings and real Bus data status with their provenance details. No unsupported “Live,” overall system-health, destination, or services-per-day claims are shown. Assessment results display checked time and only show an evidence-review count when the real result contains review items; the complete evidence remains in Sources & checks.
- Integrated the supplied ATLAS primary mark into the processing state. Staged large-assessment handling, progress stages, fail-closed evidence review, deterministic numbered map references, assessment-point correction, New assessment reset, Transport Statement wording, and Word output remain available.
- The footer uses the approved EAS | FORGE lock-up, the `Created by Joe Freeman` attribution, product/version/build, and an About link. The EAS | ATLAS lock-up stays in the application header and is not repeated in the footer.
- The interface is light mode with the approved dark navy shell and orange active state. A full dark theme was deferred because a complete accessible token and control-state treatment would be disproportionate to this correction sprint.
- Results presentation and Word output retain the real evidence-backed data and browser/Word ordering. No project manager, Report Builder, global export centre, browser geolocation, fake route graphics, fabricated metrics, or cloud/account behavior was introduced.
- Added a confirmed New assessment action that clears the selected site, result, address, and candidate state.
- Refined map framing and made stop references deterministic numeric labels. Stop ordering and numeric references are presentation-only copies and are consistent between the stop summary, service “Served at” labels, and Word export; source evidence arrays are not mutated.
- Moved the `*` assessed-stop frequency/operating-period explanation ahead of Word service rows. Service qualifications and material review notes use the existing restrained section-row style; the awkward “additional additional” wording was removed without suppressing review evidence.
- Replaced mechanical Transport Statement text with a deterministic, concise summary of selected planner rows, route labels, timetable basis, and available qualifications. It makes no sustainability or unsupported service claims.
- Kept version/build unchanged: `2.0.0-alpha.15`, `ATLAS-2.0.0-alpha.15-20260914`.

## Map export

Map presentation is improved, but embedding an assessment map in Word is deferred as the immediate Beta-closeout item. The current export path has no stable reusable map-image component; producing one would require new mapping/export architecture or a fragile screenshot capture. The sprint therefore preserves reliable Word output and numeric stop-reference parity without introducing that risk.

## Frozen candidate and intelligence controls

Run #75 was not rebuilt, reacquired, replaced, or modified. Current GitHub metadata for Run `39430415441` reports artifact `12275615359`, name `atlas-bus-beta-review-candidate-39430415441`, size `2,549,732,499` bytes, producer SHA `151199cc914c235870f444d26b03c2309edbd035`, canonical digest `sha256:5cad24e0a47c4a77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`, and `expired: false` (expires `2027-01-18T13:26:34Z`). The GitHub artifact metadata and the original-upload digest record agree. Run #75's overall workflow conclusion is `failure`; this does not change the identity or availability of its immutable candidate artifact.

The existing extracted Run #75 candidate remains in its separately approved manual-acceptance directory and is treated as read-only. No candidate files were written or regenerated during polish. Local browser contract tests use deterministic small fixtures; they do not acquire national data.

No Bus intelligence was altered. The full Bus-data regression suite and deterministic ATLAS suite passed as recorded below. Site-specific accepted controls remain covered by the existing full regression gates (Enfield 313, Chingford 657, Pipers 46/230, PE1 202, and Waltham). This polish did not dispatch a data workflow or repeat national processing.

## Validation performed

- Full deterministic ATLAS suite: `node tests/atlas/run-all.mjs` — passed on the final UI/test source; ended with `ATLAS Alpha.15 deterministic suite passed.` (exit 0).
- Full Python Bus-data suite: bundled Python `python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v` — **309 tests passed** (`Ran 309 tests ... OK`).
- Focused presentation contract and `node --check atlas/assets/js/app.mjs` — passed.
- `tests/atlas/atlas-browser-smoke.mjs`, `tests/atlas/planner-ux-browser.mjs`, and `tests/atlas/site-selector-browser.mjs` — passed against the local review server. Coverage includes the six-stage navigation, map adjustment and confirmation, nearest/full modes, assessment and source review, responsive map layout, Word download, reset, no browser errors, and no failed requests.
- Captured refreshed desktop, laptop and mobile browser screenshots under `C:\Users\joe.freeman\AppData\Local\ATLAS\codex-workspaces\bus-polish-evidence-final\` after constraining the sticky map; these are local visual QA evidence, not product assets.
- Frozen Run #75 candidate identity remains the previously verified immutable artifact recorded above. This UI correction changed no candidate or national data file and did not rerun candidate preparation or acquisition.
- `git diff --check` — passed after the final UI changes.
- No full national candidate build or live-source acquisition was run.
- Hosted validation: not run. No safe polish-specific workflow exists; the available data workflows can perform acquisition or candidate preparation and were not dispatched.
- Local acceptance environment: review server process ID `36076`, bound to `127.0.0.1:8769`; the current runtime served is `38cc166864a96aeccef8ceeb037dc5c46a087d39`.

## Exclusions and remaining Beta-closeout items

- No source acquisition, national data preparation, Run #75 rebuild, production deployment, publication, merge to `main`, or version/build bump.
- Word's shared generic writer was left unchanged to preserve legacy Toolkit isolation. ATLAS-specific Word content, ordering, qualifications, and numeric references were improved through the Bus presentation adapter.
- Word map embedding remains deferred as described above. Full dark mode also remains a later UI enhancement; the required light-mode acceptance experience and dark navy shell are implemented.
- Product Owner acceptance is still required; this handover does not declare Beta accepted for release.
- Recommended version/build for Technical Director approval after acceptance: `2.0.0-beta.1` / `ATLAS-2.0.0-beta.1-20261023`. Do not apply this bump without approval.

## GitHub tooling adoption review

- Dependabot: configured.
- Codecov: deferred until an appropriate coverage baseline/milestone.
- OpenSSF Scorecard: later security/release milestone.
- Sentry: deferred pending telemetry and privacy architecture decisions.
- Renovate: unnecessary alongside Dependabot.
