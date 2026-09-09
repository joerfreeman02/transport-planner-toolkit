# BUS-1 authoritative bus-assessment architecture

Reviewed: 2026-09-04

## Source hierarchy and cost position

- A confirmed assessment point inside the official Greater London boundary uses TfL StopPoint for live authoritative stop discovery and routes recorded against each stop.
- A confirmed point outside Greater London uses the prepared national NaPTAN index for authoritative stop discovery.
- Current scheduled-service evidence in both areas comes from the official BODS regional GTFS bulk downloads, joined by authoritative NaPTAN/ATCO stop identity.
- Walking and cycling use separate public OSRM profiles over OpenStreetMap data, following the proven legacy Accessibility routing pattern.
- Address search remains user-triggered Nominatim. Google Maps links are verification aids, not factual inputs.

No paid source, backend, account, user key, personal BODS credential, or generative AI is required. Public BODS bulk GTFS downloads are used without authentication. Secrets must never enter the repository or browser assets.

## Controlled national preparation

`tools/atlas-bus-data/build_static_index.py` takes an official NaPTAN CSV and the nine BODS regional GTFS archives. It validates required files, hashes every input, selects the next representative Monday-Sunday week from the declared snapshot date, applies GTFS calendars and date exceptions, removes records not active in that week, joins services to NaPTAN identities, and emits deterministic gzip files plus a manifest.

NaPTAN records with WGS84 coordinates are retained directly. Current bus records that contain British National Grid coordinates but omit longitude/latitude are converted deterministically from EPSG:27700/OSGB36 to WGS84 using the published Helmert transformation. The per-stop conversion method remains recorded. Stops are divided into 0.25-degree cells; services are divided by the first five characters of the authoritative stop ID and region. The browser loads only intersecting stop cells and service prefixes. Raw CSV/ZIP inputs are build inputs and are not committed.

The manifest records source URLs, hashes, preparation time, representative dates, region/feed validity, record counts, sharding rules and an eight-day refresh threshold. Formal assessments should rebuild from current official downloads when the warning threshold is exceeded. The generation command is `npm run build:atlas:bus-data` after placing the documented raw inputs in `tmp/bus-data`.

## Stops, direction and grouping

Candidate discovery uses haversine distance only to decide which authoritative stops fall inside the selected radius. It is always described as straight-line discovery distance and is never presented as walking or cycling distance. Deduplication and presentation use authoritative stop IDs, never names. Same-name and opposite-direction records therefore remain separate, traceable and reversible. Indicator and bearing are retained where supplied.

## Timetables and deterministic summaries

Every prepared service retains route number, operator where supplied, direction, origin, destination, calling pattern, principal locations, per-stop scheduled departures for each represented day, validity, source identifiers, circular status and material qualifications. TNDS records with multiple valid JourneyPatterns are prepared as pattern-specific records with ordered stop IDs, calls, schedules, direction and principal locations; opposite directions and short workings therefore cannot mix their timetable evidence. Unresolved TNDS StopPoint identities remain in route sequencing but are not display names or principal locations. Summary grouping also retains distinct selected-stop direction evidence.

Operating periods use the earliest and latest scheduled departure at the selected stops for each day. Times beyond 24:00 remain ordered and render as after-midnight clock times, with an overnight note. Missing days say `No scheduled service`; missing timetable evidence is not inferred.

Principal locations come only from the actual calling pattern. The deterministic rule first selects intermediate named stations, interchanges, town/city centres, hospitals, airports, universities and shopping centres; then locality transitions; then quarter/mid/three-quarter calls when needed. Endpoints are not repeated and a maximum of seven locations is used.

The shared Bus presentation decision ranks each route/operator/direction family by verified route-pattern extent, verified principal-location count, scheduled activity and a deterministic textual/id tie-breaker. It retains all legitimate rows, keeps opposite direction families distinct, and adds relational Principal locations wording only where route-pattern or direction evidence proves the relationship. Browser Table 3.3 and Word Table 3.3 consume that same decision; source principal-location arrays are not rewritten.

Empty principal locations are context-sensitive: `Route endpoints only` is reserved for a verified two-stop route pattern. A multi-stop or unknown-extent pattern uses `See route origin / destination`, which does not imply a direct service. Rural locality transitions and representative quarter/mid/three-quarter calling points remain meaningful principal-location evidence when urban landmark keywords are absent.

