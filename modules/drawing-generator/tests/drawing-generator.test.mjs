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
const cartography = await import('../assets/js/cartography.js');
const basemap = await import('../assets/js/basemap-compositor.js');
const { renderDrawingSvg } = await import('../assets/js/svg-renderer.js');
const routeGeometry = await import('../assets/js/route-geometry.js');
const routeSnap = await import('../assets/js/route-snap-adapter.js');
const sourceReview = await import('../assets/js/source-review.js');
const community = await import('../assets/js/community-association.js');
const presentation = await import('../assets/js/presentation-controls.js');

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
await test('interactive issued-area footprint is derived from the exact PDF extent engine', () => {
  const center = { easting: 530000, northing: 180000 };
  for (const [modeId, expected] of [['regional-routing', [16800, 12250, 50000]], ['local-routing', [795, 712.5, 2500]]]) {
    const extent = scale.extentForDrawing(center, modeId);
    const feature = scale.issuedExtentGeoJson(center, modeId);
    assert.deepEqual([feature.properties.groundWidth, feature.properties.groundHeight, feature.properties.scale], expected);
    const projected = feature.geometry.coordinates[0].map(crs.wgs84ToBng);
    assert.ok(Math.abs(Math.min(...projected.map(point => point.easting)) - extent.minE) < .03);
    assert.ok(Math.abs(Math.max(...projected.map(point => point.easting)) - extent.maxE) < .03);
    assert.ok(Math.abs(Math.min(...projected.map(point => point.northing)) - extent.minN) < .03);
    assert.ok(Math.abs(Math.max(...projected.map(point => point.northing)) - extent.maxN) < .03);
  }
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
await test('unsupported arbitrary colours are rejected', () => assert.throws(() => normaliseOverlay({ type: 'Polygon', coordinates: [[[-.1, 51.5], [-.099, 51.5], [-.099, 51.501], [-.1, 51.5]]] }, { className: 'community', colour: '#abcdef' }), /controlled drawing palette/));
await test('community facilities cannot be stored as generic points', () => assert.throws(() => normaliseOverlay({ type: 'Point', coordinates: [-.1, 51.5] }, { className: 'community' }), /does not support Point/));

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
await test('a canal requires explicit boat evidence before it is styled as navigable', () => {
  const unconfirmed = source.classifyOverpassElement({ type: 'way', id: 2, tags: { waterway: 'canal' }, geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }] });
  const confirmed = source.classifyOverpassElement({ type: 'way', id: 3, tags: { waterway: 'canal', boat: 'yes' }, geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }] });
  assert.equal(unconfirmed[0].properties.class, 'waterway-review'); assert.equal(confirmed[0].properties.class, 'waterway');
});
await test('current OSM cycle hierarchy is retained without requiring a route reference', () => {
  for (const network of ['icn', 'ncn', 'rcn', 'lcn']) {
    const result = source.classifyOverpassElement({ type: 'relation', id: network, tags: { route: 'bicycle', network, name: `${network.toUpperCase()} route`, operator: 'Test operator', cycle_network: 'GB:test' }, members: [{ geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }] }] })[0];
    assert.equal(result.properties.class, network === 'lcn' ? 'cycle-network-local' : 'cycle-network-primary');
    assert.equal(result.properties.ref, '');
    assert.deepEqual([result.properties.network, result.properties.name, result.properties.operator, result.properties.cycleNetwork], [network, `${network.toUpperCase()} route`, 'Test operator', 'GB:test']);
  }
});

