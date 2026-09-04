# BUS-1 emergency recovery handover — 2026-09-04

## Exact state at stop

- Repository/worktree: `C:/Users/joe.freeman/OneDrive - EAS Transport/Documents/Transport Planner Toolkit/atlas-bus-1-finish`
- Rescue branch: `codex/atlas-bus-1-rescue-20260904`
- Starting and pre-rescue HEAD: `4fddd0cd3a8eb4f9dd624212cf414c0f60319bb7`
- Verified remote recovery branch: `origin/codex/atlas-bus-1-complete` at the same SHA
- Base dependency: BUS-1 Alpha.3, itself descended from SITE-1 and Foundation
- Review server: running and serving the Alpha.4 shell on `http://127.0.0.1:8769/atlas/`
- Prepared Bus data: incomplete; 357 gzip service shards totalling 38,943,414 bytes; no stop shards and no manifest
- Protected dependency junction retained: `node_modules` points to the bundled Codex Node packages

## Interrupted operation

The active `build_static_index.py` process was interrupted immediately after the Product Owner's emergency stop. It had cleared/restarted the untracked `atlas/data/bus` output and reached 357 service shards. Source code had just been updated to preserve NaPTAN British National Grid-only records, identify school/term-time source wording, and keep circular service directions separate; the running Python process predated the final direction-grouping edit. Therefore the partial generated shards do not form a coherent snapshot of the checked-in transformer.

The application shell runs, but a Bus assessment cannot complete because `atlas/data/bus/manifest.json` returns 404. Treat all Alpha.4 work as WIP.

## Tracked files changed at the stop

- `atlas/assets/css/atlas-shell.css`
- `atlas/assets/js/app.mjs`
- `atlas/index.html`
- `docs/adr/README.md`
- `docs/atlas/BUS-1-CONTINUATION.md`
- `docs/atlas/BUS-1-TEST-RECORD.md` (temporarily deleted during a documentation replacement; restored as this recovery test record before commit)
- `docs/atlas/GITHUB-TOOLING-REVIEW.md`
- `docs/atlas/MANUAL-ACCEPTANCE.md`
- `docs/atlas/SOURCE-PROVENANCE.md`
- `docs/atlas/VERSION.md`
- `package.json`
- `tests/atlas/atlas-browser-smoke.mjs`
- `tests/atlas/browser-test-helpers.mjs`
- `tests/atlas/live/browser-cors-smoke.mjs`
- `tests/atlas/live/naptan-waltham-cross-smoke.mjs`
- `tests/atlas/live/nominatim-millers-house-smoke.mjs`
- `tests/atlas/live/tfl-crystal-palace-smoke.mjs`
- `tests/atlas/planner-ux-browser.mjs`
- `tests/atlas/review-environment-browser.mjs`
- `tests/atlas/review-environment.test.mjs`
- `tests/atlas/run-all.mjs`
- `tests/atlas/site-selector-browser.mjs`
- `tools/atlas-review/review-server.mjs`

No tracked application/source file is deleted in the rescue commit.

## New source, test and documentation files preserved in the rescue commit

- `docs/adr/ADR-011-prepared-national-bus-data.md`
- `docs/atlas/BUS-1-ARCHITECTURE.md`
- `docs/atlas/BUS-1-RECOVERY-2026-09-04.md`
- `src/atlas/adapters/osrm-access-routing-adapter.mjs`
- `src/atlas/adapters/prepared-bus-data-adapter.mjs`
- `src/atlas/application/bus-assessment.mjs`
- `src/atlas/domain/bus-service-assessment.mjs`
- `tests/atlas/bus-assessment.test.mjs`
- `tests/atlas/bus-service-assessment.test.mjs`
- `tests/atlas/live/cambridge-national-smoke.mjs`
- `tests/atlas/osrm-access-routing-adapter.test.mjs`
- `tests/atlas/prepared-bus-data-adapter.test.mjs`
- `tests/atlas/prepared-bus-data-integrity.test.mjs`
- `tools/atlas-bus-data/build_static_index.py`

## Untracked generated/build inputs deliberately retained and not committed

- `atlas/data/bus/services/*.json.gz`: 357 partial generated shards, 38,943,414 bytes; incomplete and reproducible
- `tmp/bus-data/naptan.csv`
- `tmp/bus-data/east-anglia.zip`
- `tmp/bus-data/east_midlands.zip`
- `tmp/bus-data/london.zip`
- `tmp/bus-data/north_east.zip`
- `tmp/bus-data/north_west.zip`
- `tmp/bus-data/south-east.zip`
- `tmp/bus-data/south_west.zip`
- `tmp/bus-data/west_midlands.zip`
- `tmp/bus-data/yorkshire.zip`
- `tmp/bus-sample-input/east-anglia.zip`
- `tmp/bus-index-sample/manifest.json`
- `tmp/bus-index-sample/manifest-LaptopTransport201025.json`
- `tmp/bus-index-sample/services/*`: 66 files
- `tmp/bus-index-sample/stops/*`: 1,196 files

These files remain on disk exactly for investigation/continuation. The rescue commit intentionally excludes official raw downloads, test scratch data and the incoherent partial product dataset.

## The reported approximately 657-file deletion

Git records no mass tracked deletion: the inspection found only the temporary deletion of `BUS-1-TEST-RECORD.md`, restored before rescue commit. The available state does not identify the Product Owner-blocked approximately 657-file proposal with certainty. The only observed mass-file mechanism in this WIP is the generator's `clear_output` of untracked `atlas/data/bus` before a rebuild. A prior completed generated output contained 1,277 files and the interrupted output now contains 357; this does not numerically match 657 and must not be assumed to be the same event. All currently retained generated files, raw inputs, sample files, dependency junctions and OneDrive-managed files are protected from cleanup pending manual review.

## Recovery path

Safe rollback is the verified remote `codex/atlas-bus-1-complete` at `4fddd0cd3a8eb4f9dd624212cf414c0f60319bb7`. To continue the WIP, start from the pushed rescue branch, inspect this record, regenerate `atlas/data/bus` completely from the retained `tmp/bus-data` inputs, then run the integrity, full deterministic, browser and three live controls. Do not merge the rescue commit. Do not discard it: the architecture, transformer, application, UI and tests contain valuable progress.
