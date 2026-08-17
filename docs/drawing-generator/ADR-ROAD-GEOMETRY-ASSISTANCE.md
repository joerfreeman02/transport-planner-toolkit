# ADR: planner-guided road geometry assistance

Status: accepted for `DRAW-0.1.0-DG0C3.1-20260816` live-review candidate.

## Decision

Use a provider-neutral routing adapter to turn a deliberate planner-drawn waypoint line into road-following geometry through those waypoints in order. The current replaceable default uses the OSRM car route API backed by OpenStreetMap. It is a geometry service, not a route-selection or HGV-suitability service.

The planner remains authoritative: they select roads and waypoint order, inspect the returned line, and explicitly approve or accept a manual fallback. The original rough geometry and provider provenance are retained. Failed, materially divergent, ambiguous-direction or unapproved results block issue/print.

Direction is normalized independently of the provider: Route To Site must end nearest the confirmed site polygon and Route From Site must start nearest it. A deterministic reversal is recorded; no site or ambiguous endpoints returns `ROUTE DIRECTION REQUIRES REVIEW`.

## Consequences

- The external boundary can be replaced without changing route state, direction logic or rendering.
- Automated tests mock all routing calls; public calls occur only after explicit route drawing/retry actions.
- Arrow cadence is derived from ground distance on final retained geometry, so provider vertex density cannot overload the drawing.
- Regional Routing suppresses automatic thematic overlays; Local Routing allows only explicitly selected community/manual additions.
- The system must never describe the result as HGV-safe, suitable, optimal or recommended.
