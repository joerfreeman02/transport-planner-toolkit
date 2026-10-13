# BUS-DATA-PREP-1-C2 — PE1 Control Lineage & Remote Execution Closeout

## Executive verdict

**LOCAL PREP/C1/C2 ENGINEERING GATE PASSED — REMOTE GITHUB EXECUTION REQUIRED.** The historic PE1 2TL control is restored at its independently verified point and 500 m radius. The actual PREP-1 and C1 adapter → assessment → Word path was replayed on the same frozen 13 October source window. Every historic route family is either retained or, for route 60, traced to its absence from the current PE1 NaPTAN route metadata and exact current BODS StopPoint schedules. C1’s 0590B semantics and real-point stop-scoping pass. The exact ACQ-1 snapshot is not available as a GitHub Actions artifact, so no remote workflow was dispatched or claimed.

No candidate was rebuilt or modified. No source acquisition, TNDS activation, production publication, PR, merge, deploy, or Beta promotion occurred.

## Identity

- Repository: `transport-planner-toolkit`.
- Branch: `codex/atlas-bus-data-prep-1-c2-pe1-lineage-remote-gate`.
- Required start SHA: `c775ab53db693f8450bff3ec52f0ed236bbf1bac`; fetched and confirmed as the remote C1 branch tip and the clean C2 worktree HEAD before edits.
- Functional SHA (control-profile/test/evidence commit): `1a5ac6a38013eca911feb5d7d7fdd73f16cb2290`.
- Final SHA: the commit containing this handover; the final branch SHA, matching remote SHA, ahead/behind parity, and clean status are confirmed in the completion record.
- Version: `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`; no Alpha.16 or Beta change.
- C1 checkout was preserved in its original worktree. PREP-1 and C1 candidate directories and the accepted raw source snapshot were read-only throughout this sprint.

## Control lineage

| Control ID | Exact point | Radius | Source window | Purpose |
|---|---|---:|---|---|
| `PE1-2TL-HISTORIC` | PE1 2TL, `52.577554, -0.242489` | 500 m | Historical BUS-ROBUSTNESS-1B branch `codex/atlas-bus-robustness-1b-national-planner-trust`, evidence commit `814191a7dc030a41c309fd5d32bd4dc38bff5e3c`, run `36125621080`, snapshot SHA-256 `8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9`; current PREP-1/C1 window is ACQ-1 snapshot `cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde` | National partial-shard and planner-trust regression |
| `QUEENSGATE-0590B` | Queensgate Bus Station, Peterborough, `52.5701, -0.2498` | 500 m standardized C2 replay | ACQ-1 snapshot `cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde` | Station-entrance/timetable-call semantics and 0590B regression |

The coordinates differ by approximately 1 km; the controls cannot substitute for one another. The prior C1 “PE1” proof was in fact Queensgate and implicitly used the adapter default radius of 700 m. Its 47-stop / 38 route-bearing / 193 service / 132-summary figures and four BCEs belong only to `QUEENSGATE-0590B` at 700 m. That proof is retained under `tests/atlas/bus-data-prep-1-c1-queensgate-0590b-runtime-proof.mjs`; the new profile-driven C2 harness asserts both control definitions are distinct and fixes the historic PE1 profile at exactly 500 m. The existing 700 m and new 500 m Queensgate captures are both retained.

Machine-readable register: [BUS-DATA-PREP-1-C2-CONTROL-REGISTER.json](BUS-DATA-PREP-1-C2-CONTROL-REGISTER.json).

## Historic PE1 current-source runtime result

Both untouched candidates were run with the same harness at `52.577554, -0.242489`, radius 500 m, through `createPreparedBusDataAdapter → createBusAssessment → buildBusWordTables`. Local fixture routing is deterministic; no operational source is fetched. Candidate source manifests carry the ACQ-1 BODS aggregate fingerprint `a23523db6c7daf39c5c3509511ebb853d3b68fb2617419355d34c857748dc01e`.

| Measurement | PREP-1 current source / pre-C1 | C1 current source / corrected semantics |
|---|---:|---:|
| Nearby / assessed StopPoints | 57 / 57 | 57 / 57 |
| Route-bearing StopPoints | 41 | 41 |
| Selected/recommended StopPoints | 41 | 41 |
| Timetable-call points | 57 | 53 |
| Bus-domain non-call infrastructure | 0 | 4 |
| Service records | 191 | 191 |
| Service summaries | 126 | 126 |
| Planner-facing and Word service-summary rows | 40 | 40 |
| Assessment / timetable conclusion | `partial` / `MATCHED_WITH_PARTIAL_SOURCE` | `complete` / `MATCHED` |
| Failed shard diagnostics / unresolved StopPoints / review items | 1 / 4 / 1 | 0 / 0 / 0 |
| Word output | 2 tables; service summary present | 2 tables; service summary present |
| Selective loading | one stop grid shard; only required regional service shards | same bounded stop grid and successful regional service shards; no 0590B service request |

