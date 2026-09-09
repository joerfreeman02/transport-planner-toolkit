# ATLAS version and build record

## BUS-QA-03 Alpha.12 candidate

| Version | `2.0.0-alpha.12` |
|---|---|
| Visible build | `ATLAS-2.0.0-alpha.12-20260909` |
| Branch | `codex/atlas-bus-qa-03-london-runtime-integrity` |
| Status | Local Technical Director review candidate; not published |

Alpha.12 restores bounded sequential London timetable orchestration, retains explicit TfL/BODS/TNDS authority and fallback provenance across the London boundary, protects timetable chronology and physical journey identities, consolidates equivalent nearby-stop service rows with auditable stop context, uses honest minute-headway/range wording, and adds the confirmed-site radius map circle plus optional detailed evidence view. The default London radius is 400 metres and the non-London default remains 700 metres.

## BUS-QA-02 Alpha.11 candidate

| Field | Value |
|---|---|
| Product line | ATLAS 2.0 |
| Version | `2.0.0-alpha.11` |
| Visible build | `ATLAS-2.0.0-alpha.11-20260909` |
| Base tree | `82e8dab921d1c3fb0d5345fdfaece272ffa67dce` (verified deployed Alpha.10 main tree) |
| Branch | `codex/atlas-bus-qa-02-full-week-frequency` |
| Status | Candidate; Technical Director re-review required |

This bounded post-deployment correction replaces the single representative-day planner frequency with independently evidenced Monday-Sunday results and deterministic adjacent-day compression. It keeps the Alpha.10 representative-stop, TfL period-type, BODS/TNDS, selected-stop direction, browser/Word table and BUS-MAINT-02 protections. Service qualifications are filtered after final row aggregation so component limited-service notes cannot contradict the planner-facing consolidated row. Alpha.11 is used because the planner-facing behaviour changes after Alpha.10 deployment.

## BUS-QA-01 Alpha.10 candidate

| Field | Value |
|---|---|
| Product line | ATLAS 2.0 |
| Version | `2.0.0-alpha.10` |
| Visible build | `ATLAS-2.0.0-alpha.10-20260908` |
| Implementation base | `600a9104b390e24ef31ce1c1ae49451cfdb8a20b` (approved Alpha.9 tree; verified merge SHA unavailable locally) |
| Branch | `codex/atlas-bus-qa-01-service-evidence-frequency-ui` |
| Status | Candidate; Technical Director review and Product Owner acceptance required |

This candidate adds equivalent BODS/TNDS/TfL principal-location contracts, representative-stop frequency evidence, limited-service wording, browser timetable-source audit labels and table-specific desktop sizing. The corrective review additionally preserves TfL `Period.type` and requested StopPoint identity, limits planner frequency bands to safe `FrequencyMinutes` evidence, prepares TNDS multi-pattern records separately, excludes unresolved StopPoint IDs from display locations, and appends selected-stop direction inside the existing Service Summary Origin / destination cell. The Word stop table remains canonical and excludes planner-only source evidence. BUS-LON-01 and BUS-MAINT-02 remain frozen except for these explicitly bounded corrections.

## Current BUS-1 completion candidate

| Field | Value |
|---|---|
| Product line | ATLAS 2.0 |
| Version | `2.0.0-alpha.6` |
| Visible build | `ATLAS-2.0.0-alpha.6-20260904` |
| Starting checkpoint | `4fddd0cd3a8eb4f9dd624212cf414c0f60319bb7` |
| Branch | `codex/atlas-bus-1-finish` |
| Status | Interrupted BUS-1 WIP preserved on rescue branch; prepared national dataset is incomplete and this is not a merge-ready candidate |

## BUS-1 Alpha.3 rollback record

| Field | Value |
|---|---|
| Version | `2.0.0-alpha.3` |
| Build | `ATLAS-2.0.0-alpha.3-20260824` |
| Commit | `4fddd0cd3a8eb4f9dd624212cf414c0f60319bb7` |
| Branch | `codex/atlas-bus-1-complete` |
| Status | Recoverable London-first BUS-1 checkpoint |

## Earlier accepted-history dependencies

Alpha.4 is descended from the SITE-1 checkpoint `8f8fc868ea787f8ce3175e50de1809da8d2624de`, the ATLAS Foundation history, and legacy baseline `551b7cbf6646e72f21842bf77b93633373a9cac2`. Historical Toolkit identity `TPT-2.7.1` and module versions are unchanged.
## BUS-MAINT-02 Alpha.7 engineering candidate

| Field | Value |
|---|---|
| Version | `2.0.0-alpha.7` |
| Build | `ATLAS-2.0.0-alpha.7-20260907` |
| Branch | `codex/atlas-bus-auto-refresh-alpha7` |
| Status | WIP / Automated Bus Refresh Candidate; live GitHub Actions acceptance required. |

## BUS-LON-01 Alpha.8 candidate

| Field | Value |
|---|---|
| Version | `2.0.0-alpha.8` |
| Build | `ATLAS-2.0.0-alpha.8-20260908` |
| Branch | `codex/atlas-bus-lon-01-tfl-timetable-authority` |
| Status | WIP / TfL scheduled London timetable candidate; Product Owner live acceptance required. |
