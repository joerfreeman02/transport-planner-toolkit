import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { launchAtlasBrowser } from './playwright-launch.mjs';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createSite, confirmSite } from '../../src/atlas/domain/site.mjs';

const [candidateArg, reportArg] = process.argv.slice(2);
if (!candidateArg) throw new Error('Usage: node tests/atlas/s2e1-manual-product-audit.mjs <Run-75-candidate-root> [report.json]');
const candidateRoot = path.resolve(candidateArg);
const repositoryRoot = path.resolve(new URL('../../', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const tflWalthamOperatingFixture = JSON.parse(await readFile(path.join(repositoryRoot, 'tests/atlas/fixtures/tfl-waltham-stop-a-operating-period-1a.json'), 'utf8'));
const tflWalthamByLine = new Map(tflWalthamOperatingFixture.requests.map(request => [String(request.lineId), request.response]));
const enfieldIbusIndex = JSON.parse(await readFile(path.join(repositoryRoot, 'atlas/data/tfl-ibus/20261009/operator-index.json'), 'utf8'));
const enfieldControls = [
  { id: 'enfield-313-e2e', label: 'Enfield route 313 frozen candidate/iBus operator control', latitude: 51.6522, longitude: -0.0809, radius: 250, focusRoutes: ['313'] },
  { id: 'enfield-329-e2e', label: 'Enfield route 329 frozen candidate operator control', latitude: 51.6522, longitude: -0.0809, radius: 250, focusRoutes: ['329'] }
];
const enfieldFixtures = new Map();
if (process.env.ATLAS_C4_ENFIELD_EVIDENCE_ONLY === '1') {
  const busRoot = path.join(candidateRoot, 'atlas', 'data', 'bus');
  const candidateFetch = async input => {
    const pathname = new URL(input).pathname;
    const marker = '/atlas/data/bus/';
    const index = pathname.indexOf(marker);
    if (index < 0) return new Response('', { status: 404 });
    const relative = decodeURIComponent(pathname.slice(index + marker.length));
    const file = path.resolve(busRoot, relative);
    if (file !== path.join(busRoot, 'manifest.json') && !file.startsWith(`${busRoot}${path.sep}`)) return new Response('', { status: 404 });
    try { return new Response(await readFile(file), { status: 200 }); }
    catch { return new Response('', { status: 404 }); }
  };
  const prepared = createPreparedBusDataAdapter({ fetchImpl: candidateFetch, baseUrl: 'http://candidate.local/atlas/data/bus/', busFileUrl: relative => new URL(relative, 'http://candidate.local/atlas/data/bus/').toString(), timeoutMs: 120000 });
  const probeSite = confirmSite(createSite({ suppliedAddress: 'Enfield Town', displayAddress: 'Enfield Town', latitude: enfieldControls[0].latitude, longitude: enfieldControls[0].longitude, assessmentPoint: { method: 'coordinates_entered' } }), { confirmedAt: '2026-10-22T00:00:00Z' });
  const stopResult = await prepared.nearbyStops(probeSite, { radius: 2000 });
  if (!stopResult.ok) throw new Error(`Frozen candidate Enfield stop lookup failed: ${stopResult.message}`);
  const route313Patterns = enfieldIbusIndex.patterns.filter(pattern => String(pattern.serviceLineNo) === '313' && pattern.journeys.some(journey => journey.calendarEvidence?.some(calendar => calendar.calendarDay === '2026-10-23' && calendar.blockRunsOnDay === true)));
  const match = (stopResult.data ?? []).flatMap(stop => route313Patterns.filter(pattern => pattern.orderedStopPointIds.includes(String(stop.id))).map(pattern => ({ stop, pattern })))
    .sort((left, right) => Number(left.stop.distanceMetres ?? 0) - Number(right.stop.distanceMetres ?? 0) || left.pattern.patternIdx.localeCompare(right.pattern.patternIdx))[0];
  if (!match) throw new Error('Frozen Run #75 candidate has no Enfield stop that matches an active 2026-10-23 route-313 iBus ordered pattern.');
  const route329Stop = (stopResult.data ?? []).filter(stop => (stop.routes ?? []).some(value => String(value) === '329'))
    .sort((left, right) => Number(left.distanceMetres ?? 0) - Number(right.distanceMetres ?? 0) || String(left.id).localeCompare(String(right.id)))[0];
  if (!route329Stop) throw new Error('Frozen Run #75 candidate has no Enfield BODS route-329 stop within 2,000 metres of the control point.');
  Object.assign(enfieldControls[0], { latitude: Number(match.stop.latitude), longitude: Number(match.stop.longitude) });
  Object.assign(enfieldControls[1], { latitude: Number(route329Stop.latitude), longitude: Number(route329Stop.longitude) });
  const activeJourney = match.pattern.journeys.find(journey => journey.calendarEvidence?.some(calendar => calendar.calendarDay === '2026-10-23' && calendar.blockRunsOnDay === true));
  const ids = [...match.pattern.orderedStopPointIds];
  enfieldFixtures.set('enfield-313-e2e', {
    stopId: String(match.stop.id), stopName: String(match.stop.name), patternId: String(match.pattern.patternIdx),
    patternDirection: String(match.pattern.direction), ids,
    activeJourney: { journeyIdx: String(activeJourney.journeyIdx), blockIdx: String(activeJourney.blockIdx), operatorCode: activeJourney.operatorCode, operatorName: activeJourney.operatorName },
    stopPoints: [{ id: String(match.stop.id), naptanId: String(match.stop.id), commonName: String(match.stop.name), lat: enfieldControls[0].latitude, lon: enfieldControls[0].longitude, stopType: 'NaptanPublicBusCoachTram', lines: [{ id: '313', name: '313' }] }],
    route: { id: '313', routeSections: [{ id: `313-${match.pattern.patternIdx}`, direction: 'outbound', originationName: ids[0], destinationName: ids.at(-1), originator: ids[0], destination: ids.at(-1), serviceType: 'Regular', validFrom: enfieldIbusIndex.validFrom, validTo: enfieldIbusIndex.validTo }] },
    sequence: { lineId: '313', direction: 'outbound', stopPointSequences: [{ branchId: 1, serviceType: 'Regular', stopPoint: ids.map(naptanId => ({ naptanId })) }] },
    timetable: {
      lineId: '313', lineName: '313', direction: 'outbound', directionId: '1', stations: ids.map(id => ({ id, name: id })),
      timetable: { departureStopId: String(match.stop.id), routes: [{ stationIntervals: [{ id: String(match.pattern.patternIdx), intervals: ids.map((stopId, index) => ({ stopId, timeToArrival: index })) }],
        schedules: [{ name: 'Monday to Sunday', knownJourneys: [{ intervalId: String(match.pattern.patternIdx), vehicleJourneyId: `ibus-${activeJourney.journeyIdx}`, stopTimes: [{ stopId: String(match.stop.id), departureTime: { hour: 7, minute: 10 } }] }] }] }] }
    }
  });
  enfieldFixtures.set('enfield-329-e2e', {
    stopId: String(route329Stop.id), stopName: String(route329Stop.name), routeNumber: '329',
    stopPoints: [{ id: String(route329Stop.id), naptanId: String(route329Stop.id), commonName: String(route329Stop.name), lat: Number(route329Stop.latitude), lon: Number(route329Stop.longitude), stopType: 'NaptanPublicBusCoachTram', lines: [{ id: '329', name: '329' }] }],
    route: [],
    timetable: { lineId: '329', lineName: '329', direction: '', timetable: { departureStopId: String(route329Stop.id), routes: [] } },
    sequence: { lineId: '329', direction: 'outbound', stopPointSequences: [] },
    candidateStopRoutes: route329Stop.routes ?? []
  });
}
const controls = [
  { id: 'pipers-lane', label: 'Pipers Lane', latitude: 51.852700, longitude: -0.454343, radius: 700 },
  { id: 'waltham-cross', label: '47 Berkley Avenue, Waltham Cross', latitude: 51.6857829, longitude: -0.0330001, radius: 700 },
  { id: 'chingford', label: 'Normanshire Drive, Chingford', latitude: 51.616596, longitude: -0.0117893, radius: 250 },
  { id: 'pe1', label: 'PE1 2TL', latitude: 52.577554, longitude: -0.242489, radius: 500 }
];
if (process.env.ATLAS_C4_ENFIELD_EVIDENCE_ONLY === '1') controls.splice(0, controls.length, ...enfieldControls);
const chingfordRouteMetadata657 = { id: '657', routeSections: [
  { id: '657-out', direction: 'outbound', originationName: "Salisbury Hall Sainsbury's", destinationName: "Bancroft's School" },
  { id: '657-in', direction: 'inbound', originationName: "Bancroft's School", destinationName: "Salisbury Hall Sainsbury's" }
] };
const chingfordStops657 = [
  { id: 'GROVE-P', name: 'Grove Road', indicator: 'P' },
  { id: 'MAPLETON-HA', name: 'Mapleton Road', indicator: 'HA' },
  { id: 'GROVE-N', name: 'Grove Road', indicator: 'N' },
  { id: '657-END', name: "Bancroft's School" },
  { id: '657-ORIGIN', name: "Salisbury Hall Sainsbury's" }
];
function chingfordTimetable657({ stopId, direction, patternId, destination, time, adjacentTime, adjacentId }) {
  return {
    lineId: '657', lineName: '657', direction, stations: chingfordStops657,
    timetable: { departureStopId: stopId, routes: [{ stationIntervals: [{ id: patternId, intervals: [
      { stopId, timeToArrival: 0 }, { stopId: adjacentId, timeToArrival: 2 }, { stopId: destination === "Bancroft's School" ? '657-END' : '657-ORIGIN', timeToArrival: 40 }
    ] }], schedules: [{ name: 'Schooldays', knownJourneys: [{ intervalId: patternId, vehicleJourneyId: `657-${direction}-morning`, stopTimes: [
      { stopId, departureTime: { hour: Math.floor(time / 60), minute: time % 60 } },
      { stopId: adjacentId, departureTime: { hour: Math.floor(adjacentTime / 60), minute: adjacentTime % 60 } }
    ] }] }] }] }
  };
}
const chingfordTimetables657 = {
  'GROVE-P': chingfordTimetable657({ stopId: 'GROVE-P', direction: 'outbound', patternId: '657-out', destination: "Bancroft's School", time: 476, adjacentTime: 478, adjacentId: 'MAPLETON-HA' }),
  'GROVE-N': chingfordTimetable657({ stopId: 'GROVE-N', direction: 'inbound', patternId: '657-in', destination: "Salisbury Hall Sainsbury's", time: 982, adjacentTime: 984, adjacentId: '657-ORIGIN' })
};
const report = { schema: 'atlas-bus-s2e1-normal-product-browser-word-audit-v1', candidateRoot, candidateRun: '39430415441', candidateArtifactId: '12275615359', candidateDigest: 'sha256:5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471', candidateProducerSha: '151199cc914c235870f444d26b03c2309edbd035', acquisitionAttempted: false, publicationAttempted: false, deploymentAttempted: false, controls: {}, failures: [] };
if (process.env.ATLAS_C4_ENFIELD_EVIDENCE_ONLY === '1') report.enfieldIbusFixture = {
  source: 'Exact checked-in TfL iBus Base_Version 20261009 index plus selected Run #75 NaPTAN StopPoint; deterministic TfL API response fixture; no live TfL requests.',
  baseVersion: enfieldIbusIndex.baseVersion,
  validFrom: enfieldIbusIndex.validFrom,
  validTo: enfieldIbusIndex.validTo,
  route313: {
    stopId: enfieldFixtures.get('enfield-313-e2e').stopId,
    patternId: enfieldFixtures.get('enfield-313-e2e').patternId,
    journeyIdx: enfieldFixtures.get('enfield-313-e2e').activeJourney.journeyIdx,
    operatorCode: enfieldFixtures.get('enfield-313-e2e').activeJourney.operatorCode,
    operatorName: enfieldFixtures.get('enfield-313-e2e').activeJourney.operatorName,
    orderedStopPointIds: enfieldFixtures.get('enfield-313-e2e').ids
  },
  route329CandidateStop: { stopId: enfieldFixtures.get('enfield-329-e2e').stopId, name: enfieldFixtures.get('enfield-329-e2e').stopName, candidateRoutes: enfieldFixtures.get('enfield-329-e2e').candidateStopRoutes },
  route329ServiceLineMappings: enfieldIbusIndex.serviceLines.filter(line => String(line.serviceLineNo) === '329'),
  route329ProductivePatterns: enfieldIbusIndex.patterns.filter(pattern => String(pattern.serviceLineNo) === '329' && Number(pattern.patternType) === 1).length
};
report.enfieldCoverage = process.env.ATLAS_C4_ENFIELD_EVIDENCE_ONLY === '1'
  ? 'Dedicated evidence-only mode selects exact Run #75 candidate stops for routes 313 and 329, uses the checked-in 20261009 iBus index for a controlled TfL 313 response, returns deterministic no-current TfL evidence for 329, and checks the final production Browser and Word outputs. No live TfL request is made.'
  : 'The normal-shell audit intentionally does not fabricate TfL StopPoint records; with live TfL disabled, the frozen candidate contains no TfL StopPoint response fixture for Enfield.';
const errors = [];
report.chingfordFixtureNote = 'Chingford route 657 browser regression uses the existing fixture-backed timetable golden. Fixture StopPoint coordinates are anchored at the confirmed control point solely for deterministic radius matching and are not represented as live TfL location evidence.';
const failedRequests = [];
const failedResponses = [];
const externalRequests = [];
const statusManifestFallbacks = [];
let server;
let browser;
let activeControl = null;

function zipEntry(bytes, entryName) {
  const signature = 0x02014b50;
  for (let offset = 0; offset + 46 <= bytes.length;) {
    if (bytes.readUInt32LE(offset) !== signature) { offset += 1; continue; }
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name === entryName) {
      const localOffset = bytes.readUInt32LE(offset + 42);
      const localNameLength = bytes.readUInt16LE(localOffset + 26);
      const localExtraLength = bytes.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.subarray(start, start + compressedSize);
      if (method === 0) return data.toString('utf8');
      if (method === 8) return inflateRawSync(data).toString('utf8');
      throw new Error(`Unsupported Word ZIP compression method ${method}.`);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`Generated Word export did not contain ${entryName}.`);
}

function wordText(xml) {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)].map(match => match[1]
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))).join(' ');
}

