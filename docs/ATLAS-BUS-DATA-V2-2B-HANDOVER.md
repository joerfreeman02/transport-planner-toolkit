# BUS-DATA-V2-2B — Source Separation, NPTG Forensics & Diagnostic Architecture

Status: diagnostic/data-foundation handover for Technical Director review only.
Production remains `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`. No
Prepared Data V2 candidate is published.

## Repository and safety boundary

- Repository: `joerfreeman02/transport-planner-toolkit`
- Branch: `codex/atlas-bus-data-v2-national-diagnostic`
- Starting `main`: `2fe88745419ca1197609e03c3e489b1b12b3aa20`
- Starting branch: `c8c26aee96bbf8f95c21485008e1286a28e6d377`
- Expected PR #53 head was verified directly against GitHub and matched.
- No `main` change, merge, publication, Pages deployment, production dataset
  change, production checkpoint, Rail runtime, or planner-facing Bus semantic
  change was made.

## Architecture implemented

`source_snapshot.py` establishes an explicit `atlas-bus-source-snapshot-v1`
contract. A snapshot is `ACQUIRED / UNINTERPRETED`, diagnostic-only and never
production-eligible. It contains NaPTAN XML, NPTG XML and one ZIP per BODS
region, each with source identity, format, region, acquisition time, remote
metadata, byte count and SHA-256. `load_and_verify()` rejects missing, changed,
escaped, incomplete or TNDS-containing inputs before preparation.

`source_freshness.py` performs metadata-only capability probes. HTTP sources are
checked with HEAD for ETag, Last-Modified and Content-Length; the probe never
claims that metadata is byte identity. TNDS is checked with FTP MLSD/MDTM/SIZE
only and never RETR. A source snapshot can be materialised into the existing
builder staging directory, and `refresh_bus_data.py --source-snapshot ...
--acquisition-disabled` makes the no-reacquisition boundary enforceable.

The new source workflow only probes, acquires, hashes, verifies and uploads a
source snapshot. The new diagnostic workflow downloads an explicit snapshot,
verifies it, prepares from it with acquisition disabled, runs hard validation,
then runs aggregate diagnostics and uploads evidence even when hard validation
fails. The existing production refresh remains the publication owner; its v2
path now collects evidence before returning the fail-closed validator result.

Source identity is the snapshot ID (the ordered source-byte hashes). Generator,
validation and publication compatibility remain separate concepts; changing
diagnostic or validator code therefore does not imply source reacquisition.

## Freshness capability findings

The implementation records actual per-source capability rather than assuming a
mechanism. NaPTAN and NPTG use HTTP metadata where the endpoint supplies it,
otherwise the safe fallback is bounded acquisition and SHA-256. BODS is modeled
as nine regional identities, not one national blob. TNDS retains the regional
MLSD/MDTM/SIZE/filename metadata-first target, but production incremental
behaviour is not activated and no TNDS archive is downloaded.

The metadata-only probe run on 2026-09-25 found NaPTAN and NPTG HEAD probes
unavailable, and all nine BODS endpoints either returned no ETag/
Last-Modified/Content-Length or timed out. Therefore none of those sources was
claimed to have a reliable lightweight discriminator in this environment; the
safe acquisition/hash fallback remains required. TNDS was not probed with
credentials and reported `AUTH_REQUIRED`; `retrievalPerformed` was false.

## NPTG forensic result

The authoritative NPTG XML was inspected once. SHA-256 is
`c5d70a938600bbdc32420fa1e0dedf1a2218e073873363db0ecba38074b5e414`, exactly
matching the Run #27 SHA; therefore there is no `SOURCE DRIFT`.

The source root is `NationalPublicTransportGazetteer`, schema `2.1`, revision
`4348`, modified `2026-01-08T10:00:00`. Locality `E0000006` is `Box End`,
administrative area `069`, source locality type `Lo`, and has district reference
`310`. Its XML ancestry is
`NationalPublicTransportGazetteer/NptgLocalities/NptgLocality`; its descriptor
also contains qualifier `Kempston` and WGS84 coordinates
`52.13111,-0.528661`.

