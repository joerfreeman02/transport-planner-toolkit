# ATLAS Automatic Updater AU-3 — First Live-Source Candidate Handover

**Date:** 27 November 2026  
**Branch:** `codex/atlas-auto-updater-au3-20261127`  
**AU-2 parent:** `41fb11ec273de8f6de96f34cc5bea962f4ab409b`  
**Preserved Beta.2 application checkpoint:** `12b2c1425cdf61ba997e9206ce6ffb078f3859a9`  
**Frozen main:** `8f1d8ae50405ec4acf38dd66d6c8f60896a5649e`

## Executive handover and safety boundary

AU-3 acquires official current sources into immutable GitHub Actions artifacts, prepares a candidate in an isolated runner, and measures the prepared datasets against the proposed inactive five-root Bank A. It does not write national data repositories, activate or rotate a bank, alter production routing or rollback data, deploy Pages, merge or modify PR #56, or change the application version/build. Workflow token permissions are `actions: read` and `contents: read`; the candidate path contains no publication or Pages deployment job. Source credentials are passed only to acquisition steps and are not written to evidence.

The original AU-3 source run is [45980750752](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45980750752), on source commit `a88a56443e86c4e3ad35fef6d306c7a442181d71`. It retained the immutable primary and raw TNDS snapshots before preparation. The V2 preparation produced and validated the prepared data, then exposed a Beta identity parser that accepted only `alpha.N` although the unchanged app identifies as `2.0.0-beta.1`. Commit `edde72b1a4225eabbc484bf797c6613aefa2742a` corrected it to accept explicit `alpha.N` and `beta.N` while preserving exact version/build identity; tests reject mismatches. The corrected exact-SHA replay is [run 45986187809](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/45986187809). Its preflight, TfL inventory, and exact-SHA regression jobs passed. It restored the exact raw artifacts from run 45980750752 without reacquisition and completed V2 preparation, structural validation and the application/data identity gate. It then stopped at the current iBus source blocker below; no candidate checkpoint was created.

The source/data candidate uses the AU-2/AU-3 integrated runtime adapter from the exact checked-out feature commit, not a byte-identical copy of the preserved Beta.2 checkpoint `12b2c…`. The corrected run proved that version/build remain `2.0.0-beta.1` / `ATLAS-2.0.0-beta.1-20261025`, prepared data references the exact checked-out app commit, and candidate status remains review-only and ineligible for planner use, publication, and production.

## Storage, inactive Bank A, and preflight

The proposed inactive bank is:

| Root | Regions |
|---|---|
| A1 | SW |
| A2 | SE |
| A3 | EA, NW |
| A4 | NE, WM |
| A5 | EM, Y |

The active Bank B, its five roots, and rollback data remain unchanged. The successful hosted preflight in run 45980750752 verified all five proposed roots, live health/permission checks, complete eight-region coverage, and the active Bank B pointer. The same preflight passed again in run 45986187809. The full prepared candidate was not measured because the iBus index gate stopped first. Five roots are a measured minimum, not a guarantee of future capacity. Retain the 900,000,000-byte per-root and 95 MiB individual-file guards, whole-region assignment, complete region coverage, and capacity headroom.

## Live source inventory and immutable acquisition identities

### TfL iBus inventory

The official inventory-only builder completed on the live source without downloading archives. On 27 November 2026 it reported Base_Version `20261127`, `validFrom=2026-11-26T00:00:00`, `validTo=2026-12-22T00:00:00`, and 803 listed objects: 774 network objects totalling 11,879,487 bytes and 29 schedule archives totalling 121,554,921 bytes, 133,434,408 bytes combined. Inventory-mode `downloadedBytes` was zero. The candidate builder selects all official `Service_Line_No` values, rather than the six-pattern historical fixture, and downloads the 29 listed schedule archives once for the candidate. The exact inventory artifact is `15188758159`, `atlas-au3-ibus-source-inventory-a88a56443e86c4e3ad35fef6d306c7a442181d71`, digest `sha256:d4665d2d77b84d0ab5b93e2c07efbbc1006849bc9cea530aeeef748c86a3d1f8`.

