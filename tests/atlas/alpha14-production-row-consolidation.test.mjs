import assert from 'node:assert/strict';
import { buildPlannerBusServiceSummaries, buildPlannerSummaryAudit } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

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
    routePatternCompleteness: 'complete',
    routePatternStops: pattern.map((patternId, index) => ({ id: patternId, name: patternNames[index] || patternId })),
    endpointProvenance: Object.fromEntries(['origin', 'destination'].map(side => [side, {
      value: side === 'origin' ? origin : destination,
      provider: 'BODS', endpoint: 'prepared BODS fixture', preparedAt: '2026-09-14T12:00:00Z',
      freshness: { status: 'current' }, evidenceClass: 'complete-pattern-terminals', sourceKind: 'BODS complete route pattern'
    }])),
    stopSchedules: weeklySchedule(minutes, stopId),
    departureEvidenceByDay: evidenceByDay(minutes, id, stopId),
    calendarProfileId,
    source: {
      provider: 'BODS',
      routeId,
      directionId,
      vehicleJourneyCode: `${routeId}:${id}`,
      preparedAt: '2026-09-14T12:00:00Z',
      endpoint: 'prepared BODS fixture'
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

const reviewStops = [
  { id: 'REP-A', name: 'Waltham Cross Bus Station', indicator: 'Stop D', walking: { status: 'routed', distanceMetres: 82 } },
  { id: 'REP-B', name: 'Waltham Cross Bus Station', indicator: 'Stop E', walking: { status: 'routed', distanceMetres: 120 } }
];

function dailyMinutes(minutes) {
  return Object.fromEntries(DAYS.map(day => [day, [...minutes]]));
}

function evidenceForStops({ id, stopMinutes }) {
  return Object.fromEntries(DAYS.map(day => [day, Object.entries(stopMinutes).flatMap(([stopId, minutes]) => minutes.map((minute, index) => ({
    minute,
    stopPointId: stopId,
    journeyIdentity: `${id}:${stopId}:${day}:${index}`,
    provider: 'BODS'
  })))]));
}

function reviewRecord({
  id,
  routeNumber,
  routeId = `south-east-${routeNumber}`,
  directionId,
  operator = 'Centrebus',
  origin = 'Origin Bus Station',
  destination = 'Principal Bus Station',
  direction = destination,
  circular = false,
  pattern = ['START', 'REP', 'END'],
  patternNames = pattern,
  representativeMinutes = [420, 480],
  nearbyMinutes = [],
  calendarProfileId = 'ordinary',
  serviceNotes = [],
  qualifications = []
}) {
  const stopMinutes = { 'REP-A': representativeMinutes, 'REP-B': nearbyMinutes };
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
    routePatternCompleteness: 'complete',
    routePatternStops: pattern.map((patternId, index) => ({ id: patternId, name: patternNames[index] || patternId })),
    endpointProvenance: Object.fromEntries(['origin', 'destination'].map(side => [side, {
      value: side === 'origin' ? origin : destination,
      provider: 'BODS', endpoint: 'prepared BODS fixture', preparedAt: '2026-09-14T12:00:00Z',
      freshness: { status: 'current' }, evidenceClass: 'complete-pattern-terminals', sourceKind: 'BODS complete route pattern'
    }])),
    stopSchedules: Object.fromEntries(Object.entries(stopMinutes).map(([stopId, minutes]) => [stopId, dailyMinutes(minutes)])),
    departureEvidenceByDay: evidenceForStops({ id, stopMinutes }),
    calendarProfileId,
    serviceNotes,
    qualifications,
    validFrom: '2026-09-01',
    validTo: '2026-12-31',
    source: {
      provider: 'BODS',
      region: 'south_east',
      routeId,
      directionId,
      patternId: `${routeId}:${id}:pattern`,
      vehicleJourneyCode: `${routeId}:${id}`,
      preparedAt: '2026-09-14T12:00:00Z',
      endpoint: 'prepared BODS fixture'
    },
    timetableSource: 'BODS'
  };
}

function reviewRows(records) {
  return buildPlannerBusServiceSummaries(buildServiceSummaries(reviewStops, records), reviewStops);
}

