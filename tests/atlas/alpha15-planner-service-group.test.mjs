import assert from 'node:assert/strict';
import { buildPlannerBusServiceSummaries, buildPlannerServiceGroups } from '../../src/atlas/domain/bus-planner-summary.mjs';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const stops = [
  { id: 'A', name: 'Waltham Cross Bus Station', indicator: 'Stop A', distanceMetres: 100, walking: { status: 'routed', distanceMetres: 90 } },
  { id: 'B', name: 'Waltham Cross Bus Station', indicator: 'Stop B', distanceMetres: 130, walking: { status: 'routed', distanceMetres: 120 } },
  { id: 'C', name: 'Waltham Cross Bus Station', indicator: 'Stop C', distanceMetres: 160, walking: { status: 'routed', distanceMetres: 150 } }
];

const week = minutes => Object.fromEntries(DAYS.map(day => [day, [...minutes]]));

function record({
  id,
  routeNumber = 'R',
  operator = 'Example Buses',
  routeId = `${routeNumber}-line`,
  directionId = '0',
  origin = 'Origin',
  destination = 'Destination',
  direction = destination,
  pattern = ['ORIGIN', 'MID', 'DESTINATION'],
  stopIds = ['A'],
  basis = stopIds[0],
  minutes = [420, 480],
  calendarProfileId = 'ordinary',
  circular = false,
  principalLocations = ['Waltham Cross Bus Station'],
  patternNames = pattern,
  departureEvidenceByDay
} = {}) {
  return {
    id,
    routeNumber,
    operator,
    origin,
    destination,
    direction,
    directionFamily: `gtfs:${directionId}`,
    sourceRouteIds: [routeId],
    routePatternStopIds: pattern,
    stopIds,
    frequencyBasisStopId: basis,
    frequencyBasisStopName: stops.find(stop => stop.id === basis)?.name,
    departuresByDay: week(minutes),
    departureEvidenceByDay: departureEvidenceByDay ?? Object.fromEntries(DAYS.map(day => [day, minutes.map(minute => ({ minute, stopPointId: basis, journeyIdentity: `${id}:${day}:${minute}`, provider: 'BODS' }))])),
    calendarProfileId,
    circular,
    principalLocations,
    sourceRecordIds: [id],
    routePatternStops: pattern.map((name, index) => ({ id: name, name: patternNames[index] ?? name })),
    timetableSource: 'BODS'
  };
}

const rows = services => buildPlannerBusServiceSummaries(services, stops);

const operatorRows = rows([
  record({ id: 'operator-a', routeNumber: '46', operator: 'Centrebus', destination: 'North Terminal' }),
  record({ id: 'operator-b', routeNumber: '46', operator: 'Centrebus South', destination: 'North Terminal' })
]);
assert.equal(operatorRows.length, 1, 'operator variants do not create a second public direction');
assert.deepEqual(operatorRows[0].operatorRawNames, ['Centrebus', 'Centrebus South']);
assert.match(operatorRows[0].operator, /Centrebus/);
assert.equal(operatorRows[0].rawServiceSummaries.length, 2, 'operator evidence remains in the planner group');

const variantRows = rows([
  record({ id: 'variant-main', routeNumber: '25C', routeId: '25c-line', origin: 'Bus Station', destination: 'Main Terminus', direction: 'Main Terminus', pattern: ['START', 'MID', 'MAIN'] }),
  record({ id: 'variant-short', routeNumber: '25 C', routeId: '25c-line', origin: 'Bus Station', destination: 'Short Terminus', direction: 'Main Terminus', pattern: ['START', 'MID', 'SHORT'], minutes: [450] })
]);
assert.equal(variantRows.length, 1, 'route-number formatting and short workings consolidate');
assert.equal(variantRows[0].variantCount, 2);
assert.match(`${variantRows[0].serviceNote} ${variantRows[0].routeGroupNote || ''}`, /Additional variants|short workings|timetable variants/i);
assert.equal(variantRows[0].plannerServiceGroup.sourceServiceCount, 2);

