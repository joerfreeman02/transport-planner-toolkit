import assert from 'node:assert/strict';
import { buildControlledBusWording, buildServiceSummaries, calculateOperatingPeriods, calculateScheduledFrequency, derivePrincipalLocations, formatOperatingPeriod, groupStopsForPresentation } from '../../src/atlas/domain/bus-service-assessment.mjs';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('operating periods retain overnight services', () => {
  const periods = calculateOperatingPeriods({ monday: [316, 600, 1527], saturday: [400, 1430] });
  assert.deepEqual(formatOperatingPeriod(periods).slice(0, 3), ['Monday: Approx. 05:16-01:27', 'Tuesday: No scheduled service', 'Wednesday: No scheduled service']);
  assert.equal(periods.monday.overnight, true);
});

test('identical weekdays use the EAS Mon-Fri form', () => {
  const days = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(day => [day, [316, 1527]]));
  assert.equal(formatOperatingPeriod(calculateOperatingPeriods(days))[0], 'Mon-Fri: Approx. 05:16-01:27');
});

test('frequency capability requires an explicit approved period', () => {
  assert.throws(() => calculateScheduledFrequency([600], {}), /representative assessment period/);
  const frequency = calculateScheduledFrequency([600, 610, 620, 630, 640, 650], { startMinute: 600, endMinute: 660, label: 'approved fixture period' });
  assert.equal(frequency.busesPerHour, 6);
  assert.equal(frequency.wording, '6 buses per hour (approximately every 10 minutes)');
  assert.doesNotMatch(frequency.wording, /\btph\b|\bbph\b/i);
});

test('principal locations favour actual major calls and locality changes', () => {
  const result = derivePrincipalLocations([
    { name: 'Origin' }, { name: 'Minor Road', locality: 'Alpha' }, { name: 'Central Hospital', locality: 'Alpha' }, { name: 'Town Centre', locality: 'Beta' }, { name: 'Destination', locality: 'Gamma' }
  ]);
  assert.deepEqual(result, ['Central Hospital', 'Town Centre', 'Alpha', 'Beta']);
});

test('opposite stop records are never grouped by name', () => {
  const stops = groupStopsForPresentation([{ id: 'A', name: 'High Street', indicator: 'Stop A', direction: 'N' }, { id: 'B', name: 'High Street', indicator: 'Stop B', direction: 'S' }]);
  assert.deepEqual(stops.map(stop => stop.presentationKey), ['A', 'B']);
});

test('service summaries keep opposite directions and conditional notes', () => {
  const stops = [{ id: 'A' }, { id: 'B' }];
  const base = { routeNumber: '10', operator: 'Example Buses', principalLocations: ['Hospital'], validFrom: '2026-09-01', validTo: '2027-01-01', qualifications: [], stopSchedules: { A: { monday: [360, 390], tuesday: [360, 390], wednesday: [360, 390], thursday: [360, 390], friday: [360, 390], saturday: [], sunday: [] } } };
  const summaries = buildServiceSummaries(stops, [
    { ...base, id: 'out', origin: 'Alpha', destination: 'Beta', direction: 'Beta' },
    { ...base, id: 'in', origin: 'Beta', destination: 'Alpha', direction: 'Alpha', stopSchedules: { B: base.stopSchedules.A } }
  ]);
  assert.equal(summaries.length, 2);
  assert.ok(summaries.every(service => /No scheduled weekend service/.test(service.serviceNote)));
});

test('route variants remain traceable and trigger a material note', () => {
  const schedule = { monday: [480], tuesday: [480], wednesday: [480], thursday: [480], friday: [480], saturday: [], sunday: [] };
  const records = ['standard', 'short'].map(id => ({ id, routeNumber: '20', operator: 'Example', origin: 'A', destination: 'B', direction: 'B', principalLocations: id === 'standard' ? ['C'] : ['D'], qualifications: [], stopSchedules: { A: schedule } }));
  const [summary] = buildServiceSummaries([{ id: 'A' }], records);
  assert.deepEqual(summary.sourceRecordIds, ['standard', 'short']);
  assert.match(summary.serviceNote, /2 scheduled route patterns/);
});

test('circular services with the same endpoints retain opposite directions', () => {
  const schedule = { monday: [480], tuesday: [480], wednesday: [480], thursday: [480], friday: [480], saturday: [], sunday: [] };
  const summaries = buildServiceSummaries([{ id: 'A' }], [
    { id: 'clockwise', routeNumber: 'C1', operator: 'Example', origin: 'Town Centre', destination: 'Town Centre', direction: 'Clockwise', circular: true, principalLocations: ['Hospital'], qualifications: [], stopSchedules: { A: schedule } },
    { id: 'anticlockwise', routeNumber: 'C1', operator: 'Example', origin: 'Town Centre', destination: 'Town Centre', direction: 'Anticlockwise', circular: true, principalLocations: ['Station'], qualifications: [], stopSchedules: { A: schedule } }
  ]);
  assert.equal(summaries.length, 2);
  assert.deepEqual(summaries.map(summary => summary.direction).sort(), ['Anticlockwise', 'Clockwise']);
});

test('circular, school-day and limited qualifications remain visible', () => {
  const [summary] = buildServiceSummaries([{ id: 'A' }], [{ id: 'school-loop', routeNumber: 'S1', operator: 'School Bus', origin: 'School', destination: 'School', direction: 'Clockwise', circular: true, principalLocations: [], qualifications: ['School-day-only service.'], stopSchedules: { A: { monday: [480], tuesday: [480], wednesday: [480], thursday: [480], friday: [480], saturday: [], sunday: [] } } }]);
  assert.match(summary.serviceNote, /School-day-only/);
  assert.match(summary.serviceNote, /Circular service pattern/);
});

test('missing operator and incomplete timetable fields are not fabricated', () => {
  const [summary] = buildServiceSummaries([{ id: 'A' }], [{ id: 'incomplete', routeNumber: '5', operator: '', origin: '', destination: '', principalLocations: [], qualifications: [], stopSchedules: { A: {} } }]);
  assert.equal(summary.operator, 'Operator not supplied in the timetable');
  assert.equal(summary.origin, 'Origin not supplied');
  assert.match(summary.serviceNote, /No scheduled departures/);
  assert.match(summary.serviceNote, /did not supply a reliable operator/);
});

test('controlled wording uses only supplied routes and principal locations', () => {
  const wording = buildControlledBusWording([{ routeNumber: '10', principalLocations: ['Hospital'] }, { routeNumber: '20', principalLocations: ['Town Centre'] }]);
  assert.match(wording, /bus routes 10, 20/);
  assert.match(wording, /Hospital, Town Centre/);
  assert.doesNotMatch(wording, /excellent|highly sustainable|very frequent/i);
});

for (const [name, fn] of tests) {
  await fn();
  console.log(`PASS Bus service assessment - ${name}`);
}
console.log(`${tests.length} Bus service assessment tests passed.`);
