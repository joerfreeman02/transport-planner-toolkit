# BUS-1 completion checkpoint

Recorded: 2026-09-04

BUS-1 Alpha.4 was interrupted during national-data regeneration and is preserved as WIP on `codex/atlas-bus-1-rescue-20260904`. It starts at recoverable Alpha.3 commit `4fddd0cd3a8eb4f9dd624212cf414c0f60319bb7`. The current prepared dataset has service shards only and no manifest or stop shards, so the branch is not runnable as a complete Bus assessment and must not be merged.

The intended architecture uses a controlled static-data preparation process. Official national NaPTAN and all nine English BODS regional GTFS downloads are transformed into deterministic, gzip-compressed spatial and stop-identity shards. The transformer and application code are preserved, but the final build and regression/live revalidation remain incomplete. No backend, account, API key, paid service, AI research, or planner-entered credential was introduced.

Completed workflow:

confirmed SITE-1 assessment point → TfL or prepared NaPTAN stop discovery → prepared BODS scheduled services → deterministic directional summaries → OSRM walking/cycling routes → map and Google Maps verification → canonical EAS tables → controlled wording.

The detailed implementation and refresh contract are in [BUS-1-ARCHITECTURE.md](BUS-1-ARCHITECTURE.md) and [ADR-011](../adr/ADR-011-prepared-national-bus-data.md). The remaining methodology approval is the exact representative weekday frequency window. The calculation accepts an explicit approved window, but production does not silently choose one and the canonical service table has no frequency column.

Rollback is Alpha.3 commit `4fddd0cd3a8eb4f9dd624212cf414c0f60319bb7`. No Foundation, SITE-1, legacy Toolkit, or protected legacy module file was rewritten.
