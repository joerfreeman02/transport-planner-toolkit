# BUS-DATA-TRUST-1A-C1 — Reconciliation Contract Hardening Handover

**Recommendation:** TRUST-1A-C1 HARDENING PASSED — PRODUCT OWNER TNDS REMOTE DISPATCH REQUIRED

## Objective and boundary

C1 hardens the diagnostic BODS/TNDS reconciliation contract, performs maximum defensible forensics on the frozen primary unresolved-call evidence, and adds a manually dispatched GitHub Actions TNDS acquisition and preparation gate. This is an engineering handover for Technical Director review. No live TNDS acquisition, reconciliation, publication, deployment, planner activation, source-authority change, or version change occurred in this sprint.

| Item | Value |
|---|---|
| Repository | `joerfreeman02/transport-planner-toolkit` |
| Branch | `codex/atlas-bus-data-trust-1a-c1-reconciliation-contract-hardening` |
| Exact baseline | `d6d3364ce601c18f673d865b0f14f53b3060b450` |
| Version | `2.0.0-alpha.15` |
| Implementation commit (code/tests/workflow/forensics) | `28b5eb0d0d7317451f0f3e33fbeb3508c3069cc2` |
| Final handover commit | Documentation-only commit on top of the implementation commit; exact final branch SHA is reported in the completion response. |
| Remote execution | None in C1; the new workflow was not dispatched. |

The baseline was fetched and verified before edits. It was clean and exactly matched the named TRUST-1A commit. Work was performed on the requested new branch; `main` was not modified.

## Credential architecture

The existing GitHub Actions secret capability is preserved. The current reference-data diagnostic workflow maps `${{ secrets.TNDS_USERNAME }}` and `${{ secrets.TNDS_PASSWORD }}` into the metadata-only probe environment. The supplied programme brief also records successful authentication and the expected eight archives in Actions run #37. C1 did not read, request, copy, print, or commit secret values. Local credential absence is a local execution limitation only; it does not mean GitHub Actions lacks access.

The new workflow injects those same two GitHub secret expressions only into the acquisition step. Its driver suppresses captured TransXChange parser output and prints only an exception type on failure. Neither raw nor prepared evidence contains secret values. The quarantined source manifest carries source identity, hashes, byte counts, and validation facts only.

## Technical Director findings and corrections

### 1. State contract

`tools/atlas-bus-data/tnds_reconciliation.py` now centrally defines `State`: `CREDENTIALS_UNAVAILABLE`, `CREDENTIALS_AVAILABLE`, `SOURCE_ACQUIRED`, `ARCHIVE_VALIDATED`, `SEMANTIC_VALIDATED`, `NORMALIZATION_VALIDATED`, `COMPARATOR_VALIDATED`, and `COMPARATOR_UNAVAILABLE`. Unknown values fail closed. Credential availability does not validate evidence. A regional row only participates when its regional evidence manifest independently reaches `COMPARATOR_VALIDATED`.

### 2. Regional evidence validation

Each regional manifest must identify its expected region and acquisition, provide a 64-character archive SHA-256 and positive source byte count, and pass archive, semantic, normalization, and explicit comparator validation. Bare region-name arrays cannot establish completeness. The fixture helper creates explicitly marked synthetic manifests for tests. Unexpected, duplicate, missing, or unverified regions prevent a national-complete claim.

### 3. Partial-region behaviour

Regional validation is independent. With seven validated regions and Yorkshire unavailable, the scope is `PARTIAL`; the seven available regions still reconcile and Yorkshire primary rows are marked `COMPARATOR_UNAVAILABLE`. A national-complete result requires all eight regions to pass.

### 4. Cross-source identity

