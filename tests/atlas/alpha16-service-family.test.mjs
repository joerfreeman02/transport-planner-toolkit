import assert from 'node:assert/strict';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';

const week = { monday: [420], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
const stops = [
  { id: 'A', name: 'Selected Stop', locality: 'Waltham Cross', distanceMetres: 100, walking: { status: 'routed', distanceMetres: 80 } },
  { id: 'B', name: 'Selected Stop', locality: 'Waltham Cross', distanceMetres: 110, walking: { status: 'routed', distanceMetres: 90 } }
];

function record({ routeNumber = '13', operator = 'Example Buses', origin = 'Waltham Cross', destination = 'North Weald', description = `${origin} - ${destination}`, pattern = ['A', 'B', 'C'], ids = 'journey', source = 'BODS', departures = [420], serviceNote = '', circular = false, ...extra } = {}) {
  const evidence = Object.fromEntries(Object.keys(week).map(day => [day, []]));
  evidence.monday = departures.map((minute, index) => ({ minute, journeyIdentity: `${ids}-${index}`, provider: source }));
  return {
    id: `${routeNumber}-${ids}`,
    routeNumber, operator, origin, destination, description, direction: 'outbound', directionFamily: 'outbound',
    routePatternStopIds: pattern, principalLocations: [origin, destination], frequencyBasisStopId: 'A', stopIds: ['A'],
    departuresByDay: { ...week, monday: departures }, departureEvidenceByDay: evidence, sourceRecordIds: [ids],
    timetableSource: source, calendarProfileId: 'ordinary', serviceNote, circular, ...extra
  };
}

const family = buildPlannerBusServiceSummaries([
  record({ routeNumber: '13', ids: '13-main' }),
  record({ routeNumber: '13A', ids: '13a-variant' })
], stops);
assert.equal(family.length, 1, 'same public family suffixes consolidate');
assert.equal(family[0].routeNumber, '13');
assert.ok(family[0].rawRouteNumbers.includes('13A'));

const separateCorridors = buildPlannerBusServiceSummaries([
  record({ routeNumber: '13', ids: 'north', destination: 'North Weald', pattern: ['A', 'B', 'C'], principalLocations: ['Waltham Cross', 'North Weald'] }),
  record({ routeNumber: '13A', ids: 'bishop', destination: "Bishop's Stortford", description: "Waltham Cross - Bishop's Stortford", pattern: ['X', 'Y', 'Z'], principalLocations: ["Bishop's Stortford", 'Much Hadham'] })
], stops);
assert.equal(separateCorridors.length, 2, 'suffix stripping alone does not merge separate corridors');

const crossProvider = buildPlannerBusServiceSummaries([
  record({ routeNumber: 'C', ids: 'bods-copy', source: 'BODS' }),
  record({ routeNumber: 'C', ids: 'tnds-copy', source: 'TNDS', directionFamily: 'gtfs:0' })
], stops);
assert.equal(crossProvider.length, 1);
assert.equal(crossProvider[0].departuresByDay.monday.length, 1, 'same public semantics deduplicate across provider IDs');

const shortWorking = buildPlannerBusServiceSummaries([
  record({ routeNumber: '25C', ids: 'full', destination: 'Harlow', pattern: ['A', 'B', 'C'], departures: [420, 480] }),
  record({ routeNumber: '25C', ids: 'short', destination: 'Waltham Cross', pattern: ['A', 'B'], departures: [450], serviceNote: 'Short working towards Waltham Cross.' })
], stops)[0];
assert.equal(shortWorking.destination, 'Harlow');
assert.match(shortWorking.routeGroupNote, /principal Route|variants|shorter? workings|service family/i);

const branches = buildPlannerBusServiceSummaries([
  record({ routeNumber: '66', ids: 'main-branch', destination: 'Terminal One', pattern: ['A', 'B', 'C', 'D', 'E'] }),
  record({ routeNumber: '66', ids: 'material-branch', destination: 'Terminal Two', pattern: ['A', 'B', 'X', 'Y', 'Z'] })
], stops);
assert.equal(branches.length, 2, 'material branch tails remain separate rows');

const genericInfrastructure = buildPlannerBusServiceSummaries([record({
  routeNumber: '310', ids: 'generic', origin: 'Bus Station', destination: 'Bus Station', description: 'Hertford - Waltham Cross',
  routePatternStops: [{ id: 'A', name: 'Waltham Cross Bus Station' }, { id: 'B', name: 'Cheshunt' }, { id: 'C', name: 'Hertford' }],
  routePatternStopIds: ['A', 'B', 'C'], circular: false
})], stops)[0];
assert.equal(genericInfrastructure.origin, 'Waltham Cross');
assert.equal(genericInfrastructure.destination, 'Hertford');
assert.equal(genericInfrastructure.circular, false, 'generic infrastructure wording does not manufacture a circular row');

console.log('PASS Alpha.16 service-family CASE A-F contracts.');
