# BUS-1.0.0 test results

Date: 16 July 2026  
Build: `BUS-RESET-100-20260716`  
Branch: `sprint-4-bus-foundation`

## Exact deployed review URL

`https://raw.githack.com/joerfreeman02/transport-planner-toolkit/sprint-4-bus-foundation/modules/bus/index.html`

Real-browser result using `CB7 4AH`: BUS-1.0.0 initialised, map rendered, address returned, confirmed draggable marker enabled discovery, and 20 stop rows/markers completed walking and cycling processing. No console warnings or errors were recorded.

Automated deployed smoke result: map, confirmation gate, opposite-direction separation, walking/cycling routing, self-instructing export, completed import, linked Knowledge Library, DOCX and CSV all passed. Console and uncaught error collections were empty. Controlled stop/routing fixtures make this workflow test deterministic; the separate real-browser result above verifies live providers.

## Static and regression results

- JavaScript syntax checks: passed.
- Bus reset assertions: 9/9 passed.
- Bus HTML path audit: passed.
- Accessibility classification regression: 6/6 passed.
- Railway regression: 27/27 passed.
- Accepted shared Word export formatter: 13/13 passed.
- Protected-path diff against `91b856f`: no changes outside `modules/bus/`.