const multiStopRows = rows([record({ id: 'multi-stop', routeNumber: '66', stopIds: ['A', 'B'], basis: 'A' })]);
assert.equal(multiStopRows[0].frequencyBasisStopId, 'A');
assert.match(multiStopRows[0].servedAtText, /Stop A .*timetable basis/);
assert.match(multiStopRows[0].servedAtText, /Stop B/);
assert.deepEqual(multiStopRows[0].stopIds, ['A', 'B']);
assert.equal(multiStopRows[0].plannerServiceGroup.timetableBasis.stopId, 'A');

const incompleteNearestRows = rows([record({
  id: 'basis-far',
  routeNumber: 'BASIS',
  stopIds: ['A', 'B'],
  basis: 'B',
  departureEvidenceByDay: Object.fromEntries(DAYS.map(day => [day, [{ minute: 420, stopPointId: 'B', journeyIdentity: `basis-${day}`, provider: 'BODS' }]]))
})]);
assert.equal(incompleteNearestRows[0].frequencyBasisStopId, 'B', 'a nearer stop without timetable evidence cannot become the basis');
assert.deepEqual(incompleteNearestRows[0].stopIds, ['A', 'B'], 'the nearer served stop is still listed');

const unboundMultiStop = record({ id: 'unbound-multi', routeNumber: 'UNBOUND', stopIds: ['A', 'B'], minutes: [420] });
delete unboundMultiStop.frequencyBasisStopId;
delete unboundMultiStop.frequencyBasisStopName;
unboundMultiStop.departureEvidenceByDay = Object.fromEntries(DAYS.map(day => [day, [{ minute: 420, journeyIdentity: `unbound-${day}`, provider: 'BODS' }]]));
const boundStop = record({ id: 'bound-stop', routeNumber: 'UNBOUND', stopIds: ['B'], basis: 'B', minutes: [480] });
const unboundRows = rows([unboundMultiStop, boundStop]);
assert.equal(unboundRows.length, 1, 'unbound multi-stop evidence remains in the service group');
assert.equal(unboundRows[0].frequencyBasisStopId, 'B', 'unbound multi-stop evidence cannot select or bind the nearest stop');
assert.deepEqual(unboundRows[0].canonicalDeparturePopulation.monday.map(entry => entry.minute), [480], 'unbound multi-stop departures cannot inflate the representative-stop frequency');
assert.deepEqual(unboundRows[0].stopIds, ['A', 'B'], 'unbound service stops remain visible as served-stop evidence');

const unboundSingleStop = record({ id: 'unbound-single', routeNumber: 'UNBOUND-SINGLE', stopIds: ['A'], minutes: [450] });
delete unboundSingleStop.frequencyBasisStopId;
delete unboundSingleStop.frequencyBasisStopName;
unboundSingleStop.departureEvidenceByDay = Object.fromEntries(DAYS.map(day => [day, [{ minute: 450, journeyIdentity: `single-${day}`, provider: 'BODS' }]]));
const unboundSingleRows = rows([unboundSingleStop]);
assert.equal(unboundSingleRows[0].frequencyBasisStopId, 'A', 'single-stop unbound legacy evidence remains eligible');
assert.deepEqual(unboundSingleRows[0].canonicalDeparturePopulation.monday.map(entry => entry.minute), [450]);

const physicalEvidence = Object.fromEntries(DAYS.map(day => [day, [
  { minute: 420, stopPointId: 'A', journeyIdentity: 'physical-1', provider: 'BODS', destination: 'Destination' },
  { minute: 420, stopPointId: 'A', journeyIdentity: 'physical-1', provider: 'National feed', destination: 'Destination' },
  { minute: 420, stopPointId: 'A', journeyIdentity: 'physical-2', provider: 'BODS', destination: 'Destination' }
]]));
const physicalRows = rows([record({ id: 'physical', routeNumber: 'PHYS', departureEvidenceByDay: physicalEvidence, minutes: [] })]);
assert.equal(physicalRows[0].canonicalDeparturePopulationAll.monday.length, 2, 'same physical journey copies collapse but distinct physical journeys at the same minute remain');

