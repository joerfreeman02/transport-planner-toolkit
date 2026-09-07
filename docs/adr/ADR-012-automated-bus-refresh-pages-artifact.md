# ADR-012 — Automated Bus refresh uses a validated Pages artifact

Status: Proposed for Alpha.7 live acceptance  
Date: 2026-09-07  
Owner: ATLAS engineering

## Context

NaPTAN, BODS and supplementary TNDS inputs must refresh without Joe's workstation, while a failed source or parser run must not replace the last known-good public dataset.

## Decision

GitHub Actions acquires and prepares a complete candidate in an isolated runner directory, validates it, runs deterministic checks, and uploads a complete GitHub Pages artifact containing both the legacy root and `/atlas/`. A separate deployment job runs only after successful build and validation. Weekly generated data is not committed to `main`.

## Consequences

The public status manifest provides refresh traceability without exposing credentials. The previous Pages deployment remains live when acquisition, preparation, validation or testing fails. Final acceptance requires a real GitHub-hosted run with `TNDS_USERNAME` and `TNDS_PASSWORD` configured. The legacy TNDS FTP transport is recorded transparently as an external-source limitation.
