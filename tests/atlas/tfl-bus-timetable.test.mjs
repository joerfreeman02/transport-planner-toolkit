import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTflBusTimetableAdapter } from '../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { buildServiceSummaries, calculateOperatingPeriods, formatOperatingPeriod } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';
import { createTflRequestScheduler } from '../../src/atlas/adapters/tfl-request-scheduler.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-timetable.json', import.meta.url), 'utf8'));
const routeFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-line-route.json', import.meta.url), 'utf8'));
const multipleFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-timetable-multiple-intervals.json', import.meta.url), 'utf8'));
const ambiguousFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-timetable-ambiguous-intervals.json', import.meta.url), 'utf8'));
const nightFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-night-timetable.json', import.meta.url), 'utf8'));
const response = body => ({ ok: true, status: 200, headers: new Headers({ 'access-control-allow-origin': '*' }), json: async () => body });
const httpFailure = status => ({ ok: false, status, headers: new Headers(), json: async () => ({}) });
const cache = () => createJsonCache({ storage: createMemoryStorage(), namespace: 'tfl-test' });
const withOperator = { ...fixture, timetable: { ...fixture.timetable, routes: fixture.timetable.routes.map(route => ({ ...route, operator: 'London General' })) } };
const inboundFixture = { ...withOperator, direction: 'inbound', timetable: { ...withOperator.timetable, departureStopId: '490TEST004', routes: [{ ...withOperator.timetable.routes[0], stationIntervals: [{ intervals: [{ stopId: '490TEST004', timeToArrival: 0 }, { stopId: '490TEST006', timeToArrival: 8 }, { stopId: '490TEST003', timeToArrival: 12 }, { stopId: '490TEST001', timeToArrival: 20 }] }] }] } };