const calendarRows = rows([
  record({ id: 'ordinary', routeNumber: 'CAL', calendarProfileId: 'ordinary', minutes: [420] }),
  record({ id: 'school', routeNumber: 'CAL', calendarProfileId: 'school-day', minutes: [600] })
]);
assert.equal(calendarRows.length, 1);
assert.deepEqual(calendarRows[0].calendarProfileIds, ['ordinary', 'school-day']);
assert.match(calendarRows[0].typicalFrequencyText, /Standard days|School days/);

const route242Groups = buildPlannerServiceGroups([
  record({ id: 'central-out', routeNumber: '242', operator: 'Central Connect', routeId: 'central', origin: 'Bus Station', destination: 'Potters Bar Railway Station' }),
  record({ id: 'uno-out', routeNumber: '242', operator: 'Uno', routeId: 'uno', directionId: '1', origin: 'Bus Station', destination: 'Potters Bar Railway Station' }),
  record({ id: 'uno-in', routeNumber: '242', operator: 'Uno', routeId: 'uno', directionId: '0', origin: 'Potters Bar Railway Station', destination: 'Bus Station', pattern: ['DESTINATION', 'MID', 'ORIGIN'] })
], stops);
assert.equal(route242Groups.length, 2, 'operator-specific direction markers cannot split or cross-bridge the public 242 directions');
assert.deepEqual(route242Groups.map(group => group.operatorNames.slice().sort()), [['Central Connect', 'Uno'], ['Uno']].sort((a, b) => a.join().localeCompare(b.join())));

const circularRows = rows([
  record({ id: '230-loop', routeNumber: '230', routeId: '230-line', origin: 'Loop Hub', destination: 'Loop Hub', direction: 'Clockwise', pattern: ['LOOP-A', 'LOOP-B', 'LOOP-A'], circular: true }),
  record({ id: '230-short', routeNumber: '230', routeId: '230-line', origin: 'Loop Hub', destination: 'Bus Station', direction: 'Clockwise', pattern: ['LOOP-A', 'LOOP-B', 'BUS'], circular: false })
]);
assert.equal(circularRows.length, 1);
assert.equal(circularRows[0].circular, true, 'genuine closed-loop evidence is retained');

const independentCorridors = rows([
  record({ id: 'corridor-a', routeNumber: '230', routeId: 'corridor-a', origin: 'North Interchange', destination: 'North Terminal', pattern: ['N1', 'N2', 'N3'] }),
  record({ id: 'corridor-b', routeNumber: '230', routeId: 'corridor-b', origin: 'South Interchange', destination: 'South Terminal', pattern: ['S1', 'S2', 'S3'] })
]);
assert.equal(independentCorridors.length, 2, 'distinct corridors with common route number remain separate');

const branchStops = [
  ...stops,
  ...['COMMON-A', 'COMMON-B', 'NORTH-A', 'NORTH-B', 'NORTH-C', 'NORTH-TERM', 'EAST-A', 'EAST-B', 'EAST-C', 'EAST-TERM']
    .map(id => ({ id, name: id, distanceMetres: 200, walking: { status: 'routed', distanceMetres: 200 } }))
];
const sharedTrunkBranches = buildPlannerBusServiceSummaries([
  record({
    id: 'shared-trunk-north',
    routeNumber: 'BRANCH',
    routeId: 'shared-trunk-line',
    origin: 'Hub',
    destination: 'North Terminal',
    direction: 'outbound',
    stopIds: ['A', 'COMMON-A', 'COMMON-B', 'NORTH-A', 'NORTH-B', 'NORTH-TERM'],
    basis: 'A',
    pattern: ['A', 'COMMON-A', 'COMMON-B', 'NORTH-A', 'NORTH-B', 'NORTH-TERM'],
    principalLocations: ['Hub', 'Common A', 'Common B', 'North A', 'North B', 'North Terminal'],
    patternNames: ['Hub', 'Common A', 'Common B', 'North A', 'North B', 'North Terminal']
  }),
  record({
    id: 'shared-trunk-east',
    routeNumber: 'BRANCH',
    routeId: 'shared-trunk-line',
    origin: 'Hub',
    destination: 'East Terminal',
    direction: 'outbound',
    stopIds: ['A', 'COMMON-A', 'COMMON-B', 'EAST-A', 'EAST-B', 'EAST-TERM'],
    basis: 'A',
    pattern: ['A', 'COMMON-A', 'COMMON-B', 'EAST-A', 'EAST-B', 'EAST-TERM'],
    principalLocations: ['Hub', 'Common A', 'Common B', 'East A', 'East B', 'East Terminal'],
    patternNames: ['Hub', 'Common A', 'Common B', 'East A', 'East B', 'East Terminal']
  })
], branchStops);
assert.equal(sharedTrunkBranches.length, 2, 'materially divergent same-lineage branches remain separate public rows');

