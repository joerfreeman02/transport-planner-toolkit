import assert from 'node:assert/strict';
import { groupReviewItems } from '../../src/atlas/domain/review-topics.mjs';

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

console.log('PASS review topic grouping - common causes condensed with complete original evidence, route and StopPoint scope retained.');
