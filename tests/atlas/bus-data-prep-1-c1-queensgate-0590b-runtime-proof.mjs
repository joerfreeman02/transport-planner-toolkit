import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { createSite, confirmSite } from '../../src/atlas/domain/site.mjs';

const [candidateArgument, evidenceArgument] = process.argv.slice(2);
if (!candidateArgument) throw new Error('Usage: node bus-data-prep-1-c1-queensgate-0590b-runtime-proof.mjs <candidate-root> [evidence-output.json] — legacy C1 700 m proof');
const candidateRoot = path.resolve(candidateArgument);
const busRoot = path.join(candidateRoot, 'atlas', 'data', 'bus');
const fetchLocal = async input => {
  const url = new URL(input);
  const marker = '/atlas/data/bus/';
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex < 0) return new Response('', { status: 404 });
  const relative = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  const filePath = path.resolve(busRoot, relative);
  if (!filePath.startsWith(`${busRoot}${path.sep}`) && filePath !== path.join(busRoot, 'manifest.json')) return new Response('', { status: 404 });
  try { return new Response(await readFile(filePath), { status: 200 }); }
  catch { return new Response('', { status: 404 }); }
};

const fixedTime = '2026-10-13T12:00:00Z';
const adapter = createPreparedBusDataAdapter({ fetchImpl: fetchLocal, baseUrl: 'https://atlas-queensgate-legacy.invalid/atlas/data/bus/', clock: () => new Date(fixedTime) });
const site = confirmSite(createSite({
  suppliedAddress: 'QUEENSGATE-0590B — Queensgate Bus Station, Peterborough',
  displayAddress: 'QUEENSGATE-0590B — Queensgate Bus Station, Peterborough',
  latitude: 52.5701,
  longitude: -0.2498,
  assessmentPoint: { method: 'coordinates_entered' }
}), { confirmedAt: fixedTime });
let servicesResult = null;
const application = createBusAssessment({
  stopDiscovery: { nearbyStops: (...args) => adapter.nearbyStops(...args) },
  timetableData: { servicesForStops: async (...args) => (servicesResult = await adapter.servicesForStops(...args)) },
  accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: { source: 'local QUEENSGATE-0590B proof fixture' } }) }
});
const assessment = await application.assess(site, { radius: 700 });
assert.ok(servicesResult, 'Actual planner runtime did not invoke prepared timetable adapter');
const selected = assessment.stops ?? [];
const queensgateEntrances = selected.filter(stop => String(stop.id).startsWith('0590BCE'));
assert.equal(queensgateEntrances.length, 4, 'All four 0590BCE entrance records must remain in 700 m physical discovery');
if (candidateRoot.toLowerCase().includes('c1-coverage-semantics')) {
  assert.ok(queensgateEntrances.every(stop => stop.timetableCallEligible === false), 'C1 BCE must be bus-domain infrastructure, not timetable-call infrastructure');
  assert.equal(servicesResult.provenance.failedShardDiagnostics?.some(item => item.key === '0590B'), false, 'C1 must not request the 0590B infrastructure shard');
}
assert.ok(assessment.serviceSummaries.length > 0, 'Prepared timetable summaries must remain visible');
const wordTables = buildBusWordTables(assessment);
const report = {
  control: { id: 'QUEENSGATE-0590B', label: 'Queensgate Bus Station, Peterborough', latitude: 52.5701, longitude: -0.2498, radiusMetres: 700, note: 'Legacy C1 proof radius. The standardized C2 control is separately replayed at 500 m.' },
  candidateRoot,
  sourceSnapshotId: 'cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde',
  runtimePath: 'createPreparedBusDataAdapter → createBusAssessment → buildBusWordTables',
  nearbyStopCount: assessment.discoveredStopCount,
  routeBearingStopCount: selected.filter(stop => (stop.routes ?? []).length > 0).length,
  selectedRecommendedStopCount: selected.filter(stop => stop.timetableMatch !== false || ['SOURCE_UNAVAILABLE', 'PARTIAL'].includes(String(stop.timetableEvidenceStatus ?? '').toUpperCase())).length,
  timetableCallPointCount: selected.filter(stop => stop.timetableCallEligible !== false).length,
  busDomainNonCallInfrastructureCount: selected.filter(stop => stop.busDomainEligible === true && stop.timetableCallEligible === false).length,
  serviceRecordCount: servicesResult.data?.length ?? 0,
  serviceSummaryCount: assessment.serviceSummaries.length,
  plannerServiceSummaryCount: assessment.plannerServiceSummaries?.length ?? 0,
  overallStatus: assessment.status,
  serviceShardDiagnostics: servicesResult.provenance.failedShardDiagnostics ?? [],
  unresolvedStopPointIds: servicesResult.provenance.unresolvedStopPointIds ?? [],
  reviewItems: (assessment.reviewItems ?? []).map(item => ({ code: item.code, route: item.route ?? null, stop: item.stop ?? null })),
  physicalBceRecords: queensgateEntrances.map(stop => ({ id: stop.id, stopType: stop.stopType, busDomainEligible: stop.busDomainEligible, timetableCallEligible: stop.timetableCallEligible, timetableEvidenceStatus: stop.timetableEvidenceStatus })),
  wordServiceSummaryPresent: wordTables.some(table => table.caption === 'Table 3.3 - Bus Service Summary'),
  wordServiceSummaryRowCount: wordTables.find(table => table.caption === 'Table 3.3 - Bus Service Summary')?.rows?.filter(Array.isArray).length ?? 0
};
if (evidenceArgument) await writeFile(path.resolve(evidenceArgument), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