let timetableCalls = 0, routeCalls = 0;
const tfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => {
  if (String(url).includes('/Route')) { routeCalls += 1; return response(routeFixture); }
  timetableCalls += 1;
  return response(String(url).includes('490TEST004') ? inboundFixture : withOperator);
} });
const result = await tfl.servicesForStop({ lineId: '322', stopPointId: '490TEST003' });
assert.equal(result.ok, true);
assert.equal(result.data.length, 1);
assert.equal(result.data[0].routeNumber, '322');
assert.equal(result.data[0].origin, 'Full Route Origin');
assert.equal(result.data[0].destination, 'Clapham Common');
assert.equal(result.data[0].validFrom, null, 'duplicate Regular/Night identity with disputed validity must not fabricate a validity period');
assert.equal(result.data[0].validTo, null);
assert.notEqual(result.data[0].origin, 'Crystal Palace', 'a selected mid-route stop must never become the claimed full route origin');
assert.deepEqual(result.data[0].routePatternStopIds, ['490TEST003', '490TEST006', '490TEST004']);
assert.deepEqual(result.data[0].stopSchedules['490TEST003'].monday, [350, 370, 400, 1400], 'ordinary daytime chronology remains unchanged');
assert.ok(result.data[0].principalLocations.includes('West Norwood Bus Station'));
assert.deepEqual(result.data[0].frequencyEvidence, [{ periodType: 'FrequencyMinutes', day: 'monday', fromMinute: 360, toMinute: 540, lowestFrequency: 10, highestFrequency: 10, stopPointId: '490TEST003', source: 'TfL' }, { periodType: 'FrequencyMinutes', day: 'tuesday', fromMinute: 360, toMinute: 540, lowestFrequency: 10, highestFrequency: 10, stopPointId: '490TEST003', source: 'TfL' }, { periodType: 'FrequencyMinutes', day: 'wednesday', fromMinute: 360, toMinute: 540, lowestFrequency: 10, highestFrequency: 10, stopPointId: '490TEST003', source: 'TfL' }, { periodType: 'FrequencyMinutes', day: 'thursday', fromMinute: 360, toMinute: 540, lowestFrequency: 10, highestFrequency: 10, stopPointId: '490TEST003', source: 'TfL' }, { periodType: 'FrequencyMinutes', day: 'friday', fromMinute: 360, toMinute: 540, lowestFrequency: 10, highestFrequency: 10, stopPointId: '490TEST003', source: 'TfL' }]);
const [frequencySummary] = buildServiceSummaries([{ id: '490TEST003', walking: { status: 'routed', distanceMetres: 100 } }], result.data);
assert.match(frequencySummary.typicalFrequencyText, /Mon-Fri: Every 10 mins/);
assert.equal(frequencySummary.typicalFrequency.basis, 'frequency-band');
assert.equal(frequencySummary.typicalFrequency.departureCount, 4, 'exact known TfL journeys remain auditable');
assert.deepEqual(frequencySummary.departuresByDay.wednesday, [350, 370, 400, 1400], 'frequency-band evidence must not fabricate TfL departures');
assert.equal(result.provenance.departureStopId, '490TEST003');
assert.equal(result.provenance.timetableRequests, 1);
assert.equal(result.provenance.routeMetadataRequests, 1);
assert.match(result.data[0].qualifications.join(' '), /frequency ranges/);
const typedPeriod = async periodType => {
  const typedFixture = structuredClone(withOperator);
  typedFixture.timetable.routes[0].schedules[0].periods[0].type = periodType;
  const typed = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => response(String(url).includes('/Route') ? routeFixture : typedFixture) });
  return typed.servicesForStop({ lineId: '322', stopPointId: '490TEST003' });
};
const hoursResult = await typedPeriod('FrequencyHours');
assert.equal(hoursResult.data[0].frequencyEvidence[0].periodType, 'FrequencyHours');
const [hoursSummary] = buildServiceSummaries([{ id: '490TEST003', walking: { status: 'routed', distanceMetres: 100 } }], hoursResult.data);
assert.notEqual(hoursSummary.typicalFrequency.basis, 'frequency-band');
assert.notEqual(hoursSummary.typicalFrequency.intervalMinutes, 2);
assert.match(hoursSummary.typicalFrequencyText, /Mon-Fri: 4 journeys\/day/);
const unknownResult = await typedPeriod('Unknown');
const [unknownSummary] = buildServiceSummaries([{ id: '490TEST003', walking: { status: 'routed', distanceMetres: 100 } }], unknownResult.data);
assert.equal(unknownResult.data[0].frequencyEvidence[0].periodType, 'Unknown');
assert.notEqual(unknownSummary.typicalFrequency.basis, 'frequency-band');
assert.match(unknownSummary.typicalFrequencyText, /Mon-Fri: 4 journeys\/day/);
const normalResult = await typedPeriod('Normal');
const [normalSummary] = buildServiceSummaries([{ id: '490TEST003', walking: { status: 'routed', distanceMetres: 100 } }], normalResult.data);
assert.equal(normalResult.data[0].frequencyEvidence[0].periodType, 'Normal');
assert.notEqual(normalSummary.typicalFrequency.basis, 'frequency-band');
assert.match(normalSummary.typicalFrequencyText, /Mon-Fri: 4 journeys\/day/);
assert.deepEqual(normalSummary.departuresByDay.wednesday, [350, 370, 400, 1400], 'period types never create synthetic departures');
const multiStopFixtures = new Map([
  ['490TEST003', { periodType: 'FrequencyMinutes', lowestFrequency: 10 }],
  ['490TEST004', { periodType: 'FrequencyMinutes', lowestFrequency: 5 }],
  ['490TEST006', { periodType: 'FrequencyMinutes', lowestFrequency: 2 }]
]);
const multiStopTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => {
  if (String(url).includes('/Route')) return response(routeFixture);
  const stopPointId = [...multiStopFixtures.keys()].find(id => String(url).includes(id));
  const typedFixture = structuredClone(withOperator);
  typedFixture.timetable.departureStopId = stopPointId;
  typedFixture.timetable.routes[0].schedules[0].periods[0].type = multiStopFixtures.get(stopPointId).periodType;
  typedFixture.timetable.routes[0].schedules[0].periods[0].frequency.lowestFrequency = multiStopFixtures.get(stopPointId).lowestFrequency;
  typedFixture.timetable.routes[0].schedules[0].periods[0].frequency.highestFrequency = multiStopFixtures.get(stopPointId).lowestFrequency;
  return response(typedFixture);
} });
const multiStopRows = await Promise.all([...multiStopFixtures.keys()].map(stopPointId => multiStopTfl.servicesForStop({ lineId: '322', stopPointId })));
const multiStopRecords = multiStopRows.flatMap(row => row.data);
const [multiStopSummary] = buildServiceSummaries([
  { id: '490TEST003', name: 'Nearest', direction: 'N', walking: { status: 'routed', distanceMetres: 100 } },
  { id: '490TEST004', name: 'Other', direction: 'S', walking: { status: 'routed', distanceMetres: 200 } },
  { id: '490TEST006', name: 'Third', direction: 'E', walking: { status: 'routed', distanceMetres: 300 } }
], multiStopRecords);
assert.equal(multiStopSummary.frequencyBasisStopId, '490TEST003');
assert.equal(multiStopSummary.typicalFrequency.basis, 'frequency-band', 'the representative StopPoint band takes precedence over sparse exact points');
assert.equal(multiStopSummary.typicalFrequency.intervalMinutes, 10, 'only the representative StopPoint frequency band may influence the summary');
assert.equal(multiStopSummary.stopDirection, 'Northbound');
const sameStopDuplicate = structuredClone(withOperator);
sameStopDuplicate.timetable.routes[0].schedules[0].periods.push(structuredClone(sameStopDuplicate.timetable.routes[0].schedules[0].periods[0]));
const duplicateTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => response(String(url).includes('/Route') ? routeFixture : sameStopDuplicate) });
const duplicateResult = await duplicateTfl.servicesForStop({ lineId: '322', stopPointId: '490TEST003' });
const [duplicateSummary] = buildServiceSummaries([{ id: '490TEST003', walking: { status: 'routed', distanceMetres: 100 } }], duplicateResult.data);
assert.equal(duplicateSummary.typicalFrequency.intervalMinutes, 10, 'identical bands at one representative StopPoint are deduplicated');
const distinctStopPeriods = structuredClone(withOperator);
distinctStopPeriods.timetable.routes[0].schedules[0].periods.push({ type: 'FrequencyMinutes', fromTime: { hour: '10', minute: '00' }, toTime: { hour: '11', minute: '00' }, frequency: { lowestFrequency: 5, highestFrequency: 5 } });
const distinctTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => response(String(url).includes('/Route') ? routeFixture : distinctStopPeriods) });
const distinctResult = await distinctTfl.servicesForStop({ lineId: '322', stopPointId: '490TEST003' });
const [distinctSummary] = buildServiceSummaries([{ id: '490TEST003', walking: { status: 'routed', distanceMetres: 100 } }], distinctResult.data);
assert.equal(distinctSummary.typicalFrequency.basis, 'frequency-band');
assert.equal(distinctSummary.typicalFrequency.valueText, 'Every 5–10 mins', 'different same-stop bands remain an honest range rather than being collapsed');
assert.equal(timetableCalls, 1);
assert.equal(routeCalls, 1);
await tfl.servicesForStop({ lineId: '322', stopPointId: '490TEST003' });
assert.equal(timetableCalls, 1, 'identical line/StopPoint request should use the existing cache');
assert.equal(routeCalls, 1, 'line route metadata should use the existing cache');
let oppositeTimetable = 0, oppositeRoute = 0;
const oppositeTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => {
  if (String(url).includes('/Route')) { oppositeRoute += 1; return response(routeFixture); }
  oppositeTimetable += 1;
  return response(inboundFixture);
} });
const opposite = await oppositeTfl.servicesForStop({ lineId: '322', stopPointId: '490TEST004' });
assert.equal(opposite.data[0].direction, 'inbound');
assert.equal(opposite.data[0].origin, 'Clapham Common');
assert.equal(opposite.data[0].destination, 'Full Route Origin');
assert.equal(oppositeTimetable, 1);
assert.equal(oppositeRoute, 1);