### Primary source snapshot and TNDS quarantine

The initial live acquisition completed and both raw snapshots were uploaded before extraction/preparation:

| Source | Producer run | Artifact | Bytes | SHA-256 |
|---|---:|---|---:|---|
| Eleven-source primary snapshot (BODS, NaPTAN XML and NPTG XML source set) | `45980750752` | `15189771956` `atlas-reference-source-snapshot-45980750752` | 2,305,014,336 | `0ce5d2e363e1ac44786bc5f384a9f71f809940207bd7cb1e91dff8a9c5c1fe5c` |
| Raw eight-region TNDS quarantine | `45980750752` | `15191935225` `atlas-tnds-quarantined-45980750752` | 987,536,309 | `201c2b47e2ee8c817f48ddc21b843528e5d62f76c386659d2d0196b4c09e482d` |

The primary manifest identity is `b49e5c6a3ac71e9df5f48a10a0e05b8d09525472d820311942a658bf46301433`; the quarantined TNDS snapshot identity is `a90d80abc0f0cd66a3e917fdafa3564fd03e4f8e6e01a81e57fec78284ec7f61`. TNDS ZIP central-directory inspection found 15,196 members and 30,426,163,905 uncompressed bytes across eight regions (26.458:1 expansion). The compressed sources total 1,149,969,272 bytes; SW is the largest region at 6,714,957,976 uncompressed bytes. The runner had 88,760,963,072 free bytes against a conservative 24,516,068,672-byte requirement, preserving a 3 GiB reserve; capacity status was `CAPACITY_SUFFICIENT`, and extraction had not yet started at that gate.

The source manifest binds individual source identities, acquisition time, producer workflow/commit, sizes and SHA-256 values. The TNDS manifest remains quarantined, uninterpreted at acquisition, diagnostic-only, runtime-inactive, and production-ineligible. The corrected candidate workflow restores these exact artifacts by producer run, artifact ID and artifact digest rather than re-downloading them; it independently verifies restored payload hashes and the original source manifest identities. The review candidate adds those raw artifact identities to `review-source-provenance.json`.

Fresh-source validity is source-specific. It must not be collapsed into one universal freshness claim: iBus has the published validity window above; TNDS, BODS, NaPTAN and NPTG retain their own retrieval, source and validity evidence. Source-history comparisons to Run #75 are not software defects by themselves. Run #75 remains a frozen regression oracle and is not overwritten by these new sources.

## Preparation-path decision: V2 recommended for engineering candidate

V1 is the legacy production-capable preparation route. V2 is the appropriate path for this first source-complete engineering candidate because it reads authoritative NaPTAN XML with locality relationships and NPTG XML in addition to the BODS and TNDS sources. V2 is explicitly diagnostic/review-only here; successful preparation or tests do not make V2 production-ready. Production eligibility requires a separate documented gate for source precedence, calendar accuracy, national coverage, failure/freshness handling, Beta.2 compatibility, capacity, rollback and operational evidence.

The candidate invokes the existing deterministic refresh builder with `--prepared-schema v2 --review-only --acquisition-disabled`, passing only verified primary and quarantined TNDS snapshots. This keeps online acquisition separate from preparation and fails closed if either exact snapshot is absent. The complete official TfL iBus pair is a separate date-valid source overlay and must not remove the existing TfL Unified API runtime behavior.

**Run #42 lineage reconciliation:** the historical producer workflow was run `38699091568` from producer commit `fff57b57b47dba8eea76e32ebdfc0c53c0d0c092`. The producer code commit `39e142767946aa31ecf0f87544e6d7491ca90297` is an ancestor of this branch. The historical run evidence recorded CPython 3.14.8, notwithstanding stale documentation that described 3.10/3.11. The ancestry and Python-lineage tests were preserved; the AU-3 exact-SHA full hosted suite passed them with full Git history. No history was merged to satisfy the fixture and no assertion was weakened.

## Eligibility and freshness contract

