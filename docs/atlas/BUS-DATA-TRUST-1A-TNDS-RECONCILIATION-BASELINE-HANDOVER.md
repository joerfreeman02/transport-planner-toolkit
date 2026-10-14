# BUS-DATA-TRUST-1A — TNDS Independent Reconciliation Baseline

## Recommendation

**TRUST-1A ENGINEERING PASSED — TNDS ACCESS/OWNER ACTION REQUIRED**

The offline, deterministic reconciliation capability and regression controls are implemented. The national comparison itself is not populated: TNDS acquisition remains blocked, so no TNDS agreement, discrepancy, or national reconciliation count is claimed. Obtain authorized non-interactive TNDS credentials and run the isolated acquisition/validation step before Technical Director review of national findings.

## Objective and identity

- Objective: establish an independent, traceable BODS/TNDS comparison ledger without changing planner results or source authority.
- Repository: `joerfreeman02/transport-planner-toolkit`.
- Branch: `codex/atlas-bus-data-trust-1a-tnds-reconciliation-baseline`.
- Exact baseline SHA: `19b6e9b13058b1d173b1f2c9f6f8b648773d04cb`.
- Final implementation SHA: `f327bfbd8b4c69445556662cb653c5bf4b009499`. The handover is a follow-up documentation commit; final branch HEAD and remote parity are reported in the completion record.
- Version: `2.0.0-alpha.15`; unchanged.
- Working-tree baseline: clean before edits. `git fetch origin` succeeded; local HEAD and recorded origin branch tip were both the exact required SHA, with no divergence.

## Files changed

- `tools/atlas-bus-data/tnds_reconciliation.py` — independent exact-key reconciliation, fail-closed regional coverage, date filtering, archive hashing/validation, deterministic ledger digest and diagnostic-only eligibility.
- `tools/atlas-bus-data/test_tnds_reconciliation.py` — 16 focused offline tests.
- `tests/atlas/tnds-transxchange.test.mjs` — truncated TransXChange input rejection assertion.
- `docs/atlas/BUS-DATA-TRUST-1A-TNDS-RECONCILIATION-BASELINE-HANDOVER.md` — this handover.

No planner adapter, display, source-selection, update, TfL, publication, version, or authority code was changed.

## Existing TNDS capability discovered

The baseline already contained:

- `tools/atlas-bus-data/tnds_capability_probe.py`: authenticated FTP metadata probe using `SIZE`/`MDTM`, with no archive retrieval.
- `tools/atlas-bus-data/refresh_bus_data.py`: eight-region TNDS archive acquisition, credential requirements, isolated transfer sessions and snapshot output.
- `tools/atlas-bus-data/prepare_tnds.mjs`: deterministic archive preparation, bounded XML materialization, service sharding and quarantine handling.
- `src/atlas/adapters/tnds-transxchange-adapter.mjs`: TransXChange 2.5 service, stop, journey, calendar and scheduled-call normalization.
- Existing TNDS parser, acquisition, preparation, coverage, scale, and remote capability tests.
- Historical BODS/TNDS planner integration in other product paths. That is existing baseline behavior and was not extended or changed by this sprint.

The new capability is a separate diagnostic ledger over normalized evidence rows. It requires a composite `(region, stop identity, service identity)` key. Route number is review metadata only and cannot cause a match. It emits `AGREEMENT`, `UNRESOLVED_PRIMARY_CORROBORATED`, `PRIMARY_ONLY`, `TNDS_ONLY_CANDIDATE`, `AMBIGUOUS`, or `COMPARATOR_UNAVAILABLE`. Every row has `plannerEligible: false`; the ledger records that planner output and source authority did not change. A deterministic `asOf` date filters current evidence inclusively. Duplicate exact identities remain visible as ambiguous.

## Access status and source snapshots

