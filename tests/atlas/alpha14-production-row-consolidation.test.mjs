import assert from 'node:assert/strict';
import { buildPlannerBusServiceSummaries, buildPlannerSummaryAudit } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const stops = [
  { id: 'REP-A', name: 'Waltham Cross Bus Station', indicator: 'Stop D', walking: { status: 'routed', distanceMetres: 82 } },
  { id: 'REP-B', name: 'Waltham Cross Bus Station', indicator: 'Stop E', walking: { status: 'routed', distanceMetres: 120 } }
];

function weeklySchedule(minutes, stopId) {
  return { [stopId]: Object.fromEntries(DAYS.map(day => [day, [...minutes]])) };
}

function evidenceByDay(minutes, id, stopId) {
  return Object.fromEntries(DAYS.map(day => [day, minutes.map((minute, index) => ({
    minute,
    stopPointId: stopId,
    journeyIdentity: `${id}:${day}:${index}`,
    provider: 'BODS'
  }))]));
}

function productionRecord({
  id,
  routeNumber,
  directionId = '0',
  operator = 'Central Connect',
  routeId = `${routeNumber}-production-route`,
  origin = 'Origin Bus Station',
  destination = 'Principal Bus Station',
  direction = destination,
  circular = false,
  pattern = ['ORIGIN', 'REPRESENTATIVE', 'DESTINATION'],
  patternNames = ['Origin Bus Station', 'Waltham Cross Bus Station', 'Principal Bus Station'],
  minutes = [420, 480],
  stopId = 'REP-A',
  calendarProfileId = 'ordinary'
}) {
  return {
    id,
    routeNumber,
    operator,
    origin,
    destination,
    direction,
    circular,
    principalLocations: patternNames.slice(1, -1),
    routePatternStopIds: pattern,
    routePatternStops: pattern.map((patternId, index) => ({ id: patternId, name: patternNames[index] || patternId })),
    stopSchedules: weeklySchedule(minutes, stopId),
    departureEvidenceByDay: evidenceByDay(minutes, id, stopId),
    calendarProfileId,
    source: {
      provider: 'BODS',
      routeId,
      directionId,
      vehicleJourneyCode: `${routeId}:${id}`
    },
    timetableSource: 'BODS'
  };
}

function buildRows(records) {
  const summaries = buildServiceSummaries(stops, records);
  return buildPlannerBusServiceSummaries(summaries, stops);
}

