import assert from 'node:assert/strict';
import {
  buildControlledBusWording,
  buildServiceSummaries,
  displayStopDirection,
  formatOperatingPeriod,
  calculateOperatingPeriods,
  selectNearestStopGroup
} from '../../src/atlas/domain/bus-service-assessment.mjs';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function stop(overrides = {}) {
  return {
    id: 'A',
    name: 'Balaam Street',
    latitude: 51.53,
    longitude: 0.02,
    locality: 'Plaistow',
    indicator: 'Stop S',
    direction: 'E',
    walking: { status: 'routed', distanceMetres: 58, durationSeconds: 60 },
    cycling: { status: 'routed', distanceMetres: 80, durationSeconds: 60 },
    routes: ['262', '473'],
    ...overrides
  };
}

test('planner direction converts stop letter plus compass bearing', () => {
  assert.equal(displayStopDirection(stop()), 'Stop S (Eastbound)');
  assert.equal(displayStopDirection(stop({ indicator: '->S', direction: null })), 'Southbound');
  assert.equal(displayStopDirection(stop({ indicator: null, direction: 'NW' })), 'Northwestbound');
});

test('overnight operating period says next day', () => {
  const periods = calculateOperatingPeriods({ monday: [970, 1446], tuesday: [970, 1446], wednesday: [970, 1446], thursday: [970, 1446], friday: [970, 1446] });
  assert.match(formatOperatingPeriod(periods)[0], /16:10–00:06 \(next day\)/);
});

test('nearest normal stop group keeps matching CommonName pair only', () => {
  const stops = [
    stop({ id: 'A', walking: { status: 'routed', distanceMetres: 100, durationSeconds: 80 } }),
    stop({ id: 'B', longitude: 0.0205, indicator: 'Stop T', direction: 'W', walking: { status: 'routed', distanceMetres: 130, durationSeconds: 100 } }),
    stop({ id: 'C', name: 'Greengate Street', longitude: 0.0204, walking: { status: 'routed', distanceMetres: 120, durationSeconds: 95 } })
  ];
  const result = selectNearestStopGroup(stops);
  assert.equal(result.ok, true);
  assert.deepEqual(result.stops.map(item => item.id), ['A', 'B']);
});

test('nearest bus-station group keeps all stands in the same locality', () => {
  const stops = [
    stop({ id: 'A', name: 'Waltham Cross Bus Station', locality: 'Waltham Cross', latitude: 51.6849, longitude: -0.0330, walking: { status: 'routed', distanceMetres: 140, durationSeconds: 110 } }),
    stop({ id: 'B', name: 'Bus Station', locality: 'Waltham Cross', latitude: 51.6850, longitude: -0.0325, walking: { status: 'routed', distanceMetres: 160, durationSeconds: 120 } }),
    stop({ id: 'C', name: 'Waltham Cross Railway Station', locality: 'Waltham Cross', latitude: 51.6856, longitude: -0.0330, walking: { status: 'routed', distanceMetres: 150, durationSeconds: 115 } })
  ];
  const result = selectNearestStopGroup(stops);
  assert.equal(result.ok, true);
  assert.deepEqual(result.stops.map(item => item.id), ['A', 'B']);
});

test('nearest selection refuses to pretend straight-line is routed walking', () => {
  const result = selectNearestStopGroup([stop({ walking: { status: 'unavailable', distanceMetres: null } })]);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'walking_route_unavailable');
});

test('generic calendar and variant notes are not repeated under every service', () => {
  const weekdays = { monday: [360, 420], tuesday: [360, 420], wednesday: [360, 420], thursday: [360, 420], friday: [360, 420], saturday: [], sunday: [] };
  const records = [{
    id: '251-a',
    routeNumber: '251',
    operator: 'Arriva Herts and Essex',
    origin: 'Princesfield Rd',
    destination: 'Smiths Lane',
    direction: 'Smiths Lane',
    principalLocations: ['Waltham Cross Railway Station'],
    stopSchedules: { A: weekdays },
    qualifications: [
      'The source calendar includes date-specific exceptions; check the assessment date before formal use.',
      '2 scheduled variants are retained for this direction.',
      'Weekday-only service in the prepared representative week.'
    ]
  }];
  const [summary] = buildServiceSummaries([stop()], records);
  assert.equal(summary.serviceNote, '');
});

test('material school-service note remains visible', () => {
  const weekdays = { monday: [480], tuesday: [480], wednesday: [480], thursday: [480], friday: [480], saturday: [], sunday: [] };
  const records = [{
    id: '678-a',
    routeNumber: '678',
    operator: 'Stagecoach London',
    origin: 'Beckton',
    destination: 'Stratford',
    direction: 'Stratford',
    principalLocations: ['Plaistow'],
    stopSchedules: { A: weekdays },
    qualifications: ['School-day or term-time service identified in the source timetable; check the assessment date before formal use.']
  }];
  const [summary] = buildServiceSummaries([stop()], records);
  assert.match(summary.serviceNote, /School-day or term-time/i);
});


test('short workings with the same GTFS direction remain distinct when termini differ', () => {
  const weekdays = { monday: [360, 420], tuesday: [360, 420], wednesday: [360, 420], thursday: [360, 420], friday: [360, 420], saturday: [480], sunday: [] };
  const records = [
    {
      id: 'east:251:0:aaaaaaaaaaaa',
      routeNumber: '251',
      operator: 'Arriva Herts and Essex',
      origin: 'Princesfield Rd',
      destination: 'Smiths Lane',
      direction: 'Smiths Lane',
      principalLocations: ['Waltham Cross Railway Station', 'Theobalds Grove'],
      stopSchedules: { A: weekdays },
      qualifications: []
    },
    {
      id: 'east:251:0:bbbbbbbbbbbb',
      routeNumber: '251',
      operator: 'Arriva Herts and Essex',
      origin: 'Princesfield Rd',
      destination: 'Bus Station',
      direction: 'Bus Station',
      principalLocations: ['Waltham Cross'],
      stopSchedules: { A: { ...weekdays, monday: [1141] } },
      qualifications: []
    },
    {
      id: 'east:251:1:cccccccccccc',
      routeNumber: '251',
      operator: 'Arriva Herts and Essex',
      origin: 'Smiths Lane',
      destination: 'Princesfield Rd',
      direction: 'Princesfield Rd',
      principalLocations: ['Waltham Cross Railway Station', 'Theobalds Grove'],
      stopSchedules: { A: weekdays },
      qualifications: []
    }
  ];
  const summaries = buildServiceSummaries([stop()], records);
  assert.equal(summaries.length, 3);
  const outbound = summaries.find(summary => summary.destination === 'Smiths Lane');
  assert.ok(outbound);
  assert.ok(summaries.some(summary => summary.destination === 'Bus Station'));
  assert.ok(summaries.some(summary => summary.destination === 'Princesfield Rd'));
});

test('nearest controlled wording identifies the selected group', () => {
  const wording = buildControlledBusWording([{ routeNumber: '251', principalLocations: ['Waltham Cross'] }], { nearestGroupName: 'Waltham Cross Bus Station' });
  assert.match(wording, /^The nearest assessed bus stop group is Waltham Cross Bus Station\./);
});

for (const [name, fn] of tests) {
  await fn();
  console.log(`PASS Alpha.5 Bus presentation - ${name}`);
}
console.log(`${tests.length} Alpha.5 Bus presentation tests passed.`);
