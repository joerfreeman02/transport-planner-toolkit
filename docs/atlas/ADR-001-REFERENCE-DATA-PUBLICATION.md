# ADR-001: ATLAS reference-data publication layer

Status: Proposed for Technical Director review
Correction: BUS-RECOVERY-0D.3D
Date: 2026-09-18

## Decision

ATLAS keeps its application shell and semantic code in the toolkit Pages site.
Machine-generated reference data is published to configured external roots on
their bounded `pages-publish` branches. Bus retains its existing two-slot
bounded lifecycle because the fresh Bus candidate is only 87,651,022 bytes.

TNDS uses two complete publication banks. Each bank has a configurable set of
roots; the approved initial topology is three roots per bank:

```text
Bank A: A1, A2, A3       Bank B: B1, B2, B3
```

Each TNDS root contains one snapshot and bounded metadata. It does not contain
co-resident current and candidate national copies. The active bank is the bank
named by the deployed application configuration. The opposite bank is the
only bank eligible to be overwritten by the next refresh.

## Run #22 capacity evidence

The successful fresh diagnostic run on 2026-09-17 is the engineering evidence
for this correction; development does not acquire national data again.

| Dataset/region | Bytes | Files |
| --- | ---: | ---: |
| Bus | 87,651,022 | 1,370 |
| TNDS national | 2,321,211,471 | 672 |
| EA | 60,883,253 | 71 |
| EM | 275,641,976 | 109 |
| NE | 110,188,604 | 34 |
| NW | 414,171,929 | 96 |
| SE | 519,315,700 | 143 |
| SW | 359,859,025 | 123 |
| WM | 307,380,041 | 58 |
| Y | 273,746,344 | 37 |

Common/non-service TNDS material was approximately 24,599 bytes. The safe
ceiling remains 900,000,000 bytes per root: the GitHub Pages nominal limit of
1,000,000,000 bytes less a deliberate 100,000,000-byte margin. The old
same-root two-slot model would require roughly 1.0397 GB for SE alone. It is
therefore superseded; the ceiling is not weakened and authoritative data is
not discarded.

The allocator assigns complete regions exactly once using an exact deterministic
minimax search. It minimises the largest root footprint and uses stable
region/root ordering as the tie-break. It fails closed if the configured bank
cannot fit the complete candidate. The known Run #22 three-root arrangement
fits below the ceiling, including the metadata budget.

## Refresh and atomic switch

The production sequence is:

1. Read the deployed data-source configuration and active TNDS bank.
2. Select the opposite configured bank.
3. Acquire, prepare, validate and measure the complete candidate.
4. Allocate all eight regions across every candidate-bank root.
5. Stage Bus in its inactive slot and stage every candidate TNDS root.
6. Run the main-only production preflight against the seven external
   repository/site contracts and authenticated Git access before acquisition.
7. Prepare inactive TNDS roots as clean local Git repositories without
   cloning their previous snapshots.
8. Publish all candidate roots using the temporary snapshot and
   force-with-lease branch mechanism.
9. Wait for every remote publication identity, then validate version identity, exact file
   counts/bytes, per-file hashes, aggregate hashes, regions and shard mapping.
10. Install the generated application configuration only after the complete
   candidate bank passes validation, then deploy ATLAS.

If any root fails, the application configuration and active bank remain
unchanged. A partial inactive bank is harmless and will be overwritten on the
next attempt. The active bank is never a staging target.

The configuration records the active bank, publication version, active root
IDs and URLs, exact region allocation, exact service-shard-to-root mapping,
root hashes/manifests, and the still-valid opposite bank for rollback. It also
retains one bounded, non-recursive `rollbackPublication` snapshot containing
the previous publication version/timestamp, Bus slot/base URL, TNDS active
bank/roots/base URL, exact previous `pathMap`/`pathRoots`, manifest identities,
and `nptg: null`. The runtime resolver routes TNDS shards through the mapping;
planner-facing Bus code remains unaware of banks.

## Rollback and lifecycle bounds

The deployed configuration is the authority for active bank identity. Its
`rollbackPublication` is the authority for a coherent previous full
publication. Rollback restores that complete snapshot, including Bus slot,
publication version and every TNDS routing entry, then retains the former
current snapshot as the new bounded rollback target. Rollback does not rebuild
national data. Bus rollback uses its existing previous slot. TNDS roots retain only one generated snapshot plus
`publication-state.json`, `audit/current.json` and at most
`audit/previous.json`; publication branches are replaced with one snapshot
commit, so complete weekly history does not accumulate.

## Operational safety and governance

The workflow timeout is 180 minutes because the genuine Run #22 acquisition
and validation took approximately one hour before publication and remote
checks. No complete 2.3 GB Actions artifact is introduced. Manual non-main
runs remain diagnostic-only: they do not require publication repositories or
tokens, publish, alter Pages, deploy, or change production configuration.

The external contract is `ATLAS_TNDS_BANKS_JSON`, containing bank IDs, root
IDs, repositories and public site URLs. This sprint does not create those
repositories, tokens, secrets or Pages sites.

The production preflight runs before acquisition on main runs only. It rejects
malformed bank JSON, anything other than two banks with three unique roots each,
duplicate bank/root/repository/site identities, invalid HTTPS Pages contracts,
an active bank absent from the contract, an ambiguous candidate bank, a
candidate root that is already active, a missing token, inaccessible publication
repositories, or an unsafe toolkit-repository target. It requires the seeded
`pages-publish` branch and the `atlas-publication-site.json` marker on all seven
sites, performs authenticated `git ls-remote`, and checks reported push
permission for each required repository. Missing branches, unavailable markers
or read-only tokens fail before acquisition. GitHub Pages must be enabled
separately from `pages-publish` at the repository root.

