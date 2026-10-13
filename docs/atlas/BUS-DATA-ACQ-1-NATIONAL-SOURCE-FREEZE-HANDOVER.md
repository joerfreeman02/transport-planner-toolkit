# BUS-DATA-ACQ-1 — National Source Freeze Handover

## Executive verdict

The primary raw national source snapshot is acquired, structurally validated,
SHA-256 recorded, durably checkpointed and frozen for Technical Director
review. It contains the current official NaPTAN XML, NPTG XML and all nine
official BODS regional GTFS archives. It remains diagnostic/preparation-only:
`productionEligible=false`, and no interpretation or preparation was run.

TNDS was not acquired because secure `TNDS_USERNAME` and `TNDS_PASSWORD`
credentials were unavailable to the process. The separate TNDS quarantine
manifest records `TNDS ACQUISITION BLOCKED — SECURE CREDENTIALS REQUIRED`.
This does not invalidate the complete primary snapshot.

This handover does not claim national timetable, route or stop completeness,
Beta readiness, 0590B resolution, or BODS/TNDS reconciliation.

## IDENTITY

- Baseline: `0d75c59b77697a9e6fe65c7bf6a6bd94b804abec`
- Baseline remote branch verification: `origin/codex/atlas-bus-robustness-1b-national-planner-trust` pointed to the exact baseline SHA.
- Branch: `codex/atlas-bus-data-acq-1-resumable-source-freeze`
- Worktree: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\atlas-bus-robustness-1b-national-planner-trust\atlas-bus-data-acq-1-resumable-source-freeze`
- Version: `2.0.0-alpha.15` (unchanged)
- Functional implementation SHA: `7169c658fd924a6094185c582075a5af31c6cd5c` (`feat: add resumable national bus source acquisition`).
- Remote SHA/parity: recorded after the sprint branch push and fetch-back.
- Raw snapshot root: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\data-snapshots`
- Repository changes:
  - `tools/atlas-bus-data/source_snapshot.py`
  - `tools/atlas-bus-data/refresh_bus_data.py`
  - `tools/atlas-bus-data/test_resumable_acquisition.py`
  - `docs/atlas/BUS-DATA-ACQ-1-NATIONAL-SOURCE-FREEZE-HANDOVER.md`

The initial repository fetch could not complete because the shared local Git
object store reported missing historical objects and GitHub returned an
incomplete pack. The exact baseline branch tip was subsequently verified
directly with `git ls-remote`, and the fresh worktree was created from the
locally present exact baseline commit.

## ACQUISITION ARCHITECTURE

### Before

The primary path downloaded every source into one temporary directory, then
deleted/rebuilt the reusable snapshot only after every download completed.
That meant an otherwise successful national download could be lost when a
later source, validation step or coding defect failed. Existing TNDS transfer
logic also removed a region target before retrying it.

### After

- Each source has a deterministic durable final path and a hidden `.part`
  transfer path.
- A download is written to `.part`, structurally validated, hashed and sized,
  then atomically promoted with `Path.replace()`.
- The manifest is written through `.manifest.json.part` and atomically
  promoted, with a short retry for transient Windows file locks.
- A checkpoint is written after every successful source. It records source
  path, identity, region, format, bytes, SHA-256, acquisition/reuse state,
  timestamp, structural validation and remote freshness metadata when
  available.
- Restart verifies the existing final file's size, SHA-256 and structural
  contract before reuse. A valid source is not downloaded again; missing,
  corrupt or unverifiable sources alone are reacquired.
- Interrupted `.part` files are never considered complete.
- An incomplete primary manifest is `ACQUIRING / UNINTERPRETED`; only all 11
  verified sources can promote it to `ACQUIRED / UNINTERPRETED / VERIFIED`.
- Complete snapshots are never removed while a new snapshot is being built.
- Primary and TNDS roots are separate. TNDS uses
  `ACQUIRED / UNINTERPRETED / VERIFIED / QUARANTINED` when complete and never
  becomes Planner evidence.
