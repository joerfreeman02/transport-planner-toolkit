# BUS-DATA-PREP-1 national coverage and remote-readiness handover

## Executive verdict

**READY FOR TECHNICAL DIRECTOR BUS-DATA-PREP-1 REVIEW**

The frozen national source passed the strict snapshot gate.  The V2 candidate
was prepared without acquisition, and the national ledger accounts for every
active bus-eligible NaPTAN StopPoint with zero unclassified remainder and zero
preparation errors.  This is diagnostic-only evidence; it is not a Beta or
production recommendation.

## Identity

- Branch: `codex/atlas-bus-data-prep-1-national-coverage-ledger`
- Worktree: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\atlas-bus-data-prep-1-national-coverage-ledger`
- Baseline and remote SHA: `247c16f7f0e8bcee24bf5da2d527748bfdc608c4`
- Version: `2.0.0-alpha.15`; no Alpha.16 and no Beta promotion.
- Functional implementation SHA/final tip/remote parity: verified against the pushed
  branch and recorded in the completion handover.
- Changed files: `tools/atlas-bus-data/coverage_ledger.py`, `tools/atlas-bus-data/test_coverage_ledger.py`, `tools/atlas-bus-data/source_snapshot.py`, `tools/atlas-bus-data/refresh_bus_data.py`, `.github/workflows/atlas-reference-data-diagnostic.yml`, this document, and `docs/atlas/BUS-DATA-PREP-1-0590B-FORENSIC.md`.

## Source snapshot

- Root: `C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\data-snapshots\atlas-bus-data-acq-1-primary-20261013`
- Snapshot ID: `cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde`
- State: `ACQUIRED / UNINTERPRETED / VERIFIED`
- Count: 11 sources; total bytes: 2,244,572,632.
- Strict command: `python tools/atlas-bus-data/source_snapshot.py --verify <snapshot> --expected-snapshot-id cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde --expected-source-count 11 --expected-total-bytes 2244572632`.
- Result: pass. Recorded SHA-256 and byte counts, required sources, structural validation, and unexpected `.part` control passed. Raw bytes were not mutated and no source endpoint was called for preparation.

## Preparation

The existing V2 path was retained: verified snapshot materialisation, XML
NaPTAN/NPTG parsing, BODS regional processing, physical/service/group/locality/
reference shards, manifest, and diagnostic status. Acquisition is explicitly
disabled. The durable candidate is outside Git history at:

`C:\Users\joe.freeman\OneDrive - EAS Transport\Documents\Transport Planner Toolkit\work\atlas-bus-data-prep-1-national-coverage-ledger-candidate-final`

The completed candidate contains 375,668 active prepared stops, 664 physical
stop shards, 698 service shard files across 477 stop-prefix areas, 115 logical
group shards, 3 locality shards, and 149 reference StopPoint shards. The
prepared payload measured 139,617,722 bytes; the candidate payload fingerprint
is `41a3044cfdc115b00cb4ea32076f462a2b5b7e8e763d3710ac05a36ad1125c14`; the
largest file was
`services/49000-london.json.gz` at 10,606,920 bytes. No publication file
exceeds the supported 100 MB GitHub file limit.

## Coverage ledger

The schema is `atlas-bus-national-coverage-ledger-v1`; the gap report schema is
`atlas-bus-national-preparation-gap-report-v1`. Evidence is candidate-local and
is not committed as a giant Git artifact:

- `diagnostic-output/coverage-ledger.json`
- `diagnostic-output/gap-report.json`
- `diagnostic-output/0590B-forensic.json`

The ledger accounts for NaPTAN source records, BODS stops/routes/trips/
scheduled calls, exact identity matches, unresolved identities, rejected
records, prepared evidence, and generated shard paths. Per-region stop, route,
and relevant scheduled-call conservation equations all balance.

National final states:

| State | Count |
| --- | ---: |
| `CURRENT_TIMETABLE_EVIDENCE` | 249,280 |
| `CONFIRMED_NO_CURRENT_SERVICE` | 126,388 |
| `INACTIVE_OR_LEGACY` | 48,677 |
| `OUTSIDE_APPLICABLE_SCOPE` | 12,432 |
| `SOURCE_IDENTITY_UNRESOLVED` | 0 |
| `SOURCE_DATA_INCOMPLETE` | 0 |
| `PREPARATION_REJECTED` | 0 |
| `PREPARATION_ERROR` | 0 |
| Unclassified remainder | 0 |

The absence contract is explicit: `CONFIRMED_NO_CURRENT_SERVICE` is a ledger
state produced after checking the complete frozen source window; an absent
manifest key or shard alone never produces that state. Unresolved BODS
identity records remain listed per region for BUS-DATA-TRUST-1 even though no
active StopPoint was assigned the unresolved state in this candidate.

## 0590B control

Four active, bus-eligible StopPoints were traced. All are `Queensgate Bus Stn`
records (`0590BCE01L`, `0590BCE02L`, `0590BCE03U`, `0590BCE04U`). The new
candidate contains no corresponding BODS stop, scheduled call, route, service,
or prepared service shard for any of them. Their final state is
`CONFIRMED_NO_CURRENT_SERVICE`; the forensic root cause is
`BODS omission/incomplete publication`, not “missing shard”. The detailed
chain and old/new comparison are in
`docs/atlas/BUS-DATA-PREP-1-0590B-FORENSIC.md` and the candidate forensic JSON.

## Stop-scoped partial evidence

Coverage state is keyed by exact StopPoint identity. Exact StopPoint/route
evidence outranks route-number-only evidence. The focused tests prove that a
matched stop remains matched, a checked no-current stop remains no-current, a
genuine no-route result remains no-route, and an unrelated failed scope does
not contaminate another StopPoint with the same public route number.

## Peterborough control

The candidate-local PE1 2TL / 500 m review preserves 57 nearby stops and 41
route-bearing stops. It fetched one stop shard and five successful service
shards, returned 189 route-bearing service records (191 including route-less
selected stops), and surfaced the four-stop `0590B` missing-shard diagnostic
without converting it to no service. The candidate-local evidence is
`atlas/data/diagnostic-output/pe1-500m-review.json` and
`atlas/data/diagnostic-output/selective-loading-proof.json`; it compares with
the earlier 1B control of 57/41/189 and the same `0590B` partial-coverage
boundary. This is a control, not a national acceptance gate.

## Protected intelligence

The preparation layer exercises, but does not redesign, GROUP, DEST, CIRC,
route grouping, endpoints/aliases, short workings, calendar and term-time
rules, frequencies, operating periods, TfL authority, iBus operators, and
Browser/Word calculations. The full Alpha.15 deterministic suite passed,
including Waltham Cross, Chingford 357/444/W16/657, Enfield 313/191/317 and
Pipers controls.

## GitHub remote readiness

- Preparation accepts configurable source and candidate paths and has no
  Windows, OneDrive, drive-letter, or case-sensitivity dependency.
- The diagnostic workflow now performs strict snapshot identity/count/byte
  checks, carries ledger/gap/0590B evidence into the artifact, and fails closed
  on a non-zero unclassified remainder or preparation errors.
- Candidate measurement, structural validation, path/manifest checks, and
  shard-size checks are diagnostic-only; no publication or deployment occurred.
- Selective runtime loading remains bounded by site/grid/StopPoint prefix and
  does not download the complete national candidate for one-site assessment;
  the PE1 proof fetched 1 of 664 stop shards and 5 of 698 service files.
- No actual GitHub Actions execution against this exact local snapshot was
  performed. Required status: **REMOTE ARCHITECTURE READY — EXACT SNAPSHOT
  ACTIONS EXECUTION STILL REQUIRED BEFORE BETA.**

## Testing

- Strict frozen snapshot verification: pass.
- Focused coverage-ledger tests: 9 pass.
- V2 national preparation: pass.
- Coverage ledger and conservation gate: pass; unclassified remainder 0;
  preparation errors 0.
- Protected full suite: pass. Final line: `ATLAS Alpha.15 deterministic suite passed.`
- Candidate validation, structural scan, measurement, selective-loading proof,
  and PE1 2TL review outputs are present under the durable candidate's
  `atlas/data/diagnostic-output` directory.

## Limitations and follow-on classification

- SOURCE DATA: BODS has 4,908 unresolved scheduled-call identities nationally;
  exact per-region records are retained in the ledger for BUS-DATA-TRUST-1.
- PREPARATION: none in this candidate; unclassified remainder and preparation
  error counts are zero.
- PLANNER TRUST: national ledger evidence still requires Technical Director
  review and comparison with 1B controls.
- TNDS / RECONCILIATION: TNDS remains blocked and was not acquired or merged.
- REMOTE GITHUB: exact snapshot Actions execution remains a mandatory Beta
  gate.
- POLISH / PRODUCTION CLOSEOUT: no production publication, deployment, or
  Beta promotion was attempted.

The legacy `national_v2_diagnostic.py` comparison was not used for the final
gate because its v1 shadow path requires a live NaPTAN CSV; this sprint's
no-source-network rule was preserved. Structural validation, candidate-local
PE1 selective loading, coverage conservation, and the protected deterministic
suite are the reported evidence instead.

## GitHub tooling adoption review

Dependabot, Codecov, OpenSSF Scorecard, Sentry, and Renovate were reviewed as
future repository controls. None was installed or reconfigured in this sprint.

## Hard stop

This sprint ends at Technical Director review. BUS-DATA-TRUST-1, TNDS
acquisition, production publication automation, BUS-POLISH, deployment, and
Beta promotion are explicitly out of scope.
