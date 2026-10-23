# ATLAS Bus Beta Polish Handover

## Revision and scope

- Accepted frozen-intelligence baseline: `b3ad244dc98253da2f95a8ea9d0274ab32140f6f` (`atlas-bus-beta-intelligence-accepted-2026-10-23`).
- Polish branch: `codex/atlas-bus-beta-polish`.
- Polish worktree: `C:\Users\joe.freeman\AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\ATLAS\codex-workspaces\bus-polish`.
- Validated polish runtime SHA: `30c303c219cf2d42a15682759269687b0f2dc9cd`.
- Documentation handover is committed separately after runtime validation; no runtime files changed after validation.
- This sprint changes presentation, wording, navigation, and presentation tests only. It does not change Bus source hierarchy, service identity, route arbitration, timetable composition, calendar, frequency, operator, qualification, warning, or fail-closed evidence logic.

## Work delivered

- Added the supplied production ATLAS logo, tagline logo, mark, reversed logo, header lockup, and favicon unchanged under `atlas/assets/branding/`.
- Added the supplied FORGE lockup unchanged as a secondary product-family brand. ATLAS remains the primary header/hero brand; FORGE appears in secondary surfaces.
- Refined the landing page, module cards, workflow stages, button hierarchy, footer, and help copy. Bus is clearly marked Beta; future module cards do not imply unavailable functionality is clickable. Legacy Toolkit navigation remains accessible and secondary.
- Refined Results with a compact assessment summary, checked-data freshness, a calm clean-evidence state, and a review badge only when review items exist. Sources & checks retains the full trace with technical diagnostics behind disclosure.
- Added a confirmed New assessment action that clears the selected site, result, address, and candidate state.
- Refined map framing and made stop references deterministic numeric labels. Stop ordering and numeric references are presentation-only copies and are consistent between the stop summary, service “Served at” labels, and Word export; source evidence arrays are not mutated.
- Moved the `*` assessed-stop frequency/operating-period explanation ahead of Word service rows. Qualification and review notes have semantic classifications for restrained report styling, and the awkward “additional additional” wording was removed without suppressing review evidence.
- Replaced mechanical Transport Statement text with a deterministic, concise summary of selected planner rows, route labels, timetable basis, and available qualifications. It makes no sustainability or unsupported service claims.
- Kept version/build unchanged: `2.0.0-alpha.15`, `ATLAS-2.0.0-alpha.15-20260914`.

## Map export

Map presentation is improved, but embedding an assessment map in Word is deferred as the immediate Beta-closeout item. The current export path has no stable reusable map-image component; producing one would require new mapping/export architecture or a fragile screenshot capture. The sprint therefore preserves reliable Word output and numeric stop-reference parity without introducing that risk.

## Frozen candidate and intelligence controls

Run #75 was not rebuilt, reacquired, replaced, or modified. Current GitHub metadata for Run `39430415441` reports artifact `12275615359`, name `atlas-bus-beta-review-candidate-39430415441`, size `2,549,732,499` bytes, producer SHA `151199cc914c235870f444d26b03c2309edbd035`, canonical digest `sha256:5cad24e0a47c4a77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`, and `expired: false` (expires `2027-01-18T13:26:34Z`). The GitHub artifact metadata and the original-upload digest record agree. Run #75's overall workflow conclusion is `failure`; this does not change the identity or availability of its immutable candidate artifact.

The existing extracted Run #75 candidate remains in its separately approved manual-acceptance directory and is treated as read-only. No candidate files were written or regenerated during polish. Local browser contract tests use deterministic small fixtures; they do not acquire national data.

No Bus intelligence was altered. The full Bus-data regression suite and deterministic ATLAS suite passed as recorded below. Site-specific accepted controls remain covered by the existing full regression gates (Enfield 313, Chingford 657, Pipers 46/230, PE1 202, and Waltham). This polish did not dispatch a data workflow or repeat national processing.

## Validation performed

- Full deterministic ATLAS suite: `node tests/atlas/run-all.mjs` — passed, `ATLAS Alpha.15 deterministic suite passed. EXIT_CODE=0`.
- Full Bus-data Python suite: 309 tests — passed (`Ran 309 tests ... OK`).
- Browser smoke: `tests/atlas/atlas-browser-smoke.mjs` — passed against the local review server.
- Browser UX: `tests/atlas/planner-ux-browser.mjs` — passed with deterministic address, TfL, prepared timetable, routing, and map fixtures; covered results, hidden diagnostics, freshness, review badge, responsive map/layout, Word download, and New assessment reset.
- Visual evidence (desktop, laptop, and mobile screenshots) was captured under `C:\Users\joe.freeman\AppData\Local\ATLAS\codex-workspaces\bus-polish-evidence\`; screenshots are local review evidence and are not product assets.
- Focused UI/Word and existing production fidelity tests: `bus-ui-contract`, `beta-polish-presentation`, `bus-word-export`, `alpha15-production-fidelity`, `bus-alpha13-planner-summary`, `bus-planner-golden-rule`, `bus-group-1f-real-runtime`, and `bus-robustness-1a4d-tfl-planner-trust` — passed.
- `git diff --check` — passed.
- No full national candidate build or live-source acquisition was run.
- Hosted validation: not applicable. No safe polish-specific workflow exists; the available data workflows can perform acquisition or candidate preparation and were not dispatched.

## Exclusions and remaining Beta-closeout items

- No source acquisition, national data preparation, Run #75 rebuild, production deployment, publication, merge to `main`, or version/build bump.
- Word's shared generic writer was left unchanged to preserve legacy Toolkit isolation. ATLAS-specific Word content, ordering, qualifications, and numeric references were improved through the Bus presentation adapter.
- Word map embedding remains deferred as described above.
- Product Owner acceptance is still required; this handover does not declare Beta accepted for release.
- Recommended version/build for Technical Director approval after acceptance: `2.0.0-beta.1` / `ATLAS-2.0.0-beta.1-20261023`. Do not apply this bump without approval.

## GitHub tooling adoption review

- Dependabot: configured.
- Codecov: deferred until an appropriate coverage baseline/milestone.
- OpenSSF Scorecard: later security/release milestone.
- Sentry: deferred pending telemetry and privacy architecture decisions.
- Renovate: unnecessary alongside Dependabot.
