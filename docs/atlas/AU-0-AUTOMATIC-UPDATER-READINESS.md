# ATLAS Automatic Updater — AU-0 Readiness and Architecture Discovery

**Audit date:** 24 November 2026  
**Repository:** `joerfreeman02/transport-planner-toolkit`  
**Discovery branch:** `codex/atlas-auto-updater-au0-20261124`  
**Audit base:** `12b2c1425cdf61ba997e9206ce6ffb078f3859a9`  
**Accepted `main`:** `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`  
**Scope:** read-only readiness investigation, safe offline checks, and this document. No production refresh, data download, publication, application change, or release action was performed.

## Executive finding

ATLAS already has substantial refresh, preparation, validation, checkpoint, publication, activation, and rollback machinery. It is **partially reusable**, but the currently configured production refresh is blocked before acquisition: the production preflight requires exactly three roots in each TNDS bank while the live layout has five roots in active bank B and three in rollback bank A. Hosted refresh runs also reach a deterministic test that cannot import `playwright`. A separate app-only release workflow invokes the national publication preflight and therefore crosses the intended application/data boundary.

The latest retained publication is not a production-eligible replacement: its manifest says `diagnosticOnly: true`, `productionEligible: false`, was generated 20 October 2026, and its iBus pair has `validTo` 5 November 2026. A new, authorized production acquisition and publication is still needed for a current production-eligible dataset. AU-0 did not run it.

The shortest safe path is to reconcile the TNDS root-count contract with the deployed topology, make the test runner dependencies explicit, isolate app-only validation from publication credentials, and then exercise the existing candidate/checkpoint/publication flow against controlled fixtures. Only after that should a separately approved production run acquire and validate new data. Preserve the two-bank inactive-write / validate / activate / rollback design; do not consolidate repositories or rebuild the application to update data.

## Baseline and method

The local branch was created at the exact requested candidate. At audit time its `HEAD` was `12b2c1425cdf61ba997e9206ce6ffb078f3859a9`, matching the requested base; `main` and `origin/main` both resolved to `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`. The discovery worktree was clean before this report was added. The candidate, accepted main, production data, release branch, and PR #56 were not changed.

The investigation read the current refresh and app-only workflows, source acquisition/preparation and publication tools, recovery handovers, ADRs, release-preparation records, data manifests, GitHub Actions history, and source documentation. Targeted Node tests were run with temporary files redirected inside this worktree. No complete source archive was downloaded and no live updater or publication workflow was started.

## Data source register

