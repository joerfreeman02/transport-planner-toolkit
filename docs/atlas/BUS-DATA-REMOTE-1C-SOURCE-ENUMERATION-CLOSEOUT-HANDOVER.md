# BUS-DATA-REMOTE-1C — Source Enumeration and TNDS Probe Closeout

## Result

REMOTE-1C closes the two static defects found after REMOTE-1B: the V2 BODS gate now requires exactly the approved nine regions, and the TNDS metadata probe now shares the acquisition filename classifier and conservative metadata rules. No workflow was dispatched and no live source or archive was acquired.

## Baseline and branch

- Repository: `transport-planner-toolkit`
- Exact required baseline: `bc3e820ea5eccdf0c33fad8ca2d6de2c65e3aa1e`
- Branch: `codex/atlas-bus-data-remote-1c-source-enumeration-closeout`
- Release remains `2.0.0-alpha.15`; no Alpha.16 or Beta change.
- #37 remains the frozen input for the future remote acceptance run: run `38533475680`, snapshot `13e2895be61c5bb5adaf8adec9896520b8224ff243766818d3ca920f0eae71e`, 11 sources, 2,327,615,358 bytes. Its original `createdAt` is `2026-10-14T08:12:49Z`.

## Files changed

- `tools/atlas-bus-data/source_snapshot.py`
- `tools/atlas-bus-data/refresh_bus_data.py`
- `tools/atlas-bus-data/validate_candidate.py`
- `tools/atlas-bus-data/verify_prepared_handoff.py`
- `tools/atlas-bus-data/tnds_capability_probe.py`
- `tools/atlas-bus-data/test_source_snapshot.py`
- `tools/atlas-bus-data/test_candidate_validator.py`
- `tools/atlas-bus-data/test_remote_preflight.py`
- `tools/atlas-bus-data/test_tnds_capability_probe.py` (new)
- `tests/atlas/reference-data-workflow-contract.test.mjs`
- `docs/atlas/BUS-DATA-REMOTE-1B-FULL-PREFLIGHT-HARDENING-HANDOVER.md` (corrected BODS count wording)
- `docs/atlas/BUS-DATA-REMOTE-1C-SOURCE-ENUMERATION-CLOSEOUT-HANDOVER.md` (new)

## BODS exact-nine correction

The V2 national validator previously accepted a region count of eight. Count alone cannot prove coverage: a duplicate can replace a missing region, and an unexpected region can make the count appear complete.

`source_snapshot.BODS_REGIONS` is now the canonical Python enumeration. The old `source_snapshot.REGIONS` name remains an alias for compatibility, and `refresh_bus_data.BODS_REGIONS` imports the canonical tuple rather than maintaining another list. It contains exactly:

`east_anglia`, `east_midlands`, `london`, `north_east`, `north_west`, `south_east`, `south_west`, `west_midlands`, `yorkshire`.

Raw source verification requires all nine corresponding BODS paths plus NaPTAN and NPTG, rejects duplicate and unexpected manifest source paths, checks the manifest source count, and therefore requires exactly 11 primary Bus sources. The durable acquisition manifest derives its planned source count as `2 + len(BODS_REGIONS)`.

Prepared Bus V2 validation checks the full region identities, exact length, and uniqueness. The shared predicate is used by the V2 bus-only metrics path and by the full candidate validator. The REMOTE-1B prepared-output handoff applies the same predicate before any downstream gate, so raw nine-region coverage must remain nine regions in the prepared manifest.

The historic V1 production validator retains its prior minimum of eight regions. This is deliberate compatibility: the strict rule applies to V2 diagnostics, and V1 behavior was not silently changed. The existing V1 prepared-data integrity check is also a legacy compatibility assertion, not the V2 national gate.

Tests cover exact-nine pass, 8/9 rejection, missing London, each missing non-London region, a duplicate replacing an expected region, unexpected region names, raw snapshot rejection when a region is missing, and handoff rejection before downstream validation. Existing C1/C2 fixtures are exercised by the full Alpha.15 suite.

## TNDS metadata matching and reliability

The probe no longer uses substring matching. It filters directory entries to `.zip` archives and calls `refresh_bus_data.tnds_region_from_filename`, the same whole-token classifier used by acquisition. Filenames such as `MAY.zip`, `BOY.zip`, `Yorkshire.zip`, `EAST.zip`, and `NEMT.zip` do not become false regional matches.