During the initial migration from the existing Alpha.15 single-root/local
configuration, no fictional opposite bank is created. The first controlled
production publication must populate one approved bank and install its
validated configuration; until a second bank has also been populated, rollback
uses the existing deployed Alpha.15 publication/LKG route. Dual-bank rollback
becomes available only after both banks have completed validated publications.

The first-run contract is one Bus site plus TNDS A1/A2/A3 and B1/B2/B3. Each
repository must contain a seeded `pages-publish` branch with the tiny,
non-sensitive `atlas-publication-site.json` marker using schema
`atlas-publication-site-v1`; Pages must be configured to serve that branch at
the repository root. Before two validated
external states exist, recovery is not `rollbackPublication`: redeploy the
accepted Alpha.15 baseline at
`4e9485efa786fe6a663f6414d098f1fb2fc52a41` through the approved existing Pages
deployment path if the first external application deployment is abandoned.

The wait barrier checks both manifest availability and exact candidate identity:
publication version, Bus slot, and each TNDS bank/root pair. It continues
polling stale-but-HTTP-200 Pages content until the candidate is visible. Full
byte/hash/content validation remains a separate mandatory gate.

Reachable publication history is intentionally one snapshot commit, but this
does not guarantee remote Git object storage is physically bounded because
force-pushed unreachable objects may await hosting-provider garbage collection.
Preflight measures local/file remote object stores where possible and fails over
the configurable conservative default of 3,000,000,000 bytes. GitHub
repository metadata is used to measure reported size where available; if the
hosting provider does not expose it, the limitation is surfaced explicitly and
threshold enforcement is not claimed. No destructive cleanup is automated.

Every published Bus/TNDS file must remain below the safe 95 MiB Git blob limit,
below GitHub's 100 MiB hard object limit. Run #22's approximately 87.2 MB
largest shard passes; an over-limit file stops publication as an architectural
blocker rather than being truncated or silently split.

The first live publication must record for every root: pushed bytes, push-to-
identity-visible duration, Pages deployment result, final public bytes, HTTP
availability and validation completion time. If any root cannot reliably meet
the Pages operational limits, publication stops with evidence and topology is
not silently changed.

Publication checkout and temporary snapshot publication use Git askpass with
the token held in the process environment rather than a credential-bearing
remote URL. `publishSnapshot` applies that transient environment to both
`ls-remote` and `push --force-with-lease`, then removes the askpass directory.
The workflow exposes the existing token explicitly to the main-only Bus and
TNDS publication steps. Local/file remotes require no token; GitHub HTTPS
publication fails early without one. Publication command results expose only
safe repository/root identity and commit data, and no credential is retained
in URLs, JSON, logs, config or files.

## Tooling adoption review

- Dependabot: retain for npm and GitHub Actions updates.
- Codecov: optional; not required for this deterministic infrastructure suite.
- OpenSSF Scorecard: recommended for the application and publication roots.
- Sentry: not adopted for static reference-data publication.
- Renovate: not adopted alongside Dependabot.
- GitHub branch protection: required follow-up. `main` is behaviourally
  protected by programme governance today, but is not yet technically
  protected in GitHub. Product Owner authorisation is required before any
  tooling or branch-rule installation.

## Semantic freeze and exclusions

Alpha.15 remains the accepted semantic baseline. This infrastructure change
does not alter nearby-stop discovery, service inclusion/exclusion, BODS or
TNDS interpretation, TfL route/direction semantics, NaPTAN, destinations,
grouping, circular classification, frequencies, calendars, planner tables,
browser presentation or Word presentation. NPTG remains null/unimplemented.
No merge to `main`, release, tag, external repository, secret, deployment,
unsafe checkout or Alpha16 import is part of this decision.

## Recovery-0F amendment: transient verified candidate checkpoint

Recovery-0F adds a bounded recovery optimisation to this architecture. After
authoritative acquisition, candidate validation, deterministic ATLAS checks and
capacity gates pass, the prepared Pages candidate is saved to GitHub Actions
cache under the exact key
`atlas-verified-candidate-checkpoint-v1-${github.run_id}-${github.sha}`. The
checkpoint is not authoritative data and is never restored through a loose
prefix or `restore-keys` fallback. A new workflow run has a new run ID and
cannot reuse an older candidate; a rerun of the same workflow run may reuse it.

The cache entry contains a versioned manifest binding the candidate to the
workflow run, application commit, ATLAS build, stable candidate-generation
timestamp, Bus/TNDS aggregate measurements and manifest checksums. Restore is
fail-closed: the exact cache-hit signal is checked, then the manifest,
required files, release identity, candidate timestamp and aggregate Bus/TNDS
hashes are independently verified. The candidate validator, deterministic
ATLAS suite and capacity measurement run again before publication. Any miss,
eviction, corruption, schema/identity mismatch or integrity failure falls
back to fresh authoritative acquisition.

The stable `generatedAt` value is the UTC start of the validated candidate
refresh transaction. It is deliberately not a publication-attempt timestamp;
republishing the same candidate retains its candidate-generation time while
the workflow-run publication version remains stable. Run #23 remains
unrecoverable because its ephemeral runner created no checkpoint.

The exact operational procedure and boundaries are recorded in
`RECOVERY-0F-VERIFIED-CANDIDATE-RESUME.md`. GitHub Actions cache eviction and
retention remain explicit operational risks; this mechanism is not a service
level guarantee and does not change active-bank, capacity, hash, token,
publication-wait or rollback safeguards.