const alpha14ReviewRecords = [
  // 25C production-shaped route variants: one principal direction, with observed alternate termini retained as notes.
  reviewRecord({
    id: '25c-main',
    routeNumber: '25C',
    routeId: '12315124',
    directionId: '0',
    origin: 'Central Start',
    destination: 'Bus Station',
    direction: 'Hoddesdon',
    pattern: ['25C-START', '25C-REP', '25C-MAPLE', '25C-MAYNARD', '25C-TEMP', '25C-BUS'],
    patternNames: ['Central Start', 'Waltham Cross Bus Station', 'Maple Gate', 'Maynard Court', 'Temp Bus Station', 'Bus Station'],
    representativeMinutes: [420, 480, 500, 540]
  }),
  reviewRecord({
    id: '25c-bus-variant',
    routeNumber: '25C',
    routeId: '12315124',
    directionId: '0',
    origin: 'Central Start',
    destination: 'Bus Station',
    direction: 'Hoddesdon',
    pattern: ['25C-START', '25C-REP', '25C-BUS'],
    patternNames: ['Central Start', 'Waltham Cross Bus Station', 'Bus Station'],
    representativeMinutes: [510, 570],
    nearbyMinutes: [900, 960]
  }),
  reviewRecord({
    id: '25c-aaa-temp',
    routeNumber: '25C',
    routeId: '12315124',
    directionId: '0',
    origin: 'Central Start',
    destination: 'Temp Bus Station',
    direction: 'Hoddesdon',
    pattern: ['25C-START', '25C-REP', '25C-TEMP-MID', '25C-TEMP'],
    patternNames: ['Central Start', 'Waltham Cross Bus Station', 'Temp Approach', 'Temp Bus Station'],
    representativeMinutes: [450]
  }),
  reviewRecord({
    id: '25c-maple',
    routeNumber: '25C',
    routeId: '12315124',
    directionId: '0',
    origin: 'Central Start',
    destination: 'Maple Gate',
    direction: 'Hoddesdon',
    pattern: ['25C-START', '25C-REP', '25C-MAPLE'],
    patternNames: ['Central Start', 'Waltham Cross Bus Station', 'Maple Gate'],
    representativeMinutes: [450],
    nearbyMinutes: [900, 960]
  }),
  reviewRecord({
    id: '25c-maynard',
    routeNumber: '25C',
    routeId: '12315124',
    directionId: '0',
    origin: 'Central Start',
    destination: 'Maynard Court',
    direction: 'Hoddesdon',
    pattern: ['25C-START', '25C-REP', '25C-MAYNARD'],
    patternNames: ['Central Start', 'Waltham Cross Bus Station', 'Maynard Court'],
    representativeMinutes: [465]
  }),
  reviewRecord({
    id: '25c-return',
    routeNumber: '25C',
    routeId: '12315124',
    directionId: '1',
    origin: 'Temp Bus Station',
    destination: 'Central Start',
    direction: 'Central Start',
    pattern: ['25C-TEMP', '25C-REP-RETURN', '25C-START'],
    patternNames: ['Temp Bus Station', 'Waltham Cross Bus Station', 'Central Start']
  }),

  // 310 includes the observed Arriva alias, a circular-labelled record and an open linear record.
  reviewRecord({ id: '310-circular-out', routeNumber: '310', routeId: '7650', directionId: '0', operator: 'Arriva (in Herts and Essex)', origin: 'Bus Station', destination: 'Bus Station', direction: 'Hertford', circular: true, pattern: ['310-BUS', '310-REP', '310-BUS'], patternNames: ['Bus Station', 'Waltham Cross Bus Station', 'Bus Station'] }),
  reviewRecord({ id: '310-linear-out', routeNumber: '310', routeId: '7650', directionId: '0', operator: 'Arriva Herts and Essex', origin: 'Ware Railway Station', destination: 'Bus Station', direction: 'Hertford', pattern: ['310-WARE', '310-REP', '310-BUS'], patternNames: ['Ware Railway Station', 'Waltham Cross Bus Station', 'Bus Station'], representativeMinutes: [430], nearbyMinutes: [900, 960] }),
  reviewRecord({ id: '310-short-out', routeNumber: '310', routeId: '7650', directionId: '0', operator: 'Arriva Herts and Essex', origin: 'Ware Railway Station', destination: 'Bus Station', direction: 'Hertford', pattern: ['310-WARE', '310-REP', '310-PLATFORM', '310-BUS'], patternNames: ['Ware Railway Station', 'Waltham Cross Bus Station', 'Town Centre', 'Bus Station'], representativeMinutes: [440] }),
  reviewRecord({ id: '310-timetable-variant-out', routeNumber: '310', routeId: '7650', directionId: '0', operator: 'Arriva (in Herts and Essex)', origin: 'Hoddesdon', destination: 'Bus Station', direction: 'Hertford', pattern: ['310-HOD', '310-REP', '310-BUS'], patternNames: ['Hoddesdon', 'Waltham Cross Bus Station', 'Bus Station'], representativeMinutes: [450] }),
  reviewRecord({ id: '310-circular-in', routeNumber: '310', routeId: '7650', directionId: '1', operator: 'Arriva Herts and Essex', origin: 'Bus Station', destination: 'Bus Station', direction: 'Ware', circular: true, pattern: ['310-BUS-IN', '310-REP-IN', '310-BUS-IN'], patternNames: ['Bus Station', 'Waltham Cross Bus Station', 'Bus Station'] }),

  // 230 is a genuine Lyons Community Centre loop, with one linear-classified source variant in the same family.
  reviewRecord({ id: '230-circular', routeNumber: '230', routeId: '118723', origin: 'Lyons Community Centre', destination: 'Lyons Community Centre', direction: 'Caddington Woods', circular: true, pattern: ['230-LYONS', '230-CW', '230-LYONS'], patternNames: ['Lyons Community Centre', 'Caddington Woods', 'Lyons Community Centre'] }),
  reviewRecord({ id: '230-linear-variant', routeNumber: '230', routeId: '118723', origin: 'Lyons Community Centre', destination: 'Bus Station', direction: 'Caddington Woods', pattern: ['230-LYONS-LINEAR', '230-CW-LINEAR', '230-BUS'], patternNames: ['Lyons Community Centre', 'Caddington Woods', 'Bus Station'], representativeMinutes: [435] }),

  // 46 replays the hosted four-row failure shape: Centrebus/Centrebus South and
  // Bridge Street/Hemel Hempstead/Park Square/Luton, Park Square variants.
  reviewRecord({ id: '46-bridge-street', routeNumber: '46', routeId: '7603', directionId: '0', operator: 'Centrebus', origin: 'Park Square', destination: 'Bridge Street', direction: 'Bridge Street', pattern: ['46-PARK', '46-REP', '46-BRIDGE'], patternNames: ['Park Square', 'Waltham Cross Bus Station', 'Bridge Street'], representativeMinutes: [420, 480, 540] }),
  reviewRecord({ id: '46-hemel-hempstead', routeNumber: '46', routeId: '7603', directionId: '0', operator: 'Centrebus South', origin: 'Park Square', destination: 'Hemel Hempstead', direction: 'Bridge Street', pattern: ['46-PARK', '46-REP', '46-HEMEL'], patternNames: ['Park Square', 'Waltham Cross Bus Station', 'Hemel Hempstead'], representativeMinutes: [450] }),
  reviewRecord({ id: '46-park-square', routeNumber: '46', routeId: '7603', directionId: '1', operator: 'Centrebus', origin: 'Bridge Street', destination: 'Park Square', direction: 'Park Square', pattern: ['46-BRIDGE-RETURN', '46-REP-RETURN', '46-PARK-RETURN'], patternNames: ['Bridge Street', 'Waltham Cross Bus Station', 'Park Square'], representativeMinutes: [420, 480, 540] }),
  reviewRecord({ id: '46-luton-park-square', routeNumber: '46', routeId: '7603', directionId: '1', operator: 'Centrebus South', origin: 'Luton', destination: 'Luton, Park Square', direction: 'Park Square', pattern: ['46-LUTON', '46-REP-RETURN', '46-PARK-RETURN'], patternNames: ['Luton', 'Waltham Cross Bus Station', 'Luton, Park Square'], representativeMinutes: [450] }),

  // 317 is an independent production-shaped two-way control.
  reviewRecord({ id: '317-out', routeNumber: '317', routeId: '10984053', directionId: '0', operator: 'Metroline Travel', origin: 'Bus Station', destination: 'Little Park Gardens', direction: 'Little Park Gardens', pattern: ['317-BUS', '317-REP', '317-LPG'], patternNames: ['Bus Station', 'Waltham Cross Bus Station', 'Little Park Gardens'] }),
  reviewRecord({ id: '317-in', routeNumber: '317', routeId: '10984053', directionId: '1', operator: 'Metroline Travel', origin: 'Little Park Gardens', destination: 'Bus Station', direction: 'Bus Station', pattern: ['317-LPG-IN', '317-REP-IN', '317-BUS-IN'], patternNames: ['Little Park Gardens', 'Waltham Cross Bus Station', 'Bus Station'] })
];

