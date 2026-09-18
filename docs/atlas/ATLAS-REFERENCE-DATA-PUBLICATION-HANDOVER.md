# BUS-RECOVERY-0D.3D — final bootstrap and preflight closeout

Recommendation: **READY FOR TECHNICAL DIRECTOR REVIEW**

## Scope and evidence

Branch: `codex/atlas-data-publication-layer`
Starting SHA: `6516373b9fdc057442e363b89b90f65c38409ea5`
Main baseline remains `4e9485efa786fe6a663f6414d098f1fb2fc52a41`.

Run #22 evidence from 2026-09-17 is encoded in the deterministic allocator
tests and documentation: Bus 87,651,022 bytes/1,370 files; TNDS
2,321,211,471 bytes/672 files; regional measurements EA 60,883,253,
EM 275,641,976, NE 110,188,604, NW 414,171,929, SE 519,315,700,
SW 359,859,025, WM 307,380,041 and Y 273,746,344 bytes. No national
acquisition was re-run during development.

## Root cause corrected

BUS-RECOVERY-0D.3 stored only a `rollbackBank` label and root list. Its
`rollbackToOppositeBank()` implementation then cleared `tnds.pathMap`, so a
rolled-back application could fall back to root 1 for shards belonging to the
other two roots. It also left the current Bus slot and publication version in
place. BUS-RECOVERY-0D.3A replaces that partial mutation with one bounded,
non-recursive `rollbackPublication` snapshot of the complete previous active
Bus/TNDS routing state.

## Implemented correction

- Bus keeps its bounded `slot-a`/`slot-b` publication lifecycle.
- TNDS now has two banks with configurable roots; three roots per bank are the
  approved initial topology.
- Each TNDS root contains one snapshot, not current and candidate copies.
- An exact deterministic minimax allocator assigns complete authoritative
  regions and every service shard exactly once.
- Each root is checked against the 900,000,000-byte operational ceiling,
  including the metadata budget. Capacity failure stops the refresh.
- The generated config records active bank/version, active roots, URLs,
  region allocation, shard-to-root map, checksums/manifests and rollback bank.
- The generated config retains one bounded `rollbackPublication` snapshot of
  the previous complete Bus/TNDS routing state, including its version,
  timestamp, Bus slot/base URL, TNDS `pathMap`/`pathRoots` and manifest names.
- The resolver remains transparent to planner-facing Bus code.
- `fetch-last-known-good` reconstructs active Bus slot, active TNDS bank,
  active roots, rollback bank and publication version.
- Workflow publication checks out and publishes every root in the selected
  inactive bank, waits for every remote root, validates the complete bank, and
  only then installs config and deploys.
- The production timeout is 180 minutes.
- Manual non-main execution remains diagnostic-only.

## Failure and rollback behavior

The active bank is never overwritten. A failure in any candidate root leaves
the deployed configuration and active bank unchanged; no partial candidate is
promoted. Once a candidate bank is fully validated, its configuration becomes
active and the former bank remains the immediate rollback/LKG dataset.
Rollback reconstructs the complete previous configuration from
`rollbackPublication`: Bus returns to its previous slot, TNDS returns to the
previous bank and exact cross-root routing map, and the previous publication
version is restored. The former current publication becomes the new bounded
rollback target. Bus/TNDS publication validators pass against the still-
retained previous repositories; no national rebuild is required.

The initial migration is a controlled bootstrap exception: an existing
Alpha.15 deployment without dual-bank metadata has no fabricated rollback
bank. The first approved publication populates one bank; the legacy deployed
LKG remains the rollback route until the second bank has been successfully
published and validated.

The exact supported bootstrap contract is seven external repositories/sites:
one Bus repository/site plus TNDS A1/A2/A3 and B1/B2/B3. Each repository must
exist, use an owner/repository identity, contain a seeded `pages-publish`
branch with the tiny `atlas-publication-site.json` marker, and be readable and
writable by the narrowly scoped publication token. GitHub Pages must be
enabled for each repository from `pages-publish` at the repository root and
must serve that marker before acquisition begins; Pages configuration is a
Product Owner setup action. The first
publication has no automatic external dual-bank rollback. If that deployment
must be abandoned before two validated external states exist, stop publication
and redeploy the accepted Alpha.15 baseline at
`4e9485efa786fe6a663f6414d098f1fb2fc52a41` through the approved existing Pages
deployment path, restoring the baseline application configuration/artifact;
do not invoke `rollbackPublication` as though an external previous bank
existed. Normal `rollbackPublication` begins only after two validated external
publications.

