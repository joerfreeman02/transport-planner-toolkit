# ATLAS BUS-DATA-V2-2 National Diagnostic

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

This section is completed from the single GitHub Actions run after dispatch. A
failed run is preserved and is not automatically rerun.

- Branch: `codex/atlas-bus-data-v2-national-diagnostic`
- Starting main: `2fe88745419ca1197609e03c3e489b1b12b3aa20`
- Inputs: `prepared_schema=v2`, `measure_only=true`, `force_refresh=false`,
  `resume_checkpoint_run_id` unset
- Workflow run number / ID / URL: pending controlled dispatch
- Workflow head SHA: pending controlled dispatch
- Diagnostic status and artifact: pending controlled dispatch

## Final interpretation

This record is evidence for Technical Director review only. It does not approve
runtime StopArea completion, publication, Pages deployment, checkpoint creation,
or a subsequent production refresh.
