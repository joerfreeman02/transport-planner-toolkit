# ATLAS BUS — BUS-CLOSEOUT-1

## Controlled implementation handover

Date: 2026-09-21  
Starting production `main`: `c670698dbf709a953d15b3927ee677fb502d1b3a`  
Working branch: `codex/atlas-bus-closeout`  
Scope: documentation, presentation and local verification only. This branch must not be merged or used to dispatch a production refresh until Technical Director review is complete.

## Forensic result: Normanshire / TfL completeness

The exact production baseline was exercised through the authoritative TfL/BODS composition at Normanshire Drive using both 400 m and 700 m radii. The 700 m control produced complete assessments with routes `215`, `385` and `397` present, alongside `397A`; it also retained both approved route `444` directions: `Towards Chingford Station` and `Towards Turnpike Lane Bus Station`.

The reproduction generated no TfL timetable request identities and no unresolved request identities. The returned timetable provenance was BODS (`timetableConclusion: MATCHED`). Therefore the reported Run #24 request-level defect is not reproducible from this checkout and no cause can be proven from the local evidence. The evidence is insufficient to justify a speculative adapter, scheduler or compatibility correction. Routes `215`, `385` and `397` remain an investigation item for a run/candidate-level reproduction.

Route `397A` remains a tracked mixed-source / London Service Permit case for later mixed-source handling unless the BUS-CLOSEOUT investigation proves that it is directly part of the current completeness defect.

No change was made to `src/atlas/domain/service-calendar.mjs` or any other checkpoint-compatibility-impacting file. The investigation did not require a compatibility change, so it was not escalated as a stop condition.

## Implemented bounded corrections

- Planner and Word-facing calendar labels are concise while retaining uncertainty: `Standard days`, `Specific calendar` and `Calendar not confirmed`; mixed-calendar rows state that calendar profiles vary and each frequency line is labelled.
- The Word export no longer emits the raw internal `reviewItems` diagnostic dump. Review evidence remains in the assessment result and internal evidence structures.
- Browser/Word semantics continue to use the same planner rows; the existing parity and calendar-safety tests cover the change.
- No NPTG, BUS-DEST, BUS-GROUP or BUS-CIRC architecture was introduced. No secrets, Actions variables, release version, caches, reference-data repositories, production refresh or publication state were changed.

## Checkpoint compatibility

The accepted Recovery-0F checkpoint producer remains reusable in principle. This branch does not alter the checkpoint schema, save/restore path, candidate identity, service-calendar compatibility logic or production workflow. A fresh production run and any post-checkpoint failure investigation remain separate Technical Director decisions.

## Local control register

Controls were captured from the exact starting SHA on 2026-09-21. All four local assessments completed with zero unresolved request identities and zero internal review items:

| Control | Stops | Routes | Service summaries | Planner rows | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Normanshire Drive 400 m | 7 | 11 | 22 | 22 | Complete |
| Normanshire Drive 700 m | 18 | 11 | 22 | 22 | Complete |
| Pipers Lane 700 m | 11 | 1 | 1 | 1 | Complete; local prepared data exposes route 230 only |
| Waltham Cross 700 m | 16 | 21 | 67 | 40 | Complete |

The Pipers result is a local deterministic control, not confirmation of the Run #24 candidate population: this checkout's prepared data exposes route `230` only at that location. The prepared data was dated 2026-09-04 and must be refreshed before formal use.

Outputs and the full forensic register are under `work/bus-closeout-1/controls/`:

- `ATLAS BUS-CLOSEOUT-1 — normanshire-drive-400m.docx`
- `ATLAS BUS-CLOSEOUT-1 — normanshire-drive-700m.docx`
- `ATLAS BUS-CLOSEOUT-1 — pipers-lane-700m.docx`
- `ATLAS BUS-CLOSEOUT-1 — waltham-cross-700m.docx`
- `BUS-CLOSEOUT-1-control-register.json`

Word page counts were not recorded in the local harness; the DOCX files are available for manual Word review.

## Validation and limitations

The full Alpha.15 deterministic suite passed, including the calendar, planner, Word export, production-fidelity, source-completeness, integrity, TfL adapter, browser/UI, checkpoint-compatibility, composition, assessment and publication checks. The first sandboxed attempt was blocked by Windows child-process permission; the same suite was then rerun with child-process execution enabled and passed.

This branch is **NOT READY FOR PRODUCTION**. Recommendation: **ACCEPT FOR MANUAL TESTING** only, subject to Technical Director review of the PR, local DOCX controls and a future authoritative reproduction of the unresolved TfL request investigation. Do not merge, dispatch Run #24, publish reference data or deploy Pages from this branch as part of this sprint.
