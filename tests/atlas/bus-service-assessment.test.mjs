import assert from 'node:assert/strict';
import { buildControlledBusWording, buildServiceSummaries, calculateOperatingPeriods, calculateScheduledFrequency, derivePrincipalLocations, formatOperatingPeriod, formatServiceOriginDestination, groupStopsForPresentation } from '../../src/atlas/domain/bus-service-assessment.mjs';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('operating periods retain overnight services', () => {
  const periods = calculateOperatingPeriods({ monday: [316, 600, 1527], saturday: [400, 1430] });
  assert.deepEqual(formatOperatingPeriod(periods), ['Mon: Approx. 05:16–01:27 (next day)', 'Tue-Fri: No scheduled service', 'Sat: Approx. 06:40–23:50', 'Sun: No scheduled service']);
  assert.equal(periods.monday.overnight, true);
});

test('identical weekdays use the EAS Mon-Fri form', () => {
  const days = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(day => [day, [316, 1527]]));
  assert.equal(formatOperatingPeriod(calculateOperatingPeriods(days))[0], 'Mon-Fri: Approx. 05:16–01:27 (next day)');
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

test('principal location display removes only an unambiguous trailing arrival annotation', () => {
  const locations = derivePrincipalLocations([
    { id: 'A', name: 'Origin' },
    { id: 'B', name: 'Gloucester Transport Hub arrival', locality: 'Gloucester' },
    { id: 'C', name: 'Stonehouse', locality: 'Stonehouse' },
    { id: 'D', name: 'Terminus' }
  ]);
  assert.ok(locations.includes('Gloucester Transport Hub'));
  assert.ok(!locations.includes('Gloucester Transport Hub arrival'));
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
  assert.ok(summaries.every(service => !/No scheduled weekend service/.test(service.serviceNote)));
});

test('route variants remain traceable and trigger a material note', () => {
  const schedule = { monday: [480], tuesday: [480], wednesday: [480], thursday: [480], friday: [480], saturday: [], sunday: [] };
  const records = ['standard', 'short'].map(id => ({ id, routeNumber: '20', operator: 'Example', origin: 'A', destination: 'B', direction: 'B', principalLocations: id === 'standard' ? ['C'] : ['D'], qualifications: [], stopSchedules: { A: schedule } }));
  const [summary] = buildServiceSummaries([{ id: 'A' }], records);
  assert.deepEqual(summary.sourceRecordIds, ['standard', 'short']);
  assert.equal(summary.serviceNote, '');
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
  assert.match(summary.serviceNote, /School-day journeys only\./);
  assert.match(summary.serviceNote, /Circular service\./);
});

test('calendar restrictions are withheld from a mixed-profile source row', () => {
  const [summary] = buildServiceSummaries([{ id: 'A' }], [{
    id: 'mixed-calendar', routeNumber: 'S2', operator: 'Example', origin: 'A', destination: 'B', direction: 'B',
    serviceNotes: ['Non-school days only.'], qualifications: ['Non-school days only.'],
    calendarEvidence: [{ calendarProfileId: 'ordinary' }, { calendarProfileId: 'non-school-day', nonSchoolDayOnly: true }],
    stopSchedules: { A: { monday: [480] } }
  }]);
  assert.doesNotMatch(summary.serviceNote, /Non-school days only/i, 'a mixed calendar source record cannot elevate its restricted journey subset to the entire row');
});

test('empty timetable records do not become planner-facing services', () => {
  const summaries = buildServiceSummaries([{ id: 'A' }], [{ id: 'incomplete', routeNumber: '5', operator: '', origin: '', destination: '', principalLocations: [], qualifications: [], stopSchedules: { A: {} } }]);
  assert.deepEqual(summaries, []);
});

test('frequency interval maths uses N minus 1 elapsed gaps', () => {
  const two = calculateScheduledFrequency([600, 660], { startMinute: 600, endMinute: 720 });
  assert.equal(two.departureCount, 2);
  assert.equal(two.intervalMinutes, 60);
  assert.equal(two.busesPerHour, 1);
  const three = calculateScheduledFrequency([600, 630, 660], { startMinute: 600, endMinute: 720 });
  assert.equal(three.intervalMinutes, 30);
  assert.equal(three.busesPerHour, 2);
});

test('controlled wording uses only supplied routes and principal locations', () => {
  const wording = buildControlledBusWording([{ routeNumber: '10', principalLocations: ['Hospital'] }, { routeNumber: '20', principalLocations: ['Town Centre'] }]);
  assert.match(wording, /bus routes 10, 20/);
  assert.match(wording, /Hospital, Town Centre/);
  assert.doesNotMatch(wording, /excellent|highly sustainable|very frequent/i);
});

test('service summary direction comes from its representative selected stop', () => {
  const schedule = { monday: [420, 435, 450, 465, 480, 495], tuesday: [420, 435, 450, 465, 480, 495], wednesday: [420, 435, 450, 465, 480, 495], thursday: [420, 435, 450, 465, 480, 495], friday: [420, 435, 450, 465, 480, 495], saturday: [], sunday: [] };
  const [summary] = buildServiceSummaries([
    { id: 'S', name: 'South stop', indicator: 'S', walking: { status: 'routed', distanceMetres: 100 } },
    { id: 'N', name: 'North stop', indicator: 'N', walking: { status: 'routed', distanceMetres: 200 } }
  ], [{ id: 'south', routeNumber: '10', operator: 'Example', origin: 'A', destination: 'B', direction: 'B', principalLocations: [], stopSchedules: { S: schedule } }]);
  assert.equal(summary.frequencyBasisStopId, 'S');
  assert.equal(summary.stopDirection, 'Southbound');
  assert.equal(formatServiceOriginDestination(summary), 'A - B (Southbound)');
});

test('principal locations are clipped to the downstream ordered pattern at the representative stop', () => {
  const calls = [
    { id: 'G0', name: 'Gloucester', locality: 'Gloucester' },
    { id: 'G1', name: 'Tredworth', locality: 'Gloucester' },
    { id: 'E', name: 'Wycliffe College', locality: 'Stroud' },
    { id: 'S1', name: 'Stonehouse Town Centre', locality: 'Stonehouse' },
    { id: 'S2', name: 'Cainscross Bus Station', locality: 'Stroud' },
    { id: 'D1', name: 'Merrywalks', locality: 'Stroud' },
    { id: 'D2', name: 'Dursley Bus Station', locality: 'Dursley' }
  ];
  const schedule = { monday: [420], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
  const [summary] = buildServiceSummaries([{ id: 'E', name: 'Wycliffe College' }], [{
    id: '64-east', routeNumber: '64', operator: 'Example', origin: 'Gloucester', destination: 'Dursley', direction: 'outbound',
    circularPatternStopIds: calls.map(call => call.id), routePatternStops: calls,
    principalLocations: ['Gloucester', 'Tredworth', 'Stonehouse', 'Cainscross Bus Station'], stopSchedules: { E: schedule }
  }]);
  assert.ok(summary.principalLocations.includes('Stonehouse'));
  assert.ok(summary.principalLocations.includes('Cainscross Bus Station'));
  assert.ok(!summary.principalLocations.includes('Gloucester'));
  assert.ok(!summary.principalLocations.includes('Tredworth'));
  assert.deepEqual(summary.sourceWarnings, []);
});

test('directional location clipping covers 310, 203, 62, 64 and 65 without route-specific rules', () => {
  const schedule = { monday: [420], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
  const cases = [
    { route: '310', stop: 'Hoddesdon', upstream: 'Hertford', downstream: 'Waltham Cross' },
    { route: '203', stop: 'Hounslow West', upstream: 'Heathrow Airport', downstream: 'Staines' },
    { route: '62', stop: 'Wycliffe College', upstream: 'Gloucester', downstream: 'Stonehouse' },
    { route: '64', stop: 'Wycliffe College', upstream: 'Gloucester', downstream: 'Merrywalks' },
    { route: '65', stop: 'Wycliffe College', upstream: 'Gloucester', downstream: 'Stroud' }
  ];
  for (const { route, stop, upstream, downstream } of cases) {
    const calls = [
      { id: 'before', name: upstream, locality: upstream },
      { id: 'basis', name: stop, locality: stop },
      { id: 'after', name: downstream, locality: downstream },
      { id: 'end', name: `${downstream} Terminus`, locality: downstream }
    ];
    const [summary] = buildServiceSummaries([{ id: 'basis' }], [{
      id: `control-${route}`, routeNumber: route, operator: 'Example', origin: upstream, destination: downstream, direction: `towards ${downstream}`,
      routePatternStopIds: calls.map(call => call.id), routePatternStops: calls, principalLocations: [upstream, stop, downstream],
      stopSchedules: { basis: schedule }
    }]);
    assert.ok(summary.principalLocations.includes(downstream), `${route} retains downstream locations`);
    assert.ok(!summary.principalLocations.includes(upstream), `${route} excludes upstream locations`);
  }
});

test('circular principal locations follow the ordered loop from the assessed stop', () => {
  const calls = [
    { id: 'A', name: 'Town Centre', locality: 'Town' },
    { id: 'B', name: 'Central Hospital', locality: 'Town' },
    { id: 'C', name: 'Assessed Stop', locality: 'Town' },
    { id: 'D', name: 'Railway Station', locality: 'Village' },
    { id: 'A', name: 'Town Centre', locality: 'Town' }
  ];
  const [summary] = buildServiceSummaries([{ id: 'C' }], [{
    id: 'loop', routeNumber: 'L1', operator: 'Example', origin: 'Town Centre', destination: 'Town Centre', direction: 'Clockwise', circular: true,
    circularPatternStopIds: calls.map(call => call.id), routePatternStops: calls,
    principalLocations: ['Central Hospital', 'Railway Station'], stopSchedules: { C: { monday: [420] } }
  }]);
  assert.ok(summary.principalLocations.includes('Central Hospital'));
  assert.ok(summary.principalLocations.includes('Town Centre'), 'the loop wraps after reaching its terminal closure');
});

test('unmapped principal locations are withheld and flagged for review', () => {
  const [summary] = buildServiceSummaries([{ id: 'A' }], [{
    id: 'uncertain', routeNumber: 'U', operator: 'Example', origin: 'A', destination: 'B', direction: 'B',
    principalLocations: ['Somewhere upstream'], stopSchedules: { A: { monday: [420] } }
  }]);
  assert.deepEqual(summary.principalLocations, []);
  assert.match(summary.sourceWarnings.join(' '), /could not be safely mapped/i);
});

test('opposite selected stop directions remain separate service rows', () => {
  const schedule = { monday: [420, 435, 450, 465, 480, 495], tuesday: [420, 435, 450, 465, 480, 495], wednesday: [420, 435, 450, 465, 480, 495], thursday: [420, 435, 450, 465, 480, 495], friday: [420, 435, 450, 465, 480, 495], saturday: [], sunday: [] };
  const summaries = buildServiceSummaries([
    { id: 'N', name: 'North stop', indicator: 'N', walking: { status: 'routed', distanceMetres: 100 } },
    { id: 'S', name: 'South stop', indicator: 'S', walking: { status: 'routed', distanceMetres: 110 } }
  ], [
    { id: 'north-row', routeNumber: '10', operator: 'Example', origin: 'A', destination: 'B', direction: 'B', principalLocations: [], stopSchedules: { N: schedule } },
    { id: 'south-row', routeNumber: '10', operator: 'Example', origin: 'B', destination: 'A', direction: 'A', principalLocations: [], stopSchedules: { S: schedule } }
  ]);
  assert.equal(summaries.length, 2);
  assert.deepEqual(summaries.map(summary => summary.stopDirection).sort(), ['Northbound', 'Southbound']);
  assert.deepEqual(summaries.map(summary => formatServiceOriginDestination(summary)).sort(), ['A - B (Northbound)', 'B - A (Southbound)']);
});

test('missing selected stop direction does not create guessed bracket text', () => {
  const [summary] = buildServiceSummaries([{ id: 'A', name: 'Undirected', walking: { status: 'routed', distanceMetres: 100 } }], [{ id: 'undirected', routeNumber: '5', operator: 'Example', origin: 'A', destination: 'B', direction: 'B', principalLocations: [], stopSchedules: { A: { monday: [420], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } } }]);
  assert.equal(summary.stopDirection, null);
  assert.equal(formatServiceOriginDestination(summary), 'A - B');
});

for (const [name, fn] of tests) {
  await fn();
  console.log(`PASS Bus service assessment - ${name}`);
}
console.log(`${tests.length} Bus service assessment tests passed.`);
