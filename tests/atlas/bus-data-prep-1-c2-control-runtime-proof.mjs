import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { createSite, confirmSite } from '../../src/atlas/domain/site.mjs';
import { recommendedBusStop } from '../../src/atlas/domain/bus-planner-trust.mjs';

export const CONTROL_PROFILES = Object.freeze({
  'PE1-2TL-HISTORIC': Object.freeze({ label: 'PE1 2TL', latitude: 52.577554, longitude: -0.242489, radiusMetres: 500 }),
  'QUEENSGATE-0590B': Object.freeze({ label: 'Queensgate Bus Station, Peterborough', latitude: 52.5701, longitude: -0.2498, radiusMetres: 500 })
});
assert.deepEqual(Object.keys(CONTROL_PROFILES), ['PE1-2TL-HISTORIC', 'QUEENSGATE-0590B']);
assert.deepEqual(CONTROL_PROFILES['PE1-2TL-HISTORIC'], { label: 'PE1 2TL', latitude: 52.577554, longitude: -0.242489, radiusMetres: 500 });
assert.deepEqual(CONTROL_PROFILES['QUEENSGATE-0590B'], { label: 'Queensgate Bus Station, Peterborough', latitude: 52.5701, longitude: -0.2498, radiusMetres: 500 });
assert.notDeepEqual([CONTROL_PROFILES['PE1-2TL-HISTORIC'].latitude, CONTROL_PROFILES['PE1-2TL-HISTORIC'].longitude], [CONTROL_PROFILES['QUEENSGATE-0590B'].latitude, CONTROL_PROFILES['QUEENSGATE-0590B'].longitude]);

const [candidateArgument, controlName, evidenceArgument] = process.argv.slice(2);
if (!candidateArgument || !controlName || !CONTROL_PROFILES[controlName]) throw new Error('Usage: node bus-data-prep-1-c2-control-runtime-proof.mjs <candidate-root> <PE1-2TL-HISTORIC|QUEENSGATE-0590B> [evidence-output.json]');
const candidateRoot = path.resolve(candidateArgument);
const candidateManifestPath = path.join(candidateRoot, 'atlas', 'data', 'bus', 'manifest.json');
const busRoot = path.dirname(candidateManifestPath);
const profile = CONTROL_PROFILES[controlName];
const manifest = JSON.parse(await readFile(candidateManifestPath, 'utf8'));
assert.equal(manifest.sources?.bods?.sha256, 'a23523db6c7daf39c5c3509511ebb853d3b68fb2617419355d34c857748dc01e', 'Candidate must retain the accepted ACQ-1 BODS source set');
const requestedFiles = [];
const fetchLocal = async input => {
  const url = new URL(input);
  const marker = '/atlas/data/bus/';
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex < 0) return new Response('', { status: 404 });
  const relative = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  const filePath = path.resolve(busRoot, relative);
  if (!filePath.startsWith(`${busRoot}${path.sep}`) && filePath !== candidateManifestPath) return new Response('', { status: 404 });
  requestedFiles.push(relative);
  try { return new Response(await readFile(filePath), { status: 200 }); }
  catch { return new Response('', { status: 404 }); }
};

