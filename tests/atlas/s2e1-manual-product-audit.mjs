import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { launchAtlasBrowser } from './playwright-launch.mjs';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createSite, confirmSite } from '../../src/atlas/domain/site.mjs';

const [candidateArg, reportArg] = process.argv.slice(2);
if (!candidateArg) throw new Error('Usage: node tests/atlas/s2e1-manual-product-audit.mjs <Run-75-candidate-root> [report.json]');
const candidateRoot = path.resolve(candidateArg);
const repositoryRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
assert.notEqual(candidateRoot, repositoryRoot, 'The frozen candidate data root must be separate from the production code checkout.');
const candidateManifestPaths = {
  bus: path.join(candidateRoot, 'atlas', 'data', 'bus', 'manifest.json'),
  tnds: path.join(candidateRoot, 'atlas', 'data', 'bus-tnds', 'manifest.json')
};
const candidateManifestDigests = Object.fromEntries(await Promise.all(Object.entries(candidateManifestPaths).map(async ([source, manifestPath]) => {
  const bytes = await readFile(manifestPath);
  return [source, `sha256:${createHash('sha256').update(bytes).digest('hex')}`];
})));
assert.equal(candidateManifestDigests.bus, 'sha256:1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f', 'Bus-data manifest is not the one from immutable Run #75.');
assert.equal(candidateManifestDigests.tnds, 'sha256:2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f', 'TNDS manifest is not the one from immutable Run #75.');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const tflWalthamOperatingFixture = JSON.parse(await readFile(path.join(repositoryRoot, 'tests/atlas/fixtures/tfl-waltham-stop-a-operating-period-1a.json'), 'utf8'));
const tflWalthamByLine = new Map(tflWalthamOperatingFixture.requests.map(request => [String(request.lineId), request.response]));
const enfieldIbusIndex = JSON.parse(await readFile(path.join(repositoryRoot, 'atlas/data/tfl-ibus/20261009/operator-index.json'), 'utf8'));
const enfieldTflCapture = JSON.parse(await readFile(path.join(repositoryRoot, 'tests/atlas/fixtures/enfield-route313-tfl-capture-2026-10-23.json'), 'utf8'));
const enfieldTflResponses = new Map(enfieldTflCapture.responses.map(response => [response.path, response]));
const capturedEnfieldStop = enfieldTflCapture.stopPoint;
const enfieldStopKCapture = JSON.parse(await readFile(path.join(repositoryRoot, 'tests/atlas/fixtures/enfield-route313-stop-k-timetable-2026-10-23.json'), 'utf8'));
const enfieldStopTCapture = JSON.parse(await readFile(path.join(repositoryRoot, 'tests/atlas/fixtures/tfl-313-inbound-stop-t-2026-10-23.json'), 'utf8'));
const enfieldAssessmentStops = [
  { id: '490001101K', name: 'Enfield Town Station', lat: 51.65241, lon: -0.07863, indicator: 'K', timetable: enfieldStopKCapture.response },
  { id: '490006587E', name: 'Enfield Town / Church Street', lat: 51.65221, lon: -0.08306, indicator: 'E', timetable: enfieldTflResponses.get('/Line/313/Timetable/490006587E')?.body },
  { id: '490008903E', name: 'Ladysmith Road', lat: 51.65226, lon: -0.07408, indicator: '->E', timetable: enfieldStopTCapture }
];
if (enfieldAssessmentStops.some(stop => !stop.timetable)) throw new Error('Captured Enfield multi-stop timetable responses are incomplete.');
const capturedEnfieldRegular = enfieldTflCapture.observedServices.find(service => service.intervalId === '0' && service.direction === 'inbound' && service.calendarProfileId === 'non-school-day');
const capturedEnfieldSchoolWorking = enfieldTflCapture.observedServices.find(service => service.intervalId === '1' && service.direction === 'inbound' && service.calendarProfileId === 'school-day');
if (!capturedEnfieldRegular || !capturedEnfieldSchoolWorking || capturedEnfieldRegular.routeMetadata !== 'matched' || capturedEnfieldSchoolWorking.routeMetadata !== 'incomplete') throw new Error('Captured Enfield 313 regular and school-working evidence is incomplete.');
assert.deepEqual([capturedEnfieldRegular.departureCountsByDay.monday, capturedEnfieldRegular.departureCountsByDay.friday], [56, 56], 'Actual captured route-313 regular interval must retain its weekday population.');
assert.equal(capturedEnfieldSchoolWorking.departureCountsByDay.monday, 1, 'Actual captured school-working interval must remain a separate one-journey/day record.');
assert.equal(capturedEnfieldRegular.operatorEvidence?.operator?.name, 'Arriva London North', 'Actual captured iBus evidence must resolve the regular route-313 operator.');
const enfieldControls = [
  { id: 'enfield-313-e2e', label: 'Enfield route 313 captured TfL service control', latitude: 51.651670, longitude: -0.079460, radius: 400, focusRoutes: ['313'] },
  { id: 'enfield-329-e2e', label: 'Enfield route 329 frozen candidate operator control', latitude: 51.65167, longitude: -0.07946, radius: 250, focusRoutes: ['329'] }
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
  const route313Response = pathname => enfieldTflResponses.get(pathname)?.body ?? null;
  const route313Route = route313Response('/Line/313/Route');
  const route313Sequence = route313Response('/Line/313/Route/Sequence/inbound');
  if (!route313Route || !route313Sequence) throw new Error('Captured Enfield TfL route-313 API responses are incomplete.');
  const route313Operator = capturedEnfieldRegular.operator;
  if (route313Operator !== 'Arriva London North') throw new Error('Captured productive iBus identity bridge did not resolve Arriva London North.');
  const route313StopPoints = enfieldAssessmentStops.map(stop => ({
    id: stop.id, naptanId: stop.id, commonName: stop.name, name: stop.name, lat: stop.lat, lon: stop.lon,
    stopType: 'NaptanPublicBusCoachTram', indicator: stop.indicator,
    lines: [{ id: '313', name: '313' }]
  }));
  enfieldFixtures.set('enfield-313-e2e', {
    routeNumber: '313', stopId: '490001101K', stopName: 'Enfield Town Station', operator: route313Operator,
    operatorEvidence: capturedEnfieldRegular.operatorEvidence, stopPoints: route313StopPoints,
    route: route313Route, timetables: new Map(enfieldAssessmentStops.map(stop => [stop.id, stop.timetable])), sequences: { inbound: route313Sequence },
    fixtureProvenance: 'Exact captured TfL Route and RouteSequence responses plus unedited TimetableResponse bodies for Enfield stops K, E and T. The full assessment coordinates and 400 m radius reproduce the failed served assessment composition; the normal interval and incomplete school-working interval remain unedited.'
  });
  const candidate329Result = await prepared.servicesForStops(stopResult.data ?? []);
  if (!candidate329Result.ok) throw new Error(`Frozen candidate Enfield timetable lookup failed: ${candidate329Result.message}`);
  const candidate329Services = (candidate329Result.data ?? []).filter(service => String(service.routeNumber) === '329');
  const candidate329UsableAtStops = candidate329Services.flatMap(service => Object.entries(service.stopSchedules ?? {})
    .filter(([, schedule]) => Object.values(schedule ?? {}).some(day => Array.isArray(day) && day.length > 0))
    .map(([stopId]) => ({ serviceId: service.id ?? null, stopId, operator: service.operator ?? null, provider: service.provider ?? service.timetableSource ?? service.source?.provider ?? null })));
  const route329ServiceStopIds = new Set(candidate329UsableAtStops.map(evidence => String(evidence.stopId)));
  const route329StopCandidates = (stopResult.data ?? []).filter(stop => (stop.routes ?? []).some(value => String(value) === '329'));
  const route329Stop = route329StopCandidates.find(stop => String(stop.id) === '490006588R' && route329ServiceStopIds.has(String(stop.id)));
  if (!route329Stop) throw new Error('Frozen Run #75 candidate has no Enfield BODS route-329 stop within 2,000 metres of the control point.');
    enfieldFixtures.set('enfield-329-e2e', {
    stopId: String(route329Stop.id), stopName: String(route329Stop.name), routeNumber: '329',
    // Inside Greater London the normal app selects TfL stop discovery. Project
    // only this exact Run #75 NaPTAN stop identity, coordinates and route
    // associations into that local API boundary fixture. The real candidate
    // supplies all timetable/operator evidence; none is fabricated here.
    stopPoints: [{ id: String(route329Stop.id), naptanId: String(route329Stop.id), commonName: String(route329Stop.name), lat: Number(route329Stop.latitude), lon: Number(route329Stop.longitude), stopType: 'NaptanPublicBusCoachTram', lines: (route329Stop.routes ?? []).map(id => ({ id: String(id), name: String(id) })) }],
    stopFixtureProvenance: 'Run #75 candidate NaPTAN stop identity, coordinates and route associations; no live TfL response and no synthetic timetable/operator evidence.',
    route: [],
    timetable: { lineId: '329', lineName: '329', direction: '', timetable: { departureStopId: String(route329Stop.id), routes: [] } },
    sequence: { lineId: '329', direction: 'outbound', stopPointSequences: [] },
    candidateStopRoutes: route329Stop.routes ?? [], candidateServices: candidate329Services.map(service => ({ id: service.id ?? null, operator: service.operator ?? null, provider: service.provider ?? service.timetableSource ?? service.source?.provider ?? null, stopsWithSchedules: Object.entries(service.stopSchedules ?? {}).filter(([, schedule]) => Object.values(schedule ?? {}).some(day => Array.isArray(day) && day.length > 0)).map(([stopId]) => stopId) })), usableCandidateEvidenceAtStops: candidate329UsableAtStops
  });
}
const controls = [
  { id: 'pipers-lane', label: 'Pipers Lane', latitude: 51.852700, longitude: -0.454343, radius: 700 },
  { id: 'pipers-route46', label: 'Pipers Lane route 46 frequency control', latitude: 51.852700, longitude: -0.454343, radius: 1200 },
  { id: 'waltham-cross', label: '47 Berkley Avenue, Waltham Cross', latitude: 51.6857829, longitude: -0.0330001, radius: 700 },
  { id: 'chingford', label: 'Normanshire Drive, Chingford', latitude: 51.616596, longitude: -0.0117893, radius: 250 },
  { id: 'pe1', label: 'PE1 2TL', latitude: 52.577554, longitude: -0.242489, radius: 500 }
];
if (process.env.ATLAS_C4_ENFIELD_EVIDENCE_ONLY === '1') controls.splice(0, controls.length, ...enfieldControls);
if (process.env.ATLAS_AUDIT_CONTROL) controls.splice(0, controls.length, ...controls.filter(control => control.id === process.env.ATLAS_AUDIT_CONTROL));
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
const report = { schema: 'atlas-bus-s2e1-normal-product-browser-word-audit-v1', candidateRoot, candidateRun: '39430415441', candidateArtifactId: '12275615359', candidateDigest: 'sha256:5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471', candidateProducerSha: '151199cc914c235870f444d26b03c2309edbd035', candidateManifestDigests, acquisitionAttempted: false, publicationAttempted: false, deploymentAttempted: false, controls: {}, failures: [] };
if (process.env.ATLAS_C4_ENFIELD_EVIDENCE_ONLY === '1') report.enfieldIbusFixture = {
  source: 'Exact captured Enfield TfL Route, TimetableResponse and RouteSequence bodies plus checked-in 20261009 iBus evidence; route 329 stop identity and timetable/operator evidence remain candidate-backed; no live TfL requests.',
  baseVersion: enfieldIbusIndex.baseVersion,
  validFrom: enfieldIbusIndex.validFrom,
  validTo: enfieldIbusIndex.validTo,
  route313: {
    captureSchema: enfieldTflCapture.schema, capturedAt: enfieldTflCapture.capturedAt, assessmentDate: enfieldTflCapture.assessmentDate,
    stopId: enfieldFixtures.get('enfield-313-e2e').stopId, operatorName: enfieldFixtures.get('enfield-313-e2e').operator,
    operatorEvidence: enfieldFixtures.get('enfield-313-e2e').operatorEvidence, fixtureProvenance: enfieldFixtures.get('enfield-313-e2e').fixtureProvenance,
    regularService: capturedEnfieldRegular, schoolWorking: capturedEnfieldSchoolWorking
  },
  route329CandidateStop: { stopId: enfieldFixtures.get('enfield-329-e2e').stopId, name: enfieldFixtures.get('enfield-329-e2e').stopName, latitude: Number(enfieldControls[1].latitude), longitude: Number(enfieldControls[1].longitude), stopFixtureProvenance: enfieldFixtures.get('enfield-329-e2e').stopFixtureProvenance, candidateRoutes: enfieldFixtures.get('enfield-329-e2e').candidateStopRoutes, candidateServices: enfieldFixtures.get('enfield-329-e2e').candidateServices, usableCandidateEvidenceAtStops: enfieldFixtures.get('enfield-329-e2e').usableCandidateEvidenceAtStops },
  route329ServiceLineMappings: enfieldIbusIndex.serviceLines.filter(line => String(line.serviceLineNo) === '329'),
  route329ProductivePatterns: enfieldIbusIndex.patterns.filter(pattern => String(pattern.serviceLineNo) === '329' && Number(pattern.patternType) === 1).length
};
report.enfieldCoverage = process.env.ATLAS_C4_ENFIELD_EVIDENCE_ONLY === '1'
  ? 'Dedicated evidence-only mode replays the exact captured TfL 313 Route, TimetableResponse and RouteSequence bodies with the captured MatchedStop and uses Run #75 for national supplementation; route 329 stop identity and timetable/operator evidence remain frozen-candidate-backed. No live TfL request is made.'
  : 'The normal-shell audit intentionally does not fabricate TfL StopPoint records; with live TfL disabled, the frozen candidate contains no TfL StopPoint response fixture for Enfield.';
