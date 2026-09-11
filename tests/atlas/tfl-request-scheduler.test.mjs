import assert from 'node:assert/strict';
import { createTflRequestScheduler } from '../../src/atlas/adapters/tfl-request-scheduler.mjs';

let now = 0;
const sleeps = [];
const scheduler = createTflRequestScheduler({ now: () => now, sleep: async milliseconds => { sleeps.push(milliseconds); now += milliseconds; } });
for (let index = 0; index < 21; index += 1) await scheduler.schedule('timetable', async () => ({ ok: true }));
await scheduler.schedule('route-metadata', async () => ({ ok: true }));
assert.equal(scheduler.snapshot().requestsInWindow, 22);
assert.equal(sleeps.length, 0);
for (let index = 0; index < 23; index += 1) await scheduler.schedule('timetable', async () => ({ ok: true }));
assert.equal(scheduler.snapshot().requestsInWindow, 45);
await scheduler.schedule('timetable', async () => ({ ok: true }));
assert.equal(sleeps.length, 1);
assert.equal(scheduler.snapshot().requestsInWindow, 1);

let observedNow = 0;
const observedEvents = [];
const observedScheduler = createTflRequestScheduler({
  limit: 1,
  windowMs: 100,
  now: () => observedNow,
  sleep: async milliseconds => { observedNow += milliseconds; },
  onEvent: event => observedEvents.push(event)
});
await observedScheduler.schedule('timetable', async () => ({ ok: true }), { progress: { phase: 'checking-timetables', completed: 0, total: 2 } });
await observedScheduler.schedule('timetable', async () => ({ ok: true }), { progress: { phase: 'checking-timetables', completed: 1, total: 2 } });
assert.deepEqual(observedEvents.map(event => event.waiting), [true, false], 'scheduler waiting is observable only when progress context is supplied');
assert.deepEqual(observedEvents.map(event => [event.completed, event.total]), [[1, 2], [1, 2]]);
assert.equal(observedEvents[0].snapshot.requestsInWindow, 1);
console.log('PASS rolling TfL request scheduler: 45 requests per rolling 60-second window with injected clock/sleep.');