await test('rail geometry mode never infers London Overground without explicit evidence', () => {
  const generic = source.classifyOverpassElement({ type: 'way', id: 41, tags: { railway: 'rail' }, geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }] })[0];
  const overground = source.classifyOverpassElement({ type: 'way', id: 42, tags: { railway: 'rail', operator: 'London Overground' }, geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }] })[0];
  const national = source.classifyOverpassElement({ type: 'way', id: 43, tags: { railway: 'rail', operator: 'Network Rail' }, geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }] })[0];
  assert.deepEqual([generic.properties.railMode, overground.properties.railMode, national.properties.railMode], ['', 'London Overground', 'National Rail']);
  assert.equal(railway.modeForRailGeometryTags({ railway: 'light_rail' }), 'Tram/light rail');
});
await test('railway sidings and yard tracks remain support-only rather than issued line hierarchy', () => {
  const main = source.classifyOverpassElement({ type: 'way', id: 31, tags: { railway: 'rail', usage: 'main' }, geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }] })[0];
  const siding = source.classifyOverpassElement({ type: 'way', id: 32, tags: { railway: 'rail', service: 'siding' }, geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }] })[0];
  assert.equal(main.properties.class, 'railway');
  assert.equal(siding.properties.class, 'railway-support');
  assert.equal(siding.properties.supportOnly, true);
});
await test('current bus relation geometry is retained, grouped and controlled-colour styled', () => {
  const item = source.classifyOverpassElement({ type: 'relation', id: 18, tags: { route: 'bus', ref: '97', name: 'Route 97' }, members: [{ geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }] }] })[0];
  assert.deepEqual([item.properties.class, item.properties.routeGroup, item.properties.routeLabel], ['bus-route', '97', '97']);
  assert.match(item.properties.geometryEvidence, /osm-clipped/);
  assert.ok(['#ed1c24', '#7f2a90', '#00a651', '#00a9e0'].includes(item.properties.colour));
});
await test('bus relation without line geometry is explicitly review-only', () => {
  const item = source.classifyOverpassElement({ type: 'relation', id: 19, center: { lon: -.1, lat: 51.5 }, tags: { route: 'bus', ref: '99' }, members: [] })[0];
  assert.equal(item.properties.class, 'bus-route-review');
  assert.equal(item.properties.reviewReason, 'BUS ROUTE GEOMETRY REQUIRES REVIEW');
});
await test('controlled bus presentation groups preserve source identity and prevent duplicate route membership', () => {
  const features = [
    { type: 'Feature', id: 'relation/1', properties: { class: 'bus-route', sourceId: 'relation/1', ref: '10', geometryEvidence: 'osm-clipped' }, geometry: { type: 'LineString', coordinates: [[-.1, 51.5], [-.09, 51.51]] } },
    { type: 'Feature', id: 'relation/2', properties: { class: 'bus-route', sourceId: 'relation/2', ref: '20', geometryEvidence: 'osm-clipped' }, geometry: { type: 'LineString', coordinates: [[-.1, 51.51], [-.09, 51.52]] } }
  ];
  const grouped = presentation.applyBusPresentationGroups(features, [
    { id: 'bus-group-1', label: 'ALL BUS ROUTES', routeRefs: ['10', '20'], colour: '#7f2a90' },
    { id: 'bus-group-2', label: 'DUPLICATE', routeRefs: ['20'], colour: '#00a651' }
  ]);
  assert.deepEqual(presentation.normaliseBusGroups([{ routeRefs: ['10', '20'] }, { routeRefs: ['20'] }]).map(group => group.routeRefs), [['10', '20']]);
  assert.deepEqual(features.map(feature => feature.properties.sourceId), grouped.map(feature => feature.properties.sourceId));
  assert.deepEqual(features.map(feature => feature.geometry), grouped.map(feature => feature.geometry));
  assert.equal(grouped[0].properties.presentationBusLabel, 'ALL BUS ROUTES');
  assert.deepEqual(presentation.busRouteReferences(features), ['10', '20']);
});
await test('ungrouped bus services retain a single clean ALL BUS ROUTES presentation fallback', () => {
  const features = ['97', '179'].map(ref => ({ type: 'Feature', properties: { class: 'bus-route', ref, sourceId: `relation/${ref}` }, geometry: { type: 'LineString', coordinates: [[-.1, 51.5], [-.09, 51.51]] } }));
  const result = presentation.applyBusPresentationGroups(features);
  assert.ok(result.every(item => item.properties.presentationBusLabel === 'ALL BUS ROUTES' && item.properties.colour === '#ed1c24'));
  const legend = renderDrawingSvg({ modeId: 'local-context', centerBng: crs.wgs84ToBng([-.1, 51.5]), sourceFeatures: features }).legend.filter(item => item.className === 'bus-route');
  assert.deepEqual(legend.map(item => item.label), ['ALL BUS ROUTES — 97, 179']);
});
await test('clipped relation null geometry placeholders are ignored safely', () => {
  const item = source.classifyOverpassElement({
    type: 'relation', id: 191, center: { lon: -.1, lat: 51.5 }, tags: { route: 'bus', ref: '212' },
    members: [{ geometry: [null, { lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }, null] }, { geometry: [null, null] }, null]
  })[0];
  assert.equal(item.properties.class, 'bus-route');
  assert.equal(item.geometry.coordinates.length, 1);
});
await test('official OSM provider is exact, attributed, bounded and replaceable', () => {
  const provider = basemap.basemapProvider();
  assert.equal(provider.urlTemplate, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.match(provider.attribution, /OpenStreetMap contributors/);
  assert.equal(provider.maxTilesPerView, 80);
  assert.equal(basemap.validateBasemapProvider({ ...provider, id: 'test', urlTemplate: 'https://tiles.test/{z}/{x}/{y}.png' }).id, 'test');
});
await test('projection-aware tile manifests cover the exact BNG frames without stretch', () => {
  for (const [modeId, expectedZoom, expectedTiles, maximumError] of [['regional-plan', 13, 30, .03], ['local-context', 17, 25, .003]]) {
    const regional = modeId.startsWith('regional-');
    const drawingExtent = scale.extentForDrawing({ easting: 530000, northing: 180000 }, modeId);
    const manifest = basemap.tileManifestForDrawing({ extent: drawingExtent, modeId, viewWidth: 1000, viewHeight: regional ? 1000 * 245 / 336 : 1000 * 285 / 318 });
    assert.deepEqual([manifest.zoom, manifest.tileCount], [expectedZoom, expectedTiles]);
    assert.ok(manifest.maximumAlignmentErrorPx < maximumError, `${modeId}: ${manifest.maximumAlignmentErrorPx}`);
    assert.ok(manifest.tiles.every(tile => Number.isFinite(tile.matrix.a) && Number.isFinite(tile.matrix.b) && Number.isFinite(tile.matrix.c) && Number.isFinite(tile.matrix.d)));
    assert.equal(new Set(manifest.tiles.map(tile => tile.url)).size, expectedTiles);
  }
});
await test('proposed and construction cycle relations remain review-only', () => {
  const proposed = source.classifyOverpassElement({ type: 'relation', id: 4, tags: { route: 'bicycle', network: 'ncn', status: 'proposed' }, members: [{ geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }] }] })[0];
  const construction = source.classifyOverpassElement({ type: 'relation', id: 5, tags: { route: 'bicycle', network: 'lcn', construction: 'cycleway' }, members: [{ geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }] }] })[0];
  assert.equal(proposed.properties.class, 'cycle-review');
  assert.equal(construction.properties.class, 'cycle-review');
});
await test('main-road labels preserve only an evidenced A-road reference and motorway labels preserve motorway evidence', () => {
  const aRoad = source.classifyOverpassElement({ type: 'way', id: 6, tags: { highway: 'primary', ref: 'A406', name: 'North Circular Road' }, geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }] })[0];
  const nonA = source.classifyOverpassElement({ type: 'way', id: 7, tags: { highway: 'primary', ref: 'B123', name: 'Example Road' }, geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }] })[0];
  const motorway = source.classifyOverpassElement({ type: 'way', id: 8, tags: { highway: 'motorway', ref: 'M25', name: 'London Orbital Motorway' }, geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }] })[0];
  assert.deepEqual([aRoad.properties.class, aRoad.properties.officialARef, aRoad.properties.label], ['main-road', 'A406', 'A406']);
  assert.deepEqual([nonA.properties.class, nonA.properties.officialARef, nonA.properties.label], ['main-road', '', '']);
  assert.deepEqual([motorway.properties.class, motorway.properties.label], ['motorway', 'M25']);
});
await test('source review withholds a station without nearby returned railway geometry without moving the raw feature', () => {
  const raw = [
    { type: 'Feature', id: 'way/rail', properties: { class: 'railway', sourceId: 'way/rail' }, geometry: { type: 'LineString', coordinates: [[-.101, 51.5], [-.099, 51.5]] } },
    { type: 'Feature', id: 'node/station', properties: { class: 'station-national-rail', sourceId: 'node/station', name: 'Remote evidence', mode: 'National Rail' }, geometry: { type: 'Point', coordinates: [-.09, 51.5] } }
  ];
  const before = structuredClone(raw);
  const assessed = sourceReview.assessStationRailConsistency(raw, 200);
  assert.deepEqual(raw, before);
  assert.equal(assessed[1].properties.stationQa.warning, sourceReview.NO_NEARBY_RAIL_WARNING);
  assert.deepEqual(assessed[1].geometry, before[1].geometry);
  assert.equal(sourceReview.resolveSourcePresentation(assessed).some(item => item.id === 'node/station'), false);
  assert.equal(sourceReview.resolveSourcePresentation(assessed, { 'node/station': 'included' }).some(item => item.id === 'node/station'), true);
  assert.equal(sourceReview.stationReviewCandidates(assessed)[0].state, 'excluded');
});
await test('source review retains a compatible nearby station and explicit exclusions remove it from presentation', () => {
  const assessed = sourceReview.assessStationRailConsistency([
    { type: 'Feature', id: 'way/rail', properties: { class: 'railway', sourceId: 'way/rail' }, geometry: { type: 'LineString', coordinates: [[-.101, 51.5], [-.099, 51.5]] } },
    { type: 'Feature', id: 'node/station', properties: { class: 'station-underground', sourceId: 'node/station', name: 'Near evidence', mode: 'London Underground' }, geometry: { type: 'Point', coordinates: [-.1, 51.5002] } }
  ]);
  assert.equal(assessed[1].properties.stationQa.reviewRequired, false);
  assert.equal(sourceReview.resolveSourcePresentation(assessed).some(item => item.id === 'node/station'), true);
  assert.equal(sourceReview.resolveSourcePresentation(assessed, { 'node/station': 'excluded' }).some(item => item.id === 'node/station'), false);
});
await test('structured source query includes professional transport evidence but no pseudo-basemap harvest', () => {
  const query = source.buildOverpassQuery('local-context', extent);
  for (const marker of ['highway', 'railway', 'waterway', 'route"="bicycle', 'route"="bus', 'amenity']) assert.match(query, new RegExp(marker));
  assert.match(query, /out body center geom\(/);
  assert.match(query, /around\.communityAmenityNodes:100/);
  assert.match(query, /\["building"\]/);
  for (const excluded of ['landuse', 'natural']) assert.doesNotMatch(query, new RegExp(excluded));
  assert.doesNotMatch(query, /\["place"/);
});
await test('community area geometry is preserved instead of replaced by its Overpass centre', () => {
  const item = source.classifyOverpassElement({
    type: 'way', id: 20, center: { lon: -.1, lat: 51.5 }, tags: { amenity: 'library', name: 'Mapped Library' },
    geometry: [{ lon: -.101, lat: 51.499 }, { lon: -.099, lat: 51.499 }, { lon: -.099, lat: 51.501 }, { lon: -.101, lat: 51.499 }]
  })[0];
  assert.equal(item.geometry.type, 'Polygon');
  assert.equal(item.properties.originalGeometryType, 'Polygon');
});
await test('community node associates only with exactly one containing source building', () => {
  const candidate = { type: 'Feature', id: 'node/21', properties: { class: 'community-candidate', sourceId: 'node/21', name: 'Clinic' }, geometry: { type: 'Point', coordinates: [0, 0] } };
  const building = { type: 'Feature', id: 'way/22', properties: { class: 'building-support', sourceId: 'way/22' }, geometry: { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] } };
  const result = community.resolveCommunityCandidateGeometry([candidate, building])[0];
  assert.equal(result.geometry.type, 'Polygon');
  assert.deepEqual(result.properties.communityEvidence, { candidateSourceId: 'node/21', buildingSourceId: 'way/22', associationMethod: 'single-containing-building', reviewState: 'ready', reviewRequired: false, reviewReason: '' });
});
await test('ambiguous and missing community buildings never fabricate a footprint', () => {
  const candidate = { type: 'Feature', id: 'node/23', properties: { class: 'community-candidate', sourceId: 'node/23' }, geometry: { type: 'Point', coordinates: [0, 0] } };
  const polygon = { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] };
  const ambiguous = community.resolveCommunityCandidateGeometry([candidate, { type: 'Feature', properties: { class: 'building-support', sourceId: 'way/a' }, geometry: polygon }, { type: 'Feature', properties: { class: 'building-support', sourceId: 'way/b' }, geometry: polygon }])[0];
  const missing = community.resolveCommunityCandidateGeometry([candidate])[0];
  assert.equal(ambiguous.geometry.type, 'Point'); assert.equal(ambiguous.properties.communityEvidence.reviewState, 'review-required');
  assert.equal(missing.geometry.type, 'Point'); assert.equal(missing.properties.communityEvidence.associationMethod, 'none');
});
await test('community provenance survives persistence and deterministic selection ids prevent duplicates', () => {
  const store = createOverlayStore();
  const metadata = { id: 'community:node/21', className: 'community', community: { candidateSourceId: 'node/21', buildingSourceId: 'way/22', associationMethod: 'single-containing-building', reviewState: 'ready' } };
  const area = { type: 'Polygon', coordinates: [[[-.1, 51.5], [-.099, 51.5], [-.099, 51.501], [-.1, 51.5]]] };
  store.add(area, metadata); store.add(area, metadata);
  assert.equal(store.list().length, 1);
  assert.equal(store.get('community:node/21').properties.community.buildingSourceId, 'way/22');
  assert.equal(createOverlayStore(store.exportGeoJson().features).get('community:node/21').properties.community.associationMethod, 'single-containing-building');
});
await test('context features classify as structured vector basemap evidence', () => {
  const road = source.classifyOverpassElement({ type: 'way', id: 9, tags: { highway: 'secondary', name: 'Context Road' }, geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.51 }] })[0];
  const area = source.classifyOverpassElement({ type: 'way', id: 10, tags: { landuse: 'residential' }, geometry: [{ lon: -.1, lat: 51.5 }, { lon: -.09, lat: 51.5 }, { lon: -.09, lat: 51.51 }, { lon: -.1, lat: 51.5 }] })[0];
  const place = source.classifyOverpassElement({ type: 'node', id: 11, lat: 51.5, lon: -.1, tags: { place: 'town', name: 'Example Town' } })[0];
  assert.deepEqual([road.properties.class, area.properties.class, place.properties.class], ['context-road-major', 'context-area', 'context-place']);
});

