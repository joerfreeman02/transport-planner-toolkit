# ATLAS National Reference Foundation

The v2 Bus diagnostic produces two deliberately separate views:

1. A source reference layer containing valid NaPTAN StopPoints across Bus/Coach,
   Rail, Tram/Metro, Ferry/Water, Air, other and unknown classifications.
2. A prepared runtime Bus view containing only active, coordinate-valid
   Bus/Coach records used by the current Bus service builder.

The source layer records source identity, status, modification time, coordinates,
StopType semantics, administrative references and provenance. QA reconciles
total source records, mode counts, active/inactive Bus counts, malformed
identity/required fields and invalid/missing coordinates.

StopArea references are source evidence. Runtime membership is a separate
projection and excludes inactive, non-Bus, unresolved and missing targets. This
prevents a deleted/inactive source record such as `0170SGP90856` from being
treated as a missing active runtime StopPoint while preserving the forensic
record.

NPTG locality, parent, higher-locality, administrative and district references
are retained. One-character district codes are valid; unresolved references
remain explicitly classified. No national reference record is fabricated from a
missing target.

The source cache is diagnostic-only, hash-addressed and never a production
checkpoint. Raw source archives are temporary and excluded from diagnostic
artifacts.
