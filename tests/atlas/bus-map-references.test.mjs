import assert from 'node:assert/strict';
import { withNumericMapReferences } from '../../src/atlas/presentation/bus-map-references.mjs';

const result = {
  ok: true,
  stops: [
    { id: 'naptan-1', mapReference: 'C', name: 'High Street', routes: ['12'] },
    { id: 'naptan-2', mapReference: 'F', name: 'Station Road', routes: ['12'] },
    { id: 'other-1', mapReference: 'H', name: 'Rail stop', transportMode: 'rail', routes: [] }
  ],
  plannerServiceSummaries: [{ servedAtText: 'High Street [C]\nStation Road [F]', servedAtStops: ['High Street [C]', 'Station Road [F]'], timetableBasisStopLabel: 'Station Road [F]*' }]
};

const view = withNumericMapReferences(result);
assert.deepEqual(view.stops.map(stop => stop.displayMapReference), ['1', '2', '3']);
assert.deepEqual(view.plannerServiceSummaries[0].servedAtStops, ['High Street [1]', 'Station Road [2]']);
assert.equal(view.plannerServiceSummaries[0].timetableBasisStopLabel, 'Station Road [2]*');
assert.deepEqual(result.stops.map(stop => stop.mapReference), ['C', 'F', 'H'], 'canonical assessment references remain unchanged');
assert.equal(result.plannerServiceSummaries[0].servedAtText, 'High Street [C]\nStation Road [F]', 'canonical service summaries remain unchanged');

const selected = withNumericMapReferences({ stops: [result.stops[1]] }, { referenceStops: result.stops });
assert.equal(selected.stops[0].displayMapReference, '2', 'report subset keeps the same map reference as the full browser assessment');
console.log('PASS Numeric map references are deterministic presentation views and do not mutate canonical assessment evidence.');