const productionRecords = [
  // 25C: alternate termini and source-pattern IDs remain one principal direction.
  productionRecord({ id: '25c-out-main', routeNumber: '25C', routeId: '12315124', destination: 'Bus Station', pattern: ['25C-A', '25C-REP', '25C-BS'] }),
  productionRecord({ id: '25c-out-short', routeNumber: '25C', routeId: '12315124', destination: 'Temp Bus Station', pattern: ['25C-SHORT-A', '25C-SHORT-REP', '25C-TEMP'], patternNames: ['Hoddesdon', 'Waltham Cross Bus Station', 'Temp Bus Station'], stopId: 'REP-B', minutes: [450] }),
  productionRecord({ id: '25c-in', routeNumber: '25C', routeId: '12315124', directionId: '1', origin: 'Bus Station', destination: 'Temp Bus Station', direction: 'Temp Bus Station', pattern: ['25C-TEMP', '25C-REP-IN', '25C-A'] }),

  // 310: the circular and linear classifications describe one route-family direction.
  productionRecord({ id: '310-circular-out', routeNumber: '310', routeId: '7650', origin: 'Bus Station', destination: 'Bus Station', direction: 'Bus Station', circular: true, pattern: ['310-CIRC-A', '310-CIRC-REP', '310-CIRC-A'] }),
  productionRecord({ id: '310-linear-out', routeNumber: '310', routeId: '7650', origin: 'Ware Railway Station', destination: 'Bus Station', direction: 'Bus Station', pattern: ['310-LINEAR-A', '310-LINEAR-REP', '310-LINEAR-B'] }),
  productionRecord({ id: '310-circular-in', routeNumber: '310', routeId: '7650', directionId: '1', origin: 'Bus Station', destination: 'Bus Station', direction: 'Bus Station', circular: true, pattern: ['310-IN-A', '310-IN-REP', '310-IN-A'] }),

  // 46: operator naming and stop/pattern variants do not create another direction.
  productionRecord({ id: '46-centrebus', routeNumber: '46', routeId: '7603', operator: 'Centrebus', destination: 'Bus Station', pattern: ['46-CB-A', '46-CB-REP', '46-CB-B'] }),
  productionRecord({ id: '46-centrebus-south', routeNumber: '46', routeId: '7603', operator: 'Centrebus South', destination: 'Bridge Street', pattern: ['46-CBS-A', '46-CBS-REP', '46-CBS-B'], stopId: 'REP-B' }),
  productionRecord({ id: '46-return', routeNumber: '46', routeId: '7603', operator: 'Centrebus', directionId: '1', origin: 'Bus Station', destination: 'Two Brewers', direction: 'Two Brewers', pattern: ['46-IN-A', '46-IN-REP', '46-IN-B'] }),

  // 230: circular/linear pattern classification is consolidated when the source route lineage agrees.
  productionRecord({ id: '230-circular', routeNumber: '230', routeId: '118723', operator: 'Centrebus', origin: 'Lyons Community Centre', destination: 'Lyons Community Centre', direction: 'Caddington Woods', circular: true, pattern: ['230-LYONS', '230-CW', '230-LYONS'], patternNames: ['Lyons Community Centre', 'Caddington Woods', 'Lyons Community Centre'] }),
  productionRecord({ id: '230-linear-variant', routeNumber: '230', routeId: '118723', operator: 'Centrebus', origin: 'Lyons Community Centre', destination: 'Bus Station', direction: 'Caddington Woods', pattern: ['230-LYONS-LINEAR', '230-CW-LINEAR', '230-BS'], patternNames: ['Lyons Community Centre', 'Caddington Woods', 'Bus Station'] }),

  ...[
    ['66', 2], ['242', 2], ['231', 1], ['357', 2], ['444', 2], ['W16', 2], ['657', 1]
  ].flatMap(([routeNumber, count]) => [
    productionRecord({ id: `${routeNumber}-out`, routeNumber, routeId: `${routeNumber}-fixture`, destination: 'Principal Terminal' }),
    ...(count === 2 ? [productionRecord({ id: `${routeNumber}-in`, routeNumber, routeId: `${routeNumber}-fixture`, directionId: '1', origin: 'Principal Terminal', destination: 'Origin Bus Station', direction: 'inbound', pattern: ['DESTINATION', 'REPRESENTATIVE', 'ORIGIN'] })] : [])
  ])
];

const summaries = buildServiceSummaries(stops, productionRecords);
const rows = buildPlannerBusServiceSummaries(summaries, stops);
const expectedRowCounts = Object.freeze({ '25C': 2, '66': 2, '242': 2, '310': 2, '46': 2, '230': 1, '231': 1, '357': 2, '444': 2, W16: 2, '657': 1 });
const audit = buildPlannerSummaryAudit(rows, expectedRowCounts);

for (const [routeNumber, expected] of Object.entries(expectedRowCounts)) {
  assert.equal(audit.routes.find(route => route.routeNumber === routeNumber)?.rowCount, expected, `${routeNumber}: production-representative row count`);
}
assert.deepEqual(audit.aboveExpectedRoutes, [], 'audit reports no route above its accepted production row count');
assert.equal(rows.filter(row => row.routeNumber === '310')[0].variantCount, 2, '310 circular/linear variants are retained inside one directional row');
assert.equal(rows.filter(row => row.routeNumber === '230').length, 1, '230 does not expose a circular/linear duplicate');
assert.equal(rows.filter(row => row.routeNumber === '230')[0].circular, true, '230 retains circular service-family evidence');
const genuine230Corridors = buildRows([
  productionRecord({ id: '230-corridor-a', routeNumber: '230', routeId: '230-a', operator: 'Centrebus', destination: 'North Corridor', pattern: ['230-A-1', '230-A-2', '230-A-3'] }),
  productionRecord({ id: '230-corridor-b', routeNumber: '230', routeId: '230-b', operator: 'Centrebus', origin: 'South Corridor', destination: 'South Terminal', pattern: ['230-B-1', '230-B-2', '230-B-3'] })
]);
assert.equal(genuine230Corridors.length, 2, 'genuinely distinct 230 corridors remain separate');
assert.equal(rows.filter(row => row.routeNumber === '46').length, 2, '46 operator variants consolidate into two directions');
assert.equal(rows.filter(row => row.routeNumber === '25C')[0].rawServiceSummaries.length, 2, '25C alternate source pattern remains traceable inside its consolidated row');
assert.equal(rows.filter(row => row.routeNumber === '25C')[0].servedAtStopId, 'REP-A', 'representative stop is selected after route-direction consolidation');

console.log('PASS Alpha.14 production-representative planner audit:', JSON.stringify(audit));
