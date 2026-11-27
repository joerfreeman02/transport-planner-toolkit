# ATLAS Automatic Updater AU-2 — Source Integration and Candidate Readiness

**Date:** 27 November 2026
**Starting checkpoint:** `1ef6ac6b367702b41d5386c39e18123727a3b3fc`
**Working branch:** `codex/atlas-auto-updater-au2-20261127`
**State:** AU-2 branch pushed; a hosted test-fixture correction is in progress.

## Summary and safety boundary

AU-2 continues AU-1. It adds a separately versioned NPTG locality publication/runtime path and hardens the bounded TfL iBus source builder. It does not refresh national data, download a TfL archive, activate a data pointer, rotate TNDS banks, change production version/build, or deploy. The running/live bank B and all existing repositories remain untouched by this worktree.

The supplementary authorization requested two additional public Pages repositories, `atlas-tnds-a4` and `atlas-tnds-a5`. B4 and B5 are public, and both expose `main` and `pages-publish` branches; the existing user collaborator permission is admin. Repository creation and Pages/access configuration did not occur. GitHub UI presented an account sign-in transition and the Computer Use security review denied browser takeover because the sign-in origin was `accounts.google.com`; the skill disallows changing browser surfaces to work around that decision. The GitHub connector has no repository-creation or Pages-settings mutation tool. Native `gh` authentication was invalid and shell DNS resolution for GitHub failed. No alternate UI, CDP, or credential workaround was attempted.

The published NPTG adapter and candidate staging changes are inactive until a separately approved data publication changes the application data-source pointer. AU-2 local code does not change any live data routing.

## NPTG separation and recovery

When a prepared V2 Bus candidate contains an authoritative NPTG source hash and locality sidecars, publication preparation now stages a versioned NPTG manifest and locality shards beneath the inactive Bus Pages NPTG slot. It records the source SHA-256, source version, shard key map, per-shard SHA-256/byte counts, and locality/district counts. V1 or incomplete candidates do not receive an invented NPTG manifest and remain unconfigured.

The generated candidate configuration points to the staged NPTG slot but is only an output artifact. The runtime adapter can load that independent manifest and locality shards, validate their identity, and hydrate parent localities. If NPTG is absent from configuration, the existing Bus V2 sidecar path remains in use. App-only preflight and last-known-good restoration verify and preserve the NPTG snapshot. Rollback retains the prior NPTG slot pointer rather than clearing it.

NPTG staging uses only shards from the supplied prepared candidate. It does not contact the NPTG source. The active slot is retained while the candidate slot is staged; an eventual configuration switch remains a separate guarded publication operation.

## TfL iBus acquisition hardening

`build-tfl-ibus-operator-index.py` now caches raw inputs beneath the full `Base_Version_YYYYMMDD` prefix and only trusts cached archives whose byte size, SHA-256, and listing ETag match. The current root `Base_Version.xml` is refreshed on every build. Downloads go to unique `.part` files, are size/ETag checked, fsynced, and atomically renamed after completion, with bounded retries and ZIP CRC validation. A service-line selection manifest can bind a complete line selection to a candidate snapshot SHA. `--inventory-only` retrieves fresh version metadata and paginated S3 listing metadata and reports counts and byte sizes without fetching schedule or network archives.

The inventory option is the only intended next measurement step before any full archive acquisition. No archive inventory request completed in this environment: outbound DNS/network access was unavailable and the read-only web probe returned an internal error for the source endpoints. TfL's published static-data guide describes versioned data and warns against mixing Base_Version snapshots. The retained Run #75 iBus pair is historical, byte-frozen regression evidence; it is not represented as current service data. A fresh source build and complete candidate-derived service-line inventory remain outstanding.

## Five-root Bank A plan

The measured AU-1 topology work found five roots were the minimum practical capacity for the retained candidate. The proposed grouping follows the measured Bank B allocation:

| Root | Proposed regions | Pages URL |
|---|---|---|
| A1 | SW | `https://joerfreeman02.github.io/atlas-tnds-a1/` |
| A2 | SE | `https://joerfreeman02.github.io/atlas-tnds-a2/` |
| A3 | EA, NW | `https://joerfreeman02.github.io/atlas-tnds-a3/` |
| A4 | NE, WM | `https://joerfreeman02.github.io/atlas-tnds-a4/` |
| A5 | EM, Y | `https://joerfreeman02.github.io/atlas-tnds-a5/` |

This is a proposed, inactive bank configuration. It is not activated and does not change bank B or its rollback role. The exact root assignments must still pass deterministic allocation and the existing per-root, file, total-site, repository, health-marker and complete-region gates against a measured candidate.

### Product Owner or administrator steps still required for A4 and A5

For each repository, using the existing B4/B5 repository controls as the model:

1. Create a **public**, empty repository named `atlas-tnds-a4` or `atlas-tnds-a5` under `joerfreeman02`; do not fork B4/B5 or copy their data history.
2. Create and push the `pages-publish` branch. Keep `main` as the repository default branch; do not publish from `main`.
3. In repository **Settings → Pages**, publish from `pages-publish` at `/(root)`. Preserve the same public Pages contract used by B4/B5.
4. Seed the branch with `.nojekyll` (empty file) and `atlas-publication-site.json` containing exactly `{"schema":"atlas-publication-site-v1"}`. The latter must be served from the repository Pages root.
5. Grant the existing `ATLAS_REFERENCE_DATA_TOKEN` credential write access to both new repositories, with the same token type and least-privilege configuration currently used for B4/B5. Do not expose or paste the token value into the repository or handover.
6. Verify repository visibility, `pages-publish`, Pages source branch/path, effective Pages URL, marker HTTP 200/schema, and token-based read/write access using the existing `checkout-bank.mjs` and publication preflight procedures. A successful admin permission check alone does not prove the workflow credential can publish.
7. Add A4/A5 and the proposed region assignments to the **inactive** five-root A configuration, validate both banks and all eight regions, then stop before any active-bank pointer/configuration change.

Required evidence should record repository IDs, public/private visibility, Pages branch/path, marker URL and response, `pages-publish` branch SHA, repository permission result, and a publication-credential access check that never logs the token. The exact B4/B5 Pages settings and remote marker responses were not available through the GitHub connector's allowed reads during this run; compare the settings directly before declaring replication complete.

## Validation record

Passed locally:

- `node tests/atlas/nptg-publication-runtime.test.mjs` — NPTG staged manifest/shard identity, runtime resolution, parent hydration, inactive-slot preservation, and rollback pointer.
- `node tests/atlas/app-only-data-preflight.test.mjs` — exact identity, independent NPTG shard digest, stale/ineligible refusal, source config parity, and read-only availability behavior.
- `node tests/atlas/atlas-data-publication.test.mjs` — existing dual-bank topology/allocation/rollback lifecycle.
- `node tests/atlas/prepared-bus-data-adapter.test.mjs` — 16 existing prepared Bus adapter cases.
- Node syntax checks for publication, runtime adapter, and app-only preflight.
- `git diff --check`.
- `node tests/atlas/run-all.mjs` — passed end to end (`ATLAS Alpha.15 deterministic suite passed`) using the existing read-only `atlas-run75-regression` worktree roots for frozen Bus, TNDS, and iBus. Headless Chromium browser tests ran; the regression worktree was not modified.

Not completed:

- The Python iBus source unit test could not run locally because `python.exe` resolves to the disabled Microsoft Store alias and no Python interpreter is installed in the available paths. The branch-scoped AU-2 workflow provisions Python 3.11 and runs the test.
- Exact-SHA GitHub Actions Run [45967968981](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45967968981) verified commit `ac399c05529a788d18cd5dfe5ded2a34c2c11891`. The complete deterministic ATLAS suite, publication/recovery checks, immutable Run #75 restore, and offline static-index Python suite passed. The new iBus test step exposed a fixture setup error: its test attempted `mkdir()` on the already-created `TemporaryDirectory`. The fixture now uses `exist_ok=True`; an exact-SHA rerun is pending.
- Fresh iBus inventory, archive acquisition, current candidate preparation, complete candidate-derived service-line selection, and source-complete release eligibility remain outstanding.
- A4/A5 creation, Pages/access configuration, and publication-credential access verification remain outstanding for the sign-in/tooling reasons above.

The corrected iBus source unit test and exact-SHA hosted rerun remain outstanding. The full local and hosted deterministic Node/Chromium suites passed against the frozen Run #75 roots; no source refresh or national acquisition was performed.

## IET / UK-SPEC handover

This work demonstrates engineering evidence relevant to the UK-SPEC competence areas without making a professional accreditation claim:

- **Engineering knowledge and problem analysis:** separates NPTG identity from Bus timetable identity and makes source/slot lineage verifiable.
- **Design and implementation:** stages an independent inactive locality slot and uses guarded path/hash validation with rollback preservation.
- **Responsibility and safety:** retains source freshness and production gates; does not activate routing or permit diagnostic data to gain production eligibility.
- **Communication and leadership:** records the incomplete infrastructure access, exact verification limits, and the actions needed from an administrator in this handover.
- **Professional commitment:** preserves provenance, immutable Run #75 regression evidence, bounded acquisition, and honest distinction between historical fixtures and current source validity.

## Tooling adoption review

- **Dependabot:** configured for npm and GitHub Actions; retain it.
- **Codecov:** deferred; no configuration or installation.
- **OpenSSF Scorecard:** deferred; no workflow/configuration added.
- **Sentry:** deferred; no runtime telemetry dependency added.
- **Renovate:** deferred in favour of configured Dependabot.

## Readiness

AU-2 is **partial**. Local NPTG integration and iBus hardening changes are implemented and the focused tests pass, but exact-SHA hosted validation is pending. A4/A5 provisioning is uncompleted, source acquisition is unavailable, and no production-ready data candidate exists. Do not start the updater, activate bank A, merge, release, or deploy from this checkpoint until the hosted workflow and data/infrastructure gates have completed and the separate required approvals are obtained.