The ledger retains BODS and TNDS native identifiers separately, plus each prepared identifier and source evidence ID. Native `route_id`/`trip_id` and TNDS `ServiceCode`/`Service@id` are not presumed equal. An explicit shared identity bridge or an exact shared native identifier can establish `EXACT_SHARED_IDENTITY`. Stop-scoped service/route/origin/destination/pattern evidence can only yield `STRONG_COMPOSITE_CANDIDATE`; it cannot be promoted to corroboration or agreement. Route number alone and a same-route/different-stop pair do not match. Multiplicity remains `AMBIGUOUS`.

### 5. Conflicts, uncertainty, and source windows

Identity corroboration is a separate field from semantic evidence agreement. A row includes comparable, agreeing, conflicting, and unknown attributes; raw native IDs; normalized stop IDs; regional state; and both sources' validity windows. Conflicting validity windows are categorized as `SOURCE_WINDOW_DIFFERENCE`. Conflicting operating days, school-day qualifiers, route/line, operator, origin, destination, or stop pattern remain visible as conflicts. Missing data and unresolved complex calendars remain unknown/not comparable. Unknown values cannot create agreement or conflict. All output rows are diagnostic and `plannerEligible: false`.

The comparator accepts normalized calendar evidence. It compares canonical weekday sets and known school-term qualifiers; it deliberately does not infer equivalence from unresolved complex calendars. Existing TransXChange and operating-profile parsers remain unchanged and continue to be covered by the Alpha.15 suite.

## Primary unresolved-call forensics

The exact frozen primary snapshot was available and verified read-only:

- Snapshot ID: `cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde`
- Source count: 11
- Total source bytes: 2,244,572,632
- State: `ACQUIRED / UNINTERPRETED / VERIFIED`
- Coverage ledger SHA-256: `aee79d3dd4a91b9c384021cd9c54989be89789e6e10a2aef467a55970c1c7731`

The new streaming tool verifies the snapshot manifest and source hashes, processes the C1 coverage ledger region by region, and joins every unresolved record to frozen `trips.txt`, `routes.txt`, `stops.txt`, and `agency.txt`. It does not change the snapshot or retain raw call rows in the repository.

Results: **4,908 unresolved scheduled-call identities** across all nine BODS regions, exactly matching the previously accepted total. All 4,908 GTFS trip and stop IDs joined; all 4,908 trip-to-route joins were consistent. The unresolved field is the NaPTAN `StopPoint` identity (`resolvedStopPointId` is null), so the 4,908 records are not evidence of 4,908 missing services. Highest regional counts are London 1,748, South East 1,519, North East 430, West Midlands 391, East Anglia 290, Yorkshire 192, East Midlands 162, North West 118, and South West 58. Operator and route summaries plus lineage counts are in the compact forensic artifact.

Artifact: `docs/atlas/BUS-DATA-TRUST-1A-C1-PRIMARY-UNRESOLVED-FORENSIC.json` (`atlas-primary-unresolved-forensic-v1`). Status is `PRIMARY_FORENSIC_LINEAGE_AVAILABLE`; the unavailable StopPoint mapping is explicitly counted rather than hidden. The detailed local candidate source path is not committed.

## TNDS acquisition gate

`.github/workflows/atlas-bus-tnds-trust-diagnostic.yml` is `workflow_dispatch` only, runs with `actions: read` and `contents: read`, and has no publish/deploy step. GitHub's artifact action uploads the quarantined evidence. It uses the existing secret expressions and invokes `tools/atlas-bus-data/tnds_trust_diagnostic.py`, which:

1. Calls the existing durable TNDS acquisition code into a run-specific quarantined snapshot.
2. Preserves the eight source archives and secret-free acquisition manifest as a 14-day quarantined artifact.
3. Safely extracts into isolated runner-temporary directories and runs existing TransXChange preparation.
4. Requires all eight regions and non-zero prepared regional service counts.
5. Uploads a separate 14-day, secret-free evidence artifact with the prepared manifest and counts.
6. Marks each comparator `COMPARATOR_UNAVAILABLE` and records `PRIMARY_INPUT_NOT_RESTORED`. Preparation is not reconciliation. No output can become planner-active.

