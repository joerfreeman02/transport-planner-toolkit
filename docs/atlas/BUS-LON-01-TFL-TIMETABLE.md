# BUS-LON-01 — TfL scheduled timetable authority

BUS-LON-01 makes TfL the primary scheduled timetable authority for assessments inside the official Greater London boundary. TfL stop discovery remains authoritative there. Outside Greater London, the accepted NaPTAN → BODS primary → TNDS supplementary architecture is unchanged.

The implementation uses the anonymous TfL Unified API scheduled timetable family `Line/{id}/Timetable/{fromStopPointId}`. The current TfL API Portal states that anonymous access is limited to 50 requests per minute; ATLAS therefore deduplicates line/StopPoint requests through the existing cache and enforces a 20-request assessment budget. No `app_id`, `app_key`, browser secret, GitHub secret, proxy, or backend is used.

Only scheduled timetable response data is interpreted. Arrival predictions, vehicle positions, Countdown data, polling, and realtime Arrivals endpoints are excluded.

TfL service fields take precedence. A deterministically matched BODS record may supply an absent TfL field, and the service is labelled `TfL + BODS supplementary`. Material disagreements retain the TfL value and produce one planner-facing warning. If TfL cannot be reached, controlled BODS fallback is explicit in provenance and warnings; a TfL failure is never represented as an authoritative zero.

The adapter reuses the existing source-result, cache, evidence, normalised service, assessment, warning, selection, UI, and Word export boundaries. Codex could not complete a live TfL request because its browser/network environment blocked the API; deterministic fixtures and Product Owner browser acceptance remain required. Alpha.8 is a candidate only and is not accepted or frozen.
