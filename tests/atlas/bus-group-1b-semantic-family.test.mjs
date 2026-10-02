import assert from 'node:assert/strict';
import {
  buildPlannerBusServiceSummaries,
  buildPublicRouteFamilyDecisions
} from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { busGroup1bWalthamRegressionFixture as waltham } from './fixtures/bus-group-1b-waltham-regression.mjs';

const rows = buildPlannerBusServiceSummaries(waltham.serviceSummaries, waltham.stops);
const routeNumbers = new Set(rows.flatMap(row => row.publicRouteNumbers ?? row.routeNumbers ?? [row.routeNumber]));

assert.equal(waltham.stops.length, 16);
assert.equal(waltham.provenance.routeStopPointPairCount, 86);
assert.deepEqual([...routeNumbers].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [...waltham.routeInventory].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));

const family13 = rows.find(row => row.routeNumber === '13');
assert.ok(family13, 'the frozen Waltham replay presents the proven 13 family as one concise row');
assert.equal(family13.publicRouteFamilyDecision.type, 'PublicRouteFamilyDecision');
assert.equal(family13.publicRouteFamilyDecision.state, 'proven-family');
assert.equal(family13.routeFamilyLabel, '13 / 13A / 13B / 13C');
assert.deepEqual(family13.routeFamilyMembers.map(member => member.routeNumber), ['13', '13A', '13B', '13C']);
assert.ok(family13.familyFrequencyLines.every(line => /^(?:13|13A|13B|13C): /.test(line)), 'frequency remains attributed to each child route');
assert.ok(family13.routeFamilyMembers.every(member => member.calendarProfileIds.length));

for (const route of ['217', '279', '317', '327', '491', 'N279']) {
  const routeRows = rows.filter(row => (row.publicRouteNumbers ?? row.routeNumbers ?? [row.routeNumber]).includes(route));
  assert.ok(routeRows.length >= 1, `${route} remains represented in the planner projection`);
  assert.ok(routeRows.some(row => row.operator && !/not supplied/i.test(row.operator)), `${route} keeps a named operator on its authoritative row`);
}
assert.equal(rows.some(row => /not supplied/i.test(row.operator)), false, 'unresolved operator placeholders do not leak into planner rows');

const row66 = rows.find(row => row.routeNumber === '66');
assert.match(`${row66.routeVariantNote} ${row66.routeGroupNote}`, /Smiths Lane/);
assert.doesNotMatch(`${row66.routeVariantNote} ${row66.routeGroupNote}`, /Waltham Cross Bus Station/);
const row242 = rows.find(row => row.routeNumber === '242');
assert.match(`${row242.routeVariantNote} ${row242.routeGroupNote}`, /Welham Green Railway Station/);
assert.match(`${row242.destination} ${row242.routeVariantNote} ${row242.routeGroupNote}`, /Brookfield Centre/);
assert.equal(rows.filter(row => row.routeNumber === '310').length, 1);
assert.match(rows.find(row => row.routeNumber === '310').directionPatternText, /Hertford/);
assert.equal(rows.filter(row => row.routeNumber === '16' || row.routeNumber === '16C').length, 2);
assert.equal(rows.find(row => row.routeNumber === '16').circular, true);
assert.equal(rows.find(row => row.routeNumber === '16C').circular, true);

const word = buildBusWordTables({ ok: true, stops: waltham.stops, plannerServiceSummaries: rows, serviceSummaries: [] });
const wordText = word.flatMap(table => table.rows ?? []).map(row => Array.isArray(row) ? row.join(' ') : String(row?.text ?? '')).join(' ');
assert.match(wordText, /\b13\b/);
assert.doesNotMatch(wordText, /13 \/ 13A \/ 13B \/ 13C/);
assert.match(wordText, /13A – /);
assert.match(wordText, /Smiths Lane/);
assert.doesNotMatch(wordText, /66[^.]*Waltham Cross Bus Station/);