const transitiveBridgeRows = buildPlannerBusServiceSummaries([
  record({
    id: 'transitive-north',
    routeNumber: 'TRANSITIVE-BRANCH',
    routeId: 'transitive-line',
    origin: 'Hub',
    destination: 'North Terminal',
    direction: 'outbound',
    stopIds: ['A', 'COMMON-A', 'COMMON-B', 'NORTH-A', 'NORTH-B', 'NORTH-TERM'],
    basis: 'A',
    pattern: ['A', 'COMMON-A', 'COMMON-B', 'NORTH-A', 'NORTH-B', 'NORTH-TERM'],
    principalLocations: ['Hub', 'Common A', 'Common B', 'North A', 'North B', 'North Terminal'],
    patternNames: ['Hub', 'Common A', 'Common B', 'North A', 'North B', 'North Terminal']
  }),
  record({
    id: 'transitive-east',
    routeNumber: 'TRANSITIVE-BRANCH',
    routeId: 'transitive-line',
    origin: 'Hub',
    destination: 'East Terminal',
    direction: 'outbound',
    stopIds: ['A', 'COMMON-A', 'COMMON-B', 'EAST-A', 'EAST-B', 'EAST-TERM'],
    basis: 'A',
    pattern: ['A', 'COMMON-A', 'COMMON-B', 'EAST-A', 'EAST-B', 'EAST-TERM'],
    principalLocations: ['Hub', 'Common A', 'Common B', 'East A', 'East B', 'East Terminal'],
    patternNames: ['Hub', 'Common A', 'Common B', 'East A', 'East B', 'East Terminal']
  }),
  record({
    id: 'transitive-trunk-short',
    routeNumber: 'TRANSITIVE-BRANCH',
    routeId: 'transitive-line',
    origin: 'Hub',
    destination: 'Common B',
    direction: 'outbound',
    stopIds: ['A', 'COMMON-A', 'COMMON-B'],
    basis: 'A',
    pattern: ['A', 'COMMON-A', 'COMMON-B'],
    principalLocations: ['Hub', 'Common A', 'Common B'],
    patternNames: ['Hub', 'Common A', 'Common B']
  })
], branchStops);
assert.equal(transitiveBridgeRows.length, 2, 'a common-trunk short working cannot bridge two genuine branches');
assert.equal(transitiveBridgeRows.reduce((count, row) => count + row.rawServiceSummaries.length, 0), 2, 'ambiguous trunk short-working evidence is excluded from principal populations');
assert.ok(transitiveBridgeRows.some(row => row.ambiguousServiceSummaries.some(service => service.id === 'transitive-trunk-short')), 'ambiguous trunk short-working source remains auditable as retained evidence');

const permutationSignature = rows => rows.map(row => ({
  destination: row.destination,
  frequency: row.typicalFrequencyText,
  operating: row.operatingPeriodLines,
  principalIds: row.rawServiceSummaries.map(service => service.id).sort()
})).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
const transitiveServices = transitiveBridgeRows.flatMap(row => [...row.rawServiceSummaries, ...row.ambiguousServiceSummaries]);
const transitivePermutations = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]
].map(order => buildPlannerBusServiceSummaries(order.map(index => transitiveServices[index]), branchStops));
assert.equal(new Set(transitivePermutations.map(rows => JSON.stringify(permutationSignature(rows)))).size, 1, 'all six branch/short-working permutations are order-invariant');

