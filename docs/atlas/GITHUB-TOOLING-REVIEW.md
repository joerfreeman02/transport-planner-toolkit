# GitHub tooling adoption review

Reviewed: 2026-08-24. No tool was installed by this increment.

## Dependabot — adopted and appropriate

`.github/dependabot.yml` remains appropriate. It checks npm and GitHub Actions weekly on Monday, groups production, development and Actions updates, uses Europe/London scheduling, and limits each ecosystem to ten open pull requests. No overlapping dependency bot should be added without a specific unmet need.

Installation milestone: already reached and configured; retain.

## Codecov — review milestone reached, installation deferred

ATLAS now has meaningful deterministic domain and adapter tests, so coverage reporting would help reveal untested branches as the new architecture grows. However, the repository does not yet have one unified coverage-instrumented command and several legacy regression expectations are stale. First define the coverage scope, exclusions, CI command and threshold policy.

Installation milestone: reached for a controlled future pilot. Alpha.1 now has 33 deterministic checks and meaningful browser safeguards, so coverage reporting could add value once a single coverage command, scope and threshold policy are approved. Do not install automatically.

## OpenSSF Scorecard — readiness review reached, installation deferred

Formal architecture, CI and Dependabot make a Scorecard review timely. Before installation, confirm repository visibility, workflow token permissions, branch protection and which findings can be public or actionable.

Installation milestone: reached for security-owner review; not yet for unattended installation. Preserving an unmerged remote development branch improves reviewability but does not itself change the repository's production exposure or resolve branch-protection and workflow-permission questions.

## Sentry — milestone not reached

Alpha.1 is a static internal proof handling a user-entered address and coordinates. Telemetry would create privacy, retention, consent and data-controller questions disproportionate to the current need. Existing explicit UI errors and automated tests are sufficient for this increment.

Installation milestone: not reached. Require a separate privacy/telemetry decision and data-minimisation design.

## Renovate — milestone not reached

Dependabot already covers both dependency ecosystems in scope. Renovate would overlap without a documented capability gap and increase automation noise.

Installation milestone: not reached. Reconsider only if Dependabot cannot support an agreed update policy.