Material qualifications generate one conditional full-width `Service note:` row. This includes school-day/date exceptions, weekday-only or limited operation, no weekend service, circular patterns, overnight journeys, route variants, or missing operator/timetable information. Normal services do not receive empty note rows.

The existing `calculateScheduledFrequency()` remains the low-level scheduled-frequency calculation. The planner-facing rule calculates each Monday-Sunday result from one representative selected stop, so nearby calls cannot multiply one physical journey. Five or fewer journeys use journeys/day; otherwise regular schedules use approximate buses/hour and headway, with irregular schedules remaining explicitly irregular. Adjacent daily results are compressed only when their basis, classification and values are equivalent; non-adjacent matches remain separate. TfL `FrequencyMinutes` evidence may support approximate wording only when its original type, representative StopPoint, and equal positive low/high values are defensible; other period types remain unavailable for planner frequency calculation without creating timestamps. Output says `buses/hour`; `tph` and invented `bph` terminology are prohibited.

## Routed access, map and output

The same confirmed assessment point is the origin for walking and cycling. Each mode uses its own OSRM table request, in batches of at most 40 stops. Failure produces an unavailable result and a plain-English retry message; straight-line distance is never substituted. A planner may request a route line on the map for inspection without changing the assessment evidence.

The site marker remains dominant and stop markers subordinate. Popups show stop/direction, routes, routed access, route-line controls and Google Maps verification.

The canonical Word Bus Stop Summary columns are Stop name; Direction; Walking distance / time; Cycling distance / time; Routes serving stop. The browser-only Bus Stop Summary adds Include and Timetable evidence. The canonical Bus Service Summary columns are Route; Operator; Origin / destination; Principal locations; Typical frequency; Operating period, with browser Include at the far left. These follow the supplied Plaistow Transport Assessment as an output precedent only; no Plaistow fact is embedded in production logic.

Controlled prose uses only verified route numbers and principal locations. It does not claim excellence, sustainability, frequency or quality. Normal UI messages follow the Pat test: what happened and what to do next are plain English; source mechanics remain under optional technical details.

## Failure and limitation contract

Genuine zero stops, source unavailability, malformed prepared data, missing timetable coverage, partial routing and complete results are distinct. TfL stop responses do not provide a dataset publication time, so that remains a visible caution. Public Nominatim, TfL and OSRM services have no contractual uptime; failures remain non-destructive. The prepared timetable describes the declared representative week and must be refreshed and date-checked for formal work, particularly where GTFS date exceptions are present.

Legacy access remains visible and the 12 protected legacy path groups are byte-for-byte checked against baseline `551b7cbf6646e72f21842bf77b93633373a9cac2`.
## Alpha.10 BODS-primary and TNDS-supplement architecture

NaPTAN remains authoritative for physical stops. BODS is the primary timetable source and TNDS v2.5 supplements genuinely missing patterns; deterministic fingerprints suppress equivalent duplicates while retaining source provenance. TNDS retains ordered JourneyPattern/TimingLink stop IDs, resolved AnnotatedStopPointRef names/localities and pattern variants, then calls the shared principal-location derivation. BODS prepared records retain the same planner-facing contract; TfL StationInterval records use it directly. Rural/locality calls remain valid evidence and endpoints are not repeated.

Service summaries choose one deterministic frequency-basis stop: shortest valid routed walking distance, then discovery distance, then stop ID. Daily frequency results are calculated independently for Monday through Sunday from that same basis stop. Five or fewer journeys display as journeys/day; more regular evidence uses approximate buses/hour and headway with a 25% interval-regularity tolerance. TfL may contribute a deterministic exact frequency band as approximate evidence, but never fabricated departure timestamps. Operating period remains separate and is calculated from the same basis-stop evidence. Component limited-service qualifications are retained only when the final consolidated row satisfies the qualification.

The browser stop table exposes `Matched`, `No current match` and `Timetable source unavailable` distinctions with BODS/TNDS/TfL/fallback/supplementary labels. This audit column is intentionally absent from Word Table 3.2. Browser Table 3.3 adds Typical frequency while retaining Operating period; Word Table 3.3 mirrors those six service facts. The existing Origin / destination cell may append the normalised direction of the selected evidence/basis stop in brackets; it is not a new column and is never inferred from terminals or route wording. Nearest mode selects the nearest currently served logical group using routed walking access, never straight-line distance. Physical stops without current service remain explicit rather than being presented as active service. The Windows maintenance updater prompts for FTP credentials at runtime, keeps raw archives outside Git, validates staged output, and preserves the previous prepared dataset for rollback.