function wordParagraphs(xml) {
  return [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map(([, paragraph]) => wordText(paragraph));
}

function wordTables(xml) {
  return [...xml.matchAll(/<w:tbl(?:\s[^>]*)?>([\s\S]*?)<\/w:tbl>/g)].map(([, table]) =>
    [...table.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map(([, row]) =>
      [...row.matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)].map(([, cell]) => wordText(cell))));
}

function fail(id, reason) { report.failures.push({ id, reason }); }

try {
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname === '/atlas/data/status/manifest.json') {
        // The immutable review candidate and code checkout do not carry the
        // separately published freshness-status manifest. Return an empty
        // local response so the normal app handles status as unavailable
        // without turning this unrelated missing file into a 404/browser error.
        statusManifestFallbacks.push(pathname);
        response.writeHead(204);
        response.end();
        return;
      }
      const marker = pathname.startsWith('/atlas/data/bus-tnds/') ? '/atlas/data/bus-tnds/' : pathname.startsWith('/atlas/data/bus/') ? '/atlas/data/bus/' : null;
      const root = marker ? path.join(candidateRoot, pathname.startsWith('/atlas/data/bus-tnds/') ? 'atlas/data/bus-tnds' : 'atlas/data/bus') : repositoryRoot;
      const relative = marker ? pathname.slice(marker.length) : pathname.replace(/^\/+/, '');
      const target = relative.endsWith('/') ? `${relative}index.html` : relative || 'index.html';
      const file = path.resolve(root, target);
      if (file !== root && !file.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe static path.');
      const bytes = await readFile(file);
      const extension = path.extname(file).toLowerCase();
      const type = ({ '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.gz': 'application/gzip', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' })[extension] || 'application/octet-stream';
      response.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'content-length': bytes.length });
      response.end(bytes);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  const baseUrl = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}/`));
  });
  browser = await launchAtlasBrowser(chromium, { headless: true });
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));
  page.on('response', response => { if (response.status() >= 400) failedResponses.push({ url: response.url(), status: response.status() }); });
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost', 'tile.openstreetmap.org', 'routing.openstreetmap.de', 'api.tfl.gov.uk'].includes(url.hostname)) externalRequests.push(request.url());
  });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av3nGQAAAABJRU5ErkJggg==', 'base64') }));
  await page.route('https://routing.openstreetmap.de/**', route => {
    const url = route.request().url();
    if (url.includes('/table/')) {
      const points = decodeURIComponent(url.split('/').at(-1).split('?')[0]).split(';');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', distances: [points.map((_p, index) => index ? 100 : 0)], durations: [points.map((_p, index) => index ? 60 : 0)] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ distance: 100, duration: 60, geometry: { type: 'LineString', coordinates: [[-0.03, 51.68], [-0.031, 51.681]] } }] }) });
  });
  await page.route('https://api.tfl.gov.uk/**', route => {
    if (activeControl?.id === 'waltham-cross') {
      const url = new URL(route.request().url());
      let body = [];
      if (url.pathname === '/StopPoint') {
        body = { stopPoints: [{
          id: tflWalthamOperatingFixture.requestedStopPointId,
          naptanId: tflWalthamOperatingFixture.requestedStopPointId,
          commonName: 'Waltham Cross Bus Station', indicator: 'Stop A',
          lat: 51.6851, lon: -0.0341, stopType: 'NaptanPublicBusCoachTram',
          lines: ['217', '317', '327'].map(id => ({ id, name: id }))
        }] };
      } else {
        const timetableMatch = url.pathname.match(/^\/Line\/([^/]+)\/Timetable\/([^/]+)$/);
        if (timetableMatch && decodeURIComponent(timetableMatch[2]) === tflWalthamOperatingFixture.requestedStopPointId) {
          const response = tflWalthamByLine.get(decodeURIComponent(timetableMatch[1]));
          if (response) {
            body = structuredClone(response);
            const stations = body.timetable.routes.flatMap(item => item.stationIntervals.flatMap(pattern => pattern.intervals.map(interval => ({ id: interval.stopId, name: interval.stopId }))));
            body.stations = stations;
            body.stops = stations;
            body.timetable.departureStopId = tflWalthamOperatingFixture.requestedStopPointId;
          }
        }
      }
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    }
    if (activeControl?.id?.startsWith('enfield-') && enfieldFixtures.has(activeControl.id)) {
      const fixture = enfieldFixtures.get(activeControl.id);
      const url = new URL(route.request().url());
      let body = [];
      if (url.pathname === '/StopPoint') body = { stopPoints: fixture.stopPoints };
      else if (url.pathname === `/Line/${fixture.routeNumber ?? '313'}/Route`) body = fixture.route;
      else if (url.pathname === `/Line/${fixture.routeNumber ?? '313'}/Timetable/${fixture.stopId}`) body = fixture.timetable;
      else if (url.pathname === `/Line/${fixture.routeNumber ?? '313'}/Route/Sequence/outbound`) body = fixture.sequence;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    }
    if (activeControl?.id !== 'chingford') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' });
    const url = new URL(route.request().url());
    let body = [];
    if (url.pathname === '/StopPoint') body = { stopPoints: ['GROVE-P', 'GROVE-N'].map((id, index) => ({ id, naptanId: id, commonName: 'Grove Road', indicator: index ? 'N' : 'P', towards: index ? "Salisbury Hall Sainsbury's" : "Bancroft's School", lat: 51.616596, lon: -0.0117893, stopType: 'NaptanPublicBusCoachTram', lines: [{ id: '657', name: '657' }] })) };
    else if (url.pathname === '/Line/657/Route') body = [chingfordRouteMetadata657];
    else if (url.pathname === '/Line/657/Timetable/GROVE-P') body = chingfordTimetables657['GROVE-P'];
    else if (url.pathname === '/Line/657/Timetable/GROVE-N') body = chingfordTimetables657['GROVE-N'];
    else if (url.pathname.startsWith('/Line/657/Route/Sequence/')) {
      const direction = url.pathname.endsWith('/inbound') ? 'inbound' : 'outbound';
      body = { lineId: '657', direction, stopPointSequences: [{ branchId: direction === 'inbound' ? 2 : 1, serviceType: 'Regular', stopPoint: direction === 'inbound'
        ? [{ naptanId: '657-END' }, { naptanId: 'GROVE-N' }, { naptanId: '657-ORIGIN' }]
        : [{ naptanId: '657-ORIGIN' }, { naptanId: 'GROVE-P' }, { naptanId: '657-END' }] }] };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  for (const control of controls) {
    activeControl = control;
    const outcome = { label: control.label };
    try {
      await page.goto(new URL('atlas/', baseUrl).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.locator('.coordinate-details > summary').click();
      await page.locator('#latitude').fill(String(control.latitude));
      await page.locator('#longitude').fill(String(control.longitude));
      await page.locator('#coordinatesForm button[type="submit"]').click();
      await page.locator('#confirmAssessmentPoint').click();
      assert.equal(await page.locator('#findStops').isEnabled(), true, 'Normal workflow did not enable Bus assessment after confirming the site.');
      await page.locator('#findStops').click();
      await page.locator('#taskStatusMessage').waitFor({ state: 'visible', timeout: 180000 });
      const continueStaged = page.locator('#assessmentScope button').filter({ hasText: 'Continue full staged assessment' });
      await page.waitForFunction(() => {
        const phase = document.querySelector('#taskStatus')?.dataset.phase;
        const terminal = ['complete', 'partial', 'unavailable'].includes(phase);
        const staged = [...document.querySelectorAll('#assessmentScope button')].some(button => button.textContent.includes('Continue full staged assessment'));
        return terminal || staged;
      }, undefined, { timeout: 180000 });
      if (await continueStaged.count()) await continueStaged.click();
      try {
        await page.waitForFunction(() => ['complete', 'partial', 'unavailable'].includes(document.querySelector('#taskStatus')?.dataset.phase), undefined, { timeout: 180000 });
      } catch (error) {
        const lastStatus = await page.evaluate(() => ({
          phase: document.querySelector('#taskStatus')?.dataset.phase || null,
          message: document.querySelector('#taskStatusMessage')?.textContent?.trim() || null,
          busy: document.querySelector('#taskStatus')?.getAttribute('aria-busy') || null,
          stagedScopeVisible: document.querySelector('#assessmentScope')?.hidden === false
        }));
        throw new Error(`${error.message}; last normal-workflow state: ${JSON.stringify(lastStatus)}`);
      }
      const serviceTable = page.locator('.bus-service-summary');
      const wrap = serviceTable.locator('xpath=ancestor::div[contains(@class,"table-wrap")]');
      const scroll = await wrap.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
      assert.ok(scroll.scroll <= scroll.client + 1, `Bus Service Summary has horizontal overflow (${scroll.scroll}px > ${scroll.client}px).`);
      const pageWidth = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(pageWidth.scroll <= pageWidth.client + 1, `Normal planner page has horizontal overflow (${pageWidth.scroll}px > ${pageWidth.client}px).`);
      const sourceHeader = serviceTable.locator('thead th').last();
      assert.equal(await sourceHeader.innerText(), 'Source', 'Source must remain the final planner-facing column.');
      const sourceRows = serviceTable.locator('tbody tr:not(.service-note) td[data-label="Source"]');
      const rowCount = await sourceRows.count();
      assert.ok(rowCount > 0, 'Normal rendered Bus assessment has no service rows.');
      const sourceSamples = [];
      for (const index of [...new Set([0, Math.floor((rowCount - 1) / 2), rowCount - 1])]) {
        const cell = sourceRows.nth(index);
        await cell.scrollIntoViewIfNeeded();
        const visible = await cell.evaluate(element => {
          const panel = element.closest('.table-wrap').getBoundingClientRect();
          const bounds = element.getBoundingClientRect();
          return { left: bounds.left >= panel.left - 1, right: bounds.right <= panel.right + 1, text: element.innerText.trim() };
        });
        assert.ok(visible.left && visible.right, `Source cell at table row ${index + 1} is not horizontally visible.`);
        sourceSamples.push({ row: index + 1, ...visible });
      }
      const technical = page.locator('#developerDiagnostics');
      assert.equal(await technical.getAttribute('hidden') !== null, true, 'Developer diagnostics must be absent from ordinary planner mode.');
      await page.locator('details > summary').filter({ hasText: 'Sources and checks' }).click();
      const checksText = await page.locator('#plannerChecks').innerText();
      assert.doesNotMatch(checksText, /SpecialDaysOperation|TNDS .*special dates require review/i, 'Sources and checks exposes raw per-service special-day warnings.');
      const rendered = await serviceTable.locator('tbody tr:not(.service-note)').evaluateAll(rows => rows.map(row => Object.fromEntries([...row.querySelectorAll('td[data-label]')].map(cell => [cell.dataset.label, cell.innerText.replace(/\s+/g, ' ').trim()]))));
      const renderedServiceNotes = await serviceTable.locator('tbody tr.service-note').allInnerTexts();
      const byRoute = new Map();
      for (const row of rendered) {
        const route = row.Route || '';
        byRoute.set(route, [...(byRoute.get(route) ?? []), row]);
      }
      const duplicatePresentations = [...byRoute].flatMap(([route, rows]) => {
        const keys = rows.map(row => [row['Direction / main service pattern'], row['Principal locations'], row['Typical frequency']].join('|').toLowerCase().replace(/\s+/g, ' ').trim());
        return new Set(keys).size !== keys.length ? [route] : [];
      });
      assert.equal(duplicatePresentations.length, 0, `Normal planner shows visually duplicate rows for routes ${duplicatePresentations.join(', ')}.`);
      const unexplainedMultiRows = [...byRoute].filter(([, rows]) => rows.length > 2 && rows.some(row => !row['Direction / main service pattern'] || !row['Principal locations']));
      assert.equal(unexplainedMultiRows.length, 0, `Routes with more than two rows need visible direction and principal-branch labels: ${unexplainedMultiRows.map(([route]) => route).join(', ')}.`);
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await page.locator('#exportBusWord').click();
      const download = await downloadPromise;
      const wordDirectory = reportArg ? path.join(path.dirname(path.resolve(reportArg)), 'word-exports') : os.tmpdir();
      await mkdir(wordDirectory, { recursive: true });
      const wordPath = path.join(wordDirectory, `atlas-s2e1-${control.id}.docx`);
      await download.saveAs(wordPath);
      const documentXml = zipEntry(await readFile(wordPath), 'word/document.xml');
      const exportedWordText = wordText(documentXml);
      const exportedWordParagraphs = wordParagraphs(documentXml);
      const exportedWordTables = wordTables(documentXml);
      const wordServiceTable = exportedWordTables.find(table => table[0]?.includes('Direction / main service pattern') && table[0]?.includes('Typical frequency'));
      assert.ok(wordServiceTable, 'Generated Word export has no planner-facing Bus Service Summary table.');
      const wordHeaders = wordServiceTable[0];
      const wordRows = wordServiceTable.slice(1).map(cells => Object.fromEntries(wordHeaders.map((header, index) => [header, cells[index] ?? ''])));
      outcome.renderedRows = rendered;
      outcome.renderedServiceNotes = renderedServiceNotes;
      outcome.generatedWordRows = wordRows;
      const parityFields = ['Route', 'Operator', 'Direction / main service pattern', 'Served at', 'Principal locations', 'Typical frequency', 'Operating period at stop'];
      const normalized = value => String(value ?? '').replace(/[’‘]/g, "'").replace(/\s*;\s*/g, ' ').replace(/\s+/g, ' ').trim();
      for (const browserRow of rendered) {
        const wordRow = wordRows.find(candidate => normalized(candidate.Route) === normalized(browserRow.Route)
          && normalized(candidate['Direction / main service pattern']) === normalized(browserRow['Direction / main service pattern'])
          && normalized(candidate['Served at']) === normalized(browserRow['Served at']));
        assert.ok(wordRow, `Generated Word row is missing browser route/direction/assessed-stop row ${browserRow.Route} ${browserRow['Direction / main service pattern']} ${browserRow['Served at']}.`);
        for (const field of parityFields) assert.equal(normalized(wordRow[field]), normalized(browserRow[field]), `Browser/Word ${field} differs for route ${browserRow.Route}.`);
      }
      if (control.id.startsWith('enfield-')) {
        const browser313 = rendered.filter(row => normalized(row.Route) === '313');
        if (control.id === 'enfield-313-e2e') {
        assert.ok(browser313.length, 'Enfield production Browser did not render the fixture-backed TfL 313 service.');
        const expectedOperator313 = normalized(enfieldFixtures.get('enfield-313-e2e').activeJourney.operatorName);
        assert.ok(browser313.every(row => normalized(row.Operator) === expectedOperator313), `Enfield route 313 Browser operator differs from the active iBus operator ${expectedOperator313}.`);
        const word313 = wordRows.filter(row => normalized(row.Route) === '313');
        assert.equal(word313.length, browser313.length, 'Enfield route 313 Browser/Word row counts differ.');
        assert.ok(word313.every(row => normalized(row.Operator) === expectedOperator313), `Enfield route 313 Word operator differs from the active iBus operator ${expectedOperator313}.`);
        const browser329 = rendered.filter(row => normalized(row.Route) === '329');
        const word329 = wordRows.filter(row => normalized(row.Route) === '329');
        outcome.enfieldOperatorTrace = {
          route313: { browser: browser313.map(row => row.Operator), word: word313.map(row => row.Operator), matching: true },
          route329: { browserRowCount: browser329.length, wordRowCount: word329.length, browser: browser329.map(row => row.Operator), word: word329.map(row => row.Operator), matching: browser329.length === word329.length && browser329.every((row, index) => normalized(row.Operator) === normalized(word329[index]?.Operator)) },
          route329IndexEvidence: { serviceLineMappings: enfieldIbusIndex.serviceLines.filter(line => String(line.serviceLineNo) === '329'), productivePatterns: enfieldIbusIndex.patterns.filter(pattern => String(pattern.serviceLineNo) === '329' && Number(pattern.patternType) === 1).length }
        };
        assert.equal(outcome.enfieldOperatorTrace.route329.matching, true, 'Enfield route 329 Browser and Word operator values differ.');
        } else {
          const browser329 = rendered.filter(row => normalized(row.Route) === '329');
          const word329 = wordRows.filter(row => normalized(row.Route) === '329');
          assert.ok(browser329.length, 'Enfield production Browser did not render the frozen-candidate BODS 329 service.');
          assert.equal(word329.length, browser329.length, 'Enfield route 329 Browser/Word row counts differ.');
          assert.ok(browser329.every((row, index) => normalized(row.Operator) === normalized(word329[index]?.Operator)), 'Enfield route 329 Browser/Word operators differ.');
          outcome.enfieldRoute329OperatorTrace = {
            candidateStopId: enfieldFixtures.get('enfield-329-e2e').stopId,
            browser: browser329.map(row => row.Operator), word: word329.map(row => row.Operator),
            browserRowCount: browser329.length, wordRowCount: word329.length, matching: true,
            iBusServiceLineMappings: enfieldIbusIndex.serviceLines.filter(line => String(line.serviceLineNo) === '329'),
            iBusProductivePatterns: enfieldIbusIndex.patterns.filter(pattern => String(pattern.serviceLineNo) === '329' && Number(pattern.patternType) === 1).length
          };
        }
      }
      outcome.status = await page.locator('#taskStatusMessage').innerText();
      outcome.renderedRows = rendered;
      outcome.renderedServiceNotes = renderedServiceNotes;
      outcome.routesWithMoreThanTwoRows = [...byRoute].filter(([, rows]) => rows.length > 2).map(([route, rows]) => ({ route, rows }));
      outcome.sourceColumn = { visibleOnTopMiddleBottom: true, samples: sourceSamples, overflow: scroll };
      outcome.technicalDetailsHidden = true;
      outcome.sourcesAndChecks = checksText;
      outcome.wordFilename = download.suggestedFilename();
      outcome.wordArtifact = wordPath;
      outcome.wordText = exportedWordText;
      if (control.id === 'pipers-lane') {
        const rows230 = rendered.filter(row => /^230$/i.test(row.Route || ''));
        assert.equal(rows230.length, 1, `Pipers normal UI must present one 230 principal row; got ${rows230.length}.`);
        assert.match(rows230[0].Source, /BODS/i, 'Pipers route 230 must identify BODS as its primary displayed timetable source.');
        assert.match(rows230[0]['Served at'] || '', /\*/i, 'Pipers route 230 row must identify the selected assessed stop that controls its frequency.');
        assert.ok(renderedServiceNotes.some(note => /230.*Circular service/i.test(note)), 'Pipers route 230 circular evidence is missing from the normal service presentation.');
        assert.ok(rendered.some(row => row.Route === '231'), 'Pipers TNDS-only route 231 must remain available in the normal planner.');
        assert.doesNotMatch(rows230[0]['Typical frequency'], /5\s*mins/i, 'Pipers rendered route 230 must not show five-minute inflation.');
        assert.match(rows230[0]['Typical frequency'], /Sun: No scheduled service/i, 'Pipers rendered BODS-primary route 230 must retain the frozen Sunday no-service calendar.');
        assert.match(exportedWordText, /230[\s\S]{0,500}Sun: No scheduled service/i, 'Generated Word export does not preserve the route 230 Sunday no-service calendar.');
        assert.match(exportedWordText, /230.*60\s*mins/i, 'Generated Word export does not preserve the hourly route 230 frequency.');
        const rows46 = rendered.filter(row => /^46$/i.test(row.Route || ''));
        if (rows46.length) {
          assert.doesNotMatch(rows46.map(row => row['Typical frequency']).join(' '), /(?:every|~)\s*5\s*mins/i, 'Pipers route 46 must not inherit the implausible five-minute cross-stop frequency.');
          assert.ok(rows46.every(row => /\*/.test(row['Served at'] || '')), 'Pipers route 46 frequency rows must expose their selected assessed stop.');
        }
        assert.doesNotMatch(exportedWordText, /(?:every|~)\s*5\s*mins/i, 'Pipers Word export must not retain five-minute route frequency inflation.');
      }
      if (control.id === 'waltham-cross') {
        assert.doesNotMatch(`${checksText} ${exportedWordText}`, /Planner review required for:\s*(?:217|279|317|327|491|N279)|timetable data unavailable\/incomplete for 1 assessed stop/i, 'Waltham output contains a known false review/incomplete warning.');
        const rows217 = rendered.filter(row => /^217$/i.test(row.Route || ''));
        assert.ok(rows217.length, 'Waltham route 217 operating-period regression control is missing.');
        assert.doesNotMatch(rows217.map(row => row['Operating period at stop']).join(' '), /00:05\s*[–-]\s*00:25/i, 'Waltham route 217 must not collapse to the reported late-night-only period.');
        assert.ok(rows217.some(row => /TfL/i.test(row.Source) && /04:00.*00:59/i.test(row['Operating period at stop'])), 'Waltham route 217 must retain the fixture-backed full TfL span at the selected stop in the normal Browser table.');
        assert.match(exportedWordText, /217[\s\S]{0,500}04:00.*00:59/i, 'Waltham Word export does not preserve the fixture-backed route 217 operating span.');
        assert.doesNotMatch(exportedWordText, /Source\s*:\s*TfL/i, 'Word output remains source-neutral while Browser identifies TfL authority.');
        const route13 = rendered.find(row => row.Route === '13');
        assert.ok(route13, 'Waltham route 13 principal row is missing.');
        assert.match(route13['Direction / main service pattern'] || '', /Towards\s+The Talbot/i, 'Waltham route 13 principal direction is missing.');
        assert.match(route13['Principal locations'] || '', /Waltham Cross Railway Station/i, 'Waltham route 13 principal locations are missing.');
      }
      if (control.id === 'chingford') {
        const route657 = rendered.find(row => row.Route === '657');
        assert.ok(route657, 'Chingford golden control lost route 657.');
        assert.match(route657['Typical frequency'], /Mon-Fri(?: \(School days\))?: 1 journey\/day/i, 'Chingford route 657 fixture golden frequency changed.');
        assert.match(route657['Operating period at stop'], /07:56|16:22/, 'Chingford route 657 fixture golden timetable time changed.');
      }
      if (control.id === 'pe1') {
        const rows102 = rendered.filter(row => row.Route === '102');
        const keys102 = rows102.map(row => [row['Direction / main service pattern'], row['Principal locations'], row['Typical frequency']].join('|').toLowerCase().replace(/\s+/g, ' ').trim());
        assert.ok(rows102.length > 0 && new Set(keys102).size === keys102.length, `PE1 route 102 has no rendered rows or duplicate presentations (${rows102.length} total, ${new Set(keys102).size} distinct).`);
        const rowsX4 = rendered.filter(row => row.Route === 'X4');
        const x4Notes = renderedServiceNotes.filter(note => /\bX4\b/i.test(note) && /Kings School/i.test(note)).join(' ');
        const x4BrowserAccepted = rowsX4.length >= 2
          && rowsX4.some(row => /Sat:|Sun:/i.test(`${row['Typical frequency']} ${row['Operating period at stop']}`))
          && /X4.*Kings School.*(?:School-day journeys only|weekdays only)/i.test(x4Notes);
        assert.ok(x4BrowserAccepted, `PE1 X4 does not visibly preserve its regular principal rows and a route-scoped qualified school short working in the normal browser UI. Rendered X4 rows=${rowsX4.length}; X4 note text=${JSON.stringify(x4Notes)}.`);
        assert.doesNotMatch(x4Notes, /X4\s*[–-]\s*School-day journeys only\./i, 'PE1 X4 must not be labelled school-only as a whole route.');
        assert.doesNotMatch(exportedWordText, /X4\s*[–-]\s*School-day journeys only\./i, 'PE1 Word must not classify the whole X4 as school-only.');
        const x4WordShortWorking = exportedWordParagraphs.filter(paragraph => /Short workings:/i.test(paragraph)
          && /\bX4\b/i.test(paragraph) && /Kings School/i.test(paragraph)).join(' ');
        assert.match(x4WordShortWorking, /X4\b[^.]*Kings School[^.]*(?:School-day journeys only|weekdays only)/i, 'PE1 Word export does not preserve the qualification within the X4 school short-working paragraph.');
        assert.ok(rows102.every(row => row['Direction / main service pattern'] && row['Principal locations']), 'Remaining PE1 route 102 rows lack visible distinction labels.');
        const inflatedFrequencyControls = [
          ['1', /Werrington Centre/i, 'Mon-Fri'],
          ['5', /Yaxley/i, 'Sun'],
          ['33', /City Hospital/i, 'Mon-Sat']
        ];
        for (const [route, direction, days] of inflatedFrequencyControls) {
          const row = rendered.find(candidate => candidate.Route === route && direction.test(candidate['Direction / main service pattern'] || ''));
          assert.ok(row, `PE1 route ${route} selected direction ${direction} is missing.`);
          assert.match(row['Served at'] || '', /\*/, `PE1 route ${route} ${direction} does not identify its selected assessed stop.`);
          const dayPattern = days === 'Mon-Fri' ? 'Mon-(?:Fri|Sat|Sun)' : days;
          const frequency = row['Typical frequency'].match(new RegExp('(?:^|\\s)' + dayPattern + ':\\s*([\\s\\S]*?)(?=\\s(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:-|:)|$)', 'i'))?.[1];
          assert.ok(frequency, `PE1 route ${route} has no ${days} frequency for selected direction ${direction}.`);
          assert.doesNotMatch(frequency, /(?:every|~)\s*5\s*mins/i, `PE1 route ${route} ${direction} remains approximately every five minutes in ${days}.`);
        }
        assert.doesNotMatch(exportedWordText, /1[\s\S]{0,300}Towards Werrington Centre[\s\S]{0,250}(?:every|~)\s*5\s*mins/i, 'PE1 Word route 1 Werrington frequency remains inflated.');
        assert.doesNotMatch(exportedWordText, /5[\s\S]{0,300}Towards Yaxley[\s\S]{0,250}Sun:[^\n]{0,50}(?:every|~)\s*5\s*mins/i, 'PE1 Word route 5 Yaxley Sunday frequency remains inflated.');
        assert.doesNotMatch(exportedWordText, /33[\s\S]{0,300}Towards City Hospital[\s\S]{0,250}(?:every|~)\s*5\s*mins/i, 'PE1 Word route 33 City Hospital frequency remains inflated.');
        for (const route of ['27', '101', '201']) {
          const routeGlobalQualification = new RegExp(`Service qualification:\\s*[^.]*\\b${route}\\s*[–-]\\s*(?:School-day journeys only|Non-school days only)`, 'i');
          assert.doesNotMatch(renderedServiceNotes.join(' '), routeGlobalQualification,
            `PE1 Browser route ${route} must not receive a whole-route calendar qualification from a variant.`);
          assert.doesNotMatch(exportedWordText, routeGlobalQualification,
            `PE1 Word route ${route} must not receive a whole-route calendar qualification from a variant.`);
        }
        assert.doesNotMatch(renderedServiceNotes.join(' '), /Service qualification:\s*Operating days could not be fully confirmed/i,
          'PE1 Browser must not show an unscoped operating-days qualification left by route 101 calendar evidence.');
        assert.doesNotMatch(exportedWordText, /Service qualification:\s*Operating days could not be fully confirmed/i,
          'PE1 Word must not show an unscoped operating-days qualification left by route 101 calendar evidence.');
      }
      if (control.id === 'enfield') {
        for (const route of ['121', '191', 'W8']) {
          const routeRows = rendered.filter(row => row.Route === route);
          if (routeRows.length) {
            const routeNotes = renderedServiceNotes.filter(note => new RegExp(`(?:^|\\b)${route}(?:\\b|\\s*[–-])`, 'i').test(note)).join(' ');
            assert.doesNotMatch(`${routeRows.map(row => `${row['Typical frequency']} ${row['Operating period at stop']}`).join(' ')} ${routeNotes}`,
              new RegExp(`${route}\\s*[–-]\\s*School-day journeys only|School-day journeys only\\.?`, 'i'), `Enfield normal term-time route ${route} was classified as school-only.`);
          }
        }
        const route629 = rendered.filter(row => row.Route === '629');
        if (route629.length) {
          const route629Notes = renderedServiceNotes.filter(note => /(?:^|\b)629(?:\b|\s*[–-])/i.test(note)).join(' ');
          assert.match(`${route629.map(row => `${row['Typical frequency']} ${row['Operating period at stop']}`).join(' ')} ${route629Notes}`, /School days|School-day journeys only/i,
            'Enfield 629 must remain qualified as a school-day service where present.');
        }
      }
      report.controls[control.id] = outcome;
    } catch (error) {
      outcome.outcome = 'FAIL';
      outcome.error = error.message;
      report.controls[control.id] = outcome;
      fail(control.id, error.message);
    }
  }
  assert.equal(errors.length, 0, `Browser console errors: ${errors.join('; ')}`);
  assert.equal(failedRequests.length, 0, `Failed browser requests: ${JSON.stringify(failedRequests)}`);
  assert.equal(failedResponses.length, 0, `HTTP failures: ${JSON.stringify(failedResponses)}`);
  assert.equal(externalRequests.length, 0, `Unexpected external requests: ${externalRequests.join(', ')}`);
} catch (error) {
  fail('audit-harness', error.message);
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
}

report.browserErrors = errors;
report.failedRequests = failedRequests;
report.failedResponses = failedResponses;
report.externalRequests = externalRequests;
report.statusManifestFallbacks = statusManifestFallbacks;
report.statusManifestNote = 'The Run #75 candidate and production checkout do not include the separately published status manifest; the localhost audit supplies 204 No Content, and the normal app reports status unavailable. This response is independent of Bus assessment data.';
report.readiness = report.failures.length ? 'NOT_READY_FOR_MANUAL_RE-ACCEPTANCE' : 'READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_RE-ACCEPTANCE';
if (reportArg) {
  const destination = path.resolve(reportArg);
  await mkdir(path.dirname(destination), { recursive: true });
  await (await import('node:fs/promises')).writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.failures.length) {
  const annotation = report.failures.map(failure => `${failure.id}: ${failure.reason}`).join(' | ')
    .replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  process.stdout.write(`::error title=Normal-product acceptance failure::${annotation}\n`);
  process.exitCode = 1;
}