The exact primary snapshot is not available in this workflow as a verified GitHub producer artifact, so this gate deliberately stops before cross-source reconciliation. The later remote run will establish acquisition/preparation evidence only; it will not itself establish BODS/TNDS agreement. No C1 Actions run was started and no remote result is claimed.

### Product Owner manual run

After Technical Director review:

1. Open **Actions → ATLAS quarantined TNDS trust diagnostic**.
2. Select branch `codex/atlas-bus-data-trust-1a-c1-reconciliation-contract-hardening`.
3. Select **Run workflow**. No secret or diagnostic input is required.
4. Preserve both artifacts and the run URL for review. The raw archive artifact is quarantined and expires after 14 days; the evidence artifact contains only secret-free manifests and prepared counts.

Do not treat this acquisition/preparation run as a reconciliation, planner activation, or authority decision.

## Controls retained

- **Pipers Lane:** PIPERS LANE — LIVE TNDS ACCEPTANCE CONTROL PENDING REMOTE TNDS RUN. The existing deterministic BODS route 230 control (`route_id` `118723`; service `south_east:118723:0:b7eada5524c4`; 34 ordered calls; first/last StopPoint `021024595`) remains the local control. No local TNDS fixture is represented as live evidence.
- **PE1:** Historic PE1 2TL remains distinct from Queensgate and retained as a historical/current-source planner control; C1 adds no TNDS finding for it.
- **Queensgate:** Queensgate 0590B remains the separate station-entrance/timetable-call regression control. Its existing C2 lineage and entrance semantics are unchanged.
- **TfL/iBus:** No TfL route, iBus evidence, authority selection, or source precedence was changed.
- **BCE/BST/0590B:** Dedicated stop identifiers remain preserved by diagnostic normalization; the prepared planner semantics and existing regression tests were not altered.
- **Planner/source authority:** No planner files, planner output, grouping, frequency, operating period, warning, Word export, browser output, fallback, or source-authority configuration changed.
- **Runtime/publication:** No TNDS runtime activation, national V2 publication, deployment, merge, PR, or version bump occurred. Version remains `2.0.0-alpha.15`.

## Tests and verification

- Python: `python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v` — **173 tests passed**.
- New reconciliation and workflow contract coverage includes the required state, regional completeness/partial availability, identity, semantic, calendar, conflict, forensic, secret-safety, manual workflow, and no-publication cases.
- Full Node suite: `node tests/atlas/run-all.mjs` — exact sentinel: **`ATLAS Alpha.15 deterministic suite passed.`**. The first sandboxed attempt was blocked at localhost; the permissioned rerun completed successfully.
- Remote TNDS execution: **not run**; no Actions dispatch was made.
- `git diff --check`: to be run after final edits and before commit.
- Final pushed branch SHA, remote parity, and clean status: reported in the completion response after push.

## GITHUB TOOLING ADOPTION REVIEW

| Tool | Repository review | C1 action |
|---|---|---|
| Dependabot | Already configured in the repository. | No change. |
| Codecov | No repository Codecov workflow/configuration was found. | No adoption; test coverage reporting was outside this diagnostic evidence sprint. |
| OpenSSF Scorecard | No Scorecard workflow/configuration was found. | No adoption or permissions change. |
| Sentry | No Sentry project/configuration was found; no runtime telemetry work was in scope. | No adoption or DSN added. |
| Renovate | No Renovate configuration was found; Dependabot already handles dependency update automation. | No duplicate updater installed. |

No tooling was installed or reconfigured.

## Remaining risks and next step

No live TNDS archive has yet been parsed on GitHub for this branch, so live service identity bridges, semantic conflicts, and Pipers acceptance remain unproven. The workflow also lacks the exact frozen primary snapshot artifact needed for an evidence-bearing comparison. After the manual acquisition run, review its artifacts, then provide a separately scoped task to attach/restore the exact primary evidence and run a bounded comparator against it. This handover does not begin TRUST-1B.
