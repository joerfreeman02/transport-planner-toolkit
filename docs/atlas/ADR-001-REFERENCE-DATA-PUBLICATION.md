# ADR-001: ATLAS reference-data publication layer

Status: Proposed for Technical Director review
Date: 2026-09-17
Scope: Transport Planner Toolkit / ATLAS infrastructure

## Decision

Keep the ATLAS application shell in the existing
`joerfreeman02/transport-planner-toolkit` Pages site. Publish prepared Bus and
TNDS data in separate TPT-owned GitHub Pages project repositories. Each
publication repository contains only two bounded slots, `slot-a/` and
`slot-b/`, plus lightweight lifecycle metadata. The application config points
to the active slot; a refresh stages the new candidate in the inactive slot
while retaining the active slot as the rollback copy, then changes the app
config only after both sites serve their manifests.

The publication branch is a dedicated machine branch, `pages-publish`. The
application repository `main` remains small and protected. Generated payloads
are never committed to application `main`, and refreshes force-update only the
publication branch after creating a single reachable snapshot commit; this
prevents full-dataset history from growing on every refresh.

The application consumes `atlas/config/atlas-data-sources.mjs`, generated only
after both bounded publications pass local size and manifest checks. The
generic resolver retains deterministic `pathRoots` support for future logical
partitioning and a future NPTG entry without changing Bus semantics.

## Context and measured capacity

The accepted Alpha.15 main baseline is
`4e9485efa786fe6a663f6414d098f1fb2fc52a41`.

The prior Pages artifact was recorded at `1,756,811,441` bytes, over the
1,000,000,000-byte GitHub Pages site limit. In the clean baseline checkout,
the prepared roots measure:

| Dataset | Files | Bytes |
| --- | ---: | ---: |
| `atlas/data/bus` | 1,371 | 87,272,247 |
| `atlas/data/bus-tnds` | 2 | 819 |
| `atlas/data/status` | 0 in checkout | not present before refresh |

The fresh artifact has expired, so no fresh national TNDS size is claimed
locally. The publisher now measures the fresh candidate before publication and
prints Bus totals, TNDS totals, largest contributors, aggregate SHA-256 values,
and TNDS allocations for the authoritative national regions:
`EA`, `EM`, `NE`, `NW`, `SE`, `SW`, `WM`, and `Y`. Every TNDS service shard must
map to exactly one of those regions; a manifest declaring expected regions must
contain all of them. The diagnostic also prints proposed publication groups.

Every individual candidate and the complete bounded site, including the
retained rollback slot and lifecycle metadata, must fit the safe budget of
900,000,000 bytes. The remaining 100,000,000 bytes is an explicit safety
margin below the 1 GB Pages limit. No truncation or unmeasured one-root
assumption is permitted.

## Alternatives considered

1. Continue publishing the application and all prepared data together.
   Rejected: the recorded artifact exceeds the Pages limit.
2. Keep immutable `releases/<version>/` directories on one Pages site.
   Rejected: retained full releases grow without bound and make rollback
   capacity unsafe.
3. Assume one national TNDS root is below 1 GB.
   Rejected: fresh national TNDS has not been measured and regional identity
   must remain explicit.
4. Compress or truncate prepared data further. Rejected: the service shards
   are already compressed and truncation would reduce authoritative coverage.
5. Introduce a paid or third-party object store. Rejected under the no-cost
   constraint while bounded GitHub-hosted sites remain viable.

## Ownership and governance

The additional repositories are TPT-owned infrastructure for ATLAS reference
data. They must not contain DFT or unrelated Toolkit functionality. Repository
creation, Pages enablement, branch protection and token setup remain Product
Owner actions; this branch creates none of them.

The app `main` branch remains protected and review-governed. The two
publication repositories use a narrow machine publication branch with a token
scoped only to their contents. Human changes to publication workflow or
governance continue through reviewed application changes. A publication push
is the only machine write and is performed after the complete site gate.

## Versioning, provenance and validation

The existing prepared `manifest.json` remains the dataset contract, including
schema, generatedAt/snapshot date, source metadata and shard maps. Each slot
adds `publication-manifest.json` with publication version, source-manifest
identity, exact payload file count/bytes, aggregate SHA-256 and per-file
checksums. Root `publication-state.json` records active/candidate slots,
rollback slot, regional allocation and measured total-site bytes.

The active app config carries the publication identifier and selected slots.
The candidate refresh still acquires NaPTAN, BODS and TNDS through the
existing authoritative updater, validates all candidate shards, measures the
full candidate and regional TNDS allocation, stages both inactive slots, waits
for both Pages sites, and only then deploys the small app shell.

## Updater and rollback behavior

1. Build the candidate in an isolated working tree.
2. Run the existing candidate and deterministic ATLAS validations.
3. Measure Bus and TNDS totals and TNDS regional groups.
4. Stage each candidate in the inactive slot and retain the active slot.
5. Reject if either candidate or either complete two-slot site exceeds the
   900 MB safe budget.
6. Push the bounded publication branch snapshots and wait for both manifests.
7. Remove the large data roots from the app Pages payload and deploy the new
   app config.

If acquisition, validation, measurement, either publication push, availability
check or app deployment fails, the prior deployed app config and active slots
remain usable. Rollback is a redeploy of the prior app config; a later refresh
reuses the other bounded slot. No historical full-data releases are retained.

## Future NPTG compatibility

NPTG is not implemented and no NPTG source is acquired. The generic
`datasets` configuration and resolver accept a future `nptg` entry and
deterministic path mappings without changing the Bus adapter or planner
semantics.

## GitHub tooling adoption review

- Dependabot: retain/enabled for Actions and dependency updates.
- Codecov: optional; not required for this deterministic contract-test change.
- OpenSSF Scorecard: recommended for the app and publication repositories.
- Sentry: not adopted; this is a static data transport change.
- Renovate: not adopted alongside Dependabot.
- Branch protection: required on application `main`; the machine branch is
  deliberately separate and narrowly scoped, with repository settings owned by
  the Product Owner.
