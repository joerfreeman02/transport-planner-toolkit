# ADR-001: ATLAS reference-data publication layer

Status: Proposed for Technical Director review
Date: 2026-09-17
Scope: Transport Planner Toolkit / ATLAS infrastructure

## Decision

Keep the ATLAS application shell in the existing
`joerfreeman02/transport-planner-toolkit` Pages site. Publish prepared
reference datasets as immutable, versioned roots in separate TPT-owned GitHub
Pages project repositories:

- one Bus publication root for `atlas/data/bus`;
- one TNDS publication root for `atlas/data/bus-tnds`;
- future datasets, such as NPTG, receive their own dataset entry and
  publication root without changing Bus code.

The application consumes `atlas/config/atlas-data-sources.mjs`, generated only
after both dataset publications pass validation. The configuration contains the
dataset base URLs, manifest names, publication version and optional
path-to-root mappings. The resolver supports deterministic `pathRoots` mappings
if a future dataset needs logical partitioning into more than one Pages
project site; it does not truncate or silently omit files.

Each publication is written below an immutable `releases/<publicationVersion>/`
path. The app configuration switches from the prior version only after both
publication repositories have accepted their new version. The previous app
configuration remains the rollback target if either publication or the app
deployment fails.

## Context and measured capacity

The accepted Alpha.15 main baseline is
`4e9485efa786fe6a663f6414d098f1fb2fc52a41`.

The prior Pages artifact was recorded at `1,756,811,441` bytes, over the
1 GB GitHub Pages site limit. In the clean baseline checkout, the prepared
roots measure:

| Dataset | Files | Bytes |
| --- | ---: | ---: |
| `atlas/data/bus` | 1,371 | 87,272,247 |
| `atlas/data/bus-tnds` | 2 | 819 |
| `atlas/data/status` | 0 in checkout | not present before refresh |

The fresh artifact itself has expired, so the exact fresh Bus/TNDS split is not
available locally. The 0C evidence estimates fresh generated data at about
1.749 GB. The publication tool therefore measures every candidate root and
fails before copying/publishing any over-limit dataset.

## Alternatives considered

1. Continue publishing the application and all prepared data together. Rejected:
   it exceeds the Pages limit.
2. Exclude tests, docs, tools or other repository content. Rejected: those
   files total only about 7.4 MB and are not the capacity problem.
3. Compress or truncate prepared data further. Rejected: the service shards
   are already gzip-compressed; truncation would reduce authoritative coverage.
4. Introduce a paid or third-party object store. Rejected: it violates the
   no-cost constraint and is unnecessary while GitHub-hosted project sites fit.
5. GitHub Releases. Retained as a fallback alternative if Pages project sites
   cannot be enabled for the additional repositories, but it is less natural
   for the current browser HTTP shard model and does not provide the same
   static-root behavior without an additional download/hosting layer.

## Ownership and governance

The additional repositories are TPT-owned infrastructure for ATLAS reference
data. They are not a shared cross-Toolkit component and must not contain DFT
or unrelated Toolkit functionality. Repository creation and Pages enablement
remain Product Owner actions; this branch does not create repositories or
change GitHub settings.

## Versioning, provenance and validation

The existing prepared `manifest.json` remains the dataset contract, including
schema, generatedAt/snapshot date, source metadata, source hashes and shard
maps. Each publication adds `publication-manifest.json` with the publication
version, source-manifest identity, exact payload file count/bytes and a
deterministic aggregate plus per-file SHA-256 checksums.

The active app config is versioned with the same publication identifier. The
candidate refresh still acquires NaPTAN, BODS and TNDS through the existing
authoritative updater, validates all candidate shards, then publishes the
immutable roots before the app Pages artifact is uploaded.

## Updater and rollback behavior

1. Build the candidate in an isolated working tree.
2. Run the existing candidate and deterministic ATLAS validations.
3. Measure and prepare Bus and TNDS publication roots; reject any root over
   `1,000,000,000` bytes before external publication.
4. Push the immutable Bus version, then the immutable TNDS version.
5. Generate the app config pointing at both newly published versions and
   remove the large data roots from the app Pages payload.
6. Upload/deploy the app shell only after the two dataset pushes succeed.

If candidate validation, measurement, either dataset push or app deployment
fails, the prior app config remains active. A rollback redeploys the prior app
config; immutable dataset versions are retained for audit and do not need to be
deleted.

## Future NPTG compatibility

NPTG is not implemented and no NPTG source is acquired. The generic
`datasets` configuration and resolver already allow a future `nptg` entry and
optional deterministic path mappings. Adding NPTG later should add its own
validator/publication target and config entry without changing the Bus adapter
or planner semantics.

## GitHub tooling adoption review

- Dependabot: retain/enabled for Actions and dependency updates.
- Codecov: optional; not required for this publication-layer change because
  the repository currently relies on deterministic contract tests rather than
  hosted coverage thresholds.
- OpenSSF Scorecard: recommended for the main repository and the two
  publication repositories once they are created.
- Sentry: not adopted; no need to add runtime telemetry for this static data
  transport change.
- Renovate: not adopted alongside Dependabot; avoid duplicate dependency
  automation.
- Branch protection: required on `main` and both publication default branches;
  require pull-request review and passing validation before publication pushes.
