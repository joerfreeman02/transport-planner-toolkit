# ADR-001: ATLAS reference-data publication layer

Status: Proposed for Technical Director review
Correction: BUS-RECOVERY-0D.3A
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
6. Publish all candidate roots using the temporary snapshot and
   force-with-lease branch mechanism.
7. Wait for every remote manifest, then validate version identity, exact file
   counts/bytes, per-file hashes, aggregate hashes, regions and shard mapping.
8. Install the generated application configuration only after the complete
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

During the initial migration from the existing Alpha.15 single-root/local
configuration, no fictional opposite bank is created. The first controlled
production publication must populate one approved bank and install its
validated configuration; until a second bank has also been populated, rollback
uses the existing deployed Alpha.15 publication/LKG route. Dual-bank rollback
becomes available only after both banks have completed validated publications.

Publication checkout uses Git askpass with the token held in process
environment rather than a credential-bearing remote URL. Publication command
results expose only safe repository/root identity and commit data.

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
