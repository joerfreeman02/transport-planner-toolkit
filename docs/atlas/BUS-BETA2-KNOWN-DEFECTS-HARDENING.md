# ATLAS Bus Beta.2 known defects hardening

## Controlled change record

- Branch: `codex/atlas-bus-beta2-known-defects-hardening`
- Starting `main` SHA: `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`
- Release status: engineering candidate only; Beta.1 remains frozen and Beta.2 is not released.
- Current review status: **not ready for Technical Director review** until the remaining source-arbitration, calendar, Browser, full regression, and CI gates below have evidence.

## Defects and changes in this candidate

### Directional principal locations

The service assessment previously combined principal-location lists from the route's full set of records. Those lists could describe calls upstream of the assessed stop or calls from a broader/opposite pattern. A displayed direction now selects the source pattern with scheduled evidence at its representative frequency stop, verifies the ordered stop identities, and derives locations only from downstream calls. Closed loops rotate from the assessed stop before deriving locations. Repeated or unresolvable positions withhold the list and create a material Sources & Checks item. Route-pattern stop names and localities are retained by the BODS index builder so prepared records can support this check.

This is an ATLAS interpretation correction. It does not certify the underlying BODS or TNDS pattern. When the source cannot prove order or stop identity, the summary is deliberately incomplete and reviewable.

### Stop references and map exports

Numeric references are now generated against the report's selected stop set for both Word and PDF export. Orphan references are removed from presentation text; evidence stops without an exported marker have no map reference. A pure extent helper frames the confirmed site, report stops, and requested radius. PDF export creates a temporary Leaflet map using that extent and disposes it after capture, so the user's last interactive pan/zoom does not choose the exported framing.

### Interactive map layout

Map invalidation is scheduled after two animation frames and only when the moved map has measurable visible geometry. Resize observation covers the map and its workflow frame, and the UI exposes layout measurements for browser acceptance checks. The map remains one Leaflet instance as it moves between persistent and results hosts.

### Planner-facing location wording

Principal-location display derivation removes only a case-insensitive trailing `arrival` suffix. Raw source records remain the provenance evidence; no place-name dictionary or route-specific rewrite is used.

## Evidence and review contracts

- Principal locations require a named, identity-aligned ordered pattern containing the representative assessed stop. The downstream segment starts at that stop. Ambiguous repeated calls are withheld for review.
- A map reference is valid only for a stop included in the selected export set. Word, map key, and marker assignment use the same deterministic reference view.
- Outside London, BODS remains primary and TNDS remains supplementary. Exact local duplicate arbitration retains BODS; unique TNDS services remain. This candidate has not yet completed the required review-noise and material cross-source conflict audit, including effective dates, operating profiles, and timetable differences. No national source should be treated as error-free.
- Qualification metadata remains attached to source records and planner rows. This candidate has not yet completed the required journey-level audit proving mixed qualified/unqualified journeys cannot elevate a restriction to the whole service row. School-day controls require the existing 657 regression to pass in the complete suite.

## Regression evidence available in this checkout

Focused controls added or updated:

- downstream principal locations, closed-loop order, and missing pattern identity review;
- generic directional clipping controls labelled 310, 203, 62, 64, and 65;
- an unambiguous trailing-arrival display cleanup;
- selected export stop references and orphan-reference removal;
- deterministic map extent for small, medium, and geographically spread stop sets;
- Browser smoke assertions for persistent/results host movement and Leaflet/container size agreement.

Commands that passed locally:

- `node tests/atlas/bus-service-assessment.test.mjs` — 20 tests.
- `node tests/atlas/bus-map-references.test.mjs` — pass.
- `node tests/atlas/bus-map-extent.test.mjs` — pass.
- `node tests/atlas/bus-map-layout.test.mjs` — pass.
- `node tests/atlas/bus-map-pdf.test.mjs` — pass.
- `node tests/atlas/bus-word-export.test.mjs` — pass.
- `node tests/atlas/bus-ui-contract.test.mjs` — pass.
- `node tests/atlas/bus-group-1b-semantic-family.test.mjs`, `node tests/atlas/bus-alpha13-planner-summary.test.mjs`, `node tests/atlas/alpha13-summary-closeout.test.mjs`, `node tests/atlas/alpha14-production-row-consolidation.test.mjs`, `node tests/atlas/alpha15-production-fidelity.test.mjs`, and `node tests/atlas/alpha15-planner-service-group.test.mjs` — pass; includes existing 310, 657, 230/231, route-variant, and calendar controls.
- `node tests/atlas/tnds-transxchange.test.mjs`, `node tests/atlas/tnds-operating-profile-standard.test.mjs`, `node tests/atlas/tnds-semantic-fragmentation.test.mjs`, `node tests/atlas/alpha13-calendar-safety.test.mjs`, `node tests/atlas/alpha12-source-completeness.test.mjs`, `node tests/atlas/alpha12-source-presentation.test.mjs`, `node tests/atlas/bus-presentation.test.mjs`, `node tests/atlas/bus-planner-golden-rule.test.mjs`, `node tests/atlas/bus-dest-endpoint-intelligence.test.mjs`, `node tests/atlas/bus-endpoint-alias-closeout.test.mjs`, and `node tests/atlas/v2-review-cache.test.mjs` — pass.
- `node tests/atlas/bus-robustness-1b-national-planner-trust.test.mjs` — 10 tests passed.
- With `TEMP`, `TMP`, and `TMPDIR` pointed to a temporary folder within the checkout: `node tests/atlas/tnds-preparation-multiservice.test.mjs`, `node tests/atlas/tnds-preparation-coverage.test.mjs`, `node tests/atlas/tnds-preparation-scale.test.mjs`, and `node tests/atlas/alpha12-evidence-integrity-audit.test.mjs` — pass, including 1,800-record scale preparation.
- `node tests/atlas/bus-assessment.test.mjs` — pass after updating the review count to separately assert the new fail-safe directional-principal-location items.
- `node --check atlas/assets/js/app.mjs` — pass.