const alpha14ReviewRows = reviewRows(alpha14ReviewRecords);
const alpha14ReviewAudit = buildPlannerSummaryAudit(alpha14ReviewRows, { '25C': 2, '310': 2, '230': 1, '46': 2, '317': 2 });
assert.deepEqual(alpha14ReviewAudit.aboveExpectedRoutes, [], 'Alpha.14 review audit has no above-expected production rows');
assert.deepEqual(Object.fromEntries(alpha14ReviewAudit.routes.map(route => [route.routeNumber, route.rowCount])), { '25C': 2, '230': 1, '310': 2, '317': 2, '46': 2 });

const review25cRows = alpha14ReviewRows.filter(row => row.routeNumber === '25C');
const review25c = review25cRows.find(row => row.directionFamily === 'gtfs:0');
assert.ok(review25c, '25C principal production direction is present');
assert.ok(review25c.rawServiceSummaries.some(service => service.destination === 'Maple Gate'));
assert.ok(review25c.rawServiceSummaries.some(service => service.destination === 'Maynard Court'));
const review25cRouteNotes = review25cRows.map(row => row.routeGroupNote || '').filter(Boolean).join(' ');
assert.match(review25cRouteNotes, /principal Route|shorter? workings|service family/i);
assert.notEqual(review25c.destination, 'Bus Station', 'public endpoint resolution must not promote a generic Bus Station label');
assert.doesNotMatch(review25c.directionPatternText, /Bus Station/);
assert.equal(review25c.servedAtStopId, 'REP-A');
assert.ok(!review25c.departuresByDay.monday.some(minute => [900, 960].includes(minute)), 'nearby-stop departures cannot inflate the representative-stop headline');
assert.ok(alpha14ReviewRecords.some(service => service.routeNumber === '25C' && service.stopSchedules['REP-B'].monday.some(minute => [900, 960].includes(minute))));
const wordReview = buildBusWordTables({ ok: true, stops: [], plannerServiceSummaries: alpha14ReviewRows, serviceSummaries: [] });
const word25cNotes = wordReview[1].rows.filter(row => !Array.isArray(row) && /principal Route|shorter? workings|service family/i.test(row.text)).map(row => row.text).join(' ');
assert.match(word25cNotes, /principal Route|shorter? workings|service family/i);
assert.equal(wordReview[1].widths.length, 7, 'Word Table 3.3 keeps the seven-column planner contract');

