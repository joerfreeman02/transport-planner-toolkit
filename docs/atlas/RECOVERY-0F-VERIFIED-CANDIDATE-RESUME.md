# Recovery-0F.1: verified candidate resume

Status: Recovery-0F.2 implementation on the dedicated branch; no production run or publication was performed.

## Run #23 root cause

Run #23 reached candidate validation, deterministic ATLAS checks, capacity measurement, Bus publication checkout and inactive TNDS-bank checkout. It then invoked publication preparation with:

```text
--generated-at "${{ github.run_started_at }}"
```

`github.run_started_at` is not a documented Actions context property. GitHub therefore resolved it to an empty string and `publication.mjs` correctly rejected the required argument with `Missing --generated-at`. The defect was deterministic and unrelated to national data acquisition.

Recovery-0F removes that context dependency. The refresh builder now gives Bus and TNDS the same candidate-generation timestamp, and the workflow resolves that timestamp from the validated candidate manifests before publication.

## Timestamp semantics

`generatedAt` means the UTC start of the authoritative candidate refresh transaction. It is written to the Bus prepared manifest, TNDS prepared manifest and validated refresh-status manifest. It is a candidate timestamp, not a publication-attempt timestamp. A restored candidate keeps the same value when its publication is retried.

The publication version remains the stable workflow-run identity `${github.run_id}-${github.sha}`. This separates candidate generation time from publication-attempt time while keeping the exact candidate identity stable across a rerun of the same workflow run.

## Checkpoint mechanism

The checkpoint uses GitHub Actions cache only as transient runner-to-runner transport. It is not an authoritative source and does not replace DfT, NaPTAN, BODS, TNDS or the validated publication repositories.

The cache contains only verified candidate material from the prepared site. Its
paths are:

```text
pages-site/atlas/data/bus
pages-site/atlas/data/bus-tnds
pages-site/atlas/data/status
pages-site/atlas/config/atlas-candidate-measurement.json
pages-site/.atlas-recovery/verified-candidate.json
```

The v2 exact key is:

```text
atlas-verified-candidate-checkpoint-v2-<producer-workflow-run-id>
```

`github.run_attempt` is recorded for evidence but is deliberately not part of the key: rerunning the same failed workflow run must be eligible to reuse its candidate. A new run selects its own key unless an operator explicitly supplies `resume_checkpoint_run_id` on a trusted manual dispatch. There are no `restore-keys`.

GitHub cache retention and eviction are operational limitations. A cache miss, eviction or unavailable cache causes fresh authoritative acquisition. The cache is also scoped by key/version/branch, and the manifest independently checks the workflow run, commit, workflow name and exact key.

The checkpoint manifest at `.atlas-recovery/verified-candidate.json` records:

- checkpoint schema/version and exact cache key;
- separate producer and current-run workflow identity, including original run attempt and application commits;
- ATLAS release/build identity;
- candidate-generation timestamp;
- candidate-generation compatibility fingerprint and freshness bound;
- Bus and TNDS file counts, byte counts, aggregate SHA-256 values, manifest SHA-256 values, schemas and timestamps;
- capacity-gate results and validation state;
- required manifest/configuration paths.

No token, credential-bearing URL or raw source archive is included in the checkpoint contract. The cache contains prepared public candidate data, so the workflow must remain trusted and the path must not be expanded to include secrets.

## Resume contract

### Normal fresh run

The workflow prepares the isolated Pages site, fetches last-known-good metadata, runs production preflight and attempts the exact checkpoint restore. On a miss or invalid restore it cleans candidate data and performs the authoritative national acquisition. Candidate validation, deterministic ATLAS checks, capacity measurement and timestamp resolution are mandatory.

### Successful checkpoint creation

Only after all three prerequisite gates pass does the workflow write the checkpoint manifest and save the candidate-only payload under the exact producer-run key. Capacity must pass both the Bus safe limit and deterministic TNDS root allocation limits.

### Downstream failure and retry

A failure during publication preparation, external publication, publication wait/validation, application configuration, Pages upload or Pages deployment leaves the validated candidate cache available for a controlled rerun of the same workflow run. The rerun restores the exact key, independently verifies the manifest and aggregate hashes, runs the candidate validator again, reruns deterministic ATLAS checks, remeasures capacity and only then skips acquisition.

### Invalid cache

The cache action's exact-hit signal is necessary but not sufficient. Missing, partial, corrupt, incomplete, wrong-schema, wrong-run, wrong-commit, wrong-release, wrong-timestamp, manifest-mismatched or hash-mismatched checkpoints are rejected. The workflow cleans the restored candidate and falls back to fresh acquisition; it never publishes an unverified restore.

### New genuine refresh

A new scheduled or manually dispatched run has a different run ID. It selects an older checkpoint only when the operator explicitly supplies `resume_checkpoint_run_id` from trusted `main`; otherwise source freshness rules and candidate identity govern a new refresh.

## Failure-domain review

The reviewed path starts after candidate validation and ends at Pages deployment.

Corrected defects:

1. Undefined `github.run_started_at` publication plumbing. The timestamp now comes from validated candidate metadata.
2. Capacity measurement was diagnostic-only and did not itself stop an over-limit production candidate before publication staging. Recovery-0F adds an explicit production capacity gate before checkpoint creation and external publication.