const errors = [];
report.chingfordFixtureNote = 'Chingford route 657 browser regression uses the existing fixture-backed timetable golden. Fixture StopPoint coordinates are anchored at the confirmed control point solely for deterministic radius matching and are not represented as live TfL location evidence.';
const failedRequests = [];
const failedResponses = [];
const externalRequests = [];
const statusManifestFallbacks = [];
const tflReplayRequests = [];
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
      let bytes = await readFile(file);
      if (process.env.ATLAS_C4_TRACE_OPERATOR_STAGES === '1' && pathname === '/atlas/assets/js/app.mjs') {
        let appSource = bytes.toString('utf8');
        const assignment = '  currentBusResult = result;';
        if (appSource.split(assignment).length !== 2) throw new Error('Expected one production assessment result assignment for the C4 trace hook.');
        const observer = `${assignment}\n  window.__ATLAS_C4_OPERATOR_TRACE__ = (routeNumber, selectedStopId = null) => {\n    const routeRecords = (records, selectedStopId) => (records ?? []).filter(record => String(record.routeNumber) === String(routeNumber)).map(record => { const schedule = record.stopSchedules?.[selectedStopId] ?? record.departuresByStopAndDay?.[selectedStopId] ?? {}; const population = record.canonicalDeparturePopulationAll ?? record.canonicalDeparturePopulation ?? {}; const counts = value => Array.isArray(value) ? value.length : null; return { id: record.id ?? null, operator: record.operator ?? null, provider: record.provider ?? null, timetableSource: record.timetableSource ?? null, origin: record.origin ?? null, destination: record.destination ?? null, direction: record.direction ?? null, sourceRecordIds: record.sourceRecordIds ?? [], stopIds: record.stopIds ?? [], servedAtStopId: record.servedAtStopId ?? null, frequencyBasisStopId: record.frequencyBasisStopId ?? null, canonicalCounts: Object.fromEntries(Object.entries(population).map(([day,value]) => [day, counts(value)])), selectedStopCounts: Object.fromEntries(Object.entries(schedule).map(([day,value]) => [day, counts(value)])), typicalFrequencyLines: record.typicalFrequencyLines ?? null, operatingPeriodLines: record.operatingPeriodLines ?? null, shortWorkingClassification: record.shortWorkingClassification ?? null, grouping: record.publicServiceGroupingDecision ? { principalPattern: record.publicServiceGroupingDecision.principalPattern ?? null, shortWorkingRecordIds: record.publicServiceGroupingDecision.shortWorkingRecordIds ?? [], branchVariantRecordIds: record.publicServiceGroupingDecision.branchVariantRecordIds ?? [], deduplicatedSourceRecordIds: record.publicServiceGroupingDecision.deduplicatedSourceRecordIds ?? [] } : null, canonicalSamples: Object.fromEntries(Object.entries(record.canonicalDeparturePopulationAll ?? {}).map(([day, entries]) => [day, (entries ?? []).slice(0, 8).map(entry => ({ minute: entry.minute, sourceRecordId: entry.sourceRecordId, authorityProvider: entry.authorityProvider, provider: entry.provider, primaryAuthority: entry.primaryAuthority, journeyIdentity: entry.journeyIdentity }))])) }; });\n    const summarizeStop = stop => ({ id: stop.id ?? stop.sourceId ?? null, name: stop.name ?? null, latitude: stop.latitude ?? null, longitude: stop.longitude ?? null, distanceMetres: stop.distanceMetres ?? null, routes: stop.routes ?? [], timetableAuthority: stop.timetableAuthority ?? null, timetableAuthorities: stop.timetableAuthorities ?? [], routeAuthorities: stop.routeAuthorities ?? null, timetableCallEligible: stop.timetableCallEligible ?? null });
    return { routeNumber, allDiscoveredStops: (result.stops ?? []).map(summarizeStop), stops: (result.stops ?? []).filter(stop => (stop.routes ?? []).some(route => String(route) === String(routeNumber))).map(summarizeStop), stopProvenance: result.provenance?.stops ?? null, composedServices: routeRecords(result.services, selectedStopId), normalizedServiceSummaries: routeRecords(result.serviceSummaries, selectedStopId), plannerRows: routeRecords(result.plannerServiceSummaries, selectedStopId), timetableProvenance: result.provenance?.timetables ?? null };\n  };`;
        bytes = Buffer.from(appSource.replace(assignment, observer), 'utf8');
      }
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
    if (!['127.0.0.1', 'localhost', 'tile.openstreetmap.org', 'routing.openstreetmap.de', 'api.tfl.gov.uk', 'nominatim.openstreetmap.org'].includes(url.hostname)) externalRequests.push(request.url());
  });
  await page.route('https://nominatim.openstreetmap.org/**', route => {
    const control = activeControl;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify([{
      lat: String(control.latitude), lon: String(control.longitude), display_name: control.label,
      address: { road: control.label, city: control.label, country: 'United Kingdom' }
    }]) });
  });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av3nGQAAAABJRU5ErkJggg==', 'base64') }));
  await page.route('https://routing.openstreetmap.de/**', route => {
    const url = route.request().url();
    if (url.includes('/table/')) {
      const points = decodeURIComponent(url.split('/').at(-1).split('?')[0]).split(';');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', distances: [points.map((_p, index) => index ? 100 : 0)], durations: [points.map((_p, index) => index ? 60 : 0)] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ distance: 100, duration: 60, geometry: { type: 'LineString', coordinates: [[-0.03, 51.68], [-0.031, 51.681]] } }] }) });
  });
  await page.route('https://api.tfl.gov.uk/**', route => {
    const replayUrl = new URL(route.request().url());
    if (activeControl?.id?.startsWith('enfield-')) tflReplayRequests.push({ control: activeControl.id, path: replayUrl.pathname, query: replayUrl.search.slice(1) });
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
      else if (url.pathname.endsWith('/Route') && decodeURIComponent(url.pathname.split('/')[2] ?? '').split(',').includes(String(fixture.routeNumber ?? '313'))) body = [fixture.route];
      else if (url.pathname.startsWith(`/Line/${fixture.routeNumber ?? '313'}/Timetable/`)) body = fixture.timetables?.get(decodeURIComponent(url.pathname.split('/').at(-1))) ?? [];
      else if (url.pathname.startsWith(`/Line/${fixture.routeNumber ?? '313'}/Route/Sequence/`)) body = fixture.sequences?.[url.pathname.split('/').at(-1)] ?? [];
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
    const outcome = { label: control.label, assessmentCoordinates: { latitude: control.latitude, longitude: control.longitude } };
    try {
      await page.goto(new URL('atlas/', baseUrl).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.locator('.quick-start a[href="#bus"]').click();
      await page.locator('#address').fill(control.label);
      await page.locator('#addressForm button[type="submit"]').click();
      await page.locator('#candidateList button').filter({ hasText: 'Use this result' }).click();
      await page.locator('#confirmAssessmentPoint').click();
      await page.locator('#radius').fill(String(control.radius));
      await page.locator('[data-workflow-step="4"]').click();
      assert.equal(await page.locator('#findStops').isEnabled(), true, 'Normal workflow did not enable Bus assessment after confirming the site.');
      await page.locator('#findStops').click();
      await page.locator('#taskStatusMessage').waitFor({ state: 'visible', timeout: 180000 });
      const continueStaged = page.locator('#assessmentScope button').filter({ hasText: 'Continue full assessment' });
      await page.waitForFunction(() => {
        const phase = document.querySelector('#taskStatus')?.dataset.phase;
        const terminal = ['complete', 'partial', 'unavailable'].includes(phase);
        const staged = [...document.querySelectorAll('#assessmentScope button')].some(button => button.textContent.includes('Continue full assessment'));
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
      if (control.id === 'waltham-cross') {
        assert.equal(await page.locator('#taskStatus').isVisible(), true, 'The completed progress card must remain visible with Results.');
        assert.equal(await page.locator('#taskStatusMessage').innerText(), 'Assessment complete', 'A successful Waltham assessment must have a concise completion label.');
        assert.equal(await page.locator('#stopStatus').isHidden(), true, 'The completed assessment must not repeat review wording in the adjacent callout.');
        const reviewBadge = (await page.locator('#taskStatusReviewBadge').innerText()).trim();
        const cardReviewCount = Number(reviewBadge.match(/^([0-9]+) items? require review$/)?.[1] || 0);
        assert.ok(cardReviewCount > 0, 'The frozen Waltham review case must show its review count in the completion card.');
        assert.equal(await page.locator('#resultFreshness').innerText(), 'Assessment complete', 'Results freshness must not repeat the card review count.');
        const sourceReviewBadge = await page.locator('#sourceReviewBadge').evaluate(element => element.textContent.trim());
        const sourceReviewCount = Number(sourceReviewBadge.match(/^([0-9]+) items? require review$/)?.[1] || 0);
        assert.equal(cardReviewCount, sourceReviewCount, 'The progress card must agree with the Sources & Checks review count.');
        const desktopLayout = await page.locator('#taskStatus').evaluate(element => ({
          cardWidth: element.clientWidth, cardScrollWidth: element.scrollWidth,
          stages: [...element.querySelectorAll('.task-stages li')].map(stage => ({ label: stage.textContent.trim(), width: stage.clientWidth, scrollWidth: stage.scrollWidth, whiteSpace: getComputedStyle(stage).whiteSpace }))
        }));
        assert.ok(desktopLayout.cardWidth > 0 && desktopLayout.cardScrollWidth <= desktopLayout.cardWidth + 1, `Desktop progress card overflows: ${JSON.stringify(desktopLayout)}`);
        assert.ok(desktopLayout.stages.every(stage => stage.whiteSpace === 'nowrap' && stage.scrollWidth <= stage.width + 1), `Desktop stage labels wrap or overlap: ${JSON.stringify(desktopLayout.stages)}`);
        const screenshotDirectory = process.env.ATLAS_PROGRESS_SCREENSHOT_DIR ? path.resolve(process.env.ATLAS_PROGRESS_SCREENSHOT_DIR) : null;
        if (screenshotDirectory) {
          await mkdir(screenshotDirectory, { recursive: true });
          await page.locator('#taskStatus').screenshot({ path: path.join(screenshotDirectory, 'assessment-progress-desktop.png') });
        }
        await page.setViewportSize({ width: 390, height: 844 });
        const narrowLayout = await page.locator('#taskStatus').evaluate(element => ({
          cardWidth: element.clientWidth, cardScrollWidth: element.scrollWidth,
          stages: [...element.querySelectorAll('.task-stages li')].map(stage => ({ label: stage.textContent.trim(), width: stage.clientWidth, scrollWidth: stage.scrollWidth, whiteSpace: getComputedStyle(stage).whiteSpace }))
        }));
        assert.ok(narrowLayout.cardWidth > 0 && narrowLayout.cardScrollWidth <= narrowLayout.cardWidth + 1, `Narrow progress card overflows: ${JSON.stringify(narrowLayout)}`);
        assert.equal(narrowLayout.stages.length, 5, 'Narrow progress card must retain all five assessment stages.');
        assert.ok(narrowLayout.stages.every(stage => stage.whiteSpace === 'nowrap' && stage.scrollWidth <= stage.width + 1), `Narrow stage labels wrap or overlap: ${JSON.stringify(narrowLayout.stages)}`);
        if (screenshotDirectory) await page.locator('#taskStatus').screenshot({ path: path.join(screenshotDirectory, 'assessment-progress-narrow.png') });
        await page.setViewportSize({ width: 1440, height: 1000 });
        outcome.progressCardVisualChecks = { completedLabel: 'Assessment complete', reviewBadge, duplicateCallout: false, desktopStages: desktopLayout.stages, narrowStages: narrowLayout.stages, screenshotsCaptured: Boolean(screenshotDirectory) };
      }
      if (process.env.ATLAS_C4_TRACE_OPERATOR_STAGES === '1' && control.id.startsWith('enfield-')) {
        const tracedRoute = control.id === 'enfield-313-e2e' ? '313' : '329';
        outcome.operatorStageTrace = await page.evaluate(route => window.__ATLAS_C4_OPERATOR_TRACE__?.(route) ?? null, tracedRoute);
        assert.ok(outcome.operatorStageTrace, 'Production assessment result was not exposed to the test-only C4 trace observer.');
      }
      if (process.env.ATLAS_C4_TRACE_OPERATOR_STAGES === '1' && control.id === 'waltham-cross') {
        outcome.route66Trace = await page.evaluate(() => window.__ATLAS_C4_OPERATOR_TRACE__?.('66') ?? null);
        assert.ok(outcome.route66Trace, 'Production assessment result was not exposed to the test-only route-66 trace observer.');
      }
      if (process.env.ATLAS_C4_TRACE_OPERATOR_STAGES === '1' && control.id === 'pipers-lane') {
        outcome.pipers230StageTrace = await page.evaluate(() => window.__ATLAS_C4_OPERATOR_TRACE__?.('230') ?? null);
        assert.ok(outcome.pipers230StageTrace, 'Production assessment result was not exposed to the test-only Pipers route-230 trace observer.');
      }
      if (process.env.ATLAS_C4_TRACE_OPERATOR_STAGES === '1' && control.id === 'pe1') {
        outcome.pe1202StageTrace = await page.evaluate(() => window.__ATLAS_C4_OPERATOR_TRACE__?.('202') ?? null);
        assert.ok(outcome.pe1202StageTrace, 'Production assessment result was not exposed to the test-only PE1 route-202 trace observer.');
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
      await page.locator('details > summary').filter({ hasText: /Sources\s*&\s*Checks/i }).click();
      const checksText = await page.locator('#plannerChecks').innerText();
      outcome.sourcesAndChecks = checksText;
      const resultFreshnessText = await page.locator('#resultFreshness').innerText();
      if (/0 evidence items? need review/i.test(resultFreshnessText)) {
        assert.doesNotMatch(checksText, /review (?:the affected )?service evidence before formal use|review the incomplete evidence before formal use/i,
          'A zero-review/complete status must not coexist with a material review-before-use instruction in Points to note.');
      }


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
      await page.locator('#goToExportBottom').click();
      await page.locator('#includeMapInWord').waitFor({ state: 'visible' });
      const reviewGate = page.locator('#plannerReviewGate');
      if (!(await reviewGate.isHidden())) {
        assert.equal(await page.locator('#plannerReviewAcknowledgement').isChecked(), false, 'Review acknowledgement must reset for each newly composed assessment.');
        assert.equal(await page.locator('#exportBusWord').isDisabled(), true, 'Formal Word export must wait for review acknowledgement.');
        await page.locator('#plannerReviewAcknowledgement').check();
        assert.match(await page.locator('#plannerReviewGateStatus').innerText(), /remain recorded/i);
      }
      assert.equal(await page.locator('#includeMapInWord').isChecked(), true, 'Word map inclusion defaults ON.');
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(error => ({ downloadError: error }));
      await page.locator('#exportBusWord').click();
      const download = await downloadPromise;
      if (download.downloadError) throw new Error(`Word export did not download: ${await page.locator('#exportStatus').innerText()} (${download.downloadError.message})`);
      const wordDirectory = reportArg ? path.join(path.dirname(path.resolve(reportArg)), 'word-exports') : os.tmpdir();
      await mkdir(wordDirectory, { recursive: true });
      const wordPath = path.join(wordDirectory, `atlas-s2e1-${control.id}.docx`);
      await download.saveAs(wordPath);
      const docxBytes = await readFile(wordPath);
      const documentXml = zipEntry(docxBytes, 'word/document.xml');
      assert.ok(docxBytes.includes(Buffer.from('word/media/assessment-map.png')), 'Map-on Word export must embed the generated assessment PNG.');
      assert.match(documentXml, /w:sz w:val="12"/, 'Word table cells must use 6 pt text.');
      const exportedWordText = wordText(documentXml);
      outcome.wordText = exportedWordText;
      assert.doesNotMatch(exportedWordText, /ATLAS|Planner review required|Additional source evidence remains available/i, 'Planning-facing Word must exclude internal platform and review language.');
      assert.doesNotMatch(download.suggestedFilename(), /ATLAS/i, 'External Word filename must not contain the internal product name.');
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
        const browser313 = rendered.filter(row => normalized(row.Route).replace(/[†‡]/g, '') === '313');
        if (control.id === 'enfield-313-e2e') {
        assert.ok(browser313.length, 'Enfield production Browser did not render the captured-response TfL 313 service.');
        assert.ok(browser313.some(row => /Typically every ~20 mins/.test(row['Typical frequency']) && /Every ~30 mins/.test(row['Typical frequency'])), 'Enfield production Browser did not retain the actual normal 313 timetable population.');
        assert.ok(browser313.every(row => !/1 journey\/day/i.test(row['Typical frequency'])), 'The incomplete one-trip school interval must not replace the normal 313 principal row.');
        assert.match(renderedServiceNotes.join(' '), /Short workings: Some route 313 journeys operate to .*Crown Road \(EN1\) \(School-day journeys only\)\./i, 'The Run #75 school-day short working must remain visible as a subordinate route qualification, alongside any other evidenced short workings.');
        const route313BrowserText = `${browser313.map(row => `${row['Typical frequency']} ${row['Operating period at stop']}`).join(' ')} ${renderedServiceNotes.join(' ')}`;
        assert.doesNotMatch(route313BrowserText, /Non-school days only\. School-day journeys only\./i, 'Enfield Browser must not generate contradictory route-313 calendar wording.');
        assert.doesNotMatch(route313BrowserText, /313\s*[–-]\s*(?:School-day journeys only|Non-school days only)\./i, 'Enfield Browser must not classify the whole route-313 principal as school-only or non-school-only.');
        const expectedOperator313 = normalized(enfieldFixtures.get('enfield-313-e2e').operator);
        assert.ok(browser313.every(row => normalized(row.Operator) === expectedOperator313), `Enfield route 313 Browser operator differs from the active iBus operator ${expectedOperator313}.`);
        const word313 = wordRows.filter(row => normalized(row.Route).replace(/[†‡]/g, '') === '313');
        assert.equal(word313.length, browser313.length, 'Enfield route 313 Browser/Word row counts differ.');
        assert.ok(word313.every(row => normalized(row.Operator) === expectedOperator313), `Enfield route 313 Word operator differs from the active iBus operator ${expectedOperator313}.`);
        assert.doesNotMatch(exportedWordText, /Non-school days only\. School-day journeys only\./i, 'Enfield Word must not generate contradictory route-313 calendar wording.');
        assert.doesNotMatch(exportedWordText, /313\s*[–-]\s*(?:School-day journeys only|Non-school days only)\./i, 'Enfield Word must not classify the whole route-313 principal as school-only or non-school-only.');
        assert.match(exportedWordText, /Short workings: Some route 313 journeys operate to .*Crown Road \(EN1\) \(School-day journeys only\)\./i, 'Generated Word must preserve the Run #75 subordinate route-313 short-working qualification, alongside any other evidenced short workings.');
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
          const stopId329 = enfieldFixtures.get('enfield-329-e2e').stopId;
          assert.equal(browser329.length, 0, 'The accepted Enfield route-329 control must not fabricate a resolved planner service row from conflicting candidate evidence.');
          assert.equal(word329.length, 0, 'The accepted Enfield route-329 control must not fabricate a resolved Word summary row from conflicting candidate evidence.');
          assert.match(checksText, /Route 329 · Stop 490006588R · timetable source: This route\/stop timetable request remained unresolved/i, 'Browser Sources & checks must expose the accepted route-329 unresolved timetable evidence.');
          assert.doesNotMatch(exportedWordText, /Planner review required|routes 329 at one or more assessed stops/i, 'Internal route-329 evidence review stays in Sources & Checks, not the planning report.');
          const candidateRecordsAtStop = enfieldFixtures.get('enfield-329-e2e').candidateServices.filter(service => service.stopsWithSchedules.includes(stopId329));
          const candidateOperatorsAtStop = [...new Set(candidateRecordsAtStop.map(service => normalized(service.operator)).filter(Boolean))].sort();
          assert.ok(candidateRecordsAtStop.length >= 2, 'Candidate evidence must show the competing BODS route-329 records at the assessed stop.');
          assert.ok(candidateOperatorsAtStop.length > 1, 'Candidate BODS records must demonstrate conflicting operator mappings; do not infer one.');
          const serviceLineMappings = enfieldIbusIndex.serviceLines.filter(line => String(line.serviceLineNo) === '329');
          const productivePatterns = enfieldIbusIndex.patterns.filter(pattern => String(pattern.serviceLineNo) === '329' && Number(pattern.patternType) === 1).length;
          assert.equal(serviceLineMappings.length, 0, 'The applicable iBus index must remain without a route-329 Service_Line mapping.');
          assert.equal(productivePatterns, 0, 'The applicable iBus index must remain without a productive route-329 pattern.');
          outcome.enfieldRoute329OperatorTrace = {
            control: { latitude: control.latitude, longitude: control.longitude, stopId: stopId329, stopName: enfieldFixtures.get('enfield-329-e2e').stopName },
            stopFixtureProvenance: enfieldFixtures.get('enfield-329-e2e').stopFixtureProvenance,
            browserServiceRowCount: browser329.length, wordServiceRowCount: word329.length,
            browserServiceRows: browser329.map(row => ({ route: row.Route, operator: row.Operator })),
            browserSourcesAndChecksUnresolvedEvidence: checksText.split('\n').find(line => /Route 329/.test(line) && /operator evidence/i.test(line)) ?? null,
            wordReviewQualification: null,
            candidateRecordsAtStop, candidateOperatorsAtStop,
            iBusServiceLineMappings: serviceLineMappings, iBusProductivePatterns: productivePatterns,
            unresolvedEvidence: `Route 329 · Stop ${stopId329} · timetable source: unresolved`,
            conclusion: 'At the accepted Run #75 route-329 control, conflicting BODS records do not become a fabricated resolved summary row. Browser Sources & Checks retains unresolved operator evidence; no operator is stated in the planning-facing report.'
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
        assert.match(rows230[0]['Direction / main service pattern'], /^Circular\b/i, 'Pipers route 230 Browser row must retain its proven circular classification.');
        assert.ok(rendered.some(row => row.Route === '231'), 'Pipers TNDS-only route 231 must remain available in the normal planner.');
        assert.doesNotMatch(rows230[0]['Typical frequency'], /5\s*mins/i, 'Pipers rendered route 230 must not show five-minute inflation.');
        assert.match(rows230[0]['Typical frequency'], /Sun: No scheduled service/i, 'Pipers rendered BODS-primary route 230 must retain the frozen Sunday no-service calendar.');
        assert.match(exportedWordText, /230[\s\S]{0,500}Sun: No scheduled service/i, 'Generated Word export does not preserve the route 230 Sunday no-service calendar.');
        assert.match(exportedWordText, /230.*60\s*mins/i, 'Generated Word export does not preserve the hourly route 230 frequency.');
        assert.match(exportedWordText, /Circular service: Route 230 operates as a circular service/i, 'Generated Word export is missing the route-230 circular qualification.');
        assert.equal(wordRows.filter(row => row.Route === '230').length, 1, 'Pipers Word export must express circularity without creating a duplicate route-230 service row.');
        assert.doesNotMatch(exportedWordText, /(?:every|~)\s*5\s*mins/i, 'Pipers Word export must not retain five-minute route frequency inflation.');
      }
      if (control.id === 'pipers-route46') {
        const rows46 = rendered.filter(row => /^46$/i.test(row.Route || ''));
        const frequency46 = rows46.map(row => row['Typical frequency'] || '').join(' ');
        assert.ok(rows46.length >= 1, 'Pipers extended-radius control must render route 46 from the frozen candidate.');
        assert.ok(rows46.every(row => /\*/.test(row['Served at'] || '')), 'Pipers route 46 frequency must be tied to the selected assessed stop.');
        assert.doesNotMatch(frequency46, /(?:every|~)\s*(?:5|15)\s*[–-]\s*60\s*mins|(?:every|~)\s*5\s*mins/i, 'Pipers route 46 must not combine duplicate/cross-stop headways into a falsely frequent 5–60 or 15–60 minute range.');
        assert.match(frequency46, /(?:every\s*~?\s*(?:55|56|57|58|59|60)|~\s*(?:55|56|57|58|59|60))\s*mins/i, 'Pipers route 46 selected-stop population should present the candidate-supported broadly hourly service.');
        const word46 = wordRows.filter(row => normalized(row.Route) === '46');
        assert.ok(word46.length, 'Pipers route 46 must remain in generated Word output.');
        assert.ok(word46.every(row => /\*/.test(row['Served at'] || '')), 'Pipers Word route 46 frequency must identify its selected assessed stop.');
        assert.doesNotMatch(word46.map(row => row['Typical frequency']).join(' '), /(?:every|~)\s*(?:5|15)\s*[–-]\s*60\s*mins|(?:every|~)\s*5\s*mins/i, 'Pipers Word route 46 must not retain duplicate/cross-stop frequency inflation.');
        assert.match(word46.map(row => row['Typical frequency']).join(' '), /(?:every\s*~?\s*(?:55|56|57|58|59|60)|~\s*(?:55|56|57|58|59|60))\s*mins/i, 'Pipers Word route 46 should preserve the broadly hourly selected-stop frequency.');
      }
      if (control.id === 'waltham-cross') {
        assert.doesNotMatch(`${checksText} ${exportedWordText}`, /Planner review required for:\s*(?:217|279|317|327|491|N279)|timetable data unavailable\/incomplete for 1 assessed stop/i, 'Waltham output contains a known false review/incomplete warning.');
        const rows217 = rendered.filter(row => /^217$/i.test(row.Route || ''));
        assert.ok(rows217.length, 'Waltham route 217 operating-period regression control is missing.');
        assert.doesNotMatch(rows217.map(row => row['Operating period at stop']).join(' '), /00:05\s*[–-]\s*00:25/i, 'Waltham route 217 must not collapse to the reported late-night-only period.');
        assert.ok(rows217.some(row => /TfL/i.test(row.Source) && /04:00.*00:59/i.test(row['Operating period at stop'])), 'Waltham route 217 must retain the fixture-backed full TfL span at the selected stop in the normal Browser table.');
        assert.match(exportedWordText, /217[\s\S]{0,500}04:00.*00:59/i, 'Waltham Word export does not preserve the fixture-backed route 217 operating span.');
        assert.doesNotMatch(exportedWordText, /Source\s*:\s*TfL/i, 'Word output remains source-neutral while Browser identifies TfL authority.');
        const route66Rows = rendered.filter(row => row.Route === '66' && /Arriva Herts/i.test(row.Operator || '') && /Towards Loughton Station/i.test(row['Direction / main service pattern'] || ''));
        assert.ok(route66Rows.length, 'Waltham Browser must retain the regular frozen-candidate BODS route-66 service at Stop C.');
        assert.ok(route66Rows.some(row => /Typically every ~30[–-]40 mins/i.test(row['Typical frequency']) && /05:29.*19:05/i.test(row['Operating period at stop'])), 'Waltham Browser route 66 must reflect the full regular Stop C departures and 05:29–19:05 span.');
        const route66WordRows = wordRows.filter(row => row.Route === '66' && /Arriva Herts/i.test(row.Operator || '') && /Towards Loughton Station/i.test(row['Direction / main service pattern'] || ''));
        assert.ok(route66WordRows.length, 'Waltham Word must retain the regular frozen-candidate BODS route-66 service.');
        assert.ok(route66WordRows.some(row => /Typically every ~30[–-]40 mins/i.test(row['Typical frequency']) && /05:29.*19:05/i.test(row['Operating period at stop'])), 'Waltham Word route 66 must materially match the corrected Browser service.');
        assert.doesNotMatch(route66WordRows.map(row => `${row['Typical frequency']} ${row['Operating period at stop']}`).join(' '), /2 journeys\/day|1 journey\/day/, 'Waltham route 66 Word row must not retain the historical 2/1 collapse.');
        if (route66Rows.length) outcome.route66BrowserWord = { browser: route66Rows.map(row => ({frequency:row['Typical frequency'],period:row['Operating period at stop']})), word: route66WordRows.map(row => ({frequency:row['Typical frequency'],period:row['Operating period at stop']})), selectedStop:'210021703430' };
        const route13 = rendered.find(row => row.Route === '13');
        assert.ok(route13, 'Waltham route 13 principal row is missing.');
        assert.match(route13['Direction / main service pattern'] || '', /Towards\s+The Talbot/i, 'Waltham route 13 principal direction is missing.');
        assert.match(route13['Principal locations'] || '', /Waltham Cross Railway Station/i, 'Waltham route 13 principal locations are missing.');
        await page.locator('#includeMapInWord').uncheck();
        const mapOffDownloadPromise = page.waitForEvent('download', { timeout: 30000 });
        await page.locator('#exportBusWord').click();
        const mapOffDownload = await mapOffDownloadPromise;
        const mapOffPath = path.join(wordDirectory, `atlas-s2e1-${control.id}-map-off.docx`);
        await mapOffDownload.saveAs(mapOffPath);
        const mapOffBytes = await readFile(mapOffPath);
        const mapOffXml = zipEntry(mapOffBytes, 'word/document.xml');
        assert.equal(mapOffBytes.includes(Buffer.from('word/media/assessment-map.png')), false, 'Map-off Word export must not embed an assessment map.');
        assert.doesNotMatch(mapOffXml, /Map reference|\[\d+\]/, 'Map-off Word export must remove the reference column and all numeric map references.');
        outcome.wordMapModes = { mapOnEmbedded: true, mapOffEmbedded: false, mapOffReferencesRemoved: true };
        const standaloneMapPromise = page.waitForEvent('download', { timeout: 30000 });
        await page.locator('#exportAssessmentMap').click();
        const standaloneMap = await standaloneMapPromise;
        const standaloneMapPath = path.join(wordDirectory, `atlas-s2e1-${control.id}-standalone-map.pdf`);
        await standaloneMap.saveAs(standaloneMapPath);
        const standaloneMapBytes = await readFile(standaloneMapPath);
        assert.equal(standaloneMapBytes.subarray(0, 8).toString('ascii'), '%PDF-1.4', 'Standalone assessment map must be a generated PDF.');
        assert.ok(standaloneMapBytes.includes(Buffer.from('/MediaBox [0 0 1190.55 841.89]')), 'Standalone map PDF must use a landscape A3 page.');
        assert.match(standaloneMap.suggestedFilename(), /^Bus Assessment Map/i, 'Standalone map must use a neutral planning-facing filename.');
        assert.doesNotMatch(standaloneMap.suggestedFilename(), /ATLAS/i, 'Standalone map filename must not expose the internal product name.');
        assert.doesNotMatch(await page.locator('body').innerText(), /\?\?\?/,'Browser output must never expose broken stop labels.');
        outcome.standaloneMap = { format: 'PDF', page: 'A3 landscape', validSignature: true, neutralFilename: standaloneMap.suggestedFilename() };
      }
      if (control.id === 'chingford') {
        const route657 = rendered.find(row => row.Route === '657');
        assert.ok(route657, 'Chingford golden control lost route 657.');
        assert.match(route657['Typical frequency'], /Mon-Fri(?: \(School days\))?: 1 journey\/day/i, 'Chingford route 657 fixture golden frequency changed.');
        assert.match(route657['Operating period at stop'], /07:56|16:22/, 'Chingford route 657 fixture golden timetable time changed.');
      }
      if (control.id === 'pe1') {
        const rows202 = rendered.filter(row => row.Route === '202');
        const word202 = wordRows.filter(row => row.Route === '202');
        const route202Labels = rows202.map(row => `${row['Direction / main service pattern']} ${row['Principal locations']}`);
        assert.equal(rows202.length, 3, `PE1 route 202 must preserve its three evidence-backed patterns; received ${rows202.length}.`);
        assert.equal(word202.length, 3, `PE1 Word route 202 must preserve its three Browser patterns; received ${word202.length}.`);
        assert.ok(route202Labels.some(value => /Peterborough Bus Station/i.test(value)), 'PE1 route 202 Peterborough Bus Station principal pattern is missing.');
        assert.ok(route202Labels.some(value => /Austerby|Helpston/i.test(value)), 'PE1 route 202 Austerby/Helpston pattern is missing.');
        assert.ok(route202Labels.some(value => /Bourne|Bainton/i.test(value)), 'PE1 route 202 separate Bourne/Bainton pattern is missing.');
        const peterborough202 = rows202.find(row => /Peterborough Bus Station/i.test(row['Direction / main service pattern'] || ''));
        const austerby202 = rows202.find(row => /Austerby/i.test(row['Direction / main service pattern'] || ''));
        const bourne202 = rows202.find(row => /Bourne Bus Station/i.test(row['Direction / main service pattern'] || '') || /Bainton/i.test(row['Principal locations'] || ''));
        assert.ok(peterborough202 && austerby202 && bourne202, 'PE1 route 202 must preserve outbound Peterborough, inbound Austerby/Helpston and the distinct Bourne/Bainton branch.');
        assert.notEqual(austerby202, bourne202, 'PE1 Bourne/Bainton branch is distinct from the Austerby principal pattern.');
        assert.match(peterborough202['Served at'] || '', /Arrivals/i, 'PE1 outbound pattern must retain the Queensgate arrivals assessed-stop population.');
        assert.match(peterborough202['Typical frequency'] || '', /Mon-Sat: 2 journeys\/day/i, 'PE1 outbound pattern must preserve its two unique Mon-Sat departures.');
        assert.match(peterborough202['Operating period at stop'] || '', /17:04.*18:04/i, 'PE1 outbound pattern must preserve its 17:04–18:04 operating span.');
        assert.match(austerby202['Served at'] || '', /Bay 9/i, 'PE1 Austerby pattern must retain the Queensgate Bay 9 assessed-stop population.');
        assert.match(austerby202['Typical frequency'] || '', /Mon-Fri: 2 journeys\/day/i, 'PE1 Austerby pattern must preserve both distinct weekday departure times.');
        assert.match(austerby202['Operating period at stop'] || '', /07:10.*07:45/i, 'PE1 Austerby pattern must preserve its weekday 07:10–07:45 span.');
        assert.match(bourne202['Served at'] || '', /Bay 9/i, 'PE1 Bourne/Bainton branch must retain the Queensgate Bay 9 selected stop.');
        assert.match(bourne202['Principal locations'] || '', /Bainton/i, 'PE1 Bourne/Bainton branch must retain its distinct intermediate Bainton path.');
        assert.match(bourne202['Typical frequency'] || '', /Mon-Fri: 1 journey\/day/i, 'PE1 Bourne/Bainton branch must remain a distinct weekday journey population.');
        assert.match(bourne202['Operating period at stop'] || '', /07:45/i, 'PE1 Bourne/Bainton branch must retain its selected-stop 07:45 departure.');
        for (const [label, browserRow] of [['Peterborough', peterborough202], ['Austerby', austerby202], ['Bourne', bourne202]]) {
          const wordRow = word202.find(candidate => candidate['Direction / main service pattern'] === browserRow['Direction / main service pattern']);
          assert.ok(wordRow, `PE1 Word export is missing the ${label} route-202 pattern.`);
          for (const field of ['Served at', 'Principal locations', 'Typical frequency', 'Operating period at stop']) {
            const normalizedWord = wordRow[field].replace(/;\s*/g, ' ').replace(/\s+/g, ' ').trim();
            const normalizedBrowser = browserRow[field].replace(/;\s*/g, ' ').replace(/\s+/g, ' ').trim();
            assert.equal(normalizedWord, normalizedBrowser, `PE1 Browser/Word ${label} route-202 ${field} diverged.`);
          }
        }
        assert.doesNotMatch(renderedServiceNotes.join(' '), /Additional services: Some route 202 journeys also serve Bourne Bus Station\./i, 'PE1 Browser must not repeat the Bourne destination as an additional-services note.');
        assert.doesNotMatch(exportedWordText, /Additional services: Some route 202 journeys also serve Bourne Bus Station\./i, 'PE1 Word must not repeat the Bourne destination as an additional-services note.');
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
report.tflReplayRequests = tflReplayRequests;
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
