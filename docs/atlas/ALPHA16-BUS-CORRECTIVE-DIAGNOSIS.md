# ATLAS Alpha.16 Bus Corrective Diagnosis

Date: 2026-09-14
Branch: `codex/atlas-bus-alpha16-consultancy-acceptance`
Baseline commit: `4e9485efa786fe6a663f6414d098f1fb2fc52a41`
Baseline tree: `b4bfd05868c8de033a012168d98492b01be2b2d0`
Baseline identity: merged pull request #44; pull request #39 was not merged or used.

## 1. Phase 1 replay and evidence boundary

The exact Alpha.15 baseline was checked out before production changes. The network-free replay used the committed Waltham Cross fixture and these diagnostic commands:

```text
node tools/atlas-review/alpha15-runtime-comparison.mjs
node tools/atlas-review/alpha15-waltham-cross-report.mjs
node tests/atlas/alpha15-production-fidelity.test.mjs
node tests/atlas/alpha15-planner-service-group.test.mjs
node tests/atlas/alpha13-calendar-safety.test.mjs
node tests/atlas/bus-qa-02-frequency.test.mjs
node tests/atlas/bus-word-export.test.mjs
```

The replay fixture is `tests/atlas/fixtures/alpha15-waltham-cross-production.json`, from workflow run `34783354786` and artifact `10327455051`. It contains 16 selected stops, 53 route-scoped prepared records and 48 service summaries after source-record consolidation. The runtime boundary records 3,776 BODS rows / 97 route-scoped BODS rows, 7,075 TNDS rows / 373 route-scoped TNDS rows, 156 composed records, and 22 successful TfL requests out of 22. The assessment coordinates are withheld from the public fixture.

This is a replay of committed evidence, not a claim that the six-week-old source artifact is live current data. Current live timetable verification remains a separate acceptance activity.

## 2. Root causes found

### Calendar qualification and parsing

BODS prepared records already carried active weekday schedules, but the Alpha.15 static-index boundary dropped the GTFS calendar classification and date-exception provenance. Downstream code therefore had no safe way to distinguish a resolved ordinary week from genuinely unresolved applicability. The corrective builder now emits `calendarEvidence`, calendar profile identifiers, GTFS provenance, date exceptions and per-day departure evidence. A compatibility derivation covers historical prepared BODS snapshots whose active-day schedule is present but whose calendar object is absent. Missing applicability is still retained as unresolved and is rendered as review-required; it is never promoted to ordinary service.

### Service abstraction and public endpoint presentation

The Alpha.15 grouping model was structurally useful, but its public direction still trusted raw physical endpoints such as `Bus Station`, `Temp Bus Station`, `Quaker Lane`, and `Highbridge Rdbt`. It also treated close operator aliases as separate identities. Alpha.16 resolves directions from selected-stop localities, current route descriptions, and the full source endpoint evidence, strips generic station descriptors only when the locality is evidenced, and clusters compatible aliases while retaining their raw names. The resolver is generic and contains no route-number-specific mapping.

### Representative stop and timetable calculation

The earlier nearest-evidenced-stop rule could select a stop with only a small variant or calendar subset. Alpha.16 retains routed walking distance as the primary ranking signal among robust candidates, where robust means at least half of the maximum evidenced departure activity in the component. Frequency and period calculations use only departures at the selected basis stop. Semantic departure keys use route, public endpoints, stop, day, minute and calendar profile; explicit physical journey identities remain authoritative, while BODS/TNDS copies without a shared physical identity no longer inflate the headline count when their semantic departure agrees.

### Presentation and acceptance coverage

Internal evidence language was able to surface in service notes, and the old acceptance assertion expected a generic 25C `Bus Station` headline. Alpha.16 keeps detailed source records, alternate termini and all served assessment stops in the row object, but report-facing fields use concise public corridor destinations. The new semantic golden test asserts the meaning consumed by both Browser and Word rather than accepting raw feed labels or row counts alone.

## 3. Route-by-route acceptance result

The final replay uses the Alpha.16 implementation on the same fixture.

| Route | Prepared records | Service summaries | Planner result | Public result |
|---|---:|---:|---:|---|
| 13 | 0 | 0 | 0 rows | No fabricated service; no prepared evidence exists in the fixture. |
| 25C | 4 | 4 | 2 rows | Central Connect; Towards Harlow and Towards Waltham Cross; one weekday journey at each basis stop after BODS/TNDS deduplication. |
| 66 | 12 | 12 | 2 rows | Arriva alias family; Towards Cheshunt (Hammond Street) and Towards Loughton; selected basis `210021703430`. |
| 242 | 21 | 18 | 4 rows | Two directions for each current operator, Central Connect and Uno; public destinations Potters Bar and Waltham Cross. Historical Welham Green evidence remains in raw records, not the headline. |
| 310 | 6 | 6 | 2 rows | Arriva Herts and Essex; Towards Hertford and Towards Waltham Cross; high-frequency basis `210021703435`. |
| A1 | 6 | 6 | 2 rows | Central Connect; Towards Waltham Abbey and Towards Waltham Cross. Quaker Lane / Highbridge evidence remains retained below the headline. |
| N279 | 0 | 0 | 0 rows | No fabricated service; no prepared evidence exists in the fixture. |

The replay also retains the 317 two-direction control used by the Alpha.15 production gate. The 242 total is intentionally four rows: its two current operator families are materially different services and must not be merged merely because their route and public endpoints match.

Detailed replay output is available from `node tools/atlas-review/alpha15-waltham-cross-report.mjs`. The final acceptance gate is `node tests/atlas/alpha16-bus-semantic-golden.test.mjs`.

## 4. Implementation record

- `tools/atlas-bus-data/build_static_index.py` now preserves GTFS calendar qualifications, date exceptions, provenance and per-day departure evidence.
- `src/atlas/domain/bus-service-assessment.mjs` carries calendar evidence and source-record provenance into normalized summaries, with a bounded compatibility path for historical BODS snapshots.
- `src/atlas/domain/bus-planner-summary.mjs` adds generic public endpoint resolution, operator-family compatibility, coverage-aware representative-stop selection, semantic departure deduplication, concise principal locations and explicit review state.
- `tests/atlas/alpha16-bus-semantic-golden.test.mjs` protects the route semantics, no-fabrication boundary, calendar safety, retained evidence and Browser/Word equivalence.
- Alpha.15 and Alpha.13 regression tests were updated where their old assertions encoded the corrected failure mode, while their source-provenance and calendar-safety protections remain active.

## 5. Test and parity plan

The required acceptance set covers the static data contract, normalized summaries, planner grouping, full-week frequency, unresolved calendar behaviour, browser-facing output, DOCX export and browser smoke gates. The Alpha.16 golden test compares every planner row's seven Table 3.3 semantic fields with the Word table row generated from that same row object. No separate Browser mapping was introduced.

## 6. Tooling review

The repository already retains Dependabot configuration and it remains the appropriate low-risk dependency hygiene mechanism. Codecov could be a useful bounded pilot for the new semantic golden coverage if consultancy acceptance wants hosted coverage visibility, but it is not required for correctness. OpenSSF Scorecard, Renovate and Sentry would add process or observability value only after ownership, secrets, retention and workflow scope are agreed. No recommended integration was installed or invoked for this correction.

## 7. Acceptance status

The deterministic suite, Alpha.16 semantic golden test, DOCX parity checks, review-environment browser test, and all three browser gate scripts pass. Alpha.16 is ready for consultancy acceptance pending the final commit/clean-tree record and any separately authorized branch push. It does not merge or alter `main`.
