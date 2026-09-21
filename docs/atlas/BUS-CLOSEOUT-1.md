# ATLAS BUS — BUS-CLOSEOUT-1 / 1A

## Controlled implementation handover

Date: 2026-09-21  
Starting production `main`: `c670698dbf709a953d15b3927ee677fb502d1b3a`  
PR #48 reviewed head: `12df8c2b77c398a5f63e4a890939edf74a196aa5`
Scope: bounded presentation correction, Word qualification, production-fidelity controls and forensic documentation only. This branch must not be merged or used to dispatch a production refresh until Technical Director review is complete.

## Data-source distinction

The earlier BUS-CLOSEOUT-1 local harness used the checkout-local `atlas/data/bus/` and `atlas/data/bus-tnds/` trees. Those are stale test data generated 2026-09-04; local TNDS coverage is incomplete and they are not Run #24 / State C controls. The earlier local Pipers result showing route `230` only must not be treated as production evidence.

BUS-CLOSEOUT-1A uses the deployed ATLAS configuration and fails closed unless it reads publication `35352167115-c670698dbf709a953d15b3927ee677fb502d1b3a`. The verified production source was:

- Bus publication: generated `2026-09-18T13:46:55Z`, snapshot `2026-09-18`, BODS source hash `8a2764d2309d4908b71280bdd0708cddb68b242d1a5c2b8fdfcac4bd85a17b2c`.
- TNDS: active Bank A, roots A1/A2/A3, each generated `2026-09-18T13:46:55Z` and carrying the same publication version.
- Release build: `ATLAS-2.0.0-alpha.15-20260914`.
- TfL and OSRM were live requests; BODS/TNDS were loaded from the deployed publication roots.

## Forensic result: Normanshire / TfL completeness

The production-fidelity 700 m control classifies `51.6162611, -0.0125148` inside Greater London. It attempted 83 live TfL timetable requests and produced 23 unresolved request identities, all involving routes `215`, `385` and `397`. The assessment is correctly `partial`; the defect is reproduced on the actual Run #24 State C data path and must not be described as absent.

The accepted route `444` directions remain exact on both base and branch: `Towards Chingford Station` and `Towards Turnpike Lane Bus Station`. Route `397A` was not established in the current production route population and remains separately tracked as a mixed-source / London Service Permit case; no evidence establishes that it is part of the current 215/385/397 defect.

No TfL adapter or candidate-generation correction was made. The production evidence indicates the unresolved route/StopPoint request behavior is present in the accepted production path; the branch adds only a truthful Word qualification and fixes presentation labels.

## Implemented corrections

- `profileLines()` now accepts a profile ID and derives its concise label exactly once. Single-profile ordinary, school-day, term-time, non-school-day, holiday, other-resolved and unresolved cases are covered by explicit regression tests.
- Word no longer exports raw `reviewItems` messages or StopPoint/request identities. When material review items exist it emits exactly one deterministic qualification, deduplicating and numerically sorting affected timetable routes. Complete assessments with no review items receive no qualification.
- The qualification is: `Planner review required: timetable evidence remains unresolved for routes … at one or more assessed stops. Detailed source evidence is retained in ATLAS and should be reviewed before formal use.` Generic material evidence uses the corresponding non-route-specific wording.
- Browser/Word service population, grouping, destinations, directions, frequencies and circular semantics remain unchanged. The Transport Statement wording that material qualifications appear in the Bus Service Summary remains true.
- No NPTG, BUS-DEST, BUS-GROUP, BUS-CIRC, route redesign, destination enrichment, publication architecture, checkpoint architecture, workflow, secret, Actions-variable, Pages or version change was made.

## Base-vs-branch production comparison

Both worktrees used the same deployed Run #24 publication. Base executed `c670698dbf709a953d15b3927ee677fb502d1b3a`; branch executed `12df8c2b77c398a5f63e4a890939edf74a196aa5`. The following semantic fields matched for every control: discovered stop count, service-summary count, planner-row count, route population, planner route numbers, route directions, review-item types and assessment status. Key frequency/direction evidence also matched; the only intended differences were calendar wording and the one concise Word qualification on controls with material review items.

| Production control | Stops | Service summaries | Planner rows | Route population | Review items | TfL requests | Word rows / notes | Branch qualification |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Normanshire 400 m | 7 | 14 | 14 | 97, 158, 215, 357, 385, 397, 444, 657, N26, W16 | 6 | 35 | 14 / 3 | 1 |
| Normanshire 700 m | 18 | 14 | 14 | 97, 158, 215, 357, 385, 397, 444, 657, N26, W16 | 23 | 83 | 14 / 3 | 1 |
| Pipers Lane 700 m | 11 | 4 | 3 | 230, 231 | 0 | 0 | 3 / 3 | 0 |
| Waltham Cross 700 m | 16 | 126 | 42 | 13, 13A, 13B, 13C, 14, 15, 15A, 16, 16C, 25C, 66, 211, 212, 217, 242, 251, 279, 310, 317, 327, 491, A1, N279 | 22 | 22 | 42 / 45 | 1 |

The current Run #24 Pipers publication establishes routes `230` and `231` at this control. It does not establish the previously expected `46` and `C`; those assumptions were not hard-coded or substituted. Waltham Cross uses the current 23-route State C population above, not the stale local 21-route result.

## Checkpoint compatibility

No checkpoint-compatibility-impacting file changed. Candidate-generation compatibility fingerprints are identical:

- Base: `atlas-candidate-generation-compatibility-v2`, SHA-256 `093d047c87482aba3d5b90844608046ece18bd673f9228dab504030883af2232`.
- Branch: `atlas-candidate-generation-compatibility-v2`, SHA-256 `093d047c87482aba3d5b90844608046ece18bd673f9228dab504030883af2232`.

The accepted Recovery-0F checkpoint producer remains reusable in principle. No checkpoint schema, save/restore path, candidate identity, service-calendar semantics, release build or production workflow was altered.

## Word controls and limitations

Corrected branch DOCX controls are under `work/bus-closeout-1a/production-controls/`:

- `ATLAS BUS-CLOSEOUT-1A — branch-400 — normanshire-drive-400m.docx`
- `ATLAS BUS-CLOSEOUT-1A — branch — normanshire-drive-700m.docx`
- `ATLAS BUS-CLOSEOUT-1A — branch-pipers — pipers-lane-700m.docx`
- `ATLAS BUS-CLOSEOUT-1A — branch-waltham — waltham-cross-700m.docx`
- Corresponding JSON registers record production base SHA, executed code SHA, publication version, manifest identities, active TNDS bank, TfL request counts/identities, unresolved identities, source status, Word row counts, qualification counts and DOCX hashes.

Page counts were not deterministically available in the local DOCX harness and are therefore recorded as unavailable; exact DOCX paths are supplied for manual review.

## Validation and recommendation

The targeted calendar, mixed-profile, unresolved-calendar, Browser/Word parity, concise qualification, raw diagnostic suppression, route-444 and compatibility checks pass. The full Alpha.15 deterministic suite must be rerun after the BUS-CLOSEOUT-1A changes before final Technical Director acceptance.

No production refresh, publication, Pages deployment, merge or Run #24 dispatch was performed by this branch.

Recommendation: **READY FOR TECHNICAL DIRECTOR MANUAL REVIEW / NOT READY FOR PRODUCTION**.
