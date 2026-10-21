import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const audit = await readFile(new URL('./s2c3-real-candidate-runtime-audit.mjs', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../../.github/workflows/atlas-bus-beta-s2d1-closeout.yml', import.meta.url), 'utf8');
const dispatcher = await readFile(new URL('../../.github/workflows/atlas-bus-data-refresh.yml', import.meta.url), 'utf8');

assert.doesNotMatch(audit, /assert\.(?:ok|equal|deepEqual|throws)/, 'the real-candidate audit must not throw on an early assertion');
assert.match(audit, /for \(const control of controls\)/, 'every site control must be iterated');
assert.match(audit, /outcome: 'BLOCKED'/, 'control execution failures must be retained as blocked evidence');
assert.match(audit, /firstDisappearanceStage/, 'Waltham lineage must identify the first disappearance stage');
assert.match(audit, /none; route identity is present in plannerRows/, 'surviving Waltham identities must be reported as not disappearing');
assert.match(audit, /preparedBodsRecords/, 'the report must retain prepared primary route evidence');
assert.match(audit, /preparedTndsRecords/, 'the report must retain prepared supplementary route evidence');
assert.match(audit, /buildBusWordTables\(assessment\)/, 'real candidate planner output must be checked against Word export tables');
assert.match(audit, /word-export-route-parity-/, 'Waltham, Pipers, and Chingford export parity must be recorded as audit checks');
assert.match(audit, /circularServiceDecision/, 'the Pipers planner circular classification must be retained');
assert.match(audit, /await writeFile\(path\.resolve\(reportArg\)/, 'the full report must be saved before the final non-zero exit');
assert.ok(audit.indexOf('await writeFile(path.resolve(reportArg)') < audit.indexOf('if (failures.length) process.exitCode = 1'), 'audit reports must be written before blockers fail the workflow');

assert.match(workflow, /inputs\.mode == 'offline_preflight'/, 'workflow must expose a zero-download preflight mode');
assert.match(workflow, /inputs\.mode == 'retained_candidate_audit'/, 'workflow must expose retained-candidate audit mode');
assert.match(workflow, /12275615359/, 'hosted audit must restore the exact immutable Run #75 artifact');
assert.match(workflow, /5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471/, 'hosted audit must pin the candidate artifact digest');
assert.match(workflow, /39430415441/, 'hosted audit must pin the exact candidate producer run');
assert.match(workflow, /atlas-bus-beta-s2d1-candidate-audit-\$\{\{ github\.run_id \}\}/, 'failed control reports must upload from the audit run');
assert.doesNotMatch(workflow, /TNDS_USERNAME|TNDS_PASSWORD|refresh_bus_data\.py|tnds_trust_diagnostic\.py/, 'S2D-1 hosted audit must not acquire or prepare national data');
assert.match(workflow, /permissions:\n  actions: read\n  contents: read/, 'workflow permissions must remain read-only');
assert.match(dispatcher, /s2d-1-selector/, 'the established default-branch dispatcher must select S2D-1 explicitly');
assert.match(dispatcher, /s2d1-zero-download-preflight:[\s\S]*?mode: offline_preflight/, 'the exact-SHA preflight must call the hosted offline workflow');
assert.match(dispatcher, /s2d1-retained-candidate-audit:[\s\S]*?mode: retained_candidate_audit/, 'retained candidate audit must be dispatched through the hosted reusable workflow');
assert.match(dispatcher, /audit_retained_candidate/, 'audit mode must be selectable from workflow_dispatch');

console.log('PASS S2D-1 retained-candidate audit contract');