const multi = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => response(String(url).includes('/Route') ? routeFixture : multipleFixture) });
const multiResult = await multi.servicesForStop({ lineId: '322', stopPointId: '490TEST003' });
assert.equal(multiResult.data.length, 2);
const fullPattern = multiResult.data.find(service => service.source.intervalId === '0');
const shortPattern = multiResult.data.find(service => service.source.intervalId === '1');
assert.deepEqual(fullPattern.stopSchedules['490TEST003'].monday, [350, 370]);
assert.deepEqual(shortPattern.stopSchedules['490TEST003'].monday, [380, 1400]);
assert.deepEqual(fullPattern.routePatternStopIds, ['490TEST003', '490TEST004']);
assert.deepEqual(shortPattern.routePatternStopIds, ['490TEST003', '490TEST005']);
assert.equal(shortPattern.origin, '', 'a route metadata destination mismatch must not be used to invent short-working identity');
assert.equal(shortPattern.destination, '');
const nightRequests = [];
const nightTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => {
  nightRequests.push(String(url));
  return response(String(url).includes('/Route') ? routeFixture : nightFixture);
} });
const night = await nightTfl.servicesForStop({ lineId: 'N123', stopPointId: '490NIGHT002' });
assert.equal(night.ok, true);
assert.equal(night.data.length, 1);
assert.equal(night.data[0].routeNumber, 'N123');
assert.equal(night.data[0].origin, 'Night Origin');
assert.equal(night.data[0].destination, 'Night Terminal');
assert.equal(night.data[0].timetableSource, 'TfL');
const n123Schedule = night.data[0].stopSchedules['490NIGHT002'].monday;
assert.deepEqual(n123Schedule, [1350, 1430, 1520]);
const n123Periods = calculateOperatingPeriods({ monday: n123Schedule });
assert.equal(n123Periods.monday.first, '22:30');
assert.equal(n123Periods.monday.last, '01:20');
assert.equal(n123Periods.monday.overnight, true);
assert.match(formatOperatingPeriod(n123Periods)[0], /Approx\. 22:30–01:20 \(next day\)/);
const [n123Summary] = buildServiceSummaries([{ id: '490NIGHT002' }], [night.data[0]]);
assert.equal(n123Summary.operatingPeriods.monday.first, '22:30');
assert.equal(n123Summary.operatingPeriods.monday.last, '01:20');
assert.equal(n123Summary.operatingPeriods.monday.overnight, true);
assert.match(n123Summary.operatingPeriodLines.join(' '), /Approx\. 22:30–01:20 \(next day\)/);
assert.equal(nightRequests.filter(url => url.includes('/Route')).length, 1);
assert.equal(nightRequests.filter(url => url.includes('/Timetable/')).length, 1);
assert.ok(nightRequests.some(url => /serviceTypes=Regular&serviceTypes=Night/.test(url)));
const ambiguous = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => response(String(url).includes('/Route') ? routeFixture : ambiguousFixture) });
const ambiguousResult = await ambiguous.servicesForStop({ lineId: '322', stopPointId: '490TEST003' });
assert.equal(ambiguousResult.data.length, 0);
assert.match(ambiguousResult.warnings.join(' '), /without intervalId linkage/);

