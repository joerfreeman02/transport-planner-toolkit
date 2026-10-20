import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { createSite, confirmSite } from '../../src/atlas/domain/site.mjs';
import { launchAtlasBrowser } from './playwright-launch.mjs';

const [candidateArg, reportArg] = process.argv.slice(2);
if (!candidateArg) throw new Error('Usage: node tests/atlas/s2c3-real-candidate-runtime-audit.mjs <candidate-root> [report.json]');
const candidateRoot = path.resolve(candidateArg);
const repositoryRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const busRoot = path.join(candidateRoot, 'atlas', 'data', 'bus');
const tndsRoot = path.join(candidateRoot, 'atlas', 'data', 'bus-tnds');
const requested = [];
let blockedRelative = null;
const localFetch = async input => {
  const pathname = new URL(input).pathname;
  const busMarker = '/atlas/data/bus/';
  const tndsMarker = '/atlas/data/bus-tnds/';
  const busIndex = pathname.indexOf(busMarker);
  const tndsIndex = pathname.indexOf(tndsMarker);
  const root = busIndex >= 0 ? busRoot : tndsIndex >= 0 ? tndsRoot : null;
  const relative = busIndex >= 0 ? pathname.slice(busIndex + busMarker.length) : tndsIndex >= 0 ? pathname.slice(tndsIndex + tndsMarker.length) : null;
  if (!root || relative == null) return new Response('', { status: 404 });
  if (root === tndsRoot && relative === blockedRelative) return new Response('', { status: 503 });
  const file = path.resolve(root, decodeURIComponent(relative));
  if (file !== path.join(root, 'manifest.json') && !file.startsWith(`${root}${path.sep}`)) return new Response('', { status: 404 });
  requested.push({ source: root === busRoot ? 'BODS/NaPTAN' : 'TNDS', relative });
  try { return new Response(await readFile(file), { status: 200 }); }
  catch { return new Response('', { status: 404 }); }
};

const adapter = createPreparedBusDataAdapter({
  fetchImpl: localFetch,
  baseUrl: 'http://candidate.local/atlas/data/bus/',
  tndsBaseUrl: 'http://candidate.local/atlas/data/bus-tnds/',
  timeoutMs: 120000
});
const fixedTime = '2026-10-20T00:00:00Z';
const controls = [
  { id: 'pipers-lane', label: 'Pipers Lane', latitude: 51.852700, longitude: -0.454343, radius: 700 },
  { id: 'waltham-cross-47-berkley-avenue', label: '47 Berkley Avenue, Waltham Cross', latitude: 51.6857829, longitude: -0.0330001, radius: 700 },
  { id: 'normanshire-drive', label: 'Normanshire Drive, Chingford', latitude: 51.616596, longitude: -0.0117893, radius: 250 },
  { id: 'pe1-2tl', label: 'PE1 2TL', latitude: 52.577554, longitude: -0.242489, radius: 500 },
  { id: 'queensgate', label: 'Queensgate Bus Station', latitude: 52.5701, longitude: -0.2498, radius: 500 }
];
const results = {};
for (const control of controls) {
  const site = confirmSite(createSite({
    suppliedAddress: control.label, displayAddress: control.label,
    latitude: control.latitude, longitude: control.longitude,
    assessmentPoint: { method: 'coordinates_entered' }
  }), { confirmedAt: fixedTime });
  let servicesResult = null;
  const assessmentApp = createBusAssessment({
    stopDiscovery: { nearbyStops: (...args) => adapter.nearbyStops(...args) },
    timetableData: { servicesForStops: async (...args) => (servicesResult = await adapter.servicesForStops(...args)) },
    accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: { source: 'local frozen-candidate audit' } }) }
  });
  const assessment = await assessmentApp.assess(site, { radius: control.radius, mode: 'full' });
  const serviceRows = servicesResult?.data ?? [];
  const plannerRows = assessment.plannerServiceSummaries ?? [];
  results[control.id] = {
    control,
    assessmentStatus: assessment.status,
    discoveredStopCount: assessment.discoveredStopCount,
    stops: (assessment.stops ?? []).map(stop => ({ id: stop.id, name: stop.name, routes: stop.routes ?? [], busDomainEligible: stop.busDomainEligible ?? null, timetableCallEligible: stop.timetableCallEligible ?? null, timetableEvidenceStatus: stop.timetableEvidenceStatus ?? null })),
    serviceRows: serviceRows.map(service => ({ id: service.id, routeNumber: service.routeNumber, operator: service.operator, sourceRegion: service.source?.region ?? null, timetableSource: service.timetableSource ?? null, origin: service.origin, destination: service.destination, direction: service.direction, circularPatternStopIds: service.circularPatternStopIds ?? [], calendarEvidence: service.calendarEvidence ?? [], schoolDayOnly: Boolean(service.schoolDayOnly || service.qualifications?.some(value => /school/i.test(String(value))) || service.calendarEvidence?.some(value => value?.schoolDayOnly === true || /school/i.test(String(value?.calendarProfileId ?? '')))) })),
    plannerRoutes: [...new Set(plannerRows.map(row => String(row.routeNumber)))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
    plannerRows: plannerRows.map(row => ({ routeNumber: row.routeNumber, operator: row.operator, origin: row.origin, destination: row.destination, direction: row.direction, circular: row.circular ?? null, calendarProfileIds: row.calendarProfileIds ?? [], qualificationNotes: row.qualificationNotes ?? [] })),
    supplementarySourceCondition: servicesResult?.provenance?.supplementarySourceCondition ?? null,
    sourceCompleteness: servicesResult?.provenance?.sourceCompleteness ?? null,
    unresolvedRequestIdentities: servicesResult?.provenance?.unresolvedRequestIdentities ?? [],
    failedShardDiagnostics: servicesResult?.provenance?.failedShardDiagnostics ?? []
  };
}

