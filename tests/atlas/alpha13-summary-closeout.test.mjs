import assert from 'node:assert/strict';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildControlledBusWording } from '../../src/atlas/domain/bus-service-assessment.mjs';

const stops = [{ id: 'REP', name: 'Representative Stop', walking: { status: 'routed', distanceMetres: 50 } }];
const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function fixture({
  routeNumber,
  operator = 'Example Buses',
  direction = 'gtfs:0',
  directionFamily = direction,
  origin = 'Origin',
  destination,
  pattern = ['ORIGIN', 'REP', 'DESTINATION'],
  departures = [420],
  id,
  circular = false,
  calendarProfileId,
  serviceNote = '',
  activeDays = days
}) {
  const departureEvidenceByDay = Object.fromEntries(days.map(day => [day, activeDays.includes(day) ? departures.map((minute, index) => ({
    minute,
    journeyIdentity: `${id}-${day}-${index}`,
    provider: operator
  })) : []]));
  return {
    id,
    routeNumber,
    operator,
    direction,
    directionFamily,
    origin,
    destination,
    circular,
    routePatternStopIds: pattern,
    principalLocations: ['Representative Stop', destination],
    frequencyBasisStopId: 'REP',
    stopIds: ['REP'],
    departuresByDay: Object.fromEntries(days.map(day => [day, activeDays.includes(day) ? departures : []])),
    departureEvidenceByDay,
    frequencyEvidence: [],
    sourceRecordIds: [id],
    calendarProfileId,
    serviceNote
  };
}

function rowsFor(records, routeNumber) {
  return buildPlannerBusServiceSummaries(records, stops).filter(row => row.routeNumber === routeNumber);
}

const route25C = rowsFor([
  fixture({ routeNumber: '25C', destination: 'Bus Station', departures: [420, 600], id: '25c-main' }),
  fixture({ routeNumber: '25C', destination: 'Temp Bus Station', departures: [480], id: '25c-short' }),
  fixture({ routeNumber: '25C', direction: 'gtfs:1', directionFamily: 'gtfs:1', origin: 'Bus Station', destination: 'Origin', pattern: ['DESTINATION', 'REP', 'ORIGIN'], id: '25c-return' })
], '25C');
assert.equal(route25C.length, 2, '25C has one concise row per principal direction');
const route25COutbound = route25C.find(row => row.directionFamily === 'gtfs:0');
assert.equal(route25COutbound.departuresByDay.monday.length, 3, '25C frequency uses the combined canonical representative-stop population');
assert.match(route25C.at(-1).routeGroupNote ?? '', /Temp Bus Station/);

const route66 = rowsFor([
  fixture({ routeNumber: '66', operator: 'Arriva', destination: 'Loughton Station', departures: [420], id: '66-arriva' }),
  fixture({ routeNumber: '66', operator: 'Arriva Herts and Essex', destination: 'Loughton Station', departures: [480], id: '66-arriva-he' }),
  fixture({ routeNumber: '66', direction: 'gtfs:1', directionFamily: 'gtfs:1', origin: 'Loughton Station', destination: 'Smiths Lane', pattern: ['DESTINATION', 'REP', 'ORIGIN'], id: '66-return' })
], '66');
assert.equal(route66.length, 2, 'operator aliases do not create duplicate route-direction rows');
assert.equal(route66.find(row => row.directionFamily === 'gtfs:0').departuresByDay.monday.length, 2);

const route242 = rowsFor([
  fixture({ routeNumber: '242', operator: 'Uno', destination: 'Waltham Cross Bus Station', departures: [420, 540], id: '242-main' }),
  fixture({ routeNumber: '242', operator: 'Uno', destination: 'Brookfield Centre', departures: [480], id: '242-short' }),
  fixture({ routeNumber: '242', direction: 'gtfs:1', directionFamily: 'gtfs:1', origin: 'Waltham Cross Bus Station', destination: 'Potters Bar', pattern: ['DESTINATION', 'REP', 'ORIGIN'], id: '242-return' })
], '242');
assert.equal(route242.length, 2, '242 short workings remain within two principal directional rows');
assert.match(route242.at(-1).routeGroupNote ?? '', /Brookfield Centre/);

