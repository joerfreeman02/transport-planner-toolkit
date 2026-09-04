# GitHub tooling adoption review

Reviewed: 2026-09-04. No repository tool was installed during BUS-1.

## Dependabot — retain

Keep the adopted weekly npm and GitHub Actions configuration. It already covers the current dependency ecosystems and no BUS-1 need justifies replacement.

## Codecov — pilot justified, approval required

The 93-check deterministic ATLAS suite plus browser and live workflows now make a scoped coverage pilot worthwhile. Before installation, approve the measured source scope, legacy exclusions, CI command, threshold policy and treatment of generated national data. Do not install automatically.

## OpenSSF Scorecard — separate governance/security review reached

The formal architecture, protected legacy checks, CI and dependency automation justify a separate review. Confirm repository visibility, workflow permissions, branch protection and public-finding policy before installation. Do not install automatically.

## Sentry — continue to defer

ATLAS handles addresses and precise locations. Telemetry requires an explicit privacy, retention, consent, access and data-controller decision. Deterministic/browser checks and visible error states remain proportionate for this static candidate.

## Renovate — continue to defer

Dependabot already performs dependency updates. Renovate would duplicate it without a documented unmet need.
