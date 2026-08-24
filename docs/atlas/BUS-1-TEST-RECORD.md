# BUS-1 test record

Recorded: 2026-08-24, Europe/London

## Deterministic and browser checks

- Alpha.3 deterministic suite: passed, including site, selector, evidence, source-adapter, geocoding, TfL, Greater London geography, NaPTAN parsing/routing, legacy isolation and review-environment checks.
- Automated browser smoke and UX suite: passed at 1440 px, 1024 px and mobile widths with no page, console or failed-request errors under controlled fixtures.
- In-app browser live check: passed for `33 Westow Street, Crystal Palace`; the exact property was selected and confirmed before bus discovery.
- Result: 31 TfL stops within the 700 m discovery radius, 31 stop markers, 31 Google Maps links and service numbers from TfL stop records. The closest record was Westow Street, Stop H, 65 m straight-line distance, routes 249, 322, 417, 432, 450, N2 and N137.

## Live source controls

London control at `51.4184213, -0.0821281` passed anonymously against Nominatim and TfL on 2026-08-24. TfL returned 31 stops and `Access-Control-Allow-Origin: *`; no API secret is stored. TfL supplied no dataset timestamp/version, which remains a visible provenance warning.

The exact Waltham Cross street query did not return a property-level Nominatim candidate. The control therefore used only the returned Waltham Cross town record at `51.6857829, -0.0330001` and did not pretend that it was the requested property. Boundary routing selected NaPTAN, and the result was the expected explicit `coverage_not_implemented` blocker. No stop or service conclusion was inferred.

## Known boundary

This checkpoint does not validate national stop discovery, frequency, destination, operating period or routed walking/cycling evidence. Those omissions are visible scope boundaries, not silent fallbacks.