const markerlessBridge = record({ id: 'markerless-ambiguous-bridge', routeNumber: 'MARKERLESS-BRIDGE', routeId: 'markerless-bridge-line', directionId: '', origin: 'Hub', destination: '', direction: '', pattern: ['A', 'COMMON-A', 'COMMON-B'], patternNames: ['Hub', 'Common A', 'Common B'] });
delete markerlessBridge.directionFamily;
const markerlessBridgeServices = [
  record({ id: 'markerless-branch-north', routeNumber: 'MARKERLESS-BRIDGE', routeId: 'markerless-bridge-line', origin: 'Hub', destination: 'North Terminal', direction: 'outbound', pattern: ['A', 'COMMON-A', 'COMMON-B', 'NORTH-A', 'NORTH-TERM'], patternNames: ['Hub', 'Common A', 'Common B', 'North A', 'North Terminal'] }),
  record({ id: 'markerless-branch-east', routeNumber: 'MARKERLESS-BRIDGE', routeId: 'markerless-bridge-line', origin: 'Hub', destination: 'East Terminal', direction: 'outbound', pattern: ['A', 'COMMON-A', 'COMMON-B', 'EAST-A', 'EAST-TERM'], patternNames: ['Hub', 'Common A', 'Common B', 'East A', 'East Terminal'] }),
  markerlessBridge
];
const markerlessBridgeRows = rows(markerlessBridgeServices);
assert.equal(markerlessBridgeRows.length, 2, 'ambiguous markerless connector does not create a third principal row');
assert.ok(markerlessBridgeRows.some(row => row.ambiguousServiceSummaries.some(service => service.id === markerlessBridge.id)), 'ambiguous markerless connector remains retained evidence');
const markerlessPermutations = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
  .map(order => rows(order.map(index => markerlessBridgeServices[index])));
assert.equal(new Set(markerlessPermutations.map(permutation => JSON.stringify(permutationSignature(permutation)))).size, 1, 'all six markerless bridge permutations remain order-invariant');

const idSameNamesDifferent = rows([
  record({ id: 'id1-a', routeNumber: 'ID-1', routeId: 'id1', pattern: ['ID-HUB', 'ID-MID', 'ID-TERM'], patternNames: ['Hub', 'High Street', 'Terminal'] }),
  record({ id: 'id1-b', routeNumber: 'ID-1', routeId: 'id1', pattern: ['ID-HUB', 'ID-MID', 'ID-TERM'], patternNames: ['Hub', 'Main Road', 'Terminus'] })
]);
assert.equal(idSameNamesDifferent.length, 1, 'same physical IDs remain one row despite differing names');
const idDifferentProvidersSameNames = rows([
  record({ id: 'id2-a', routeNumber: 'ID-2', routeId: 'id2-a', pattern: ['P1-HUB', 'P1-MID', 'P1-TERM'], patternNames: ['Hub', 'High Street', 'Terminal'] }),
  record({ id: 'id2-b', routeNumber: 'ID-2', routeId: 'id2-b', pattern: ['P2-HUB', 'P2-MID', 'P2-TERM'], patternNames: ['Hub', 'High Street', 'Terminal'] })
]);
assert.equal(idDifferentProvidersSameNames.length, 1, 'different provider IDs fall back to equivalent names');
const idComparableBranch = rows([
  record({ id: 'id3-north', routeNumber: 'ID-3', routeId: 'id3', pattern: ['ID-HUB', 'ID-COMMON-A', 'ID-COMMON-B', 'ID-NORTH', 'ID-NORTH-TERM'], patternNames: ['Hub', 'Common A', 'Common B', 'North', 'North Terminal'], destination: 'North Terminal' }),
  record({ id: 'id3-east', routeNumber: 'ID-3', routeId: 'id3', pattern: ['ID-HUB', 'ID-COMMON-A', 'ID-COMMON-B', 'ID-EAST', 'ID-EAST-TERM'], patternNames: ['Hub', 'Common A', 'Common B', 'East', 'East Terminal'], destination: 'East Terminal' })
]);
assert.equal(idComparableBranch.length, 2, 'comparable physical IDs preserve a genuine branch');
const idSameEndpointsDifferentInternal = rows([
  record({ id: 'id4-north', routeNumber: 'ID-4', routeId: 'id4', pattern: ['ID-HUB', 'ID-NORTH-A', 'ID-NORTH-B', 'ID-TERM'], patternNames: ['Hub', 'North A', 'North B', 'Terminal'], destination: 'Terminal' }),
  record({ id: 'id4-east', routeNumber: 'ID-4', routeId: 'id4', pattern: ['ID-HUB', 'ID-EAST-A', 'ID-EAST-B', 'ID-TERM'], patternNames: ['Hub', 'East A', 'East B', 'Terminal'], destination: 'Terminal' })
]);
assert.equal(idSameEndpointsDifferentInternal.length, 2, 'same endpoint IDs do not collapse distinct internal corridors');

