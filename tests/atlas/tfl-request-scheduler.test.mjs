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
console.log('PASS rolling TfL request scheduler: 45 requests per rolling 60-second window with injected clock/sleep.');
