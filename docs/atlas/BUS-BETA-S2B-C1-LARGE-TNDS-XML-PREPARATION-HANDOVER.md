# BUS-BETA-S2B-C1 — Large TNDS XML Preparation Handover

## Scope and status

This correction addresses the preparation failure in Bus Beta Run #53. The work starts at `796e1e826e9f85ddd96160089c32a91128878e4d` on branch `codex/atlas-bus-beta-s2b-c1-large-tnds-xml-preparation`. Version metadata remains `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`.

The Run #53 source artifacts below were inspected as immutable frozen inputs. No source acquisition, FTP connection, publication, deployment, merge, PR, or release was performed. No service was deliberately skipped.

## Run #53 failure and root cause

Run `39217550518` acquired and verified the primary data and all eight TNDS regional archives, then failed during review-only candidate preparation. `tools/atlas-bus-data/prepare_tnds.mjs` rejected `SE_SC_SCOX_TUBE_1.xml` because the file is 169,291,408 bytes and the per-file ceiling was 67,108,864 bytes (64 MiB). The size check fails before parsing, so this was a preparation limit mismatch, not an acquisition or archive-integrity defect. The failure message explicitly confirmed that no data was dropped.

The 64 MiB limit was introduced with the production-scale hardening at `cc3aa5cb5c60602e6295047e06e99694ad94b967`. It protects the sequential document parser from unbounded individual inputs. That protection remains in place as a finite ceiling; the correction raises it only after measuring the exact current largest file.

## Frozen source identities and integrity

| Snapshot | Producer run | Artifact ID and name | Artifact digest | Snapshot ID |
| --- | ---: | --- | --- | --- |
| Primary | `39217550518` | `12169814614` — `atlas-reference-source-snapshot-39217550518` | `sha256:2d6e925559a90f261d3c4f02490be271356c6fd57c6730a90aa2a1424b194ceb` | `a8c92578014984bc97ca194831370877210ffe8fe3757aa45b215082e4feb6b6` |
| TNDS | `39217550518` | `12171771295` — `atlas-tnds-quarantined-39217550518` | `sha256:cd4e3b83a969eab66529ca59cbacb8a3f02ec9fd8e558b8edd7da2044e9ef7a1` | `ee322f292159957a6c3486738b3ab8fb06a326d3e90b68f8d9ee5d031de8ca34` |

The downloaded TNDS artifact ZIP was 947,613,642 bytes; its calculated SHA-256 matched the registered digest. The outer artifact ZIP and each of its eight regional ZIPs passed ZIP CRC integrity checks. The regional archives contained 14,244 XML files in total. No XML payload was printed or added to the repository.

## Run #53 XML audit

The exact failing XML has 169,291,408 bytes (161.43 MiB). A streaming XML metadata pass found:

- 1 Service;
- 1 Operator;
- 263 JourneyPatterns;
- 263 JourneyPatternSections;
- 564 VehicleJourneys;
- 56 AnnotatedStopPointRef/StopPoint entries.

The document has a single Service, so no document-level reference crosses a Service boundary. No JourneyPatternSection reference was reused by multiple JourneyPatterns in this file. The full document parser resolved the existing service, operator, pattern, timetable, calendar, and stop relationships.

The largest 20 XML files by uncompressed byte size across all eight regions were:

| Rank | Bytes | Region | File |
| ---: | ---: | --- | --- |
| 1 | 169,291,408 | SE | `SE_SC_SCOX_TUBE_1.xml` |
| 2 | 85,794,148 | SW | `SW_SC_SDVN_FAL_1.xml` |
| 3 | 68,788,045 | Y | `Y_SC_SYRK_221_1.xml` |
| 4 | 68,631,806 | Y | `Y_SC_SYRK_120_1.xml` |
| 5 | 62,962,156 | NW | `NW_SC_SCMY_125_1.xml` |
| 6 | 61,085,495 | WM | `WM_SC_SCNH_148_1.xml` |
| 7 | 61,085,456 | WM | `WM_SC_SCNH_148_2_A.xml` |
| 8 | 55,904,870 | Y | `Y_SC_SYRK_22X_1.xml` |
| 9 | 55,904,831 | Y | `Y_SC_SYRK_22X_2_A.xml` |
| 10 | 55,756,282 | Y | `Y_SC_SYRK_22X_3_A.xml` |
| 11 | 53,569,231 | Y | `Y_SC_SYRK_1_2_A.xml` |
| 12 | 52,529,755 | SW | `SW_SC_SCGL_10_1.xml` |
| 13 | 50,251,534 | WM | `WM_SC_SCNH_148_3_A.xml` |
| 14 | 49,027,001 | NW | `NW_SC_SCMY_1_1.xml` |
| 15 | 47,827,998 | Y | `Y_SC_SYRK_226_1.xml` |
| 16 | 47,827,959 | Y | `Y_SC_SYRK_226_2_A.xml` |
| 17 | 47,550,444 | EM | `EM_SC_SYRK_X17_1.xml` |
| 18 | 45,349,876 | SE | `SE_SC_SCEK_LOOP_2_A.xml` |
| 19 | 45,349,832 | SE | `SE_SC_SCEK_LOOP_1.xml` |
| 20 | 45,205,866 | EM | `EM_SC_SCNH_X4_5_A.xml` |

Four current files exceed the former 64 MiB ceiling. The audit therefore covers all currently observed inputs above that boundary, not only the Run #53 failure.

## Correction and measured bounds

The parser and downstream preparation semantics are unchanged. `TNDS_XML_MAX_BYTES` is now a finite 192 MiB (`201,326,592` byte) limit. This is 32,035,184 bytes (30.55 MiB, approximately 18.9%) above the largest file in the full Run #53 audit. Files above the new ceiling still fail explicitly before reading, with an error stating that no data was dropped.

