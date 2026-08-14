import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const moduleRoot = new URL('../', import.meta.url);
vm.runInThisContext(fs.readFileSync(new URL('assets/vendor/proj4.js', moduleRoot), 'utf8'));

const { BUILD } = await import('../assets/js/config.js');
const crs = await import('../assets/js/crs.js');
crs.configureProj4(globalThis.proj4);
const geometry = await import('../assets/js/geometry.js');
const scale = await import('../assets/js/scale-engine.js');
const { DRAWING_MODES } = await import('../assets/js/drawing-modes.js');
const railway = await import('../assets/js/railway-adapter.js');
const acceptedRailway = await import('../../railway/assets/js/rail-knowledge.js');
const { createOverlayStore, normaliseOverlay } = await import('../assets/js/overlay-store.js');
const source = await import('../assets/js/source-adapter.js');
const { renderDrawingSvg } = await import('../assets/js/svg-renderer.js');

let passed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); passed += 1; }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); throw error; }
}

const ring = [
  [-0.101, 51.5], [-0.099, 51.5], [-0.099, 51.502], [-0.101, 51.502], [-0.101, 51.5]
];
const hole = [
  [-0.1006, 51.5004], [-0.0994, 51.5004], [-0.0994, 51.5016], [-0.1006, 51.5016], [-0.1006, 51.5004]
];
const site = { type: 'Polygon', coordinates: [ring] };

await test('Polygon import is accepted', () => assert.deepEqual(geometry.extractSiteGeometry({ type: 'Feature', properties: {}, geometry: site }), site));
await test('Polygon holes are preserved', () => assert.equal(geometry.extractSiteGeometry({ type: 'Polygon', coordinates: [ring, hole] }).coordinates.length, 2));
await test('MultiPolygon import is accepted', () => {
  const multi = { type: 'MultiPolygon', coordinates: [[ring], [[ring.map(([x, y]) => [x + .01, y])][0]]] };
  assert.equal(geometry.extractSiteGeometry(multi).type, 'MultiPolygon');
});
await test('an address Point is never accepted as a boundary', () => assert.throws(() => geometry.extractSiteGeometry({ type: 'Point', coordinates: [-.1, 51.5] }), /Polygon, MultiPolygon/));
await test('malformed and self-intersecting boundaries are rejected', () => {
  assert.throws(() => geometry.extractSiteGeometry({ type: 'Polygon', coordinates: [[[-.1, 51.5], [-.09, 51.51], [-.1, 51.51], [-.09, 51.5], [-.1, 51.5]]] }), /self-intersect/);
  assert.throws(() => geometry.extractSiteGeometry({ type: 'Polygon', coordinates: [[[-.1, 51.5], [-.09, 51.5]]] }), /four coordinate/);
});
await test('line overlays validate independently of boundaries', () => assert.equal(geometry.validateGeometry({ type: 'MultiLineString', coordinates: [[[-.1, 51.5], [-.09, 51.51]]] }).type, 'MultiLineString'));

await test('EPSG:27700 definition applies the OSGB36 datum transformation', () => {
  const [lon, lat] = crs.bngToWgs84([651409.903, 313177.270]);
  assert.ok(Math.abs(lon - 1.716052) <= .000002, `${lon}`);
  assert.ok(Math.abs(lat - 52.657979) <= .000002, `${lat}`);
});
await test('forward and inverse coordinate transforms are finite', () => {
  const projected = crs.wgs84ToBng([-.1276, 51.5072]);
  assert.ok(projected.easting > 529000 && projected.easting < 531000);
  assert.ok(projected.northing > 179000 && projected.northing < 182000);
  assert.ok(crs.roundTripErrorMetres([-.1276, 51.5072]) < .02);
});

