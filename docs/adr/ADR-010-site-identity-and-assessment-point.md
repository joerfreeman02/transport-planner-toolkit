# ADR-010: Separate site identity from the assessment point

- Status: Accepted for SITE-1 engineering implementation
- Date: 2026-08-24
- Owner: Technical Director

## Context

A development's postal address, building name or site description identifies the development, but transport assessment may need to start at a different pedestrian access, vehicular access or frontage. Treating a geocoder coordinate as the automatically confirmed Site would lose this professional distinction and could make downstream calculations originate from the wrong place.

The legacy Accessibility module proved that planners need an interactive map, a draggable marker, map-click selection, manual coordinates and explicit confirmation. ATLAS needs those behaviours as shared infrastructure without duplicating a Site model per module.

## Options

1. Keep one address-derived coordinate and allow no adjustment.
2. Overwrite the address coordinate whenever the planner moves the marker.
3. Retain immutable address-search evidence and separately confirm one assessment point.

## Decision

ATLAS adopts option 3.

The shared Site records:

- the planner's complete supplied address or site description;
- the selected provider display address and immutable original provider coordinates where available;
- one current assessment point with its establishment method;
- whether it was adjusted from the address result;
- an explicit confirmation timestamp.

The supported SITE-1 methods are address result, planner-adjusted map point, map-selected point and entered coordinates. User-facing wording translates those methods into plain planning language.

Top-level Site latitude and longitude remain the final assessment-point coordinates for safe Alpha.1 downstream compatibility. Bus therefore uses only the confirmed final point. Moving the point invalidates confirmation and any displayed Bus evidence.

## Consequences

- Original Nominatim coordinates remain auditable after marker movement.
- Address-search failure cannot block map/manual selection.
- Every downstream module can consume the same confirmed Site contract.
- SITE-1 supports one assessment point only; multiple accesses and site boundaries require later decisions.
- Project persistence remains outside this increment.