| Dependency | Authority and acquisition in this repository | Access, licence, update cadence | Current checks and failure handling | AU-0 capability finding |
|---|---|---|---|---|
| **BODS national timetables** | DfT Bus Open Data Service public regional GTFS bulk downloads. The prepared-data builder uses `https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/{region}/` for nine regions; see `tools/atlas-bus-data/build_static_index.py` and [source provenance](SOURCE-PROVENANCE.md). | The selected bulk-download endpoint needs no BODS API key. BODS timetable data is published under the Open Government Licence (OGL); the DfT download-all listing describes daily data. | ZIP/archive and required GTFS files are validated; archives and aggregates are hashed; GTFS calendars and exceptions are evaluated for service days; invalid or empty inputs fail preparation. Existing refresh candidate gates prevent an incomplete candidate from reaching activation. | **Automated acquisition and preparation exist.** The endpoint does not consistently expose a reliable change validator, so HEAD/ETag alone must not suppress a scheduled download. A weekly full check is a reasonable MVP; daily source availability does not imply daily national redeployment. |
| **TNDS supplementary timetables** | Traveline National Dataset regional ZIP packages from the configured TNDS FTP service, currently `ftp://ftp.tnds.basemap.co.uk/TNDSV2.5/`; accepted regions are EA, EM, NE, NW, SE, SW, WM, and Y. Existing acquisition and preparation include `update-atlas-bus-data.mjs`, Python source acquisition, and `prepare_tnds.mjs`. | Registered FTP access uses `TNDS_USERNAME` / `TNDS_PASSWORD`; credentials must remain in Actions secrets. Traveline describes overnight updates Monday–Thursday and weekly regional supply. Dataset terms identify OGL; source coverage and validity are not uniform. | Region set and archive structure, file size/freshness metadata where available, hashes, XML preparation, service calendars, and expected output manifests are checked. Retries are bounded; partial archives are not trusted. A missing/invalid required region must fail the complete candidate; retain current active data. | **Automated acquisition and preparation exist, but production route is blocked by bank configuration/preflight drift.** FTP MDTM/size may help identify changes, but must not replace archive integrity/hash validation. Some cross-boundary duplication, regional omissions, and source validity differences remain source limitations. |
| **NaPTAN stop identities and locations** | DfT NaPTAN API / downloads. Existing workflow uses the API; V2 obtains XML (`https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=xml`) to retain locality relationships; older preparation also supports CSV. | Public API; no key is required by the configured path. NaPTAN data is OGL and the catalogue advertises daily updates. | Parsed identities, coordinates, localities and source hashes/counts are recorded. Candidate manifests bind the prepared stop data to a particular snapshot. | **Automated acquisition and preparation exist.** Keep NaPTAN’s own freshness marker and provenance separate from timetable freshness. Do not silently use a stale stop snapshot as current. |
| **NPTG locality geography** | DfT NaPTAN/NPTG API has NPTG endpoints, including XML `/v1/nptg` and CSV `/v1/nptg/localities`. | Public API; no key required for the documented read path; OGL. | Preparation code contains V2 parsing support, but the deployed reference config currently has `datasets.nptg: null`; the prepared national snapshot currently reports no published NPTG dataset. | **Not production-published.** API availability and parser support do not make it part of current production. Decide whether NPTG is a required updater output; implement and validate an independently versioned dataset before claiming it is live. |
| **TfL iBus static schedule/operator data** | TfL’s static iBus documentation describes versioned zipped XML on S3, grouped by operator. The repository contains `tools/atlas-review/build-tfl-ibus-operator-index.py` to build an index from a locally supplied archive, but no official automated archive discovery/download, authorization, or base-version selection procedure. | TfL publishes open data under OGL; the exact S3 access/process and authorized source version for this product are not established by the repository. Do not invent a credential or assume the public API is a substitute for the static archive. | Published pair is versioned and validity-bound. The retained pair had `validTo=2026-11-05`, now expired. Existing application warnings can expose stale/unavailable evidence; update must not mark it valid by changing dates alone. | **Preparation exists; acquisition is not demonstrated end-to-end.** This is a production freshness blocker for London coverage until an authorized, repeatable source procedure is documented and a fresh pair is prepared/validated. |
| **TfL Unified API live evidence** | Application makes live TfL StopPoint/timetable requests for its defined London authority/fallback cases; see [source provenance](SOURCE-PROVENANCE.md) and the TfL API documentation. It is not acquired by the national updater. | Public API/open data. Official API documentation describes app id/key registration; no embedded key was found for the existing anonymous path. Rate limits/availability must be treated as runtime dependencies. TfL data is OGL. | Requests are source-attributed and checked at assessment time; actual returned StopPoint records govern TfL authority. Failures/absence must retain provenance and warnings, not fabricate a schedule. | **Runtime live source, not a static updater feed.** Monitor separately. Keep the approved authority hierarchy: national NaPTAN/BODS/TNDS remain primary outside applicable TfL StopPoint evidence; TfL evidence supplements or follows explicitly documented fallback rules. |
| **Other runtime dependencies** | Nominatim for user-requested address search; OpenStreetMap/OSRM for routed access; map tiles/Leaflet for mapping; Node/pnpm and Python for preparation; Playwright/Chromium for browser checks. | Public-service terms, rate limits, availability, and attribution apply. Do not bulk geocode or route as part of a national data refresh. | Existing source-specific timeout/error and fallback behavior should remain visible. Browser runner must be installed as a locked CI dependency. | These are not national timetable datasets and should not be coupled to publication rotation. Nominatim and OSRM are live runtime services; map tiles are presentation infrastructure. |