await test('1:50,000 scale relationships are exact', () => {
  assert.equal(scale.paperMmToGroundMetres(1, 50000), 50);
  assert.equal(scale.paperMmToGroundMetres(20, 50000), 1000);
  assert.equal(scale.scaleBarForMode('regional-plan').paperMm, 20);
});
await test('1:2,500 scale relationships are exact', () => {
  assert.equal(scale.paperMmToGroundMetres(1, 2500), 2.5);
  assert.equal(scale.paperMmToGroundMetres(20, 2500), 50);
  assert.equal(scale.scaleBarForMode('local-context').paperMm, 20);
});
await test('map-frame ground extents derive from physical dimensions', () => {
  const regional = scale.extentForDrawing({ easting: 530000, northing: 180000 }, 'regional-plan');
  const local = scale.extentForDrawing({ easting: 530000, northing: 180000 }, 'local-context');
  assert.deepEqual([regional.groundWidth, regional.groundHeight], [16800, 12250]);
  assert.deepEqual([local.groundWidth, local.groundHeight], [795, 712.5]);
});

await test('all four drawing modes are independently configured', () => assert.deepEqual(Object.keys(DRAWING_MODES), ['regional-plan', 'regional-routing', 'local-context', 'local-routing']));
await test('regional and local mode scales remain fixed', () => {
  assert.equal(DRAWING_MODES['regional-routing'].scale, 50000);
  assert.equal(DRAWING_MODES['local-routing'].scale, 2500);
});

for (const [name, tags] of [
  ['National Rail', { railway: 'station', network: 'National Rail' }],
  ['London Overground', { railway: 'station', network: 'London Overground' }],
  ['London Underground', { railway: 'station', station: 'subway', network: 'London Underground' }],
  ['DLR', { railway: 'station', network: 'Docklands Light Railway' }],
  ['Tram/light rail', { railway: 'tram_stop', network: 'Tramlink' }]
]) await test(`Railway mode equivalence: ${name}`, () => {
  assert.equal(railway.hasRailEvidence(tags), acceptedRailway.hasRailEvidence(tags));
  assert.equal(railway.modeForTags(tags), acceptedRailway.modeForTags(tags));
  assert.equal(railway.modeForTags(tags), name);
});

await test('overlay import, edit, visibility and delete are deterministic', () => {
  const store = createOverlayStore();
  const added = store.add({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-.1, 51.5], [-.09, 51.51]] } }, { className: 'route-to-site', colour: '#ed1c24', label: 'TO SITE' });
  assert.equal(store.list().length, 1);
  store.update(added.id, { label: 'EDITED', visible: false });
  assert.equal(store.get(added.id).properties.label, 'EDITED');
  assert.equal(store.get(added.id).properties.visible, false);
  assert.equal(store.remove(added.id), true);
  assert.equal(store.list().length, 0);
});
await test('unsupported overlay class/geometry combinations are rejected', () => assert.throws(() => normaliseOverlay({ type: 'Point', coordinates: [-.1, 51.5] }, { className: 'route-to-site', colour: '#ed1c24' }), /does not support/));
await test('unsupported arbitrary colours are rejected', () => assert.throws(() => normaliseOverlay({ type: 'Point', coordinates: [-.1, 51.5] }, { className: 'community', colour: '#abcdef' }), /controlled drawing palette/));