Not completed in this environment:

- `node tests/atlas/run-all.mjs` stops at `tests/atlas/tnds-runtime-shard-browser.test.mjs` because the checkout has no installed `playwright` package. Thus the Browser smoke has not run.
- Python and the Python launcher are unavailable, so `tools/atlas-bus-data/test_build_static_index.py` has not run.
- Data-bound `bus-timetable-merge`, `prepared-bus-data-integrity`, and `bus-qa-03-integrity` tests cannot start because their prepared national files are not present in this sparse checkout. The 900 MB publication root and the excluded national datasets were left untouched.
- The review server test can bind a loopback listener but its follow-up fetch is blocked by sandbox `EACCES`; browser server acceptance is therefore incomplete here.
- No GitHub Actions run was triggered by this branch push. The repository workflows are manual/reusable or are restricted to specific historical branch names; the only pull-request/push CI workflow is scoped to the Drawing Generator and `main`. Do not treat the absence of a run as a passing CI result.
- The complete suite, required 310/203/62/64/65 source-shaped regressions, TNDS review-noise and effective-date conflict controls, operating-profile controls, full Word/Browser parity, and CI remain unverified. A focused unit pass is not a substitute for those gates.

## Manual acceptance guide

Use the current candidate build served from this branch. Confirm the assessment site and review the output against source evidence rather than expecting a fixed national-data answer:

1. **Waltham Cross / 310:** use the existing production replay `npm run review:atlas:alpha15` and the Waltham Cross production fixture. Check two directional rows and confirm each principal-location list follows the direction beyond its own representative stop.
2. **Heathrow / Long Lane:** use the supplied Route 203 and 555 assessments as the comparison evidence. Check Staines-bound and Hounslow-bound locations independently; investigate 555/N555 dates and source provenance before interpreting current availability.
3. **Wycliffe / Stonehouse:** use the supplied Stroud assessment (`GL5 3DS`) and map. Check Routes 62, 64, and 65 in each displayed direction; no opposite-side calls should appear downstream.
4. **TNDS-heavy assessment:** inspect Sources & Checks. A TNDS contribution alone should not be treated as a defect; verify a genuine supplementary service survives and material conflicts remain explicit.
5. **Pipers:** existing control point is `51.852700, -0.454343`, radius 700 m. Route 230 should remain BODS-led; genuine TNDS route 231 should remain visible.
6. **Milton Keynes Route 5:** inspect for one BODS-led duplicate family without an unnecessary TNDS warning; retain distinct route variants.
7. **Chingford:** use `99 Normanshire Drive, Chingford Mount, Highams Park, E4 9HB`. Preserve accepted school-only Route 657 behaviour.
8. **Map export:** select a small stop set and then a broader/spread set, export each from different manual map views, and compare framing, radius, marker numbering, and stop key.
9. **Word export:** export the same selected stop set and check each Served at reference exists in the included stop summary. A non-exported evidence stop must not carry a bracketed map number.

Manual acceptance is for the Product Owner and Technical Director. This document does not record that it has occurred.

## GitHub tooling adoption review

- **Dependabot:** already configured; retain it.
- **Codecov:** no adoption in this corrective sprint; current deterministic tests and workflow evidence are the relevant gates.
- **OpenSSF Scorecard:** no adoption in this corrective sprint; it does not address the detected Bus-output defects.
- **Sentry:** no adoption in this corrective sprint; no runtime telemetry change is needed for the scoped corrections.
- **Renovate:** deferred; avoid overlapping dependency automation with Dependabot.

No tooling was installed or newly configured for this sprint.
