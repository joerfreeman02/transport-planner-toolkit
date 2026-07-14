# Transport Planner Toolkit — Accessibility Assessment Alpha 0.1

A clean Alpha implementation of the Accessibility Assessment module.

## Implemented in Alpha 0.1
- Address/postcode and coordinate input.
- Draggable/clickable site pin with mandatory confirmation.
- Editable 2 km walking and 5 km cycling search catchments.
- One controlled primary OpenStreetMap/Overpass facility download.
- Local strict classification into transport, education, everyday-needs, healthcare and leisure categories.
- One selective wider-catchment extension query.
- One nearest valid result per category.
- Routed walking and cycling distances/times using OSRM, with clearly labelled fallback estimates.
- Map markers and selectable walking/cycling route layers.
- CSV, copied table and draft narrative.
- No service worker during Alpha, preventing stale cached releases.

## Known Alpha limitations
- OpenStreetMap data is not authoritative and must be checked before formal submission.
- Public Overpass and routing services can be unavailable or rate-limited.
- Manual facility replacement/addition and report-quality map export are specified but not yet implemented.
- OS grid reference and What3Words input are not yet implemented.

## Deployment
Upload the contents of this directory to the root of a public GitHub repository. Enable GitHub Pages only after confirming `index.html`, `assets/`, `docs/`, and `tests/` appear at the top level.

## Local test
Run:

```bash
node tests/classification.test.mjs
```