const convergingBranchRows = buildPlannerBusServiceSummaries([
  record({
    id: 'converging-north',
    routeNumber: 'CONVERGING-BRANCH',
    routeId: 'converging-line',
    origin: 'North Terminal',
    destination: 'Hub',
    direction: 'inbound',
    stopIds: ['NORTH-TERM', 'NORTH-B', 'NORTH-A', 'COMMON-B', 'COMMON-A', 'A'],
    basis: 'A',
    pattern: ['NORTH-TERM', 'NORTH-B', 'NORTH-A', 'COMMON-B', 'COMMON-A', 'A'],
    principalLocations: ['North Terminal', 'North B', 'North A', 'Common B', 'Common A', 'Hub'],
    patternNames: ['North Terminal', 'North B', 'North A', 'Common B', 'Common A', 'Hub']
  }),
  record({
    id: 'converging-east',
    routeNumber: 'CONVERGING-BRANCH',
    routeId: 'converging-line',
    origin: 'East Terminal',
    destination: 'Hub',
    direction: 'inbound',
    stopIds: ['EAST-TERM', 'EAST-B', 'EAST-A', 'COMMON-B', 'COMMON-A', 'A'],
    basis: 'A',
    pattern: ['EAST-TERM', 'EAST-B', 'EAST-A', 'COMMON-B', 'COMMON-A', 'A'],
    principalLocations: ['East Terminal', 'East B', 'East A', 'Common B', 'Common A', 'Hub'],
    patternNames: ['East Terminal', 'East B', 'East A', 'Common B', 'Common A', 'Hub']
  })
], branchStops);
assert.equal(convergingBranchRows.length, 2, 'converging branches with a common suffix remain separate');

const sameEndpointCorridorRows = buildPlannerBusServiceSummaries([
  record({
    id: 'same-endpoint-north',
    routeNumber: 'SAME-ENDPOINT',
    routeId: 'same-endpoint-line',
    origin: 'Hub',
    destination: 'Terminal',
    direction: 'outbound',
    stopIds: ['A', 'NORTH-A', 'NORTH-B', 'NORTH-C', 'NORTH-TERM'],
    basis: 'A',
    pattern: ['A', 'NORTH-A', 'NORTH-B', 'NORTH-C', 'NORTH-TERM'],
    principalLocations: ['Hub', 'North A', 'North B', 'Terminal'],
    patternNames: ['Hub', 'North A', 'North B', 'North C', 'Terminal']
  }),
  record({
    id: 'same-endpoint-east',
    routeNumber: 'SAME-ENDPOINT',
    routeId: 'same-endpoint-line',
    origin: 'Hub',
    destination: 'Terminal',
    direction: 'outbound',
    stopIds: ['A', 'EAST-A', 'EAST-B', 'EAST-C', 'EAST-TERM'],
    basis: 'A',
    pattern: ['A', 'EAST-A', 'EAST-B', 'EAST-C', 'EAST-TERM'],
    principalLocations: ['Hub', 'East A', 'East B', 'Terminal'],
    patternNames: ['Hub', 'East A', 'East B', 'East C', 'Terminal']
  })
], branchStops);
assert.equal(sameEndpointCorridorRows.length, 2, 'same endpoints do not collapse materially different corridors');