await test('presentation generalisation merges only connected like-for-like linework', () => {
  const features = [
    { type: 'Feature', id: 'way/1', properties: { class: 'main-road', ref: 'A1', sourceId: 'way/1' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] } },
    { type: 'Feature', id: 'way/2', properties: { class: 'main-road', ref: 'A1', sourceId: 'way/2' }, geometry: { type: 'LineString', coordinates: [[1, 0], [2, 0]] } },
    { type: 'Feature', id: 'way/3', properties: { class: 'main-road', ref: 'A1', sourceId: 'way/3' }, geometry: { type: 'LineString', coordinates: [[4, 0], [5, 0]] } }
  ];
  const result = cartography.generalisePresentationFeatures(features);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(item => item.properties.presentationSegmentCount).sort(), [1, 2]);
  assert.equal(result.find(item => item.properties.presentationSegmentCount === 2).geometry.type, 'MultiLineString');
});
await test('presentation generalisation de-duplicates coincident station labels', () => {
  const result = cartography.generalisePresentationFeatures([
    { type: 'Feature', id: 'node/1', properties: { class: 'station-national-rail', name: 'Central' }, geometry: { type: 'Point', coordinates: [-.1, 51.5] } },
    { type: 'Feature', id: 'node/2', properties: { class: 'station-underground', name: 'Central' }, geometry: { type: 'Point', coordinates: [-.10001, 51.50001] } }
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].properties.class, 'station-underground');
});
await test('managed labels are bounded, collision-controlled and repeat-limited', () => {
  const features = [0, 1, 2].map(index => ({ type: 'Feature', id: `road/${index}`, properties: { class: 'main-road', ref: 'A1', officialARef: 'A1' }, geometry: { type: 'LineString', coordinates: [[10 + index * 100, 30], [80 + index * 100, 30]] } }));
  const placements = cartography.createLabelPlacements(features, point => point, 'regional-plan', 400, 200);
  assert.equal(placements.length, 1);
  assert.ok(placements.every(item => item.box.x1 >= 7 && item.box.x2 <= 393 && item.box.y1 >= 7 && item.box.y2 <= 193));
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
  assert.match(result.markup, /data-contextual-basemap="rendered-osm-raster-tiles"/);
  assert.match(result.markup, /data-basemap-provider="osm-standard"/);
  assert.match(result.markup, /class="osm-rendered-tile"/);
  assert.match(result.markup, /class="osm-attribution"/);
  assert.match(result.markup, /© OpenStreetMap contributors/);
  assert.ok(result.basemap.tileCount > 0 && result.basemap.tileCount <= 80);
  assert.equal((result.markup.match(/<svg/g) || []).length, 1);
});