const response = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
const extent = scale.extentForDrawing({ easting: 530000, northing: 180000 }, 'regional-plan');
await test('true zero-feature source response remains distinguishable', async () => {
  const adapter = new source.OverpassTransportAdapter({ endpoints: ['https://example.test'], fetchImpl: async () => response({ elements: [] }) });
  const result = await adapter.retrieve('regional-plan', extent, 'TEST');
  assert.equal(result.status, 'zero'); assert.equal(result.snapshot.rawFeatureCount, 0);
});
await test('network source failure is not interpreted as zero', async () => {
  const adapter = new source.OverpassTransportAdapter({ endpoints: ['https://example.test'], fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(adapter.retrieve('regional-plan', extent, 'TEST'), error => error.kind === 'all-providers-failed' && error.details.failures[0].kind === 'network');
});
await test('source timeout is distinguishable', async () => {
  const adapter = new source.OverpassTransportAdapter({ timeoutMs: 5, endpoints: ['https://example.test'], fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
  await assert.rejects(adapter.retrieve('regional-plan', extent, 'TEST'), error => error.details.failures[0].kind === 'timeout');
});
await test('malformed source response is distinguishable', async () => {
  const adapter = new source.OverpassTransportAdapter({ endpoints: ['https://example.test'], fetchImpl: async () => response({ wrong: [] }) });
  await assert.rejects(adapter.retrieve('regional-plan', extent, 'TEST'), error => error.details.failures[0].kind === 'malformed');
});
await test('ambiguous waterway evidence is retained as review-only', () => {
  const result = source.classifyOverpassElement({ type: 'way', id: 1, tags: { waterway: 'river', name: 'Test River' }, geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }] });
  assert.equal(result[0].properties.class, 'waterway-review');
});
await test('structured source query includes required transport evidence', () => {
  const query = source.buildOverpassQuery('local-context', extent);
  for (const marker of ['highway', 'railway', 'waterway', 'route"="bicycle', 'route"="bus', 'amenity']) assert.match(query, new RegExp(marker));
});

const sourceFeatures = [
  { type: 'Feature', properties: { class: 'main-road', ref: 'A1' }, geometry: { type: 'LineString', coordinates: [[-.2, 51.45], [0, 51.55]] } },
  { type: 'Feature', properties: { class: 'station-underground', name: 'Test Station' }, geometry: { type: 'Point', coordinates: [-.1, 51.5] } }
];
for (const modeId of Object.keys(DRAWING_MODES)) await test(`${modeId} renders one deterministic SVG`, () => {
  const result = renderDrawingSvg({ modeId, centerBng: { easting: 530000, northing: 180000 }, site, sourceFeatures, overlays: [], sourceStatus: 'success' });
  assert.match(result.markup, /<svg[^>]+data-scale=/);
  assert.match(result.markup, /class="scale-bar" data-paper-mm="20"/);
  assert.match(result.markup, /north-arrow/);
  assert.equal((result.markup.match(/<svg/g) || []).length, 1);
});

await test('retained overlays are isolated to appropriate drawing modes', () => {
  const centerBng = crs.wgs84ToBng([-.1, 51.5]);
  const all = [
    normaliseOverlay({ type: 'LineString', coordinates: [[-.101, 51.5], [-.099, 51.501]] }, { className: 'route-to-site' }),
    normaliseOverlay({ type: 'LineString', coordinates: [[-.101, 51.501], [-.099, 51.5]] }, { className: 'bus-route' }),
    normaliseOverlay({ type: 'Point', coordinates: [-.1, 51.5] }, { className: 'community' })
  ];
  const regionalPlan = renderDrawingSvg({ modeId: 'regional-plan', centerBng, overlays: all }).markup;
  const regionalRouting = renderDrawingSvg({ modeId: 'regional-routing', centerBng, overlays: all }).markup;
  const localContext = renderDrawingSvg({ modeId: 'local-context', centerBng, overlays: all }).markup;
  const localRouting = renderDrawingSvg({ modeId: 'local-routing', centerBng, overlays: all }).markup;
  assert.doesNotMatch(regionalPlan, /layer-(route-to-site|bus-route|community)/);
  assert.match(regionalRouting, /layer-route-to-site/);
  assert.doesNotMatch(regionalRouting, /layer-(bus-route|community)/);
  assert.match(localContext, /layer-bus-route/); assert.match(localContext, /layer-community/); assert.doesNotMatch(localContext, /layer-route-to-site/);
  assert.match(localRouting, /layer-route-to-site/); assert.match(localRouting, /layer-community/); assert.doesNotMatch(localRouting, /layer-bus-route/);
});

await test('A3 sheet contains title block, map frame, current logo, legend, attribution and build', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../assets/css/drawing-generator.css', import.meta.url), 'utf8');
  for (const marker of ['id="drawingSheet"', 'id="sheetMap"', 'id="sheetLegend"', 'assets/images/eas-primary.png', 'sheetAttribution', BUILD]) assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(css, /@page\s*\{\s*size:A3 landscape;\s*margin:0;/);
  assert.match(css, /width:420mm;\s*height:297mm/);
});

console.log(`\n${passed} Drawing Generator tests passed.`);
