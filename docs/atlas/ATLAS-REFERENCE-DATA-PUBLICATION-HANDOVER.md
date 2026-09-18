# BUS-RECOVERY-0D.3A — coherent full-publication rollback correction

Recommendation: **READY FOR TECHNICAL DIRECTOR REVIEW**

## Scope and evidence

Branch: `codex/atlas-data-publication-layer`
Starting SHA: `f9a2ae2c253f77bc7d9342854dc64ba520e9be00`
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

Git checkout authentication uses askpass/environment handling and public
remote URLs. Publication results do not return or serialise credential-bearing
Git remotes.

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
node --check tools/atlas-data-publication/publication.mjs
node --check tools/atlas-data-publication/validate-publication.mjs
git diff --check
```

Results: `pnpm test:atlas` — PASS; `pnpm test:bus` — PASS;
`node tests/atlas/atlas-data-publication.test.mjs` — PASS;
`node tests/atlas/atlas-publication-snapshot.integration.test.mjs` — PASS;
`node tests/atlas/automated-refresh-contract.test.mjs` — PASS;
all changed-file `node --check` commands — PASS; `git diff --check` — PASS.

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
   equivalent), three roots in each bank;
2. `ATLAS_TNDS_BANKS_JSON`, Bus repository/site variables and the narrowly
   scoped reference-data token;
3. Pages publication settings and the `pages-publish` branch policy;
4. technical GitHub branch protection for `main`.

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
