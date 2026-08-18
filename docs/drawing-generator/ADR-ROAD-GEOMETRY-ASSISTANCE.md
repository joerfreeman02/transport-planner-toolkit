# ADR: planner-guided road geometry assistance

Status: accepted architecture for `DRAW-0.1.0-DG0C3.3B-HF4A-20260818` live-review candidate; Product Owner functional acceptance remains pending.

## Decision

Use a provider-neutral **guided OSRM Route** adapter to tidy a deliberate planner-drawn route onto the road network. The planner remains the route-selection authority. The adapter does not ask the provider to invent an origin/destination route from sparse points: it preserves every planner point, adds bounded internal control points along the planner trace, then routes sequentially through that dense guidance.

The current no-key/no-cost primary endpoint is the FOSSGIS OSRM car Route service at `https://routing.openstreetmap.de/routed-car/route/v1/driving`. A secondary no-key OSRM demo endpoint is configured only as a service-availability fallback. Public hosted services remain fair-use dependencies and cannot provide a contractual always-on/unlimited SLA; manual geometry remains the final non-destructive fallback.

Detailed routes are split internally into overlapping chunks (maximum 40 request locations per call) and requests are serialised. There is no user-facing 50-point limit. Chunk overlap occurs at planner-authored points and joins are accepted only where returned road geometry is continuous.

Candidate acceptance checks planner-point order/proximity and the denser prepared guidance order/proximity. The former HF3 route-length ratio and straight-chord corridor deviation remain diagnostics only. A technically valid road-snapped candidate is never auto-approved: the planner must inspect and explicitly approve it.

Provider failure, HTTP error, timeout, unsafe join or materially inconsistent candidate preserves the original planner geometry. Route To Site must end nearest the confirmed site polygon and Route From Site must start nearest it; direction normalisation remains provider-independent.

## Consequences

- The known working FOSSGIS Route service is restored, but with far denser planner control than the earlier sparse-waypoint implementation.
- More than 50 planner points are supported through internal chunking.
- All routing calls remain geometry assistance only; no HGV suitability, legality, safety or recommendation is inferred.
- Public-provider error bodies are surfaced for diagnosis rather than reduced to a bare HTTP status.
- Automated CI mocks all routing calls; one guarded non-client live-provider smoke exists outside CI for pre-deployment verification.
- Renderer, basemap, community, bus, rail, cycle, metadata, chevrons and all other Drawing Generator behaviour are outside this correction.
