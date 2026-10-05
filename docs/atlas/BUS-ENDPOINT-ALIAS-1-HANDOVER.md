# BUS-ENDPOINT-ALIAS-1 handover

Status: implementation complete; READY FOR PRODUCT OWNER MANUAL ACCEPTANCE.

## Identity

- Baseline: `1cc4c288bd890cd33b0876cb5fa15b7a7588651f`
- Final implementation SHA: `eb41bd1` (`eb41bd1` is the clean implementation commit; the handover itself is a later documentation-only commit.)
- Branch: `codex/atlas-bus-endpoint-alias-closeout`
- Release: `ATLAS 2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`
- Worktree: `atlas-bus-tfl-operating-period-1c`

## Correction

The false short-working notes were caused by presentation labels being allowed to outrank structured endpoint identity. A canonical StopArea/StopPoint could therefore appear different when another source supplied a locality-qualified or otherwise richer name.

The correction keeps identity and presentation separate:

1. Exact StopArea/StopPoint and exact StopPoint-reference evidence establish endpoint identity.
2. Two exact endpoints are aliases only when their canonical identity or exact StopPoint IDs agree. Locality/name similarity cannot override a physical mismatch.
3. A richer label is selected from the same exact endpoint evidence using deterministic quality: resolved exact evidence, contextual qualification, locality, StopArea name, then available display text. There is no longest-string or route/site-specific rule.
4. A genuinely different endpoint continues to produce a short-working note.

The school-day presentation is now exactly `School-day journeys only.`. Calendar profiles, active days, frequency and operating-period calculations are unchanged.

## Frozen Waltham review

Source: frozen diagnostic snapshot from workflow run `36125621080`, snapshot `8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9`; V2 preparation was run with acquisition disabled and remains diagnostic-only/non-production-eligible.

- Before/after 279: `Towards Rookwood Road` plus the redundant `Stamford Hill (Rookwood Road)` short-working is consolidated to the richer `Towards Stamford Hill (Rookwood Road)` presentation; the genuine Manor House branch remains as Additional services.
- Before/after N279: `Towards Trafalgar Square / Charing Cross Stn` plus the redundant Charing Cross alias is consolidated to `Towards Charing Cross (Trafalgar Square)` with no short-working note.
- Before/after 317: `Towards Little Park Gardens` plus the redundant Enfield Town alias is consolidated to `Towards Enfield Town (Little Park Gardens)` with no short-working note.
- Genuine controls: 251 and 66 retain `Some route ... journeys operate to Hammond Street (Smiths Lane)`.
- Frozen Waltham period/runtime controls for 217, 279, 317, 327 and N279 passed; the Waltham 1D and mixed 1E Browser/Word controls passed.

Chingford controls passed: 357, 444 and W16 retain two directions; 657 remains one weekday service with zero Saturday/Sunday departures and the exact `School-day journeys only.` wording.

## Regression evidence

- Focused endpoint-alias, DEST, GROUP, CIRC, service-assessment, calendar-safety, Waltham runtime and Browser/Word tests passed.
- Exact full suite passed: `ATLAS Alpha.15 deterministic suite passed.`
- Review environment passed all 7 controls, including clean-SHA build injection.
- Final V2 review URL: [ATLAS V2 review](http://127.0.0.1:8769/atlas/?review=v2#modules)
- Final build header: `BUS-TFL-COMPLETE · eb41bd1`
- No route/site names are hard-coded in the corrected `src/atlas` production logic.

## Files

Implementation commit files:

- `src/atlas/domain/bus-grouping.mjs`
- `src/atlas/domain/bus-planner-summary.mjs`
- `src/atlas/domain/bus-service-assessment.mjs`
- `src/atlas/domain/service-calendar.mjs`
- `src/atlas/presentation/bus-word-export.mjs`
- `tests/atlas/bus-endpoint-alias-closeout.test.mjs`
- `tests/atlas/alpha13-summary-closeout.test.mjs`
- `tests/atlas/bus-alpha13-planner-summary.test.mjs`
- `tests/atlas/bus-alpha5.test.mjs`
- `tests/atlas/bus-group-1f-real-runtime.test.mjs`
- `tests/atlas/bus-group-stop-1a-hardening.test.mjs`
- `tests/atlas/bus-group-terminus.test.mjs`
- `tests/atlas/bus-qa-02-frequency.test.mjs`
- `tests/atlas/bus-service-assessment.test.mjs`
- `tests/atlas/run-all.mjs`
- `tests/atlas/tfl-bus-timetable.test.mjs`

This handover is the documentation-only follow-up.

## Governance and limitations

No merge, deployment, publication, activation, Alpha.16, or BUS-POLISH work occurred. National acquisition remains disabled for the V2 review; the supplied frozen snapshot was reused only for bounded diagnostics. Product Owner manual Browser and Word inspection remains the acceptance gate.

GitHub tooling adoption remains unchanged: Dependabot retained; Codecov deferred pending approval; OpenSSF Scorecard is a governed future consideration; Sentry deferred; Renovate deferred; branch protection requires repository-side confirmation. No tooling was installed or reconfigured.
