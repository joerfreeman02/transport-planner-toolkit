import fs from 'node:fs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { loadAlpha14Planner } from '../../tests/atlas/alpha14-reference-planner.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../../tests/atlas/fixtures/alpha15-waltham-cross-production.json', import.meta.url), 'utf8'));
const records = fixture.serviceRecords.map(({ service }) => service);
const summaries = buildServiceSummaries(fixture.stops, records);
const alpha15Rows = buildPlannerBusServiceSummaries(summaries, fixture.stops);
const alpha14Planner = await loadAlpha14Planner();
const alpha14Rows = alpha14Planner.buildPlannerBusServiceSummaries(summaries, fixture.stops);
const routes = ['25C', '66', '242', '310', 'A1', '317'];
const routeScopedRecordCount = Object.values(fixture.provenance.runtimeBoundary.routeScopedServiceCounts || {}).reduce((total, count) => total + Number(count || 0), 0);

const compactRow = row => `${row.directionPatternText}; operator ${row.operator}; basis ${row.frequencyBasisStopId}; served ${row.servedAtStopId}; circular=${row.circular}; variants=${row.variantCount}`;
const rowsFor = (rows, route) => rows.filter(row => row.routeNumber === route);

console.log('ATLAS Alpha.15 exact runtime-boundary comparison');
console.log(`Fixture schema: ${fixture.provenance.fixtureSchema}; assessment ${fixture.assessment.assessmentId} (coordinate withheld); radius ${fixture.assessment.radiusMetres} m`);
console.log(`Input: ${fixture.stops.length} selected stops; ${records.length} committed service records; ${summaries.length} normalized service summaries`);
console.log(`Runtime boundary: ${fixture.provenance.runtimeBoundary.sourceComposition}`);
console.log(`Providers: ${(fixture.provenance.runtimeBoundary.nationalTimetableProviders || []).join(' + ')}; live TfL ${fixture.provenance.runtimeBoundary.liveTfLSuccessfulRequests}/${fixture.provenance.runtimeBoundary.liveTfLRequests} successful`);
console.log(`Same-input identity: ${records.length === routeScopedRecordCount ? 'PASS — both planners received the same normalized summary array' : 'CHECK — route counts do not reconcile'} (${summaries.length} summaries from ${records.length} records)`);

for (const route of routes) {
  const before = rowsFor(alpha14Rows, route);
  const after = rowsFor(alpha15Rows, route);
  console.log(`\n${route} | Alpha14 BEFORE: ${before.length} rows`);
  before.forEach((row, index) => console.log(`  B${index + 1}. ${compactRow(row)}`));
  console.log(`${route} | Alpha15 AFTER: ${after.length} rows`);
  after.forEach((row, index) => console.log(`  A${index + 1}. ${compactRow(row)}`));
}

console.log('\nRequired before/after counts:');
console.log(JSON.stringify({
  alpha14: Object.fromEntries(routes.map(route => [route, rowsFor(alpha14Rows, route).length])),
  alpha15: Object.fromEntries(routes.map(route => [route, rowsFor(alpha15Rows, route).length]))
}));