const legacyAlpha13IdentityCount = alpha14ReviewRecords.filter(record => record.routeNumber === '25C' && record.source.directionId === '0')
  .map(record => [record.routeNumber, record.source.routeId, record.source.directionId, record.origin, record.destination, record.stopSchedules['REP-A'], record.routePatternStopIds.join('>')].join('|'))
  .filter((value, index, values) => values.indexOf(value) === index).length;
assert.ok(legacyAlpha13IdentityCount > 2, 'the production-shaped 25C fixture reproduces the former duplicate-row identity split');

const rows310 = alpha14ReviewRows.filter(row => row.routeNumber === '310');
assert.equal(rows310.length, 2);
assert.ok(rows310.every(row => row.circular === false));
assert.ok(rows310.every(row => !/Circular —/i.test(row.directionPatternText)));
assert.ok(rows310.some(row => row.rawServiceSummaries.some(service => service.operator === "Arriva (in Herts and Essex)")));
assert.match(rows310.map(row => row.routeGroupNote || '').join(' '), /principal Route|shorter? workings|timetable variants/i);
const rows310Principal = rows310.find(row => row.directionFamily === 'gtfs:0');
assert.ok(rows310Principal, '310 principal direction is present');
assert.equal(rows310Principal.servedAtStopId, 'REP-A', '310 selects the intended representative stop');
assert.ok(!rows310Principal.departuresByDay.monday.some(minute => [900, 960].includes(minute)), '310 nearby-stop departures cannot inflate the representative-stop headline');
assert.ok(alpha14ReviewRecords.some(service => service.routeNumber === '310' && service.stopSchedules['REP-B'].monday.some(minute => [900, 960].includes(minute))), '310 nearby-stop raw fixture evidence is present');