- Acquisition-only entry points do not call `prepared_data_v2`,
  `build_static_index`, shard builders, service parsing or Planner logic.

## PRIMARY SNAPSHOT

- Snapshot ID: `cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde`
- Root: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\data-snapshots\atlas-bus-data-acq-1-primary-20261013`
- State: `ACQUIRED / UNINTERPRETED / VERIFIED`
- Created/acquisition checkpoint: `2026-10-13T11:11:21Z`
- Verified: `2026-10-13T11:18:17Z`
- Total bytes: `2,244,572,632` (approximately 2.09 GiB)
- Source count: `11`
- Acquisition result: NaPTAN was verified and reused after the first live run halted on the corrected NPTG root-family check; NPTG and all nine BODS archives were freshly acquired on the resumed run.
- Freshness probes: BODS HEAD responses returned HTTP 200 but no reliable ETag/Last-Modified plus size discriminator; NaPTAN and NPTG HEAD probes were unavailable. Byte identity is therefore the recorded SHA-256, not HTTP metadata.

| Source | Durable path | Bytes | SHA-256 | Acquired | State | Structural result |
|---|---|---:|---|---|---|---|
| NaPTAN XML | `sources/naptan.xml` | 579176384 | `0d893675bdaadbd8a22ed8742e9afda5383a4240376718ce077d991df32eda47` | 2026-10-13T11:12:35Z | reused | readable XML; NaPTAN root family |
| NPTG XML | `sources/nptg.xml` | 54627625 | `c5d70a938600bbdc32420fa1e0dedf1a2218e073873363db0ecba38074b5e414` | 2026-10-13T11:13:21Z | fresh | readable XML; NationalPublicTransportGazetteer root family |
| BODS east_anglia | `sources/bods/east_anglia.zip` | 42667229 | `f0b9847e0e7fea8e73172505707f5f699cf9b2d6bcb22c15a6bbd3713b73015e` | 2026-10-13T11:13:26Z | fresh | valid ZIP; required GTFS members present |
| BODS east_midlands | `sources/bods/east_midlands.zip` | 194701884 | `990a813c78bf1a65ba671cbe5db3a2a3350a0d03704c91688b991c85aa35efbf` | 2026-10-13T11:13:47Z | fresh | valid ZIP; required GTFS members present |
| BODS london | `sources/bods/london.zip` | 302299511 | `d0ca323dbedaabe947fc65dfd411326773beacb1ad622acb114766a8f8b6c241` | 2026-10-13T11:14:20Z | fresh | valid ZIP; required GTFS members present |
| BODS north_east | `sources/bods/north_east.zip` | 57781933 | `2e4fbbfab67c7f7d8d798d599610eea0181bc4ffba9d1dd7100ad557195d58bb` | 2026-10-13T11:14:26Z | fresh | valid ZIP; required GTFS members present |
| BODS north_west | `sources/bods/north_west.zip` | 134580271 | `b02e8f29f4a672d67f11b3c4f4f9db683c7c0a25884dba993c1c2dd0a37c03bc` | 2026-10-13T11:14:41Z | fresh | valid ZIP; required GTFS members present |
| BODS south_east | `sources/bods/south_east.zip` | 245541307 | `619ae833192e0b8beea81b20090b4e4e6bffb3bb0e667f4fb3d5f854b0c91f49` | 2026-10-13T11:15:12Z | fresh | valid ZIP; required GTFS members present |
| BODS south_west | `sources/bods/south_west.zip` | 252724605 | `ff12297f98298c4970a9e8838466d6e2963958257c713b837d75756cf393f345` | 2026-10-13T11:15:56Z | fresh | valid ZIP; required GTFS members present |
| BODS west_midlands | `sources/bods/west_midlands.zip` | 132078715 | `c91276e0972a6da39f1712c93465e0ff72d7d3712f3beea3b1eced7378089966` | 2026-10-13T11:17:19Z | fresh | valid ZIP; required GTFS members present |
| BODS yorkshire | `sources/bods/yorkshire.zip` | 248393168 | `993b667f6b20fbed392cf4e97891128c53be8c19b21cccc21ab6e9f9d43b3f58` | 2026-10-13T11:18:17Z | fresh | valid ZIP; required GTFS members present |

No `.part` files remained in the completed primary snapshot.

## TNDS SNAPSHOT

- Snapshot root: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\data-snapshots\atlas-bus-data-acq-1-tnds-20261013`
- Snapshot ID: none; no region bytes were acquired.
- State: `BLOCKED / CREDENTIALS REQUIRED / QUARANTINED`
- Regions requested: `EA`, `EM`, `NE`, `NW`, `SE`, `SW`, `WM`, `Y`
- Secure credentials available: username `false`; password `false`.
- FTP was not contacted. No credentials were printed, logged, persisted or written to Git.
- The manifest contains no TNDS region source entries and records the exact
  blocked diagnostic. The root remains a separate quarantine root and is not
  active Planner evidence.

