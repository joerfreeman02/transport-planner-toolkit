import assert from 'node:assert/strict';
import { withNumericMapReferences } from '../../src/atlas/presentation/bus-map-references.mjs';

const result = {
  ok: true,
  stops: [
    { id: 'naptan-1', mapReference: 'C', name: 'High Street', routes: ['12'] },
    { id: 'naptan-2', mapReference: 'F', name: 'Station Road', routes: ['12'] },
    { id: 'other-1', mapReference: 'H', name: 'Rail stop', transportMode: 'rail', routes: [] }
  ],
  plannerServiceSummaries: [{ servedAtText: 'High Street [C]\nStation Road [F]\nUnmapped stop [12]', servedAtStops: ['High Street [C]', 'Station Road [F]', 'Unmapped stop [12]'], timetableBasisStopLabel: 'Station Road [F]*', servedStopEvidence: [{ id: 'external', label: 'Outside set [17]' }] }]
};

const view = withNumericMapReferences(result);
assert.deepEqual(view.stops.map(stop => stop.displayMapReference), ['1', '2', '3']);
assert.deepEqual(view.plannerServiceSummaries[0].servedAtStops, ['High Street [1]', 'Station Road [2]', 'Unmapped stop']);
assert.equal(view.plannerServiceSummaries[0].timetableBasisStopLabel, 'Station Road [2]*');
assert.equal(view.plannerServiceSummaries[0].servedAtText, 'High Street [1]\nStation Road [2]\nUnmapped stop');
assert.equal(view.plannerServiceSummaries[0].servedAtStops[2], 'Unmapped stop');
assert.deepEqual(view.plannerServiceSummaries[0].servedStopEvidence[0], { id: 'external', label: 'Outside set', mapReference: null });
assert.deepEqual(result.stops.map(stop => stop.mapReference), ['C', 'F', 'H'], 'canonical assessment references remain unchanged');
assert.equal(result.plannerServiceSummaries[0].servedAtText, 'High Street [C]\nStation Road [F]\nUnmapped stop [12]', 'canonical service summaries remain unchanged');

const selected = withNumericMapReferences({ stops: [result.stops[1]] }, { referenceStops: result.stops });
assert.equal(selected.stops[0].displayMapReference, '2', 'report subset keeps the same map reference as the full browser assessment');
const selectedOnly = withNumericMapReferences({
  stops: [result.stops[0]],
  plannerServiceSummaries: [{ servedAtText: 'Station Road [F]', servedAtStops: ['Station Road [F]'] }]
}, { referenceStops: [{ ...result.stops[0] }] });
assert.equal(selectedOnly.plannerServiceSummaries[0].servedAtText, 'Station Road');
assert.deepEqual(selectedOnly.plannerServiceSummaries[0].servedAtStops, ['Station Road'], 'a row cannot retain a bracketed reference for a stop omitted from the export table');
console.log('PASS Numeric map references are deterministic presentation views and do not mutate canonical assessment evidence.');
