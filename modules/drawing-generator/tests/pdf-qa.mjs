import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.env.TPT_REVIEW_ROOT || 'http://127.0.0.1:8768/';
const output = path.resolve(process.env.DG0_PDF_OUTPUT || 'output/pdf');
const modes = (process.env.DG0_PDF_MODES || 'regional-plan,regional-routing,local-context,local-routing').split(',').map(value => value.trim()).filter(Boolean);
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.TPT_PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.TPT_PLAYWRIGHT_EXECUTABLE_PATH } : {}) });

const genuinePngTile = fs.readFileSync(new URL('../assets/images/eas-primary.png', import.meta.url));

const site = { type: 'Polygon', coordinates: [[[-.1011, 51.4997], [-.09985, 51.4997], [-.09985, 51.50045], [-.1011, 51.50045], [-.1011, 51.4997]]] };
const lines = {
  road: { type: 'LineString', coordinates: [[-.215, 51.459], [-.155, 51.477], [-.1, 51.5], [-.045, 51.523], [.015, 51.541]] },
  cross: { type: 'LineString', coordinates: [[-.168, 51.447], [-.137, 51.478], [-.095, 51.513], [-.038, 51.553]] },
  route: { type: 'LineString', coordinates: [[-.108, 51.503], [-.104, 51.5015], [-.1005, 51.5001]] }
};
const sourceFeatures = [
  ['context-area', { type: 'Polygon', coordinates: [[[-.214, 51.452], [-.162, 51.452], [-.162, 51.476], [-.214, 51.476], [-.214, 51.452]]] }, { contextType: 'residential' }],
  ['context-area', { type: 'Polygon', coordinates: [[[-.151, 51.448], [-.101, 51.448], [-.101, 51.471], [-.151, 51.471], [-.151, 51.448]]] }, { contextType: 'commercial' }],
  ['context-area', { type: 'Polygon', coordinates: [[[-.094, 51.451], [-.038, 51.451], [-.038, 51.477], [-.094, 51.477], [-.094, 51.451]]] }, { contextType: 'residential' }],
  ['context-area', { type: 'Polygon', coordinates: [[[-.028, 51.459], [.015, 51.459], [.015, 51.486], [-.028, 51.486], [-.028, 51.459]]] }, { contextType: 'wood' }],
  ['context-area', { type: 'Polygon', coordinates: [[[-.205, 51.495], [-.157, 51.495], [-.157, 51.527], [-.205, 51.527], [-.205, 51.495]]] }, { contextType: 'wood' }],
  ['context-area', { type: 'Polygon', coordinates: [[[-.145, 51.491], [-.107, 51.491], [-.107, 51.514], [-.145, 51.514], [-.145, 51.491]]] }, { contextType: 'residential' }],
  ['context-area', { type: 'Polygon', coordinates: [[[-.091, 51.516], [-.043, 51.516], [-.043, 51.545], [-.091, 51.545], [-.091, 51.516]]] }, { contextType: 'recreation_ground' }],
  ['context-area', { type: 'Polygon', coordinates: [[[-.035, 51.501], [.012, 51.501], [.012, 51.533], [-.035, 51.533], [-.035, 51.501]]] }, { contextType: 'residential' }],
  ['context-road-major', { type: 'LineString', coordinates: [[-.22, 51.485], [-.154, 51.499], [-.087, 51.506], [.022, 51.518]] }, { ref: 'B100', name: 'Context Road' }],
  ['context-road-major', { type: 'LineString', coordinates: [[-.218, 51.527], [-.152, 51.512], [-.091, 51.493], [.018, 51.468]] }, { ref: 'B200', name: 'Cross Road' }],
  ['context-road-major', { type: 'LineString', coordinates: [[-.188, 51.446], [-.172, 51.478], [-.159, 51.512], [-.142, 51.552]] }, { ref: 'B300', name: 'Western Road' }],
  ['context-road-major', { type: 'LineString', coordinates: [[-.046, 51.446], [-.064, 51.483], [-.075, 51.516], [-.087, 51.553]] }, { ref: 'B400', name: 'Eastern Road' }],
  ['context-road-major', { type: 'LineString', coordinates: [[-.213, 51.472], [-.145, 51.485], [-.073, 51.477], [.016, 51.489]] }, { ref: 'B500', name: 'Southern Road' }],
  ['context-place', { type: 'Point', coordinates: [-.188, 51.536] }, { name: 'North West' }],
  ['context-place', { type: 'Point', coordinates: [-.142, 51.468] }, { name: 'South West' }],
  ['context-place', { type: 'Point', coordinates: [-.064, 51.536] }, { name: 'North East' }],
  ['context-place', { type: 'Point', coordinates: [-.018, 51.477] }, { name: 'South East' }],
  ['main-road', lines.road, { ref: 'A100' }], ['motorway', { type: 'LineString', coordinates: [[-.218, 51.538], [.018, 51.538]] }, { ref: 'M10' }],
  ['cycle-network-primary', { type: 'LineString', coordinates: [[-.205, 51.47], [-.164, 51.491], [-.112, 51.516], [-.061, 51.535], [.006, 51.548]] }, { network: 'ncn', name: 'National Cycle Route' }],
  ['cycle-network-local', { type: 'LineString', coordinates: [[-.196, 51.521], [-.148, 51.511], [-.1, 51.5], [-.052, 51.487], [.004, 51.474]] }, { network: 'lcn', name: 'Local Cycle Network' }], ['cycle-route', lines.cross, {}],
  ['waterway', { type: 'LineString', coordinates: [[-.194, 51.447], [-.181, 51.483], [-.176, 51.515], [-.168, 51.553]] }, {}], ['railway', lines.cross, {}],
  ['station-national-rail', { type: 'Point', coordinates: [-.098, 51.505] }, { name: 'Test Central' }],
  ['station-underground', { type: 'Point', coordinates: [-.102, 51.497] }, { name: 'Test Underground' }],
  ['bus-route', { type: 'LineString', coordinates: [[-.112, 51.493], [-.1, 51.501], [-.088, 51.509]] }, { routeLabel: '99' }]
].map(([className, geometry, properties]) => ({ type: 'Feature', properties: { class: className, ...properties }, geometry }));
const overlays = [
  [{ type: 'Feature', properties: {}, geometry: lines.route }, { className: 'route-to-site', label: 'ROUTE TO SITE', layerName: 'Planner-guided road routing', colour: '#ed1c24', source: 'Mock road geometry; automated QA only', route: { status: 'approved', directionStatus: 'confirmed', selectionAuthority: 'planner', providerPurpose: 'geometry-assistance-only', provenance: { providerName: 'Mock road geometry', providerId: 'qa-mock', providerPurpose: 'geometry-assistance-only', waypointOrderPreserved: true, maxGuidanceDeviationMetres: 0 } } }],
  [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [...lines.route.coordinates].reverse() } }, { className: 'route-from-site', label: 'ROUTE FROM SITE', layerName: 'Planner-guided road routing', colour: '#0057e7', source: 'Mock road geometry; automated QA only', route: { status: 'approved', directionStatus: 'confirmed', selectionAuthority: 'planner', providerPurpose: 'geometry-assistance-only', provenance: { providerName: 'Mock road geometry', providerId: 'qa-mock', providerPurpose: 'geometry-assistance-only', waypointOrderPreserved: true, maxGuidanceDeviationMetres: 0 } } }],
  [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-.1029, 51.5007], [-.1021, 51.5007], [-.1021, 51.5013], [-.1029, 51.5013], [-.1029, 51.5007]]] } }, { className: 'community', label: 'COMMUNITY FACILITY', layerName: 'Selected considerations', colour: '#666666' }]
];

