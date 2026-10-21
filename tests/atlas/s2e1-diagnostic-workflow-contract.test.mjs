import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../../.github/workflows/atlas-bus-beta-s2e1-diagnosis.yml', import.meta.url), 'utf8');
const dispatchWorkflow = await readFile(new URL('../../.github/workflows/atlas-bus-data-refresh.yml', import.meta.url), 'utf8');
const diagnostic = await readFile(new URL('./s2e1-real-candidate-diagnostic.mjs', import.meta.url), 'utf8');

assert.match(workflow, /refs\/heads\/codex\/atlas-bus-beta-s2e-1-intelligence-restoration/);
assert.match(workflow, /workflow_call:[\s\S]*mode:[\s\S]*baseline_diagnosis/);
assert.match(dispatchWorkflow, /refs\/heads\/codex\/atlas-bus-beta-s2e-1-intelligence-restoration/);
assert.match(dispatchWorkflow, /s2e1-frozen-candidate-diagnosis:[\s\S]*mode: baseline_diagnosis/);
assert.match(dispatchWorkflow, /CANDIDATE_RUN" != '39430415441'[\s\S]*CANDIDATE_ID" != '12275615359'[\s\S]*CANDIDATE_DIGEST" != 'sha256:5cad24e0a47c4a77a8ec8616d746bf9f538404420fcb9505f297607632e1a471/);
assert.match(dispatchWorkflow, /S2E-1 accepts only the exact Run #75 frozen-candidate restore selector with all acquisition\/source selectors blank\/default/);
assert.match(workflow, /actions:\s*read[\s\S]*contents:\s*read/);
assert.match(workflow, /12275615359/);
assert.match(workflow, /39430415441/);
assert.match(workflow, /5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471/);
assert.match(workflow, /151199cc914c235870f444d26b03c2309edbd035/);
assert.match(workflow, /atlas-bus-beta-s2e1-baseline-diagnostic-/);
assert.doesNotMatch(workflow, /TNDS_USERNAME|TNDS_PASSWORD|refresh_bus_data\.py|tnds_trust_diagnostic\.py|deploy-pages|publish/);

for (const site of ['waltham', 'pipers', 'chingford', 'pe1', 'queensgate']) assert.match(diagnostic, new RegExp(`id: '${site}'`));
for (const field of ['rawServiceRecords', 'serviceSummaries', 'plannerRows', 'rowCounts', 'circularServiceDecision', 'wordRouteParity', 'uniqueDeparturesByDay', 'operatingPeriods', 'sourceAuthority']) assert.ok(diagnostic.includes(field), `diagnostic must retain ${field}`);
assert.match(diagnostic, /candidateProducerRun: '39430415441'/);
assert.match(diagnostic, /stopDiscovery: 'prepared-bus-data-adapter-only'/);
assert.match(diagnostic, /productionBrowserStopDiscovery: 'create-bus-stop-discovery-with-tfl-and-prepared-naptan'/);
assert.match(diagnostic, /productionBrowserTimetableData: 'authoritative-adapter-with-tfl-and-prepared-national-sources'/);
assert.match(diagnostic, /browserParity: 'not-established'/);
assert.match(diagnostic, /sourceAcquisition: false/);
assert.match(diagnostic, /nationalPreparation: false/);
assert.match(diagnostic, /publicationAttempted: false/);
assert.match(diagnostic, /deploymentAttempted: false/);

console.log('PASS S2E-1 frozen-candidate diagnostic workflow contract');
