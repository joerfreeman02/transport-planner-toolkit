import assert from 'node:assert/strict';
import { describeReviewDiagnostics, describeReviewTopic, groupReviewItems, plannerSourceLabel, reviewStopLabel } from '../../src/atlas/domain/review-topics.mjs';

const terminalMessage = 'Frozen BODS data at this selected terminal does not retain stop-time boarding or alighting roles; verify the operator timetable before formal use.';
const records = [
  { id: 'a', code: 'service-source-evidence', route: '13', stop: 'STOP-A', source: 'BODS', message: terminalMessage },
  { id: 'b', code: 'service-source-evidence', route: '16C', stop: 'STOP-A', source: 'BODS', message: terminalMessage },
  { id: 'c', code: 'service-source-evidence', route: '16C', stop: 'STOP-B', source: 'BODS', message: terminalMessage },
  { id: 'd', code: 'service-source-evidence', route: '16C', stop: 'STOP-A', source: 'TfL', message: terminalMessage },
  { id: 'e', code: 'service-source-evidence', route: '242', stop: 'STOP-A', source: 'TNDS', message: 'Route 242 operating-day records conflicted; verify the operator timetable before formal use.' },
  { id: 'f', code: 'service-source-evidence', route: '310', stop: 'STOP-A', source: 'TNDS', message: 'Route 310 operating-day records conflicted; verify the operator timetable before formal use.' }
];

const topics = groupReviewItems(records);
assert.equal(topics.length, 4, 'grouping combines only the same cause, source and exact StopPoint scope');
const grouped = topics.find(topic => topic.source === 'BODS' && topic.stop === 'STOP-A');
assert.deepEqual(grouped.routes, ['13', '16C']);
assert.deepEqual(grouped.items.map(item => item.id), ['a', 'b'], 'original evidence records remain intact and ordered');
assert.equal(topics.flatMap(topic => topic.items).length, records.length, 'grouping loses no evidence records');
assert.notEqual(topics.find(topic => topic.stop === 'STOP-B'), grouped, 'different physical stops stay separate');
assert.notEqual(topics.find(topic => topic.source === 'TfL'), grouped, 'different sources stay separate');
assert.equal(topics.filter(topic => topic.source === 'TNDS').length, 1, 'same scoped calendar cause can be one topic across affected routes');
assert.equal(groupReviewItems([records[0]]).length, 1, 'a single-issue assessment remains concise');

const stop440 = { id: '210021703440', name: 'Bus Station', indicator: 'C', displayDirection: 'Stop C', mapReference: 'B' };
const stop420 = { id: '210021703420', name: 'Bus Station', indicator: 'B', displayDirection: 'Stop B', mapReference: 'A' };
const affectedRoutes = ['217', '317', '327'];
const tflMiss = {
  code: 'unresolved-timetable-request', source: 'TfL', stop: stop440.id, routes: affectedRoutes,
  items: affectedRoutes.map(route => ({ route, stop: stop440.id, source: 'TfL', message: `Route ${route} TfL request was unresolved.` }))
};
const basisRows = affectedRoutes.map(route => ({ routeNumber: route, frequencyBasisStopId: stop420.id, timetableSource: 'TfL', typicalFrequencyLines: ['Mon-Fri: typically every 15 minutes'] }));
const explainedTfl = describeReviewTopic(tflMiss, { plannerServiceSummaries: basisRows, stops: [stop440, stop420] });
assert.match(explainedTfl.what, /not evidence that the route is absent/i);
assert.match(explainedTfl.impact, /displayed frequency.*based on timetable evidence at Bus Station — Stop B/i);
assert.match(explainedTfl.impact, /Transport for London information for Bus Station — Stop C/i);
assert.doesNotMatch(`${explainedTfl.what} ${explainedTfl.impact} ${explainedTfl.action}`, /BODS|TNDS|\bTfL\b|StopPoint|210021703/i);
assert.equal(explainedTfl.frequencyBasisStopPointId, stop420.id, 'the exact frequency basis is derived from the displayed service rows');