const sameEndpointShortWorkingRows = buildPlannerBusServiceSummaries([
  record({
    id: 'same-endpoint-full',
    routeNumber: 'SAME-ENDPOINT-CONTROL',
    routeId: 'same-endpoint-control-line',
    origin: 'Hub',
    destination: 'Terminal',
    direction: 'outbound',
    stopIds: ['A', 'NORTH-A', 'NORTH-B', 'NORTH-TERM'],
    basis: 'A',
    pattern: ['A', 'NORTH-A', 'NORTH-B', 'NORTH-TERM'],
    principalLocations: ['Hub', 'North A', 'North B', 'Terminal'],
    patternNames: ['Hub', 'North A', 'North B', 'Terminal']
  }),
  record({
    id: 'same-endpoint-short',
    routeNumber: 'SAME-ENDPOINT-CONTROL',
    routeId: 'same-endpoint-control-line',
    origin: 'Hub',
    destination: 'Terminal',
    direction: 'outbound',
    stopIds: ['A', 'NORTH-A', 'NORTH-TERM'],
    basis: 'A',
    pattern: ['A', 'NORTH-A', 'NORTH-TERM'],
    principalLocations: ['Hub', 'North A', 'Terminal'],
    patternNames: ['Hub', 'North A', 'Terminal']
  })
], branchStops);
assert.equal(sameEndpointShortWorkingRows.length, 1, 'same-corridor endpoint short working remains one planner row');

const shortWorkingRows = buildPlannerBusServiceSummaries([
  record({ id: 'short-main', routeNumber: 'SHORT-BRANCH', routeId: 'short-line', origin: 'Hub', destination: 'North Terminal', direction: 'outbound', pattern: ['A', 'COMMON-A', 'COMMON-B', 'NORTH-A', 'NORTH-TERM'], patternNames: ['Hub', 'Common A', 'Common B', 'North A', 'North Terminal'] }),
  record({ id: 'short-working', routeNumber: 'SHORT-BRANCH', routeId: 'short-line', origin: 'Hub', destination: 'North A', direction: 'outbound', pattern: ['A', 'COMMON-A', 'COMMON-B', 'NORTH-A'], patternNames: ['Hub', 'Common A', 'Common B', 'North A'] })
], stops);
assert.equal(shortWorkingRows.length, 1, 'an ordered-subsequence short working remains within the principal direction row');
assert.match(`${shortWorkingRows[0].serviceNote} ${shortWorkingRows[0].routeGroupNote || ''}`, /short workings|variants/i);

const markerlessOpposites = rows([
  record({ id: 'forward', routeNumber: 'MD', routeId: 'markerless', directionId: undefined, direction: '', origin: 'A Terminal', destination: 'B Terminal', pattern: ['A', 'MID', 'B'] }),
  record({ id: 'reverse', routeNumber: 'MD', routeId: 'markerless', directionId: undefined, direction: '', origin: 'B Terminal', destination: 'A Terminal', pattern: ['B', 'MID', 'A'] })
]);
assert.equal(markerlessOpposites.length, 2, 'reverse endpoint and pattern evidence keeps directions separate without markers');

const unresolved = rows([record({ id: 'unresolved', routeNumber: 'Q', direction: '', destination: 'Destination not resolved', origin: 'Unknown', pattern: [] })]);
assert.equal(unresolved.length, 0, 'unresolved route identity is not promoted to a planner row');

console.log('PASS Alpha.15 adversarial PlannerServiceGroup coverage: operators, variants, served stops, timetable basis, physical journeys, calendars, circular controls, corridors and unresolved identities.');
