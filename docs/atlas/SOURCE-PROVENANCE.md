# Alpha.4 source and provenance design

Reviewed: 2026-09-04

## Address and confirmed point

Address search remains user-triggered OpenStreetMap Nominatim with conservative query normalisation, rate limiting and explicit candidate selection. A geocoded candidate is never automatically the transport origin. The final confirmed SITE-1 point—including any planner drag, map click or manually entered coordinate—is the origin used by Bus.

## London stop source

Points inside the official Greater London boundary use the TfL Unified API StopPoint operation for nearby bus stops and routes recorded against each stop. Records retain TfL/NaPTAN identity, name, indicator, coordinates, route list, request reference, checked time and attribution. TfL supplied no dataset publication timestamp in the verified response, so ATLAS shows that caution instead of inventing a date. Anonymous live access worked on 2026-09-04; no TfL key is embedded.

## National stop source

Outside Greater London, stops come from the official DfT NaPTAN national CSV prepared on 2026-09-04. Active bus stop records retain ATCO code, NaPTAN code, name, indicator, bearing, stop type, locality, coordinates, modification time, source hash and coordinate method. Supplied WGS84 is used where present; missing WGS84 is deterministically derived from supplied British National Grid coordinates. Spatial discovery uses 0.25-degree shards and then exact WGS84 haversine filtering. Same-name opposite directions remain separate because identity is the authoritative stop code.

Haversine distance is discovery evidence only. Routed walking and cycling measurements are separate facts and never fall back to that distance.

## Timetable source

The official public BODS regional GTFS downloads provide current English local-bus schedules. All nine regions were downloaded and hashed. Preparation applies GTFS `calendar` and `calendar_dates` to the representative week beginning 2026-09-07, rejects schedules not active in that week, and joins by authoritative stop identity. Retained evidence includes route/operator, endpoints, calling pattern, scheduled departures, validity, source region/route, circular status and qualifications. No BODS account or key is required by the chosen bulk-download path.

The prepared snapshot warns after eight days. Date-specific exceptions are flagged for planner checking. Rebuilding from current official inputs changes the recorded hashes and preparation time; old information is not silently presented as live.

## Routing and boundary

The Greater London selection boundary is the locally prepared official GLA boundary with source/licence metadata. Walking uses the public OSRM foot service and cycling the public OSRM bike service, both based on OpenStreetMap. Requests retain their service references and attribution. An unavailable route remains unavailable; ATLAS never labels straight-line distance as routed access.

## Presentation contract

Sources, checked time, completeness and professional cautions remain visible in plain English. Exact source references, hashes, region details and routing request references are secondary technical details. Google Maps links use authoritative stop coordinates as a human verification aid only.
