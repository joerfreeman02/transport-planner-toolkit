# ATLAS BUS-DATA-V2-2 National Diagnostic

## Authorized BUS-DATA-V2-2A continuation

Technical Director authorization on 2026-09-22 permits the protected-file
reference-foundation correction on this diagnostic branch. The correction keeps
all valid multimodal NaPTAN source records in a separate reference layer,
projects only active coordinate-valid Bus/Coach records into the runtime Bus
view, and separates source StopArea membership from active runtime membership.
Legitimate one-character NPTG district codes are retained; unresolved district
references remain explicit diagnostic evidence.

The Run #26 failure remains retained evidence: acquisition completed for NaPTAN,
NPTG, all nine BODS feeds and all eight TNDS regions, then structural candidate
validation failed on `0170SGP90856`. The continuation is Bus-only: it must not
acquire TNDS archives, invoke the TNDS preparer, create a production
checkpoint, publish, deploy Pages, or use Run #24 as a v2 checkpoint.

The exact BODS ZIP bytes acquired for v2 are reused by the shadow-v1 comparison
through a diagnostic-only cache. Artifacts contain compact hashes and reports,
not raw XML, CSV or ZIP files. Refresh state is truthful and monotonic:
`sanity_checked` → `structurally_validated` → `diagnostic_complete`; no state is
treated as publication-eligible.

Status: diagnostic-only branch record. This sprint does not publish Bus/TNDS
data, alter active production configuration, deploy Pages, or implement the
approved runtime StopArea-completion policy.

## Scope and safety boundary

The accepted v2 candidate builder remains the source of the fresh national
candidate. `tools/atlas-bus-data/national_v2_diagnostic.py` reads that candidate,
re-acquires the current NaPTAN CSV and BODS regional feeds into a temporary
workspace, builds a shadow v1 tree with the same snapshot date and generated
timestamp, and retains only compact JSON/Markdown evidence. Raw XML, CSV, ZIP,
TNDS and shadow-v1 source material are temporary and are never copied into the
workflow artifact.

The diagnostic workflow is restricted to prepared schema v2 with
`measure_only=true` on the diagnostic branch. It does not restore a checkpoint,
check out publication repositories, call publication or Pages steps, or alter
the active State C configuration. `resume_checkpoint_run_id` is unset.

## Evidence contract

The report records:

- exact v1/v2 physical StopPoint population and legacy-field parity, with bounded
  mismatch samples and ATCO-area distribution;
- BODS service identity and semantic-field parity only for regions whose
  re-acquired source hashes match the v2 candidate; changed regions are labelled
  `SOURCE_WINDOW_CHANGED` and excluded from exact parity conclusions;
- national logical-group/StopArea membership, type, geometry and QA evidence;
- NPTG locality/district hierarchy evidence and explicit unresolved-reference
  counts;
- East View, Waltham Cross, multiple-membership, ordinary two-member and
  complex-group controls where present;
- fresh v2, same-window shadow-v1 and Run #24 Bus payload measurements, including
  category sizes, byte deltas, largest file and the 95 MiB Git-blob ceiling;
- the normal State C candidate-capacity measurement for TNDS roots;
- the candidate-generation compatibility fingerprint supplied by the workflow.

The report distinguishes same-window schema overhead from source-data growth
since Run #24. Actions step timestamps provide approximate acquisition, build,
validation, parity and capacity timings; these are not benchmark claims.

## Local deterministic coverage before dispatch

The focused diagnostic tests cover complete physical and service comparisons,
duplicate service-shard canonicalisation, source-window classification,
percentiles, StopArea/NPTG evidence, payload measurement, compact report
generation and raw-source exclusion.

The complete Alpha.15 deterministic suite and candidate-checkpoint compatibility
suite are also required to pass before the one controlled national workflow
dispatch.

## National run record

This section is completed from the single GitHub Actions run after dispatch. The
run failed safely during candidate validation and is preserved; it was not
automatically rerun.

- Branch: `codex/atlas-bus-data-v2-national-diagnostic`
- Starting main: `2fe88745419ca1197609e03c3e489b1b12b3aa20`
- Inputs: `prepared_schema=v2`, `measure_only=true`, `force_refresh=false`,
  `resume_checkpoint_run_id` unset
- Workflow run number: `26`
- Workflow run ID: `35720874446`
- Workflow URL: https://github.com/joerfreeman02/transport-planner-toolkit/actions/runs/35720874446
- Workflow head SHA: `a30ef38e5e1d54257e3e2cc57557f36c153d47e3`
- Conclusion: `failure` after `1h0m48s` in the Build and validate Bus/TNDS
  candidate job (`106723341665`). Acquisition completed, then candidate
  validation failed with the exact evidence:
  `Candidate validation failed: Active logical-group member StopPoint is
  missing: 0170SGP90856`.
- The v2 diagnostic step was not reached. Consequently this run provides no
  national v1/v2 parity, StopArea, NPTG parity, payload-capacity or performance
  conclusion. The failure is a candidate-data validation blocker, not a
  diagnostic parity result.
- Acquisition evidence in the compact artifact records NaPTAN `375625` stops,
  BODS `9` regions / `39502` services and TNDS `8` processed regions / `234225`
  services. The refresh-status file reports validation `passed`, but the
  workflow's authoritative candidate-validation step rejected the candidate
  immediately afterwards on the missing active logical-group member above.
- Artifact: `atlas-v2-national-diagnostic-35720874446`, artifact ID
  `10693289780`, final size `13041` bytes, containing only
  `v2-refresh-status.json` and `v2-bus-manifest.json`. The artifact ZIP digest
  is `885d9fbcba5b2607ed4bd81ff93c7120ea5b39a811e0eddf11ba83fb119d4300`.
  No raw XML, CSV or ZIP source material was included.
- Checkpoint creation/save, reference-data checkout, Bus/TNDS publication,
  application configuration, Pages upload and Pages deployment were all
  skipped. The seven external repositories' default `main` refs remained at
  their verified pre-run SHAs; no publication repository was checked out by
  the failed diagnostic path.

## Compatibility and test evidence

- The accepted candidate compatibility fingerprint remains
  `37b9c781b18e05fee6948388be3e023a076c66f1b1108a8f6a2a603305fdf60b`.
  Protected candidate-generation inputs were not changed on the branch. The
  workflow could not emit a fresh candidate fingerprint because validation
  stopped before the diagnostic step.
- Before dispatch, the focused Python diagnostic tests, the automated refresh
  contract, the candidate-checkpoint compatibility suite and the complete
  Alpha.15 deterministic suite passed. No post-run code or test changes were
  made.
- No manual test was required or performed for this diagnostic-only sprint.

## Final interpretation

This record is evidence for Technical Director review only. The branch is not
ready for manual diagnostic acceptance because the one controlled run failed
before the national diagnostic could execute. It does not approve runtime
StopArea completion, publication, Pages deployment, checkpoint creation, or a
subsequent production refresh. The next action requires Technical Director
review of the missing active logical-group member `0170SGP90856`; no automatic
correction or rerun is authorised by this record.
