# BUS-RECOVERY-0D.1 — publication capacity and lifecycle correction handover

Recommendation: **READY FOR TECHNICAL DIRECTOR REVIEW**
Production publication remains blocked until the fresh national-data
diagnostic has been run and its root plan approved.

## 1. Repository / branch / worktree state

- Repository: `joerfreeman02/transport-planner-toolkit`
- Branch: `codex/atlas-data-publication-layer`
- Worktree: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\atlas-data-publication-layer`
- Worktree was clean before this correction and contains the existing 0D work.
- No merge, release, tag, external repository, secret, token or deployment was
  created.
- The unsafe source checkout and experimental Alpha16 checkout were not touched.

## 2. Starting and final SHA

- Starting SHA: `b1d2e1d` (`Correct diagnostic and snapshot publication safety`)
- Final SHA: reported in the final response; this handover intentionally avoids a self-referential commit hash.

## 3. Exact files changed

- `.github/workflows/atlas-bus-data-refresh.yml`
- `docs/atlas/ADR-001-REFERENCE-DATA-PUBLICATION.md`
- `docs/atlas/ATLAS-REFERENCE-DATA-PUBLICATION-HANDOVER.md`
- `tests/atlas/atlas-data-publication.test.mjs`
- `tests/atlas/automated-refresh-contract.test.mjs`
- `tools/atlas-data-publication/fetch-last-known-good.mjs`
- `tools/atlas-data-publication/publication.mjs`
- `tools/atlas-data-publication/validate-publication.mjs` (new)

## 4. 0D defects corrected

1. Fresh national capacity is now measured as a complete diagnostic with Bus
   and TNDS totals, per-region totals, largest files/shards and a proposed
   publication-root allocation. The checkout fixture is explicitly labelled
   incomplete; no fresh national measurement is fabricated.
2. The unbounded release directory is replaced with two slots per publication
   root and bounded current/previous audit records. The resulting tree is
   measured, including lifecycle metadata.
3. Human-governed application source and machine-generated publication output
   are separated. Automated writes target only `pages-publish` in configured
   data repositories.

## 5. Final publication topology

The application shell remains in the main toolkit Pages site. Bus data uses a
bounded two-slot publication root. TNDS uses one or more configured roots; the
number is selected by deterministic capacity-fit allocation of complete
authoritative regions, largest region first with stable region-name tie-break.
The deployment can supply root IDs/repositories/sites through the publication
API/CLI. The default remains one root for backward compatibility.

`atlas-data-sources.json` records the active slot for each root and an exact
`pathMap` for every TNDS service shard. The resolver therefore sends each shard
to exactly one root. The diagnostic and tests prove no missing or duplicate
shard allocation. Regions are never silently truncated or split.

## 6. Bounded lifecycle design

Each root contains `slot-a`, `slot-b`, `.nojekyll`, `publication-state.json`,
`audit/current.json` and optionally `audit/previous.json`. A refresh stages the
candidate in the inactive slot while retaining the current slot. Publication
history is force-with-lease replaced with one snapshot commit on
`pages-publish`, so history does not accumulate complete datasets.

`promoteBoundedPublication()` records a validated candidate as current, while
`rollbackBoundedPublication()` selects the previous slot. Application rollback
uses the previous validated application configuration and slot set.

## 7. Capacity and safety margin

- GitHub Pages nominal limit: `1,000,000,000` bytes.
- Operational safe limit: `900,000,000` bytes.
- Deliberate safety margin: `100,000,000` bytes.
- Planning metadata budget: `1,000,000` bytes.

The diagnostic reports, per root, projected current footprint, candidate/
rollback overhead, projected total footprint and remaining margin. The staging
gate measures the actual resulting tree, including manifests, indexed hashes,
audit and state metadata. A root or complete region that cannot fit fails
closed. The diagnostic can propose additional virtual roots; production cannot
stage them until corresponding configured repositories are supplied.

## 8. TNDS regional routing

TNDS service shard filenames are parsed for exactly one of `EA`, `EM`, `NE`,
`NW`, `SE`, `SW`, `WM`, `Y`. The allocator groups all shards of a region and
assigns that group to one root. It produces `shardToRoot` and exact config
`pathMap` entries. Tests cover all eight required regions, missing identities,
duplicate/incomplete allocation guards and multi-root capacity packing.

## 9. Fresh-data measurements

No genuine fresh national Bus/TNDS acquisition was available in this local
session because the acquisition requires the authorised workflow credentials.
The checked-out TNDS data is a small fixture and is not reported as national
capacity evidence.

Exactly one Product Owner action is required:

**GitHub → Actions → ATLAS Bus data refresh → Run workflow → select
`codex/atlas-data-publication-layer` → set `force_refresh=true` → Run.**

Return the resulting `atlas-candidate-measurement.json` as evidence, including
Bus totals/largest files, TNDS national and eight regional totals/largest
shards, proposed root allocation, projected current/candidate/rollback/total
bytes and remaining safety margins. Do not publish or create roots before
Technical Director review of that evidence.

## 10. Rollback / LKG behaviour

The existing application configuration remains untouched until every required
publication root passes manifest identity, per-file byte/hash and aggregate
checksum validation. If any candidate publication or validation fails, the old
configuration remains usable. The existing `fetch-last-known-good` step now
also records per-root active slots for a future multi-root run.

## 11. Audit / provenance design

Slot publication manifests contain the prepared manifest identity, source
identity, publication version, regional allocation and exact indexed payload
hashes. Bounded audit records contain version, timestamp, source/candidate
hashes, counts, bytes, root/slot allocation and configuration version. Only
current and previous audit records are retained; full historic national
datasets are not retained for audit.

## 12. Atomic application switch

The workflow sequence is acquire → prepare → validate → measure → stage all
roots → publish → wait → validate all publication contents → install the
candidate config → deploy the small shell. HTTP 200 is only a wait condition.
`validate-publication.mjs` recomputes indexed file hashes and the aggregate
checksum and confirms all manifest-referenced TNDS service shards are present
across the validated roots. Config installation is therefore downstream of the
complete publication barrier.

## 13. Bus semantic freeze

No planner-facing Bus behaviour was changed. Nearby stop discovery, service
inclusion/exclusion, BODS/TNDS interpretation, TfL route/direction semantics,
NaPTAN logic, destination interpretation, grouping, circular classification,
frequencies, calendars, planner tables, browser presentation and Word
presentation remain unchanged. Alpha.15 remains the accepted semantic
baseline. NPTG was not implemented; its configuration slot remains null.

## 14. Tests and verification

Local commands run for this handover:

- `node tests/atlas/atlas-data-publication.test.mjs` — PASS
- `node tests/atlas/atlas-publication-snapshot.integration.test.mjs` — PASS
- `node tests/atlas/automated-refresh-contract.test.mjs` — PASS
- `node --check tools/atlas-data-publication/publication.mjs` — PASS
- `node --check tools/atlas-data-publication/validate-publication.mjs` — PASS
- `pnpm test:atlas` — run below and report result
- `pnpm test:bus` — run below and report result
- `git diff --check` — run below and report result

These are local results. No GitHub CI/check-run was created or verified by this
sprint; GitHub CI status is therefore **not claimed**.

## 15. GitHub tooling adoption review

- Dependabot: retain for Actions and dependency updates.
- Codecov: optional; not required for this deterministic infrastructure suite.
- OpenSSF Scorecard: recommended for application and publication repositories.
- Sentry: not adopted for static reference-data publication.
- Renovate: not adopted alongside Dependabot.

## 16. Remaining external Product Owner actions

Run the one diagnostic action in section 9, return its measurement evidence,
then obtain Technical Director approval for the resulting root count and
configure the narrowly scoped publication repositories/Pages sites, token,
branch rules and workflow variables. Those external changes are deliberately
not performed here.

## 17. NPTG

NPTG was **NOT implemented**.

## Recommendation

**READY FOR TECHNICAL DIRECTOR REVIEW** — infrastructure correction is locally
implemented and tested; production publication is pending genuine fresh
national measurement and external Product Owner/Technical Director approval.