const route310 = rowsFor([
  fixture({ routeNumber: '310', destination: 'Waltham Cross Bus Station', id: '310-out' }),
  fixture({ routeNumber: '310', direction: 'gtfs:1', directionFamily: 'gtfs:1', origin: 'Waltham Cross Bus Station', destination: 'Hertford Bus Station', pattern: ['DESTINATION', 'REP', 'ORIGIN'], id: '310-return' })
], '310');
assert.equal(route310.length, 2);
assert.ok(route310.every(row => !row.circular && !row.directionPatternText.startsWith('Circular —')), '310 remains non-circular');

const route46 = rowsFor([
  fixture({ routeNumber: '46', operator: 'Centrebus', destination: 'North Terminal', departures: [420], id: '46-centrebus' }),
  fixture({ routeNumber: '46', operator: 'Centrebus South', destination: 'North Terminal', departures: [480], id: '46-centrebus-south' }),
  fixture({ routeNumber: '46', direction: 'gtfs:1', directionFamily: 'gtfs:1', origin: 'North Terminal', destination: 'South Terminal', pattern: ['DESTINATION', 'REP', 'ORIGIN'], id: '46-return' })
], '46');
assert.equal(route46.length, 2, 'Centrebus aliases consolidate to two meaningful directions');
assert.equal(route46.find(row => row.directionFamily === 'gtfs:0').departuresByDay.monday.length, 2);

const route230 = rowsFor([fixture({ routeNumber: '230', operator: 'Centrebus', destination: 'Lyons Community Centre', direction: 'clockwise', directionFamily: 'clockwise', pattern: ['REP', 'PIPERS', 'REP'], circular: true, id: '230-circular' })], '230');
assert.equal(route230.length, 1);
assert.equal(route230[0].circular, true);
assert.match(route230[0].directionPatternText, /^Circular —/);

const route231 = rowsFor([fixture({ routeNumber: '231', operator: 'Uno', destination: 'Bedford', departures: [678], id: '231-limited', serviceNote: 'Limited service.' })], '231');
assert.equal(route231.length, 1);
assert.match(route231[0].serviceNote, /^Limited service\./);

for (const routeNumber of ['357', '444', 'W16']) {
  const rows = rowsFor([
    fixture({ routeNumber, destination: 'North Terminal', departures: [360, 420], id: `${routeNumber}-out` }),
    fixture({ routeNumber, direction: 'gtfs:1', directionFamily: 'gtfs:1', origin: 'North Terminal', destination: 'South Terminal', pattern: ['DESTINATION', 'REP', 'ORIGIN'], departures: [390, 450], id: `${routeNumber}-return` })
  ], routeNumber);
  assert.equal(rows.length, 2, `${routeNumber} remains a two-direction summary`);
}

const route657 = rowsFor([fixture({ routeNumber: '657', operator: 'Stagecoach London', destination: 'Chingford', departures: [982], id: '657-school', calendarProfileId: 'school-day', activeDays: days.slice(0, 5), serviceNote: 'School-day-only service.' })], '657');
assert.equal(route657.length, 1);
assert.equal(route657[0].departuresByDay.saturday.length, 0);
assert.equal(route657[0].departuresByDay.sunday.length, 0);
assert.equal(route657[0].serviceNote, 'School days only.');

const wording = buildControlledBusWording(route25C, { nearestGroupName: 'Representative Stop' });
assert.doesNotMatch(wording, /verified service|verified destination|verified pattern|verified timetable/i);
assert.match(wording, /providing direct connections to/);

console.log('PASS Alpha.13 closeout fixtures: 25C, 66, 242, 310, 46, 230, 231, 357, 444, 657 and W16.');
