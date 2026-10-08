import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlannerBusServiceSummaries, plannerSourceWarning } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { resolvePlannerEndpointDecisions } from '../../src/atlas/domain/planner-endpoint-decision.mjs';

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const schedule = Object.fromEntries(days.map(day => [day, day === 'sunday' ? [] : [420, 480, 540]]));
const ordinarySchedule = Object.fromEntries(days.map(day => [day, day === 'sunday' ? [] : [420, 450, 480, 510, 540, 570, 600, 630, 660, 690, 720, 750]]));
const schoolSchedule = Object.fromEntries(days.map(day => [day, day === 'sunday' ? [] : [420, 480]]));

const service = ({ id, destination, destinationStopPointId, calendarProfileId = 'ordinary', ...extra }) => ({
  id,
  routeNumber: '313',
  operator: 'Fixture Buses',
  provider: 'TfL',
  timetableSource: 'TfL',
  sourceAuthorities: ['TfL'],
  sourceProviders: ['TfL'],
  source: { provider: 'TfL', sourceRouteIds: ['313'] },
  sourceRouteIds: ['313'],
  origin: 'Origin not supplied',
  destination,
  direction: 'outbound',
  originStopPointId: 'ORIGIN',
  destinationStopPointId,
  destinationStopPointIds: [destinationStopPointId],
  routePatternStopIds: ['ORIGIN', destinationStopPointId],
  routePatternStops: [{ id: 'ORIGIN', name: 'Origin' }, { id: destinationStopPointId, name: destination }],
  directionFamily: 'outbound',
  stopIds: ['ASSESS', 'ORIGIN', destinationStopPointId],
  assessedStops: ['ASSESS'],
  routePatternExtent: 3,
  orderedPatternEndpoints: ['ORIGIN', destinationStopPointId],
  stopSchedules: { ASSESS: schedule },
  departuresByDay: schedule,
  principalLocations: ['Corridor'],
  calendarProfileId,
  calendarProfileLabel: calendarProfileId,
  calendarEvidence: [],
  departureEvidenceByDay: Object.fromEntries(days.map(day => [day, (schedule[day] ?? []).map(minute => ({ minute, stopPointId: 'ASSESS', provider: 'TfL' }))])),
  frequencyBasisStopId: 'ASSESS',
  frequencyEvidence: [],
  recordActivity: Object.values(schedule).flat().length,
  operatingPeriods: {},
  serviceNote: calendarProfileId === 'school-day' ? 'Route operates on school days only.' : '',
  sourceRecordIds: [id],
  ...extra
});

const referenceStop = {
  id: 'TARGET',
  name: 'Authoritative Main Station',
  nptgLocalityCode: 'E-LOCAL',
  transportMode: 'bus_coach',
  busPreparedEligible: true,
  coordinateValid: true,
  latitude: 51.5,
  longitude: -0.1,
  status: 'active'
};
const referenceData = {
  resolvePreparedStopPointsByIds: async () => ({ ok: true, physicalStops: [], warnings: [], provenance: { preparedStopPointsAvailable: true } }),
  resolveReferenceStopPointsByIds: async ids => ({ ok: true, referenceStopPoints: ids.includes('TARGET') ? [referenceStop] : [], warnings: [], provenance: { referenceStopPointsAvailable: true } }),
  resolveStopReferences: async selected => ({
    ok: true,
    logicalGroups: [],
    localities: selected.some(stop => stop.nptgLocalityCode === 'E-LOCAL') ? [{ id: 'nptg:E-LOCAL', code: 'E-LOCAL', name: 'Reference Locality' }] : [],
    warnings: [],
    provenance: { nptgLocalityAvailable: true }
  }),
  resolveStopAreaStructure: async () => ({ ok: true, structure: { groups: [], members: [] }, warnings: [], provenance: {} })
};

const ordinary = service({ id: 'ordinary', destination: 'Destination not supplied', destinationStopPointId: 'TARGET', destinationStopPointIds: ['TARGET', 'SCHOOL'], departuresByDay: ordinarySchedule, recordActivity: Object.values(ordinarySchedule).flat().length });
const school = service({ id: 'school', destination: "Dame Alice Owen's School", destinationStopPointId: 'SCHOOL', calendarProfileId: 'school-day', departuresByDay: schoolSchedule, recordActivity: Object.values(schoolSchedule).flat().length });
const resolved = await resolvePlannerEndpointDecisions([ordinary, school], referenceData);
const resolvedOrdinary = resolved.services.find(item => item.id === 'ordinary');
assert.equal(resolvedOrdinary.destinationEndpointDecision.chosenDisplayName, 'Authoritative Main Station');
assert.equal(resolvedOrdinary.destinationEndpointDecision.evidenceSource, 'authoritative-reference-endpoint');
assert.deepEqual(resolvedOrdinary.destinationEndpointDecision.evidence.referenceHydratedEndpointStopPointIds, ['TARGET']);
assert.doesNotMatch(plannerSourceWarning(resolvedOrdinary).join(' '), /complete route identity/i);

const rows = buildPlannerBusServiceSummaries(resolved.services, [{ id: 'ASSESS', name: 'Assessment stop', walking: { status: 'routed', distanceMetres: 100 } }]);
assert.equal(rows.length, 1);
assert.equal(rows[0].destination, 'Authoritative Main Station');
assert.ok(rows[0].calendarProfileIds.includes('school-day'));
const wordText = buildBusWordTables({ ok: true, stops: [], plannerServiceSummaries: rows, serviceSummaries: [] })
  .flatMap(table => table.rows ?? [])
  .map(row => Array.isArray(row) ? row.join(' ') : String(row?.text ?? ''))
  .join(' ');
assert.match(wordText, /Authoritative Main Station/);
assert.doesNotMatch(wordText, /313\s+Fixture Buses\s+Towards\s+Dame Alice Owen's School/);

const unresolved = await resolvePlannerEndpointDecisions([service({ id: 'unresolved', destination: 'Destination not supplied', destinationStopPointId: 'MISSING' }), school], referenceData);
const unresolvedRows = buildPlannerBusServiceSummaries(unresolved.services, []);
assert.equal(unresolvedRows[0].destination, 'Destination requires review');
assert.match(plannerSourceWarning(unresolved.services[0]).join(' '), /complete route identity/i);

const conflict = await resolvePlannerEndpointDecisions([service({
  id: 'conflict',
  destination: 'Destination not supplied',
  destinationStopPointId: 'TARGET',
  endpointEvidence: { destination: { TARGET: { resolvedStopPointId: 'TARGET', naptanCommonName: 'Weaker persisted name' } } }
})], referenceData);
assert.equal(conflict.services[0].destinationEndpointDecision.conflict, true);
assert.equal(conflict.services[0].destinationEndpointDecision.chosenDisplayName, 'Authoritative Main Station');

for (const sourcePath of [
  'src/atlas/adapters/prepared-bus-data-adapter.mjs',
  'src/atlas/reference-data/atlas-reference-data.mjs',
  'src/atlas/domain/planner-endpoint-decision.mjs'
]) {
  const source = fs.readFileSync(new URL(`../../${sourcePath}`, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Potters Bar|Dame Alice Owen's School/);
}

console.log('PASS BUS-ROBUSTNESS-1A4B authoritative endpoint hydration, fail-closed variant handling, conflict review, and Browser/Word parity.');
