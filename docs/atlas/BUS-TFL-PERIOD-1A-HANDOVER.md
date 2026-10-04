# BUS-TFL-PERIOD-1A handover

## Scope

BUS-TFL-PERIOD-1A corrects the final operating-period calculation for mixed TfL plus supplementary national evidence and preserves departure-style wording for a single scheduled journey. Production remains Alpha.15. No GROUP, CIRC, DEST, stop grouping, nearest-stop, operator, route-family, terminus, frequency, publication, activation, deployment or merge change is included.

Baseline branch: `codex/atlas-bus-tfl-operating-period`

Baseline SHA: `804ccaedd519bd8c59179464d5733f6829da6e84`

## Proven Waltham root cause

The planner basis StopPoint was `210021703420` (Waltham Cross Bus Station Stop A). At that StopPoint the mixed runtime population contained BODS exact departures beginning at `00:05` and `00:25`, while the bounded TfL calls for routes 217 and 317 returned authoritative scheduled journeys beginning in the daytime and continuing after midnight. The period path used the mixed exact departure population as one min/max set, so the supplementary BODS values redefined the TfL service-day boundary. The defect was therefore mixed TfL+BODS operating-period poisoning, not a TfL chronology failure, missing TfL period evidence, or a GROUP/CIRC failure.

The bounded Stop A fixture records:

| Route | TfL pattern | calendar profiles | TfL first/last known journey | TfL period evidence | supplementary BODS evidence in the affected population |
|---|---|---|---|---|---|
| 217 | `0`; 3 schedules; 84/69/60 known journeys | ordinary weekday/weekend schedule buckets | `04:50` / `24:25` (`290` / `1465`) | chronological TfL periods beginning at `04:00`, continuing through `24:59` | `00:05`, `00:25`, then daytime departures through `24:25` |
| 317 | `0`; 3 schedules; 54/52/37 known journeys | ordinary weekday/weekend schedule buckets | `05:05` / `24:35` (`305` / `1475`) | chronological TfL periods beginning at `05:00`, continuing through `24:59` | `00:05`, then daytime departures through `23:35` |
| 327 | `0`; 2 schedules; 19/19 known journeys | ordinary weekday/weekend schedule buckets | `07:00` / `19:00` | `07:00`–`19:59` | retained as supplementary only where present |

The deterministic source fixture is `tests/atlas/fixtures/tfl-waltham-stop-a-operating-period-1a.json`; its capture tool is `tools/atlas-review/capture-tfl-operating-period-1a-stop-a.mjs`. It contains three bounded TfL HTTP calls at the actual planner basis StopPoint.

## Corrected authority rule

For operating-period calculation only, departure evidence is partitioned by provider. If authoritative TfL scheduled evidence exists for the selected StopPoint, TfL departures and compatible TfL operating-period evidence define the final period. BODS/TNDS evidence is retained in `departuresByDay`, `departureEvidenceByDay`, and the authority audit object for frequency and review; it cannot redefine the TfL span. A material supplementary extension produces a review warning.

Multiple TfL patterns are unioned only when their route, direction/origin/destination semantics and calendar profile are compatible. Opposite or irreconcilable semantic patterns remain a conflict and are not combined. Provider selection is generic; no route number is hard-coded.

The frequency population remains unchanged and still includes the retained source evidence. Genuine BODS-only populations continue to use their existing exact departure-period behaviour. Night-service chronology remains based on the existing chronological service-day rules.

## Single-journey rule

When one authoritative scheduled departure exists for a route, direction, StopPoint and calendar/day, the displayed period is `Departs approx. HH:MM` using the exact scheduled journey. Broad TfL period boundaries remain in structured evidence (`evidenceFirstMinute` / `evidenceLastMinute` and the retained operating-period evidence) but do not imply continuous service. Multi-journey TfL services continue to use compatible structured operating-period boundaries.

## Replay outcome

- Waltham routes 13, 14, 15, 16, 16C, 25C, 66, 217, 242, 251, 279, 310, 317, 327, 491, A1 and N279 remain on the accepted GROUP/CIRC structure. 217 and 317 now use the authoritative daytime-plus-after-midnight TfL span at Stop A; 327 remains daytime, 279/491 retain their accepted daytime spans, and N279 retains genuine night chronology.
- Normanshire/Chingford Grove Road routes 357, 444 and W16 retain both directions; 657 remains school-days-only and one journey/day, now shown with departure-style wording from its exact scheduled journey.
- Pipers/BODS remains unchanged; BODS-only one-journey behaviour, including 25C, is preserved.
- Browser and Word use the same planner summary fields and therefore retain parity for the corrected period text.

## Verification

Focused TfL operating-period tests pass, including mixed-source authority, supplementary retention/warning, compatible and opposite TfL pattern handling, 217/317 chronology, single-journey wording, night service and BODS-only controls. The BUS-GROUP, BUS-CIRC, BUS-DEST, Alpha.13–Alpha.15, Word and browser contracts pass. The full Atlas suite passes after the review-environment check is run from a committed clean tree so its build-label assertion has the final SHA.

No national acquisition or rebuild was performed. No publication, activation or deployment was performed.
