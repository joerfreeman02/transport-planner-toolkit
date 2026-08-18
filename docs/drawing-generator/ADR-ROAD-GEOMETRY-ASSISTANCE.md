# ADR: planner-guided road geometry assistance

Status: accepted architecture for `DRAW-0.1.0-DG0C3.3B-HF4-20260818` live-review candidate; Product Owner functional acceptance remains pending.

## Decision

Use a provider-neutral map-matching adapter to tidy a deliberate planner-drawn route trace onto the road network. The current replaceable default uses the OSRM **Match** service backed by OpenStreetMap, not the OSRM Route service. Route selection remains a professional planner decision: the external provider is geometry assistance only and must not select, optimise or recommend an HGV route.

The original planner LineString is immutable/recoverable. The adapter may add bounded internal sample points to sparse planner segments, while preserving the identity and order of every original planner point. Provider request-size limits are handled internally by bounded, overlapping Match chunks; they are not a user-facing limit on planner detail. Public requests are serialised and rate-controlled at the provider boundary.

A usable candidate must preserve original planner-point order and proximity, endpoints and chunk/sub-trace continuity. OSRM Match may return multiple sub-traces or null tracepoints: an unmatched original planner point, unsafe join or provider failure withholds the candidate and preserves the original planner geometry. Internal assistance samples may be unmatched only where all original planner points and continuity remain valid. Rough-line/candidate length ratio and straight-chord corridor deviation are diagnostic only and do not independently reject a valid match.

A technically valid candidate remains `snapped-review` until the planner explicitly approves it. Failed or materially inconsistent matching remains non-destructive and supports redraw/retry/manual fallback. Route To Site must end nearest the confirmed site polygon and Route From Site must start nearest it; that direction normalisation remains independent of the provider.

## Consequences

- A detailed planner route is not rejected merely because it contains more than 50 original points.
- Automated tests mock Match responses and never depend on the public routing service.
- Candidate, original planner and approved/final route states remain distinguishable for diagnostics and recovery.
- Direction chevrons are derived from retained final geometry and remain presentation-only.
- Regional Routing suppresses automatic thematic overlays; Local Routing allows only explicitly selected community/manual additions.
- The system must never describe the result as HGV-safe, suitable, optimal or recommended.
- Public routing availability and provider limits are external operational dependencies; an approved commercial/self-hosted provider may be required for production-scale use.
