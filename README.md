# Transport Planner Toolkit — Sprint 4 Bus Foundation

Current production release: Toolkit 2.0.0, Bus 1.1.0 and Shared Library 1.0.0.

The Dashboard automatically loads deployed Rail, Bus Stop and Bus Route company masters for read-only use. Authorised editors may enter a fine-grained GitHub token locally to preview and publish deterministic merges to the three approved knowledge files. The token is never part of the repository or application exports.

This is the single canonical codebase for future development.

The Toolkit is a **commercial-grade internal platform**. Phase names are Core Platform, Expansion, Integrated Reporting and Enterprise / Commercialisation.

## Stable/working modules

- Accessibility Assessment 1.2 with grouped EAS Word and CSV exports
- STATS19 Collision Record Cards
- Railway Assessment RAIL-4.4.0 with frozen map functionality and final EAS Word and CSV exports

## Development rule

Railway discovery, mapping, routing, classification, research and Knowledge Library behaviour is frozen at the accepted 4.2.1 baseline. Sprint 3 export changes must pass the root and module regression suites before packaging.

The frozen production baselines are Accessibility AA-1.2.0, Railway RAIL-4.4.0, Dashboard and STATS19. Shared mapping, export, diagnostics, project context, module output and Knowledge Library contracts are versioned public boundaries. Significant architecture decisions are recorded in `docs/adr/`.

## Browser deployment

Static GitHub Pages deployment; no service worker during active development.
