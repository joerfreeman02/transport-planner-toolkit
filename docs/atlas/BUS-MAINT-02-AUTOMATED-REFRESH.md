# BUS-MAINT-02 — Automated Bus refresh

Alpha.7 builds an isolated GitHub Pages candidate every Friday at 06:17 UTC or on `workflow_dispatch`. The runner acquires the official NaPTAN CSV, the public DfT BODS timetable download, and all eight accepted England TNDS v2.5 regions (`EA`, `EM`, `NE`, `NW`, `SE`, `SW`, `WM`, `Y`). TNDS uses the existing legacy FTP source; the runner receives only `TNDS_USERNAME` and `TNDS_PASSWORD` as Actions secrets and the credentials are never written to manifests or Pages files.

The candidate is staged outside the known-good deployment, prepared with the existing deterministic NaPTAN/BODS builder and TNDS TransXChange adapter, then checked for non-empty manifests, referenced files and complete regional scope. The Pages artifact is assembled only after those checks and the deterministic Bus suite pass. Deployment is a separate job with an explicit success dependency, so a failed refresh cannot replace the previous Pages deployment.

Refresh sanity checks retain the existing prepared manifest as a baseline where meaningful. A candidate must retain at least 50% of the previous NaPTAN stop count and total BODS service count, and may not lose a previously present BODS region. TNDS must contain all eight accepted England regions. These thresholds catch catastrophic or truncated downloads while allowing ordinary timetable and stop-count changes; the first successful automated run establishes the source-hash baseline.

Each source records `UPDATED`, `CHECKED_NO_CHANGE`, or `FAILED`; TfL is recorded as `LIVE` because it is queried during London assessment. NaPTAN and BODS use downloaded-source hashes, while TNDS stores per-region archive hashes and a deterministic aggregate. Failed candidates never write a deployed successful status.

The artifact preserves the legacy Toolkit at the root and ATLAS under `/atlas/`. Weekly generated datasets are not committed to `main`. The status manifest distinguishes authoritative source identity and acquisition time from any source publication date; no source publication date is fabricated. TfL remains the existing live/runtime adapter and is outside this refresh.

Public ATLAS shows “Bus data updates automatically” and the last successful automated refresh. `Refresh data status` rereads the status display only. The manual updater remains available on the approved localhost maintenance server.

The current programme tooling review remains unchanged: Dependabot, Codecov, OpenSSF Scorecard, Sentry and Renovate are not installed by this sprint; none is required to implement the refresh candidate. The workflow uses standard GitHub-hosted Ubuntu and the official Pages actions with no paid hosting assumption.
