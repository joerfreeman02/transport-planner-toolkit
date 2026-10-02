import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import {
  inspectCircularPattern,
  resolveCircularServiceDecision
} from '../../src/atlas/domain/circular-service-decision.mjs';

const stop = (id, stopAreaId = id, name = id) => ({ id, stopAreaId, name });

const trueLoop = inspectCircularPattern({
  routeNumber: 'TRUE',
  routePatternStops: [stop('A'), stop('B'), stop('C'), stop('D'), stop('A')]
});
assert.equal(trueLoop.classification, 'circular');
assert.equal(trueLoop.loopClosureEvidence.proven, true);
assert.ok(trueLoop.repeatedStopsOrPlaces.some(item => item.positions.join(',') === '0,4'));

const differentStands = inspectCircularPattern({
  routeNumber: 'STANDS',
  routePatternStops: [stop('A-1', 'AREA-A'), stop('B', 'AREA-B'), stop('A-2', 'AREA-A')]
});
assert.equal(differentStands.classification, 'circular');
assert.equal(differentStands.loopClosureEvidence.samePhysicalStopPoint, false);
assert.equal(differentStands.loopClosureEvidence.sameAuthoritativeStopArea, true);

const reverse = inspectCircularPattern({ routeNumber: 'REV', routePatternStops: [stop('A'), stop('B'), stop('C')] });
const reverseBack = inspectCircularPattern({ routeNumber: 'REV', routePatternStops: [stop('C'), stop('B'), stop('A')] });
assert.equal(reverse.classification, 'linear');
assert.equal(reverseBack.classification, 'linear');

const outAndBack = inspectCircularPattern({ routeNumber: 'BACK', routePatternStops: [stop('A'), stop('B'), stop('C'), stop('B'), stop('A')] });
assert.equal(outAndBack.classification, 'out-and-back');

const partial = inspectCircularPattern({ routeNumber: 'PARTIAL', routePatternStops: [stop('A'), stop('B'), stop('C'), stop('D'), stop('B'), stop('E')] });
assert.equal(partial.classification, 'partial-loop');

const oriented = inspectCircularPattern({ routeNumber: 'CLOCK', orientation: 'clockwise', routePatternStops: [stop('A'), stop('B'), stop('C'), stop('A')] });
assert.equal(oriented.classification, 'circular');
assert.equal(oriented.orientation, 'clockwise');
const unoriented = inspectCircularPattern({ routeNumber: 'NO-DIRECTION', routePatternStops: [stop('A'), stop('B'), stop('C'), stop('A')] });
assert.equal(unoriented.classification, 'circular');
assert.equal(unoriented.orientation, null);

const sameNameDifferentIdentity = inspectCircularPattern({
  routeNumber: 'NAME',
  circular: true,
  routePatternStops: [stop('A', 'AREA-A', 'Same locality'), stop('B', 'AREA-B', 'Middle'), stop('C', 'AREA-C', 'Same locality')]
});
assert.equal(sameNameDifferentIdentity.classification, 'linear');

const branch = { id: 'branch', routeNumber: 'VAR', routePatternStops: [stop('A'), stop('B'), stop('X')] };
const principal = { id: 'principal', routeNumber: 'VAR', routePatternStops: [stop('A'), stop('B'), stop('C'), stop('A')] };
const containedShort = { id: 'short', routeNumber: 'VAR', routePatternStops: [stop('A'), stop('B'), stop('C')] };
const variants = resolveCircularServiceDecision([principal, branch, containedShort], { principal });
assert.equal(variants.classification, 'circular');
assert.equal(variants.branchEvidence.length, 1);
assert.equal(variants.shortWorkingEvidence.length, 1);
assert.equal(variants.variantClassifications[1].variantClassification, 'genuine branch / Additional service');
assert.equal(variants.variantClassifications[2].variantClassification, 'contained Short working');

const assertedOnly = inspectCircularPattern({ routeNumber: 'ASSERTED', circular: true, origin: 'Same', destination: 'Same', orderedPatternEndpoints: ['A', 'A'] });
assert.equal(assertedOnly.classification, 'unresolved-review');

const waltham = JSON.parse(fs.readFileSync(new URL('./fixtures/bus-group-1d-waltham-runtime.json', import.meta.url), 'utf8'));
const walthamRows = buildPlannerBusServiceSummaries(waltham.serviceSummaries, waltham.stops);
for (const route of ['16', '16C']) {
  const row = walthamRows.find(candidate => candidate.routeNumber === route);
  assert.ok(row, `${route} row remains present`);
  assert.equal(row.circular, false, `${route} does not expose provisional circular presentation`);
  assert.equal(row.circularServiceDecision.classification, 'unresolved-review');
  assert.equal(row.plannerNotes.circularService, null);
}
const row16c = walthamRows.find(candidate => candidate.routeNumber === '16C');
assert.ok(row16c.plannerNotes.additionalServices);
assert.equal(row16c.plannerNotes.shortWorkings, null, 'the incomplete same-destination evidence has one planner category');

const pipers230 = {
  id: 'south_east:118723:0:b7eada5524c4',
  routeNumber: '230',
  operator: 'Centrebus',
  origin: 'Lyons Community Centre',
  destination: 'Lyons Community Centre',
  circular: true,
  source: { region: 'south_east', routeId: '118723' },
  principalLocations: ['Luton Airport Parkway Rail Station', 'Luton Station Interchange', 'Woodside']
};
const pipersDecision = inspectCircularPattern(pipers230);
assert.equal(pipersDecision.classification, 'unresolved-review');
assert.match(pipersDecision.reason, /complete ordered StopPoint\/StopArea pattern/i);

const wordingRow = buildPlannerBusServiceSummaries([{
  id: 'word-loop', routeNumber: 'WORD', operator: 'Example', origin: 'A', destination: 'A', direction: 'Clockwise',
  routePatternStopIds: ['A', 'B', 'C', 'A'], routePatternStops: [stop('A', 'A', 'A'), stop('B', 'B', 'B'), stop('C', 'C', 'C'), stop('A', 'A', 'A')],
  stopIds: ['A'], frequencyBasisStopId: 'A', departuresByDay: Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day, [420]])),
  departureEvidenceByDay: Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day, [{ minute: 420, stopPointId: 'A', journeyIdentity: `${day}-word` }]])),
  sourceRecordIds: ['word-loop'], principalLocations: ['B'], circular: true
}], [{ id: 'A', name: 'A', walking: { status: 'routed', distanceMetres: 10 } }])[0];
assert.equal(wordingRow.circularServiceDecision.classification, 'circular');
assert.match(wordingRow.plannerNotes.circularService, /^Route WORD operates as a circular service via B and C\.$/);
const word = buildBusWordTables({ ok: true, stops: [], plannerServiceSummaries: [wordingRow], reviewItems: [] });
const wordText = word.flatMap(table => table.rows).map(row => Array.isArray(row) ? row.join(' ') : row.text || '').join('\n');
assert.match(wordText, new RegExp(wordingRow.plannerNotes.circularService.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

console.log('PASS BUS-CIRC deterministic circular, variant, Waltham and Pipers controls');
