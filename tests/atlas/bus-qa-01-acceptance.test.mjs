import assert from 'node:assert/strict';
import { parseTndsTransXchange } from '../../src/atlas/adapters/tnds-transxchange-adapter.mjs';
import { buildServiceSummaries, formatServiceOriginDestination } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const schedule = values => ({ monday: values, tuesday: values, wednesday: values, thursday: values, friday: values, saturday: [], sunday: [] });
const stops = [
  { id: 'A', name: 'Assessment Stop', indicator: 'S', walking: { status: 'routed', distanceMetres: 100 }, distanceMetres: 100 },
  { id: 'B', name: 'Nearby Stop', indicator: 'N', walking: { status: 'routed', distanceMetres: 220 }, distanceMetres: 220 },
  { id: 'C', name: 'Fallback Stop', walking: { status: 'unavailable' }, distanceMetres: 310 },
  { id: 'D', name: 'No Match Stop', walking: { status: 'unavailable' }, distanceMetres: 410 }
];

const bods = {
  id: 'bods-25c', routeNumber: '25C', operator: 'Arriva', origin: 'Rural Origin', destination: 'Town Terminal', direction: 'outbound',
  principalLocations: ['Village Green', 'Market Cross'], routePatternStopIds: ['A', 'B', 'C'],
  stopSchedules: { A: schedule([420, 435, 450, 465, 480, 495]), B: schedule([420, 435, 450, 465, 480, 495]), C: schedule([420, 435, 450, 465, 480, 495]) }, timetableSource: 'BODS'
};
const limited = {
  id: 'tnds-66', routeNumber: '66', operator: 'Independent Rural', origin: 'Village Origin', destination: 'Market Terminal', direction: 'outbound',
  principalLocations: ['Parish One', 'Parish Two'], routePatternStopIds: ['B', 'C'],
  stopSchedules: { B: schedule([420, 540, 660]) }, timetableSource: 'TNDS'
};

const summaries = buildServiceSummaries(stops, [bods]);
assert.equal(summaries[0].frequencyBasisStopId, 'A');
assert.equal(summaries[0].stopDirection, 'Southbound');
assert.equal(formatServiceOriginDestination(summaries[0]), 'Rural Origin - Town Terminal (Southbound); Assessed at: Assessment Stop — S (Stops Fallback Stop, Nearby Stop — N)');
assert.equal(summaries[0].typicalFrequency.departureCount, 6, 'three selected stops must not triple-count one physical journey');
assert.match(summaries[0].typicalFrequencyText, /Every ~15 mins/);
assert.match(summaries[0].operatingPeriodLines.join(' '), /Approx\. 07:00–08:15/);

const limitedSummary = buildServiceSummaries(stops, [limited])[0];
assert.equal(limitedSummary.frequencyBasisStopId, 'B');
assert.equal(limitedSummary.typicalFrequency.departureCount, 3);
assert.equal(limitedSummary.typicalFrequencyText, 'Mon-Fri: 3 journeys/day\nSat-Sun: No scheduled service');
assert.match(limitedSummary.operatingPeriodLines.join(' '), /Approx\. 07:00–11:00/);