const rows46 = alpha14ReviewRows.filter(row => row.routeNumber === '46');
assert.equal(rows46.length, 2);
assert.deepEqual(new Set(rows46.map(row => row.directionFamily)), new Set(['gtfs:0', 'gtfs:1']));
assert.ok(rows46.every(row => row.rawServiceSummaries.some(service => /Centrebus/.test(service.operator))));
assert.ok(rows46.some(row => row.rawServiceSummaries.some(service => /Hemel Hempstead/.test(service.destination))));
assert.ok(rows46.some(row => row.rawServiceSummaries.some(service => /Luton, Park Square/.test(service.destination))));
assert.match(rows46.map(row => row.routeGroupNote || '').join(' '), /principal Route|shorter? workings|timetable variants/i);
const word46Notes = wordReview[1].rows.filter(row => !Array.isArray(row) && /principal Route|shorter? workings|timetable variants/i.test(row.text)).map(row => row.text).join(' ');
assert.match(word46Notes, /principal Route|shorter? workings|timetable variants/i);

const rows230 = alpha14ReviewRows.filter(row => row.routeNumber === '230');
assert.equal(rows230.length, 1);
assert.equal(rows230[0].circular, true);
assert.match(rows230[0].directionPatternText, /^Circular —/);
assert.equal(rows230[0].rawServiceSummaries.length, 2);

const distinctCorridors = reviewRows([
  reviewRecord({ id: '230-corridor-north', routeNumber: '230', routeId: '118723', directionId: '0', origin: 'North Interchange', destination: 'North Terminal', direction: 'Caddington Woods', pattern: ['NORTH-1', 'NORTH-2', 'NORTH-3'], patternNames: ['North Interchange', 'North Midpoint', 'North Terminal'] }),
  reviewRecord({ id: '230-corridor-south', routeNumber: '230', routeId: '118723', directionId: '0', origin: 'South Interchange', destination: 'South Terminal', direction: 'Caddington Woods', pattern: ['SOUTH-1', 'SOUTH-2', 'SOUTH-3'], patternNames: ['South Interchange', 'South Midpoint', 'South Terminal'] })
]);
assert.equal(distinctCorridors.length, 2, 'common lineage alone cannot merge genuinely distinct corridors');

const transitiveChain = reviewRows([
  reviewRecord({ id: 'chain-a', routeNumber: 'CHAIN', routeId: 'chain-lineage', directionId: '0', origin: 'Chain Start', destination: 'Chain One', direction: 'Chain', pattern: ['CHAIN-A', 'CHAIN-B', 'CHAIN-C'], patternNames: ['Chain Start', 'Chain A', 'Chain One'] }),
  reviewRecord({ id: 'chain-b', routeNumber: 'CHAIN', routeId: 'chain-lineage', directionId: '0', origin: 'Chain Start', destination: 'Chain Three', direction: 'Chain', pattern: ['CHAIN-A', 'CHAIN-B', 'CHAIN-C', 'CHAIN-D', 'CHAIN-E', 'CHAIN-F'], patternNames: ['Chain Start', 'Chain A', 'Chain One', 'Chain D', 'Chain E', 'Chain Three'] }),
  reviewRecord({ id: 'chain-c', routeNumber: 'CHAIN', routeId: 'chain-lineage', directionId: '0', origin: 'Chain Two', destination: 'Chain Three', direction: 'Chain', pattern: ['CHAIN-D', 'CHAIN-E', 'CHAIN-F'], patternNames: ['Chain Two', 'Chain D', 'Chain E', 'Chain Three'] })
]);
assert.equal(transitiveChain.length, 1, 'connected component formation preserves a legitimate transitive service chain');
assert.equal(transitiveChain[0].variantCount, 3);