- Machine-readable TNDS status: `BLOCKED_CREDENTIALS`.
- Reason: neither `TNDS_USERNAME` nor `TNDS_PASSWORD` was safely present in the process environment. No credential extraction, GUI login, or authentication weakening was attempted.
- Expected TNDS regions: `EA`, `EM`, `NE`, `NW`, `SE`, `SW`, `WM`, `Y` (8).
- Actually available TNDS regions: none (0/8).
- Existing TNDS comparison snapshot: `data-snapshots/atlas-bus-data-acq-1-tnds-20261013/manifest.json`; it records zero completed sources, no snapshot ID, and `BLOCKED / CREDENTIALS REQUIRED / QUARANTINED`. It was read only.
- TNDS snapshot ID/hash/count/bytes: none; no TNDS archive was retrieved.
- Minimal owner action: provide authorized `TNDS_USERNAME` and `TNDS_PASSWORD` through the existing secure non-interactive environment, then run the existing acquisition into a newly named TNDS comparison snapshot. Validate all eight regions and review the secret-free manifest before running the national ledger. Do not put credentials into Git, documentation, command-line arguments, or evidence output.

The accepted primary evidence baseline is ACQ-1 snapshot `cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde`: 11 sources, 2,244,572,632 bytes. Strict verification completed successfully on 14 October 2026 and reported `ACQUIRED / UNINTERPRETED / VERIFIED`. The snapshot was not modified. The remote `#37` snapshot remains a separate remote artifact and was not substituted for ACQ-1.

## Reconciliation baseline and counts

The primary counts below are the accepted frozen C1 analysis of the ACQ-1 window, not a newly calculated TNDS comparison:

| Measure | Count | Interpretation |
|---|---:|---|
| Relevant source StopPoints | 436,777 | All received a final C1 state; zero unclassified remainder and zero preparation errors. |
| Relevant scheduled-call records | 42,159,591 | Source records in the frozen BODS window. |
| Resolved scheduled-call identities | 42,154,683 | Exact primary identity resolution. |
| Unresolved scheduled-call identities | 4,908 | Source-level unresolved call records; not 4,908 missing services. |
| Current primary timetable evidence | 249,279 | C1 coverage count. |
| Active bus-domain non-call points | 161 | Infrastructure/non-call category. |
| No current primary timetable evidence | 126,228 | Does not establish service absence. |
| TNDS regions received/validated | 0/8 | National comparison is unavailable. |
| National reconciliation ledger records | 0 | No live TNDS-derived national ledger was generated. |

The 4,908 unresolved identities remain unassigned to individual stops and uncorroborated by TNDS. This report does not infer service loss from them. The fixture ledger tests exercise classification logic but are not counted as national evidence.

## Discrepancy shortlist for the next decision

| Rank / class | Count now | Example / cause / confidence | Recommended investigation |
|---|---:|---|---|
| 1. Comparator coverage gap | 8 expected, 0 available | All eight regional sources are absent from the quarantined TNDS snapshot. Cause is the documented credential block; high confidence. No routes are asserted as examples. | Enable secure access and freeze a complete eight-region snapshot. |
| 2. Unresolved primary identity | 4,908 records | National C1 aggregate only; raw identities are deliberately not reassigned to stops. Their TNDS corroboration count is unknown, not zero. High confidence in aggregate count; no confidence claim about TNDS matching. | After acquisition, compare only exact shared stop and service identities and retain unresolved outcomes when identity cannot be bridged. |
| 3. Primary-only / TNDS-only / calendar / duplicate / stop mismatch classes | 0 classified nationally | No TNDS evidence was available to compute these classes. Zero here means zero comparisons performed, not evidence of no discrepancy. | Recalculate from the same frozen primary evidence and validated TNDS regions; rank by affected evidence rows and regional coverage. |
| 4. Region-specific parsing and malformed-input classes | 0 live documents inspected | No archives were available. Existing parser and archive tests are fixture-level controls only. | Record per-document validation results and examples after the owner action. |

No source-authority recommendation is made from unavailable comparative evidence.

## Protected controls

