# ADR-013 — ATLAS National Transport Reference Foundation

Status: APPROVED PRINCIPLES / IMPLEMENTATION UNDER VALIDATION  
Date: 2026-09-22

## Decision

NaPTAN XML and NPTG XML are authoritative national reference inputs for the
prepared-data v2 diagnostic. The source reference layer retains valid records
across transport modes and records malformed identity, malformed required
fields, unsupported mode, invalid/missing coordinates, inactive status and
unresolved relationships as bounded QA evidence.

The runtime Bus candidate is a projection of active, coordinate-valid
Bus/Coach StopPoints only. Source StopArea membership is retained separately;
active runtime membership contains only members that exist in that projection.
Inactive, non-Bus, unresolved and missing members are classified rather than
silently converted into runtime integrity failures. A genuine active runtime
integrity failure remains fail-closed.

NPTG identifiers are validated as non-empty reference identifiers, including
legitimate one-character district codes. Missing district references remain
unresolved evidence and are not invented.

The implementation is diagnostic-only pending national evidence. No publication,
checkpoint restore/save, Pages deployment or runtime StopArea policy activation
is authorized by this ADR.