await test('retained overlays are isolated to appropriate drawing modes', () => {
  const centerBng = crs.wgs84ToBng([-.1, 51.5]);
  const all = [
    normaliseOverlay({ type: 'LineString', coordinates: [[-.101, 51.5], [-.099, 51.501]] }, { className: 'route-to-site' }),
    normaliseOverlay({ type: 'LineString', coordinates: [[-.101, 51.501], [-.099, 51.5]] }, { className: 'bus-route' }),
    normaliseOverlay({ type: 'Polygon', coordinates: [[[-.101, 51.499], [-.099, 51.499], [-.099, 51.501], [-.101, 51.499]]] }, { className: 'community' })
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

await test('road-snap adapter follows planner waypoints in order through a provider-neutral mocked boundary', async () => {
  const rough = { type: 'LineString', coordinates: [[-0.11, 51.5], [-0.105, 51.502], [-0.1, 51.501]] };
  let requestedUrl = '';
  const fetchImpl = async url => {
    requestedUrl = url;
    return { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 1400, duration: 180, geometry: { type: 'LineString', coordinates: [[-0.11, 51.5], [-0.108, 51.501], [-0.105, 51.502], [-0.102, 51.5015], [-0.1, 51.501]] } }] }) };
  };
  const result = await routeSnap.snapRouteThroughGuidance(rough, { fetchImpl, provider: { ...routeSnap.DEFAULT_ROAD_ROUTING_PROVIDER, endpoint: 'https://routing.test/route/v1/driving' } });
  assert.equal(result.status, 'snapped-review');
  assert.equal(result.provenance.providerPurpose, 'geometry-assistance-only');
  assert.equal(result.provenance.waypointOrderPreserved, true);
  assert.match(requestedUrl, /-0\.1100000,51\.5000000;-0\.1050000,51\.5020000;-0\.1000000,51\.5010000/);
  assert.equal(result.geometry.coordinates.length, 5);
});

