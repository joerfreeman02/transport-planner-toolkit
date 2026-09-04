# BUS-1 Alpha.4 interrupted test record

Recorded: 2026-09-04, Europe/London

This is a WIP recovery record, not completion evidence.

## Passing work before the emergency stop

- The then-current deterministic suite passed 93 checks, including the first complete prepared-data snapshot. That snapshot was subsequently replaced by an interrupted rebuild and is no longer present in the worktree.
- Deterministic Chromium workflows passed for the ATLAS smoke, SITE-1 selector, planner UX and review environment. The UX run checked 1440 px, 1024 px and 390 px, no horizontal overflow, legacy Toolkit access, plain-language failure copy, and no page/console/failed-request errors. Captures were inspected but remain temporary and uncommitted.
- Live Crystal Palace address/TfL control passed: exact property `way/189209061`, 31 TfL stops, anonymous access, no secret.
- Live Waltham Cross control at manually entered `51.6857829, -0.0330001` passed: 16 NaPTAN stops, 66 directional BODS summaries, routed walking and cycling, complete status, no credential.
- The first Cambridge live run failed because active NaPTAN records with British National Grid coordinates but blank WGS84 fields had been excluded. The pure-Python OSGB36-to-WGS84 correction was added and checked against the NaPTAN Temple Meads reference to sub-metre coordinate agreement, but the required national rebuild/retest was interrupted.

## Minimum recovery checks after the stop

- JavaScript syntax: four new Bus domain/adapter/application modules passed.
- Bus service assessment: 11/11 passed.
- Prepared bus-data adapter: 5/5 passed.
- OSRM access routing: 4/4 passed.
- Bus application orchestration: 3/3 passed.
- Python transformer parsed successfully.
- Review server shell: HTTP 200.
- Prepared manifest: HTTP 404, confirming the interrupted dataset is not usable.

The current full deterministic suite was deliberately not run because `prepared-bus-data-integrity.test.mjs` requires the missing completed manifest and stop shards. Browser/live suites were not rerun after the coordinate correction. Continuation must regenerate the dataset from retained inputs, run the full deterministic/browser/live matrix, and reassess merge readiness.
