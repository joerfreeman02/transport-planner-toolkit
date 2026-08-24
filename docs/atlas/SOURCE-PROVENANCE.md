# Alpha.3 source and provenance design

Reviewed: 2026-08-24

## Address source

ATLAS uses the public [OpenStreetMap Nominatim Search API](https://nominatim.org/release-docs/latest/api/Search/) through a replaceable adapter. The [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) requires moderate, user-triggered use, meaningful identification, attribution, caching and no client-side autocomplete. Alpha.1 therefore searches only when the user presses **Find address**, rate-limits retry requests to at least 1.1 seconds apart, caches current results, and performs no autocomplete.

The supplied test address did not return a result verbatim. The adapter tried only user-derived normalisations:

1. `33 Westow Street, Crystal Palace, London`
2. `33, Westow Street, Crystal Palace, London`
3. `33, Westow Street, London`

The third query returned the property:

- display: `33, Westow Street, Upper Norwood, London Borough of Croydon, Greater London, England, SE19 3RW, United Kingdom`
- WGS84: `51.4184213, -0.0821281`
- source record: OpenStreetMap `way/189209061`

ATLAS warns that a locality qualifier was removed and does not silently choose the result. The user must confirm it. Coordinates are never hard-coded for this test.

## Transport source

Nearby stops use the official [TfL Unified API](https://api-portal.tfl.gov.uk/) `StopPoint` GeoPoint operation documented in the [TfL Swagger definition](https://api.tfl.gov.uk/swagger/docs/v1). The request is limited to nearby public bus/coach/tram stop points and asks TfL to return the lines recorded against each stop. It does not request frequencies or timetables.

Live endpoint shape:

```text
https://api.tfl.gov.uk/StopPoint
  ?stopTypes=NaptanPublicBusCoachTram
  &radius=700
  &useStopPointHierarchy=false
  &modes=bus
  &categories=none
  &returnLines=true
  &lat=51.4184213
  &lon=-0.0821281
```

TfL recommends portal registration and documents the general plan as 500 requests per minute. On 2026-08-24, the controlled request succeeded anonymously and returned `Access-Control-Allow-Origin: *`, so the Alpha.1 static-browser proof works without exposing a key. This observed anonymous behaviour is not treated as a permanent service guarantee. No `app_key`, `app_id` or secret is embedded.

TfL data attribution is retained in Evidence and follows TfL's [open-data information](https://tfl.gov.uk/info-for/open-data-users/our-open-data?intcmp=3671) and [data sources](https://tfl.gov.uk/corporate/data-sources).

## Provenance retained per fact

Each stop Evidence record retains stop identifier and coordinates, source name and attribution, exact request endpoint, retrieval time, any source dataset timestamp/version, Haversine distance method, validation/confidence, warnings, and freshness/cache state.

TfL did not provide a dataset timestamp/version in this response, so ATLAS records that absence as a warning. It does not fabricate one. Routes are labelled only as serving the stop; Alpha.3 does not claim a service frequency, destination or operating period.

## National routing and boundary source

Provider choice is made from the user-confirmed assessment point and is hidden from the user. Points inside the official Greater London boundary use TfL; points outside use the NaPTAN adapter. The boundary is generated from the Greater London Authority boundary dataset, converted to British National Grid for the point-in-polygon test, simplified deterministically, and stored locally with source, licence and attribution metadata.

The current official NaPTAN v1 API exposes access-node files by ATCO area, not a browser-safe geographic or bounding-box query. Those responses also do not advertise cross-origin browser access. Alpha.3 therefore defines and tests the national adapter contract and CSV parser, but deliberately returns `coverage_not_implemented` until a trusted gateway can resolve the confirmed point to authoritative ATCO-area data. That state is distinct from a genuine zero-stop result, source unavailability and malformed data.

NaPTAN records retain ATCO code, NaPTAN code, common name, indicator, bearing, coordinates and source identity. Deduplication is by authoritative ATCO identity only, so opposite-direction stops with the same name remain separate.

## Cache contract

The address cache TTL is 15 minutes and the TfL proof TTL is 5 minutes. These are conservative Alpha.1 operational values, not approved evidence-methodology windows. Valid cache hits keep their original retrieval time. Stale entries may be reported but cannot replace failed live data without an explicit future policy decision.

