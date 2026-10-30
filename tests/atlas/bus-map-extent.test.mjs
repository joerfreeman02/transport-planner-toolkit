import assert from 'node:assert/strict';
import { buildAssessmentMapExtent } from '../../src/atlas/presentation/bus-map-extent.mjs';

const site = { latitude: 51.86, longitude: -0.45 };
const small = buildAssessmentMapExtent({ site, stops: [{ latitude: 51.861, longitude: -0.451 }], radiusMetres: 400 });
assert.ok(small[0].latitude < site.latitude - 0.003);
assert.ok(small[1].latitude > site.latitude + 0.003);
assert.ok(small[0].longitude < site.longitude - 0.005);
assert.ok(small[1].longitude > site.longitude + 0.005);
assert.deepEqual(buildAssessmentMapExtent({ site, stops: [{ latitude: 51.861, longitude: -0.451 }], radiusMetres: 400 }), small, 'small-stop-set framing is deterministic');

const medium = buildAssessmentMapExtent({ site, stops: Array.from({ length: 8 }, (_, index) => ({ latitude: 51.85 + index * 0.002, longitude: -0.46 + index * 0.002 })), radiusMetres: 700 });
assert.ok(medium[0].latitude <= 51.85 && medium[1].latitude >= 51.864);
assert.ok(medium[0].longitude <= -0.46 && medium[1].longitude > -0.446);

const spread = buildAssessmentMapExtent({ site, stops: [{ latitude: 51.83, longitude: -0.49 }, { latitude: 51.89, longitude: -0.41 }], radiusMetres: 700 });
assert.ok(spread[0].latitude <= 51.83 && spread[1].latitude >= 51.89);
assert.ok(spread[0].longitude <= -0.49 && spread[1].longitude >= -0.41);
assert.throws(() => buildAssessmentMapExtent({ site: { latitude: 'bad', longitude: 0 } }), /valid assessment point/);
console.log('PASS deterministic assessment map extent includes site, selected stops and radius for small, medium and spread stop sets.');
