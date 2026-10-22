import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { createSite, confirmSite } from '../../src/atlas/domain/site.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { partialTimetableQualification } from '../../src/atlas/domain/bus-source-presentation.mjs';
import { launchAtlasBrowser } from './playwright-launch.mjs';

const [candidateArg, reportArg] = process.argv.slice(2);
if (!candidateArg) throw new Error('Usage: node tests/atlas/s2c3-real-candidate-runtime-audit.mjs <candidate-root> [report.json]');
const candidateRoot = path.resolve(candidateArg);
const repositoryRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const busRoot = path.join(candidateRoot, 'atlas', 'data', 'bus');
const tndsRoot = path.join(candidateRoot, 'atlas', 'data', 'bus-tnds');
const requested = [];
let blockedRelative = null;
let activeControlId = null;
const failures = [];
const checks = [];
function check(id, passed, reason = '') {
  const result = { id, outcome: passed ? 'PASS' : 'FAIL', reason: passed ? null : String(reason || 'Assertion failed.') };
  checks.push(result);
  if (!passed) failures.push(result);
  return passed;
}
function visibleWordRouteNumbers(rows, expectedRoutes) {
  const visible = new Set();
  const includesRoute = (value, route) => {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z0-9])${escaped}($|[^A-Za-z0-9])`, 'i').test(value);
  };
  for (const row of rows ?? []) {
    const values = Array.isArray(row) ? [String(row[0] ?? '')] : [String(row?.text ?? '')];
    for (const value of values) for (const route of expectedRoutes) if (includesRoute(value, route)) visible.add(route);
  }
  return [...visible].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}
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
  requested.push({ controlId: activeControlId, source: root === busRoot ? 'BODS/NaPTAN' : 'TNDS', relative });
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
  try {
  activeControlId = control.id;
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
  const plannerRoutes = [...new Set(plannerRows.flatMap(row => [row.routeNumber, ...(row.publicRouteNumbers ?? []), ...(row.routeNumbers ?? []), ...(row.memberRouteNumbers ?? []), ...(row.routeFamilyMembers ?? []).map(member => member.routeNumber)].filter(Boolean).map(String)))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const wordTables = buildBusWordTables(assessment);
  const wordRouteNumbers = visibleWordRouteNumbers(wordTables[1]?.rows, plannerRoutes);
  const wordServiceRows = (wordTables[1]?.rows ?? []).filter(Array.isArray).map(row => ({
    route: String(row[0] ?? ''), direction: String(row[2] ?? ''), servedAt: String(row[3] ?? ''),
    principalLocations: String(row[4] ?? ''), frequency: String(row[5] ?? ''), operatingPeriod: String(row[6] ?? '')
  }));
    results[control.id] = {
    control,
    assessmentStatus: assessment.status,
    discoveredStopCount: assessment.discoveredStopCount,
    stops: (assessment.stops ?? []).map(stop => ({ id: stop.id, name: stop.name, routes: stop.routes ?? [], busDomainEligible: stop.busDomainEligible ?? null, timetableCallEligible: stop.timetableCallEligible ?? null, timetableEvidenceStatus: stop.timetableEvidenceStatus ?? null })),
    serviceRows: serviceRows.map(service => ({ id: service.id, routeNumber: service.routeNumber, operator: service.operator, sourceRegion: service.source?.region ?? null, timetableSource: service.timetableSource ?? null, sourceWarnings: service.sourceWarnings ?? [], origin: service.origin, destination: service.destination, direction: service.direction, circularPatternStopIds: service.circularPatternStopIds ?? [], calendarEvidence: service.calendarEvidence ?? [], calendarProfileId: service.calendarProfileId ?? null, qualifications: service.qualifications ?? [], schoolDayOnly: Boolean(service.schoolDayOnly || service.qualifications?.some(value => /school/i.test(String(value))) || service.calendarEvidence?.some(value => value?.schoolDayOnly === true || /school/i.test(String(value?.calendarProfileId ?? '')))), matchedStopPointIds: Object.keys(service.stopSchedules ?? {}), stopSchedules: service.stopSchedules ?? {}, routePatternStopIds: service.routePatternStopIds ?? [], routePatternStops: service.routePatternStops ?? [], sourceIdentity: service.source ?? null })),
    serviceSummaries: (assessment.serviceSummaries ?? []).map(service => ({ id: service.id, routeNumber: service.routeNumber, operator: service.operator, origin: service.origin, destination: service.destination, direction: service.direction, routeNumbers: service.routeNumbers ?? [], timetableSource: service.timetableSource ?? null, sourceProvider: service.source?.provider ?? null, typicalFrequencyLines: service.typicalFrequencyLines ?? [], typicalFrequencyText: service.typicalFrequencyText ?? '', sourceRecordIds: service.sourceRecordIds ?? [], variantCount: service.variantCount ?? null, variantServiceIds: service.variantServiceIds ?? [], rawServiceSummaries: (service.rawServiceSummaries ?? []).map(raw => ({ id: raw.id, routeNumber: raw.routeNumber, operator: raw.operator, origin: raw.origin, destination: raw.destination, direction: raw.direction, timetableSource: raw.timetableSource ?? null, source: raw.source ?? null, routePatternStopIds: raw.routePatternStopIds ?? [], calendarProfileId: raw.calendarProfileId ?? null })) })),
    plannerRoutes,
    exportParity: { plannerRouteNumbers: plannerRoutes, wordRouteNumbers, missingFromWord: plannerRoutes.filter(route => !wordRouteNumbers.includes(route)), extraInWord: wordRouteNumbers.filter(route => !plannerRoutes.includes(route)) },
    wordServiceRows,
    warnings: assessment.warnings ?? [],
    reviewItems: assessment.reviewItems ?? [],
    timetableQualification: partialTimetableQualification(assessment.stops),
    plannerRows: plannerRows.map(row => ({ routeNumber: row.routeNumber, routeNumbers: row.routeNumbers ?? [], publicRouteNumbers: row.publicRouteNumbers ?? [], memberRouteNumbers: row.memberRouteNumbers ?? [], routeFamilyLabel: row.routeFamilyLabel ?? null, routeFamilyMembers: row.routeFamilyMembers ?? [], operator: row.operator, origin: row.origin, destination: row.destination, direction: row.direction, directionPatternText: row.directionPatternText ?? null, principalLocationsText: row.principalLocationsText ?? null, typicalFrequencyLines: row.typicalFrequencyLines ?? [], operatingPeriodLines: row.operatingPeriodLines ?? [], sourceRecordIds: row.sourceRecordIds ?? [], circular: row.circular ?? null, circularServiceDecision: row.circularServiceDecision ?? null, calendarProfileIds: row.calendarProfileIds ?? [], qualificationNotes: row.qualificationNotes ?? [], publicRouteFamilyDecision: row.publicRouteFamilyDecision ?? null, groupingDecision: row.groupingDecision ?? null, terminusDecision: row.terminusDecision ?? null })),
    supplementarySourceCondition: servicesResult?.provenance?.supplementarySourceCondition ?? null,
    sourceCompleteness: servicesResult?.provenance?.sourceCompleteness ?? null,
    unresolvedRequestIdentities: servicesResult?.provenance?.unresolvedRequestIdentities ?? [],
    failedShardDiagnostics: servicesResult?.provenance?.failedShardDiagnostics ?? []
  };
  } catch (error) {
    results[control.id] = { control, outcome: 'BLOCKED', error: error.message, stops: [], serviceRows: [], serviceSummaries: [], plannerRoutes: [], plannerRows: [], exportParity: { plannerRouteNumbers: [], wordRouteNumbers: [], missingFromWord: [], extraInWord: [] }, unresolvedRequestIdentities: [], failedShardDiagnostics: [] };
    check(`control-${control.id}`, false, error.message);
  } finally { activeControlId = null; }
}

async function preparedRouteEvidence(sourceRoot, sourcePath, stopIds, routeNumber) {
  let bytes = await readFile(path.join(sourceRoot, sourcePath));
  if (sourcePath.toLowerCase().endsWith('.gz')) bytes = gunzipSync(bytes);
  const document = JSON.parse(bytes.toString('utf8'));
  const stack = [document];
  const found = [];
  const wanted = new Set(stopIds.map(String));
  const route = String(routeNumber).toUpperCase().replace(/\s+/g, '');
  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) { stack.push(...value); continue; }
    if (String(value.routeNumber ?? '').toUpperCase().replace(/\s+/g, '') === route) {
      const schedules = value.stopSchedules ?? {};
      const matchedStopIds = [...wanted].filter(id => Object.hasOwn(schedules, id));
      if (matchedStopIds.length) found.push({
        id: value.id ?? null, routeNumber: value.routeNumber, operator: value.operator ?? null,
        timetableSource: value.timetableSource ?? value.source?.provider ?? null,
        origin: value.origin ?? null, destination: value.destination ?? null, direction: value.direction ?? null,
        matchedStopIds, stopSchedules: Object.fromEntries(matchedStopIds.map(id => [id, schedules[id]])),
        routePatternStopIds: value.routePatternStopIds ?? [], routePatternStops: value.routePatternStops ?? [],
        calendarProfileId: value.calendarProfileId ?? null, validFrom: value.validFrom ?? null, validTo: value.validTo ?? null,
        source: value.source ?? null, tndsQuarantine: value.tndsQuarantine ?? null,
        fragment: value.fragment ?? null
      });
    }
    stack.push(...Object.values(value));
  }
  return found;
}

const walthamStops = results['waltham-cross-47-berkley-avenue'].stops;
const walthamStopIds = walthamStops.filter(stop => stop.timetableCallEligible !== false).map(stop => String(stop.id));
const walthamRequestedFiles = [...new Map(requested
  .filter(item => item.controlId === 'waltham-cross-47-berkley-avenue')
  .map(item => [`${item.source}|${item.relative}`, item])).values()];
const walthamPreparedRecords = {};
for (const route of ['13', '13A', '13B', '13C']) {
  const bods = [], tnds = [];
  for (const file of walthamRequestedFiles) {
    const root = file.source === 'BODS/NaPTAN' ? busRoot : tndsRoot;
    const rows = await preparedRouteEvidence(root, file.relative, walthamStopIds, route);
    (file.source === 'BODS/NaPTAN' ? bods : tnds).push(...rows.map(row => ({ ...row, shard: file.relative })));
  }
  walthamPreparedRecords[route] = { bods, tnds };
}

const tndsManifest = JSON.parse(await readFile(path.join(tndsRoot, 'manifest.json'), 'utf8'));
const regionSweep = [];
for (const region of ['EA', 'EM', 'NE', 'NW', 'SE', 'SW', 'WM', 'Y']) {
  try {
    const descriptors = Object.values(tndsManifest.serviceShards ?? {}).flat();
    const descriptor = descriptors.find(item => String(item.path).toLowerCase().includes(`-${region.toLowerCase()}-`) && item.stopIds?.length);
    if (!descriptor) throw new Error(`No selectable TNDS runtime shard for ${region}`);
    const stopId = descriptor.stopIds[0];
    const result = await adapter.servicesForStops([{ id: stopId, name: `candidate ${region} sweep stop`, routes: [], timetableAuthority: 'NaPTAN', timetableCallEligible: true }]);
    const matched = (result.data ?? []).filter(service => String(service.source?.region ?? '').toUpperCase() === region);
    regionSweep.push({ region, outcome: matched.length ? 'PASS' : 'FAIL', reason: matched.length ? null : 'No composed row matched the selected shard stop.', stopId, descriptorPath: descriptor.path, parentRows: matched.length, requestedShards: result.provenance?.tndsShardRequests ?? null, supplementarySourceCondition: result.provenance?.supplementarySourceCondition ?? null, sourceCompleteness: result.provenance?.sourceCompleteness ?? null });
    check(`national-region-${region}`, matched.length > 0, `No composed row matched ${region} at ${stopId}.`);
  } catch (error) {
    regionSweep.push({ region, outcome: 'BLOCKED', reason: error.message });
    check(`national-region-${region}`, false, error.message);
  }
}

let beforeFailure = { data: [], provenance: {} }, afterFailure = { data: [], provenance: {} }, bodsBeforeFailure = [], bodsAfterFailure = [];
let fragmentedDescriptor = null;
try {
  fragmentedDescriptor = Object.values(tndsManifest.serviceShards ?? {}).flat().find(item => item.fragmentId && item.stopIds?.length);
  if (!fragmentedDescriptor) throw new Error('No fragmented logical service in the actual candidate.');
  const failureStop = { id: fragmentedDescriptor.stopIds[0], name: 'candidate fragment failure test', routes: [], timetableAuthority: 'NaPTAN', timetableCallEligible: true };
  beforeFailure = await adapter.servicesForStops([failureStop]);
  bodsBeforeFailure = (beforeFailure.data ?? []).filter(service => !/^tnds:/i.test(String(service.id))).map(service => String(service.id)).sort();
  blockedRelative = fragmentedDescriptor.path;
  afterFailure = await adapter.servicesForStops([failureStop]);
  bodsAfterFailure = (afterFailure.data ?? []).filter(service => !/^tnds:/i.test(String(service.id))).map(service => String(service.id)).sort();
  check('fragment-failure-is-unresolved', afterFailure.provenance?.supplementarySourceCondition === 'UNRESOLVED' && afterFailure.provenance?.sourceCompleteness === 'PARTIAL', 'Missing actual candidate fragment did not produce unresolved/partial provenance.');
  check('incomplete-parent-withheld', !(afterFailure.data ?? []).some(service => service.id === fragmentedDescriptor.parentServiceId), 'Incomplete logical TNDS parent was not withheld.');
  check('bodss-preserved-after-tnds-fragment-failure', JSON.stringify(bodsAfterFailure) === JSON.stringify(bodsBeforeFailure), 'Missing TNDS fragment changed independently matched BODS services.');
} catch (error) {
  check('fragment-completeness-safety', false, error.message);
} finally { blockedRelative = null; }

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
check('pipers-bods-primary-230', pipers.serviceRows.some(row => row.routeNumber === '230' && !/^tnds:/i.test(String(row.id))), 'BODS-primary 230 missing at Pipers Lane.');
check('pipers-tnds-230', pipers.serviceRows.some(row => row.routeNumber === '230' && /^tnds:/i.test(String(row.id))), 'TNDS 230 missing at Pipers Lane.');
check('pipers-tnds-only-231', pipers.serviceRows.some(row => row.routeNumber === '231' && /^tnds:/i.test(String(row.id))), 'TNDS-only 231 missing at Pipers Lane.');
check('pipers-planner-230-231', pipers.plannerRoutes.includes('230') && pipers.plannerRoutes.includes('231'), 'Pipers 230/231 evidence did not reach planner summaries.');
check('pipers-circular-evidence', pipers.plannerRows.some(row => row.circular) || pipers.serviceRows.some(row => row.circularPatternStopIds.length > 0), 'Pipers circular evidence missing downstream.');
const pipers230Rows = pipers.plannerRows.filter(row => String(row.routeNumber) === '230');
const pipers230WordRows = pipers.wordServiceRows.filter(row => /^230$/i.test(row.route));
// Internal composition diagnostics are not a normal-product presentation
// oracle. Rendered row count, calendar, frequency and browser/Word parity are
// gated by s2e1-manual-product-audit.mjs.
check('pipers-230-evidence-reaches-planner-word', pipers230Rows.length > 0 && pipers230WordRows.length > 0, `Pipers 230 evidence did not reach planner/Word diagnostics; planner=${pipers230Rows.length}, Word=${pipers230WordRows.length}.`);
check('waltham-required-routes', requiredWalthamRoutes.every(route => walthamAvailability[route]), `Missing planner routes: ${requiredWalthamRoutes.filter(route => !walthamAvailability[route]).join(', ')}`);
const waltham = results['waltham-cross-47-berkley-avenue'];
const spuriousWalthamRoutes = ['217', '279', '317', '327', '491', 'N279'];
check('waltham-no-false-tfl-review-warning', !waltham.reviewItems.some(item => spuriousWalthamRoutes.includes(String(item.route)) && /review|unavailable|incomplete/i.test(String(item.message))), `Waltham still reports materially unproven timetable warnings for ${spuriousWalthamRoutes.filter(route => waltham.reviewItems.some(item => String(item.route) === route && /review|unavailable|incomplete/i.test(String(item.message)))).join(', ')}.`);
check('waltham-no-false-stop-unavailable-warning', !/timetable data unavailable\/incomplete for 1 assessed stop/i.test(`${waltham.warnings.join(' ')} ${waltham.timetableQualification || ''}`), `Waltham still presents an incomplete timetable warning: ${waltham.timetableQualification || waltham.warnings.join(' ')}`);
check('chingford-routes', chingfordExpected.every(route => chingfordAvailability[route]), `Missing Chingford routes: ${chingfordExpected.filter(route => !chingfordAvailability[route]).join(', ')}`);
check('chingford-657-school-day', results['normanshire-drive'].serviceRows.some(row => row.routeNumber === '657' && row.schoolDayOnly), 'Route 657 school-day semantics missing.');
check('pe1-call-eligible-stops', pe1CallEligibleStops.length > 0, 'PE1 has no timetable-call-eligible stops.');
check('pe1-visible-outcome', pe1HasVisibleLocalOutcome, 'PE1 has neither service evidence nor unresolved evidence.');
const route102Rows = pe1.plannerRows.filter(row => String(row.routeNumber) === '102' || (row.routeNumbers ?? []).some(route => String(route) === '102'));
check('pe1-route102-evidence-retained', route102Rows.length > 0, 'PE1 route 102 evidence is missing from the internal planner composition report.');
const pe1X4Rows = pe1.plannerRows.filter(row => String(row.routeNumber) === 'X4' || (row.routeNumbers ?? []).some(route => String(route) === 'X4'));
check('pe1-x4-evidence-retained', pe1X4Rows.length > 0 && pe1X4Rows.some(row => row.directionPatternText || row.principalLocationsText), `PE1 X4 route evidence or pattern context is missing; found ${pe1X4Rows.length} rows.`);
// Raw source diagnostics intentionally retain date-specific metadata. The
// normal browser's Sources & checks surface is gated by the rendered product audit.
check('queensgate-bce-entrance', queensgateBceEntrances.length > 0, 'Queensgate has no BCE entrance records.');
check('queensgate-bce-noncall', queensgateBceNonCallInfrastructureOnly, 'Queensgate BCE entrance was treated as timetable-call infrastructure.');
for (const [id, label] of [
  ['waltham-cross-47-berkley-avenue', 'Waltham'],
  ['pipers-lane', 'Pipers'],
  ['normanshire-drive', 'Chingford']
]) {
  const parity = results[id]?.exportParity ?? { missingFromWord: [], extraInWord: [] };
  check(`word-export-route-parity-${id}`, parity.missingFromWord.length === 0 && parity.extraInWord.length === 0,
    `${label} planner/Word route mismatch; missing from Word: ${parity.missingFromWord.join(', ') || 'none'}; extra in Word: ${parity.extraInWord.join(', ') || 'none'}.`);
}
const report = {
  schema: 'atlas-s2d1-real-candidate-runtime-audit-v1',
  candidateRoot,
  sourceAcquisition: false,
  publicationAttempted: false,
  deploymentAttempted: false,
  requestedFileCount: requested.length,
  requestedFiles: requested,
  controls: results,
  controlOutcomes: Object.fromEntries([
    ['waltham-cross-47-berkley-avenue', ['waltham-required-routes', 'word-export-route-parity-waltham-cross-47-berkley-avenue']],
    ['pipers-lane', ['pipers-bods-primary-230', 'pipers-tnds-230', 'pipers-tnds-only-231', 'pipers-planner-230-231', 'pipers-circular-evidence', 'word-export-route-parity-pipers-lane']],
    ['normanshire-drive', ['chingford-routes', 'chingford-657-school-day', 'word-export-route-parity-normanshire-drive']],
    ['pe1-2tl', ['pe1-call-eligible-stops', 'pe1-visible-outcome']],
    ['queensgate', ['queensgate-bce-entrance', 'queensgate-bce-noncall']]
  ].map(([id, checkIds]) => {
    const failed = checks.filter(item => checkIds.includes(item.id) && item.outcome !== 'PASS');
    return [id, { outcome: results[id]?.outcome === 'BLOCKED' ? 'BLOCKED' : failed.length ? 'FAIL' : 'PASS', reasons: failed.map(item => item.reason).filter(Boolean) }];
  })),
  checks,
  failures,
  pipersLane: {
    bodsRoute230: pipers.serviceRows.some(row => row.routeNumber === '230' && !/^tnds:/i.test(String(row.id))),
    tndsRoute230: pipers.serviceRows.some(row => row.routeNumber === '230' && /^tnds:/i.test(String(row.id))),
    tndsRoute231: pipers.serviceRows.some(row => row.routeNumber === '231' && /^tnds:/i.test(String(row.id))),
    plannerRoutes: pipers.plannerRoutes,
    supplementarySourceCondition: pipers.supplementarySourceCondition,
    circularRows: pipers.plannerRows.filter(row => row.circular),
    serviceRows: pipers.serviceRows.filter(row => ['230', '231'].includes(row.routeNumber))
  },
  walthamCross: {
    requiredRoutes: requiredWalthamRoutes, availability: walthamAvailability, evidenceByRoute: walthamEvidenceByRoute, missingRoutes: requiredWalthamRoutes.filter(route => !walthamAvailability[route]),
    previousAuditFalseNegative: 'The earlier route-set check omitted nested routeFamilyMembers/memberRouteNumbers. The immutable candidate retained 13A/13B through plannerRows.',
    lineage: Object.fromEntries(['13', '13A', '13B', '13C'].map(route => {
      const stops = results['waltham-cross-47-berkley-avenue'].stops.filter(stop => (stop.routes ?? []).map(value => String(value).toUpperCase()).includes(route));
      const matched = results['waltham-cross-47-berkley-avenue'].serviceRows.filter(row => String(row.routeNumber).toUpperCase() === route);
      const containsRoute = row => [row.routeNumber, ...(row.routeNumbers ?? []), ...(row.publicRouteNumbers ?? []), ...(row.memberRouteNumbers ?? []), ...(row.routeFamilyMembers ?? []).map(member => member.routeNumber)].filter(Boolean).some(value => String(value).toUpperCase() === route);
      const summarized = results['waltham-cross-47-berkley-avenue'].serviceSummaries.filter(containsRoute);
      const planner = results['waltham-cross-47-berkley-avenue'].plannerRows.filter(containsRoute);
      const prepared = walthamPreparedRecords[route] ?? { bods: [], tnds: [] };
      const rawFound = [...prepared.bods, ...prepared.tnds].length > 0;
      const stage = planner.length ? 'none; route identity is present in plannerRows' : summarized.length ? 'plannerRows' : matched.length ? 'plannerSummaryConstruction/grouping' : rawFound ? 'adapter source matching, calendar qualification or arbitration' : stops.length ? 'prepared candidate records at eligible Waltham stop IDs' : 'stop discovery / assessment eligibility';
      return [route, { eligibleStops: stops.map(stop => ({ id: stop.id, name: stop.name, routes: stop.routes, timetableCallEligible: stop.timetableCallEligible, timetableEvidenceStatus: stop.timetableEvidenceStatus })), preparedBodsRecords: prepared.bods, preparedTndsRecords: prepared.tnds, matchedRows: matched, serviceSummaries: summarized, plannerRows: planner, firstDisappearanceStage: stage }];
    }))
  },
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
    browserFixtureVerifiedMissingFragmentBodsRetention: false
  },
  artifactReadAudit: {
    serviceCount: tndsManifest.serviceCount,
    logicalRecordCount: tndsManifest.logicalRecordCount,
    fragmentRecordCount: tndsManifest.fragmentRecordCount,
    maximumShardBytes: tndsManifest.runtimeShardMaxObservedBytes,
    runtimeShardCount: tndsManifest.runtimeShardCount
  },
  readiness: { outcome: failures.length ? 'NOT_READY_FOR_MANUAL_ACCEPTANCE' : 'READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_ACCEPTANCE', failureCount: failures.length }
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
    const controls = ${JSON.stringify(controls)};
    window.runCandidateAssessment = async (controlId) => {
      const control = controls.find(item => item.id === controlId);
      if (!control) throw new Error('Unknown browser audit control: ' + controlId);
      const adapter = createPreparedBusDataAdapter({ baseUrl: location.origin + '/atlas/data/bus/', tndsBaseUrl: location.origin + '/atlas/data/bus-tnds/' });
      const site = confirmSite(createSite({ suppliedAddress: control.label, displayAddress: control.label, latitude: control.latitude, longitude: control.longitude, assessmentPoint: { method: 'coordinates_entered' } }), { confirmedAt: '2026-10-20T00:00:00Z' });
      const app = createBusAssessment({ stopDiscovery: { nearbyStops: (...args) => adapter.nearbyStops(...args) }, timetableData: adapter, accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: { source: 'actual candidate headless browser audit' } }) } });
      const result = await app.assess(site, { radius: control.radius, mode: 'full' });
      return { id: control.id, status: result.status, routes: result.plannerServiceSummaries.map(row => String(row.routeNumber)), circularRoutes: result.plannerServiceSummaries.filter(row => row.circular).map(row => String(row.routeNumber)), services: result.services.map(row => ({ id: row.id, routeNumber: String(row.routeNumber), source: row.timetableSource ?? null, region: row.source?.region ?? null })), supplementarySourceCondition: result.provenance.timetables.supplementarySourceCondition, sourceCompleteness: result.provenance.timetables.sourceCompleteness };
    };
  </script>`;
  browser = await launchAtlasBrowser(chromium, { headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  const failedRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));
  await page.goto(new URL('s2c3-headless-harness.html', browserRoot).href, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => typeof window.runCandidateAssessment === 'function');
  const browserControls = {};
  for (const control of controls) {
    try { browserControls[control.id] = { outcome: 'PASS', ...(await page.evaluate(id => window.runCandidateAssessment(id), control.id)) }; }
    catch (error) { browserControls[control.id] = { outcome: 'FAIL', reason: error.message }; }
  }
  const pipersBrowser = browserControls['pipers-lane'];
  check('browser-pipers-230-231', Boolean(pipersBrowser?.routes?.includes('230') && pipersBrowser?.routes?.includes('231')), 'Browser candidate runtime did not return Pipers 230/231.');
  check('browser-pipers-complete', pipersBrowser?.supplementarySourceCondition === 'CHECKED' && pipersBrowser?.sourceCompleteness === 'COMPLETE', 'Browser Pipers supplementary evidence was not complete.');
  check('browser-console-errors', pageErrors.length === 0, pageErrors.join('; '));
  check('browser-failed-requests', failedRequests.length === 0, JSON.stringify(failedRequests));
  check('browser-all-controls-ran', Object.keys(browserControls).length === controls.length, 'Not all browser control assessments ran.');
  report.headlessBrowserRuntime = { passed: !Object.values(browserControls).some(item => item.outcome !== 'PASS') && pageErrors.length === 0 && failedRequests.length === 0, controls: browserControls, browserRequestCount: browserRequests.length, browserRequests, pageErrors, failedRequests };
} catch (error) {
  check('browser-runtime', false, error.message);
  report.headlessBrowserRuntime = { passed: false, reason: error.message, browserRequests, pageErrors: [], failedRequests: [] };
} finally {
  await browser?.close();
  if (browserServer?.listening) await new Promise(resolve => browserServer.close(resolve));
}

report.readiness = { outcome: failures.length ? 'NOT_READY_FOR_MANUAL_ACCEPTANCE' : 'READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_ACCEPTANCE', failureCount: failures.length };
report.failures = [...failures];
if (reportArg) await writeFile(path.resolve(reportArg), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failures.length) process.exitCode = 1;
