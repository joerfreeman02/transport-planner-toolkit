import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { createSite, confirmSite } from '../../src/atlas/domain/site.mjs';

const [candidateArgument, evidenceArgument] = process.argv.slice(2);
if (!candidateArgument) throw new Error('Usage: node bus-data-prep-1-c1-pe1-runtime-proof.mjs <candidate-root> [evidence-output.json]');
const candidateRoot = path.resolve(candidateArgument);
const busRoot = path.join(candidateRoot, 'atlas', 'data', 'bus');
const busBaseUrl = 'https://atlas-c1-fixture.invalid/atlas/data/bus/';

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

const adapter = createPreparedBusDataAdapter({ fetchImpl: fetchLocal, baseUrl: busBaseUrl, clock: () => new Date('2026-10-13T12:00:00Z') });
const site = confirmSite(createSite({
  suppliedAddress: 'Queensgate Bus Station, Peterborough',
  displayAddress: 'Queensgate Bus Station, Peterborough',
  latitude: 52.5701,
  longitude: -0.2498,
  assessmentPoint: { method: 'coordinates_entered' }
}), { confirmedAt: '2026-10-13T12:00:00Z' });
let servicesResult = null;
const application = createBusAssessment({
  stopDiscovery: { nearbyStops: (...args) => adapter.nearbyStops(...args) },
  timetableData: { servicesForStops: async (...args) => (servicesResult = await adapter.servicesForStops(...args)) },
  accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: { source: 'local PE1 proof fixture' } }) }
});
const assessment = await application.assess(site);
assert.ok(servicesResult?.ok, 'Actual planner runtime did not receive successful prepared timetable evidence');
const selected = assessment.stops ?? [];
const queensgateEntrances = selected.filter(stop => String(stop.id).startsWith('0590BCE'));
assert.equal(queensgateEntrances.length, 4, 'All four 0590BCE entrance records must remain in physical discovery');
const isC1 = candidateRoot.toLowerCase().includes('c1-coverage-semantics');
if (isC1) {
  assert.ok(queensgateEntrances.every(stop => stop.timetableCallEligible === false), 'BCE must be marked as non-call infrastructure');
  assert.equal(servicesResult.provenance.failedShardDiagnostics?.some(item => item.key === '0590B'), false, '0590B infrastructure must not cause a missing timetable-shard failure');
}
assert.ok(assessment.serviceSummaries.length > 0, 'Successful prepared service summaries must remain visible');

const wordTables = buildBusWordTables(assessment);
const report = {
  candidateRoot,
  site: { name: site.displayAddress, latitude: site.latitude, longitude: site.longitude },
  runtimePath: 'createPreparedBusDataAdapter → createBusAssessment → buildBusWordTables',
  nearbyStopCount: selected.length,
  routeBearingStopCount: selected.filter(stop => (stop.routes ?? []).length > 0).length,
  serviceRecordCount: servicesResult.data.length,
  serviceSummaryCount: assessment.serviceSummaries.length,
  overallStatus: assessment.status,
  timetableConclusion: assessment.timetableConclusion,
  selected0590B: queensgateEntrances.map(stop => ({ id: stop.id, name: stop.name, stopType: stop.stopType, status: stop.status, busDomainEligible: stop.busDomainEligible, timetableCallEligible: stop.timetableCallEligible, routes: stop.routes ?? [], timetableEvidenceStatus: stop.timetableEvidenceStatus })),
  serviceShardDiagnostics: servicesResult.provenance.failedShardDiagnostics ?? [],
  reviewItems: (assessment.reviewItems ?? []).map(item => ({ code: item.code, route: item.route, stop: item.stop })),
  wordTableCount: wordTables.length,
  wordTablesContainServiceSummaries: wordTables.some(table => JSON.stringify(table).includes('service')),
};
if (evidenceArgument) await writeFile(path.resolve(evidenceArgument), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
