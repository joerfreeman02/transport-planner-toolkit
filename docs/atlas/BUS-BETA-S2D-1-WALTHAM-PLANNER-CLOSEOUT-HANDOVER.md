# BUS-BETA-S2D-1 Waltham Planner Closeout Handover

## Summary

The retained Run #75 candidate completes the S2D-1 Waltham route audit. The earlier S2C-3 report of missing 13A and 13B was an audit false negative: both route identities are present in planner rows as members of the 13/13A/13B/13C route family. No production planner change was justified.

The complete hosted audit reported zero failures and readiness `READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_ACCEPTANCE`. The review is ready for Technical Director review; this is not a Beta or manual-acceptance declaration.

## Branch and provenance

- Starting branch: `codex/atlas-bus-beta-s2c-3-oversized-service-closeout`
- Starting SHA: `73983cd108d19eeb0025d325e5fb5d5344ad2f29`
- S2D-1 branch: `codex/atlas-bus-beta-s2d-1-waltham-planner-closeout`
- Final implementation SHA used by the successful complete candidate audit: `1a3db37c8aa84094e680563d25c53c8ed0ac727f`
- Candidate run: #75 / `39430415441`
- Immutable candidate artifact: `12275615359`, `atlas-bus-beta-review-candidate-39430415441`
- Candidate digest: `sha256:5cad24e0a47c4a77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`
- Candidate size: 2,549,732,499 bytes
- Candidate producer code SHA: `151199cc914c235870f444d26b03c2309edbd035`
- The candidate was restored only on GitHub-hosted runners. It was not changed, rebuilt, or downloaded locally. National preparation was not rerun.

## Waltham 13/13A/13B/13C lineage

The assessment-stop route identities and candidate evidence were traced through adapter matches, service summaries, and planner rows. Relevant eligible StopPoint IDs were `210021703430`, `210021700040`, and `210021703460`; 13B evidence matched at `210021703430` and `210021703460`.

| Route | Prepared BODS records | Prepared TNDS records | Adapter-matched rows | Service summaries | Planner rows | First disappearance |
|---|---:|---:|---:|---:|---:|---|
| 13 | 6 | 19 | 25 | 10 | 3 | None; identity present in planner rows |
| 13A | 4 | 8 | 12 | 8 | 3 | None; identity present in planner rows |
| 13B | 2 | 4 | 6 | 4 | 2 | None; identity present in planner rows |
| 13C | 2 | 13 | 15 | 5 | 3 | None; identity present in planner rows |

All planner rows retain route-family members `13`, `13A`, `13B`, and `13C`; the detailed audit artifact records each route's stop inventories, source record IDs, operators, endpoint evidence, schedules, service summaries, planner rows, grouping decisions, and terminus decisions.

**Root cause of the reported 13A gap:** there was no candidate or planner disappearance. The prior audit's route-set extraction omitted nested `routeFamilyMembers` / `memberRouteNumbers`, so it failed to count a route that was present in planner output.

**Root cause of the reported 13B gap:** the same audit false negative. 13B has prepared and matched BODS/TNDS evidence and is retained in two planner rows through the route-family member identity.

**First disappearance stage for both:** none. Both are present at the final `plannerRows` stage. The earlier `plannerRows` label was corrected to say explicitly that no disappearance occurred.

**Correction:** the real-candidate audit now builds planner route availability from top-level route numbers and nested public/member/family identities. This is a general diagnostic correction; no Waltham, 13A, or 13B production logic was added. The existing route-family architecture continues to retain the four distinct child identities.

## Candidate controls