Official references: [NaPTAN/NPTG API](https://naptan.api.dft.gov.uk/swagger/index.html), [NaPTAN](https://naptan.dft.gov.uk/), [NaPTAN catalogue](https://ckan.publishing.service.gov.uk/dataset/naptan), [DfT BODS guidance](https://www.gov.uk/guidance/find-and-use-bus-open-data), [BODS download-all timetable dataset](https://findtransportdata.dft.gov.uk/dataset/bus-open-data---download-all-timetable-data--18335fb19c4), [Traveline developer area](https://www.traveline.info/developer-area), [Traveline data reporting](https://www.travelinedata.org.uk/traveline-open-data/data-reporting), [TNDS dataset listing](https://www.data.gov.uk/dataset/0447f8d9-8f1b-4a68-bbc8-246981d02256/traveline-national-dataset), [TfL Unified API](https://push-api.tfl.gov.uk/), [TfL static iBus documentation](https://ibus.data.tfl.gov.uk/ibus-static-data-documentation.pdf), [TfL open data](https://tfl.gov.uk/info-for/open-data-users).

## Storage and publication topology

The currently deployed data configuration reports Bus `slot-b` active and TNDS bank B active, with bank A retained as rollback. All TNDS roots publish from a `pages-publish` branch and are resolved through the data-source config’s path map. The current live configuration was generated at `2026-10-20T13:28:46Z`, publication version `40340530395-108d898221f84c78c061db4f81335dcd911d6a0e`; it is diagnostic-only and not production-eligible. Its manifest is a captured snapshot, not evidence that the source remains current.

| Repository / purpose | Root or region | Current bank role | Reported GitHub repository size (KiB) |
|---|---|---|---:|
| `atlas-bus-data` | Bus static prepared data; bounded `slot-a` / `slot-b` | Bus slot B active | 218,911 |
| `atlas-tnds-b1` | SW | TNDS B active | 409,015 |
| `atlas-tnds-b2` | SE | TNDS B active | 472,780 |
| `atlas-tnds-b3` | EA, NW | TNDS B active | 457,627 |
| `atlas-tnds-b4` | NE, WM | TNDS B active | 424,445 |
| `atlas-tnds-b5` | EM, Y | TNDS B active | 569,502 |
| `atlas-tnds-a1` | SW, EA, WM | TNDS A rollback | 596,177 |
| `atlas-tnds-a2` | SE, NE | TNDS A rollback | 539,150 |
| `atlas-tnds-a3` | EM, NW, Y | TNDS A rollback | 561,879 |

The GitHub sizes are API-reported repository sizes observed during this audit, not measurements of Pages-served payload or a provider-guaranteed quota. The cached source manifest reports active B root payload sizes of 837,963,706 bytes (B1), 759,843,001 (B2), 681,417,533 (B3), 603,576,322 (B4), and 809,714,155 (B5). These are below the operational 900,000,000-byte per-root budget, but B5 is close enough that every new candidate must be measured before publication. The same snapshot lists 4,275 / 3,085 / 2,355 / 1,884 / 2,575 shards respectively. The A-bank regional split differs and remains a separate rollback snapshot. Manifests bind shard paths, roots, sizes, checksums, region allocations, and versions.

The established publication design is sound and should be preserved:

1. Acquire and prepare a complete candidate without modifying the active publication.
2. Allocate whole regions/shards deterministically across roots; each root contains one snapshot, not an active plus a candidate copy. Validate the 900,000,000-byte operational ceiling, including metadata, and the individual blob safety ceiling (95 MiB).
3. Publish to the inactive Bus slot / TNDS bank only. Wait for every root/site, then verify complete manifests, routes, version, checksums, URLs, and capacity.
4. Only after every candidate root is verified, activate the new configuration pointer. The previous complete routing configuration is retained as last-known-good (LKG).
5. On any acquisition, preparation, capacity, publication, or remote validation failure, keep the current pointer and active bank unchanged. Roll back by restoring the complete prior Bus slot and TNDS path map, not by rebuilding data.

GitHub’s [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) include a 1 GB published-site limit and a recommended 1 GB source repository; [repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits) include a 100 MB individual-file ceiling and a 2 GB single-push limit. These external limits are separate from ATLAS’s stricter operating budgets. Keep shards and roots; do not consolidate. Capacity preflight must measure the *candidate* and preserve enough margin for metadata and future changes.

**Topology drift:** historical handovers define two TNDS banks with three roots each as the initial/approved topology. Live publication now has five B roots and three A roots so the active footprint can be partitioned. The preflight still requires exactly three roots in both banks. This is an implementation/configuration mismatch, not justification to remove B4/B5 or silently rewrite the banks. Reconcile and document the exact IDs and path maps, then make root count data-driven while requiring the expected two distinct banks, unique root identities, valid repository contracts, non-overlapping roots, safe active/inactive separation, and measured capacity. A missing or duplicated configured root must fail closed.

## Existing updater and workflow capability

The scheduled workflow is `.github/workflows/atlas-bus-data-refresh.yml`; it runs Mondays at 05:37 UTC and also supports explicit dispatch, freshness bypass, measure-only, V1/V2 selection, exact checkpoint restore, and review-candidate composition/restoration modes. It serializes with the shared `atlas-bus-pages` non-cancelling concurrency group. This is useful protection against competing Bus-data publication, but app-only release should not depend on the same national publication gate.

Reusable parts include source acquisition, deterministic preparation, freshness decisions, source manifests and hashes, candidate validation, capacity allocation, explicit recovery checkpoints, remote-site checks, inactive-bank publication, delayed config activation, LKG restoration, diagnostic-only V2 path, and strict branch/workflow selectors. Checkpoint restore validates producer run/artifact identity, digest, provenance, freshness, and payload integrity. The cache checkpoint contains a verified candidate; it is not a permanent raw-source archive, can be evicted, and a missing checkpoint requires an explicit re-acquisition/rebuild rather than assuming cache persistence.

The existing implementation also has clear limits:

- V1 is the legacy publication-capable path but is not automatically the right source-precedence/product solution. V2 has improved large-TNDS XML handling and diagnostic candidate support, but current V2 status is explicitly non-production and does not itself establish a releasable dataset.
- Current prepared config has NPTG null, and there is no proven iBus acquisition. Do not call a candidate complete/current for London while the required static iBus pair is expired.
- A weekly freshness guard is present, but the current Monday schedule may run before the usual Monday–Thursday TNDS source updates have completed. A Friday window after the latest overnight source arrival is a better first schedule, subject to observing actual feed arrival and making the run timezone explicit.
- BODS publishes daily and NaPTAN updates frequently, but neither fact requires complete national acquisition every day. Begin with a weekly deterministic candidate. Optimize for changed-only acquisition only after source validators are proven reliable; the BODS bulk endpoint has no dependable unchanged signal in the observed implementation.
- The workflow’s root-count failure blocks before acquisition/publication. Even after that is corrected, the newest real data must complete all validation and receive an explicit production eligibility decision.

## Action history and failure analysis

GitHub Actions history was reviewed for refresh run `43880555641` and later scheduled attempts. The exact run `43880555641` (16 November) restored the exact candidate checkpoint and passed its freshness job, then its production preflight failed with `TNDS bank B must contain exactly three roots.` Acquisition/publication did not proceed. Its later deterministic suite invoked `tests/atlas/tnds-runtime-shard-browser.test.mjs` and failed because `playwright` was not installed (`Cannot find module 'playwright'`). The later 23 November run `45215867838` repeated both failures. The 9 November, 2 November, and 26 October schedule runs are also failed refresh attempts in the history. The repeated failure is evidence that the contract and runner setup have not yet been reconciled, not evidence of a bad dataset or of a partially published update.

**Failure root causes and dispositions**

| Finding | Evidence | Consequence / smallest correction |
|---|---|---|
| TNDS topology validator is stale | `tools/atlas-data-publication/preflight-publication.mjs` rejects any bank whose `roots.length !== 3`; the current workflow variable and deployed map have active B1–B5 and rollback A1–A3. Failed hosted runs report “TNDS bank B must contain exactly three roots.” | Correct the schema/preflight and associated capacity/allocator contracts to validate the configured topology rather than a hard-coded count. Keep the active/rollback repository IDs and complete route maps unchanged. Add tests for 5/3 and malformed/duplicate root cases. |
| Browser test dependency is not installed in the hosted refresh runner | Hosted run test output reports missing `playwright` from `tests/atlas/tnds-runtime-shard-browser.test.mjs`. | Pin/install the existing Playwright package and browser runtime in the deterministic CI setup, or explicitly split browser tests into a properly provisioned job while keeping them required before eligibility. Do not weaken or skip the test. |
| App-only workflow crosses data-publishing boundary | `.github/workflows/atlas-app-only-release.yml` runs `tools/atlas-data-publication/preflight-publication.mjs`; that CLI requires national repository, site, bank JSON, and `ATLAS_REFERENCE_DATA_TOKEN`, while app-only intent is to release a pinned application independently. | Replace that dependency with a narrow read-only identity/integrity check for the captured data config/manifests and exact data digest. App-only must never acquire data, rotate banks, or need a publication token. Add a test proving absence of national publication secrets does not prevent app-only release. |
| Retained candidate is not eligible/current | Manifest generated 20 October; `diagnosticOnly=true`, `productionEligible=false`; iBus pair validity ended 5 November. | No claim of current production readiness. Obtain a fresh fully validated source snapshot, resolve iBus acquisition, and pass the separate production gate before activation. |
| Run #42 is exceptional lineage | Historical recovery records identify Run #42/310/311 as a lineage exception; current checkpoint rules otherwise bind producer run, commit, artifact ID/digest and workflow. | Preserve the documented exception and explicit provenance check. Do not generalize it as permission to resume arbitrary historical or mismatched checkpoints. |

The later run history confirms production acquisition and publication were skipped after the preflight failure, so these failed attempts did not alter national data. This AU-0 review did not start a refresh. GitHub workflow logs are run-specific and should be retained alongside any future successful eligibility decision.

## Application/data independence (ADR-017)

The approved direction is that data-only publication must preserve the approved app commit, version, and build, while app-only publication must not require data acquisition, bank rotation, or publication credentials. The current app-only workflow is pinned to a candidate and its app/data artifact identity and has application checks/approvals, but its invocation of the national publication preflight is a boundary defect. It should validate that the selected app references the expected unchanged data identity using read-only manifests and a captured digest. It must not invoke a validator whose contract requires write-capable national publication credentials.

Data publication remains serialized with `atlas-bus-pages` and should continue to activate only through a complete verified config pointer. App-only and data-only jobs may share deployment infrastructure only if both preserve independent identities and neither can accidentally overwrite the other’s payload. Continue pinning the application SHA/build into data candidates and verify that those values remain byte-for-byte unchanged after a data update. Keep diagnostic-only and production eligibility statuses distinct; only a protected, explicitly authorized `main` workflow may activate production data. No GitHub settings or protection rules were changed by AU-0.

## Proposed updater target (not an approved implementation)

**Minimum viable updater**

1. Run a weekly scheduled source check after the TNDS overnight update window (proposed Friday 05:37 UTC, conditional on observing provider arrival; retain manual dispatch for controlled recovery).
2. Capture source URLs/regions, retrieved times, source-reported timestamps/validators, byte counts, hashes, licenses/attribution, and exact tool/app identity in an immutable candidate manifest. Never log credentials.
3. Acquire each required national source using bounded retries and resumable local temporary files; validate archive format and checksum before replacing candidate inputs. Keep a failed/partial candidate isolated. Full source download is acceptable for MVP when no reliable change validator exists; do not treat an absent ETag as “unchanged.”
4. Prepare deterministically with locked Node/Python dependencies, fixed locale/timezone, and a recorded configuration. Bind each generated dataset to its own source snapshot and schema; publish NPTG only after Product Owner confirms it is a required output and tests its config wiring.
5. Run freshness, completeness, source-precedence, schema compatibility, representative route/stop, timetable calendar, manifest/hash, shard/path-map, root-count, per-root/blob, repository/Pages and browser-runtime gates. Report source warning/uncertainty counts; fail closed for a missing required feed or expired required iBus data.
6. Produce a candidate report first. The first successful post-fix production acquisition should remain measure-only/diagnostic until a separately approved production publication gate is opened. Do not let schedule alone grant production eligibility.
7. For approved activation, publish to inactive Bus slot/TNDS bank; verify every external root and file by manifest/hash; atomically switch the data config pointer only after complete verification; record the previous pointer as LKG. Keep application SHA/version/build pinned.
8. If any step fails, leave the active pointer untouched, expose the last successful source check and dataset effective date in Sources & Checks, and emit a concise step-specific failure plus run/checkpoint identity. Recovery is explicit retry or verified exact checkpoint restore; never auto-promote a partial cache or silently downgrade sources.

**Later improvements:** change-only regional TNDS retrieval after FTP validators are proven; BODS source-change detection if the provider offers stable validators; stale-data alerts independent of publication; automated comparison of source calendars and route coverage; safe staged eligibility review; bounded retention of raw acquisition artifacts in an approved durable store. These are not needed to unblock the first safe candidate and should not expand Friday’s scope.

## AU-0 offline verification

No end-to-end refresh, network data acquisition, production workflow, deployment, or browser/desktop interaction was run.

| Check | Result |
|---|---|
| `tests/atlas/publication-preflight.test.mjs` | **Passed** in the grouped run (3 of 4 tests passed in that group). |
| `tests/atlas/refresh-freshness.test.mjs` | **Passed**; Friday window, malformed/stale metadata, no-op, and force-refresh decisions covered. |
| `tests/atlas/automated-refresh-contract.test.mjs` | **Passed** in the grouped run (same group as above). |
| `tests/atlas/app-data-release.test.mjs` | **Passed**; isolated fixture dry run. |
| `tests/atlas/atlas-candidate-checkpoint.test.mjs` | **Passed** when temp storage was confined to the worktree; checkpoint provenance/integrity coverage reported. Initial attempt against sandbox-managed OS temp failed with `EPERM` during atomic rename. |
| `tests/atlas/review-candidate-checkpoint.test.mjs` | **Passed**. |
| `tests/atlas/publication-lifecycle.integration.test.mjs` | **Blocked by local Windows sandbox/runtime** after test fixture creation: bundled Git’s `sh.exe` failed `NtCreateDirectoryObject ... 0xC0000022` while trying to read a local fixture remote. It is not a test assertion failure. The hosted production lifecycle remains to be exercised in a supported runner. |
| Existing hosted refresh deterministic suite | **Failed** on runs 43880555641 and 45215867838 because Playwright was unavailable to `tnds-runtime-shard-browser.test.mjs`. |
| Python preparation/unit tests | Not run: this workstation resolves `python` to the Windows Store shim and has no `py` launcher. No Python environment was installed or changed. |

The initial tests ran with default Windows sandbox temp paths, where filesystem writes/atomic rename were denied. Re-running with test temp storage inside the writable worktree resolved the checkpoint test’s temp failure. This scoped diagnostic cleanup removed only the two AU-0 test directories it created. No application files or input datasets were written by the tests.

## Friday half-day implementation roadmap (proposed, about four hours)

| Time | Work | Required exit evidence |
|---:|---|---|
| 0:00–0:30 | Reconfirm exact candidate, live bank map and workflow variable identities; obtain a Product Owner/Technical Director decision on the five-root/three-root current topology and confirm source attribution/required dataset list. | Dated topology/source decision; active and rollback maps agree across config, workflow, and every repo. No secrets copied into logs. |
| 0:30–1:30 | Narrowly fix root-count schema/preflight and capacity planning to accept configured 5/3 topology while enforcing two banks, unique roots, expected identities, complete region/shard assignment, and limits. Add allocator/preflight fixtures for current and invalid maps. | Relevant preflight, allocator, capacity, and publication-contract tests pass; malformed map fails closed. |
| 1:30–2:00 | Provision the existing locked Playwright dependency/browser in the refresh test job (or a required dedicated browser job). | Re-run the exact failing browser test locally/CI; hosted deterministic suite is green without skips. |
| 2:00–2:30 | Isolate app-only release validation from national publication preflight; add test with no national publication token/variables. | App-only fixture validates app/data digests and exact app SHA without a publication secret or data write. |
| 2:30–3:30 | Exercise acquisition-to-candidate and checkpoint/publication lifecycle with deterministic fixtures/fake remotes only: interrupted download, bad digest, missing root, over-capacity shard, remote propagation delay, and failure before config activation. | Failure tests prove active config is unchanged; success fixture proves all roots validate before activation; explicit checkpoint recovery remains bound to exact producer. |
| 3:30–4:00 | Review manifests, source warnings, rollback pointer, logs, and runbook; record the exact authorized command and stop before live production publication. | Signed-off implementation evidence and separate production run request; no data publication during R&D. |

**First implementation sprint:** root topology/preflight plus CI browser runtime; app-only boundary correction is a small parallel/next change because it is independently release-impacting. Do not combine this with product route/timetable changes, a V2 redesign, repository consolidation, or a data refresh. Expected effort is four focused engineering hours for the first safe candidate gate, excluding any new iBus acquisition mechanism or production approvals.

**After Friday:** a separate authorized production run is needed to acquire fresh BODS/NaPTAN/TNDS, resolve and refresh iBus if required, prepare all configured datasets, and collect complete capacity/remote validation evidence. Only then can the Technical Director decide production eligibility and the Product Owner authorize activation. Do not schedule recurring production activation until one manual production run and one rollback rehearsal meet the gates.

## Decisions and approvals still required

**Proposed, not approved by AU-0:**

- Keep the existing Bus slot and two-bank TNDS model; accept the current five-root B / three-root A topology as data-driven configuration, subject to identity and capacity validation.
- Start with weekly national acquisition, preferably Friday after the final usual TNDS overnight update, and keep forced/manual recovery explicit.
- Treat fresh iBus as required for the London product scope; document the official archive source, access, base version, and operator mapping before calling the candidate production-ready.
- Keep NPTG absent from production until product requirements decide whether it is required and its complete publish/read path is validated.
- Require explicit eligibility review for the first fresh candidate; do not equate successful tests or a scheduled workflow with approval to publish.

**Approvals/inputs before production activation:**

1. Technical Director confirms the exact bank/root topology, map, per-root limit, and application/data separation gate.
2. Product Owner confirms source coverage, attribution, NPTG scope, London/iBus requirement, and acceptable freshness warning language.
3. Authorized source owner provides or confirms the iBus static archive access/version procedure; no credential is included in documentation.
4. Data owner approves a fresh national acquisition and the candidate eligibility review; release approver separately authorizes activation.
5. GitHub administrators confirm required actions variables/secrets and protected production workflow permissions without exposing token values.

## GitHub tooling adoption review

| Tool | AU-0 position | Recommendation |
|---|---|---|
| Dependabot | Already configured per the release handover. | Retain; review security alerts and lockfile updates as part of normal dependency maintenance. |
| Codecov | Deferred; not required to discover the updater blockers. | Keep deferred until the team chooses coverage thresholds and reporting ownership. No installation/configuration change. |
| OpenSSF Scorecard | Deferred. | Consider a read-only scorecard review later; no workflow or branch setting change in AU-0. |
| Sentry | Deferred. | Not a prerequisite for a static data updater; consider only with an owned incident/privacy plan. |
| Renovate | Deferred in favour of Dependabot. | Do not add a second dependency bot. |

## Final state

- Documentation-only AU-0 work is on the requested separate branch, based on `12b2c1425cdf61ba997e9206ce6ffb078f3859a9`.
- Beta.2 candidate, `main`, accepted production application, national datasets, and PR #56 were left unchanged.
- No source data was refreshed or downloaded, no production workflow was started, and no data was published or deployed.
- No Computer Use or visible desktop/browser interaction was performed.