const missingDirectionOpposite = reviewRows([
  reviewRecord({ id: 'missing-direction-forward', routeNumber: 'MD', routeId: 'missing-direction', directionId: undefined, origin: 'MD Start', destination: 'MD End', direction: '', pattern: ['MD-A', 'MD-B', 'MD-C'], patternNames: ['MD Start', 'MD Mid', 'MD End'] }),
  reviewRecord({ id: 'missing-direction-reverse', routeNumber: 'MD', routeId: 'missing-direction', directionId: undefined, origin: 'MD End', destination: 'MD Start', direction: '', pattern: ['MD-C', 'MD-B', 'MD-A'], patternNames: ['MD End', 'MD Mid', 'MD Start'] })
]);
assert.equal(missingDirectionOpposite.length, 2, 'reverse pattern/endpoints keep opposite directions separate even without direction markers');

const alpha14AmbiguousBridgeRecords = [
  reviewRecord({ id: 'bridge-a', routeNumber: 'BRIDGE', routeId: 'bridge-lineage', directionId: '0', origin: 'Bridge Start', destination: 'Bridge End', direction: 'inbound', pattern: ['BR-A', 'BR-B', 'BR-C'], patternNames: ['Bridge Start', 'Bridge Mid', 'Bridge End'], representativeMinutes: [420] }),
  reviewRecord({ id: 'bridge-b', routeNumber: 'BRIDGE', routeId: 'bridge-lineage', directionId: undefined, origin: 'Bridge Start', destination: 'Bridge Variant', direction: '', pattern: ['BR-B'], patternNames: ['Bridge Mid'], representativeMinutes: [430] }),
  reviewRecord({ id: 'bridge-c', routeNumber: 'BRIDGE', routeId: 'bridge-lineage', directionId: '1', origin: 'Bridge End', destination: 'Bridge Start', direction: 'outbound', pattern: ['BR-C', 'BR-B', 'BR-A'], patternNames: ['Bridge End', 'Bridge Mid', 'Bridge Start'], representativeMinutes: [520] })
];
alpha14AmbiguousBridgeRecords[1].principalLocations = ['Bridge Start', 'Bridge Mid', 'Bridge End'];
const alpha14AmbiguousBridgeRows = reviewRows(alpha14AmbiguousBridgeRecords);
assert.equal(alpha14AmbiguousBridgeRows.length, 2, 'ambiguous bridge cannot collapse explicit opposite directions');
assert.equal(alpha14AmbiguousBridgeRows.filter(row => row.rawServiceSummaries.some(service => service.sourceRecordIds?.includes('bridge-b'))).length, 1, 'ambiguous bridge record is assigned to exactly one component');
for (const minute of [420, 430, 520]) {
  assert.equal(alpha14AmbiguousBridgeRows.flatMap(row => row.departuresByDay.monday).filter(value => value === minute).length, 1, `ambiguous bridge minute ${minute} remains unique`);
}

