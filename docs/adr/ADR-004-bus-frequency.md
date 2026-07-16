# ADR-004 — Bus service-frequency representation

- **Status:** Accepted
- **Date:** 2026-07-16
- **Owner:** Bus Module Owner

## Context

An unqualified buses-per-hour value can conceal direction, destination, time period, day type and irregular patterns.

## Decision

Every frequency record identifies route, direction, destination, day type, representative period, value/type and qualification. Supported types are exact buses per hour, interval, irregular and unknown. Peak-only, school-day, alternating, limited and seasonal services require notes. Unknown stays unknown.

## Consequences

Exports remain professionally cautious and comparable with the Railway directional-frequency standard.
