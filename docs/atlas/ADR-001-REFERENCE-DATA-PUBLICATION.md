# ADR-001: ATLAS reference-data publication layer

Status: Proposed for Technical Director review
Correction: BUS-RECOVERY-0D.1
Date: 2026-09-17

## Decision

Keep the ATLAS application shell in the existing
`joerfreeman02/transport-planner-toolkit` Pages site. Keep human-governed
source/configuration code on the application branch. Publish prepared Bus and
TNDS data to separate TPT-owned publication roots on their machine-managed
`pages-publish` branches.

Every root has exactly two data slots, `slot-a/` and `slot-b/`, plus bounded
lifecycle metadata. A refresh writes the inactive slot and retains the active
slot as rollback. There is no `releases/<version>/` directory and no generated
full dataset is committed to application `main`.

TNDS regions retain their authoritative identities (`EA`, `EM`, `NE`, `NW`,
`SE`, `SW`, `WM`, `Y`). The measured regional shards are assigned as complete
regions to a deterministic capacity-fit set of publication roots. Shards are
never silently dropped or split, and each shard maps to exactly one root. A
root list is supplied by deployment configuration; diagnostics can produce a
virtual root proposal before external roots exist. If one region cannot fit
the safe two-slot budget, publication stops and reports the blocker.

## Capacity and lifecycle

The GitHub Pages nominal limit is 1,000,000,000 bytes. The operational safe
limit is 900,000,000 bytes, deliberately leaving a 100,000,000-byte margin.
The calculation covers the resulting site, not an individual release:

`current slot + candidate slot + bounded metadata <= 900,000,000`

`PUBLICATION_METADATA_BUDGET_BYTES` is 1,000,000 bytes for planning. The
staging gate measures the actual resulting tree, including manifests, audit
records and state, and applies the same safe limit. The diagnostic reports
candidate totals, current footprint, candidate/rollback overhead, total root
footprint, remaining margin, largest files and largest shards.

The lifecycle is:

1. Acquire and prepare a complete candidate.
2. Validate the candidate and calculate all regional allocations.
3. Stage the inactive slot in every required root and size-gate each resulting
   root.
4. Publish the bounded snapshots to the machine branch.
5. Validate every root's manifest identity, indexed file bytes, per-file
   SHA-256 and aggregate checksum; also verify every manifest-referenced shard
   is present across the roots.
6. Install the one candidate application configuration and deploy the shell.

The application configuration is not installed after availability checks
alone. A failed candidate therefore cannot replace the known-good configuration.
The previous slot remains available for rollback. `promoteBoundedPublication`
and `rollbackBoundedPublication` record the corresponding lifecycle state;
application rollback uses the previous validated configuration and slot set.

## Governance and authentication

The application branch is human-governed and should use normal review and
branch protection. Machine publication is limited to the dedicated
`pages-publish` branch in the data repositories. The workflow token is scoped
to contents read/write for those configured publication repositories only; it
does not write application source `main`. No token, secret, repository or Pages
setting is created by this sprint.

The workflow's normal publication path remains `refs/heads/main` after human
review. Manual non-main runs are diagnostic-only and cannot require publication
credentials, push data or deploy Pages.

## Provenance and audit

Prepared `manifest.json` remains the authoritative dataset contract. Each slot
adds a publication manifest containing source identity, publication version,
regional allocation and an exact indexed payload checksum. `publication-state`
contains the lifecycle and capacity result. Only `audit/current.json` and
`audit/previous.json` are retained, with version, timestamp, source hash,
prepared-manifest identity, aggregate checksum, file/byte counts, regional
allocation and configuration version. Historic complete datasets are not
retained for audit purposes.

## Fresh national-data diagnostic

The repository checkout contains a small TNDS fixture and is not evidence of a
fresh national acquisition. `measureCandidateDatasets()` therefore labels the
coverage as `fixture-or-incomplete-region-set` when the complete eight-region
set is absent, and states that freshness is not inferred from bytes. The
non-main workflow can acquire, prepare and measure fresh data without changing
production state. No genuine fresh national measurement is claimed by this
branch.

## Superseded 0D design

The original unbounded `releases/version-*` model is superseded by the bounded
two-slot model. The original single-root TNDS assumption is superseded by
region-aware root allocation. HTTP-200 availability polling is retained only
as a wait primitive; publication identity, checksums and required contents are
now validated before configuration installation. The protected-main/direct-
push contradiction is resolved by publishing only to machine-managed data
branches.

## Alternatives rejected

1. Keeping immutable full releases indefinitely: unbounded repository and site
   growth.
2. Truncating regions, services, stops or timetable fidelity: changes the
   authoritative dataset and is prohibited.
3. Blindly creating eight repositories: unnecessary; measured bin packing uses
   a measured number of roots that fit.
4. Treating a per-release check as sufficient: the lifecycle requires total
   resulting-site measurement.
5. Bypassing source-branch protection: generated data belongs on the machine
   publication branch.

## Tooling adoption review

- Dependabot: retain for Actions and dependency updates.
- Codecov: optional; not required for this deterministic infrastructure suite.
- OpenSSF Scorecard: recommended for application and publication repositories.
- Sentry: not adopted for static reference-data publication.
- Renovate: not adopted alongside Dependabot.

## Scope exclusions

No Bus planner semantics, nearby-stop discovery, service selection, BODS/TNDS
interpretation, NaPTAN logic, route grouping, calendars, frequencies,
presentation, Word export, Alpha.15 release version or NPTG implementation was
changed. This is BUS-RECOVERY-0D.1 infrastructure work only.