PREP-1’s sole failed shard is missing `0590B`; all four affected IDs are physical Queensgate BCE entrances, not call points under C1. C1 retains all four entrances in physical discovery, classifies them as `NOT_A_TIMETABLE_CALL_POINT`, and keeps the other 53 call-eligible points trusted. Twelve genuinely route-less points remain `NO_ROUTES`; no `NO_CURRENT_MATCH` or `SOURCE_UNAVAILABLE` conclusion is emitted by the C1 replay. There is no false no-stop result. All 41 route-bearing points remain recommended. Same-route/StopPoint isolation remains covered by the full deterministic suite.

The complete route-family list for both candidates is `1, 2, 3, 4, 4P, 5, 5A, 6, 23, 24, 25, 26, 26A, 27, 33, 37, 48, 61, 62, 63, 101, 102, 201, 202, 415, 904, A, B, C, X4, X31` (route 60 is the only historic family absent). All stop evidence, review bindings, physical BCE detail, status categories, Word row counts and requested file paths are in the hashed runtime JSON captures listed below.

## Three-way comparison and route-family trust

Historical 1B at the historic point recorded 57 nearby / 41 route-bearing stops, 189 recovered service records, 126 service summaries and 44 planner-facing summaries. Current PREP-1 and C1 both produce 57 / 41, 191 / 126 / 40 on the same 13 October raw source set. Thus the +2 service-record difference, unchanged service-summary count and four fewer current planner-facing rows are current-source-window differences, not a disagreement between PREP-1 and C1. The historical 1B trace retains aggregate totals, not its per-route planner rows; its 4-row aggregate delta is not assigned to individual historic trips without evidence.

Historic families retained: all except `60`. Newly appearing current families: none. Absent from current exact-point evidence: `60`. Unexplained lost families: none.

Route 60 was independently checked against the accepted frozen BODS archives, not inferred from prepared output alone. Current PE1 NaPTAN route metadata has no route 60. The current East Anglia archive has two global route IDs named `60` and 72 trips; the East Midlands archive has four such route IDs and 503 trips. Across both archives, zero route-60 `stop_times` match the exact 57 PE1 StopPoint IDs. Route 60 can remain active elsewhere in those regions; it is absent only from current PE1 source evidence. This is classified as `SOURCE-WINDOW CHANGE`, not preparation/runtime loss. No current route-family group/destination/circular logic was altered to mask the difference.

Machine-readable details: [BUS-DATA-PREP-1-C2-THREE-WAY-COMPARISON.json](BUS-DATA-PREP-1-C2-THREE-WAY-COMPARISON.json) and [BUS-DATA-PREP-1-C2-ROUTE-FAMILY-ANALYSIS.json](BUS-DATA-PREP-1-C2-ROUTE-FAMILY-ANALYSIS.json).

## QUEENSGATE-0590B finding

At the standardized 500 m point, PREP-1 returned 14 stops / 13 route-bearing / 157 service records / 96 summaries / 38 planner rows and remained `partial` because one BCE (`0590BCE02L`) requested the missing `0590B` shard. C1 returned the same service evidence, remained `complete`, retained that physical entrance as non-call infrastructure, and made no 0590B shard request. At the legacy 700 m radius, both candidates retain 47 / 38 / 193 / 132 and four physical BCEs; PREP-1 remains partial, C1 complete. The previously accepted finding is valid and its proof is no longer labelled historical PE1.

## Remote GitHub evidence and workflow review

GitHub’s read API confirmed historical run `36125621080`, but its artifact listing is empty. The recent scheduled refresh run artifact listing is also empty. The accepted ACQ-1 snapshot is a local 13 October snapshot with local producer metadata; no exact-snapshot artifact/run ID exists in the inspected Actions evidence. Therefore record exactly:

**EXACT ACQ-1 SNAPSHOT IS NOT YET AVAILABLE AS A GITHUB ACTIONS ARTIFACT**

No Actions run was dispatched; no GUI, credential workaround, push-trigger workaround, or fabricated run was used. No GitHub Actions result or run ID is claimed for C2. Minimum controlled next action: the Product Owner must make this exact verified 11-source / 2,244,572,632-byte snapshot available as an immutable Actions artifact with its producing run ID, then manually dispatch the existing V2 diagnostic with that exact artifact/run and snapshot ID/count/bytes. The workflow must complete and its artifact/summary be reviewed before acceptance.

Workflow review found no C2 correction necessary:

- The frozen diagnostic workflow requires explicit artifact name, producer run ID, snapshot ID, source count and byte count; it verifies those values before interpretation and calls preparation with `--acquisition-disabled`.
- The reusable source workflow reuses an explicitly named prior artifact by run ID. With no prior run ID, it probes/acquires; that branch was not invoked.
- V2 uses `--bus-only-diagnostic`, has no production publication path, excludes raw XML/CSV/ZIP from diagnostic artifacts, and uses bounded prepared shards. The end-user adapter fetches only the manifest, nearby grid stop shard(s), and selected timetable shards—not whole national archives.
- Workflows target `ubuntu-latest` and use POSIX shell/path operations valid on Linux. No hidden live NaPTAN fallback is permitted in the frozen diagnostic path.
- `atlas-bus-data-refresh.yml` still contains a separate V1 weekly production/publication path. It is not represented as a finished V2 weekly updater. Freshness probe → selective acquire → verified complete snapshot → conditional prep → trust/regression gates → publication / last-known-good remains future ACQ-AUTO scope.