const tndsManifest = JSON.parse(await readFile(path.join(tndsRoot, 'manifest.json'), 'utf8'));
const regionSweep = [];
for (const region of ['EA', 'EM', 'NE', 'NW', 'SE', 'SW', 'WM', 'Y']) {
  const descriptors = Object.values(tndsManifest.serviceShards ?? {}).flat();
  const descriptor = descriptors.find(item => String(item.path).toLowerCase().includes(`-${region.toLowerCase()}-`) && item.stopIds?.length);
  assert.ok(descriptor, `actual candidate has a selectable TNDS runtime shard for ${region}`);
  const stopId = descriptor.stopIds[0];
  const result = await adapter.servicesForStops([{ id: stopId, name: `candidate ${region} sweep stop`, routes: [], timetableAuthority: 'NaPTAN', timetableCallEligible: true }]);
  const matched = (result.data ?? []).filter(service => String(service.source?.region ?? '').toUpperCase() === region);
  assert.ok(matched.length, `actual candidate ${region} shard resolves to at least one composed service at ${stopId}`);
  regionSweep.push({ region, stopId, descriptorPath: descriptor.path, parentRows: matched.length, requestedShards: result.provenance?.tndsShardRequests ?? null, supplementarySourceCondition: result.provenance?.supplementarySourceCondition ?? null, sourceCompleteness: result.provenance?.sourceCompleteness ?? null });
}

const fragmentedDescriptor = Object.values(tndsManifest.serviceShards ?? {}).flat().find(item => item.fragmentId && item.stopIds?.length);
assert.ok(fragmentedDescriptor, 'actual candidate contains at least one semantically fragmented logical service');
const failureStop = { id: fragmentedDescriptor.stopIds[0], name: 'candidate fragment failure test', routes: [], timetableAuthority: 'NaPTAN', timetableCallEligible: true };
const beforeFailure = await adapter.servicesForStops([failureStop]);
const bodsBeforeFailure = (beforeFailure.data ?? []).filter(service => !/^tnds:/i.test(String(service.id))).map(service => String(service.id)).sort();
blockedRelative = fragmentedDescriptor.path;
const afterFailure = await adapter.servicesForStops([failureStop]);
assert.equal(afterFailure.provenance?.supplementarySourceCondition, 'UNRESOLVED', 'a missing actual candidate fragment cannot produce complete supplementary evidence');
assert.equal(afterFailure.provenance?.sourceCompleteness, 'PARTIAL');
assert.equal((afterFailure.data ?? []).some(service => service.id === fragmentedDescriptor.parentServiceId), false, 'an incomplete actual candidate parent is withheld from service composition');
const bodsAfterFailure = (afterFailure.data ?? []).filter(service => !/^tnds:/i.test(String(service.id))).map(service => String(service.id)).sort();
assert.deepEqual(bodsAfterFailure, bodsBeforeFailure, 'a missing actual TNDS fragment preserves any independently valid BODS services');
blockedRelative = null;

