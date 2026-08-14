import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.env.TPT_REVIEW_ROOT || 'http://127.0.0.1:8768/';
const output = path.resolve(process.env.DG0_PDF_OUTPUT || 'output/pdf');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.TPT_PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.TPT_PLAYWRIGHT_EXECUTABLE_PATH } : {}) });

const site = { type: 'Polygon', coordinates: [[[-.1011, 51.4997], [-.09985, 51.4997], [-.09985, 51.50045], [-.1011, 51.50045], [-.1011, 51.4997]]] };
const lines = {
  road: { type: 'LineString', coordinates: [[-.13, 51.49], [-.1, 51.5], [-.07, 51.51]] },
  cross: { type: 'LineString', coordinates: [[-.105, 51.48], [-.095, 51.52]] },
  route: { type: 'LineString', coordinates: [[-.108, 51.503], [-.104, 51.5015], [-.1005, 51.5001]] }
};
const sourceFeatures = [
  ['main-road', lines.road, { ref: 'A100' }], ['motorway', { type: 'LineString', coordinates: [[-.13, 51.515], [-.07, 51.515]] }, { ref: 'M10' }],
  ['strategic-cycle', { type: 'LineString', coordinates: [[-.12, 51.492], [-.08, 51.508]] }, { ref: 'NCN 1' }], ['cycle-route', lines.cross, {}],
  ['waterway', { type: 'LineString', coordinates: [[-.115, 51.48], [-.11, 51.52]] }, {}], ['railway', lines.cross, {}],
  ['station-national-rail', { type: 'Point', coordinates: [-.098, 51.505] }, { name: 'Test Central' }],
  ['station-underground', { type: 'Point', coordinates: [-.102, 51.497] }, { name: 'Test Underground' }],
  ['bus-route', { type: 'LineString', coordinates: [[-.112, 51.493], [-.1, 51.501], [-.088, 51.509]] }, { routeLabel: '99' }]
].map(([className, geometry, properties]) => ({ type: 'Feature', properties: { class: className, ...properties }, geometry }));
const overlays = [
  [{ type: 'Feature', properties: {}, geometry: lines.route }, { className: 'route-to-site', label: 'ROUTE TO SITE', layerName: 'Reviewed routes', colour: '#ed1c24' }],
  [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [...lines.route.coordinates].reverse() } }, { className: 'route-from-site', label: 'ROUTE FROM SITE', layerName: 'Reviewed routes', colour: '#0057e7' }],
  [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-.1025, 51.501] } }, { className: 'community', label: 'COMMUNITY FACILITY', layerName: 'Selected considerations', colour: '#666666' }]
];

try {
  for (const mode of ['regional-plan', 'regional-routing', 'local-context', 'local-routing']) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.addInitScript(() => localStorage.clear());
    await page.goto(new URL('modules/drawing-generator/', root).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__DG0_ACCEPTANCE__));
    await page.evaluate(({ mode, site, sourceFeatures, overlays }) => {
      const api = window.__DG0_ACCEPTANCE__;
      api.setMode(mode); api.setLocation(51.5, -.1); api.setSite(site); api.setSource(sourceFeatures, { retrievedAt: '2026-08-14T12:00:00Z' });
      overlays.forEach(([feature, metadata]) => api.addOverlay(feature, metadata)); api.render();
    }, { mode, site, sourceFeatures, overlays });
    await page.locator('[data-meta="client"]').fill('Synthetic QA Client');
    await page.locator('[data-meta="project"]').fill('Drawing Generator QA Site');
    await page.locator('[data-meta="projectNumber"]').fill('DG0-QA');
    await page.locator('[data-meta="designedBy"]').fill('QA');
    await page.locator('[data-meta="drawnBy"]').fill('QA');
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: path.join(output, `drawing-generator-${mode}-live-review.pdf`), format: 'A3', landscape: true, printBackground: true, preferCSSPageSize: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    await page.close();
  }
  console.log(`Created four A3 live-review QA PDFs in ${output}`);
} finally { await browser.close(); }