District definitions occur under `NationalPublicTransportGazetteer/Regions/
NptgDistrict`. The exact district record structure uses `NptgDistrictCode` and
`Name`. District `310` does not exist in the authoritative XML. No fabricated
district name or special case is added.

National counts are: 43,900 localities; 43,897 with district references; 272
distinct referenced IDs; 302 parsed district definitions; two referenced-but-
not-defined IDs (`065` and `310`); and 20,608 unresolved locality references.
The unresolved grouping is `310: 20,607` and `065: 1`; bounded samples include
`E0034964 Amesbury`, `E0034965 Ashgrove`, `E0034968 Bailbrook` for `310`, and
`E0007490 West Clyst` for `065`. There are zero unresolved locality parents and
zero locality cycles in this source.

The existing generic parser produces the same 302 / 43,900 / 20,608 evidence,
accepts one-character district codes, and resolves normal defined relationships.
The final cause classification is **authoritative unresolved relationship**,
not a parser defect. Hard acceptance remains fail-closed; whether the source
relationship is optional or the authoritative feed should be corrected is a
Technical Director decision.

## Incident continuity

Run #26's inactive member `0170SGP90856` remains protected by the separate
authoritative source membership versus active Bus runtime membership projection.
Run #27's national `E0000006` failure is retained as evidence and is not patched
by special-casing `E0000006` or district `310`.

## Test and run record

The reproducible source-snapshot, freshness and NPTG-forensic tests are in
`tools/atlas-bus-data`. The exact executed commands and final branch SHA are
recorded in the final engineering response after verification. No national
diagnostic workflow was dispatched from this environment because the single
full Bus source acquisition could not complete: the official NPTG XML was
downloaded once for forensics, while the full NaPTAN XML transfer stalled before
completion and no BODS regional feeds were downloaded. Consequently there is no
national diagnostic Run ID, parity result, capacity result or hard-validator
result for a new candidate.

No TNDS archives were downloaded. No production publication or Pages deployment
occurred. The source snapshot architecture was verified with deterministic test
fixtures; a national snapshot artifact was not claimed.

## GITHUB TOOLING ADOPTION REVIEW

- Dependabot: retain the existing weekly npm and GitHub Actions configuration.
- Codecov: a scoped pilot is reasonable after approval of source scope,
  generated-data exclusions, thresholds and CI command; not installed here.
- OpenSSF Scorecard: separate security/governance review required before
  adoption; not installed here.
- Sentry: defer pending privacy, retention, consent and access decisions for
  precise transport-location data.
- Renovate: defer because it would duplicate Dependabot without an unmet need.
- Main branch protection: verify and enable as a repository governance action
  before production publication; it was not changed by this sprint.

Recommendation: Technical Director review only. This handover does not approve
merge, production refresh, Prepared Data V2 publication, Pages deployment or
manual planner acceptance.


## BUS-DATA-V2-2C corrective acceptance rule

An authoritative NPTG locality district reference is retained when its
`districtId` is present even if the source contains no matching district
definition. In that case `districtName` remains `null`; the hard candidate
validator accepts the relationship, while the structural scanner emits a
bounded `WARN` classified as a source anomaly. A defined district must retain
a string `districtName`, and malformed runtime relationships remain
fail-closed errors.

The v2 workflow is diagnostic-only and chains the local reusable source and
diagnostic workflows. The source job either acquires NaPTAN XML, NPTG XML and
all nine BODS regional archives once or downloads one exact prior run artifact
by run ID. Explicit cross-run reuse is marked
`FROZEN_DIAGNOSTIC_EXPLICIT` with `currentSourceFreshnessClaimed: false`.
Source manifests record workflow, run ID, repository commit SHA and acquisition
timestamp; no TNDS archive is part of the snapshot or diagnostic artifact.