const withoutBasis = describeReviewTopic(tflMiss, { plannerServiceSummaries: [], stops: [stop440] });
assert.doesNotMatch(withoutBasis.impact, /displayed frequency.*based on timetable evidence at/i, 'limited-impact claims are withheld without matching frequency-basis evidence');
assert.match(withoutBasis.impact, /No zero-service conclusion was made/i);

const boardingTopic = describeReviewTopic({
  code: 'service-source-evidence', source: 'BODS', stop: stop440.id, routes: ['16', '16C'],
  items: ['16', '16C'].map(route => ({ route, stop: stop440.id, source: 'BODS', message: 'Frozen BODS data at this selected terminal does not retain stop-time boarding or alighting roles; boarding eligibility cannot be independently confirmed from this snapshot.' }))
}, { stops: [stop440] });
assert.match(boardingTopic.what, /do not say whether those calls pick up passengers, set down passengers, or both/i);
assert.match(boardingTopic.impact, /does not by itself show that a route or its wider timetable is invalid/i);
assert.match(boardingTopic.impact, /cannot be confirmed as boarding departures/i);
assert.match(boardingTopic.what, /Bus Station — Stop C/);
assert.match(boardingTopic.action, /check the operator timetable for this bus stop/i);
assert.doesNotMatch(`${boardingTopic.what} ${boardingTopic.impact} ${boardingTopic.action}`, /BODS|TNDS|\bTfL\b|StopPoint|210021703/i);

const calendar = describeReviewTopic({
  code: 'service-source-evidence', source: 'TNDS', stop: stop440.id, routes: ['242', '310'],
  items: ['242', '310'].map(route => ({ route, stop: stop440.id, source: 'TNDS', message: `Route ${route} operating-day records conflicted. ATLAS retained the supported days.` }))
}, { stops: [stop440] });
assert.match(calendar.what, /Records from .* disagree about which days Routes 242, 310 operate/i);
assert.match(calendar.impact, /remain unverified/i);
assert.match(calendar.action, /Check the operator timetable/i);
assert.match(calendar.what, /Bus Station — Stop C/);
assert.doesNotMatch(`${calendar.what} ${calendar.impact} ${calendar.action}`, /BODS|TNDS|\bTfL\b|StopPoint|210021703/i);

const endpoint = describeReviewTopic({
  code: 'planner-endpoint-resolution', source: 'BODS', stop: '210021703430', routes: ['16', '16C'],
  items: ['16', '16C'].map(route => ({ route, stop: '210021703430', source: 'BODS', message: 'Generic source endpoint was retained because no exact endpoint identity was available; no place was inferred.' }))
}, { stops: [{ id: '210021703430', name: 'Bus Station', indicator: 'C', displayDirection: 'Stop C' }], plannerServiceSummaries: ['16', '16C'].map(routeNumber => ({ routeNumber, frequencyBasisStopId: '210021703430', typicalFrequencyLines: ['Mon-Fri: every 30 minutes'] })) });
assert.match(endpoint.what, /supports the displayed pattern/i);
assert.match(endpoint.impact, /exact finishing stop cannot be independently checked/i);
assert.match(endpoint.impact, /has not inferred a destination/i);
assert.match(endpoint.what, /Bus Station — Stop C/);
assert.doesNotMatch(`${endpoint.what} ${endpoint.impact} ${endpoint.action}`, /BODS|TNDS|\bTfL\b|StopPoint|210021703/i);

const identity = describeReviewTopic({
  code: 'supplementary-identity-conflict', source: 'TfL / BODS', stop: '210021703420', routes: ['217', '317'],
  items: ['217', '317'].map(route => ({ route, stop: '210021703420', source: 'TfL / BODS', message: `Route ${route}: Material BODS disagreement with TfL evidence affects direction, principalLocations; the authoritative schedule was retained.` }))
}, { stops: [{ id: '210021703420', name: 'Bus Station' }] });
assert.match(identity.what, /Records from .* disagree about the direction or main stops/i);
assert.doesNotMatch(identity.what, /Route 217:/, 'a multi-route group does not reuse the first route-specific raw warning as its explanation');
assert.match(identity.impact, /kept the timetable it judged most authoritative/i);

