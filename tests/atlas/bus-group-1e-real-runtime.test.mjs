import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlannerBusServiceSummaries, plannerSourceWarning } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { hasPublicServiceCopyEvidence } from '../../src/atlas/domain/bus-grouping.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/bus-group-1e-waltham-mixed-runtime.json', import.meta.url), 'utf8'));
const rows = buildPlannerBusServiceSummaries(fixture.serviceSummaries, fixture.stops);
const rowFor = route => rows.find(row => (row.publicRouteNumbers ?? row.routeNumbers ?? [row.routeNumber]).includes(route));

assert.equal(fixture.metadata.frozenNationalCacheOnly, true);
assert.equal(fixture.metadata.tflConsulted, true);
assert.equal(fixture.metadata.tndsConsulted, false);
assert.equal(fixture.metadata.provenance.nationalTimetableConclusion, 'MATCHED');
assert.equal(fixture.metadata.provenance.timetableConclusion, 'MATCHED');
assert.equal(fixture.metadata.provenance.unresolvedRequests, 0);
assert.equal(fixture.metadata.provenance.unprocessedRequests, 0);

for (const route of ['217', '279', '317', '327', '491', 'N279']) {
  const sourceRecords = fixture.serviceSummaries.filter(service => service.routeNumber === route);
  assert.deepEqual(new Set(sourceRecords.map(service => service.provider)), new Set(['BODS', 'TfL']), `${route} retains both national and TfL runtime evidence`);
  assert.equal(rowFor(route) !== undefined, true, `${route} has a planner row`);
  assert.equal(rows.filter(row => (row.publicRouteNumbers ?? row.routeNumbers ?? [row.routeNumber]).includes(route)).length, 1, `${route} reconciles to one planner row`);
  assert.doesNotMatch(rowFor(route).operator, /not supplied/i, `${route} retains a named operator`);
  assert.equal(rowFor(route).terminusDecision.presentation, 'departing-only', `${route} presents the useful departing direction`);
  assert.ok(rowFor(route).terminusDecision.arrivalEvidence.length > 0, `${route} retains arrival-side source evidence`);
  assert.equal(plannerSourceWarning(rowFor(route)).length, 0, `${route} has no planner warning placeholder`);
}

assert.equal(rowFor('279').routeNumber, '279');
assert.equal(rowFor('N279').routeNumber, 'N279');
assert.notEqual(rowFor('279').routeNumber, rowFor('N279').routeNumber, '279 and N279 remain separate public routes');
assert.match(`${rowFor('279').destination} ${rowFor('279').plannerNotes.additionalServices ?? ''}`, /Rookwood Road|Stamford Hill/);
assert.match(`${rowFor('N279').destination} ${rowFor('N279').plannerNotes.additionalServices ?? ''}`, /Charing Cross|Trafalgar Square/);

const family = rowFor('13');
assert.ok(family, 'the mixed runtime retains the proven 13 family');
assert.equal(family.routeFamilyLabel, '13 / 13A / 13B / 13C');
assert.deepEqual(family.principalLocations, family.routeFamilyMembers.find(member => member.routeNumber === '13').principalLocations, 'the family headline keeps principal 13 locations only');
assert.match(family.plannerNotes.additionalServices, /13A – .*; 13B – .*; 13C –/);
assert.equal(family.typicalFrequencyLines.some(line => /^(?:13A|13B|13C):/.test(line)), false);

const mixedDecision = rowFor('217').publicServiceGroupingDecision;
assert.ok(mixedDecision.providers.includes('TfL') && mixedDecision.providers.includes('BODS'), 'the planner group retains both captured source authorities');
assert.ok(mixedDecision.publicServiceEquivalenceEvidence.some(evidence => evidence.sharedEndpointStopEvidence || evidence.sourceEndpointEvidence), 'the captured TfL/national group records structured reconciliation evidence');

const word = buildBusWordTables({ ok: true, stops: fixture.stops, plannerServiceSummaries: rows, serviceSummaries: [] });
const wordText = word.flatMap(table => table.rows ?? []).map(row => Array.isArray(row) ? row.join(' ') : String(row?.text ?? '')).join(' ');
assert.match(wordText, /Presentation note: Where an assessed stop is the route terminus, ATLAS shows the useful departing direction only/);
assert.match(wordText, /Additional services: 13A –/);
assert.doesNotMatch(wordText, /Operator not supplied/);

console.log('PASS BUS-GROUP-1E captured mixed TfL+BODS runtime, public-family principal presentation, terminus suppression, and Browser/Word handover controls.');