const stop = { id: '490TEST003', name: 'Crystal Palace', latitude: 51.418, longitude: -0.082, routes: ['322'] };
const matchingBods = { id: 'bods-322', routeNumber: '322', operator: 'London General', origin: 'Full Route Origin', destination: 'Clapham Common', direction: 'outbound', principalLocations: ['West Norwood Bus Station', 'West Norwood'], routePatternStopIds: ['490TEST003', '490TEST006', '490TEST004'], operatingPeriodEvidence: true, stopSchedules: { '490TEST003': { monday: [370], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } } };
const authoritative = createAuthoritativeBusTimetableAdapter({ tflAdapter: tfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [matchingBods], warnings: [], provenance: { source: 'BODS' } }) } });
const matching = await authoritative.servicesForStops([stop], { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(matching.ok, true);
assert.equal(matching.data[0].timetableSource, 'TfL');
assert.equal(matching.warnings.filter(warning => /conflicting/i.test(warning)).length, 0, 'matching full TfL/BODS identity must pass silently');
assert.equal(matching.data[0].origin, 'Full Route Origin', 'the mid-route control makes a parser-derived false origin a test failure');

const conflictingBods = { ...matchingBods, origin: 'Wrong Origin', destination: 'Wrong Destination' };
const conflictAuthority = createAuthoritativeBusTimetableAdapter({ tflAdapter: tfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [conflictingBods], warnings: [], provenance: { source: 'BODS' } }) } });
const conflict = await conflictAuthority.servicesForStops([stop], { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(conflict.data[0].origin, 'Full Route Origin');
assert.equal(conflict.data[0].destination, 'Clapham Common');
assert.equal(conflict.warnings.filter(warning => /conflicting/i.test(warning)).length, 1, 'a material origin/destination disagreement is aggregated once');

const missingMetadataTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => String(url).includes('/Route') ? httpFailure(503) : response(withOperator) });
const supplemented = await createAuthoritativeBusTimetableAdapter({ tflAdapter: missingMetadataTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [matchingBods], warnings: [], provenance: { source: 'BODS' } }) } }).servicesForStops([stop], { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(supplemented.data[0].origin, 'Full Route Origin');
assert.equal(supplemented.data[0].destination, 'Clapham Common');
assert.equal(supplemented.data[0].timetableSource, 'TfL + BODS supplementary');

const failureTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async () => { throw new Error('offline'); } });
const fallback = createAuthoritativeBusTimetableAdapter({ tflAdapter: failureTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [matchingBods], warnings: [], provenance: { source: 'BODS' } }) } });
const fallbackResult = await fallback.servicesForStops([stop], { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(fallbackResult.ok, true);
assert.equal(fallbackResult.data[0].timetableSource, 'BODS fallback after TfL failure');
assert.match(fallbackResult.warnings.join(' '), /explicit supplementary fallback/);
const allFailed = await createAuthoritativeBusTimetableAdapter({ tflAdapter: failureTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { source: 'BODS' } }) } }).servicesForStops([stop], { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(allFailed.ok, false);
assert.match(allFailed.message, /No London zero-service conclusion/);

const preparedManifest = { schema: 'atlas-prepared-bus-data-v1', gridSize: 0.1, serviceShardKeyLength: 3, serviceShards: { '021': ['services/021.json'] }, stopShards: {}, sources: { bods: { url: 'https://fixture.test/bods', sha256: 'bods' }, naptan: { url: 'https://fixture.test/naptan', sha256: 'naptan' } }, generatedAt: '2026-09-08T00:00:00Z' };
const preparedTndsManifest = { schema: 'atlas-prepared-bus-tnds-v1', serviceShardKeyLength: 3, serviceShards: { '021': ['services/021-tnds.json'] }, regions: ['SE'], generatedAt: '2026-09-08T00:00:00Z' };
const preparedBodsService = { id: 'bods-10', routeNumber: '10', operator: 'BODS operator', origin: 'BODS origin', destination: 'BODS destination', direction: 'outbound', stopSchedules: { '021013518': { monday: [500] } } };
const preparedTndsService = { id: 'tnds-231', routeNumber: '231', operator: 'South Beds Dial-a-Ride', origin: 'Pipers Lane', destination: 'Bedford', direction: 'outbound', stopSchedules: { '021013518': { monday: [510] } } };
const preparedFetch = async url => {
  const path = new URL(url).pathname;
  const body = path === '/bus/manifest.json' ? preparedManifest : path === '/bus/services/021.json' ? { schema: 'atlas-prepared-bus-data-v1', services: [preparedBodsService] } : path === '/bus-tnds/manifest.json' ? preparedTndsManifest : { schema: 'atlas-prepared-bus-tnds-v1', stopPrefix: '021', services: [preparedTndsService] };
  return response(body);
};
const realNational = createPreparedBusDataAdapter({ fetchImpl: preparedFetch, baseUrl: 'https://fixture.test/bus/', tndsBaseUrl: 'https://fixture.test/bus-tnds/' });
const realLondonSupplement = createPreparedBusDataAdapter({ fetchImpl: preparedFetch, baseUrl: 'https://fixture.test/bus/' });
const realComposition = createAuthoritativeBusTimetableAdapter({ tflAdapter: failureTfl, nationalAdapter: realNational, londonSupplementAdapter: realLondonSupplement });
const pipers = await realComposition.servicesForStops([{ id: '021013518', routes: ['231'] }], { site: { latitude: 51.852700, longitude: -0.454343 } });
assert.equal(pipers.ok, true);
assert.ok(pipers.data.some(service => service.routeNumber === '231' && service.timetableSource === 'TNDS'));
assert.match(pipers.provenance.source, /Department for Transport Bus Open Data Service/);
assert.match(pipers.provenance.source, /Traveline National Dataset/);

const partialStops = [{ id: 'L1', routes: ['10'] }, { id: 'L2', routes: ['20'] }];
const partialTfl = { servicesForStop: async ({ lineId, stopPointId }) => lineId === '20' ? { ok: false, code: 'timeout', warnings: [], provenance: {} } : { ok: true, data: [{ id: 'tfl-10', routeNumber: '10', operator: 'TfL operator', origin: 'A', destination: 'B', direction: 'outbound', principalLocations: [], stopSchedules: { [stopPointId]: { monday: [500] } } }], warnings: [], provenance: {} } };
const partialBods = { id: 'bods-20', routeNumber: '20', operator: 'BODS 20', origin: 'C', destination: 'D', direction: 'outbound', principalLocations: [], stopSchedules: { L2: { monday: [600] } } };
const partialAuthority = createAuthoritativeBusTimetableAdapter({ tflAdapter: partialTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [partialBods], warnings: [], provenance: { source: 'BODS' } }) } });
const partial = await partialAuthority.servicesForStops(partialStops, { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(partial.data.length, 2);
assert.equal(partial.data.find(service => service.routeNumber === '20').timetableSource, 'BODS fallback after TfL failure');
assert.equal(partial.warnings.filter(warning => /could not be checked for one or more services/.test(warning)).length, 1);
const unresolved = await createAuthoritativeBusTimetableAdapter({ tflAdapter: partialTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { source: 'BODS' } }) } }).servicesForStops(partialStops, { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(unresolved.data.length, 1);
assert.equal(unresolved.warnings.filter(warning => /no defensible national fallback/.test(warning)).length, 1);

const budgetCalls = [];
const budgetTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => {
  budgetCalls.push(url);
  if (String(url).includes('/Route')) return response(routeFixture);
  const match = String(url).match(/\/Line\/([^/]+)\/Timetable\/([^/?]+)/);
  const payload = structuredClone(withOperator);
  payload.lineId = decodeURIComponent(match?.[1] ?? payload.lineId);
  payload.lineName = payload.lineId;
  payload.timetable.departureStopId = decodeURIComponent(match?.[2] ?? payload.timetable.departureStopId);
  return response(payload);
} });
const budgetAuthority = createAuthoritativeBusTimetableAdapter({ tflAdapter: budgetTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { source: 'BODS' } }) }, requestLimit: 20 });
const tooManyStops = Array.from({ length: 21 }, (_, index) => ({ id: `490TEST${String(index).padStart(3, '0')}`, routes: [`R${index}`] }));
const budgetResult = await budgetAuthority.servicesForStops(tooManyStops, { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(budgetResult.ok, true, 'dense London discovery must produce a controlled result rather than a raw request-budget failure');
assert.equal(budgetResult.provenance.detailedRequests, 21, 'all 21 detailed pairs are processed');
assert.equal(budgetResult.provenance.unprocessedRequests, 0);
assert.equal(budgetResult.provenance.totalTfLRequests, 22, '21 timetable requests plus one batched metadata request are counted');
assert.equal(budgetCalls.length, 22, 'the complete 21-pair assessment makes every controlled outbound request');

let fakeNow = 0;
const sleeps = [];
const scheduler = createTflRequestScheduler({ now: () => fakeNow, sleep: async milliseconds => { sleeps.push(milliseconds); fakeNow += milliseconds; } });
for (let index = 0; index < 46; index += 1) await scheduler.schedule('timetable', async () => ({ ok: true }));
assert.equal(sleeps.length, 1, 'the rolling scheduler waits only when the 45-request window is exhausted');
assert.ok(sleeps[0] >= 60000);
assert.equal(scheduler.snapshot().requestsInWindow, 1);

let busyTimetable = 0, busyRoute = 0;
const busyRouteUrls = [];
const busyTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => {
  if (String(url).includes('/Route')) { busyRoute += 1; busyRouteUrls.push(String(url)); return response(routeFixture); }
  busyTimetable += 1;
  const match = String(url).match(/\/Line\/([^/]+)\/Timetable\/([^/?]+)/);
  const payload = structuredClone(withOperator);
  payload.lineId = decodeURIComponent(match?.[1] ?? payload.lineId);
  payload.lineName = payload.lineId;
  payload.timetable.departureStopId = decodeURIComponent(match?.[2] ?? payload.timetable.departureStopId);
  return response(payload);
} });
const busyAuthority = createAuthoritativeBusTimetableAdapter({ tflAdapter: busyTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { source: 'BODS' } }) } });
const busyStops = Array.from({ length: 6 }, (_, index) => ({ id: `BUSY${index}`, routes: ['322', '323'] }));
const busyResult = await busyAuthority.servicesForStops(busyStops, { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(busyResult.ok, true);
assert.equal(busyTimetable, 12);
assert.equal(busyRoute, 1, 'route metadata batches distinct lines once');
assert.match(busyRouteUrls[0], /\/Line\/322,323\/Route\?serviceTypes=Regular&serviceTypes=Night$/);
assert.equal(busyResult.provenance.timetableRequests, 12);
assert.equal(busyResult.provenance.routeMetadataRequests, 1);
assert.equal(busyResult.provenance.totalTfLRequests, 13);

const cachedStore = cache();
const primeScheduler = createTflRequestScheduler({ now: () => 0, sleep: async () => {} });
const primeCachedAdapter = createTflBusTimetableAdapter({ cache: cachedStore, requestScheduler: primeScheduler, fetchImpl: async url => String(url).includes('/Route') ? response(routeFixture) : response(withOperator) });
await primeCachedAdapter.servicesForStop({ lineId: '322', stopPointId: '490TEST003' });
const hitScheduler = createTflRequestScheduler({ now: () => 0, sleep: async () => { throw new Error('cache hit must not sleep'); } });
const cachedAdapter = createTflBusTimetableAdapter({ cache: cachedStore, requestScheduler: hitScheduler, fetchImpl: async () => { throw new Error('cache hit must not fetch'); } });
const cachedResult = await cachedAdapter.servicesForStop({ lineId: '322', stopPointId: '490TEST003' });
assert.equal(cachedResult.cache.status, 'hit');
assert.equal(hitScheduler.snapshot().requestsInWindow, 0, 'cache hits do not consume the rolling TfL request budget');

console.log('PASS TfL interval linkage, full-route identity, cross-source validation, fallback and outside-London composition tests.');
console.log('PASS deterministic request counts: Crystal Palace mid-route 1 timetable + 1 metadata = 2; opposite direction 1 + 1 = 2 with a fresh assessment; busy 12 + 1 batched metadata = 13.');
