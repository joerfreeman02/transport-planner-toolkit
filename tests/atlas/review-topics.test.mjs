import assert from 'node:assert/strict';
import { describeReviewDiagnostics, describeReviewTopic, groupReviewItems } from '../../src/atlas/domain/review-topics.mjs';

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

const stop440 = { id: '210021703440', name: 'Bus Station' };
const stop420 = { id: '210021703420', name: 'Bus Station' };
const affectedRoutes = ['217', '317', '327'];
const tflMiss = {
  code: 'unresolved-timetable-request', source: 'TfL', stop: stop440.id, routes: affectedRoutes,
  items: affectedRoutes.map(route => ({ route, stop: stop440.id, source: 'TfL', message: `Route ${route} TfL request was unresolved.` }))
};
const basisRows = affectedRoutes.map(route => ({ routeNumber: route, frequencyBasisStopId: stop420.id, timetableSource: 'TfL', typicalFrequencyLines: ['Mon-Fri: typically every 15 minutes'] }));
const explainedTfl = describeReviewTopic(tflMiss, { plannerServiceSummaries: basisRows, stops: [stop440, stop420] });
assert.match(explainedTfl.what, /not evidence that the route is absent/i);
assert.match(explainedTfl.impact, /displayed frequency.*based on timetable evidence at Bus Station \(StopPoint 210021703420\)/i);
assert.doesNotMatch(explainedTfl.impact, /calculated from a TfL match at StopPoint 210021703440/i);
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
assert.match(boardingTopic.action, /check the operator timetable for this StopPoint/i);

const calendar = describeReviewTopic({
  code: 'service-source-evidence', source: 'TNDS', stop: stop440.id, routes: ['242', '310'],
  items: ['242', '310'].map(route => ({ route, stop: stop440.id, source: 'TNDS', message: `Route ${route} operating-day records conflicted. ATLAS retained the supported days.` }))
}, { stops: [stop440] });
assert.match(calendar.what, /records disagree about which days Routes 242, 310 operate/i);
assert.match(calendar.impact, /remain unverified/i);
assert.match(calendar.action, /Check the operator timetable/i);

const endpoint = describeReviewTopic({
  code: 'planner-endpoint-resolution', source: 'BODS', stop: '210021703430', routes: ['16', '16C'],
  items: ['16', '16C'].map(route => ({ route, stop: '210021703430', source: 'BODS', message: 'Generic source endpoint was retained because no exact endpoint identity was available; no place was inferred.' }))
}, { stops: [{ id: '210021703430', name: 'Bus Station' }], plannerServiceSummaries: ['16', '16C'].map(routeNumber => ({ routeNumber, frequencyBasisStopId: '210021703430', typicalFrequencyLines: ['Mon-Fri: every 30 minutes'] })) });
assert.match(endpoint.what, /supports the displayed pattern/i);
assert.match(endpoint.impact, /exact terminal place cannot be independently checked/i);
assert.match(endpoint.impact, /has not inferred a destination/i);

const identity = describeReviewTopic({
  code: 'supplementary-identity-conflict', source: 'TfL / BODS', stop: '210021703420', routes: ['217', '317'],
  items: ['217', '317'].map(route => ({ route, stop: '210021703420', source: 'TfL / BODS', message: `Route ${route}: Material BODS disagreement with TfL evidence affects direction, principalLocations; the authoritative schedule was retained.` }))
}, { stops: [{ id: '210021703420', name: 'Bus Station' }] });
assert.match(identity.what, /records disagree about the direction or principal locations/i);
assert.doesNotMatch(identity.what, /Route 217:/, 'a multi-route group does not reuse the first route-specific raw warning as its explanation');
assert.match(identity.impact, /retained the authoritative timetable/i);

const assessmentGap = describeReviewTopic({
  code: 'service-source-evidence', source: 'assessment evidence', stop: null, routes: [],
  items: [{ message: 'TfL scheduled timetable information could not be checked for one or more services. ATLAS retained available authoritative results and used matching national timetable evidence where available.' }]
});
assert.match(assessmentGap.what, /could not confirm every timetable request/i);
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
assert.match(safeDiagnostics, /no separate planner action required/i);
assert.match(safeDiagnostics, /original checks remain below/i);
assert.doesNotMatch(describeReviewDiagnostics([{ actionability: 'review', message: 'unresolved' }]), /no separate planner action required/i);

console.log('PASS review topic grouping - common causes condensed with complete original evidence, route and StopPoint scope retained.');