## TESTING

Executed successfully:

- Python compilation: `python -m py_compile tools/atlas-bus-data/source_snapshot.py tools/atlas-bus-data/refresh_bus_data.py` — pass.
- Existing source-snapshot tests: `tools/atlas-bus-data/test_source_snapshot.py` — 9 tests, pass.
- Existing acquisition/refresh tests: `tools/atlas-bus-data/test_refresh.py` — 21 tests, pass.
- New deterministic resumable-acquisition tests: `tools/atlas-bus-data/test_resumable_acquisition.py` — 7 tests, pass.
- Required full suite: `node tests/atlas/run-all.mjs` — exit 0; exact final sentinel:
  `ATLAS Alpha.15 deterministic suite passed.`

The Python tests used the bundled workspace Python runtime and a short
approved temporary directory because the default Windows Store sandbox temp
path is not writable for long nested paths. The full ATLAS suite was rerun
with local loopback access enabled for its automated review-environment test
server. No desktop control or visible manual interaction was used.

## BOUNDARY CONFIRMATION

- NO prepared data generated.
- NO stop, service, group or locality shards generated.
- NO stop/service matching performed.
- NO 0590B investigation performed.
- NO GROUP changes.
- NO DEST changes.
- NO CIRC changes.
- NO calendar, frequency or operating-period changes.
- NO Planner runtime source-authority changes.
- NO existing production/prepared dataset replaced.
- NO raw source archives committed to Git.
- TNDS was not activated and no BODS/TNDS records were merged.

## LIMITATIONS

- TNDS remains blocked pending secure process credentials; it is not a
  primary-readiness failure.
- Remote freshness metadata was not reliable for the HTTP sources, so the
  frozen bytes and SHA-256 values are the authoritative acquisition evidence.
- This sprint performed structural validation only. It did not inspect service
  coverage, route completeness, stop coverage, timetable completeness or
  cross-source reconciliation.
- A later authorised sprint must prepare and shard these exact frozen bytes,
  then perform coverage reconciliation and completeness auditing.

## GITHUB TOOLING ADOPTION REVIEW

Review scope was limited to the requested tools. No installation or
reconfiguration was performed:

- Dependabot: no change in this data-foundation sprint.
- Codecov: no change; coverage reporting is outside raw acquisition.
- OpenSSF Scorecard: no change; repository security posture is outside scope.
- Sentry: no change; no runtime production change was made.
- Renovate: no change; dependency update automation is outside scope.

## RECOMMENDATION

PRIMARY readiness: ready for Technical Director review. TNDS readiness:
blocked pending secure credentials, quarantined and inactive.

RAW NATIONAL SOURCE SNAPSHOT READY FOR TECHNICAL DIRECTOR REVIEW