const sameNameStops = [
  { id: 'A', name: 'Market Place', indicator: 'Northbound', mapReference: 'A' },
  { id: 'B', name: 'Market Place', indicator: 'Southbound', mapReference: 'B' },
  { id: 'C', name: 'Market Place', mapReference: 'C' }
];
assert.equal(reviewStopLabel({ stops: sameNameStops }, 'A'), 'Market Place — Northbound');
assert.equal(reviewStopLabel({ stops: sameNameStops }, 'B'), 'Market Place — Southbound');
assert.equal(reviewStopLabel({ stops: sameNameStops }, 'C'), 'Market Place — map marker C');
assert.notEqual(reviewStopLabel({ stops: sameNameStops }, 'A'), reviewStopLabel({ stops: sameNameStops }, 'B'), 'same-name physical stops keep distinct human labels');
assert.equal(reviewStopLabel({ stops: [{ id: 'LETTER', name: 'Bus Station', indicator: 'C', displayDirection: 'C (Northbound)' }] }, 'LETTER'), 'Bus Station — Stop C (Northbound)', 'a verified stop letter remains visible alongside useful direction');
assert.equal(reviewStopLabel({ stops: [{ id: 'NO-NAME', indicator: 'D' }] }, 'NO-NAME'), 'Bus stop — Stop D');
assert.equal(reviewStopLabel({ stops: [] }, 'UNKNOWN-ID'), 'Bus stop (name and direction not supplied)');
const noNameWarning = describeReviewTopic({
  code: 'unresolved-timetable-request', source: 'TfL', stop: 'PRIVATE-TECHNICAL-ID', routes: ['77'],
  items: [{ route: '77', stop: 'PRIVATE-TECHNICAL-ID', source: 'TfL', message: 'Route 77 TfL request was unresolved.' }]
}, { stops: [{ id: 'PRIVATE-TECHNICAL-ID' }] });
assert.match(noNameWarning.what, /Transport for London.*Bus stop \(name not supplied\)/);
assert.doesNotMatch(`${noNameWarning.what} ${noNameWarning.impact} ${noNameWarning.action}`, /PRIVATE-TECHNICAL-ID|\bTfL\b|StopPoint/);
assert.equal(plannerSourceLabel('TfL / BODS + TNDS'), 'Transport for London and national operator timetable data and national timetable reference data');
assert.doesNotMatch(plannerSourceLabel('NaPTAN / NPTG / OSRM'), /NaPTAN|NPTG|OSRM/);

const assessmentGap = describeReviewTopic({
  code: 'service-source-evidence', source: 'assessment evidence', stop: null, routes: [],
  items: [{ message: 'TfL scheduled timetable information could not be checked for one or more services. ATLAS retained available authoritative results and used matching national timetable evidence where available.' }]
});
assert.match(assessmentGap.what, /could not confirm timetable information for every bus stop checked/i);
assert.match(assessmentGap.impact, /does not show that no bus service exists/i);
assert.match(assessmentGap.action, /check the operator timetable/i);

const noFallback = describeReviewTopic({
  code: 'service-source-evidence', source: 'assessment evidence', stop: null, routes: [],
  items: [{ message: 'TfL scheduled timetable information could not be checked for one or more services, and no defensible national fallback was available. ATLAS did not assume zero service.' }]
});
assert.match(noFallback.impact, /ATLAS did not assume zero service/i);
assert.match(noFallback.impact, /cannot confirm the timetable/i);

const safeDiagnostics = describeReviewDiagnostics([
  { actionability: 'diagnostic', message: 'BODS is the recorded authority at this StopPoint and supplies the displayed schedule.' },
  { actionability: 'diagnostic', message: 'BODS is the recorded authority at this StopPoint and supplies the displayed schedule.' }
]);
assert.match(safeDiagnostics, /no separate planner action is needed/i);
assert.match(safeDiagnostics, /original records remain below/i);
assert.doesNotMatch(safeDiagnostics, /BODS|TNDS|\bTfL\b|StopPoint|exact-stop/i);
assert.doesNotMatch(describeReviewDiagnostics([{ actionability: 'review', message: 'unresolved' }]), /no separate planner action required/i);

console.log('PASS review topic grouping - common causes condensed with complete original evidence, route and StopPoint scope retained.');
