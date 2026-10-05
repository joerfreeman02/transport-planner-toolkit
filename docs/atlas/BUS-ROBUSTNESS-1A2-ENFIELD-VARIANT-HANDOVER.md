# BUS-ROBUSTNESS-1A2 — Enfield variant annotation closeout

Status: READY FOR PRODUCT OWNER MANUAL ACCEPTANCE

Date: 2026-10-05 (Europe/London)

## Scope and immutable run identity

- Sprint: `BUS-ROBUSTNESS-1A2` — Enfield variant annotation closeout.
- ATLAS release line: Alpha.15. Alpha.16 was not started.
- Baseline commit: `d86be60fa82da2d430649f077c4ef52878e1b042`.
- Correction branch: `codex/atlas-bus-enfield-variant-closeout`.
- Fresh worktree: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\atlas-bus-enfield-variant-closeout`.
- Safe prior branch preserved unchanged: `codex/atlas-bus-robustness-1a-calendar-simple` at `d86be60fa82da2d430649f077c4ef52878e1b042`.
- Implementation commit: `86b9d9c80b7a9e225bafa8118ceedb72a5e72493`.
- Documentation handover commit before final review refresh: `0847978439ac30a5648b4eaf982c87c88280ff13`.
- Final code/review tip: `8a3178791493f47f8a87221a7d5046e442c07fbe`.
- No merge, deploy, publish, production refresh, Alpha.16 work, 1B work, or unrelated polish was performed.

## Files changed

1. `src/atlas/domain/bus-planner-summary.mjs`
2. `tests/atlas/bus-robustness-1a2-enfield-variant.test.mjs`
3. `tests/atlas/run-all.mjs`
4. `docs/atlas/BUS-ROBUSTNESS-1A2-ENFIELD-VARIANT-HANDOVER.md`

No temporary reproduction script or temporary fixture remains in the worktree.

## Reproduction evidence

The accepted V2 review was reproduced for Enfield Town at:

- Latitude `51.6523584`.
- Longitude `-0.0783252`.
- Radius `250m`.
- Ten returned stops, including Enfield Town Station StopPoints `490001101N`, `490001101K`, `490001101L`, and `490001101M`, plus Genotin Road, Silver Street, Enfield Town Station, Peartree Road, Southbury Road, and Ladysmith Road.
- TfL bounded live replay: 35 requests, 35 successful requests.
- Timetable conclusion: `MATCHED`.
- Assessment: `ok: true`, `status: complete`.

The replay used the local V2 review server and its frozen prepared data together with bounded live TfL evidence. The frozen national snapshot/source run was `36125621080`; no fresh national acquisition was performed for this closeout. OSRM was used only within the existing bounded replay path.

The evidence is sufficient to validate the two sprint hypotheses while keeping the acquisition surface bounded and reproducible.

## Confirmed root causes

### H1 — calendar-only differences were treated as route variants

`variantNote` treated the presence of `calendarVariantRecordIds` as sufficient evidence for a route variant. That was false for Enfield route 121 and W8: ordinary, school-day, and non-school-day records shared the same public endpoints and route patterns, while differing only by calendar profile. The old logic therefore added the generic route-variant wording:

`Additional short workings and timetable variants operate.`

The fix removes calendar-only evidence from the route-variant trigger. A planner-facing route annotation now requires structural evidence such as distinct endpoints, distinct patterns, or an explicit resolved short/branch variant.

### H2 — unresolved destination placeholders leaked into planner notes

`plannerAnnotationTaxonomy` preferred the raw variant destination before the service's resolved planner destination. Route 313 supplied an unresolved short-working record whose raw destination was `Destination not supplied`. That value reached the planner-facing note:

`Short workings: Some route 313 journeys operate to Destination not supplied.`

The fix prefers a valid service-level planner destination and rejects the known unresolved placeholders `Destination not supplied` and `Destination not resolved` when no resolved destination exists. The unresolved record remains available in structured grouping/provenance evidence, but it is not promoted into a misleading planner annotation.

Both hypotheses were confirmed by the bounded Enfield replay before implementation and are covered by deterministic regression tests after implementation.

## Before/after planner evidence

### Route 121

Before:

- The holiday/calendar qualification was present.
- The generic route-variant note was also present despite ordinary, school-day, and non-school-day records sharing the same public route shape.
- No genuine resolved short-working or branch evidence was found in the replay.

After:

- `Timetable may vary during school holidays.` is retained.
- The generic route-variant note is absent.
- No short-working annotation is emitted without genuine resolved structural evidence.

### Route W8

Before:

- The holiday/calendar qualification was present.
- The generic route-variant/route-group wording was falsely added by calendar-only record multiplicity.

After:

- The holiday qualification is retained.
- The generic route-variant and route-group notes are absent.
- No false short-working note is emitted.

### Route 313

Before:

- The unresolved short-working record had an empty supplied endpoint and endpoint stop `490005843E`.
- Planner output exposed `Destination not supplied` as a short-working destination, alongside the generic route-variant path.

After:

- No fake planner-facing short-working location is emitted when the only evidence is unresolved.
- The unresolved candidate remains in grouping/detailed provenance evidence for auditability.
- A valid resolved destination is still preferred and emitted when supplied by a matching service record.

## Regression coverage

### Chingford / established Alpha.13 and Alpha.15 controls

The full suite retained the existing controls for routes 357, 444, W16, and 657, including the school-day-only presentation for 657. Direction identity, terminus presentation, frequency evidence, operating-period evidence, Browser parity, and Word parity all passed.

### Waltham and genuine variants

The full suite retained the Waltham and production-shaped controls in `bus-group-1e-real-runtime.test.mjs`, `bus-group-1f-real-runtime.test.mjs`, `bus-circ.test.mjs`, `bus-circ-1c-enriched-group.test.mjs`, Alpha.15 production-fidelity coverage, BUS-QA-02, BUS-QA-03, and the endpoint-alias closeout. Genuine short-working evidence, including the established 66/251 controls and a resolved `Resolved Midpoint` test case, remains planner-visible. Genuine branch evidence remains planner-visible.

### Calendar safety

`bus-robustness-1a-calendar-simple.test.mjs` and `alpha13-calendar-safety.test.mjs` passed. Calendar-only differences retain holiday/school qualifications but do not create route-variant annotations.

### Browser and Word parity

The new Enfield regression test asserts Browser/Word text controls for holiday wording, resolved short-working wording, branch wording, school-day qualification, and exclusion of unresolved placeholder phrases. Existing `bus-word-export.test.mjs`, Browser contracts, QA controls, and the full review-environment tests also passed.

## Tests and verification

Focused tests passed, including:

- `bus-robustness-1a2-enfield-variant.test.mjs`
- `bus-robustness-1a-calendar-simple.test.mjs`
- `alpha13-calendar-safety.test.mjs`
- `alpha13-summary-closeout.test.mjs`
- `bus-group-stop-1a-hardening.test.mjs`
- `bus-group-1e-real-runtime.test.mjs`
- `bus-group-1f-real-runtime.test.mjs`
- `bus-circ.test.mjs`
- `bus-circ-1c-enriched-group.test.mjs`
- `bus-endpoint-alias-closeout.test.mjs`
- `tfl-operating-period.test.mjs`
- `tfl-operating-period-1b.test.mjs`
- `tfl-operating-period-1c.test.mjs`
- `bus-qa-02-frequency.test.mjs`
- `bus-qa-03-integrity.test.mjs`
- `bus-word-export.test.mjs`
- `bus-ui-contract.test.mjs`

The clean full command passed:

```text
node tests/atlas/run-all.mjs
```

The run passed the isolation guard, all Alpha.15 product tests, all BUS-GROUP and BUS-CIRC tests, all QA/TNDS tests, review-environment tests, V2 cache/runtime tests, and recovery-contract tests. It ended exactly with:

```text
ATLAS Alpha.15 deterministic suite passed.
```

## Review build and acceptance boundary

- Final V2 development/review build verified at `http://127.0.0.1:8770/atlas/?review=v2`.
- Verified response: HTTP 200, ATLAS route served, build identity `BUS-TFL-COMPLETE · 8a31787`.
- The review build was served from a clean documentation tip; the implementation SHA remains `86b9d9c80b7a9e225bafa8118ceedb72a5e72493`.
- The review build must respond on loopback and serve the ATLAS route directly; the legacy dashboard remains recoverable.
- This handover requests Product Owner manual acceptance of the reproduced Enfield Town 250m review.
- Dynamic TfL data can change after the bounded replay; the evidence is a dated closeout snapshot, not a claim of permanently static external data.

## GitHub tooling review

Dependabot, Codecov, OpenSSF Scorecard, Sentry, and Renovate were reviewed for this sprint. No tool was installed, enabled, reconfigured, or expanded as part of the closeout.

## Recommendation

READY FOR PRODUCT OWNER MANUAL ACCEPTANCE.

The minimal planner-only correction is complete, deterministic coverage is green, the safe prior branch is preserved, and the correction remains isolated to Alpha.15. Do not begin BUS-ROBUSTNESS-1B, Alpha.16, deployment, publishing, or unrelated polish from this handover.
