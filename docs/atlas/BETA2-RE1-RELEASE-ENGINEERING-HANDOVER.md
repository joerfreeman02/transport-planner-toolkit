# ATLAS Bus Beta.2 RE-1 — release engineering handover

**Date:** 23 November 2026
**Status:** Engineering implementation pushed for draft PR review; not merged, accepted, published or deployed
**Application candidate:** `d1a478d584dc402df4d6d225a2fa797959f657d5`
**Accepted pre-release `main`:** `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`
**Proposed branch:** `codex/atlas-bus-beta2-release-re1-20261123`
**Recorded exact-SHA runs:** [45151585144](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45151585144) on `0a17aa4d96c2f89dd50019172fe3535f4b382f2c`; [45152190372](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45152190372) and [45152199952](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45152199952) on `fe9db7924ec5ce16c88c92ec43ecfe9a39f727e7`
**Draft PR:** [#56](https://github.com/joerfreeman02/transport-planner-toolkit/pull/56)

## Outcome and release gate

RE-1 adds an application/data release identity contract, a manually authorized app-only Pages workflow, a shared Pages concurrency group, a refresh guard that resolves the currently published app commit before it may acquire or publish data, exact-SHA hosted validation, and retirement of the older combined Beta.1 publication workflow. The data refresh now reconstructs the site from the pinned app commit and regenerates the identity after a data publication while asserting that application version, build and commit remain unchanged.

This is implementation, isolated artifact reconstruction and local acceptance verification. The production app-only workflow has not been run, no Pages artifact has been uploaded for this branch, and no deployment has occurred. **The release gate remains blocked.** A read-only fetch of current public Pages metadata found the Beta.1 version/build and published data-source configuration, but no `atlas-release-identity.json`; therefore the deployed application commit cannot be proven. Its configuration publication is `40340530395-108d898221f84c78c061db4f81335dcd911d6a0e`. Public Bus/TNDS manifests match the frozen Run #75 raw manifest bytes, while the live iBus manifest/index differ from Run #75. The data-refresh workflow consequently fails closed before acquisition on the missing identity, and the Beta.2 app-only workflow refuses the iBus mismatch. The exact hosted 135-response TfL replay artifact identity is also still required by the app-only release workflow.

## Branch and change scope

The starting candidate checkout was clean at `d1a478d584dc402df4d6d225a2fa797959f657d5`. Local `main` and `origin/main` both resolved to `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. Existing candidate, Beta.1, recovery and regression worktrees were preserved. The RE-1 branch is pushed, and PR #56 remains draft. Its scoped checkpoints include `1855b089a19d3cf47cc0ea33622a3523e21c676d` (implementation), `ba5f22d146c95c950c869c7fd367ac0251ef65aa` (runner pin), `821b2ebbb36e139e4a9b49d9725bb3053244fbdb` (hash-mismatch diagnostics), and subsequent handover updates. Neither main nor production was changed.

Changes are limited to release identities, app/data assembly and workflow controls, tests and handover/ADR documentation. No Bus service matching, route grouping, operator choice, boarding, frequency, calendars, circular routes, stop selection, Sources & Checks, Word/A3 content, or Run #75 data files were changed. No CSS/HTML shell refactor was made. The app's committed `2.0.0-beta.1` release record remains intact; Beta.2 identity is generated only in an explicitly authorized deployment artifact.

## Release design

The generated `atlas-release-identity-v1` records the application version/build/commit and the normalized data-source configuration, Bus/TNDS manifests, iBus manifest/index and data currentness. App-only assembly reconstructs a Pages site from an exact app checkout and deployment roots, copies the current published Bus/TNDS configuration and status plus iBus files from the snapshot, omits local Bus/TNDS payload directories from the resulting artifact, and records a deterministic file-tree SHA-256. A private/diagnostic-path and credential-pattern audit runs before the artifact can be used.

The app-only workflow requires a manual dispatch on `main`, an exact main-reachable app commit, the Product Owner authorization boolean, the immutable Run #75 artifact ID/digest and the exact hosted 135-response TfL capture artifact identity. It performs deterministic, static-index, Browser/Word/A3 and replay validation before uploading and deploying. It verifies live application and data identities after deployment. It has not been executed.

Both app-only release and scheduled data refresh use the same `atlas-bus-pages` concurrency group with cancellation disabled. Data refresh now reads the live release identity and checks live configuration and manifest hashes, checks that its app commit is present in `main`, checks out that exact app tree, and fails before refresh/acquisition when identity is missing or inconsistent. After a validated data update it regenerates the data side of the release identity and asserts that app SHA/version/build did not change. Existing weekly schedule and updater acquisition logic were not removed or run. The legacy combined frozen Beta.1 publication path now refuses dispatch and cannot deploy.

The workflow still relies on the GitHub Pages environment review/approval configuration. Repository rulesets were previously empty, but the branch-protection endpoint was unavailable to the GitHub connection (403); protection must not be assumed. Verify environment reviewers and repository rules before any production integration.

## Version and data identity

Proposed version: `2.0.0-beta.2`
Proposed build naming: `ATLAS-2.0.0-beta.2-YYYYMMDD`
No deployed or accepted Beta.2 designation is claimed.

The app-only workflow requires current published Bus/TNDS and iBus identities to match immutable Run #75 before it will assemble a Beta.2 artifact. Frozen source values recorded for Run #75 are Bus manifest `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f`, TNDS manifest `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`, iBus manifest `3090e1da6da21878725d0b30343757bd32c65fcdd56d9fdecb6f6ae6c75b5d53`, and iBus index `39b0eae384ec7a44115f898b940b3f35213577195706d38a82fa97707d2610de`. They were not reacquired or modified in RE-1.

On 23 November 2026, a read-only fetch of public Pages returned the current data-source configuration SHA-256 `ab80aa4e5edc1bc32116905f223aa76cb81701694901bdcf63013817c0c8d57d`, Bus manifest `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f`, and active TNDS manifest `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f` (the same active-root bytes across the five configured roots). Live iBus is different: manifest `fe13f40eff9c260c2a426017ff2166539641d261a3332f0e752132ec2f1f432f` and index `5efcf64bfe1e158ecac52a8df8609984600b90ddd9b1b25b5112de7f6e24ebc1`. Therefore the app-only release correctly stops rather than relabelling the live TfL data as Run #75. The live `atlas-release.json` has Beta.1 version/build but no source SHA. A prior hosted C4 run [40225101540](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/40225101540) has an audit artifact, but its `manual-product-acceptance.json` contains no replay responses and cannot satisfy the 135-response capture requirement.

## Tests and verification

| Check | Result |
|---|---|
| App/data release artifact fixture dry run: exact app commit, generated version/build, config preservation, no local Bus/TNDS payload, identity hashes, artifact-tree digest, wrong-SHA and wrong-data fail-closed cases | Passed (`node tests/atlas/app-data-release.test.mjs`) |
| Static release-workflow contract test | Passed (`node tests/atlas/app-data-release-workflow-contract.test.mjs`) |
| JavaScript syntax checks for release-identity and refresh identity scripts | Passed |
| `git diff --check` | Passed |
| Full deterministic Node suite | Passed (`pnpm test:atlas`) against the immutable Run #75 candidate roots from the preserved `atlas-beta2-final-verification` worktree, with test temp output confined to this RE-1 worktree. The headless browser harness required terminal-only localhost access. |
| Python static-index suite | Not executed locally; only the Windows Store Python shim is present and cannot start. Hosted validation has not reached the Python step. |
| Local 16-control Browser/Word/A3 audit | Passed headlessly against immutable Run #75 roots: 16 controls, zero recorded audit failures. Report: `tmp/audit-re1/acceptance-report.json`. The missing separately published status manifest is explicitly noted; the audit supplied 204 No Content for that independent endpoint. |
| Recorded 135-response TfL replay | Passed in the same local audit: 135 matched responses, zero misses, zero unused responses; capture SHA-256 `9882a2057578b2d659a8522f90753ebedabcc012fd72c60e4547a82223ea4e7b`. Expected captured TfL HTTP 400 evidence remained scoped in Sources & Checks. The hosted artifact ID/digest is still required for hosted release validation. |
| Full Python preparation suite and Run #42 lineage | Not rerun. `39e142767946aa31ecf0f87544e6d7491ca90297` is not an ancestor of this candidate. The Technical Director's provisional exception is preserved; no assertion or history was changed. A checkpoint rehearsal remains required for future data-lineage work. |
| App-only Pages deployment | Not executed |
| Data-refresh downgrade rehearsal | Fixture contract only; no live updater run |
| Beta.1 rollback rehearsal | Accepted-baseline artifact reconstruction passed in isolated `tmp/beta1-rollback-live-config-dry-run/pages-artifact` from exact `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`, using the fetched live source configuration, public Bus/TNDS manifests, live iBus manifest/index and status manifest. Artifact-tree digest: `0bc19576f4d42adc162808deb205758f90bca68e4f694e25de34f7ede3cecc0a`. This proves non-production reconstruction, but rollback is **not fully verified** because the current published app has no commit identity and the rebuilt app was not deployed or exercised against all external payloads. |

The exact-SHA GitHub Actions runs on `fe9db7924ec5ce16c88c92ec43ecfe9a39f727e7` were [push run 45152190372](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45152190372) and [PR run 45152199952](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45152199952); both reproduce the exact iBus manifest failure first diagnosed in [45149612441](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45149612441). Runner setup, Chromium installation, exact source SHA, immutable Run #75 artifact metadata/digest/producer, artifact restoration and review-checkpoint provenance all pass. Bus and TNDS match Run #75 (`1195f19…` and `2cc49b4…`), but the archived candidate iBus manifest is `14b416823cb648c869750db90939bac33a027f2f91485322f08c2d9c4394914f`, not the separately verified Run #75 manifest `3090e1da…`. This `14b416…` root is documented in the hardening record as a mixed mount whose declared iBus index hash (`39b0ea…`) differs from its mounted Linux index (`5efcf6…`); the hosted check stops at the manifest check, so it does not separately report the archived index's hash. The run therefore stops before Node, Python, app/data fixture and 16-control tests; those hosted steps are skipped, not passed. Frozen expected hashes were deliberately not weakened. The current GitHub-hosted Run #75 candidate artifact cannot be accepted as a coherent iBus input. The two earlier runs [45146376229](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45146376229) and [45146486298](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45146486298) failed at Chromium setup on Ubuntu 26.04; workflows are now pinned to `ubuntu-24.04`. Drawing Generator [PR run 45152199874](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45152199874) passed deterministic and Browser/PDF checks on the same `fe9db...` source.

## Rollback and remaining blockers

The accepted pre-release source is `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`, whose committed identity is Beta.1 (`ATLAS-2.0.0-beta.1-20261025`). The older Beta.1 tag at `108d898...` is not substituted for this accepted source. Read-only retrieval of current public release metadata captured the published source configuration and lightweight Bus/TNDS/iBus/status manifests. An isolated artifact reconstruction from the accepted baseline and those live dependencies passed, with the tree digest above. The live application SHA remains unknown because its release record has no commit field or generated identity; the reconstructed artifact has not been deployed or exercised against the complete external payloads. Thus the **non-production reconstruction rehearsal passed, but end-to-end rollback remains unverified** and is a release blocker.

Additional release prerequisites:

1. Produce or restore a coherent, immutable Run #75 GitHub artifact whose iBus manifest and index bytes match a verified pair, without refreshing or altering national data; then rerun exact-SHA hosted Node, Python static-index, Run #75 16-control Browser/Word/A3, service-parity and acknowledgement checks. The currently pinned Run #75 archive is internally mixed (`14b416…` manifest with `5efcf6…` index), so the hosted gate fails closed before those steps.
2. Supply and validate a hosted immutable 135-response TfL capture artifact (producer run, artifact ID, digest, content count).
3. Resolve the current public iBus-vs-Run #75 identity mismatch and bootstrap a verifiable live application commit identity before any updater run or Beta.2 publication.
4. Verify the currently deployed application commit and rehearse restoration with complete external data payload availability; the accepted-baseline reconstruction alone is not end-to-end rollback proof.
5. Confirm the Python 310/311 historical exception disposition with the Technical Director and keep the 310/311 result visible.
6. Verify Pages environment reviewers and repository policy; get Technical Director engineering approval, Product Owner acceptance of the exact application SHA, and separate explicit deployment authorization.
7. After any approved deployment, perform live smoke checks and record the deployed application/data identity. No such action is authorized by RE-1.

Professional source limitations remain: Route 24 terminal boarding role, Route 231 Saturday source/calendar discrepancy, Route 16/16C endpoints/terminal evidence, supplementary TfL exact-stop gaps, N555/555 uncertainty, frozen October Run #75 currentness and other documented provider discrepancies. Review them before professional reliance; this release preparation does not validate every timetable or make the updater operational.

## CSS/application-shell discovery

Stylesheet order in `atlas/index.html` remains EAS theme, Leaflet, `atlas-shell.css`, then `bus-beta-workspace.css`. The shell file defines global tokens/resets/layout and common header/navigation/About/module-card patterns. The Bus file redefines global variables and `body`, `button`, `main`, header, brand/navigation and focus rules as well as Bus workspace controls, so it currently depends on later cascade order. `app.mjs` combines shell view routing and the full Bus assessment/export workflow in one entry point. This is discovery only; no CSS or shell code changed. The proposed interface, risks, open decisions and staged migration are in [Draft ADR-016](../adr/ADR-016-atlas-module-shell-and-style-boundaries-draft.md).

## Tooling review

- **Dependabot:** configured weekly for npm and GitHub Actions, grouped by ecosystem.
- **Codecov:** deferred; consider after stable CI coverage output and a reviewed coverage baseline.
- **OpenSSF Scorecard:** deferred; consider after the public workflow permissions and branch/environment policy are reviewed.
- **Sentry:** deferred; consider only after internal telemetry, privacy and retention approval.
- **Renovate:** deferred in favour of the existing Dependabot configuration.

No tooling was installed or reconfigured.

## RE-1-C1 correction — 23 November 2026

This addendum records the final release-engineering correction on top of the draft PR. It does not accept Beta.2 or authorize a merge, tag, publication, updater run, or Pages deployment.

### Frozen regression source reconciliation

| Source | Identity/evidence | Disposition |
|---|---|---|
| Original Run #75 producer | Run `39430415441`, artifact `12275615359`, producer SHA `151199cc914c235870f444d26b03c2309edbd035`, ZIP digest `sha256:5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471` | Immutable parent preserved. Its original artifact identity is never relabelled. |
| Run #75 Bus/TNDS | Raw manifests `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f` and `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f` | Both match the original archive and remain the regression parent roots. |
| Run #75 mounted iBus | Manifest `14b416823cb648c869750db90939bac33a027f2f91485322f08c2d9c4394914f`; mounted index `5efcf64bfe1e158ecac52a8df8609984600b90ddd9b1b25b5112de7f6e24ebc1` | Mixed mount; rejected as a regression pair. CI checks these exact wrong bytes before using the separately identified fixture. |
| Retained historical iBus pair | C1 branch `codex/atlas-bus-tfl-ibus-calendar-stability`; source commit `649de0dfa3aff7250a37231dedbf201904ace038` added the pair; clean branch closeout `737f26a108deba5f6fb22dac00bce02af4f87e6b`. Commit Git blobs: manifest `75de0b549b1c65ccd1a34b2bdad6b9bdb3c2be0b`, index `90e88205a5b37f20cc82eddcb98b49ebedb32929`. The retained Windows source checkout has `core.autocrlf=true`; its clean checkout materializes JSON as CRLF. Those exact raw working-tree bytes hash to manifest `3090e1da6da21878725d0b30343757bd32c65fcdd56d9fdecb6f6ae6c75b5d53` and index `39b0eae384ec7a44115f898b940b3f35213577195706d38a82fa97707d2610de`, which is the manifest-declared pair. | The exact clean Windows checkout bytes were reconstructed into `tests/atlas/fixtures/run75-ibus-20261009/`; `.gitattributes` uses `-text` so hosted Linux checkout preserves those bytes. The fixture does not claim LF-normalized Git blob bytes as dataset identity. Manifest declaration, index bytes, base version `20261009`, and validity interval 8 October–5 November 2026 agree. Six patterns cover service line 313. No data was downloaded or refreshed. |
| Current public iBus capture (read-only, 23 Nov) | Manifest `fe13f40eff9c260c2a426017ff2166539641d261a3332f0e752132ec2f1f432f`; index `5efcf64bfe1e158ecac52a8df8609984600b90ddd9b1b25b5112de7f6e24ebc1` | A distinct live publication. Raw HTTP bytes were hashed during this correction: manifest declaration equals the index SHA; manifest/index base version and validity dates agree. The live pair is coherent and is not treated as corrupt merely because it differs from frozen Run #75. |

`tests/atlas/fixtures/run75-ibus-20261009/provenance.json` binds the supplemental fixture to the original Run #75 artifact identity, the historical Git commit/blob IDs, the clean Windows checkout and its `core.autocrlf=true` materialization. The CI workflow is configured to upload this small iBus fixture as a new immutable GitHub Actions artifact and record its run, artifact ID, name, digest, and source SHA. That artifact is a supplemental overlay; it does not replace or alter the 2.5 GB Run #75 archive. The composite audit keeps the original Bus/TNDS parent and overlays only the byte-verified iBus pair after original checkpoint validation.

### Corrected release boundary

- `tools/atlas-release/reviewed-beta2-files.json` is an exact reviewed-path manifest anchored to accepted main `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. It includes the approved workflow/release-engineering files and rejects any unlisted path; directory-prefix allowlisting is removed.
- App-only release validation installs dependencies, runs deterministic and Browser/Word/A3 tests, and assembles the artifact from the same exact `application_commit_sha` checkout. The assembled release identity is checked against that SHA before Pages artifact upload.
- Frozen Run #75 fixture identity is independent of live data approval. Current live configuration, status, Bus/TNDS/iBus manifests and index are internally verified, then represented by a separate normalized identity digest. Dispatch requires an explicit `approved_live_data_identity_sha256`; app-only assembly rechecks that digest against the exact files copied into the candidate. A later approved data snapshot is therefore supported without weakening integrity checks or forcing equality to the older test fixture.
- Proposed [ADR-017](../adr/ADR-017-atlas-app-and-data-release-boundary.md) records this two-contract release boundary and awaits Technical Director approval. ADR-016 is unchanged.
- The exact release-validation workflow checks out the PR head SHA, not GitHub's synthetic pull-request merge commit. The optional TfL replay path is no longer optional for a complete gate: exact artifact ID/run/digest and all 135 entries are required, otherwise the workflow ends failed with the replay marked not executed. The 16-control browser audit only runs when that capture is supplied, preventing a fallback to live TfL acquisition.

### Local verification and remaining hosted gates

| Check | RE-1-C1 result |
|---|---|
| Recovered iBus raw-byte/internal consistency | Passed: exact `3090e1da…` manifest and `39b0eae…` index; mixed `14b416…`/`5efcf6…` pair rejected by regression test. |
| Focused release-boundary test | Passed: coherent/mixed iBus, exact allowlist acceptance/rejection, approved later live identity, unapproved identity rejection. |
| App/data assembly and workflow contract tests | Passed after the C1 changes. |
| Full deterministic Node suite | Passed locally against preserved Run #75 Bus/TNDS roots and the recovered coherent iBus pair (`ATLAS Alpha.15 deterministic suite passed`). Local temporary outputs were directed into this worktree. |
| Python static-index suite | Not executed locally: only the Windows Store `python.exe` shim is available and fails to start. Hosted Ubuntu Python remains required. |
| Full 16-control Browser/Word/A3 plus captured TfL replay | Not executed in this correction. The retained exact 135-response file matches content digest `9882a2057578b2d659a8522f90753ebedabcc012fd72c60e4547a82223ea4e7b`, but includes assessment-coordinate request URLs and a workstation-specific candidate path in capture metadata. It was not published to this public repository's workflow artifacts. A privacy-safe exact fixture or authorized private artifact channel is required; no replacement responses were generated. |
| App-only artifact rehearsal | Workflow corrected and deterministic fixture dry run remains passed. The final current-live-data rehearsal is incomplete until a live identity digest is explicitly approved and the exact application SHA is selected. No Pages upload/deploy occurred. |
| Data-refresh downgrade protection | Prior code/contract fixtures remain; no national updater or publication was run. End-to-end post-patch rehearsal remains incomplete. |
| Beta.1 rollback | Not verified end to end. Accepted-main reconstruction digest `0bc19576f4d42adc162808deb205758f90bca68e4f694e25de34f7ede3cecc0a` is not a deployed package proof. Live Beta.1 app commit and complete historical package/payload restoration remain unproven. |
| Branch/environment policy | Public repository rulesets query returned `[]`; the GitHub App cannot read main branch protection (403 `Resource not accessible by integration`) or Pages environment reviewer settings. Do not assume protection; a repository administrator must verify these manually before release. |

### Hard-gate disposition

This correction resolves the iBus fixture, bounded path allowlist, exact selected-checkout test/assembly, and frozen-vs-live identity design defects. It does **not** produce full hosted exact-SHA acceptance because the exact TfL capture cannot safely be placed in public artifacts. Hosted Python, the 16-control Browser/Word/A3 audit, and 135-response replay therefore remain incomplete.

The legacy Beta.1 application SHA is now established from its authoritative publication record, rather than inferred from the public version string: successful Pages workflow run [40340530395](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/40340530395) ran from accepted main `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`; its frozen publisher checked out and verified `application/` at `108d898221f84c78c061db4f81335dcd911d6a0e`, then assembled `pages-site/` by copying that checkout with the separately verified Run #75 Bus/TNDS and status roots. The deploy job succeeded and named Pages artifact `12662622302`, Pages build version `8f1d8ae…`; `verify-live` confirmed Beta.1 version/build and the data publication version `40340530395-108d898…`. The publisher's later temporary edits were runner-only, after the Pages tree was assembled; they did not change the assembled app. This establishes the deployed application source from workflow/run evidence even though the public release JSON lacks a commit field.

The Pages artifact was not retained in the Actions artifact collection (`40340530395` lists no downloadable Actions artifacts), so the exact deployed ZIP/package bytes cannot be restored. A reproducible recovery baseline is therefore: application source `108d898…`; the exact published data configuration/publication version `40340530395-108d898…`; and read-only fetched live Bus/TNDS/iBus/status roots with their individually verified identities. Rebuild and inspect this baseline in isolation, compare runtime assets and references, then obtain explicit Technical Director and Product Owner approval before any production restoration. Existing accepted-main reconstruction digest `0bc19576…` is not a substitute for that run-specific package rehearsal. End-to-end rollback remains incomplete and blocks release readiness.

The branch must remain a draft; Technical Director review can assess the correction, but Product Owner release approval is **not ready** and production remains unchanged.

## Next work and acceptance

Next independent work is the authorized automatic-updater/data-lineage workstream only after Beta.2 is accepted and deployed. It must preserve the app pin and rehearse Run #42 lineage on its intended producer branch. CSS modularisation is a separate future sprint after the Beta.2 application is released and frozen.

The RE-1 branch and draft PR #56 are ready for Technical Director review as an engineering proposal, with the hosted artifact inconsistency clearly recorded. Product Owner release acceptance is **not ready** while the immutable iBus artifact is unresolved, hosted validations are incomplete, live identity reconciliation is outstanding and rollback proof is incomplete. Do not merge, tag, release, deploy, publish, refresh data or operate the updater from this handover.