const tndsXml = `<TransXChange SchemaVersion="2.5"><Operators><Operator><TradingName>Independent Rural</TradingName></Operator></Operators><Services><Service><ServiceCode>S66</ServiceCode><LineName>66</LineName><StandardService><Origin>Village Origin</Origin><Destination>Market Terminal</Destination><JourneyPattern id="JP66"><Direction>outbound</Direction><JourneyPatternSectionRefs>SEC66</JourneyPatternSectionRefs></JourneyPattern></StandardService></Service></Services><StopPoints><AnnotatedStopPointRef><StopPointRef>B</StopPointRef><CommonName>Village Origin</CommonName><LocalityName>Origin District</LocalityName></AnnotatedStopPointRef><AnnotatedStopPointRef><StopPointRef>C</StopPointRef><CommonName>Village Green</CommonName><LocalityName>Parish One</LocalityName></AnnotatedStopPointRef><AnnotatedStopPointRef><StopPointRef>D</StopPointRef><CommonName>Market Cross</CommonName><LocalityName>Parish Two</LocalityName></AnnotatedStopPointRef><AnnotatedStopPointRef><StopPointRef>E</StopPointRef><CommonName>Hill End</CommonName><LocalityName>Parish Three</LocalityName></AnnotatedStopPointRef></StopPoints><JourneyPatternSections><JourneyPatternSection id="SEC66"><JourneyPatternTimingLink><From><StopPointRef>B</StopPointRef></From><To><StopPointRef>C</StopPointRef></To><RunTime>PT10M</RunTime></JourneyPatternTimingLink><JourneyPatternTimingLink><From><StopPointRef>C</StopPointRef></From><To><StopPointRef>D</StopPointRef></To><RunTime>PT10M</RunTime></JourneyPatternTimingLink><JourneyPatternTimingLink><From><StopPointRef>D</StopPointRef></From><To><StopPointRef>E</StopPointRef></To><RunTime>PT10M</RunTime></JourneyPatternTimingLink></JourneyPatternSection></JourneyPatternSections><VehicleJourneys><VehicleJourney><ServiceRef>S66</ServiceRef><JourneyPatternRef>JP66</JourneyPatternRef><DepartureTime>07:00:00</DepartureTime><OperatingProfile><MondayToFriday>true</MondayToFriday></OperatingProfile></VehicleJourney></VehicleJourneys></TransXChange>`;
const parsedTnds = parseTndsTransXchange(tndsXml, { region: 'SE', sourceArchive: 'qa-01.xml' });
assert.deepEqual(parsedTnds.routePatternStopIds, ['B', 'C', 'D', 'E']);
assert.ok(parsedTnds.principalLocations.includes('Parish One'));
assert.ok(parsedTnds.principalLocations.includes('Parish Two'));
assert.equal(parsedTnds.source.patternVariantCount, 1);

const assessment = createBusAssessment({
  stopDiscovery: { nearbyStops: async () => ({ ok: true, data: stops, warnings: [], provenance: { source: 'NaPTAN' } }) },
  timetableData: { servicesForStops: async () => ({ ok: true, data: [bods, limited], warnings: [], provenance: { source: 'Department for Transport Bus Open Data Service; Traveline National Dataset supplementary data' } }) },
  accessRouting: { matrix: async (_site, selected) => ({ ok: true, routes: selected.map(stop => ({ status: 'routed', distanceMetres: stop.distanceMetres, durationSeconds: 120 })) }) }
});
const result = await assessment.assess({ latitude: 51.7, longitude: -0.1 });
assert.equal(result.stops.find(stop => stop.id === 'A').timetableEvidence, 'Matched · BODS');
assert.equal(result.stops.find(stop => stop.id === 'B').timetableEvidence, 'Matched · BODS + TNDS');
assert.match(result.stops.find(stop => stop.id === 'D').timetableEvidence, /No current match · BODS\/TNDS checked/);

const unavailable = createBusAssessment({
  stopDiscovery: { nearbyStops: async () => ({ ok: true, data: [stops[0]], warnings: [], provenance: { source: 'NaPTAN' } }) },
  timetableData: { servicesForStops: async () => ({ ok: false, code: 'timeout', data: [], warnings: [], provenance: { source: 'BODS/TNDS' } }) },
  accessRouting: { matrix: async () => ({ ok: true, routes: [{ status: 'routed', distanceMetres: 100, durationSeconds: 120 }] }) }
});
const unavailableResult = await unavailable.assess({ latitude: 51.7, longitude: -0.1 });
assert.equal(unavailableResult.stops[0].timetableEvidence, 'Timetable source unavailable');

const wordTables = buildBusWordTables(result);
assert.deepEqual(wordTables[0].headers, ['Stop name', 'Direction', 'Walking distance / time', 'Cycling distance / time', 'Routes serving stop']);
assert.deepEqual(wordTables[1].headers, ['Route', 'Operator', 'Origin / destination', 'Principal locations', 'Typical frequency', 'Operating period']);
assert.match(wordTables[1].rows[0][2], /\(Southbound\); Assessed at:/);
assert.doesNotMatch(wordTables[0].headers.join(' '), /Timetable evidence|Include/);
console.log('PASS BUS-QA-01 TNDS/BODS principal-location parity, representative-stop frequency, source status and Word exclusion regressions.');