## Verification

- Python: all 100 `tools/atlas-bus-data/test_*.py` unit tests passed. Their transfer/network messages are mocked fixture cases; no real acquisition was run.
- Node: `node tests/atlas/run-all.mjs` passed with exact final sentinel: `ATLAS Alpha.15 deterministic suite passed.` Local review-server tests required loopback permission and passed on the authorized retry.
- C2 runtime proofs: same harness passed on PREP-1 and C1 for historic PE1-2TL at 500 m and standardized QUEENSGATE-0590B at 500 m; retained legacy Queensgate 700 m proof also passed for both candidates.
- `git diff --check`, source-snapshot identity/size, candidate manifest identities, and final remote branch parity are recorded in final Git verification.
- Protected Waltham, Chingford, Enfield, Pipers, GROUP, DEST and CIRC intelligence remained under the passing complete Alpha.15 suite. No production or planner-domain code was changed.

## Evidence files and SHA-256

Detailed runtime JSON is stored outside Git at `work/atlas-bus-data-prep-1-c2-pe1-lineage-evidence/`. Evidence-manifest SHA-256: `58B83D17ABB039606CEF979882956EB06E851A3C8FFE0E39E7E0B4C4283EDAAB`. Candidate manifest hashes: PREP-1 `DD3015D3F82245070B65D7C5325B06227DAC463E304C196478FA0161DE0348DE`; C1 `707C1CC360EA905FA2E3C57A72C4C5F41D064A9F20448FE85DC3F9533591FF5E`. Accepted raw snapshot manifest SHA-256: `88D0CF556E13EC5AA0A1A10B0E8EA7478CA94A999ADCFDC36F3D1F4570BF99CA`.

| Evidence artifact | SHA-256 |
|---|---|
| `prep1-pe1-historic.json` | `B5CE88CD16DFE689D2AD0A0112779D5097E7ADEB9BE1230B8F159E32E0D1CA12` |
| `c1-pe1-historic.json` | `0D5A3F006FFDD535574EA5873FA540E3478453FA11B97B364232F105AD5325DD` |
| `prep1-queensgate-500m.json` | `257E997BD5CA8161D25EF434FB6B4C83336025DBF9044651DE640B2B924AA696` |
| `c1-queensgate-500m.json` | `01CFC9B334614FE722BFD979A20CF37ACED6255E5B5B3E8CDA130105C475C550` |
| `prep1-queensgate-legacy-700m.json` | `BDEF671783C510BE64E141B65BF8E5ADF27E957299799880758D5717419671F1` |
| `c1-queensgate-legacy-700m.json` | `B43998D1B03E774F9D3A31D1134B6F3FF9FE8FC10F83865ED971E5152486957D` |
| `BUS-DATA-PREP-1-C2-CONTROL-REGISTER.json` | `563E5270A932496CE94ED06C2B591467DF644DD5FD32BC2C90BF7DF496D9496D` |
| `BUS-DATA-PREP-1-C2-THREE-WAY-COMPARISON.json` | `E3511AB4FC84DC7AFF3930A3A602E3E5350E31FF463A77E981F73A5BCF0AEF9F` |
| `BUS-DATA-PREP-1-C2-ROUTE-FAMILY-ANALYSIS.json` | `E654ACDDABA6FB1CC76EB08AA63285CB0602383A438A5F6F7E457EE05C2DC2CE` |

## Tooling adoption review

No installation or reconfiguration was made. Dependabot is appropriate for repository-native security/update PRs; Codecov can wait for an agreed stable coverage baseline; OpenSSF Scorecard is useful after workflow permissions/release boundaries review; Sentry is not appropriate without an authorized production telemetry/privacy design; Renovate overlaps Dependabot, so choose one updater after governance review.

## Limits and recommendation

- Preparation: PREP-1/C1 candidates were not rebuilt; both passed actual-point current-source replay. No unexplained current raw-evidence route loss was found.
- Source trust: 4,908 unresolved national scheduled-call identities remain explicit aggregate trust evidence; this sprint does not claim source-wide identity closure or `CONFIRMED_NO_CURRENT_SERVICE`.
- TNDS: not acquired or activated.
- Remote GitHub: exact ACQ-1 artifact unavailable; actual C2 GitHub Actions execution remains required.
- Production updater: V2 is diagnostic-only; ACQ-AUTO and production publication were not started.
- Polish: BUS-POLISH was not started.

Stop at C2 and wait for Technical Director review.

Final recommendation: **LOCAL PREP/C1/C2 ENGINEERING GATE PASSED — REMOTE GITHUB EXECUTION REQUIRED**.
