# ATLAS Automatic Updater AU-2 — Source Integration and Candidate Readiness

**Date:** 27 November 2026
**Starting checkpoint:** `1ef6ac6b367702b41d5386c39e18123727a3b3fc`
**Working branch:** `codex/atlas-auto-updater-au2-20261127`
**State:** AU-2 implementation and test-fixture correction passed exact-SHA hosted validation.

## Summary and safety boundary

AU-2 continues AU-1. It adds a separately versioned NPTG locality publication/runtime path and hardens the bounded TfL iBus source builder. It does not refresh national data, download a TfL archive, activate a data pointer, rotate TNDS banks, change production version/build, or deploy. The running/live bank B and all existing repositories remain untouched by this worktree.

The Product Owner created public repositories `joerfreeman02/atlas-tnds-a4` (ID `1474205389`) and `joerfreeman02/atlas-tnds-a5` (ID `1474206081`). Both have an initialized `main` branch and a `pages-publish` branch. The latter contains an empty `.nojekyll` and `atlas-publication-site.json` with the same exact `{"schema":"atlas-publication-site-v1"}\n` marker used by B4/B5. The final branch heads are A4 `96459186b9a0f14df65eb1ecc310b050f4c12640` and A5 `f5103f156355669603f20d5239e85aee238efe40`. The connected GitHub account has `admin` collaborator permission on both repositories.

The seed branches/files are provisioned, but GitHub Pages settings and publication credential access are not yet verified. The connector supports repository and branch/content reads but blocks the `/pages` settings endpoint and has no Pages settings mutation. GitHub repository metadata currently reports `has_pages: false` for both repositories. A direct post-seed health-marker probe could not be repeated because this environment's DNS could not resolve `joerfreeman02.github.io`; the earlier probe observed HTTP 404 for A4/A5 while B4/B5 returned HTTP 200, so Pages publication is not operational yet. The direct authenticated-browser route was not used. A narrowly scoped Actions check used the existing `ATLAS_REFERENCE_DATA_TOKEN` only for checkouts and `git push --dry-run` against an absent preflight ref. A4 checkout succeeded, but the A4 write preflight returned HTTP 403 (permission denied). The job stopped there, so A5 write access is still unverified; no preflight ref was created. The check now evaluates A4 and A5 independently for a rerun after token permissions are corrected.

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

### Remaining Product Owner or administrator steps for A4 and A5

For each repository, using the existing B4/B5 repository controls as the model:

1. In each repository's **Settings → Pages**, choose **Deploy from a branch**, branch `pages-publish`, folder `/(root)`, and save. Keep `main` as the default branch.
2. Wait for Pages deployment, then require HTTP 200 and exact marker content at each URL below. Compare the final Pages source settings and health behavior with B4/B5.
3. Update the existing `ATLAS_REFERENCE_DATA_TOKEN` grant to include Contents read/write on both A4 and A5. Hosted evidence shows the current token can read A4 but cannot write; do not reveal or paste its value. Rerun the branch-scoped Actions check, which independently tests both repos with dry-run pushes and confirms no temporary ref is created.
4. The five-root Bank A structure has passed a structural-only `preflightPublication` check with the proposed assignments, five roots in both banks, all eight regions covered, and active bank B retained. This used placeholder probe/permission/site-health functions and a nonsecret structural test token; it does **not** prove remote repository health or a deployable measured candidate. Keep the configuration inactive and do not change the live `ATLAS_TNDS_BANKS_JSON`, active-bank pointer, or rollback data.

Required closeout evidence is repository IDs/visibility, Pages branch/path, marker URL/status/content, `pages-publish` head, collaborator permission, and the token write-preflight result. The A4/A5 marker URLs are `https://joerfreeman02.github.io/atlas-tnds-a4/atlas-publication-site.json` and `https://joerfreeman02.github.io/atlas-tnds-a5/atlas-publication-site.json`.

## Validation record

Passed locally:

- `node tests/atlas/nptg-publication-runtime.test.mjs` — NPTG staged manifest/shard identity, runtime resolution, parent hydration, inactive-slot preservation, and rollback pointer.
- `node tests/atlas/app-only-data-preflight.test.mjs` — exact identity, independent NPTG shard digest, stale/ineligible refusal, source config parity, and read-only availability behavior.
- `node tests/atlas/atlas-data-publication.test.mjs` — existing dual-bank topology/allocation/rollback lifecycle.
- `node tests/atlas/prepared-bus-data-adapter.test.mjs` — 16 existing prepared Bus adapter cases.
- Node syntax checks for publication, runtime adapter, and app-only preflight.
- `git diff --check`.
- `node tests/atlas/run-all.mjs` — passed end to end (`ATLAS Alpha.15 deterministic suite passed`) using the existing read-only `atlas-run75-regression` worktree roots for frozen Bus, TNDS, and iBus. Headless Chromium browser tests ran; the regression worktree was not modified.
- GitHub Actions Run [45968581931](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45968581931) passed on exact SHA `6eac5b9bce8bcefba567e9c3793ff45c71b26340`: Run #75 artifact identity/restore, complete deterministic ATLAS suite, publication topology/lifecycle/recovery/release checks, all seven iBus source unit tests on Python 3.11, and all 21 static-index Python tests.
- GitHub Actions Run [45972067343](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45972067343) on exact SHA `344878343cfdc9d90b9f492ed8aa5c450c011553` checked out A4 and A5 with the existing secret. A4 dry-run write failed with HTTP 403 and the first iteration stopped before A5 write verification; no ref was created. The workflow is being adjusted to report both repositories independently.

Not completed:

- The Python iBus source unit test could not run locally because `python.exe` resolves to the disabled Microsoft Store alias; its corrected seven-test suite passed in the hosted Python 3.11 runner.
- Fresh iBus inventory, archive acquisition, current candidate preparation, complete candidate-derived service-line selection, and source-complete release eligibility remain outstanding.
- A4/A5 repositories, `main`, `pages-publish`, and seed marker files are present. GitHub Pages settings and post-deployment HTTP 200 checks are outstanding. The current publication secret lacks confirmed A4 write access, and A5 write access is unverified. No active A configuration has been changed.

The full local and hosted deterministic Node/Chromium suites passed against the frozen Run #75 roots. The first hosted run found and the follow-up commit corrected only a Python test fixture directory-creation error; the corrected exact-SHA run passed. No source refresh or national acquisition was performed.

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