await test('road-snap failure preserves the planner rough geometry for manual review', async () => {
  const rough = { type: 'LineString', coordinates: [[-0.11, 51.5], [-0.1, 51.501]] };
  const result = await routeSnap.snapRouteThroughGuidance(rough, { fetchImpl: async () => { throw new Error('mock unavailable'); } });
  assert.equal(result.status, 'snap-failed');
  assert.deepEqual(result.geometry, rough);
  assert.match(result.error, /mock unavailable/);
});

await test('route direction normalization deterministically reverses both route directions when needed', () => {
  const sitePolygon = { type: 'Polygon', coordinates: [[[-0.1002, 51.4998], [-0.0998, 51.4998], [-0.0998, 51.5002], [-0.1002, 51.5002], [-0.1002, 51.4998]]] };
  const siteFirst = { type: 'LineString', coordinates: [[-0.1, 51.5], [-0.105, 51.5], [-0.11, 51.5]] };
  const siteLast = { type: 'LineString', coordinates: [[-0.11, 51.5], [-0.105, 51.5], [-0.1, 51.5]] };
  const toSite = routeGeometry.normaliseRouteDirection(siteFirst, 'route-to-site', sitePolygon);
  const fromSite = routeGeometry.normaliseRouteDirection(siteLast, 'route-from-site', sitePolygon);
  assert.equal(toSite.status, 'confirmed'); assert.equal(toSite.reversed, true); assert.deepEqual(toSite.geometry.coordinates.at(-1), [-0.1, 51.5]);
  assert.equal(fromSite.status, 'confirmed'); assert.equal(fromSite.reversed, true); assert.deepEqual(fromSite.geometry.coordinates[0], [-0.1, 51.5]);
  assert.equal(routeGeometry.normaliseRouteDirection(siteLast, 'route-to-site', null).reason, 'ROUTE DIRECTION REQUIRES REVIEW');
});

