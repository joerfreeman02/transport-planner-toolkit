import assert from 'node:assert/strict';
import { buildPlannerBusServiceSummaries, plannerSourceWarning, resolvedPlannerDestination } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const weekday = values => Object.fromEntries(DAYS.map(day => [day, day === 'sunday' ? [] : values]));
const endpoint = ({ place, id, exact, ids = [id] }) => ({
  rawEndpointText: place,
  raw: place,
  chosen: place,
  chosenDisplayName: place,
  decisionType: exact ? 'exact-endpoint-resolved' : 'generic-endpoint-resolved',
  exact,
  exactEvidence: exact,
  primaryEndpointStopPointId: id,
  endpointStopPointId: id,
  endpointStopPointIds: ids,
  stopArea: { id: `AREA-${id}`, name: place },
  stopAreas: [{ id: `AREA-${id}`, name: place }]
});

const service = ({ id, destination, destinationStopPointId, destinationStopPointIds, calendarProfileId = 'ordinary', departuresByDay = weekday([420]), destinationEndpointDecision, ...extra }) => ({
  id,
  sourceRecordIds: [id],
  routeNumber: '313',
  operator: 'Operator',
  provider: 'TfL',
  timetableSource: 'TfL',
  sourceAuthorities: ['TfL'],
  sourceProviders: ['TfL'],
  source: { provider: 'TfL', sourceRouteIds: ['313'] },
  origin: 'Origin',
  destination,
  direction: 'outbound',
  directionFamily: 'outbound',
  originStopPointId: 'ORIGIN',
  destinationStopPointId,
  originStopPointIds: ['ORIGIN'],
  destinationStopPointIds: destinationStopPointIds ?? [destinationStopPointId],
  stopIds: ['BASIS', 'ORIGIN', destinationStopPointId],
  assessedStops: ['BASIS'],
  routePatternStopIds: ['ORIGIN', 'BASIS', destinationStopPointId],
  routePatternStops: ['ORIGIN', 'BASIS', destinationStopPointId].map(id => ({ id, name: id })),
  routePatternExtent: 3,
  orderedPatternEndpoints: ['ORIGIN', destinationStopPointId],
  sourceRouteIds: ['313'],
  originEndpointDecision: endpoint({ place: 'Origin', id: 'ORIGIN', exact: true }),
  destinationEndpointDecision,
  calendarProfileId,
  calendarProfileLabel: calendarProfileId,
  calendarEvidence: [],
  serviceNote: calendarProfileId === 'school-day' ? 'Route operates on school days only.' : '',
  departuresByDay,
  departureEvidenceByDay: Object.fromEntries(DAYS.map(day => [day, (departuresByDay[day] ?? []).map(minute => ({ minute, stopPointId: 'BASIS', provider: 'TfL' }))])),
  frequencyBasisStopId: 'BASIS',
  frequencyEvidence: [],
  recordActivity: Object.values(departuresByDay).flat().length,
  operatingPeriods: {},
  principalLocations: ['Corridor'],
  ...extra
});

const stops = [{ id: 'BASIS', name: 'Assessed Stop', stopAreaId: 'AREA-BASIS', walking: { status: 'routed', distanceMetres: 120 } }];

const ordinary = service({
  id: '313-ordinary',
  destination: 'Main Station',
  destinationStopPointId: 'MAIN',
  destinationStopPointIds: ['MAIN', 'SCHOOL'],
  departuresByDay: weekday([420, 450, 480, 510, 540, 570, 600, 630, 660, 690, 720, 750]),
  destinationEndpointDecision: endpoint({ place: 'Main Station', id: 'MAIN', exact: false, ids: ['MAIN', 'SCHOOL'] })
});
const school = service({
  id: '313-school',
  destination: 'School',
  destinationStopPointId: 'SCHOOL',
  calendarProfileId: 'school-day',
  departuresByDay: weekday([420, 480]),
  destinationEndpointDecision: endpoint({ place: 'School', id: 'SCHOOL', exact: true })
});

const rows = buildPlannerBusServiceSummaries([ordinary, school], stops);
assert.equal(rows.length, 1, '313 principal and school variant remain one public row');
assert.equal(rows[0].destination, 'Main Station', 'an exact endpoint from a different variant cannot replace the selected principal');
assert.ok(rows[0].calendarProfileIds.includes('school-day'), 'the restricted variant remains visible as structured evidence');

const wordText = buildBusWordTables({ ok: true, stops, plannerServiceSummaries: rows, serviceSummaries: [] })
  .flatMap(table => table.rows ?? [])
  .map(row => Array.isArray(row) ? row.join(' ') : String(row?.text ?? ''))
  .join(' ');
assert.match(wordText, /Main Station/);
assert.doesNotMatch(wordText, /313\s+Operator\s+Towards\s+School/);

const hydratedEndpointService = service({
  id: '313-hydrated',
  destination: 'Destination not supplied',
  destinationStopPointId: 'MAIN',
  destinationEndpointDecision: endpoint({ place: 'Main Station', id: 'MAIN', exact: true })
});
assert.equal(resolvedPlannerDestination(hydratedEndpointService), true, 'endpoint-resolved display evidence counts as a resolved planner destination');
assert.doesNotMatch(plannerSourceWarning(hydratedEndpointService).join(' '), /could not be assigned a complete route identity/i);

console.log('PASS BUS-ROBUSTNESS-1A4 313 principal endpoint regression.');
