import assert from 'node:assert/strict';
import fs from 'node:fs';
import { docxBlob } from '../../assets/js/word-export.js';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { buildPlannerBusServiceSummaries, buildPlannerSummaryAudit } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { loadAlpha14Planner } from './alpha14-reference-planner.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/alpha15-waltham-cross-production.json', import.meta.url), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(new URL('./fixtures/alpha15-waltham-cross-production-baseline-alpha14.json', import.meta.url), 'utf8'));
const records = fixture.serviceRecords.map(({ service }) => service);
const summaries = buildServiceSummaries(fixture.stops, records);
const rows = buildPlannerBusServiceSummaries(summaries, fixture.stops);
const alpha14Planner = await loadAlpha14Planner();
const alpha14Rows = alpha14Planner.buildPlannerBusServiceSummaries(summaries, fixture.stops);
const expectedRowCounts = Object.freeze({ '25C': 2, '66': 2, '242': 2, '310': 2, A1: 2, '317': 2 });
const expectedAlpha14RedShape = Object.freeze({ '25C': 4, '66': 4, '242': 8, '310': 4, A1: 4, '317': 2 });
const audit = buildPlannerSummaryAudit(rows, expectedRowCounts);

const routeCounts = plannerRows => Object.fromEntries(Object.keys(expectedRowCounts).map(routeNumber => [routeNumber, plannerRows.filter(row => row.routeNumber === routeNumber).length]));
assert.deepEqual(routeCounts(alpha14Rows), expectedAlpha14RedShape, 'Alpha14 must be red on the identical prepared input');
assert.deepEqual(routeCounts(rows), expectedRowCounts, 'Alpha15 must recover the required concise public row shape');
const walthamBusStationStopIds = new Set(['210021703440', '210021703425', '210021703420', '210021703430', '210021703435']);
const nearestStops = fixture.stops.filter(stop => walthamBusStationStopIds.has(stop.id));
assert.equal(nearestStops.length, 5, 'the Product Owner nearest control is the five-stop Waltham Cross Bus Station logical group');
const nearestRecords = records.map(record => ({
  ...record,
  stopSchedules: Object.fromEntries(Object.entries(record.stopSchedules ?? {}).filter(([stopId]) => walthamBusStationStopIds.has(stopId)))
})).filter(record => Object.values(record.stopSchedules ?? {}).some(days => Object.values(days ?? {}).some(times => Array.isArray(times) && times.length)));
const nearestSummaries = buildServiceSummaries(nearestStops, nearestRecords);
const nearestRows = buildPlannerBusServiceSummaries(nearestSummaries, nearestStops);
const nearest242Rows = nearestRows.filter(row => row.routeNumber === '242');
assert.equal(nearest242Rows.length, 2, 'nearest-mode evidence uses the canonical two-direction planner composition instead of a separate supplementary-source principal row');
assert.deepEqual(nearest242Rows.map(row => row.directionPatternText).sort(), rows.filter(row => row.routeNumber === '242').map(row => row.directionPatternText).sort(), 'nearest and full mode retain the same Route 242 public directions');
const nearest242Text = nearest242Rows.map(row => [row.plannerNotes?.shortWorkings, row.plannerNotes?.additionalServices, row.routeGroupNote, ...row.sourceRecordIds].join(' ')).join(' ');
assert.match(nearest242Text, /Dame Alice Owen's School/i, 'nearest mode retains the Dame Alice Owen’s school-working evidence as a subordinate qualification');
assert.match(nearest242Text, /Welham Green|Brookfield Centre/i, 'nearest mode retains Welham Green and Brookfield Centre branch evidence');
assert.ok(nearest242Rows.some(row => row.rawServiceSummaries.some(summary => /TNDS/i.test(summary.timetableSource || summary.source?.provider || ''))), 'supplementary TNDS source records remain available under the consolidated planner row');

const shortWorkingStop = { id: 'SHORT-WORKING', name: 'Bus Station' };
const regularSchoolControl = {
  id: 'regular-school-control', routeNumber: 'R99', operator: 'Uno', origin: 'Bus Station', destination: 'Market Town',
  direction: 'inbound', directionFamily: 'headsign:inbound', timetableSource: 'BODS', calendarProfileId: 'ordinary',
  stopSchedules: { 'SHORT-WORKING': { monday: [360, 420, 480, 540], saturday: [420, 480], sunday: [] } }, source: { provider: 'BODS' }
};
const schoolVariantControl = {
  ...regularSchoolControl, id: 'school-variant-control', timetableSource: 'TNDS', destination: 'Town School',
  stopSchedules: { 'SHORT-WORKING': { monday: [425], tuesday: [425], wednesday: [425], thursday: [425], friday: [425], saturday: [], sunday: [] } },
  source: { provider: 'TNDS', calendarProfileId: 'ordinary' }
};
const schoolVariantSummaries = buildServiceSummaries([shortWorkingStop], [regularSchoolControl, schoolVariantControl]);
const schoolVariantRows = buildPlannerBusServiceSummaries(schoolVariantSummaries, [shortWorkingStop]);
assert.equal(schoolVariantRows.length, 1, 'a weekday-only school destination stays subordinate to a same-direction regular service with weekend service');
assert.match(schoolVariantRows[0].plannerNotes.shortWorkings, /Town School \(weekdays only\)/, 'the school-only trip remains as a visible, scoped short-working qualification');
assert.match(schoolVariantRows[0].typicalFrequencyLines.join(' '), /Sat: 2 journeys\/day/);
assert.doesNotMatch(schoolVariantRows[0].typicalFrequencyLines.join(' '), /Sat \(School days\)/);
assert.deepEqual(baseline.alpha14.rowCounts, expectedAlpha14RedShape);
assert.deepEqual(baseline.alpha15RequiredGreenShape, expectedRowCounts);
assert.equal(baseline.sameInputIdentity.identical, true);
assert.equal(summaries.length, baseline.input.serviceSummaryCount, 'Alpha14 and Alpha15 must consume the same normalized service-summary input');
assert.equal(new Set(records.map(record => record.timetableSource)).size, 2, 'faithful replay input retains both BODS and TNDS providers');

for (const [routeNumber, expected] of Object.entries(expectedRowCounts)) {
  assert.equal(audit.routes.find(route => route.routeNumber === routeNumber)?.rowCount, expected, `${routeNumber}: Alpha.15 production row count`);
}

assert.equal(fixture.assessment.latitude, undefined, 'public fixture must not publish the assessment latitude');
assert.equal(fixture.assessment.longitude, undefined, 'public fixture must not publish the assessment longitude');
assert.doesNotMatch(JSON.stringify(fixture), /51\.6857829|-0\.0330001/, 'public fixture must not contain the private assessment coordinate');
assert.equal(fixture.provenance.runtimeBoundary.committedRouteScopeServiceCount, records.length);
assert.equal(fixture.provenance.runtimeBoundary.composedServiceCount, 156);
assert.deepEqual(fixture.provenance.runtimeBoundary.nationalTimetableProviders, ['BODS', 'TNDS']);
assert.equal(fixture.provenance.runtimeBoundary.liveTfLRequests, 22);
assert.equal(fixture.provenance.runtimeBoundary.liveTfLSuccessfulRequests, 22);
assert.equal(fixture.provenance.runtimeBoundary.liveTfLFailedRequests, 0);

const rowsFor = routeNumber => rows.filter(row => row.routeNumber === routeNumber);
const selectedStopIds = new Set(fixture.stops.map(stop => stop.id));
const stopIdsFor = (routeNumber, predicate) => [...new Set(records
  .filter(record => String(record.routeNumber).trim() === routeNumber && predicate(record))
  .flatMap(record => Object.entries(record.stopSchedules ?? {})
    .filter(([, schedule]) => Object.values(schedule ?? {}).some(values => Array.isArray(values) && values.length))
    .map(([stopId]) => stopId)
    .filter(stopId => selectedStopIds.has(stopId))))];

assert.equal(rowsFor('242').length, 2, '242 must establish two public directions before provider/operator variants are presented');
assert.equal(rowsFor('310').every(row => row.circular === false), true, '310 must remain non-circular');
assert.ok(rowsFor('25C').some(row => row.destination === 'Bus Station'), '25C must retain Bus Station as the principal headline destination');
assert.ok(rowsFor('25C').every(row => row.frequencyBasisStopId), 'every 25C direction must have one timetable basis');
assert.ok(rowsFor('242').some(row => row.rawServiceSummaries.length > 3), '242 replay must retain the severe source fragmentation as detailed evidence');
assert.ok(rowsFor('242').some(row => row.servedAtStops.length > 1), '242 planner rows must list all served assessment stops');
assert.ok(rowsFor('A1').some(row => /Quaker Lane|Highbridge/i.test(`${row.serviceNote || ''} ${row.routeGroupNote || ''} ${(row.alternateDestinationNames || []).join(' ')}`)), 'A1 alternate terminus evidence must remain available in the planner evidence');
assert.deepEqual(stopIdsFor('25C', record => /^Bus Station$/i.test(record.destination)).sort(), ['210021700220', '210021703380', '210021703435', '210021703440'], 'fixture records expose the full 25C Bus Station-destination stop evidence');

const representative242 = rowsFor('242').find(row => row.destination === 'Potters Bar Railway Station');
const wordTables = buildBusWordTables({ ok: true, stops: fixture.stops, plannerServiceSummaries: rows, serviceSummaries: [] });
const word242 = wordTables.flatMap(table => table.rows ?? []).find(row => Array.isArray(row) && row[0] === '242' && row[2] === representative242.directionPatternText);
assert.equal(word242[3], representative242.servedAtText, 'Word uses the same multi-stop served-at value as Browser');
const docxBytes = new TextDecoder().decode(new Uint8Array(await docxBlob('Alpha.15', wordTables).arrayBuffer()));
assert.match(docxBytes, /Stop used for the frequency and operating-period information shown/);
assert.match(docxBytes, /The Vine PH/, 'DOCX keeps multiple served stops readable in the protected legacy Word renderer');

console.log('PASS Alpha.15 production-fidelity acceptance:', JSON.stringify({ alpha14: routeCounts(alpha14Rows), alpha15: routeCounts(rows), input: { stopCount: fixture.stops.length, recordCount: records.length, summaryCount: summaries.length } }));
