# BUS-LON-01 — TfL scheduled timetable authority

BUS-LON-01 makes TfL the primary scheduled timetable authority for assessments inside the official Greater London boundary. TfL stop discovery remains authoritative there. Outside Greater London, the accepted NaPTAN → BODS primary → TNDS supplementary architecture is unchanged.

The implementation uses the anonymous TfL Unified API scheduled timetable family `Line/{id}/Timetable/{fromStopPointId}`. The current TfL API Portal states that anonymous access is limited to 50 requests per minute; ATLAS therefore deduplicates line/StopPoint requests through the existing cache and enforces a 20-request assessment budget. No `app_id`, `app_key`, browser secret, GitHub secret, proxy, or backend is used.

Only scheduled timetable response data is interpreted. Arrival predictions, vehicle positions, Countdown data, polling, and realtime Arrivals endpoints are excluded.

The parser follows the official TimetableResponse shape: `lineId`, `lineName`, `direction`, `stations`, `stops`, and `timetable`. It uses `timetable.departureStopId`; each TimetableRoute is interpreted only through its `stationIntervals` and `schedules`. The ordered `Interval.stopId` values are resolved against the response stop/station records to derive origin, destination, and principal locations. Route-specific sequence evidence is required; ATLAS does not invent route fields or use a response-wide stop list when the route sequence cannot be resolved.

Known journeys and supplied first/last journey boundaries become scheduled departure evidence. `periods` frequency ranges are retained as a controlled qualification only; ATLAS does not synthesize exact departures or buses-per-hour values from frequency ranges.

TfL service fields take precedence. A deterministically matched BODS record may supply an absent TfL field, and the service is labelled `TfL + BODS supplementary`. Material disagreements retain the TfL value and produce one planner-facing warning. If one of several TfL requests fails, ATLAS retains successful TfL services, uses matching BODS evidence only for the affected line/StopPoint where defensible, and emits one aggregated partial-evidence warning. If no fallback exists, the affected service remains incomplete rather than becoming zero. If all TfL requests fail, controlled BODS fallback is explicit in provenance and warnings; a TfL failure is never represented as an authoritative zero.

The adapter reuses the existing source-result, cache, evidence, normalised service, assessment, warning, selection, UI, and Word export boundaries. Codex could not complete a live TfL request because its browser/network environment blocked the API; deterministic fixtures and Product Owner browser acceptance remain required. Alpha.8 is a candidate only and is not accepted or frozen.