The legacy refresh status could emit `plannerEligible: null`, while the guarded production contract requires explicit `true`. `finalize_candidate_eligibility.py` now derives eligibility only from its explicit completed-gate evidence; missing, malformed or partial evidence fails closed. Diagnostic/review candidates retain `plannerEligible: false`, `publicationEligible: false`, and `productionEligible: false`. AU-3 does not mark any candidate eligible for production.

The proposed eight-day age threshold and weekly acquisition interval are not substitutes for source validity dates. Freshness evaluation must consider each source’s own validity window and retrieval time, warn on stale data, and preserve the last known good dataset after a failed acquisition. A failed or incomplete run must not advance the active pointer. Run #75’s age and any source-specific age/validity remain visible, and no source date is fabricated to make it appear current.

## Candidate measurement and recovery

The prepared candidate is measured using the exact preflighted inactive Bank A assignment. Verify all required sources, eight TNDS regions, manifests, shard hashes, per-file sizes, complete shard allocation, 900 MB root limits, combined Bus/NPTG use, Pages/root totals, and recovery compatibility. Capacity measurement must include candidate outputs, shared manifests and the observed runner free disk after acquisition. If any root or file fails, stop before writes and retain the raw snapshots plus diagnostics for an explicit continuation.

The root assignment algorithm uses the configured whole-region placement; a future measurement must report combined Bus + NPTG values per root. It does not rebalance active Bank B. Raw inputs are preserved as immutable artifacts, but no full candidate checkpoint or candidate-capacity report exists for this run. Candidate construction has no write credential for national data repositories; later publication remains a separately approved workflow and operation.

## Regression and candidate validation record

Exact-SHA run `45986187809` on `edde72b1a4225eabbc484bf797c6613aefa2742a` passed:

- Full deterministic ATLAS Node suite against frozen Run #75, including existing Beta.2, NPTG runtime/publication, topology, allocation, lifecycle, rollback, browser, Word/export and acknowledgement controls.
- Full Bus preparation and publication Python suite on hosted Python 3.11, including the new Beta version-preservation and mismatch tests.
- TfL iBus source acquisition, cache and validity tests.
- Read-only five-root Bank A preflight and live official iBus inventory.

The corrected candidate replay passed V2 structural validation and source/application identity binding: version/build remained `2.0.0-beta.1` / `ATLAS-2.0.0-beta.1-20261025`, the data status bound the exact source SHA and workflow run, and review/diagnostic flags remained true while planner, publication and production eligibility remained false. The prepared structure was validated. The candidate then halted at the production iBus index builder before measurement, checkpointing or fresh-data application audits. Therefore no immutable full candidate was produced; candidate root capacity, saved-checkpoint integrity, fresh-data Browser/Word/A3 behavior and fresh-data acknowledgement/export checks remain unmeasured. Frozen Run #75 results remain a separate successful regression control, not evidence for those fresh-data gates.

The V2 preparation took about 73 minutes per replay. It reported 375,755 stops, 97,375 groups, 43,900 localities, 665 stop shards, 115 group shards, 3 locality shards and 480 service areas. The nine BODS operating regions contained 39,998 services. The first run stopped on the Beta metadata parser and created no candidate. The corrected replay reached the official iBus index build and stopped there; no candidate checkpoint was created.

### Current iBus stop-reference blocker

The live date-valid production index build in run 45986187809 fails closed because productive Pattern 5329 references `Stop_Point_Idx=25963` without a usable NaPTAN mapping. A separate read-only audit of the same official source pair ran in [workflow 46006475651](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/46006475651); the follow-up exact-record audit ran successfully in [workflow 46007611890](https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/46007611890) on `91cfac481e5ac3bfad59693e6b3b7b6bd016e270`. It passed classification tests and source traversal, covering all 693 official service lines, 2,729 productive patterns and 110,754 stop references. It found exactly one unresolved record: contract/service line `166`, productive pattern `5329`, sequence `52`, `Stop_Point_Idx=25963`. One matching `Stop_Point` record exists, but it has no `NaPTAN_Code` (`Stop_Point-record-has-no-NaPTAN_Code`). This is a current source-record omission, not an unmapped index caused by absence of a Stop_Point row.

