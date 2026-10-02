import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildControlledBusWording } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { hasPublicServiceCopyEvidence } from '../../src/atlas/domain/bus-grouping.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/bus-group-1d-waltham-runtime.json', import.meta.url), 'utf8'));
const rows = buildPlannerBusServiceSummaries(fixture.serviceSummaries, fixture.stops);
const word = buildBusWordTables({ ok: true, stops: fixture.stops, plannerServiceSummaries: rows, serviceSummaries: [] });
const wordNotes = word[1].rows.filter(row => !Array.isArray(row)).map(row => row.text).join(' ');
const rowFor = route => rows.find(row => (row.publicRouteNumbers ?? row.routeNumbers ?? [row.routeNumber]).includes(route));

assert.deepEqual(fixture.metadata.counts, {
  physicalStops: 16,
  routeNumbers: 21,
  routeStopPairs: 86,
  rawServices: 97,
  serviceSummaries: 67,
  routeCounts: fixture.metadata.counts.routeCounts
});
assert.equal(fixture.metadata.runId, '36125621080');
assert.equal(fixture.metadata.snapshotSha256, '8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9');
assert.equal(fixture.metadata.frozenCacheOnly, true);
assert.equal(fixture.metadata.tflConsulted, false);
assert.equal(fixture.metadata.tndsConsulted, false);

const family = rows.find(row => row.routeNumber === '13');
assert.ok(family, '13 family is one presentation row');
assert.equal(family.routeFamilyLabel, '13 / 13A / 13B / 13C');
for (const destination of ["Route 13A also serves St Margaret's Hospital and Waltham Abbey (Princesfield Rd)", 'route 13B also serves Railway Station and Waltham Abbey (Princesfield Rd)', 'route 13C operates to Two Brewers']) {
  assert.match(family.plannerNotes.additionalServices, new RegExp(destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.equal(family.typicalFrequencyLines.some(line => /^(?:13A|13B|13C):/.test(line)), false);
assert.equal(family.familyFrequencyAttribution, 'member-attributed; no combined family frequency asserted');

for (const route of ['217', '279', '317', '327', '491', 'N279']) {
  assert.equal(rows.filter(row => (row.publicRouteNumbers ?? row.routeNumbers ?? [row.routeNumber]).includes(route)).length, 1, `${route} has one outward planner row`);
}
assert.notEqual(rowFor('279').routeNumber, rowFor('N279').routeNumber, '279 and N279 remain separate public routes');
assert.equal(rowFor('217').operator, 'Arriva London North');
assert.equal(rowFor('317').operator, 'Metroline Travel');
assert.match(rowFor('66').plannerNotes.shortWorkings, /Hammond Street \(Smiths Lane\)/);

for (const route of ['16', '16C']) {
  const row = rowFor(route);
  assert.equal(row.plannerNotes.serviceQualification, null, `${route} circular truth is not repeated as a qualification`);
  assert.equal(row.plannerNotes.circularService, 'Circular service.');
}
for (const route of ['15', '66', '242', 'A1']) {
  const row = rowFor(route);
  assert.equal(row.serviceNote, '', `${route} terminus is not duplicated in a generic service note`);
  assert.match(`${row.routeGroupNote ?? ''} ${row.plannerNotes?.terminus ?? ''} ${row.plannerNotes?.additionalServices ?? ''}`, /Terminus:|Additional variants|Additional services|Waltham Cross/);
}

assert.match(wordNotes, /Additional services: Route 13A also serves St Margaret's Hospital/);
assert.match(wordNotes, /route 13B also serves Railway Station/);
assert.match(wordNotes, /Circular service: Circular service\./);
assert.doesNotMatch(wordNotes, /Service qualification: Circular service/);
assert.doesNotMatch(wordNotes, /Review note: Additional variants and short workings/);
assert.doesNotMatch(wordNotes, /Service note: .*route terminus/);
const transportStatement = buildControlledBusWording(rows);
for (const route of ['13', '13A', '13B', '13C', '15', '15A', '217', '279', 'N279']) assert.match(transportStatement, new RegExp(`\\b${route.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}\\b`));
assert.doesNotMatch(transportStatement, /13 \/ 13A|15 \/ 15A/);

const exactEndpoint = id => ({ chosen: id, chosenDisplayName: id, exact: true, exactEvidence: true, decisionType: 'exact-endpoint-resolved', endpointStopPointId: id, endpointStopPointIds: [id] });
const oneSharedStop = (provider, id) => ({
  id,
  routeNumber: '217',
  provider,
  timetableSource: provider,
  operator: provider === 'TfL' ? 'Arriva London North' : 'Operator not supplied in the timetable',
  directionFamily: 'outbound',
  origin: 'Turnpike Lane Bus Station',
  destination: 'Waltham Cross Bus Station',
  originEndpointDecision: exactEndpoint('ORIGIN'),
  destinationEndpointDecision: exactEndpoint('DESTINATION'),
  stopIds: ['SHARED'],
  assessedStops: ['SHARED'],
  routePatternStopIds: [`${provider}-ORIGIN`, `${provider}-SHARED`, `${provider}-DESTINATION`],
  routePatternStops: [{ name: 'Turnpike Lane Bus Station' }, { name: 'Waltham Cross Bus Station' }],
  sourceRecordIds: [id],
  sourceRouteIds: [`${provider}-217`],
  calendarProfileId: 'ordinary',
  departureEvidenceByDay: { monday: [{ stopPointId: 'SHARED', minute: 480 }] }
});
assert.equal(hasPublicServiceCopyEvidence(oneSharedStop('TfL', 'tfl-217'), oneSharedStop('BODS', 'bods-217')), true, 'one shared StopPoint may reconcile only with independent endpoint/corridor/timetable evidence');
const weakOneShared = oneSharedStop('BODS', 'weak-bods-217');
weakOneShared.originEndpointDecision = {};
weakOneShared.destinationEndpointDecision = {};
weakOneShared.routePatternStops = [{ name: 'Different Origin' }, { name: 'Different Destination' }];
weakOneShared.departureEvidenceByDay = { monday: [{ stopPointId: 'OTHER', minute: 481 }] };
assert.equal(hasPublicServiceCopyEvidence(oneSharedStop('TfL', 'weak-tfl-217'), weakOneShared), false, 'one shared StopPoint without independent structured corroboration remains separate');

console.log('PASS BUS-GROUP-1D real frozen-runtime fixture, family child destinations, route reconciliation controls, taxonomy de-duplication, and Word parity.');
