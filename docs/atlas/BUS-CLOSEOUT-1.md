# ATLAS BUS — BUS-CLOSEOUT-1B

## Final forensic hardening handover

Previous reviewed PR head: `54f73df62d48fce4df6ec7aee07ddf14d29a90fc`  
Production `main`: `c670698dbf709a953d15b3927ee677fb502d1b3a`  
PR: [#48](https://github.com/joerfreeman02/transport-planner-toolkit/pull/48)  
Scope: forensic provenance, deterministic comparison, structured review qualification, stop-set evidence and documentation only. No merge, deployment, publication or Bus refresh was performed.

## Production source boundary

All production-fidelity controls used the deployed Run #24 publication
`35352167115-c670698dbf709a953d15b3927ee677fb502d1b3a`, generated
`2026-09-18T13:46:55Z`, with Bus BODS hash
`8a2764d2309d4908b71280bdd0708cddb68b242d1a5c2b8fdfcac4bd85a17b2c` and
active TNDS Bank A roots A1/A2/A3. The stale checkout-local Bus/TNDS fixture
tree is not used for acceptance evidence.

The production control now fails closed unless the supplied code root is a Git
worktree, `git status --porcelain` is empty, `HEAD` resolves to a full SHA, and
an optional `--expected-code-sha` matches exactly. Every register records
`executedCodeSha`, `worktreeClean: true`, `productionBaseSha`, publication
version and capture timestamp.

## 1B implementation

Changed:

- `src/atlas/application/bus-assessment.mjs` — attaches deterministic review-item categories to existing structured codes.
- `src/atlas/domain/review-item-taxonomy.mjs` — explicit taxonomy for timetable, national evidence, service-source, planner identity, stop coverage, access-routing, general timetable-source and other material categories.
- `src/atlas/presentation/bus-word-export.mjs` — one concise qualification block, preserving every material category and never classifying from free-text diagnostics.
- `tools/atlas-review/bus-closeout-production-controls.mjs` — clean-worktree provenance, exact SHA enforcement and exact stop/source/planner registers.
- `tools/atlas-review/bus-closeout-compare.mjs` — automated fail-closed base-vs-branch comparator.
- `tools/atlas-review/bus-closeout-pipers-forensics.mjs` — bounded Run #24 Pipers route-46/C evidence capture.
- `tests/atlas/bus-word-export.test.mjs` — nine adversarial qualification cases.
- `tests/atlas/bus-closeout-provenance.test.mjs` — clean-worktree and exact-SHA fail-closed tests.
- `tools/atlas-review/bus-closeout-controls.mjs` — removed; the stale checkout-local harness is no longer retained.

No `service-calendar.mjs`, candidate-generation, checkpoint, workflow, version,
secret, Actions-variable, Pages or external reference-data file was changed.

## Structured Word qualification

Review classification uses the deterministic `reviewItems[].code` taxonomy, not
`source` or `message` text. The client-facing export emits at most one concise
qualification block. Timetable-related route codes are deduplicated and sorted;
other material categories remain visible in additional sentences. Raw StopPoint
IDs, request identities and diagnostic messages are never exported, while the
underlying `result.reviewItems` remains unchanged.

The adversarial suite covers: unresolved timetable only; national-route evidence;
planner route identity only; access-routing only; stop-source coverage only;
timetable plus access-routing; timetable plus stop-source coverage; duplicate
routes; and no review items. All cases pass and prove that no material category
disappears.

## Clean base-vs-branch controls

The base register was generated from a clean worktree pinned to production
`main` and recorded executed SHA
`c670698dbf709a953d15b3927ee677fb502d1b3a`. The branch register was generated
from a clean worktree pinned to the committed 1B code head
`81435e9c2f0b397250cd0326473ce418b8264c3f`. Both recorded `worktreeClean: true`
and the exact same Run #24 publication version.

`bus-closeout-compare.mjs` passed all four controls. It compares StopPoint IDs,
coordinates, discovery distances, source authorities, route population, source
service identities, TfL request identities, national publication identity,
service-summary count, planner-row count, operators, destinations, directions,
grouping, circular meaning, calculated frequencies, operating periods,
representative timetable stops, route-444 directions, review codes, status and
Word service-row count. The only approved differences are concise calendar
wording and the concise Word review qualification.

| Control | Stops | Service summaries | Planner rows | Route population | Review items / categories | TfL requests | Word service rows | Qualification |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Normanshire 400 m | 7 | 14 | 14 | 97, 158, 215, 357, 385, 397, 444, 657, N26, W16 | 6 / timetable | 35 | 14 | 1 |
| Normanshire 700 m | 18 | 14 | 14 | 97, 158, 215, 357, 385, 397, 444, 657, N26, W16 | 23 / timetable | 83 | 14 | 1 |
| Pipers Lane 700 m | 11 | 4 | 3 | 230, 231 | 0 / — | 0 | 3 | 0 |
| Waltham Cross 700 m | 16 | 126 | 42 | 13, 13A, 13B, 13C, 14, 15, 15A, 16, 16C, 25C, 66, 211, 212, 217, 242, 251, 279, 310, 317, 327, 491, A1, N279 | 22 / timetable | 22 | 42 | 1 |

The JSON registers record the exact StopPoint ID, name, coordinates, straight-line
distance, walking/cycling routing, source authorities and routes for every stop.

## Normanshire reconciliation

The accepted 700 m Run #24 set is 18 stops and is identical between clean base
and branch. The current set contains no East View stop and no route 212; the
older wider manual output was a different/stale source-set observation, not a
branch presentation result. No service inclusion was altered to reproduce it.

The 23 unresolved live TfL request identities are exclusively routes 215, 385
and 397. Route 397A remains a separately tracked mixed-source / London Service
Permit case unless a later BUS-CLOSEOUT investigation proves it belongs to this
defect. Route 444 remains exactly:

- `Towards Chingford Station`
- `Towards Turnpike Lane Bus Station`

## Waltham Cross reconciliation

The accepted 700 m Run #24 set is 16 stops and is identical between clean base
and branch. The exact IDs and source-derived fields are in the registers. The
current 23-route population includes 211 and 212; the historical count
difference is attributable to the source/assessment observation being compared,
not a grouping or service-inclusion change in 1B. No grouping semantics were
modified.

## Pipers route-46/C forensic result

The accepted point is `51.852700, -0.454343` with a 700 m radius. Run #24
NaPTAN/BODS stop metadata, live TfL StopPoint discovery and Run #24 BODS/TNDS
scheduled evidence were inspected without hard-coding routes.

- 11 actual stop records fall inside 700 m; none carries route 46 or C in Run #24 stop metadata.
- Woodside Animal Farm StopPoints `021024644` and `021024645` are 725 m and 741 m away, respectively, and are excluded by radius.
- Caddington Hall StopPoints `210021428210` and `210021428130` are 922 m and 958 m away, respectively, and are excluded by radius.
- The inspected Run #24 candidate set returned no “Caddington Service C” StopPoint record and no inside-radius route-C record.
- No BODS or TNDS scheduled evidence matched an inside-radius route-46/C StopPoint; no route was inserted into the assessment.

The evidenced conclusion is genuine radius/source-set filtering, not a permitted
application omission: the named Route 46 records are outside 700 m, and the
accepted Run #24 inside-radius metadata does not carry 46/C. The complete
machine-readable record is the Pipers forensic JSON output.

## Checkpoint compatibility

The candidate-generation compatibility fingerprint was recalculated for base and
branch and remains identical:

`atlas-candidate-generation-compatibility-v2 / 093d047c87482aba3d5b90844608046ece18bd673f9228dab504030883af2232`

No checkpoint-generation compatibility file changed. This remains a hard stop
if any future branch fingerprint differs.

## Controls and local validation

The clean control commands were:

```text
node tools/atlas-review/bus-closeout-production-controls.mjs --code-root <clean-main-worktree> --label 1b-base --expected-code-sha c670698dbf709a953d15b3927ee677fb502d1b3a
node tools/atlas-review/bus-closeout-production-controls.mjs --code-root <clean-branch-worktree> --label 1b-final-branch --expected-code-sha 81435e9c2f0b397250cd0326473ce418b8264c3f
node tools/atlas-review/bus-closeout-compare.mjs --base <base-register> --branch <branch-register>
node tools/atlas-review/bus-closeout-pipers-forensics.mjs
node tests/atlas/run-all.mjs
```

The full Alpha.15 deterministic suite passed. Targeted provenance, Word
qualification, calendar single-profile frequency/operating-period, planner
summary, TfL timetable, and compatibility tests passed. GitHub-hosted PR checks
are not configured for this PR; no hosted CI pass is claimed.

## Corrected control artifacts

The 1B branch control artifacts are under
`work/bus-closeout-1a/production-controls/`:

- `ATLAS BUS-CLOSEOUT-1A — 1b-final-branch — normanshire-drive-400m.docx`
- `ATLAS BUS-CLOSEOUT-1A — 1b-final-branch — normanshire-drive-700m.docx`
- `ATLAS BUS-CLOSEOUT-1A — 1b-final-branch — pipers-lane-700m.docx`
- `ATLAS BUS-CLOSEOUT-1A — 1b-final-branch — waltham-cross-700m.docx`
- `BUS-CLOSEOUT-1A-production-control-register-1b-final-base.json`
- `BUS-CLOSEOUT-1A-production-control-register-1b-final-branch.json`

The Pipers forensic record is under
`work/bus-closeout-1b/forensics/BUS-CLOSEOUT-1B-pipers-route-46-C-forensics.json`.
Page counts were not deterministically available in the local DOCX harness and
are recorded as unavailable. These documents are for Joe/Technical Director
manual review; they are not final planner-output acceptance.

## Tooling status

Status only, with no configuration changes: Dependabot is configured for weekly
npm and Actions updates; Codecov, OpenSSF Scorecard, Sentry and Renovate are not
present; GitHub reports no protection rules for `main`.

## Recommendation

**READY FOR TECHNICAL DIRECTOR MANUAL REVIEW — NOT READY FOR PRODUCTION.**

No merge, Bus refresh, publication, Pages deployment, secret/configuration
change, external reference-data change or unrelated branch modification was
performed.