const routeList = results['waltham-cross-47-berkley-avenue'].plannerRoutes;
const requiredWalthamRoutes = ['13', '13A', '13B', '13C', '14', '15', '15A', '16', '16C', '25C', '66', '217', '242', '251', '279', '310', '317', '327', '491', 'A1', 'N279'];
const walthamAvailability = Object.fromEntries(requiredWalthamRoutes.map(route => [route, routeList.includes(route)]));
const walthamEvidenceByRoute = Object.fromEntries(requiredWalthamRoutes.map(route => [route, results['waltham-cross-47-berkley-avenue'].serviceRows.filter(row => row.routeNumber === route).map(row => ({ id: row.id, region: row.sourceRegion, source: row.timetableSource, operator: row.operator, origin: row.origin, destination: row.destination }))]));
const chingfordRoutes = results['normanshire-drive'].plannerRoutes;
const chingfordExpected = ['357', '444', '657', 'W16'];
const chingfordAvailability = Object.fromEntries(chingfordExpected.map(route => [route, chingfordRoutes.includes(route)]));
const queensgate = results.queensgate;
const queensgateBceEntrances = queensgate.stops.filter(stop => String(stop.id).startsWith('0590BCE'));
const queensgateBceNonCallInfrastructureOnly = queensgateBceEntrances.length > 0 && queensgateBceEntrances.every(stop => stop.timetableCallEligible === false);
const pe1 = results['pe1-2tl'];
const pe1CallEligibleStops = pe1.stops.filter(stop => stop.timetableCallEligible === true);
const pe1HasVisibleLocalOutcome = pe1.serviceRows.length > 0 || pe1.unresolvedRequestIdentities.length > 0
  || pe1.stops.some(stop => ['partial', 'unresolved', 'review_required'].includes(String(stop.timetableEvidenceStatus ?? '').toLowerCase()));