try {
  for (const mode of modes) {
    const modeOverlays = structuredClone(overlays);
    if (mode === 'regional-routing') {
      const regionalRoute = [[-.202, 51.463], [-.174, 51.479], [-.142, 51.489], [-.1005, 51.5001]];
      modeOverlays[0][0].geometry.coordinates = regionalRoute;
      modeOverlays[1][0].geometry.coordinates = [...regionalRoute].reverse();
    }
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.addInitScript(() => localStorage.clear());
    await page.route(/https:\/\/(?:tile\.openstreetmap\.org|tiles\.test)\/\d+\/\d+\/\d+\.png/, route => route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: genuinePngTile }));
    await page.goto(new URL('modules/drawing-generator/', root).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__DG0_ACCEPTANCE__));
    await page.locator('#advancedTools > summary').click();
    await page.evaluate(({ mode, site, sourceFeatures, overlays }) => {
      const api = window.__DG0_ACCEPTANCE__;
      api.setBasemapProvider({ id: 'qa-mocked-osm', name: 'Mocked OSM tile fixture', urlTemplate: 'https://tiles.test/{z}/{x}/{y}.png', attribution: 'Automated QA tile fixture - no public tile retrieval', tileSize: 256, minZoom: 0, maxZoom: 19, maxTilesPerView: 80 });
      api.setMode(mode); api.setLocation(51.5, -.1); api.setSite(site); api.setSource(sourceFeatures, { retrievedAt: '2026-08-16T12:00:00Z' });
      overlays.forEach(([feature, metadata]) => api.addOverlay(feature, metadata));
    }, { mode, site, sourceFeatures, overlays: modeOverlays });
    await page.locator('[data-meta="client"]').fill('Synthetic QA Client');
    await page.locator('[data-meta="project"]').fill('Drawing Generator QA Site');
    await page.locator('[data-meta="projectNumber"]').fill('DG0-QA');
    await page.locator('[data-meta="designedBy"]').fill('QA');
    await page.locator('[data-meta="drawnBy"]').fill('QA');
    await page.evaluate(() => window.__DG0_ACCEPTANCE__.requestBasemap());
    await page.waitForFunction(() => window.__DG0_ACCEPTANCE__.snapshot().basemap.status === 'success');
    await page.emulateMedia({ media: 'print' });
    if (mode.endsWith('-routing')) {
      const classes = await page.locator('#drawingSvg .controlled-eas-overlays > g').evaluateAll(groups => groups.map(group => group.getAttribute('class')));
      if (classes.some(value => /main-road|motorway|cycle|waterway|railway|station/.test(value || ''))) throw new Error(`${mode} retained a suppressed thematic overlay.`);
      if (!await page.locator('#drawingSvg .route-direction-chevron').count()) throw new Error(`${mode} did not render route-aligned direction chevrons.`);
      if (!await page.locator('#drawingSvg .route-direction-chevron-halo').count()) throw new Error(`${mode} did not render chevron halos.`);
      if (await page.locator('#drawingSvg .route-direction-arrow').count()) throw new Error(`${mode} still rendered obsolete route arrows.`);
      if (await page.locator('#drawingSvg [data-cartographic-offset]').count()) throw new Error(`${mode} still rendered obsolete cartographic offsets.`);
    }
    if (await page.locator('#drawingSheet .identity img').count() !== 1) throw new Error(`${mode} did not contain exactly one issued title-block logo.`);
    if (!await page.locator('#drawingSvg .osm-attribution').count()) throw new Error(`${mode} did not render the distinct OpenStreetMap attribution.`);
    if (!await page.locator('#drawingSvg .osm-attribution').textContent().then(text => /OpenStreetMap contributors/.test(text || ''))) throw new Error(`${mode} did not retain readable OpenStreetMap attribution text.`);
    await page.pdf({ path: path.join(output, `drawing-generator-${mode}-DG0C3.3B-HF4-live-review.pdf`), format: 'A3', landscape: true, printBackground: true, preferCSSPageSize: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    await page.close();
  }
  console.log(`Created ${modes.length} A3 live-review QA PDF${modes.length === 1 ? '' : 's'} in ${output}`);
} finally { await browser.close(); }
