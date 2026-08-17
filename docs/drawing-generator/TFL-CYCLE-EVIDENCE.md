# TfL cycle evidence hierarchy

Status: C2 source review; no TfL runtime dependency added.

## Official evidence inspected

1. TfL's open-data catalogue describes the Cycle Routes dataset as Greater London route data supplied in JSON/KML with route names, labels, programme and status, including open, in-progress and future routes: https://tfl.gov.uk/info-for/open-data-users/our-open-data?intcmp=3671
2. The same catalogue describes the Cycling Infrastructure Database (CID) as a Greater London inventory of cycling infrastructure and points to its published data.
3. The official London Datastore CID record states that the data is available as GeoJSON through TfL's open-data portal and is updated monthly: https://data.london.gov.uk/dataset/cycling-infrastructure-database-23n1k
4. TfL's Strategic Cycling Analysis is useful planning evidence for current/future network analysis, but a future or recommended corridor is not evidence that infrastructure is currently open.

## Safe hierarchy

- For a future authoritative adapter, an official TfL Cycle Routes record with an explicit current/open status can supplement or supersede OSM hierarchy within Greater London.
- CID is suitable supporting evidence for the presence/type of local cycling infrastructure, subject to schema, date and geometry validation.
- Strategic Cycling Analysis is planning evidence. Current and future layers must be kept distinct and must not be rendered as confirmed current infrastructure without explicit status.
- The C2 mandatory runtime therefore remains structured OSM bicycle relations: current `icn`/`ncn`/`rcn` become primary network, current `lcn` becomes local network, and proposed/construction/disused evidence remains review-only.

## Why C2 does not integrate TfL at runtime

The official Cycle Routes description explicitly mixes open, in-progress and future routes. A safe adapter needs a pinned schema, explicit status mapping, licensing/attribution confirmation, staleness handling, Greater London coverage checks, deterministic snapshot/provenance fields and tests for status changes. Adding an unverified network request at the C2 gate would create a fragile dependency and could promote future infrastructure into a current drawing. This is deferred rather than silently approximated.

## Acceptance rule for a future adapter

No TfL feature may enter a controlled current-network class unless its source identifier, publisher, retrieved/updated time, explicit current/open status and original status metadata are present in the downloadable snapshot. Unknown, future, in-progress and retired states must remain review-only.