The official source objects are `Pattern_data_166_20261127.zip` (3,734 bytes, SHA-256 `ec0c9536c2225dc179af1302bd5d5d3db46d4005dc2176c86fbc3fabb7e7c1e2`) and `Stop_Point_20261127.zip` (2,142,590 bytes, SHA-256 `f548fc97783ef62878288d791c6960e80267ad1ea92c640b0920e50e1da4d82b`). The refreshed report SHA-256 is `9751314679246f8eb8b5da338764677fa1770a4cfbd7cb4fafbb38bb41819787`; artifact `15202635356` has ZIP SHA-256 `14cc02028eab9df495a11f6a73b4ebfb4f48128f5c7927535edd755d7bfe500c`. The report contains object-level hashes for the full diagnosis set.

Commit `82513a3e413efbd71246e31b9929136d918c92e8` added the separate read-only source diagnosis and classification tests; `91cfac4` made it emit the exact finding and source-object hashes. This confirms a source-contract blocker: the official Stop_Point record lacks the NaPTAN code required by the current index contract. The production builder remains unchanged and fail-closed. No ID was invented, no pattern was discarded and no incomplete index was labelled complete. A resolution must come from corrected authoritative source data or a separately justified generic product contract; this run does not authorize either an inferred mapping or omission.

Local `git diff --check` passed. Local Python is unavailable because the Windows Store `python.exe` shim cannot start and `py` is not installed; Python results therefore come from the hosted Python 3.11 validation job. Exact hosted test evidence takes precedence for the listed Python suites.

## GitHub tooling adoption review

- **Dependabot:** keep the existing weekly npm and GitHub Actions configuration.
- **Codecov:** a coverage pilot may be useful, but requires a separate approval; no installation/configuration change in AU-3.
- **OpenSSF Scorecard:** defer to a separate governance/security review; no workflow added.
- **Sentry:** defer until privacy, retention, consent and data-controller decisions address precise location/address data.
- **Renovate:** defer in favour of the already configured Dependabot to avoid duplicate dependency automation.

No tooling was installed or configured.

## IET Engineering Understanding and Professional Competence

### How the updater works

The acquisition workflows fetch official source listings/data into run-scoped staging, validate source structure, atomically write files, and bind each payload to a manifest entry with source identity, timestamp, size and hash. Primary and TNDS snapshots are stored separately because they have different source contracts and trust states. V2 preparation consumes only those verified snapshots, emits application data and manifests into a fresh candidate tree, and never writes to the live national-data repositories. The candidate is measured and audited before a separately authorised publication can stage inactive roots, verify them, and only then activate a bank pointer.

### Why hashes and source manifests matter

An HTTP ETag or filename may help identify a changed object but does not prove the bytes restored later are the bytes originally acquired. SHA-256, byte size, producer run, exact artifact ID/digest, source URI and per-source manifest checks establish repeatable identity across a queued/recovered workflow. A manifest also exposes partial coverage and source age instead of allowing an incomplete snapshot to masquerade as national data. Immutable Run #75 and the fresh source artifacts answer different questions: regression stability versus current source acquisition.

### Application/data independence

The checked-out application tree and candidate data are created separately. Data preparation writes beneath `candidate-site/atlas/data`; a post-build gate compares the candidate and source release metadata byte-for-value and verifies status `version`, `build`, `repositoryCommit` and `workflowRun`. The current Beta.2 `version`/`build` remain unchanged. Candidate status flags must remain review-only and false for planner, publication and production eligibility. This demonstrates which app commit was used without changing the app version or implying Product Owner acceptance. The AU-2/AU-3 runtime adapter is disclosed as distinct from the original preserved Beta.2 checkpoint.

### Capacity, failure handling and alternatives

