# ATLAS Bus Beta.2 RE-1 — release engineering handover

**Date:** 23 November 2026
**Status:** Engineering implementation pushed for draft PR review; not merged, accepted, published or deployed
**Application candidate:** `d1a478d584dc402df4d6d225a2fa797959f657d5`
**Accepted pre-release `main`:** `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`
**Proposed branch:** `codex/atlas-bus-beta2-release-re1-20261123`
**Current RE-1 head:** `821b2ebbb36e139e4a9b49d9725bb3053244fbdb`
**Draft PR:** [#56](https://github.com/joerfreeman02/transport-planner-toolkit/pull/56)

## Outcome and release gate

RE-1 adds an application/data release identity contract, a manually authorized app-only Pages workflow, a shared Pages concurrency group, a refresh guard that resolves the currently published app commit before it may acquire or publish data, exact-SHA hosted validation, and retirement of the older combined Beta.1 publication workflow. The data refresh now reconstructs the site from the pinned app commit and regenerates the identity after a data publication while asserting that application version, build and commit remain unchanged.

This is implementation, isolated artifact reconstruction and local acceptance verification. The production app-only workflow has not been run, no Pages artifact has been uploaded for this branch, and no deployment has occurred. **The release gate remains blocked.** A read-only fetch of current public Pages metadata found the Beta.1 version/build and published data-source configuration, but no `atlas-release-identity.json`; therefore the deployed application commit cannot be proven. Its configuration publication is `40340530395-108d898221f84c78c061db4f81335dcd911d6a0e`. Public Bus/TNDS manifests match the frozen Run #75 raw manifest bytes, while the live iBus manifest/index differ from Run #75. The data-refresh workflow consequently fails closed before acquisition on the missing identity, and the Beta.2 app-only workflow refuses the iBus mismatch. The exact hosted 135-response TfL replay artifact identity is also still required by the app-only release workflow.

## Branch and change scope

The starting candidate checkout was clean at `d1a478d584dc402df4d6d225a2fa797959f657d5`. Local `main` and `origin/main` both resolved to `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. Existing candidate, Beta.1, recovery and regression worktrees were preserved. The RE-1 branch is pushed through `821b2ebbb36e139e4a9b49d9725bb3053244fbdb`; commits are `1855b089a19d3cf47cc0ea33622a3523e21c676d` (implementation), `ba5f22d146c95c950c869c7fd367ac0251ef65aa` (runner pin) and `821b2ebbb36e139e4a9b49d9725bb3053244fbdb` (hash-mismatch diagnostics). PR #56 remains draft. Neither main nor production was changed.

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

The exact-SHA GitHub Actions workflow ran on `821b2ebbb36e139e4a9b49d9725bb3053244fbdb` in [PR run 45149612441](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45149612441). Runner setup, Chromium installation, exact source SHA, immutable Run #75 artifact metadata/digest/producer, artifact restoration and review-checkpoint provenance all passed. The strengthened hash diagnostics then failed closed: Bus and TNDS matched Run #75 (`1195f19…` and `2cc49b4…`), but the archived candidate iBus manifest was `14b416823cb648c869750db90939bac33a027f2f91485322f08c2d9c4394914f`, not the separately verified Run #75 manifest `3090e1da…`. This `14b416…` root is already documented in the hardening record as a mixed mount whose declared iBus index hash (`39b0ea…`) differs from its mounted Linux index (`5efcf6…`); this hosted attempt stopped at the manifest check, so it did not separately report the archived index's hash. The run therefore stopped before Node, Python, app/data fixture and 16-control tests; those hosted steps are skipped, not passed. The frozen expected hashes were deliberately not weakened. The current GitHub-hosted Run #75 candidate artifact cannot be accepted as a coherent iBus input. The two earlier runs [45146376229](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45146376229) and [45146486298](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45146486298) failed at Chromium setup on Ubuntu 26.04; workflows are now pinned to `ubuntu-24.04`. The existing [Drawing Generator run 45149612468](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45149612468) passed deterministic and Browser/PDF checks after that correction.

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

## Next work and acceptance

Next independent work is the authorized automatic-updater/data-lineage workstream only after Beta.2 is accepted and deployed. It must preserve the app pin and rehearse Run #42 lineage on its intended producer branch. CSS modularisation is a separate future sprint after the Beta.2 application is released and frozen.

The RE-1 branch and draft PR #56 are ready for Technical Director review as an engineering proposal, with the hosted artifact inconsistency clearly recorded. Product Owner release acceptance is **not ready** while the immutable iBus artifact is unresolved, hosted validations are incomplete, live identity reconciliation is outstanding and rollback proof is incomplete. Do not merge, tag, release, deploy, publish, refresh data or operate the updater from this handover.
