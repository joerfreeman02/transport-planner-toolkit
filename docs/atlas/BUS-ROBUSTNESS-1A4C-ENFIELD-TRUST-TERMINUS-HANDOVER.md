# BUS-ROBUSTNESS-1A4C — Enfield trust and terminus handover

## Build identity

- Repository: `transport-planner-toolkit`
- Branch/worktree: `codex/atlas-bus-enfield-trust-terminus-closeout` / `atlas-bus-enfield-trust-terminus-closeout`
- Baseline: `f8ffd7840ecbbd7b2492c4d8d587ab268389f572`
- Formal version remains `2.0.0-alpha.15`.
- Implementation SHA and final tip: the single commit containing this handover and implementation; see the final git handoff for its full SHA.
- No merge, deployment, version promotion, national acquisition, or TNDS activation was performed.

## Stop Z1 / map reference M

The baseline comparison used frozen prepared snapshot `36125621080` and the same Enfield point (51.6506, -0.0783), radius 250 m. Stop Z1 / Cecil Road is StopPoint `490006586T`, NaPTAN WGS84, active, transport mode `bus_coach`, in StopArea `naptan:490G00006586`. It has no route metadata (`routes: []`). Its measured straight-line discovery distance was approximately 453–457 m depending on the measurement path; routed pedestrian distance was 443 m. It was not part of the baseline eligible candidate set, and it was admitted in the 1A4B path by the widened `bus`/`bus_coach` prepared-record eligibility while completing the logical StopArea group. The hypothesis is therefore confirmed for this record: 1A4B caused its appearance in this candidate population.

The available snapshot establishes an active coach-mode NaPTAN record but does not establish that it is a normal passenger-bus stop or provide route evidence. The correction does not hide or arbitrarily cap it. Browser labels it as having no routes recorded by NaPTAN, not assessed in detail, and not included in the report when unchecked. The Word summary uses the same status taxonomy and continues to include only report-selected stops. This explains the former Browser/Word population difference without implying that a selected/assessed stop has no service.

Route-status wording distinguishes positive route records, no routes recorded by NaPTAN, unavailable/partial timetable evidence, and an unassessed candidate. “Routes unavailable” is not used alone.

## Terminus proof and correction

The false notes arose when the runtime pattern was clipped to the assessed corridor: its first/last stop was treated as an ordered route terminus without proving that the exact endpoint StopPoint ID for that side was the same ID. For example, route 121’s inbound pattern began at Enfield StopPoint `490001101K` while its source origin was Turnpike Lane Bus Station (`490008903E`); the pattern was a corridor slice, not proof that Enfield was the route’s origin. Similar mismatches existed in 191/307/317 and other affected summaries. The previous edge-position logic could consequently turn an assessed corridor edge into a false terminus.

The generic correction requires the ordered pattern edge and exact endpoint StopPoint identity to agree before it can prove a terminus. A clipped edge that touches the assessed place can remain `unresolved-review`, but produces no public terminus note or arrival suppression. Exact StopArea/StopPoint matching and the real Waltham Cross Bus Station terminal fixture remain supported; circular-terminal classification remains owned by BUS-CIRC and unchanged.

Enfield trace after correction: no `Route terminus` note is emitted for the affected intermediate-stop route set. The Enfield 313 ordinary Potters Bar row remains; where its source pattern is corridor-clipped, the assessed stop is treated as through-service rather than as a terminus. Focused terminus tests cover intermediate, true Waltham terminus, circular, and clipped-pattern controls.

## Endpoint conflict review

There were two independently demonstrated causes. First, for the same exact StopPoint ID, persisted and authoritative common-name variation was being treated as a material place conflict. Same-ID aliases are presentation variation, not physical-place disagreement; the authoritative TfL/NaPTAN/reference name remains preferred. Incompatible locality and StopArea identities remain material and reviewable. A deterministic test proves same ID plus an older alias is non-conflicting and that an incompatible locality remains a conflict.

