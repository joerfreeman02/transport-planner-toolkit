# BUS-MAINT-02 — Automated Bus refresh

## Alpha.13 production-scale TNDS failure and scale hardening

The single authorized production refresh `34606248773` on 2026-09-11 acquired
all nine BODS feeds and completed all eight TNDS transfers, processing 11,996
XML files and retaining 229,917 services. It failed before candidate
validation at `tools/atlas-bus-data/prepare_tnds.mjs:116` while executing a
whole-file UTF-8 `fs.readFile()` of a large intermediate TNDS JSONL shard.
The subsequent `.trim().split('\\n')` attempted to materialise the complete
shard as one JavaScript string and raised `RangeError: Invalid string length`.
This was a materialisation-boundary failure, not an FTP, parser, coverage or
source-authentication failure; no candidate or Pages deployment was written.

The bounded hotfix keeps the existing document-level TransXChange parser and
all service, StopPoint, calendar, provenance, quarantine, fallback and
ordering semantics. It writes one deterministic JSONL work file per
stop-prefix/region, retains only scalar service-id/byte-offset indexes for
ordering and duplicate detection, reads one indexed record at a time, and
streams the final JSON array through gzip with backpressure. It therefore
removes the whole-shard read, region-record aggregation and giant
`JSON.stringify`/`gzipSync` payload. Individual XML reads remain bounded by an
explicit 64 MiB limit and fail with an actionable error rather than silently
truncating or dropping data.

The adjacent-path audit covered whole-file XML reads, giant shard reads,
monolithic JSON serialization, large joins and concatenations, pre-shard
all-region/all-service aggregation, concurrent raw-content retention,
archive/XML materialisation, oversized individual inputs and diagnostic
strings. The only confirmed production defect was the large-shard
materialisation boundary; the other cases are sequential, path/index-only or
now explicitly bounded and fail-safe.

Regression coverage includes direct parser/output equivalence, an ordinary
fixture, a generated 1,800-record stress path using the production preparation
entry point, a one-record buffering assertion, and an oversized-XML explicit
failure case. The release metadata remains unchanged at Alpha.13. If release
policy requires publishing this post-deployment correction separately, the
recommended identity for Technical Director approval is
`2.0.0-alpha.14` / `ATLAS-2.0.0-alpha.14-20260911`; it is not changed by this
hotfix.

Alpha.7 builds an isolated GitHub Pages candidate every Friday at 06:17 UTC or on `workflow_dispatch`. The runner acquires the official NaPTAN CSV, the DfT BODS regional GTFS ZIP endpoints under `https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/{region}/`, and all eight accepted England TNDS v2.5 regions (`EA`, `EM`, `NE`, `NW`, `SE`, `SW`, `WM`, `Y`). TNDS uses the existing legacy FTP source; the runner receives only `TNDS_USERNAME` and `TNDS_PASSWORD` as Actions secrets and the credentials are never written to manifests or Pages files.

TNDS directory discovery remains a single authenticated listing session, but each regional archive transfer uses its own authenticated FTP session. Each region is attempted at most three times with modest bounded backoff. Archives are written to a temporary `.part` file, validated as non-empty, promoted only after transfer completion, and then safely extracted. A failed region names the region, archive, attempt and failure category; no partial archive is accepted, and any failed region fails the complete candidate so Pages deployment cannot proceed with incomplete TNDS coverage.

The candidate is staged outside the known-good deployment, prepared with the existing deterministic NaPTAN/BODS builder and TNDS TransXChange adapter, then checked for non-empty manifests, referenced files and complete regional scope. The Pages artifact is assembled only after those checks and the deterministic Bus suite pass. Deployment is a separate job with an explicit success dependency, so a failed refresh cannot replace the previous Pages deployment.

TNDS prepared serving reuses the BODS stop-prefix architecture with a five-character `serviceShardKeyLength`. Each compressed JSON shard contains only the service records relevant to its prefix; services with multiple scheduled or quarantined StopPoint prefixes are present in each required shard. The browser derives prefixes from the selected authoritative StopPoint IDs and requests only matching TNDS shards before exact filtering and the existing BODS/TNDS merge. Fully quarantined services are indexed by affected StopPoint IDs so their localised warning remains available without exposing a national malformed-data report. The committed small proof manifest is supported only through a bounded transitional legacy read path; national candidates must use `serviceShards` and cannot use fetch-all service manifests.

Refresh sanity checks retain the existing prepared manifest as a baseline where meaningful. A candidate must retain at least 50% of the previous NaPTAN stop count and total BODS service count, and may not lose a previously present BODS region. TNDS must contain all eight accepted England regions. These thresholds catch catastrophic or truncated downloads while allowing ordinary timetable and stop-count changes; the first successful automated run establishes the source-hash baseline.

Each source records `UPDATED`, `CHECKED_NO_CHANGE`, or `FAILED`; TfL is recorded as `LIVE` because it is queried during London assessment. NaPTAN and BODS use downloaded-source hashes, while TNDS stores per-region archive hashes and a deterministic aggregate. Failed candidates never write a deployed successful status.

The final parser audit used the local `Downloads/TNDS-SE-v2.5.zip` archive. Its `bed_51-231-_-y08-1.xml` contains one service, multiple journey patterns and pattern-section references; the parser now assigns each vehicle journey only to the stops in its referenced pattern section. The real file retained route `231`, operator `South Beds Dial-a-Ride`, and Woodside Road ATCO stops `021013518` and `021013519`. This is evidence for the current archive, not a permanent requirement that route 231 remain in every future refresh.

For each pattern, the parser orders `JourneyPatternTimingLink` records, starts the first stop at the `VehicleJourney` departure, and adds each supplied ISO-8601 `RunTime` plus any `WaitTime` before recording the next stop. An isolated multi-stop pattern with incomplete timing is quarantined: its affected stops carry compact metadata, no guessed schedules are published, and valid patterns and services in the same document continue. Structural ambiguity, conflicting ownership, duplicate identities and otherwise unreliable XML remain fatal. The planner emits one plain-English warning only when an assessed stop intersects the quarantine; raw filenames, pattern IDs and parser exceptions remain engineering diagnostics. XML files may contain multiple `Service` records: each service is prepared only from explicitly owned `ServiceRef`/`JourneyPatternRef` journeys and its referenced operator and stops; ambiguous or conflicting ownership fails safely rather than attaching a journey to the first service.

Public ATLAS distributes prepared derivative TNDS information with attribution to the Traveline National Dataset (TNDS), which contains public sector information licensed under the Open Government Licence v3.0. This acknowledgement does not imply Traveline endorsement of ATLAS.

The artifact preserves the legacy Toolkit at the root and ATLAS under `/atlas/`. Weekly generated datasets are not committed to `main`. The status manifest distinguishes authoritative source identity and acquisition time from any source publication date; no source publication date is fabricated. TfL remains the existing live/runtime adapter and is outside this refresh.

Public ATLAS shows “Bus data updates automatically” and the last successful automated refresh. `Refresh data status` rereads the status display only. The manual updater remains available on the approved localhost maintenance server.

Tooling review: Dependabot is adopted and configured for weekly npm and GitHub Actions updates in `.github/dependabot.yml`. Codecov remains a future controlled pilot; OpenSSF Scorecard is a future security/governance consideration; Sentry is deferred pending telemetry/location/privacy review; Renovate is deferred to avoid overlap with Dependabot. No new tooling is installed by this sprint. The workflow uses standard GitHub-hosted Ubuntu and the official Pages actions with no paid hosting assumption.
