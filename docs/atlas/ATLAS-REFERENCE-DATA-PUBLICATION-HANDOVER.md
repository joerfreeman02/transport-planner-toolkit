# BUS-RECOVERY-0D.2 handover

Recommendation: **READY FOR TECHNICAL DIRECTOR REVIEW**

0D.2 corrects the diagnostic, review-branch safety and publication-snapshot
mechanism. No external repository, secret, token, Pages setting, merge,
deployment or production refresh was created or run.

## REPOSITORY STATE

- Branch: `codex/atlas-data-publication-layer`
- Worktree: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\atlas-data-publication-layer`
- Starting head: `4d8cb85e132e39c320dbccd4f4325b686a66a0c6`
- Final branch head: report the actual pushed head in the final response
- Existing 0D.1 implementation: `44747e6`
- Review branch only; protected application `main` was not changed

The quarantined Recovery-0, `source` and Alpha16 checkouts were not modified.
The tracked document intentionally does not self-reference its final commit
SHA; the actual branch head is reported with the handover.

## DIAGNOSTIC CORRECTION

`measureCandidateDatasets()` now measures without applying the production
size gate. It reports complete Bus/TNDS bytes and files, largest files,
aggregate hashes, projected blue-green sizes, explicit fit/fail booleans and
proposed-group fit booleans. It still fails closed on malformed data or
ambiguous/missing expected TNDS region identity.

TNDS allocation is explicit for `EA`, `EM`, `NE`, `NW`, `SE`, `SW`, `WM` and
`Y`. A deterministic synthetic candidate above the 900 MB safe limit is fully
measured and region-allocated by the test suite. Production staging continues
to reject an over-limit candidate before installation or publication.

## REVIEW-BRANCH SAFETY

The workflow now permits `refs/heads/main` and manually dispatched runs from
non-main refs. A manually dispatched non-main run is inherently
diagnostic-only, even if `measure_only` is false. It may acquire, prepare,
validate and measure fresh data, but cannot require publication repositories or
`ATLAS_REFERENCE_DATA_TOKEN`, push data, configure Pages, upload the app
artifact or deploy.

Normal publication and deployment remain main-only. Main also retains the
explicit `measure_only` diagnostic option.

## SNAPSHOT PUBLICATION CORRECTION

The unsafe `git switch --orphan` sequence was removed. The publisher first
constructs the complete desired tree outside the tracked checkout, retaining
the active rollback slot and installing the inactive candidate slot. A
temporary Git repository then creates one snapshot commit and pushes it with
`force-with-lease` only to the dedicated machine branch `pages-publish`.

Each publication repository contains only `slot-a`, `slot-b`, lightweight
metadata and the current publication content. There is no `releases/<version>`
accumulation and no generated dataset history on application `main`.

## TWO-PUBLICATION GIT INTEGRATION TEST

`tests/atlas/atlas-publication-snapshot.integration.test.mjs` uses a temporary
working repository and bare remote. It performs Publication 1 and Publication
2, then proves both slots and rollback content exist, obsolete `releases/`
and third slots are absent, the `pages-publish` history remains one commit,
audit current/previous records exist, and no orphan-switch failure occurs.

## AUDIT HISTORY

Each publication retains bounded `audit/current.json` and
`audit/previous.json` records containing publication version, generated time,
application/config version, source and candidate hashes, candidate bytes/files,
regional TNDS allocation and active/candidate slots. `publication-state.json`
and the slot manifests provide the lifecycle and checksum records. All of this
metadata is included in the total-site safety gate. Historic full Bus/TNDS
datasets are not retained.

## SEMANTIC INTEGRITY

No changes were made to service discovery, NaPTAN, BODS, TNDS, TfL, destination
or endpoint logic, grouping, circulars, frequency, calendars, planner
presentation or Word export. No coverage was truncated. NPTG is not
implemented.

## TEST RESULTS

The focused tests and syntax checks pass. The full verification run is:

- `pnpm test:atlas` — PASS
- `pnpm test:bus` — PASS
- `node tests/atlas/atlas-data-publication.test.mjs` — PASS
- `node tests/atlas/atlas-publication-snapshot.integration.test.mjs` — PASS
- `node tests/atlas/automated-refresh-contract.test.mjs` — PASS
- syntax checks for publication, snapshot, measurement and fetch scripts —
  PASS
- `git diff --check` — PASS

## NPTG NOT IMPLEMENTED

NPTG remains a null/future configuration entry. No source, data or planner
semantics were added.

## GITHUB TOOLING ADOPTION REVIEW

- Dependabot: retain/enabled.
- Codecov: optional; not required for this deterministic contract-test change.
- OpenSSF Scorecard: recommended for app and publication repositories.
- Sentry: not adopted for this static data transport layer.
- Renovate: not adopted alongside Dependabot.
- Branch protection: application `main` is currently behaviourally protected
  by programme governance, but GitHub branch protection is not yet enabled.
  This remains a Product Owner follow-up; generated data must stay on
  `pages-publish`.

## EXACT NEXT PRODUCT OWNER ACTION

After reviewing this branch, run exactly:

GitHub → Actions → **ATLAS Bus data refresh** → **Run workflow** → select
`codex/atlas-data-publication-layer` → set `force_refresh=true` → Run.

Because the selected ref is non-main, the workflow automatically behaves as a
diagnostic-only run. It requires no publication repositories or publication
token and does not change production state. Record the complete fresh Bus and
TNDS totals, all eight TNDS regional allocations, projected blue-green sizes
and proposed-group fit results. Do not create external repositories yet and
do not attempt production publication until the topology is approved from
those measurements.

## RECOMMENDATION

**READY FOR TECHNICAL DIRECTOR REVIEW; NOT PRODUCTION-PUBLICATION READY.**
The remaining decision is the minimum safe TNDS/publication topology based on
genuine fresh national measurements.