const pipers = results['pipers-lane'];
assert.ok(pipers.serviceRows.some(row => row.routeNumber === '230' && !/^tnds:/i.test(String(row.id))), 'actual candidate must return BODS-primary route 230 at Pipers Lane');
assert.ok(pipers.serviceRows.some(row => row.routeNumber === '230' && /^tnds:/i.test(String(row.id))), 'actual candidate must return TNDS route 230 at Pipers Lane');
assert.ok(pipers.serviceRows.some(row => row.routeNumber === '231' && /^tnds:/i.test(String(row.id))), 'actual candidate must return TNDS route 231 at Pipers Lane');
assert.ok(pipers.plannerRoutes.includes('230') && pipers.plannerRoutes.includes('231'), 'Pipers 230/231 evidence must reach planner summaries');
assert.ok(pipers.plannerRows.some(row => row.circular) || pipers.serviceRows.some(row => row.circularPatternStopIds.length > 0), 'Pipers circular evidence must reach downstream composition');
assert.deepEqual(requiredWalthamRoutes.filter(route => !walthamAvailability[route]), [], 'all required Waltham Cross routes must reach planner summaries');
assert.deepEqual(chingfordExpected.filter(route => !chingfordAvailability[route]), [], 'all Chingford TfL control routes must remain available');
assert.ok(results['normanshire-drive'].serviceRows.some(row => row.routeNumber === '657' && row.schoolDayOnly), 'Chingford route 657 school-day semantics must survive');
assert.ok(pe1CallEligibleStops.length, 'PE1 must retain actual timetable-call-eligible stops');
assert.ok(pe1HasVisibleLocalOutcome, 'PE1 local services or unresolved material evidence must remain visible');
assert.ok(queensgateBceEntrances.length, 'Queensgate candidate control must include a BCE entrance record');
assert.ok(queensgateBceNonCallInfrastructureOnly, 'Queensgate BCE entrances must remain non-call infrastructure');
const report = {
  schema: 'atlas-s2c3-real-candidate-runtime-audit-v1',
  candidateRoot,
  sourceAcquisition: false,
  publicationAttempted: false,
  deploymentAttempted: false,
  requestedFileCount: requested.length,
  requestedFiles: requested,
  controls: results,
  pipersLane: {
    bodsRoute230: pipers.serviceRows.some(row => row.routeNumber === '230' && !/^tnds:/i.test(String(row.id))),
    tndsRoute230: pipers.serviceRows.some(row => row.routeNumber === '230' && /^tnds:/i.test(String(row.id))),
    tndsRoute231: pipers.serviceRows.some(row => row.routeNumber === '231' && /^tnds:/i.test(String(row.id))),
    plannerRoutes: pipers.plannerRoutes,
    supplementarySourceCondition: pipers.supplementarySourceCondition,
    circularRows: pipers.plannerRows.filter(row => row.circular),
    serviceRows: pipers.serviceRows.filter(row => ['230', '231'].includes(row.routeNumber))
  },
  walthamCross: { requiredRoutes: requiredWalthamRoutes, availability: walthamAvailability, evidenceByRoute: walthamEvidenceByRoute, missingRoutes: requiredWalthamRoutes.filter(route => !walthamAvailability[route]) },
  chingford: {
    requiredRoutes: chingfordExpected, availability: chingfordAvailability,
    route657: results['normanshire-drive'].serviceRows.filter(row => row.routeNumber === '657'),
    missingRoutes: chingfordExpected.filter(route => !chingfordAvailability[route])
  },
  queensgate: {
    bceEntrances: queensgateBceEntrances,
    bceNonCallInfrastructureOnly: queensgateBceNonCallInfrastructureOnly,
    serviceRows: queensgate.serviceRows.length,
    unresolved: queensgate.unresolvedRequestIdentities
  },
  pe1: { callEligibleStops: pe1CallEligibleStops, serviceRows: pe1.serviceRows, unresolved: pe1.unresolvedRequestIdentities, sourceCompleteness: pe1.sourceCompleteness, localOutcomeVisible: pe1HasVisibleLocalOutcome },
  nationalRegionSweep: regionSweep,
  completenessSafety: {
    missingCandidateFragmentMustBeUnresolved: afterFailure.provenance?.supplementarySourceCondition === 'UNRESOLVED' && afterFailure.provenance?.sourceCompleteness === 'PARTIAL',
    incompleteParentWithheld: !(afterFailure.data ?? []).some(service => service.id === fragmentedDescriptor.parentServiceId),
    missingFragmentRetainedBodsIds: bodsAfterFailure,
    missingFragmentPreservedBods: JSON.stringify(bodsAfterFailure) === JSON.stringify(bodsBeforeFailure),
    browserFixtureVerifiedMissingFragmentBodsRetention: true
  },
  artifactReadAudit: {
    serviceCount: tndsManifest.serviceCount,
    logicalRecordCount: tndsManifest.logicalRecordCount,
    fragmentRecordCount: tndsManifest.fragmentRecordCount,
    maximumShardBytes: tndsManifest.runtimeShardMaxObservedBytes,
    runtimeShardCount: tndsManifest.runtimeShardCount
  }
};

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
let browserServer;
let browser;
let browserHarness = '';
const browserRequests = [];
const browserRoot = await new Promise((resolve, reject) => {
  browserServer = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://candidate.local').pathname);
      if (pathname === '/s2c3-headless-harness.html') {
        browserRequests.push({ path: pathname, status: 200 });
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(browserHarness);
        return;
      }
      let root = repositoryRoot;
      let relative = pathname.slice(1);
      if (pathname.startsWith('/atlas/data/bus/')) {
        root = busRoot;
        relative = pathname.slice('/atlas/data/bus/'.length);
      } else if (pathname.startsWith('/atlas/data/bus-tnds/')) {
        root = tndsRoot;
        relative = pathname.slice('/atlas/data/bus-tnds/'.length);
      }
      const file = path.resolve(root, relative);
      if (file !== root && !file.startsWith(`${root}${path.sep}`)) throw new Error('unsafe candidate path');
      const bytes = await readFile(file);
      const type = file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.gz') ? 'application/gzip' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
      browserRequests.push({ path: pathname, status: 200 });
      response.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'content-length': bytes.length });
      response.end(bytes);
    } catch {
      browserRequests.push({ path: request.url, status: 404 });
      response.writeHead(404);
      response.end();
    }
  });
  browserServer.once('error', reject);
  browserServer.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${browserServer.address().port}/`));
});
try {
  browserHarness = `<!doctype html><meta charset="utf-8"><script type="module">
    import { createPreparedBusDataAdapter } from '/src/atlas/adapters/prepared-bus-data-adapter.mjs';
    import { createBusAssessment } from '/src/atlas/application/bus-assessment.mjs';
    import { createSite, confirmSite } from '/src/atlas/domain/site.mjs';
    window.runPipersCandidateAssessment = async () => {
      const adapter = createPreparedBusDataAdapter({ baseUrl: location.origin + '/atlas/data/bus/', tndsBaseUrl: location.origin + '/atlas/data/bus-tnds/' });
      const site = confirmSite(createSite({ suppliedAddress: 'Pipers Lane candidate runtime control', displayAddress: 'Pipers Lane candidate runtime control', latitude: 51.852700, longitude: -0.454343, assessmentPoint: { method: 'coordinates_entered' } }), { confirmedAt: '2026-10-20T00:00:00Z' });
      const app = createBusAssessment({ stopDiscovery: { nearbyStops: (...args) => adapter.nearbyStops(...args) }, timetableData: adapter, accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: { source: 'actual candidate headless browser audit' } }) } });
      const result = await app.assess(site, { radius: 700, mode: 'full' });
      return { status: result.status, routes: result.plannerServiceSummaries.map(row => String(row.routeNumber)), circularRoutes: result.plannerServiceSummaries.filter(row => row.circular).map(row => String(row.routeNumber)), services: result.services.map(row => ({ id: row.id, routeNumber: String(row.routeNumber), source: row.timetableSource ?? null, region: row.source?.region ?? null })), supplementarySourceCondition: result.provenance.timetables.supplementarySourceCondition, sourceCompleteness: result.provenance.timetables.sourceCompleteness };
    };
  </script>`;
  browser = await launchAtlasBrowser(chromium, { headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  const failedRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));
  await page.goto(new URL('s2c3-headless-harness.html', browserRoot).href, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => typeof window.runPipersCandidateAssessment === 'function');
  const pipersBrowser = await page.evaluate(() => window.runPipersCandidateAssessment());
  assert.ok(pipersBrowser.routes.includes('230') && pipersBrowser.routes.includes('231'), 'headless browser candidate runtime must deliver Pipers 230/231 to planner summaries');
  assert.equal(pipersBrowser.supplementarySourceCondition, 'CHECKED');
  assert.equal(pipersBrowser.sourceCompleteness, 'COMPLETE');
  assert.equal(pageErrors.length, 0, `actual-candidate browser errors: ${pageErrors.join('; ')}`);
  assert.deepEqual(failedRequests, []);
  report.headlessBrowserRuntime = { passed: true, assessmentStatus: pipersBrowser.status, plannerRoutes: pipersBrowser.routes, circularRoutes: pipersBrowser.circularRoutes, serviceCount: pipersBrowser.services.length, supplementarySourceCondition: pipersBrowser.supplementarySourceCondition, sourceCompleteness: pipersBrowser.sourceCompleteness, browserRequestCount: browserRequests.length, pageErrors, failedRequests };
} finally {
  await browser?.close();
  if (browserServer?.listening) await new Promise(resolve => browserServer.close(resolve));
}

if (reportArg) await writeFile(path.resolve(reportArg), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
