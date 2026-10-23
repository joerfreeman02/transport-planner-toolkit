import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTflBusTimetableAdapter, parseTflRouteSequenceResponse, tflRouteSequenceEvidenceForService } from '../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';

const routeCapture = JSON.parse(fs.readFileSync(new URL('./fixtures/enfield-route313-tfl-capture-2026-10-23.json', import.meta.url), 'utf8'));
const stopKCapture = JSON.parse(fs.readFileSync(new URL('./fixtures/enfield-route313-stop-k-timetable-2026-10-23.json', import.meta.url), 'utf8'));
const stopTCapture = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-313-inbound-stop-t-2026-10-23.json', import.meta.url), 'utf8'));
const routeMetadata = routeCapture.responses.find(response => response.path === '/Line/313/Route')?.body;
const inboundSequence = routeCapture.responses.find(response => response.path === '/Line/313/Route/Sequence/inbound')?.body;
const stopETimetable = routeCapture.responses.find(response => response.path === '/Line/313/Timetable/490006587E')?.body;
assert.ok(routeMetadata && inboundSequence && stopETimetable, 'captured Enfield route metadata, inbound sequence and Stop E timetable are present');

const stops = [
  { id: '490001101K', name: 'Enfield Town Station', indicator: 'K', walkingMetres: 136, timetable: stopKCapture.response },
  { id: '490006587E', name: 'Enfield Town / Church Street', indicator: 'E', walkingMetres: 406, timetable: stopETimetable },
  { id: '490008903E', name: 'Ladysmith Road', indicator: '->E', walkingMetres: 491, timetable: stopTCapture }
].map(stop => ({ ...stop, walking: { status: 'routed', distanceMetres: stop.walkingMetres }, distanceMetres: stop.walkingMetres }));

const routeSequences = [{
  lineId: '313',
  direction: 'inbound',
  sequences: parseTflRouteSequenceResponse(inboundSequence, { lineId: '313', direction: 'inbound' })
}];
const services = [];
for (const stop of stops) {
  const adapter = createTflBusTimetableAdapter({
    cache: createJsonCache({ storage: createMemoryStorage(), namespace: `s2e1-313-${stop.id}` }),
    fetchImpl: async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => stop.timetable })
  });
  const result = await adapter.servicesForStop({
    lineId: '313', stopPointId: stop.id,
    routeMetadata: { ok: true, data: [routeMetadata], provenance: {} }, forceRefresh: true
  });
  assert.equal(result.ok, true, `captured TfL timetable for ${stop.id} parses in the production adapter`);
  services.push(...result.data.map(service => ({
    ...service,
    tflRouteSequenceEvidence: tflRouteSequenceEvidenceForService(service, { data: routeSequences, provenance: {} })
  })));
}

const summaries = buildServiceSummaries(stops, services).filter(service => service.routeNumber === '313');
const summaryIds = summaries.map(service => service.id);
assert.equal(new Set(summaryIds).size, summaryIds.length, 'calendar and assessed-stop summaries have distinct identities for planner short-working decisions');
const plannerRows = buildPlannerBusServiceSummaries(summaries, stops).filter(row => row.routeNumber === '313');
assert.equal(plannerRows.length, 1, 'the captured inbound principal route and its school short working remain one public planner row');
const chingford = plannerRows[0];
assert.equal(chingford.frequencyBasisStopId, '490001101K', 'the nearest selected Stop K remains the frequency basis');
assert.match(chingford.typicalFrequencyText, /Typically every ~20 mins/, 'the normal weekday 313 timetable remains principal in the three-stop composition');
assert.match(chingford.typicalFrequencyText, /Every ~30 mins/, 'the normal Sunday 313 timetable remains principal');
assert.doesNotMatch(chingford.typicalFrequencyText, /1 journey\/day/i, 'the single school short-working journey cannot replace the regular service');
assert.ok(chingford.sourceRecordIds.some(id => id.includes(':inbound:1:')), 'the distinct school short-working source record remains retained');

console.log('S2E-1 Enfield 313 multi-stop composition test passed.');
