# Bus Assessment

BUS-1.0.0 is a self-contained Sprint 4 review module modelled on the accepted Railway Assessment workflow.

Planner workflow: confirm a project/site, discover and route nearby stops, select relevant stops, export a self-instructing ChatGPT research request, import completed research, reuse verified library records and export EAS tables/wording.

Knowledge entities:

- Bus Stop — identity, pair, direction, routes and verification evidence.
- Bus Route — reusable route number, operator, termini and principal locations.
- Stop–route relationship — direction, stop-specific destination, hours, frequencies, qualifications and wording.

Run static checks with `node modules/bus/tests/reset-check.mjs`. Run the browser test while `modules/bus/tests/serve.mjs` is serving the repository root using `node modules/bus/tests/browser-smoke.mjs`.