- **PE1 control:** the existing C2 handover records the historic PE1 2TL 500 m replay at 57 stops, 41 route-bearing stops, 191 services and 126 summaries on PREP-1/C1; C1 retains the current exact-source route families and passes the stop-scoped failure controls. These pre-existing controls were not edited.
- **Queensgate / 0590B:** existing C1/C2 evidence confirms four `0590BCE` station entrances are bus-domain infrastructure, not timetable calls; C1 makes no 0590B timetable shard request for those entrances. Eighteen of twenty BCS members have exact identity and resolved call evidence; two remain unconfirmed. The comparator preserves stop IDs and cannot turn route-number overlap into a match.
- **NaPTAN semantics:** BCE/BST remain non-call infrastructure; BCT/BCS/BCQ remain call-eligible; BCP remains context-dependent. The comparator does not implement planner call eligibility.
- **Stop-scoped failure:** no planner failure handling was changed; composite keys include the stop identity.
- **London/TfL:** no TfL/iBus source hierarchy, timetable, or routing code changed. TNDS authority is not changed by this diagnostic.
- **Planner behavior/source authority:** unchanged. Ledger records are diagnostic only and cannot enter planner output.
- **Existing national C1/C2/REMOTE controls:** the complete Alpha.15 suite is the required regression gate below.

## Tests and verification

- Focused Python: `python -m unittest discover -s tools/atlas-bus-data -p 'test_tnds_reconciliation.py' -v` — 16 tests passed.
- Full Python suite: `python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v` — **139 tests passed**.
- Full ATLAS suite: `node tests/atlas/run-all.mjs` — **passed** with exact sentinel `ATLAS Alpha.15 deterministic suite passed.`
- TransXChange fixture suite includes explicit rejection of truncated document input; the new archive test checks ZIP readability, member integrity, byte count, and SHA-256 without extracting source content.
- No test result is inferred from code inspection; completion record captures actual command outcomes.

## Remote execution and Git closeout

- No GitHub Actions workflow was dispatched. TNDS credentials were unavailable; adding remote secrets was outside this sprint.
- No PR, merge, deploy, or main-branch change was made.
- Implementation commit: `f327bfbd8b4c69445556662cb653c5bf4b009499` (`Add TNDS reconciliation baseline`).
- Push and final branch parity are reported in the completion record. If non-interactive push fails, the required state is `PUSH REQUIRED BEFORE TECHNICAL DIRECTOR REVIEW` with the exact final local SHA.
- No raw archives, secrets, caches, or generated national data are committed.

## GITHUB TOOLING ADOPTION REVIEW

| Tool | Relevance | Reason | Installation milestone reached? |
|---|---|---|---|
| Dependabot | Relevant now; already adopted | Existing weekly npm and Actions updates are configured. | Yes, previously reached; no change in this sprint. |
| Codecov | Later | Useful after an agreed coverage scope, exclusions, upload path, and threshold policy. | No new milestone. |
| OpenSSF Scorecard | Later | Requires separate review of workflow permissions, branch protections, and finding visibility. | No. |
| Sentry | Not appropriate for this sprint | National data reconciliation is offline; production telemetry needs a separate privacy and retention decision. | No. |
| Renovate | Not appropriate now | It would duplicate the existing Dependabot updater without a documented unmet need. | No. |

No tooling was installed and no repository settings were changed.

## Limitations and next sprint

This sprint provides an offline comparator primitive, not a completed live national reconciliation. It does not acquire TNDS, emit a national ledger, classify individual national discrepancies, or translate unresolved BODS source IDs into NaPTAN StopPoints. The next tightly scoped work is to freeze and validate the authorized eight-region TNDS source set, adapt the existing BODS/TNDS normalizers into the composite ledger input format, generate a secret-free national evidence ledger, and investigate only the highest-count discrepancy class. Source authority and planner output must remain unchanged until a separately authorized decision.

## Final recommendation

**TRUST-1A ENGINEERING PASSED — TNDS ACCESS/OWNER ACTION REQUIRED**