Second, several affected route summaries supplied multiple Enfield corridor StopPoint candidates even though those IDs did not agree with the ordered route-pattern endpoint. Hydrating that set made several distinct StopAreas appear to be competing identities for one endpoint. The generic resolver now only hydrates endpoint candidates that agree with an available ordered pattern edge; otherwise it fails closed rather than manufacturing a multi-place conflict. A deterministic clipped-corridor test verifies that the candidate set cannot become an endpoint or raise a false conflict.

In the exact Enfield live assessment, the prior state had 13 planner-endpoint-resolution review items. The corrected run had zero material endpoint conflicts and two remaining review items, both for 313 origin summaries whose source origin was “Origin not supplied” and which had no aligned exact endpoint identity. Those remain explicit unresolved-source reviews; no place is inferred. No other endpoint warning is silently suppressed.

## 313 and timetable note

The bounded Enfield live run completed successfully against snapshot `36125621080`; 47 TfL timetable requests were made, with no unresolved request failures. The ordinary route 313 direction remains “Towards Potters Bar Railway Station”, with the ordinary approximately 20-minute timetable and its existing operating-period evidence. Dame Alice Owen’s School remains secondary as an additional/restricted service, not the main destination. No route number, stop ID, or Enfield-specific behavior is hard-coded into the correction.

The timetable note’s Browser annotation now uses the same full-width annotation treatment, typography, label styling, padding, background and alignment as the Presentation note. The Word export uses the corresponding note-row treatment and “Timetable note:” label. Timetable wording and timetable calculations were not changed.

## Regression coverage and limitations

Focused regressions cover the candidate route-status taxonomy and Browser/Word population distinction, same-ID alias versus genuine place conflict, clipped-pattern endpoint conflict, intermediate versus true terminus, circular control, 313 Potters Bar versus school extension, and Browser/Word timetable-note parity. The broader deterministic suite is required to verify the existing 1A4/1A4A/1A4B, endpoint alias, DEST, GROUP, CIRC, calendar, source-authority and presentation controls.

The Waltham and Chingford quick-control families must be reported only to the extent exercised by the exact acceptance run; this handover does not claim fresh live Waltham/Chingford timetable acquisitions. The frozen snapshot remains `36125621080`.

## GitHub tooling adoption review

The repository already has weekly Dependabot npm and GitHub Actions update groups in `.github/dependabot.yml`; retain it as the single dependency-update bot for now. GitHub documents that version updates are configured by ecosystem and schedule in this file ([Dependabot version updates](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-version-updates)).

- **Dependabot — retain.** Already configured and native to the GitHub repository; no change made.
- **Codecov — defer.** Could provide hosted coverage reports and PR coverage comparison, but this repository currently has a deterministic test suite and no configured coverage-report upload workflow. Add only if coverage thresholds/ownership are agreed; it would require a workflow and token/service setup ([Codecov quick start](https://docs.codecov.com/docs/quick-start)).
- **OpenSSF Scorecard — consider later.** Useful security-posture checks for Actions, dependency hygiene, and repository practices; adoption depends on repository visibility and GitHub code-scanning/permissions configuration. Pin the Action to a reviewed version and keep workflow permissions minimal ([Scorecard](https://github.com/ossf/scorecard), [Scorecard Action setup](https://github.com/ossf/scorecard-action)).
- **Sentry — defer pending operational/privacy requirements.** Browser error and performance monitoring could help a deployed planner, but this sprint’s local review environment has no established production release/environment policy, event-retention decision, or user-data scrubbing configuration. Do not add a browser SDK before those owners and controls are agreed ([Sentry JavaScript SDK](https://github.com/getsentry/sentry-javascript)).
- **Renovate — do not add alongside Dependabot now.** It is a capable alternative with hosted and self-hosted operating models, but overlaps the existing weekly Dependabot PR flow and adds another bot/service configuration. Reconsider only if multi-ecosystem or grouping needs exceed the existing setup ([Renovate documentation](https://docs.renovatebot.com/)).

No tooling was installed or reconfigured as part of this review.