await test('route arrows use distance cadence on final geometry and follow coordinate direction', () => {
  const sparse = { type: 'LineString', coordinates: [[-0.11, 51.5], [-0.1, 51.5]] };
  const dense = { type: 'LineString', coordinates: Array.from({ length: 101 }, (_, index) => [-0.11 + (index / 10000), 51.5]) };
  const sparseArrows = routeGeometry.routeArrowPlacements(sparse, 'local');
  const denseArrows = routeGeometry.routeArrowPlacements(dense, 'local');
  assert.equal(sparseArrows.length, denseArrows.length);
  assert.ok(sparseArrows.length >= 3 && sparseArrows.length <= 10);
  assert.ok(sparseArrows.every(item => item.end[0] > item.start[0]));
});

await test('routing drawings suppress automatic thematic overlays and rendering never mutates retained route geometry', () => {
  const centerBng = crs.wgs84ToBng([-.1, 51.5]);
  const route = normaliseOverlay({ type: 'LineString', coordinates: [[-.11, 51.5], [-.1, 51.5]] }, { className: 'route-to-site', route: { status: 'approved', directionStatus: 'confirmed' } });
  const original = structuredClone(route.geometry);
  const result = renderDrawingSvg({ modeId: 'regional-routing', centerBng, site, sourceFeatures, overlays: [route], sourceStatus: 'success' });
  assert.match(result.markup, /layer-route-to-site/);
  assert.doesNotMatch(result.markup, /layer-(main-road|station-underground)/);
  assert.doesNotMatch(result.markup, /marker-mid=/);
  assert.match(result.markup, /class="route-direction-arrow"/);
  assert.deepEqual(route.geometry, original);
});
await test('Local Context preserves hierarchy with green cycles and evidence-led rail styling', () => {
  const centerBng = crs.wgs84ToBng([-.1, 51.5]);
  const features = [
    { type: 'Feature', properties: { class: 'main-road', officialARef: 'A1' }, geometry: { type: 'LineString', coordinates: [[-.11, 51.49], [-.09, 51.51]] } },
    { type: 'Feature', properties: { class: 'cycle-network-primary' }, geometry: { type: 'LineString', coordinates: [[-.11, 51.5], [-.09, 51.5]] } },
    { type: 'Feature', properties: { class: 'cycle-network-local' }, geometry: { type: 'LineString', coordinates: [[-.1, 51.49], [-.1, 51.51]] } },
    { type: 'Feature', properties: { class: 'railway' }, geometry: { type: 'LineString', coordinates: [[-.105, 51.49], [-.105, 51.51]] } },
    { type: 'Feature', properties: { class: 'railway', railMode: 'London Overground' }, geometry: { type: 'LineString', coordinates: [[-.106, 51.49], [-.106, 51.51]] } }
  ];
  const markup = renderDrawingSvg({ modeId: 'local-context', centerBng, sourceFeatures: features }).markup;
  assert.doesNotMatch(markup, /layer-main-road/);
  assert.match(markup, /layer-cycle-network-primary[\s\S]*stroke="#00a651"/);
  assert.match(markup, /layer-cycle-network-local[\s\S]*stroke="#00a651"[\s\S]*stroke-dasharray="4 2\.5"/);
  assert.match(markup, /layer-railway[\s\S]*stroke="#666666"/);
  assert.match(markup, /layer-railway[\s\S]*stroke="#f58220"/);
  const genericOnly = renderDrawingSvg({ modeId: 'local-context', centerBng, sourceFeatures: [features[3]] });
  assert.ok(genericOnly.legend.some(item => item.label === 'RAILWAY'));
  assert.ok(!genericOnly.legend.some(item => item.label === 'LONDON OVERGROUND'));
});
await test('Regional Plan suppresses duplicate rail-mode legend labels', () => {
  const centerBng = crs.wgs84ToBng([-.1, 51.5]);
  const rails = ['', 'National Rail', 'London Overground'].map((railMode, index) => ({ type: 'Feature', properties: { class: 'railway', railMode }, geometry: { type: 'LineString', coordinates: [[-.11 + index * .002, 51.49], [-.09 + index * .002, 51.51]] } }));
  assert.deepEqual(renderDrawingSvg({ modeId: 'regional-plan', centerBng, sourceFeatures: rails }).legend.filter(item => item.className === 'railway').map(item => item.label), ['RAILWAY']);
});
await test('basemap appearance is optional, defaults to colour and leaves professional vector geometry unchanged', () => {
  const centerBng = crs.wgs84ToBng([-.1, 51.5]);
  const sourceFeatures = [{ type: 'Feature', properties: { class: 'cycle-network-primary' }, geometry: { type: 'LineString', coordinates: [[-.11, 51.5], [-.09, 51.5]] } }];
  const colour = renderDrawingSvg({ modeId: 'local-context', centerBng, sourceFeatures }).markup;
  const greyscale = renderDrawingSvg({ modeId: 'local-context', centerBng, sourceFeatures, basemapAppearance: { colour: 'greyscale', emphasis: 'normal' } }).markup;
  assert.deepEqual(presentation.normaliseBasemapAppearance(), { colour: 'colour', emphasis: 'faded' });
  assert.match(colour, /data-basemap-colour="colour"[\s\S]*opacity:0\.8/);
  assert.match(greyscale, /data-basemap-colour="greyscale"[\s\S]*style="opacity:1" filter="url\(#basemap-greyscale\)"/);
  assert.match(greyscale, /layer-cycle-network-primary[\s\S]*stroke="#00a651"/);
});
await test('community annotations use a leader and a readable backed label', () => {
  const centerBng = crs.wgs84ToBng([-.1, 51.5]);
  const overlay = normaliseOverlay({ type: 'Polygon', coordinates: [[[-.102, 51.499], [-.1, 51.499], [-.1, 51.501], [-.102, 51.499]]] }, { className: 'community', label: 'Community facility' });
  const markup = renderDrawingSvg({ modeId: 'local-context', centerBng, overlays: [overlay] }).markup;
  assert.match(markup, /community-annotation-leader/);
  assert.match(markup, /community-annotation-backing/);
});
await test('coincident TO and FROM arrows use opposing presentation-only offsets and white halos', () => {
  const centerBng = crs.wgs84ToBng([-.1, 51.5]);
  const geometry = { type: 'LineString', coordinates: [[-.12, 51.5], [-.08, 51.5]] };
  const overlays = [
    normaliseOverlay(geometry, { className: 'route-to-site', route: { status: 'approved', directionStatus: 'confirmed' } }),
    normaliseOverlay(geometry, { className: 'route-from-site', route: { status: 'approved', directionStatus: 'confirmed' } })
  ];
  const before = structuredClone(overlays.map(item => item.geometry));
  const markup = renderDrawingSvg({ modeId: 'regional-routing', centerBng, overlays }).markup;
  assert.match(markup, /data-cartographic-offset="-3\.2"/);
  assert.match(markup, /data-cartographic-offset="3\.2"/);
  assert.match(markup, /route-direction-arrow-halo/);
  assert.deepEqual(overlays.map(item => item.geometry), before);
});
await test('site uses an external leader callout and no generic polygon-centre SITE label', () => {
  const centerBng = crs.wgs84ToBng([-.1, 51.5]);
  const result = renderDrawingSvg({ modeId: 'local-context', centerBng, site }).markup;
  assert.match(result, /class="site-callout"/);
  assert.match(result, /class="site-callout-leader"/);
  assert.doesNotMatch(result, /class="map-label label-site"/);
});

