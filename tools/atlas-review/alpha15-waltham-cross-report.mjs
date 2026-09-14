import fs from 'node:fs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { buildPlannerBusServiceSummaries, buildPlannerSummaryAudit } from '../../src/atlas/domain/bus-planner-summary.mjs';

const fixturePath = new URL('../../tests/atlas/fixtures/alpha15-waltham-cross-production.json', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const records = fixture.serviceRecords.map(({ service }) => service);
const summaries = buildServiceSummaries(fixture.stops, records);
const rows = buildPlannerBusServiceSummaries(summaries, fixture.stops);
const audit = buildPlannerSummaryAudit(rows, { '25C': 2, '66': 2, '242': 2, '310': 2, A1: 2, '317': 2 });

console.log('ATLAS Alpha.15 Waltham Cross production replay');
console.log(`Fixture: ${fixture.provenance.sourceArtifactName} from workflow run ${fixture.provenance.sourceWorkflowRunId}`);
console.log(`Assessment point: ${fixture.assessment.latitude}, ${fixture.assessment.longitude}; radius ${fixture.assessment.radiusMetres} m`);
console.log(`Stops: ${fixture.stops.length}; prepared service records: ${records.length}; planner rows: ${rows.length}`);
for (const row of rows) {
  const note = [row.serviceNote, row.routeGroupNote].filter(Boolean).join(' ');
  console.log(`${row.routeNumber.padEnd(4)} | ${row.directionPatternText.padEnd(34)} | ${row.operator.padEnd(28)} | basis ${row.frequencyBasisStopId} | ${row.servedAtText.replace(/\n/g, ' / ')}${note ? ` | ${note}` : ''}`);
}
console.log(`Audit above expected: ${audit.aboveExpectedRoutes.length ? audit.aboveExpectedRoutes.join(', ') : 'none'}`);
