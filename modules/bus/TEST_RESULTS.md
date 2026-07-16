# BUS-1.1.0 production test results

Date: 16 July 2026  
Build: `BUS-PROD-110-20260716`

- Static Bus production checks: 10/10 passed.
- Bus polish checks: 13/13 passed.
- Browser workflow: optional project name, address, confirm gate, opposite directions, transparent unnamed stop, routing, export/import, automatic wording, DOCX and CSV passed.
- Ambiguous weekday-frequency column absent; Operating period and Service pattern present.
- Shared-library browser tests: read-only loading, valid/invalid tokens, session/remembered storage, Rail/Bus publication, stale protection and conflict retry passed.
- Token absent from DOM, console, diagnostics, exports and tracked source.
- Genuine DOCX package, A4 portrait, EAS margins, table captions, column geometry and non-duplication passed structural QA.
- LibreOffice was unavailable and installed Word did not complete reliable headless PDF conversion; rendered-page visual QA could not be completed on this workstation.
- Accessibility: 6/6; Railway: 27/27; shared Word formatter: 13/13; contracts: 6/6; foundation regression: passed.
