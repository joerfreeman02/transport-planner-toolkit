# BUS-RECOVERY-0D.1 handover

Recommendation: **READY FOR TECHNICAL DIRECTOR REVIEW**

This continuation corrects publication capacity, lifecycle and governance
without changing Bus planner semantics. No external repository, secret, token,
Pages setting or production refresh was created or run by this task.

## Repository

- Branch: `codex/atlas-data-publication-layer`
- Worktree: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\atlas-data-publication-layer`
- Prior implementation SHA: `754dab29ec97f81fe3d91fdcc949eaf79465dbce`
- Final SHA: record after the 0D.1 correction commit
- Push state: review branch only; no production deployment was triggered

The quarantined `source` checkout, experimental Alpha.16 checkout and
uncommitted Recovery-0 checkout were not modified.

## What is corrected

The publisher now:

- measures fresh Bus and TNDS candidates before any external publication;
- reports file/byte totals, largest contributors, checksums and proposed
  publication groups;
- validates national TNDS identity for `EA`, `EM`, `NE`, `NW`, `SE`, `SW`,
  `WM` and `Y`, rejecting ambiguous or missing expected regional shard groups;
- uses `slot-a`/`slot-b` bounded blue-green publication, retaining one active
  rollback slot rather than accumulating immutable full releases;
- gates each candidate and the complete site, including rollback slot and
  metadata, at 900,000,000 bytes, leaving 100,000,000 bytes below the
  1,000,000,000-byte GitHub Pages limit;
- writes only lightweight `publication-state.json` and manifests for audit;
- publishes a single reachable snapshot commit on dedicated machine branch
  `pages-publish`, so full dataset history does not grow per refresh;
- keeps application `main` small and protected, with publication permissions
  limited to the two publication repositories.

The exact fresh national TNDS split is not claimed locally: the expired 0C
artifact and current checkout contain only the small SE fixture. The new
diagnostic path is the evidence-producing mechanism for genuine fresh data.

## Baseline measurements

| Dataset | Files | Bytes | Largest contributor |
| --- | ---: | ---: | --- |
| `atlas/data/bus` | 1,371 | 87,272,247 | `services/49000-london.json.gz` — 9,029,796 bytes |
| `atlas/data/bus-tnds` | 2 | 819 | `services/231-se.json` — 645 bytes |

The prior recorded Pages artifact was `1,756,811,441` bytes. These are
starting-tree measurements, not a claim about a new national refresh.

## Architecture and switch order

The existing `transport-planner-toolkit` Pages site serves the app shell.
Separate TPT-owned Bus and TNDS Pages sites serve the two datasets. Each site
contains only `slot-a`, `slot-b`, `.nojekyll`, and lightweight metadata.

At refresh time the inactive slot is staged and size-gated while the active
slot remains available. Both publication branches are pushed, both slot
manifests are checked over HTTP, and only then is the app config generated into
the application Pages payload. If any step fails, the deployed config still
points at the prior active pair.

The resolver retains deterministic `pathRoots` support. This permits future
regional TNDS roots if actual measurements require them; no arbitrary split is
invented in this task.

## ADR

[ADR-001-REFERENCE-DATA-PUBLICATION.md](ADR-001-REFERENCE-DATA-PUBLICATION.md)

## Files changed by this correction

- `.github/workflows/atlas-bus-data-refresh.yml` — adds `measure_only`, fresh
  capacity diagnostics, bounded slots, dedicated publication branch and gated
  app-config switch.
- `tools/atlas-data-publication/publication.mjs` — regional TNDS allocation,
  candidate and total-site measurement, two-slot staging, lifecycle metadata
  and 900 MB safety gate.
- `tools/atlas-data-publication/measure-candidate.mjs` — diagnostic-only
  measurement entry point that does not write external repositories.
- `tools/atlas-data-publication/fetch-last-known-good.mjs` — records active
  slots for the next bounded switch.
- `tests/atlas/atlas-data-publication.test.mjs` — regional routing and bounded
  lifecycle contracts.
- `tests/atlas/automated-refresh-contract.test.mjs` — workflow safety
  assertions updated for bounded publication.
- `docs/atlas/ADR-001-REFERENCE-DATA-PUBLICATION.md` — corrected decision and
  governance record.

## Exact Product Owner diagnostic action

No external setup is required for the diagnostic-only run. After this branch
is reviewed, run exactly one existing workflow action:

GitHub → Actions → **ATLAS Bus data refresh** → **Run workflow** on `main` →
set `force_refresh=true` and `measure_only=true`.

That run acquires genuine fresh data, validates it, writes the measurement
artifact `pages-site/atlas/config/atlas-candidate-measurement.json` inside the
workflow, and changes no publication repository or Pages deployment. Record
the Bus/TNDS totals and all eight TNDS regional allocations in the technical
director decision. If the diagnostic exceeds the safe budget, stop and approve
regional or additional-site partitioning before any production publication.

Production publication setup is intentionally deferred. When approved, the
Product Owner must create the two TPT-owned Pages repositories, configure
their `pages-publish` branch and site URLs, add a narrowly scoped
`ATLAS_REFERENCE_DATA_TOKEN`, and protect application `main`. The workflow
default is already `pages-publish`; do not point it at application `main`.

## Integrity and scope

- No Bus planner semantic changes were made.
- No service, route, stop or source coverage was removed.
- No arbitrary truncation or fidelity reduction was introduced.
- Recovery controls Pipers Lane / Caddington, Normanshire Drive / Chingford,
  and Waltham Cross remain outside this infrastructure change.
- NPTG remains configuration-only and **NOT IMPLEMENTED**.

## Verification to record

- `node tests/atlas/atlas-data-publication.test.mjs`
- `pnpm test:atlas`
- `pnpm test:bus`
- syntax checks for publication, measurement and fetch scripts
- `git diff --check`

The final handover should replace “Final SHA: record after...” with the actual
0D.1 commit SHA after verification and push.
