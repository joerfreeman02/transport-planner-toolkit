import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareTnds } from '../../tools/atlas-bus-data/prepare_tnds.mjs';
import { launchAtlasBrowser } from './playwright-launch.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const repositoryRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-tnds-browser-e2e-'));
const dataRoot = path.join(temporaryRoot, 'data');
const tndsRoot = path.join(temporaryRoot, 'tnds');
const inputRoot = path.join(temporaryRoot, 'source', 'SE');
const selectedStop = { id: '2100A1', name: 'Pipers Lane', routes: ['230', '231'], timetableAuthority: 'NaPTAN' };
let server;
let browser;

function serviceXml(index) {
  const code = `runtime-${String(index).padStart(3, '0')}`;
  return `<TransXChange SchemaVersion="2.5"><Operators><Operator id="OP"><OperatorCode>OP</OperatorCode><TradingName>Runtime Fixture Operator</TradingName></Operator></Operators><Services><Service id="${code}"><ServiceCode>${code}</ServiceCode><LineName>231</LineName><RegisteredOperatorRef>OP</RegisteredOperatorRef><StandardService><JourneyPattern id="JP-${code}"><Direction>outbound</Direction><Origin>Brickhill Park</Origin><Destination>Dunstable Asda</Destination><JourneyPatternSectionRefs>JPS-${code}</JourneyPatternSectionRefs></JourneyPattern></StandardService></Service></Services><StopPoints><AnnotatedStopPointRef><StopPointRef>2100A1</StopPointRef><CommonName>Pipers Lane</CommonName></AnnotatedStopPointRef><AnnotatedStopPointRef><StopPointRef>2100A2</StopPointRef><CommonName>High Street</CommonName></AnnotatedStopPointRef></StopPoints><JourneyPatternSections><JourneyPatternSection id="JPS-${code}"><JourneyPatternTimingLink><From><StopPointRef>2100A1</StopPointRef></From><To><StopPointRef>2100A2</StopPointRef></To><RunTime>PT10M</RunTime></JourneyPatternTimingLink></JourneyPatternSection></JourneyPatternSections><VehicleJourneys><VehicleJourney><VehicleJourneyCode>V-${code}</VehicleJourneyCode><JourneyPatternRef>JP-${code}</JourneyPatternRef><DepartureTime>08:00:00</DepartureTime><OperatingProfile><MondayToFriday>true</MondayToFriday></OperatingProfile></VehicleJourney></VehicleJourneys></TransXChange>`;
}

try {
  await fs.mkdir(path.join(dataRoot, 'services'), { recursive: true });
  await fs.mkdir(inputRoot, { recursive: true });
  const bodsService = { id: 'bods:230', routeNumber: '230', operator: 'Centrebus', origin: 'Lyons Community Centre', destination: 'Lyons Community Centre', timetableSource: 'BODS', stopSchedules: { '2100A1': { monday: [480], tuesday: [480], wednesday: [480], thursday: [480], friday: [480] } }, routePatternStopIds: ['2100A1', '2100A2'] };
  await fs.writeFile(path.join(dataRoot, 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-data-v1', generatedAt: '2026-10-14T00:00:00.000Z', serviceShardKeyLength: 5, sources: { bods: { url: 'https://official.example/bods', sha256: 'fixture-bods', regions: ['south-east'] }, naptan: { url: 'https://official.example/naptan', sha256: 'fixture-naptan' } }, serviceShards: { '2100A': ['services/2100A-bods.json'] }, representativeDates: {} }));
  await fs.writeFile(path.join(dataRoot, 'services', '2100A-bods.json'), JSON.stringify({ schema: 'atlas-prepared-bus-data-v1', services: [bodsService] }));
  await Promise.all(Array.from({ length: 50 }, (_, index) => fs.writeFile(path.join(inputRoot, `SE-${String(index).padStart(3, '0')}.xml`), serviceXml(index))));
  const preparation = await prepareTnds({ input: path.join(temporaryRoot, 'source'), output: tndsRoot, preparedAt: '2026-10-14T00:00:00.000Z', maxRuntimeShardBytes: 8 * 1024 });
  const tndsManifest = JSON.parse(await fs.readFile(path.join(tndsRoot, 'manifest.json'), 'utf8'));
  assert.ok(tndsManifest.runtimeShardCount > 1, 'the fixture must exercise multiple bounded runtime subshards');
  assert.ok(tndsManifest.runtimeShardMaxObservedBytes <= 8 * 1024);
  assert.equal(preparation.services, 50);

  const harness = `<!doctype html><meta charset="utf-8"><script type="module">
    import { createPreparedBusDataAdapter } from '/src/atlas/adapters/prepared-bus-data-adapter.mjs';
    import { createBusAssessment } from '/src/atlas/application/bus-assessment.mjs';
    window.runAssessment = async () => {
      const base = location.origin + '/data/';
      const adapter = createPreparedBusDataAdapter({ baseUrl: base, tndsBaseUrl: location.origin + '/tnds/' });
      const stop = ${JSON.stringify(selectedStop)};
      const assessment = createBusAssessment({
        stopDiscovery: { nearbyStops: async () => ({ ok: true, data: [stop], evidence: [], warnings: [], provenance: { stopCoverageComplete: true } }) },
        timetableData: adapter,
        accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: { source: 'fixture routing' } }) }
      });
      return assessment.assess({ latitude: 51.8566, longitude: -0.4567 });
    };
  </script>`;
  await fs.writeFile(path.join(temporaryRoot, 'harness.html'), harness);
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const base = pathname.startsWith('/src/') ? repositoryRoot : temporaryRoot;
      const relative = pathname.startsWith('/src/') ? pathname.slice(1) : pathname.slice(1);
      const file = path.resolve(base, relative || 'harness.html');
      if (file !== base && !file.startsWith(`${base}${path.sep}`)) throw new Error('unsafe path');
      const bytes = await fs.readFile(file);
      const type = file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.gz') ? 'application/gzip' : 'text/html';
      response.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'content-length': bytes.length });
      response.end(bytes);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  browser = await launchAtlasBrowser(chromium, { headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  const failedRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  await page.goto(`http://127.0.0.1:${address.port}/harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.runAssessment === 'function');
  const result = await page.evaluate(() => window.runAssessment());
  assert.equal(result.ok, true);
  assert.equal(result.status, 'complete');
  assert.ok(result.services.some(service => service.id === 'bods:230'), 'BODS-primary route 230 reaches planner input');
  assert.ok(result.services.some(service => service.routeNumber === '231' && service.operator === 'Runtime Fixture Operator'), 'TNDS service evidence reaches planner input');
  assert.ok(result.plannerServiceSummaries.some(service => service.routeNumber === '230'));
  assert.ok(result.plannerServiceSummaries.some(service => service.routeNumber === '231'));
  assert.equal(result.provenance.timetables.tndsShardRequests, tndsManifest.runtimeShardCount, 'all stop-indexed fixture shards required for the selected stop were fetched and decoded');
  assert.equal(pageErrors.length, 0, `browser errors: ${pageErrors.join('; ')}`);
  assert.deepEqual(failedRequests, []);
  console.log(`PASS browser TNDS multi-subshard manifest→fetch→gzip/decode→schema→stop match→BODS/TNDS composition→planner input (${tndsManifest.runtimeShardCount} shards).`);
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
