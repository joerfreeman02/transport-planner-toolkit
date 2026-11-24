# ATLAS Automatic Updater AU-1 — Infrastructure Handover

**Date:** 24 November 2026  
**Starting checkpoint:** `bf497b953a848525b67b646798cc48858680a200`  
**Branch:** `codex/atlas-auto-updater-au1-20261124`  
**Implementation checkpoint:** `355b735daaaeb0850e8869e414955b5e7f9ced03` (parent `bf497b953a848525b67b646798cc48858680a200`).  
**Exact-SHA hosted validation:** [Run 45430128275](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45430128275) passed for `355b735daaaeb0850e8869e414955b5e7f9ced03`. The documentation closeout commit is validated again by the branch workflow on its exact pushed SHA.

## Scope and protection boundaries

AU-1 implements the approved updater infrastructure corrections only. It does not change Bus assessment behavior, production version/build metadata, national source data, AU-0, Beta.2, PR #56, or `main`. The new exact-SHA workflow is branch-scoped, read-only, and does not use credentials, acquire national sources, publish data, or deploy Pages. The Product Owner's restriction on desktop and visible-browser interaction was observed; no Computer Use was performed.

## TNDS topology validation

The publication preflight now accepts three to eight roots per bank while requiring exactly two distinct banks, explicit IDs in the A1–A8/B1–B8 form, unique root/repository/site identities, valid Pages contracts, region assignments on every root, and complete once-only coverage of EA, EM, NE, NW, SE, SW, WM, and Y in each bank. The deployed active root list must match the configured active bank by ID and URL. Candidate roots may not overlap the active roots/sites. Publication measurement and allocation require configured inactive-bank root IDs; there is no silent three-root fallback.

The retained topology is B active (five roots) and A rollback (three roots). The operational ceiling remains 900,000,000 bytes per root; individual files retain the stricter 95 MiB safety limit. Run #42's historical Python 3.10/3.11 producer-lineage exception and assertion/history are not changed.

## Capacity evidence and recommendation

The retained source manifest measures active B payloads at 3,692,514,717 bytes total: B1/SW 837,963,706; B2/SE 759,843,001; B3/EA+NW 681,417,533; B4/NE+WM 603,576,322; B5/EM+Y 809,714,155. Regional compressed payloads are SW 824,113,726; SE 745,993,021; NW 578,996,887; WM 462,356,640; Y 422,940,328; EM 372,923,847; NE 127,369,702; EA 88,570,666 bytes. Whole-region placement and shared manifest/metadata overhead make the largest current root 837,963,706 bytes, leaving 62,036,294 bytes (6.89%) under the local ceiling.

Three inactive roots provide at most 2,700,000,000 bytes and cannot hold a comparable 3.69 GB snapshot. Four roots are also insufficient: total data alone averages over the 900 MB per-root ceiling, before indivisible-region and metadata constraints. Five roots are the measured minimum practical count for this retained snapshot, with a deterministic whole-region allocation that fits; this does **not** guarantee future headroom. The SW region alone is 824,113,726 bytes before shared files/metadata, so adding roots cannot split that indivisible region under the current allocator. A future candidate must be fully measured and must fail before any write if a root, blob, aggregate/site or publication check fails.