await test('A3 sheet contains title block, map frame, current logo, legend, attribution and build', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../assets/css/drawing-generator.css', import.meta.url), 'utf8');
  for (const marker of ['id="drawingSheet"', 'id="sheetMap"', 'id="sheetLegend"', 'assets/images/eas-primary.png', 'sheetAttribution', 'id="workflowStatus"', BUILD]) assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(css, /@page\s*\{\s*size:A3 landscape;\s*margin:0;/);
  assert.match(css, /width:420mm;\s*height:297mm/);
  const sheet = html.slice(html.indexOf('id="drawingSheet"'), html.indexOf('</article>', html.indexOf('id="drawingSheet"')));
  assert.equal((sheet.match(/assets\/images\/eas-primary\.png/g) || []).length, 1);
});

await test('dashboard registers exactly one WIP drawing card while preserving established cards', () => {
  const dashboard = fs.readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
  const modules = JSON.parse(fs.readFileSync(new URL('../../../config/modules.json', import.meta.url), 'utf8'));
  assert.equal((dashboard.match(/data-module="drawing-generator"/g) || []).length, 1);
  assert.match(dashboard, /data-module="drawing-generator"[\s\S]*WORK IN PROGRESS[\s\S]*Drawing Generator/);
  for (const title of ['Combined Site Research', 'Accessibility Assessment', 'STATS19 Collision Record Cards', 'Railway Assessment', 'Bus Assessment', 'Library Explorer', 'Library Manager']) assert.match(dashboard, new RegExp(title));
  assert.deepEqual(modules.modules.drawingGenerator, { version: '0.1.0', build: BUILD, status: 'work-in-progress-live-review', path: 'modules/drawing-generator/index.html' });
});

console.log(`\n${passed} Drawing Generator tests passed.`);
