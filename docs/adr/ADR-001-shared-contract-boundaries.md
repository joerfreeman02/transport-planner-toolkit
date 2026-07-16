# ADR-001 — Platform module and shared-contract boundaries

- **Status:** Accepted
- **Date:** 2026-07-16
- **Owner:** Technical Lead

## Context

Frozen modules contain working but partly duplicated platform behaviour. New transport modes require reusable services without creating hidden coupling or incidental baseline changes.

## Options

1. Continue copying module code.
2. Rewrite frozen modules around a new framework.
3. Introduce versioned, domain-neutral contracts and let new modules consume them first.

## Decision

Use option 3. Mapping, export, diagnostics, project context, module output and Knowledge Library schemas are independently versioned contracts. Modules own domain decisions and depend only on documented public interfaces. Frozen consumers are not migrated without formal change control.

## Consequences

New modules can establish the reference architecture without risking existing behaviour. Some temporary implementation duplication may remain until a separately approved migration is safe.