const reverseWorkingCases = [
  {
    routeNumber: 'REV-EQ',
    records: [
      reviewRecord({ id: 'rev-eq-forward', routeNumber: 'REV-EQ', routeId: 'reverse-lineage', origin: 'Reverse Start', destination: 'Reverse End', direction: '', pattern: ['REV-A', 'REV-B', 'REV-C', 'REV-D'], patternNames: ['Reverse Start', 'Reverse B', 'Reverse C', 'Reverse End'] }),
      reviewRecord({ id: 'rev-eq-reverse', routeNumber: 'REV-EQ', routeId: 'reverse-lineage', origin: 'Reverse End', destination: 'Reverse Start', direction: '', pattern: ['REV-D', 'REV-C', 'REV-B', 'REV-A'], patternNames: ['Reverse End', 'Reverse C', 'Reverse B', 'Reverse Start'] })
    ]
  },
  {
    routeNumber: 'REV-UNEQ',
    records: [
      reviewRecord({ id: 'rev-uneq-forward', routeNumber: 'REV-UNEQ', routeId: 'reverse-lineage-unequal', origin: 'Unequal Start', destination: 'Unequal End', direction: '', pattern: ['UNEQ-A', 'UNEQ-B', 'UNEQ-C', 'UNEQ-D'], patternNames: ['Unequal Start', 'Unequal B', 'Unequal C', 'Unequal End'] }),
      reviewRecord({ id: 'rev-uneq-short', routeNumber: 'REV-UNEQ', routeId: 'reverse-lineage-unequal', origin: 'Unequal End', destination: 'Unequal Mid', direction: '', pattern: ['UNEQ-D', 'UNEQ-C', 'UNEQ-B'], patternNames: ['Unequal End', 'Unequal C', 'Unequal Mid'] })
    ]
  },
  {
    routeNumber: 'REV-PART',
    records: [
      reviewRecord({ id: 'rev-part-forward', routeNumber: 'REV-PART', routeId: 'reverse-lineage-partial', origin: 'Partial Start', destination: 'Partial End', direction: '', pattern: ['PART-A', 'PART-B', 'PART-C', 'PART-D', 'PART-E'], patternNames: ['Partial Start', 'Partial B', 'Partial C', 'Partial D', 'Partial End'] }),
      reviewRecord({ id: 'rev-part-overlap', routeNumber: 'REV-PART', routeId: 'reverse-lineage-partial', origin: 'Partial End', destination: 'Partial Mid', direction: '', pattern: ['PART-E', 'PART-D', 'PART-X'], patternNames: ['Partial End', 'Partial D', 'Partial Mid'] })
    ]
  },
  {
    routeNumber: 'REV-SAME',
    records: [
      reviewRecord({ id: 'rev-same-main', routeNumber: 'REV-SAME', routeId: 'same-direction-lineage', origin: 'Same Start', destination: 'Same End', direction: '', pattern: ['SAME-A', 'SAME-B', 'SAME-C', 'SAME-D'], patternNames: ['Same Start', 'Same B', 'Same C', 'Same End'] }),
      reviewRecord({ id: 'rev-same-short', routeNumber: 'REV-SAME', routeId: 'same-direction-lineage', origin: 'Same Start', destination: 'Same Mid', direction: '', pattern: ['SAME-A', 'SAME-B', 'SAME-C'], patternNames: ['Same Start', 'Same B', 'Same Mid'] })
    ]
  }
];
for (const testCase of reverseWorkingCases) {
  const rowsForCase = reviewRows(testCase.records);
  assert.equal(rowsForCase.length, testCase.routeNumber === 'REV-SAME' ? 1 : 2, `${testCase.routeNumber}: reverse-orientation safety result`);
}

const mixedCircularAndLinear = reviewRows([
  reviewRecord({ id: 'mixed-loop', routeNumber: 'MIXED', routeId: 'mixed-lineage', directionId: '0', origin: 'Loop Hub', destination: 'Loop Hub', direction: 'Loop', circular: true, pattern: ['MIX-LOOP-A', 'MIX-LOOP-REP', 'MIX-LOOP-A'], patternNames: ['Loop Hub', 'Loop Midpoint', 'Loop Hub'] }),
  reviewRecord({ id: 'mixed-linear-out', routeNumber: 'MIXED', routeId: 'mixed-lineage', directionId: '0', origin: 'Linear Start', destination: 'Linear End', direction: 'Linear', pattern: ['MIX-LINEAR-A', 'MIX-LINEAR-REP', 'MIX-LINEAR-B'], patternNames: ['Linear Start', 'Linear Midpoint', 'Linear End'] }),
  reviewRecord({ id: 'mixed-linear-in', routeNumber: 'MIXED', routeId: 'mixed-lineage', directionId: '1', origin: 'Linear End', destination: 'Linear Start', direction: 'Linear Return', pattern: ['MIX-LINEAR-B-IN', 'MIX-LINEAR-REP-IN', 'MIX-LINEAR-A-IN'], patternNames: ['Linear End', 'Linear Return Midpoint', 'Linear Start'] })
]);
assert.equal(mixedCircularAndLinear.filter(row => row.circular).length, 1, 'closed circular component remains circular beside an independent linear corridor');
assert.equal(mixedCircularAndLinear.filter(row => !row.circular).length, 2, 'independent linear corridor remains non-circular');
assert.equal(mixedCircularAndLinear.length, 3, 'mixed circular and linear corridors remain separate components');

console.log('PASS Alpha.14 corrected production replay: 25C provenance/notes, 310/230 circular controls, 317 control, transitive grouping, corridor and frequency safety, and Word parity.');