Whole-region placement avoids splitting one source region across multiple identities, simplifies integrity checking and preserves stable routing, at the cost of less even balancing. Fixed assignments are used for the inactive Bank A proposal and are measured after actual candidate construction. The 900 MB root and 95 MiB file safeguards are lower than hosting-provider limits and provide operational safety margin. Acquisition artifacts allow source reuse if a later build/test fails; no incomplete or ineligible candidate may be activated. Alternatives such as changed-only polling, dynamic region remapping, parallel transfers and publication from the same workflow were not adopted here because they would weaken reproducibility, complicate recovery or mix preparation and activation boundaries.

### Testing limits and learning

Hosted exact-SHA validation restores frozen Run #75 and runs the full deterministic suite plus all Python and iBus-source tests on the CI runtime. Fresh-candidate tests separately consume the actual acquired data and verify candidate identity/capacity. Historical source differences are not called application regressions without an independently justified product contract. Remaining limits include source calendars and completeness as published, upstream validity windows, potential unsupported data shapes, non-production diagnostic status, and any unperformed fresh-data Word/A3 or operator acceptance checks. The Product Owner authorised the scope, five-root proposal and prohibition on publication; AI-assisted implementation/test execution is not evidence of the Product Owner’s individual engineering competence or CPD.

### Knowledge-check questions

1. Why does a successful archive download not establish that a dataset is safe to activate?
2. Which identities must be compared to prove that an updater changed data but preserved the selected application?
3. What does an artifact digest establish that an ETag alone does not?
4. Why must the prior active-bank pointer remain unchanged if one candidate region fails validation?

### UK-SPEC A–E evidence mapping

| UK-SPEC area | Evidence in this work | Limit |
|---|---|---|
| A — Knowledge and understanding | Source precedence, immutable manifests, release identity, capacity and V1/V2 gate analysis. | This is implementation/research evidence, not a claim about the Product Owner’s assessed knowledge. |
| B — Design, development and solving engineering problems | Stable whole-region allocation, candidate-only workflow gates, exact artifact restore, Beta metadata parser correction and regression coverage. | Review-only candidate is not an approved production design. |
| C — Responsibility, management and leadership | Read-only credentials/permissions, preserved active Bank B and rollback data, explicit fail-closed eligibility and separation of acquisition/preparation/publication. | No production operation or operational ownership was exercised. |
| D — Communication and interpersonal skills | This handover, exact source and CI identities, limitations and knowledge checks. | Product Owner interpretation/acceptance remains separate. |
| E — Professional commitment | Fresh-source and privacy review, transparent unresolved limitations, and no unapproved tooling or publication. | No CPD hours, personal competence or professional registration are asserted. |

## Final AU-3 disposition

**AU-3 ENGINEERING —** partial; corrected candidate replay reached preparation but is blocked at the live iBus source contract  
**A4/A5 PROVISIONING —** verified by successful preflight  
**FIVE-ROOT REMOTE PREFLIGHT —** pass  
**FRESH IBUS INVENTORY —** pass  
**FRESH IBUS INDEX —** incomplete; current official Stop_Point row for line 166 / pattern 5329 / index 25963 has no NaPTAN_Code; builder correctly fails closed  
**PRODUCTION PREPARATION PATH —** V2 recommended for isolated engineering candidate; production readiness unresolved  
**RUN #42 LINEAGE —** reconciled; assertions preserved  
**ELIGIBILITY CONTRACT —** pass; diagnostic remains ineligible  
**FRESH NATIONAL CANDIDATE —** partial only; raw snapshots and prepared V2 data validated, but no full candidate checkpoint because iBus index is incomplete  
**CANDIDATE CAPACITY —** raw TNDS capacity gate passed; prepared-candidate Bank A capacity unmeasured  
**APPLICATION/DATA INDEPENDENCE —** demonstrated by corrected hosted candidate identity gate  
**BETA.2 REGRESSION —** pass on exact code SHA against Run #75  
**IET HANDOVER —** complete; source record and hashes identified, limitations and evidence boundaries documented  
**READY FOR CONTROLLED PUBLICATION REVIEW —** no, until candidate gates and independent review complete  
**MAIN AND PRODUCTION —** unchanged  

**STOP BEFORE PUBLICATION OR ACTIVATION.**