Git checkout authentication uses askpass/environment handling and public
remote URLs. The corrected publication path now applies the same transient
askpass/environment handling to `ls-remote` and `push --force-with-lease` in
the temporary snapshot repository. Bus and every TNDS root receive the
existing `ATLAS_REFERENCE_DATA_TOKEN` only through the main-only publication
steps. Local/file remotes remain tokenless; GitHub HTTPS publication fails
early when the token is absent. Remote URLs, JSON, logs, returned objects,
repository config and retained files remain credential-free, and the temporary
askpass directory is removed after publication attempts.

BUS-RECOVERY-0D.3D adds the final bootstrap and adjacent production gates. The publication
wait now requires the candidate `publicationVersion` and identity, not merely
HTTP 200: Bus must expose the candidate slot and every TNDS root must expose
the candidate bank and root ID. The wait reports attempts and elapsed time so
the first live cycle can record publication propagation latency.

Production preflight runs after last-known-good metadata is obtained and
before national acquisition, only for main production runs. It validates the
Bus and HTTPS Pages contracts, exactly two banks, exactly three roots per bank,
unique bank/root/repository/site identities, active/candidate-bank safety,
token presence, an existing seeded `pages-publish` branch, authenticated
`git ls-remote` access and reported push permission for all seven publication
repositories, every Pages site-health marker, and repository-health thresholds.
Missing branches, unavailable markers, read-only tokens, inaccessible
repositories or invalid configuration stop before acquisition. Manual non-main
diagnostics do not run this preflight.

TNDS preparation now creates a clean local Git working repository with a
credential-free public origin and does not clone, fetch or copy the previous
full snapshot. `publishSnapshot` supplies the remote lease query and push
authentication transiently. Bus keeps its existing bounded checkout because
its active slot is needed while staging the candidate slot.

Preflight also performs repository-health monitoring where the remote exposes a
measurable Git object store, with a configurable conservative default threshold
of 3,000,000,000 bytes. GitHub repository metadata is used where available to
measure reported repository size and enforce that threshold. Unavailable
hosting-provider physical-size data is a visible warning, not a false claim of
bounded on-disk storage; no destructive garbage collection or repository
deletion is automated.

Every Bus and TNDS payload file is also checked against the deliberate
95 MiB safe Git blob ceiling. The known approximately 87.2 MB Run #22 shard
passes; an over-limit authoritative file fails closed with its path and size.

Legacy-config handling is deterministic: a genuinely absent
`atlas/config/atlas-data-sources.json` is treated as `activeConfig: null`,
selects the first configured bank for bootstrap, and never fabricates a
rollback target. A present but malformed or unreadable file fails closed.
The real CLI subprocess path is covered for the absent-file bootstrap case.

## Tests run locally

The targeted publication test covers Run #22 three-root fit, complete region
coverage, exact service-shard coverage, deterministic allocation, fail-closed
capacity, A→B→A refresh cycles, active-bank immutability, all-root validation,
failure isolation, complete A→B and B→A rollback, bounded TNDS history, Bus
slots, cross-root resolver routing and NPTG null.

The final handover records the exact command results for:

```text
pnpm test:atlas
pnpm test:bus
node tests/atlas/atlas-data-publication.test.mjs
node tests/atlas/atlas-publication-snapshot.integration.test.mjs
node tests/atlas/automated-refresh-contract.test.mjs
node tests/atlas/publication-wait.test.mjs
node tests/atlas/publication-preflight.test.mjs
node tests/atlas/publication-lifecycle.integration.test.mjs
node --check tools/atlas-data-publication/publish-snapshot.mjs
node --check tools/atlas-data-publication/publish-bank.mjs
node --check tools/atlas-data-publication/wait-for-bank.mjs
node --check tools/atlas-data-publication/checkout-bank.mjs
node --check tools/atlas-data-publication/preflight-publication.mjs
node --check tools/atlas-data-publication/publication.mjs
node --check tools/atlas-data-publication/validate-publication.mjs
git diff --check
```