**Recommendation for administrator review:** provision inactive A to five roots before a comparable rotation, following the active B grouping (A1 SW, A2 SE, A3 EA+NW, A4 NE+WM, A5 EM+Y), then measure actual candidate bytes and repository/Pages state. Do not create repositories or modify settings as part of AU-1. Expansion to five is a measured minimum, not an approved infrastructure change or a reliability guarantee. Repository API size is historical metadata, not a substitute for measuring Pages payload or Git history. GitHub documents a 1 GB Pages published-site limit, a 1 GB recommended source-repository size, a 100 MB individual-file hard limit, and a 2 GiB single-push limit; the ATLAS 900 MB / 95 MiB controls are stricter operating gates. See [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits), and [the 2 GiB push limit](https://docs.github.com/en/get-started/using-git/troubleshooting-the-2-gb-push-limit).

## Hosted refresh test runtime

The refresh workflow's validation job uses Ubuntu 24.04, Python 3.11, Node 22, pnpm 10, the frozen lockfile, and the project's locked Playwright dependency with Chromium installed through `playwright install --with-deps chromium`. Browser tests remain enabled. The reviewed failed runs [43880555641](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/43880555641) and [45215867838](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45215867838) both failed in `tnds-runtime-shard-browser.test.mjs` with `Cannot find module 'playwright'`; the primary refresh steps were blocked before acquisition. A separate `.github/workflows/atlas-au1-validation.yml` runs only after a push to this AU-1 branch, checks out exactly `github.sha`, grants `actions: read` and `contents: read`, restores and verifies the exact Run #75 artifact plus coherent frozen iBus overlay, installs the locked runtime, then runs the deterministic ATLAS suite, offline publication/recovery checks, and static-index Python test. It contains no national credentials or acquisition/publication/deployment action. Run [45430128275](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45430128275) passed every hosted step on exact SHA `355b735daaaeb0850e8869e414955b5e7f9ced03`, including Python 3.11 and Chromium setup.

## Application-only release and production gate

The application-only release workflow no longer invokes the national publication preflight or regenerates national-data configuration from app source. It fetches the current published configuration, status and manifests read-only, then runs `app-only-data-preflight.mjs` against the exact approved application SHA and explicitly supplied live-data identity digest. The guard checks config JSON/module parity, production eligibility flags, freshness, Bus/TNDS/NPTG/iBus manifest/index identity and internal payload-index totals, complete TNDS path-to-root coverage, compatibility of published references, and bounded read-only HEAD availability checks. Missing/ambiguous eligibility or NPTG evidence fails closed. National credentials, source acquisition, bank rotation, and data writes are not used by this preflight. App-only artifact identity now preserves the NPTG manifest digest too. [ADR-017](../adr/ADR-017-atlas-app-and-data-release-boundary.md) is recorded as approved in accordance with the AU-1 Technical Director authorization.

The retained deployment snapshot remains explicitly diagnostic-only, not production eligible, and its iBus validity ended 5 November 2026; NPTG is not configured in its source config. AU-1 does not override those facts. Therefore the new production gate should block current production release until a new independently authorized eligible snapshot, configured/published NPTG evidence, and valid iBus data are supplied.

## Lifecycle and recovery verification

Topology/preflight tests cover valid five/three banks, duplicate IDs/repositories/sites, incomplete/duplicated region assignments, active-root mismatch, and inactive-bank selection. Capacity tests use the retained source-measurement fixture and verify three- and four-root failure plus deterministic five-root fit and headroom. Existing publication sequencing and checkpoint/recovery machinery remains unchanged.

The full deterministic Node suite passed locally (`pnpm test:atlas`) against the existing immutable Run #75 Bus, TNDS, and coherent frozen iBus regression data in the preserved `atlas-run75-regression` worktree. The synthetic publication lifecycle passed locally with temporary Git remotes in the authorized headless terminal session. The Windows Store Python shim cannot start, so Python was not run locally; hosted Python validation remains required. No lifecycle test invokes acquisition or publication against live data.

| Verification | Result |
|---|---|
| `atlas-data-publication.test.mjs` | Passed: deterministic allocation, historical Run #22 three-root case, retained five-root minimum, three/four-root capacity failure, 95 MiB blob guard and 900 MB root guard. |
| `publication-preflight.test.mjs` | Passed: five/three topology, region completeness, active root/region mismatch, duplicate identities, and fail-closed publication contracts. |
| App/data release and app-only preflight tests | Passed: explicit live identity, NPTG identity preservation, missing evidence, stale/ineligible status, JSON/module mismatch, HTTP unavailability, and approval mismatch. |
| Candidate checkpoint and Recovery-0F.2 tests | Passed, including exact producer/provenance and explicit cross-run restore checks. |
| `publication-lifecycle.integration.test.mjs` | Passed locally with isolated temporary Git remotes: activation only after complete verification, stale-aware bank rotation, and failed candidate leaves the active bank unchanged. |
| Full `pnpm test:atlas` | Passed locally against immutable Run #75 roots: `ATLAS Alpha.15 deterministic suite passed`. |
| Python static-index test | Hosted Ubuntu Python 3.11 passed in Run 45430128275; local Python 3.11 is unavailable. |
| Exact-SHA GitHub-hosted validation | Passed: [Run 45430128275](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45430128275), exact source SHA `355b735daaaeb0850e8869e414955b5e7f9ced03`; immutable Run #75, full Node suite, focused lifecycle/recovery/release checks, and Python all passed. |

**First AU-1 checkpoint:** `355b735daaaeb0850e8869e414955b5e7f9ced03`; exact-SHA hosted validation passed. The subsequent handover-only commit is revalidated by the same branch-scoped workflow.

## Source limitations and outstanding release blockers

- NPTG is intended in scope but the retained live config has `datasets.nptg: null`; full integration, publication, and validation remain dependencies.
- Fresh TfL static iBus acquisition is not demonstrated as repeatable/authorized; the existing pair is expired. TfL Unified API runtime queries remain separate and do not replace the static pair.
- The retained 20 October snapshot is diagnostic-only and not production eligible. No updater refresh or data publication occurred in AU-1.
- The production V1/V2 preparation-path choice remains for an evidence-based separate gate; do not infer production readiness from a passing synthetic lifecycle.
- Rollback readiness depends on preserving the complete previous Bus slot, TNDS root path map and verified data identity through a real, separately approved hosted cycle.
- The Run #42 Python 310/311 lineage exception remains unresolved for the actual preparation pipeline; retain the original producer-lineage reconciliation as a gate.

## Friday four-hour R&D preparation

1. Confirm provider/repository capacity evidence and obtain authorization for A-bank root provisioning; this requires repository administration and cannot be completed by local engineering alone.
2. Establish a repeatable permitted iBus acquisition source/version and freshness validation; provider documentation/access may be required.
3. Complete NPTG integration and its independently versioned manifest/config/tests.
4. Compare V1 and V2 preparation using frozen and source-authoritative evidence, including coverage, source precedence, calendars, performance, and compatibility; do not refresh national data during the comparison.
5. Draft a first fresh-data candidate protocol with explicit Product Owner/Technical Director approvals, candidate identity, pre-write capacity gates, rollback, and production-eligibility evidence.
6. A new data acquisition/publication, production run, or deployment remains a separate authorization; lengthy national preparation may exceed four hours.

## Tooling adoption review

| Tool | AU-1 disposition |
|---|---|
| Dependabot | Keep existing configuration; review grouped updates through normal CI. |
| Codecov | Deferred; no setup change. |
| OpenSSF Scorecard | Deferred; no setup change. |
| Sentry | Deferred; no setup change. |
| Renovate | Deferred in favor of Dependabot; no setup change. |

No tooling was installed or configured.
