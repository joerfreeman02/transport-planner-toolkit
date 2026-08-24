# BUS-1 continuation checkpoint

Recorded: 2026-08-24

## Outcome

BUS-1 Gate 1 is complete for confirmed assessment points inside Greater London. The application selects the authoritative provider from the confirmed point, retrieves nearby TfL stop records, retains authoritative stop identity and provenance, derives service numbers from TfL's stop `lines`, and presents map markers, an evidence table and Google Maps links.

The national architecture is in place, but production discovery outside London is deliberately blocked. The official NaPTAN v1 interface supplies bulk or ATCO-area files and no browser-safe geographic lookup. Until ATLAS has a trusted point-to-ATCO-area gateway, the NaPTAN adapter returns `coverage_not_implemented`; it never converts that limitation into a zero-stop conclusion.

## Provider and evidence contract

- The provider decision is made after the assessment point is confirmed.
- The official Greater London boundary determines TfL versus NaPTAN; no postcode or bounding-box heuristic is used.
- Stop records keep authoritative IDs, name, indicator/direction, coordinates, routes, source, retrieval time and validation warnings.
- Same-name opposite-direction stops remain distinct because deduplication uses the ATCO/source stop ID.
- Discovery distance is explicitly straight-line. Walking and cycling fields must remain absent until routed distance and time are available.
- UI states distinguish genuine zero results, national coverage not implemented, source unavailable and malformed source data.

## Plaistow assessment schemas

The supplied Plaistow Transport Assessment is an output exemplar, not an implementation instruction. Its eventual stop table structure is:

1. Stop name
2. Direction
3. Walking distance/time
4. Cycling distance/time
5. Routes serving stop

Its eventual service summary structure is:

1. Route
2. Operator
3. Origin/destination
4. Principal locations
5. Operating period

A material qualification belongs in a conditional full-width secondary row beginning `Service note:`. Do not add a frequency column to this canonical service summary. If frequency is later supported elsewhere, write it as `6 buses per hour (approximately every 10 minutes)`; do not use `tph` or `bph`.

## Service discovery status

London service-number discovery is safely supported from TfL stop records. Frequencies, destinations, operating periods and routed walk/cycle measures are not implemented. Outside London, BODS service discovery is also deferred: its key is account-bound and must not be embedded in the static browser or repository.

## Next engineering gate

Provide a trusted, documented server-side gateway that can resolve a confirmed WGS84 point and radius to current authoritative NaPTAN stop records. Then connect it to the existing injected NaPTAN area resolver/fetch contract, add a real non-London control with known nearby stops, and only after that evaluate BODS service enrichment.

## Tooling decision

No repository service was installed. Retain Dependabot. Codecov and OpenSSF Scorecard remain candidates for separately approved pilots. Sentry remains deferred pending privacy and telemetry decisions. Renovate remains deferred because it overlaps Dependabot.