Verified existing safeguards retained:

- inactive TNDS bank selection and active-bank refusal;
- deterministic exact-minimax region allocation;
- Bus two-slot lifecycle and rollback metadata;
- per-root safe capacity and Git blob limits;
- exact publication-version, bank/root/slot wait identity;
- cross-root completeness and byte/hash validation;
- transient Git askpass token handling and `force-with-lease`;
- first-publication bootstrap preflight;
- generated configuration and final artifact checks;
- Pages configure/upload and deployment gating.

No further deterministic blocker was evidenced in the repository path. This is a static/deterministic conclusion: it does not claim live GitHub permission, Pages propagation or external repository publication success.

Non-blocking warning: existing official setup/checkout actions have Node-runtime maintenance warnings in Actions. They were not upgraded in this bounded sprint because no compatibility test or migration need justified unrelated action churn. Dependabot remains the maintenance path.

## Operator procedure after a downstream failure

1. For a fresh Run #24, leave `resume_checkpoint_run_id` empty: acquire, validate, save candidate-only checkpoint material, then publish.
2. If Run #24 fails downstream without a code correction, rerun Run #24.
3. If a code correction is required, start a new manual `main` workflow and enter `resume_checkpoint_run_id=<Run #24 ID>`.
4. Confirm only the candidate payload was restored, current application files remain current, and current validation, deterministic, capacity, freshness and provenance checks pass.
5. Confirm publication wait and cross-root validation pass before Pages upload/deployment is allowed.
6. If the exact cache is absent, stale, immutable-invalid or incompatible, allow fresh authoritative acquisition; do not bypass validation.

Run #23 itself remains unrecoverable: its ephemeral runner is gone and it created no persisted checkpoint. Recovery-0F protects a future validated candidate from avoidable late-stage reacquisition; it does not recover Run #23's candidate.

## Boundaries and risks

Checkpointing still requires fresh acquisition when the cache is evicted or absent, authoritative acquisition was incomplete, candidate validation originally failed, source freshness requires a new dataset, candidate integrity cannot be proven, or the requested run is a genuinely new refresh. Cache retention is not a service-level guarantee. A late failure after external publication may leave inactive repositories partially updated, but active TNDS state and the deployed last-known-good application remain protected by the existing inactive-bank and exact-config gates.

Alpha.15 planner semantics, NPTG status (`NULL / UNIMPLEMENTED`), source interpretation, timetable logic, grouping, frequency, destination logic, UI, Word output and planner wording are unchanged. This is infrastructure/recovery metadata only; no new ATLAS release number is introduced.

## GitHub tooling adoption review

- Dependabot: retain.
- Renovate: do not run alongside Dependabot.
- Codecov: optional bounded pilot later.
- Sentry: defer for static publication/privacy/telemetry reasons.
- OpenSSF Scorecard: possible later adoption.
- `main` branch protection: remains a post-State-C Product Owner authorization item.
- `pages-publish` machine branches: remain compatible with approved `force-with-lease` publication.

## Recovery-0F.1 cross-commit resume contract

The v2 checkpoint key is based on the producer workflow run only:

```text
atlas-verified-candidate-checkpoint-v2-<producer-workflow-run-id>
```

There are still no `restore-keys`. A different workflow run may select an
older key only when an operator manually dispatches from trusted `main` with
`resume_checkpoint_run_id=<producer run ID>`. The workflow requests exactly
that key and rejects the input outside `refs/heads/main`; it never searches by
prefix or silently falls back to another run.

The checkpoint records producer run/attempt/SHA/ref/workflow/event, candidate
timestamp, status-manifest checksum, measurements, release/build and the
candidate-generation compatibility fingerprint. The fingerprint is explicitly
schema-versioned and covers generator-sensitive code only: `build_static_index.py`,
`refresh_bus_data.py`, `prepare_tnds.mjs`, the TransXChange adapter, scheduled
evidence rules and release metadata. Current validation, measurement,
publication preparation, workflow and checkpoint-orchestration code runs again
and is deliberately excluded. The fingerprint implementation itself is not
hashed. Therefore a correction to publication preparation or transport remains
eligible to operate on a compatible candidate, while a generator or output
schema change invalidates reuse.

Cross-run restore requires the original producer to be a trusted production
`main` run, the current workflow to have the same candidate-generation
fingerprint, and the candidate to remain within the Bus manifest's
`refreshAfterDays` freshness bound (currently eight days). Candidate validator,
deterministic checks, capacity measurement, status provenance and timestamp
checks run again. The candidate timestamp and producer identity remain
unchanged. The current workflow uses the restored candidate for publication;
it does not rebase or duplicate the checkpoint under a new run key.

The cache is immutable. If an exact same-run entry is present but invalid, the
workflow performs fresh acquisition but does not claim to replace that entry
under the same key. The log records this condition; a future retry will again
fail closed against the immutable invalid entry unless a new producer run is
used.

Run #23 remains unrecoverable because its ephemeral runner created no
checkpoint. Recovery-0F.1 does not dispatch or recover Run #24.
