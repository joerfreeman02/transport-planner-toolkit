# BUS-DATA-TRUST-R45-C1 Reconciliation Contract Closeout

## Identity and scope

- Repository: joerfreeman02/transport-planner-toolkit
- Branch: codex/atlas-bus-data-trust-r45-c1-reconciliation-contract-closeout
- Starting SHA and merge base: a2b6251f78a531f284b1b9467aaa04c89e04c22f
- Implementation SHA: eaaad9299ec8b420fbd50076cc247959de022b61
- Version/build: 2.0.0-alpha.15 / ATLAS-2.0.0-alpha.15-20260914
- Run under review: 38731043427

This is a diagnostic reconciliation correction only. TNDS remains an independent comparator, plannerEligible=false, and source and planner authority remain unchanged. No Bus planner intelligence, source preparation, source evidence, stop semantics, publication behavior, or projection-byte semantics were changed.

## Run #45 defect and correction

Run #45 correctly restored and verified the frozen checkpoints, but its comparison code passed a derived regional coverage summary to reconcile() where the comparator requires the raw TNDS regional evidence manifest with a regions map. The comparator consequently emitted COMPARATOR_UNAVAILABLE for every in-scope region even while the outer summary reported NATIONAL_COMPLETE.

run_reconciliation.py now keeps the raw regional manifest and validated coverage summary as separate values. The raw manifest reaches each comparator call; the summary remains the completeness gate and report metadata. The processing entry point rejects a summary-shaped object where the raw manifest is required. After processing, a NATIONAL_COMPLETE run with any in-scope COMPARATOR_UNAVAILABLE rows deletes the partial ledger and raises a precise error before summary artifacts can be emitted.

The regression fixture has a shared, validated identity and proves active candidate comparison, an exact identity pair, and EVIDENCE_AGREEMENT. It also proves that complete coverage has no unavailable rows. Separate tests exercise the coverage-summary shape failure, partial-region fail-closed behavior, and the national unavailable-row invariant.

## PRIMARY service-count provenance

The Run #45 checkpoint manifest reports legacy PRIMARY service counts of zero, despite containing 1,450,209 projected evidence rows. Reconciliation now derives distinct PRIMARY service counts while streaming checkpoint rows into its existing SQLite spool:

- Identity key: (canonical region, nativeIds.preparedServiceId).
- Backward-compatible fallback: (canonical region, nativeIds.sourceArchive, nativeIds.sourceServiceId) when the prepared ID is missing.
- Region totals cover EA, EM, NE, NW, SE, SW, WM, Y, and LONDON; repeated stop evidence for one service is counted once per region.
- Rows without a stable service identity are reported separately.

The summary’s primaryServiceCount and primaryInputServices use the derived count. primaryServiceCountDerivation explicitly reports its basis, derived total and regional counts, missing-identity rows, and the legacy checkpoint-reported total, input count, and regional counts. No Run #38 service totals are hard-coded.

Synthetic tests verify region-safe de-duplication and that legacy zeros are not represented as the real population.

## Unresolved identities and London scope

The unresolved summary is now schema atlas-primary-unresolved-reconciliation-summary-v3. It distinguishes:

- uniqueRawGtfsStopIdCount: distinct raw stop ID tokens across all unresolved calls.
- uniqueRegionScopedStopIdentityKeyCount: distinct (region, normalized stop ID) keys.
- tndsComparatorScopeUniqueRegionScopedKeyCount: those keys in EA, EM, NE, NW, SE, SW, WM, and Y.
- tndsComparatorScopeKeysReferencedByTndsCount and tndsComparatorScopeKeysAbsentFromTndsCount: the found/absent split over that same in-scope denominator.
- London’s outside-scope unique keys and unresolved call count.

London is not searched as if it were TNDS absence. Existing exact region-scoped reference counts remain explicit and count matching unresolved call records separately from unique keys. Tests cover a raw ID shared across regions, an in-scope TNDS reference, an in-scope absence, and a London key.

## Checkpoint and workflow compatibility