A region is `RELIABLE_METADATA` only when exactly one archive is classified to it, `SIZE` succeeds with a positive integer, and `MDTM` succeeds with a valid `213` timestamp. No candidate is `MISSING`; multiple classified candidates are surfaced in `candidates` and classified `AMBIGUOUS`, with no arbitrary candidate selected or queried. Missing, nonpositive, malformed, or failed metadata is `INCOMPLETE_METADATA`. The overall result is `RELIABLE_METADATA_ONLY` only when all eight TNDS regions have complete unambiguous metadata; partial success is `PARTIALLY_RELIABLE`, otherwise it is `NOT_RELIABLE`.

The probe still sets `retrievalPerformed: false`, issues no `RETR`, and performs no archive transfer. Focused fake-FTP tests cover EA, EM, NE, NW, SE, SW, WM, Y; arbitrary Y-containing names; partial names; valid and failed SIZE/MDTM; duplicate candidates; and the no-retrieval invariant.

## Final source-enumeration audit

| Enumeration or check | Classification | Result |
|---|---|---|
| `source_snapshot.BODS_REGIONS` | Correct BODS = 9 | Canonical list; compatibility `REGIONS` alias points to it. |
| `refresh_bus_data.BODS_REGIONS` | Correct BODS = 9 | Imported canonical tuple, used by acquisition and freshness checks. |
| Raw source snapshot count | Correct primary source count = 11 | Two XML sources plus nine BODS ZIPs; derived from the canonical list. |
| V2 validator and prepared handoff | Correct BODS = 9 | Exact names and uniqueness required. |
| V1 validator minimum `>= 8` | Intentional legacy compatibility | Preserved only for the V1 schema. |
| `refresh_bus_data.TNDS_REGIONS` | Correct TNDS = 8 | EA, EM, NE, NW, SE, SW, WM, Y. |
| `prepare_tnds.mjs`, `update-atlas-bus-data.mjs`, publication TNDS lists | Correct TNDS = 8 | Cross-language lists agree; source-selection behavior was not changed. |
| `test_resumable_acquisition.py` counts 11 and 8 | Correct | 11 is the combined primary snapshot; 8 is the TNDS source snapshot. |
| `prepared-bus-data-integrity.test.mjs` minimum of 8 | Intentional V1 compatibility | It validates the checked-in V1 dataset, not the V2 diagnostic gate. |
| `source_freshness.py` BODS endpoints | Correct BODS = 9 | Imports the canonical BODS tuple through `refresh_bus_data`. |
| #37 frozen input count 11 | Correct primary source count = 11 | Independently verified run input; no new count assumption introduced. |

No further source-count or region-count defect was found. The REMOTE-1B handover’s phrase “all eight BODS regions” was corrected to “all nine BODS regions”; its eight-region TNDS references remain correct.

## Test results

- Python: `python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v` — **123 tests passed**.
- Workflow contract: `node tests/atlas/reference-data-workflow-contract.test.mjs` — passed.
- Full suite: `node tests/atlas/run-all.mjs` — passed, including C1/C2 regressions and V1 integrity checks.
- Exact required sentinel: `ATLAS Alpha.15 deterministic suite passed.`
- `git diff --check` — passed.

## Git closeout

- Branch `codex/atlas-bus-data-remote-1c-source-enumeration-closeout` was pushed to `origin`.
- Final local and remote branch tips were verified equal (`0 0` commits ahead/behind), and the worktree was clean after the push.

Tests use synthetic manifests, existing repository fixtures, and mocked FTP. No NaPTAN, NPTG, or BODS acquisition occurred. No TNDS archives were retrieved. No GitHub Actions workflow was dispatched.

## GitHub tooling adoption review

- **Dependabot:** already configured for weekly npm and GitHub Actions updates.
- **Codecov:** no configuration found; not added.
- **OpenSSF Scorecard:** no workflow found; not added.
- **Sentry:** no integration found; not added.
- **Renovate:** no configuration found; it would overlap current Dependabot automation; not added.

No tooling was installed or reconfigured.

## Remote acceptance sequence

The next run must be manually dispatched by the Product Owner from this candidate feature branch using the frozen #37 values documented in REMOTE-1B. The V2 non-main path remains diagnostic-only. Required review order remains Technical Director review, Product Owner feature-branch remote acceptance, Technical Director review of the Actions run, then acceptance/rejection and a separate integration/freeze decision. This handover does not instruct merging to `main` before remote acceptance.

## Remaining runtime-only risks

Static fixtures prove exact region identity and failure behavior. The next authorized run still needs to confirm GitHub FTP directory responses and the complete #37 candidate handoff at runtime. That run is intentionally left to the Product Owner; no dispatch was made in this sprint.