- **Waltham Cross:** all 21 required routes passed, including 13/13A/13B/13C. No required route was missing from planner output.
- **Pipers Lane:** BODS-primary 230, TNDS 230, TNDS-only 231, and planner routes 230/231 passed. Supplementary source condition was `CHECKED`; source completeness was `COMPLETE`; no failed shard diagnostics were reported. The BODS 230 ordered loop evidence contains 34 StopPoints and closes at Lyons Community Centre. CIRC retained the closed variant evidence but conservatively withheld a public circular classification because the route family also contained an open ordered pattern with opposite-direction markers. The decision reason is recorded in the audit artifact; this is fail-closed mixed-pattern handling, not missing candidate evidence.
- **Chingford / Normanshire Drive:** 357, 444, 657, and W16 passed. Route 657 school-day semantics were present.
- **PE1:** timetable-call-eligible stops and a visible local outcome passed; no false zero-service outcome was emitted.
- **Queensgate:** BCE entrance records remained non-call infrastructure, and the visible service/unresolved outcome check passed.
- **National runtime sweep:** EA, EM, NE, NW, SE, SW, WM, and Y passed manifest → descriptor → shard → decode → stop match → service composition. Candidate audit read 308,547 logical/runtime service records, 817 fragment records, 14,159 runtime shards, and a maximum shard size of 8,388,598 bytes. Fragment failure remained unresolved and valid BODS evidence was preserved.
- **Browser smoke:** the HTTP-served headless assessment harness loaded the production Bus assessment/adapter modules and real candidate files. All five controls ran; 85 requests completed with zero failed requests and zero page errors. Pipers browser result retained 230/231 and complete supplementary provenance. This exercised the assessment runtime; it did not automate address-provider/geocoder or map-tile interaction in the full visual shell.
- **Word export parity:** PASS for Waltham, Pipers, and Chingford. The audit compared each actual candidate assessment's planner route identity set with the existing `buildBusWordTables` export model. No route identity was missing or extra.

The audit recorded all five site controls as PASS, all eight regional checks as PASS, all 31 audit checks as PASS, zero failed checks, and `READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_ACCEPTANCE`.

## Tests and hosted evidence

Exact-final-implementation-SHA zero-download preflight:

- Run #84 / `39568200679`
- SHA: `1a3db37c8aa84094e680563d25c53c8ed0ac727f`
- Result: success
- Python Bus-data suite: pass
- `node tests/atlas/run-all.mjs`: pass
- `git diff --check`: pass
- Evidence artifact: `12331166049`, `atlas-bus-s2d1-zero-download-preflight-39568200679`, unexpired

Complete retained-candidate audit:

- Run #85 / `39568610940`
- SHA: `1a3db37c8aa84094e680563d25c53c8ed0ac727f`
- Result: success
- Candidate artifact: Run #75 artifact `12275615359` above
- Audit artifact: `12332795801`, `atlas-bus-beta-s2d1-candidate-audit-39568610940`
- Audit artifact digest: `sha256:1a64cc4714f431637dae399848ab6563f70d4c7e57438b0759641366445c0077`
- Audit artifact expiration: 2027-01-19
- Failed preliminary dispatches #79 and #83 stopped at the selector guard before candidate restore. The selector was corrected and the exact-SHA preflight rerun before successful Run #85.

Focused local checks passed: `node tests/atlas/review-candidate-workflow-contract.test.mjs`, `node tests/atlas/s2d1-candidate-audit-contract.test.mjs`, `node tests/atlas/automated-refresh-contract.test.mjs`, `node --check tests/atlas/s2c3-real-candidate-runtime-audit.mjs`, and `git diff --check`. Full suites ran on hosted runners, not on the Product Owner's machine.

## Scope and machine state

- Fresh national source acquisition: **NO**
- National measurement/preparation rerun: **NO**
- Candidate rebuild or mutation: **NO**
- Publication: **NO**
- Deployment: **NO**
- Version/build: `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`
- No PR, merge, or release was created.
- Existing `.tmp/` work was preserved. No local cleanup was performed.
- GitHub-hosted audit report was downloaded for inspection to `C:\Users\joe.freeman\AppData\Local\Temp\atlas-s2d1-audit-39568610940\runtime-audit.json` (expanded size 217,112,124 bytes); it is retained. No candidate dataset was downloaded locally.
- Dependency adoption remains unchanged: Dependabot configured; Codecov deferred pending a coverage baseline; OpenSSF Scorecard later; Sentry deferred pending telemetry/privacy architecture; Renovate not duplicated.

## Remaining defects and readiness

No Waltham candidate-to-planner defect was found. The Pipers mixed closed/open route-family circular decision remains conservative and its full evidence/reason is available in the audit artifact. The browser result covers the assessment runtime and candidate data, not visual map/geocoder interaction.

**Status:** `READY FOR TECHNICAL DIRECTOR REVIEW BEFORE MANUAL ACCEPTANCE`