const fixedTime = '2026-10-13T12:00:00Z';
const adapter = createPreparedBusDataAdapter({ fetchImpl: fetchLocal, baseUrl: 'https://atlas-c2-fixture.invalid/atlas/data/bus/', clock: () => new Date(fixedTime) });
const site = confirmSite(createSite({
  suppliedAddress: profile.label,
  displayAddress: profile.label,
  latitude: profile.latitude,
  longitude: profile.longitude,
  assessmentPoint: { method: 'coordinates_entered' }
}), { confirmedAt: fixedTime });
let servicesResult = null;
const application = createBusAssessment({
  stopDiscovery: { nearbyStops: (...args) => adapter.nearbyStops(...args) },
  timetableData: { servicesForStops: async (...args) => (servicesResult = await adapter.servicesForStops(...args)) },
  accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: { source: 'deterministic offline runtime proof' } }) }
});
const assessment = await application.assess(site, { radius: profile.radiusMetres, mode: 'full' });
assert.equal(assessment.provenance.stops.radiusMetres, 500);
assert.ok(servicesResult, 'Actual runtime did not invoke prepared timetable adapter');
assert.ok(assessment.discoveredStopCount > 0, 'A returned stop inventory must never be reported as a false no-stop result');
const wordTables = buildBusWordTables(assessment);
const stopRows = assessment.stops ?? [];
const routeFamilies = [...new Set((assessment.services ?? []).map(service => String(service.routeNumber ?? '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const discoveredRouteFamilies = [...new Set(stopRows.flatMap(stop => stop.routes ?? []).map(String))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const wordServiceTable = wordTables.find(table => table.caption === 'Table 3.3 - Bus Service Summary');
const summarizeEvidence = status => stopRows.filter(stop => stop.timetableEvidenceStatus === status).map(stop => stop.id).sort();
const report = {
  control: { id: controlName, label: profile.label, latitude: profile.latitude, longitude: profile.longitude, radiusMetres: profile.radiusMetres },
  candidate: { root: candidateRoot, sourceSnapshotId: 'cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde', bodsAggregateSha256: manifest.sources?.bods?.sha256 ?? null, manifestSchema: manifest.schema, manifestGeneratedAt: manifest.generatedAt ?? null },
  runtimePath: 'createPreparedBusDataAdapter → createBusAssessment → buildBusWordTables',
  counts: {
    nearbyStopPoints: assessment.discoveredStopCount,
    assessedStopPoints: stopRows.length,
    routeBearingStopPoints: stopRows.filter(stop => (stop.routes ?? []).length > 0).length,
    selectedRecommendedStopPoints: stopRows.filter(stop => recommendedBusStop(stop)).length,
    timetableCallPoints: stopRows.filter(stop => stop.timetableCallEligible !== false).length,
    busDomainNonCallInfrastructure: stopRows.filter(stop => stop.busDomainEligible === true && stop.timetableCallEligible === false).length,
    serviceRecords: servicesResult.data?.length ?? 0,
    serviceSummaries: assessment.serviceSummaries?.length ?? 0,
    plannerServiceSummaries: assessment.plannerServiceSummaries?.length ?? 0,
    wordTableCount: wordTables.length,
    wordServiceSummaryPresence: Boolean(wordServiceTable),
    wordServiceSummaryRowCount: wordServiceTable?.rows?.filter(Array.isArray).length ?? 0,
    wordServiceSummaryNoteCount: wordServiceTable?.rows?.filter(row => !Array.isArray(row)).length ?? 0
  },
  routeFamilies,
  discoveredStopRouteFamilies: discoveredRouteFamilies,
  stopEvidence: stopRows.map(stop => ({ id: stop.id, stopType: stop.stopType ?? null, busDomainEligible: stop.busDomainEligible ?? null, timetableCallEligible: stop.timetableCallEligible ?? null, sourceRoutes: stop.routes ?? [], timetableMatch: stop.timetableMatch ?? null, timetableEvidenceStatus: stop.timetableEvidenceStatus ?? null })),
  assessment: {
    ok: assessment.ok,
    status: assessment.status,
    timetableConclusion: assessment.timetableConclusion ?? (servicesResult.data?.length
      ? (servicesResult.provenance?.sourceCompleteness === 'PARTIAL' || servicesResult.provenance?.failedShardCount ? 'MATCHED_WITH_PARTIAL_SOURCE' : 'MATCHED')
      : (servicesResult.provenance?.failedShardCount ? 'UNRESOLVED' : 'NO_CURRENT_MATCH')),
    timetableSourceCompleteness: servicesResult.provenance?.sourceCompleteness ?? null,
    serviceResultOk: servicesResult.ok,
    serviceResultCode: servicesResult.code ?? null
  },
  timetableStateStopPoints: {
    noRoutes: summarizeEvidence('NO_ROUTES'), noCurrentMatch: summarizeEvidence('NO_CURRENT_MATCH'),
    sourceUnavailable: summarizeEvidence('SOURCE_UNAVAILABLE'), notTimetableCallPoint: summarizeEvidence('NOT_A_TIMETABLE_CALL_POINT')
  },
  failedShardDiagnostics: servicesResult.provenance?.failedShardDiagnostics ?? [],
  unresolvedStopPointIds: servicesResult.provenance?.unresolvedStopPointIds ?? servicesResult.provenance?.unresolvedStopIds ?? [],
  reviewItems: (assessment.reviewItems ?? []).map(item => ({ code: item.code, stop: item.stop ?? null, route: item.route ?? null, source: item.source ?? null })),
  physicalBceRecords: stopRows.filter(stop => String(stop.id).startsWith('0590BCE')).map(stop => ({ id: stop.id, name: stop.name, stopType: stop.stopType, busDomainEligible: stop.busDomainEligible, timetableCallEligible: stop.timetableCallEligible, timetableEvidenceStatus: stop.timetableEvidenceStatus })),
  selectiveFilesRequested: [...new Set(requestedFiles)].sort(),
  selectiveFileRequestCount: requestedFiles.length
};
if (controlName === 'PE1-2TL-HISTORIC') assert.equal(report.control.label, 'PE1 2TL');
if (controlName === 'QUEENSGATE-0590B' && candidateRoot.toLowerCase().includes('c1-coverage-semantics')) {
  assert.ok(report.physicalBceRecords.length > 0, 'C1 Queensgate control must retain BCE physical discovery');
  assert.ok(report.physicalBceRecords.every(stop => stop.timetableCallEligible === false), 'BCE must not be a timetable call point');
  assert.equal(report.failedShardDiagnostics.some(item => item.key === '0590B'), false, 'C1 must not request the 0590B infrastructure shard');
}
if (controlName === 'PE1-2TL-HISTORIC' && candidateRoot.toLowerCase().includes('c1-coverage-semantics')) {
  assert.equal(assessment.status, 'complete', 'C1 must retain a complete usable assessment at historic PE1');
  assert.equal(report.timetableStateStopPoints.sourceUnavailable.length, 0, 'Unrelated failure must not contaminate checked historic PE1 stops');
  assert.equal(report.failedShardDiagnostics.length, 0, 'Historic C1 PE1 must have no failed shard diagnostics');
  assert.ok(report.counts.selectedRecommendedStopPoints >= report.counts.routeBearingStopPoints, 'Successfully checked route-bearing stops remain recommended');
}
if (evidenceArgument) await writeFile(path.resolve(evidenceArgument), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
