import assert from 'node:assert/strict';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildControlledBusWording } from '../../src/atlas/domain/bus-service-assessment.mjs';

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

const genericEndpoint = buildPlannerBusServiceSummaries([record({
  routeNumber: 'G-A', ids: 'town-a', origin: 'Site Town Bus Station', destination: 'Bus Station', direction: 'Bus Station',
  routePatternStops: [
    { id: 'A', name: 'Site Town Bus Station', locality: 'Site Town' },
    { id: 'B', name: 'Bus Station', locality: 'Town A' }
  ], routePatternStopIds: ['A', 'B']
})], stops)[0];
assert.equal(genericEndpoint.directionPatternText, 'Towards Town A', 'generic terminal infrastructure resolves from the terminal locality');

const remoteGenericEndpoint = buildPlannerBusServiceSummaries([record({
  routeNumber: 'G-B', ids: 'other-town', origin: 'Bus Station', destination: 'Bus Station', direction: 'Other Town Bus Station',
  routePatternStops: [
    { id: 'A', name: 'Bus Station', locality: 'Site Town' },
    { id: 'B', name: 'Bus Station', locality: 'Other Town' }
  ], routePatternStopIds: ['A', 'B']
})], stops)[0];
assert.equal(remoteGenericEndpoint.directionPatternText, 'Towards Other Town', 'a remote terminal locality is not replaced by the selected-site locality');

const unresolvedGenericEndpoint = buildPlannerBusServiceSummaries([record({
  routeNumber: 'G-C', ids: 'unresolved', origin: 'Bus Station', destination: 'Bus Station', direction: 'Bus Station',
  routePatternStops: [{ id: 'A', name: 'Bus Station' }, { id: 'B', name: 'Bus Station' }], routePatternStopIds: ['A', 'B']
})], stops);
assert.equal(unresolvedGenericEndpoint.length, 0, 'generic terminal labels without safe locality evidence are not promoted to a planner row');

const publicTerminus = buildPlannerBusServiceSummaries([record({
  routeNumber: 'G-D', ids: 'public-terminus', origin: 'Town A', destination: 'High Street Bus Stand', direction: 'Town A (District Centre)',
  routeOrigin: 'Town A', routeDestination: 'Town A (District Centre)',
  routePatternStops: [{ id: 'A', name: 'Town A Bus Station', locality: 'Town A' }, { id: 'B', name: 'High Street Bus Stand', locality: 'Town A' }],
  routePatternStopIds: ['A', 'B']
})], stops)[0];
assert.equal(publicTerminus.directionPatternText, 'Towards Town A (District Centre)', 'specific public terminus wording outranks the physical terminal stand');
assert.match(publicTerminus.rawServiceSummaries.map(service => service.destination).join(' '), /High Street Bus Stand/, 'physical terminal wording remains in detailed source evidence');

const namedPublicStops = [
  { id: 'A', name: 'Bus Station', locality: 'Town A', distanceMetres: 100 },
  { id: 'B', name: 'Trafalgar Square', locality: 'Charing Cross', distanceMetres: 100 },
  { id: 'C', name: 'Bus Station', locality: 'Town A', distanceMetres: 110 },
  { id: 'D', name: 'Trafalgar Square', locality: 'Charing Cross', distanceMetres: 110 }
];
const namedPublicFamily = buildPlannerBusServiceSummaries([
  record({ routeNumber: 'G-E', ids: 'named-forward', origin: 'Bus Station', destination: 'Trafalgar Square', direction: 'Trafalgar Square', pattern: ['A', 'B'], routePatternStops: [
    { id: 'A', name: 'Bus Station', locality: 'Town A' },
    { id: 'B', name: 'Trafalgar Square', locality: 'Charing Cross' }
  ] }),
  record({ routeNumber: 'G-E', ids: 'named-reverse', origin: 'Trafalgar Square', destination: 'Bus Station', direction: 'Town A, Bus Station', pattern: ['D', 'C'], routePatternStops: [
    { id: 'D', name: 'Trafalgar Square', locality: 'Charing Cross' },
    { id: 'C', name: 'Bus Station', locality: 'Town A' }
  ] })
], namedPublicStops);
assert.deepEqual(namedPublicFamily.map(row => `${row.origin} -> ${row.destination}`).sort(), [
  'Town A -> Trafalgar Square',
  'Trafalgar Square -> Town A'
].sort(), 'specific public terminal names outrank associated localities in both directions');

const controlledWording = buildControlledBusWording([{
  routeNumber: '310',
  principalLocations: ['Waltham Cross Railway Station', 'Railway Station', 'Waltham Cross', 'Town Centre']
}]);
assert.match(controlledWording, /Waltham Cross Railway Station/);
assert.match(controlledWording, /Town Centre/);
assert.doesNotMatch(controlledWording, /Railway Station, Waltham Cross Railway Station|Waltham Cross Railway Station, Railway Station, Waltham Cross/);

console.log('PASS Alpha.16 service-family CASE A-F contracts.');