Results: `pnpm test:atlas` — PASS; `pnpm test:bus` — PASS;
`node tests/atlas/atlas-data-publication.test.mjs` — PASS;
`node tests/atlas/atlas-publication-snapshot.integration.test.mjs` — PASS;
`node tests/atlas/automated-refresh-contract.test.mjs` — PASS;
`node tests/atlas/publication-wait.test.mjs` — PASS;
`node tests/atlas/publication-preflight.test.mjs` — PASS;
`node tests/atlas/publication-lifecycle.integration.test.mjs` — PASS;
all changed-file `node --check` commands — PASS; `git diff --check` — PASS.

The snapshot integration also proves credential-bearing GitHub remotes are
sanitised, missing GitHub HTTPS credentials fail before network use, injected
askpass credentials are available only to the publication environment, the
askpass file is removed, local bare publication succeeds without a token, two
snapshots retain one bounded branch commit, and no token appears in the safe
publication result.

`publication-wait.test.mjs` proves stale HTTP 200 responses, repeated stale
polls, eventual exact-version visibility, wrong bank/root/Bus-slot rejection,
and timeout without active-configuration mutation. `publication-preflight.test.mjs`
proves malformed JSON and present-config failure, legacy absent-config CLI
bootstrap, duplicate identities, missing token, inaccessible repositories,
seeded-branch and marker enforcement, authenticated write permission, active-
bank safety, Pages URL contracts, GitHub metadata/local repository-health
thresholds and the safe per-file blob ceiling. The synthetic lifecycle test
proves bootstrap A, stale-aware B, overwrite A without inactive-bank cloning,
A→B→A validation, and a failed candidate that leaves the active configuration
unchanged.

The publication test proves A(v1) → B(v2) rollback to coherent v1 and
B(v2) → A(v3) rollback to coherent v2. Each rollback passes
`validatePublishedConfiguration()` and resolves shards across all three
previous-bank roots.

GitHub CI/check-run status: not observed. The workflow is schedule/manual-only
and the post-push GitHub API query was unavailable through the configured
network proxy; no status is claimed from that query.

These are local results. GitHub CI/check-run status is separate and is not
claimed unless independently observed after push.

## Exact external infrastructure still required

Product Owner/Technical Director approval is still required to configure:

1. six TNDS publication repositories/sites (or the approved configurable
   equivalent), three roots in each bank, plus one Bus repository/site;
2. Seeded `pages-publish` branches in all seven repositories, each containing
   the non-sensitive `atlas-publication-site.json` marker with schema
   `atlas-publication-site-v1`;
3. GitHub Pages enabled for all seven sites from `pages-publish` at the
   repository root and verified to serve the marker;
4. `ATLAS_TNDS_BANKS_JSON`, Bus repository/site variables and the narrowly
   scoped reference-data token;
5. optional `ATLAS_PUBLICATION_REPOSITORY_SIZE_LIMIT_BYTES` override only if
   Product Owner governance approves a different conservative threshold;
6. technical GitHub branch protection for `main`.

No external repository, secret, token, Pages setting or deployment was created
by this sprint. Product Owner must authorise any tooling adoption.

## GitHub tooling adoption review

Dependabot remains enabled. Codecov is optional, OpenSSF Scorecard is
recommended, Sentry is not adopted for static reference-data publication, and
Renovate is not adopted alongside Dependabot. The programme currently protects
`main` behaviourally, but GitHub does not yet technically enforce branch
protection; that remains an external governance action.

## Semantic freeze

No Alpha.15 planner semantics, source interpretation, discovery, timetable,
presentation or Word behavior changed. NPTG was not implemented. Unsafe source,
Alpha16, main, releases, tags and fresh national acquisition were not touched.

## Final status

**READY FOR TECHNICAL DIRECTOR REVIEW**