The correction did not modify reconciliation_projection.py, reconciliation_checkpoint.py, preparation code, or tnds_reconciliation.py. The computed projection compatibility fingerprint remains exactly 74a75bdb3da404f401521e21bafd430aafb7076e21186e634e615e7878404a66, matching both Run #45 checkpoint manifests. The checkpoint lineage test accepts an ancestor-produced checkpoint on the new branch and continues to reject unrelated branches.

The new exact branch is included only where needed for checkpoint retry, lineage, and the reusable reconciliation workflow. Its dispatcher selector accepts only workflow_dispatch, prepared_schema=v2, measure_only=true, force_refresh=true, and resume_checkpoint_run_id=38731043427; other run IDs and preparation modes are rejected. Existing controlled producer branches remain allowed. The retry path restores Run #45’s existing artifacts:

- PRIMARY: atlas-primary-reconciliation-checkpoint-38731043427, artifact ID 11973245186, digest sha256:e135d52abfb36eba1341ac814aa3e0d5e81e568edb2c8de2f6afea31a11a482b
- TNDS: atlas-tnds-reconciliation-checkpoint-38731043427, artifact ID 11974819296, digest sha256:ddfa7dee4b2a41cccc49e9b8f77bb68069e8aef7138c8ad322bbb484a0e293bc

Both checkpoints expire 2027-01-13. No checkpoint was reacquired or re-prepared during this sprint.

## Changed files

1. .github/workflows/atlas-bus-data-c3-reconcile.yml
2. .github/workflows/atlas-bus-data-refresh.yml
3. tools/atlas-bus-data/run_reconciliation.py
4. tools/atlas-bus-data/test_c3_c1_checkpoint_compatibility.py
5. tools/atlas-bus-data/test_c3_workflow_contract.py
6. tools/atlas-bus-data/test_run_reconciliation.py
7. tools/atlas-bus-data/test_tnds_trust_workflow_contract.py
8. docs/atlas/BUS-DATA-TRUST-R45-C1-RECONCILIATION-CONTRACT-CLOSEOUT-HANDOVER.md

## Verification

- Full Python Bus-data suite: 250 tests passed (python -m unittest discover -p 'test_*.py' from tools/atlas-bus-data).
- Focused Run #45 contract, matching, unresolved-metric, checkpoint-lineage, and workflow tests passed. The full suite also ran the scale rehearsal, checkpoint compatibility, Pipers Lane, and Queensgate BCE tests.
- Node Alpha.15 deterministic suite: passed, with sentinel ATLAS Alpha.15 deterministic suite passed.
- git diff --check: passed before commit; final check is repeated after this document is added.
- Run #45 projection fingerprint: exact match, 74a75bdb3da404f401521e21bafd430aafb7076e21186e634e615e7878404a66.

The test suite uses local synthetic fixtures and mocked source transfers; no external BODS, NaPTAN, NPTG, TNDS, TfL, or iBus source acquisition was performed for this sprint. No GitHub Actions run was dispatched.

## Limitations and next action

The code correction and regression tests do not establish national trust. The new code must be exercised against the preserved Run #45 checkpoints. Review this branch and handover first, then, if accepted, manually dispatch the checkpoint-only retry on this branch with prepared_schema=v2, measure_only=true, force_refresh=true, and resume_checkpoint_run_id=38731043427. That retry must restore only the two Run #45 checkpoints and must not run BODS/NaPTAN/NPTG or TNDS preparation or acquisition.

Do not declare the Bus Intelligence Trust Gate passed before reviewing the retry’s actual evidence. Pipers Lane and Peterborough / Queensgate remain controls for manual review; no route outcome is hard-coded.

## GitHub tooling adoption review

- Dependabot: configured; no change.
- Codecov: deferred pending a formal coverage baseline.
- OpenSSF Scorecard: later release/security milestone.
- Sentry: deferred pending telemetry/privacy architecture.
- Renovate: do not duplicate Dependabot absent an approved reason.

No tooling installation milestone is created by this correction.