function genericService({ id, routeNumber, origin, destination, pattern, stopIds = pattern, directionFamily = 'outbound', operator = 'Fictional Transit', provider = 'BODS', exact = true, recordActivity = 10 } = {}) {
  const week = { monday: [420], tuesday: [420], wednesday: [420], thursday: [420], friday: [420], saturday: [], sunday: [] };
  const decision = place => ({ chosen: place, chosenDisplayName: place, decisionType: exact ? 'exact-endpoint-resolved' : 'unresolved-review', exact, exactEvidence: exact, primaryEndpointStopPointId: place, endpointStopPointId: place, endpointStopPointIds: [place], stopArea: { id: `area:${place}` }, stopAreas: [{ id: `area:${place}` }] });
  return {
    id, routeNumber, operator, provider, timetableSource: provider, source: { provider }, origin, destination,
    direction: directionFamily, directionFamily, originStopPointId: pattern[0], destinationStopPointId: pattern.at(-1),
    originEndpointDecision: decision(origin), destinationEndpointDecision: decision(destination), routePatternStopIds: pattern,
    routePatternStops: pattern.map(id => ({ id, name: id })), routePatternExtent: pattern.length, sourceRouteIds: [`line-${routeNumber}`],
    stopIds, assessedStops: stopIds, principalLocations: ['Shared Interchange'], calendarProfileId: 'ordinary',
    departuresByDay: week, departureEvidenceByDay: Object.fromEntries(Object.entries(week).map(([day, values]) => [day, values.map(minute => ({ minute, journeyIdentity: `${id}-${day}`, stopPointId: stopIds[0], provider }))])),
    recordActivity, frequencyBasisStopId: stopIds[0], sourceRecordIds: [id], sourceWarnings: []
  };
}

const genericStops = ['A', 'B', 'C', 'D', 'E'].map((id, index) => ({ id, name: id, walking: { status: 'routed', distanceMetres: 50 + index } }));
const trueFamily = buildPlannerBusServiceSummaries([
  genericService({ id: '50', routeNumber: '50', origin: 'Alpha', destination: 'Gamma', pattern: ['A', 'B', 'C', 'G'], recordActivity: 20 }),
  genericService({ id: '50a', routeNumber: '50A', origin: 'Alpha', destination: 'Delta', pattern: ['A', 'B', 'C', 'D'] }),
  genericService({ id: '50b', routeNumber: '50B', origin: 'Alpha', destination: 'Epsilon', pattern: ['A', 'B', 'C', 'E'] })
], genericStops);
assert.equal(trueFamily.length, 1);
assert.equal(trueFamily[0].routeNumber, '50');
assert.equal(trueFamily[0].routeFamilyLabel, '50 / 50A / 50B');
assert.equal(trueFamily[0].routeFamilyMembers.length, 3);

const falseStem = buildPlannerBusServiceSummaries([
  genericService({ id: '42', routeNumber: '42', origin: 'North', destination: 'North End', pattern: ['A', 'B', 'N'] }),
  genericService({ id: '42a', routeNumber: '42A', origin: 'South', destination: 'South End', pattern: ['D', 'E', 'S'] })
], genericStops);
assert.equal(falseStem.length, 2);
assert.ok(buildPublicRouteFamilyDecisions(falseStem).some(decision => decision.state !== 'proven-family'));

const nFamily = buildPlannerBusServiceSummaries([
  genericService({ id: '70', routeNumber: '70', origin: 'Alpha', destination: 'Gamma', pattern: ['A', 'B', 'C'] }),
  genericService({ id: 'n70', routeNumber: 'N70', origin: 'Alpha', destination: 'Gamma', pattern: ['A', 'B', 'C'] })
], genericStops);
assert.equal(nFamily.length, 2, 'N-prefixed routes remain outside ordinary numeric family logic');

const branchFamily = buildPlannerBusServiceSummaries([
  genericService({ id: '50-main', routeNumber: '50', origin: 'Alpha', destination: 'North', pattern: ['A', 'B', 'C', 'N1', 'N2'] }),
  genericService({ id: '50-branch', routeNumber: '50A', origin: 'Alpha', destination: 'South', pattern: ['A', 'B', 'C', 'S1', 'S2'] })
], [...genericStops, { id: 'N1' }, { id: 'N2' }, { id: 'S1' }, { id: 'S2' }]);
assert.equal(branchFamily.length, 2, 'materially divergent branches remain separate');

const authorityStops = genericStops;
const authoritative = genericService({ id: 'tfl-217', routeNumber: '217', origin: 'Alpha', destination: 'Gamma', pattern: ['A', 'B', 'C'], operator: 'TfL', provider: 'TfL' });
const supplementary = genericService({ id: 'national-217', routeNumber: '217', origin: 'Alpha', destination: 'Gamma', pattern: ['A', 'B', 'C'], operator: 'Operator not supplied in the timetable', provider: 'TNDS', exact: false });
const authorityRows = buildPlannerBusServiceSummaries([supplementary, authoritative], authorityStops);
assert.equal(authorityRows.length, 1);
assert.equal(authorityRows[0].operator, 'TfL');
assert.ok(authorityRows[0].publicServiceGroupingDecision.publicServiceEquivalenceEvidence.length);
assert.ok(authorityRows[0].publicServiceGroupingDecision.sourceRecordIds.includes('national-217'));

console.log('PASS BUS-GROUP-1B semantic route-family presentation, source-copy authority, Waltham frozen replay, calendar/frequency attribution, and Browser/Word parity controls.');