Measurements on the exact extracted `SE_SC_SCOX_TUBE_1.xml`, using Node with `--max-old-space-size=4096`:

| Operation | Result | Elapsed | Peak RSS |
| --- | --- | ---: | ---: |
| Existing `parseTndsTransXChangeServices` | 263 planner records | 879 ms parser / 1,036 ms read plus parse | 429,903,872 bytes (~410 MiB) sampled process peak |
| `prepareTnds` of the exact file with the proposed 192 MiB limit | 263 expected records, all 263 unique IDs retained, 803 shard copies, 4 shard files; zero quarantines | 1,619 ms preparation / 2,977 ms whole measurement process | 597,540,864 bytes (~570 MiB) sampled process peak |

The preparation measurement intentionally held a separate expected parser result while preparing and validating the file, so its sampled RSS is conservative relative to the production preparation path. The four shard files retained schedules, resolved calendars, pattern variants, and stop records. The run did not truncate input or discard any service because of file size.

The associated workflow uses `ubuntu-24.04`. GitHub documents the standard public Linux hosted runner as 4 CPUs and 16 GB RAM ([GitHub-hosted runner specifications](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job)). The measured exact-file preparation peak is about 3.5% of that RAM. Run #53's existing TNDS capacity gate also passed before preparation; its audit reported a 5,057,604,390-byte largest uncompressed region and all 14,244 archive members.

## Regression coverage

`tests/atlas/tnds-preparation-scale.test.mjs` now retains the small-file output-equivalence case, 1,800-record incremental-shard stress case, one-record materialization assertion, and explicit oversized-input failure. It also generates a valid 65 MiB TransXChange file containing a complete service fixture, then compares full prepared output to direct parser output and asserts operator, pattern, stop, schedule, and calendar evidence. The existing multi-Service suite continues to cover service ownership and operator/pattern relationships across services.

Required final checks and current results:

- `node tests/atlas/tnds-preparation-scale.test.mjs` — passed, including the generated 65 MiB valid XML case.
- `node tests/atlas/run-all.mjs` — passed; output ended `ATLAS Alpha.15 deterministic suite passed.`
- `python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v` — 284 tests passed in 119.102 seconds.
- `git diff --check` — passed before final documentation update; it will be repeated before commit.

Results and hosted evidence are recorded below after exact-SHA preflight.

## Hosted preflight and replay boundary

The S2B-C1 branch selector accepts the exact forced, measure-only, v2 `TNDS-TRUST-PREFLIGHT-C1B` offline-preflight form, or a later compose request pinned to both exact Run #53 artifact IDs and digests. The branch rejects fresh source acquisition, candidate-checkpoint restore, and all other selector combinations. The hosted preflight runs Python Bus-data tests and the deterministic Node suite, emits evidence with acquisition, FTP, retrieval, publication, and deployment all marked false, and does not inject TNDS credentials.

- Final SHA: the commit containing this handover on the named branch; the exact hash is reported in the final closeout.
- Hosted zero-download offline preflight run ID, artifact ID, and artifact digest: reported in the final closeout for the exact final SHA. The evidence artifact is named `atlas-tnds-trust-offline-preflight-<run-id>`.
- Source downloads: none.
- Publication/deployment: none.

No Run #53 restore/replay was dispatched. A later replay requires Technical Director authorization after review of the exact-SHA hosted preflight.

## Next authorized recovery dispatch

After that authorization, use the `ATLAS Bus Beta review-candidate` workflow on the reviewed final branch SHA with these exact selectors:

| Input | Value |
| --- | --- |
| `review_candidate_mode` | `compose` |
| `prepared_schema` | `v1` |
| `measure_only` | `false` |
| `force_refresh` | `false` |
| `primary_source_run_id` | `39217550518` |
| `primary_artifact_id` | `12169814614` |
| `primary_artifact_digest` | `sha256:2d6e925559a90f261d3c4f02490be271356c6fd57c6730a90aa2a1424b194ceb` |
| `tnds_source_run_id` | `39217550518` |
| `tnds_artifact_id` | `12171771295` |
| `tnds_artifact_digest` | `sha256:cd4e3b83a969eab66529ca59cbacb8a3f02ec9fd8e558b8edd7da2044e9ef7a1` |

Leave candidate checkpoint restore selectors, checkpoint resume, v2/TRUST selectors, and all other acquisition selectors blank/default. This recovery contract restores exactly the two immutable Run #53 artifacts and does not contact TNDS FTP or BODS/NaPTAN/NPTG acquisition endpoints. Do not dispatch it as part of S2B-C1; the exact-SHA offline preflight is the only dispatch in this coding sprint.

## Final handover

- Branch: `codex/atlas-bus-beta-s2b-c1-large-tnds-xml-preparation`.
- Starting SHA: `796e1e826e9f85ddd96160089c32a91128878e4d`.
- Final SHA: the commit containing this handover on the named branch; the exact hash is reported in the final closeout.
- Exact changed files: `.github/workflows/atlas-bus-data-refresh.yml`; `docs/atlas/BUS-BETA-S2B-C1-LARGE-TNDS-XML-PREPARATION-HANDOVER.md`; `tests/atlas/automated-refresh-contract.test.mjs`; `tests/atlas/tnds-preparation-scale.test.mjs`; `tools/atlas-bus-data/prepare_tnds.mjs`.
- Worktree clean and branch/origin parity: verified in the final closeout.
- Run #53 frozen sources safe to replay without reacquisition: reported in the final closeout after exact-SHA preflight; replay still requires Technical Director authorization.
