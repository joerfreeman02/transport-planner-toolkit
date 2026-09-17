# ADR-001: ATLAS reference-data publication layer

Status: Proposed for Technical Director review
Date: 2026-09-17
Scope: Transport Planner Toolkit / ATLAS infrastructure

## Decision

Keep the ATLAS application shell in the existing
`joerfreeman02/transport-planner-toolkit` Pages site. Publish prepared Bus and
TNDS data in separate TPT-owned GitHub Pages project repositories. Each
publication repository contains only two bounded slots, `slot-a/` and
`slot-b/`, plus small lifecycle and audit JSON. The app config points to the
active slot; a refresh stages the new candidate in the inactive slot while
retaining the active slot for rollback.

The candidate is measured independently from enforcement. Diagnostics always
report complete Bus/TNDS totals, largest files, blue-green projections,
proposed-group fit booleans and all authoritative TNDS regions (`EA`, `EM`,
`NE`, `NW`, `SE`, `SW`, `WM`, `Y`). Malformed, ambiguous or missing expected
regional identity still fails the diagnostic. Production publication remains
fail-closed at a 900,000,000-byte safe site budget, including rollback and
audit metadata, below the 1,000,000,000-byte Pages limit.

The publication branch is a dedicated machine branch, `pages-publish`. A
snapshot is built outside the tracked publication checkout in a temporary Git
repository, committed once, and pushed with `force-with-lease` only to that
branch. This avoids orphan-switch failures and prevents full-dataset history
growth. Application `main` remains small and protected by programme
governance; GitHub branch protection is not yet enabled.

The app configuration changes only after both external slot manifests are
served successfully. The generic resolver retains deterministic `pathRoots`
support for future regional routing or NPTG without changing Bus semantics.

## Context and capacity

The accepted Alpha.15 main baseline is
`4e9485efa786fe6a663f6414d098f1fb2fc52a41`.

The prior Pages artifact was `1,756,811,441` bytes, above the Pages limit. The
clean starting tree measured:

| Dataset | Files | Bytes |
| --- | ---: | ---: |
| `atlas/data/bus` | 1,371 | 87,272,247 |
| `atlas/data/bus-tnds` | 2 | 819 |

The fresh national TNDS split is not claimed locally because the prior artifact
has expired and the checkout contains only the small SE fixture. The
review-branch diagnostic can measure an oversized fresh candidate fully before
any publication decision; final TNDS partition topology therefore remains
pending genuine fresh measurements.

## Alternatives rejected

1. Keep application and data in one Pages artifact: the recorded artifact is
   oversized.
2. Retain immutable `releases/<version>/` directories: full-data history grows
   without bound and consumes rollback capacity.
3. Assume one national TNDS root fits: fresh national data is unmeasured and
   regional identity must be explicit.
4. Truncate or reduce authoritative data: this would change coverage.
5. Add a paid object store: not required while bounded GitHub-hosted sites are
   viable.

## Governance and ownership

The application `main` branch is currently protected by programme governance,
but GitHub branch protection is not yet enabled. It must remain the reviewed
application branch and must never receive generated full datasets.

Publication repositories are TPT-owned ATLAS infrastructure. The machine
branch `pages-publish` is the only automated publication target, and its token
must be scoped to contents read/write for those repositories only. Repository
creation, Pages enablement, branch rules and secret setup remain Product Owner
actions; this task performs none of them.

## Provenance, audit and rollback

Prepared `manifest.json` remains the dataset contract. Each slot adds a
`publication-manifest.json` containing publication version, source manifest
identity, exact payload totals and checksums. Root `publication-state.json`
records lifecycle state and total-site capacity. A bounded `audit/current.json`
and `audit/previous.json` record publication version, generated time,
application/config version, source and candidate hashes, candidate bytes/files,
regional TNDS allocation and active/candidate slots. The audit files are
included in the total-site safety gate; historic full datasets are not.

The refresh sequence is: acquire candidate; validate; measure and allocate
regions; stage inactive slots; size-gate candidate and complete site; create
the external snapshot; push `pages-publish`; wait for both manifests; then
install the app config and deploy the small shell. Failure before the final
app deployment leaves the previous config and active slots usable.

## Review-branch diagnostic

A manually dispatched non-main workflow run is inherently diagnostic-only. It
may acquire, prepare, validate and measure fresh data, but cannot require
publication repositories or the publication token, push data, configure Pages,
upload an app artifact or deploy. Main runs retain optional `measure_only`
support, while normal publication and deployment remain main-only.

## Tooling adoption review

- Dependabot: retain/enabled for Actions and dependency updates.
- Codecov: optional; not required for this deterministic contract-test change.
- OpenSSF Scorecard: recommended for app and publication repositories.
- Sentry: not adopted for this static data transport layer.
- Renovate: not adopted alongside Dependabot.
- Branch protection: programme governance protects application `main` now;
  GitHub branch protection is not yet enabled and remains a Product Owner
  follow-up.

## Future NPTG

NPTG is not implemented and no NPTG source is acquired. Configuration and
resolver extension points remain available without changing Bus semantics.
