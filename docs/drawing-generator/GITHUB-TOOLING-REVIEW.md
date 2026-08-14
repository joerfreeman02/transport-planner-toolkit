# GitHub tooling adoption review

- **Dependabot:** adopted with weekly, grouped npm and GitHub Actions pull requests. No automerge.
- **CI:** adopted as a narrowly scoped additive workflow. It installs pinned lockfile dependencies, runs DG deterministic tests, selected existing passing critical regressions, installs Chromium and runs the fixture-backed DG browser acceptance. It does not replace GitHub Pages deployment.
- **Codecov:** not installed; no approval exists. Local Node V8 coverage was generated and recorded in `TEST-EVIDENCE.md`. Reassess after DG-0 acceptance and a repository-wide coverage policy.
- **OpenSSF Scorecard:** not installed and not a Monday blocker. Recommended as a later repository-governance PR after permissions and public reporting are approved.
- **Sentry:** not installed. Client-data telemetry requires a separate privacy/data decision.
- **Renovate:** not installed because Dependabot is the selected dependency manager.
