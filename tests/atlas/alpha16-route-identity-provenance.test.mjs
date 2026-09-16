import assert from 'node:assert/strict';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { createTflBusTimetableAdapter } from '../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';

const now = '2026-09-16T12:00:00.000Z';
const response = body => ({ ok: true, status: 200, headers: new Headers(), json: async () => body });
const stop = { id: 'S', name: 'Selected stop', routes: ['R7'], timetableAuthority: 'TfL' };
const currentSection = (id, direction, origin, destination) => ({ id, direction, originationName: origin, destinationName: destination, validFrom: '2026-09-01', validTo: '2027-09-01' });
const nationalService = ({ id = 'bods-R7', origin = 'Town A', destination = 'Town D', direction = 'outbound', endpointEvidenceFreshness } = {}) => ({
  id, routeNumber: 'R7', operator: 'Example Transit', origin, destination, direction,
  publicRouteOrigin: origin, publicRouteDestination: destination,
  stopSchedules: { S: { monday: [480], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } },
  departureEvidenceByDay: { monday: [{ minute: 480, stopPointId: 'S', provider: 'BODS', sourceRecordId: id }] },
  frequencyEvidence: [{ periodType: 'Normal', day: 'monday', fromMinute: 480, toMinute: 480, lowestFrequency: 60, highestFrequency: 60, stopPointId: 'S', source: 'BODS' }],
  calendarEvidence: [{ daysOfWeek: ['monday'], calendarResolved: true, sourceCalendarLabel: 'Monday' }],
  endpointEvidenceFreshness,
  timetableSource: 'BODS',
  source: { provider: 'BODS', routeId: id, region: 'london', preparedAt: '2026-09-14T12:00:00.000Z' }
});

async function composition({ sections, services, freshness = 'current', insideLondon = true, selectedStops = [stop] }) {
  const payload = {
    lineId: 'R7', lineName: 'R7', direction: 'outbound', stations: [],
    timetable: { departureStopId: 'S', routes: [] }
  };
  const tflAdapter = createTflBusTimetableAdapter({
    cache: createJsonCache({ storage: createMemoryStorage(), namespace: `route-meta-${Math.random()}` }),
    clock: () => new Date(now),
    fetchImpl: async url => String(url).includes('/Route')
      ? response([{ id: 'R7', routeSections: sections }])
      : response(payload)
  });
  const nationalAdapter = {
    servicesForStops: async () => ({
      ok: true,
      data: services,
      warnings: [],
      provenance: {
        endpoint: 'https://prepared.example/bus/manifest.json',
        retrievedAt: now,
        dataPreparedAt: '2026-09-14T12:00:00.000Z',
        dataFreshness: { status: freshness, preparedAt: '2026-09-14T12:00:00.000Z' },
        timetableConclusion: 'MATCHED'
      }
    })
  };
  const adapter = createAuthoritativeBusTimetableAdapter({
    tflAdapter, nationalAdapter, londonSupplementAdapter: nationalAdapter, londonCoverage: () => insideLondon
  });
  return adapter.servicesForStops(selectedStops, { site: { latitude: 51.5, longitude: -0.1 } });
}

// A: failed stop-specific TfL parsing does not erase independently current route identity.
{
  const result = await composition({ sections: [currentSection('r7-out', 'outbound', 'Town A', 'Town D')], services: [nationalService()] });
  const service = result.data[0];
  assert.equal(service.timetableSource, 'BODS fallback after TfL unresolved');
  assert.deepEqual(service.stopSchedules.S.monday, [480]);
  assert.equal(service.source.provider, 'BODS', 'the national schedule is never relabelled as a TfL timetable');
  assert.equal(service.source.routeMetadata, 'matched');
  assert.deepEqual([service.origin, service.destination], ['Town A', 'Town D']);
  assert.equal(service.endpointProvenance.origin.provider, 'TfL');
  assert.equal(service.endpointProvenance.destination.provider, 'TfL');
  assert.match(service.endpointProvenance.destination.endpoint, /\/Line\/R7\/Route/);
  assert.equal(service.endpointProvenance.destination.freshness.status, 'live-current');
  assert.deepEqual(result.provenance.tflTimetableDiagnosticRequestIdentities, ['R7|S']);
  assert.deepEqual(result.provenance.routeIdentityResolvedRequestIdentities, ['R7|S']);
  assert.deepEqual(result.provenance.nationalFallbackRequestIdentities, ['R7|S']);
  assert.equal(result.warnings.some(item => /not a TfL timetable result/i.test(item)), true);
  const rows = buildPlannerBusServiceSummaries(buildServiceSummaries([{ ...stop, walking: { status: 'routed', distanceMetres: 100 } }], result.data), [{ ...stop, walking: { status: 'routed', distanceMetres: 100 } }]);
  assert.deepEqual([rows[0].origin, rows[0].destination], ['Town A', 'Town D']);
  assert.equal(rows[0].publicEndpointEvidence.destination.provenance.provider, 'TfL');
  assert.ok(rows[0].frequencyEvidence.some(item => item.source === 'BODS'), 'frequency evidence remains attributable to the national fallback');
}

// B: current route-section evidence outranks stale national endpoints without quarantining the schedule.
{
  const result = await composition({
    sections: [currentSection('r7-out', 'outbound', 'Town A', 'New Town')],
    services: [nationalService({ origin: 'Town A', destination: 'Old Town', endpointEvidenceFreshness: 'stale' })],
    freshness: 'stale'
  });
  const service = result.data[0];
  assert.deepEqual([service.origin, service.destination], ['Town A', 'New Town']);
  assert.equal(service.source.lowerAuthorityEndpointEvidence.destination, 'Old Town');
  assert.equal(service.source.lowerAuthorityEndpointEvidence.preparedAt, '2026-09-14T12:00:00.000Z');
  assert.deepEqual(service.stopSchedules.S.monday, [480]);
  const selected = [{ ...stop, walking: { status: 'routed', distanceMetres: 100 } }];
  const row = buildPlannerBusServiceSummaries(buildServiceSummaries(selected, result.data), selected)[0];
  assert.deepEqual([row.origin, row.destination], ['Town A', 'New Town']);
  assert.equal(row.publicEndpointEvidence.destination.provenance.provider, 'TfL');
}

// C/D: a BODS-supplied endpoint keeps BODS field provenance; staleness blocks that field only.
{
  const tflPayload = {
    lineId: 'R7', lineName: 'R7', direction: 'outbound',
    stations: [{ id: 'S', name: 'Town A' }, { id: 'END', name: 'Town D' }],
    timetable: { departureStopId: 'S', routes: [{
      stationIntervals: [{ id: 'p', intervals: [{ stopId: 'S', timeToArrival: 0 }, { stopId: 'END', timeToArrival: 10 }] }],
      schedules: [{ name: 'Monday to Friday', knownJourneys: [{ vehicleJourneyId: 'j', intervalId: 'p', departureTime: { hour: 8, minute: 0 } }] }]
    }] }
  };
  const runMixed = async status => {
    const tflAdapter = createTflBusTimetableAdapter({
      cache: createJsonCache({ storage: createMemoryStorage(), namespace: `mixed-${status}` }), clock: () => new Date(now),
      fetchImpl: async url => String(url).includes('/Route')
        ? response([{ id: 'R7', routeSections: [] }])
        : response(tflPayload)
    });
    const national = {
      servicesForStops: async () => ({ ok: true, data: [nationalService({ origin: 'Town A', destination: 'Town D' })], warnings: [], provenance: {
        endpoint: 'https://prepared.example/bus/manifest.json', retrievedAt: now, dataPreparedAt: '2026-09-14T12:00:00.000Z',
        dataFreshness: { status, preparedAt: '2026-09-14T12:00:00.000Z' }
      } })
    };
    return createAuthoritativeBusTimetableAdapter({ tflAdapter, nationalAdapter: national, londonSupplementAdapter: national, londonCoverage: () => true })
      .servicesForStops([stop], { site: { latitude: 51.5, longitude: -0.1 } });
  };
  const mixed = (await runMixed('current')).data[0];
  assert.equal(mixed.timetableSource, 'TfL + BODS supplementary');
  assert.equal(mixed.source.provider, 'TfL');
  assert.equal(mixed.endpointProvenance.destination.provider, 'BODS');
  assert.equal(mixed.endpointProvenance.destination.sourceKind, 'BODS');
  assert.equal(mixed.endpointProvenance.destination.freshness.status, 'current');
  assert.deepEqual(mixed.stopSchedules.S.monday, [480]);
  const stale = (await runMixed('stale')).data[0];
  assert.equal(stale.endpointProvenance.destination.provider, 'BODS');
  assert.equal(stale.endpointProvenance.destination.freshness.status, 'stale');
  assert.deepEqual(stale.stopSchedules.S.monday, [480], 'fresh TfL scheduled evidence remains usable when only BODS endpoint support is stale');
  const selected = [{ ...stop, walking: { status: 'routed', distanceMetres: 100 } }];
  const staleRow = buildPlannerBusServiceSummaries(buildServiceSummaries(selected, [stale]), selected)[0];
  assert.equal(staleRow.destination, null, 'stale BODS endpoint cannot be published from a mixed-source record');
  assert.equal(staleRow.publicEndpointEvidence.destination.status, 'unresolved');
}

// E: authoritative current identity wins; lower-authority alternatives remain auditable.
{
  const service = nationalService({ origin: 'Town A', destination: 'Old Town' });
  service.origin = 'Town A';
  service.destination = 'Old Town';
  service.publicRouteOrigin = 'Town A';
  service.publicRouteDestination = 'New Town';
  service.endpointProvenance = {
    origin: { value: 'Town A', provider: 'TfL', endpoint: 'https://api.tfl.gov.uk/Line/R7/Route', retrievedAt: now, freshness: { status: 'live-current' }, evidenceClass: 'authoritative-route-section', sourceKind: 'tfl-route-metadata', routeOrSectionId: 'r7-out' },
    destination: { value: 'New Town', provider: 'TfL', endpoint: 'https://api.tfl.gov.uk/Line/R7/Route', retrievedAt: now, freshness: { status: 'live-current' }, evidenceClass: 'authoritative-route-section', sourceKind: 'tfl-route-metadata', routeOrSectionId: 'r7-out' }
  };
  service.source.routeMetadata = 'matched';
  service.source.lowerAuthorityEndpointEvidence = [
    { provider: 'BODS', origin: 'Town A', destination: 'Old Town' },
    { provider: 'BODS', origin: 'Town A', destination: 'New Town' }
  ];
  const selected = [{ ...stop, walking: { status: 'routed', distanceMetres: 100 } }];
  const row = buildPlannerBusServiceSummaries(buildServiceSummaries(selected, [service]), selected)[0];
  assert.deepEqual([row.origin, row.destination], ['Town A', 'New Town']);
  assert.deepEqual(row.rawServiceSummaries[0].sourceRecords[0].source.lowerAuthorityEndpointEvidence.map(item => item.destination), ['Old Town', 'New Town']);
}

// F: metadata with multiple current destinations in the same direction is not guessed.
{
  const result = await composition({
    sections: [currentSection('r7-out-a', 'outbound', 'Town A', 'Town D'), currentSection('r7-out-b', 'outbound', 'Town A', 'Town X')],
    services: [nationalService({ id: 'bods-a', origin: 'Town A', destination: 'Town D' }), nationalService({ id: 'bods-b', origin: 'Town A', destination: 'Town X' })]
  });
  assert.equal(result.data.length, 2, 'current national schedules remain visible even when route metadata is ambiguous');
  assert.equal(result.provenance.routeIdentityResolvedRequestIdentities.length, 0);
  assert.ok(result.data.every(service => service.source.routeMetadata === 'unmatched'));
  assert.ok(result.data.every(service => service.source.lowerAuthorityEndpointEvidence.destination));
  assert.ok(result.data.every(service => service.endpointProvenance.destination.freshness.status === 'unverified'));
  const selected = [{ ...stop, walking: { status: 'routed', distanceMetres: 100 } }];
  const rows = buildPlannerBusServiceSummaries(buildServiceSummaries(selected, result.data), selected);
  assert.ok(rows.length > 0);
  assert.ok(rows.every(row => row.destination === null && row.publicEndpointEvidence.destination.status === 'unresolved'));
}

// G: resolved display is prohibited when evidence has no provider or freshness.
{
  const malformed = {
    id: 'no-provenance', routeNumber: 'R7', operator: 'Example Transit', origin: 'Town A', destination: 'Town D',
    publicRouteOrigin: 'Town A', publicRouteDestination: 'Town D', direction: 'outbound',
    stopIds: ['S'], stopSchedules: { S: { monday: [480] } }, routePatternCompleteness: 'partial'
  };
  const selected = [{ ...stop, walking: { status: 'routed', distanceMetres: 100 } }];
  const row = buildPlannerBusServiceSummaries(buildServiceSummaries(selected, [malformed]), selected)[0];
  assert.equal(row.origin, null);
  assert.equal(row.destination, null);
  assert.equal(row.publicEndpointEvidence.destination.status, 'unresolved');
  assert.equal(row.publicEndpointEvidence.destination.provenance, null);
}

// H: aliases for one endpoint pair do not outvote an equally current conflict.
{
  const withPair = (id, destination) => ({
    ...nationalService({ id, destination }),
    publicRouteOrigin: 'Town A', publicRouteDestination: destination,
    routePatternCompleteness: 'partial', validFrom: '2026-09-01',
    endpointProvenance: {
      origin: { value: 'Town A', provider: 'BODS', endpoint: 'prepared BODS', freshness: { status: 'current' }, evidenceClass: 'explicit-public-endpoints', sourceKind: 'BODS' },
      destination: { value: destination, provider: 'BODS', endpoint: 'prepared BODS', freshness: { status: 'current' }, evidenceClass: 'explicit-public-endpoints', sourceKind: 'BODS' }
    }
  });
  const selected = [{ ...stop, walking: { status: 'routed', distanceMetres: 100 } }];
  const rows = buildPlannerBusServiceSummaries(buildServiceSummaries(selected, [
    withPair('alias-1', 'Town D'), withPair('alias-2', 'Town D'), withPair('competing-pair', 'Town X')
  ]), selected);
  assert.ok(rows.every(row => row.origin === null && row.destination === null), 'duplicate BODS aliases do not add endpoint authority');
}

// I: a route section must be current on the assessment date, and conflicting
// validity windows for duplicate metadata identities cannot be normalized away.
{
  const expired = await composition({
    sections: [{ ...currentSection('r7-expired', 'outbound', 'Town A', 'Town D'), validTo: '2026-09-15' }],
    services: [nationalService()]
  });
  assert.equal(expired.provenance.routeIdentityResolvedRequestIdentities.length, 0);
  assert.equal(expired.data[0].destination, 'Town D', 'national schedule record remains intact for audit');
  assert.equal(expired.data[0].endpointProvenance?.destination?.provider, 'BODS');

  const conflicted = await composition({
    sections: [
      currentSection('r7-same-id', 'outbound', 'Town A', 'Town D'),
      { ...currentSection('r7-same-id', 'outbound', 'Town A', 'Town D'), validTo: '2026-09-15' }
    ],
    services: [nationalService()]
  });
  assert.equal(conflicted.provenance.routeIdentityResolvedRequestIdentities.length, 0);
  assert.equal(conflicted.data[0].source.routeMetadata, undefined);
}

// J: public headsigns orient a national schedule to one current TfL section;
// safe terminal aliases are accepted, but provider-local GTFS ids and national
// destinations never masquerade as TfL inbound/outbound identity.
{
  const currentRoutes = [
    currentSection('r7-out', 'outbound', 'Waltham Cross Bus Station', 'Rookwood Road'),
    currentSection('r7-in', 'inbound', 'Rookwood Road', 'Waltham Cross Bus Station')
  ];
  const directed = await composition({
    sections: currentRoutes,
    services: [nationalService({ direction: 'towards Rookwood Road', origin: 'Bus Station', destination: 'Manor House Station' })]
  });
  assert.deepEqual([directed.data[0].origin, directed.data[0].destination], ['Waltham Cross Bus Station', 'Rookwood Road']);
  assert.equal(directed.data[0].source.routeMetadata, 'matched');
  assert.equal(directed.data[0].source.provider, 'BODS');
  assert.equal(directed.data[0].endpointProvenance.destination.provider, 'TfL');
  assert.equal(directed.data[0].source.lowerAuthorityEndpointEvidence.destination, 'Manor House Station');

  const stationAlias = await composition({
    sections: [currentSection('r7-out', 'outbound', 'Town A', 'Turnpike Lane Bus Station'), currentSection('r7-in', 'inbound', 'Turnpike Lane Bus Station', 'Town A')],
    services: [nationalService({ direction: 'towards Turnpike Lane Station', origin: 'Bus Station', destination: 'Old Town' })]
  });
  assert.equal(stationAlias.data[0].source.routeMetadata, 'matched');
  assert.deepEqual([stationAlias.data[0].origin, stationAlias.data[0].destination], ['Town A', 'Turnpike Lane Bus Station']);

  const viaAlias = await composition({
    sections: [currentSection('r7-out', 'outbound', 'Town A', 'Town D'), currentSection('r7-in', 'inbound', 'Town D', 'Town A')],
    services: [nationalService({ direction: 'Town D, Masons Road', origin: 'Bus Station', destination: 'Old Town' })]
  });
  assert.equal(viaAlias.data[0].source.routeMetadata, 'matched');
  assert.equal(viaAlias.data[0].destination, 'Town D');

  const gtfsDirection = await composition({
    sections: currentRoutes,
    services: [nationalService({ direction: 'gtfs:0', origin: 'Bus Station', destination: 'Rookwood Road' })]
  });
  assert.deepEqual([gtfsDirection.data[0].origin, gtfsDirection.data[0].destination], ['Bus Station', 'Rookwood Road']);
  assert.equal(gtfsDirection.data[0].source.routeMetadata, 'unmatched');
  assert.equal(gtfsDirection.data[0].endpointProvenance.destination.freshness.status, 'unverified');
  assert.equal(gtfsDirection.data[0].source.lowerAuthorityEndpointEvidence.destination, 'Rookwood Road');
}

// K: current route identity is also retained on national schedule coverage
// outside the exact StopPoint used for a TfL fallback.
{
  const dualStop = {
    ...stop, timetableAuthorities: ['TfL', 'NaPTAN'],
    routeAuthorities: { R7: ['TfL', 'NaPTAN'] }
  };
  const secondStop = { id: 'S2', name: 'Second selected stop', routes: ['R7'], timetableAuthority: 'NaPTAN' };
  const extended = nationalService({ direction: 'towards Town D' });
  extended.stopSchedules.S2 = { monday: [540], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
  extended.departureEvidenceByDay.monday.push({ minute: 540, stopPointId: 'S2', provider: 'BODS', sourceRecordId: extended.id });
  extended.frequencyEvidence.push({ periodType: 'Normal', day: 'monday', fromMinute: 540, toMinute: 540, lowestFrequency: 60, highestFrequency: 60, stopPointId: 'S2', source: 'BODS' });
  const result = await composition({
    sections: [currentSection('r7-out', 'outbound', 'Town A', 'Town D')],
    services: [extended], insideLondon: false, selectedStops: [dualStop, secondStop]
  });
  const retained = result.data.find(service => service.source?.provider === 'BODS' && service.stopSchedules?.S2);
  assert.ok(retained, 'schedule evidence at the other selected stop remains visible');
  assert.equal(retained.timetableSource, 'BODS', 'retained national schedules are not relabelled as TfL fallback');
  assert.equal(retained.source.routeMetadata, 'matched');
  assert.deepEqual([retained.origin, retained.destination], ['Town A', 'Town D']);
  assert.equal(retained.endpointProvenance.destination.provider, 'TfL');
  assert.equal(retained.source.lowerAuthorityEndpointEvidence.destination, 'Town D');
}

// L: a complete current TfL field pair remains publishable when a stale or
// unknown record-level flag belongs to the national timetable, and public
// locality labels retain lineage to the exact route-section endpoint fields.
{
  const service = nationalService({
    id: 'bods-R7-live-identity', origin: 'Town A Bus Station', destination: 'Town D Bus Station',
    direction: 'towards Town D', endpointEvidenceFreshness: 'unknown'
  });
  service.publicRouteOrigin = 'Town A Bus Station';
  service.publicRouteDestination = 'Town D Bus Station';
  service.endpointProvenance = {
    origin: {
      value: 'Town A Bus Station', provider: 'TfL', source: 'TfL route metadata',
      endpoint: 'https://api.tfl.gov.uk/Line/R7/Route', retrievedAt: now,
      freshness: { status: 'live-current', assessedAt: now }, evidenceClass: 'authoritative-route-section',
      routeId: 'R7', sectionId: 'r7-out', sourceKind: 'tfl-route-metadata'
    },
    destination: {
      value: 'Town D Bus Station', provider: 'TfL', source: 'TfL route metadata',
      endpoint: 'https://api.tfl.gov.uk/Line/R7/Route', retrievedAt: now,
      freshness: { status: 'live-current', assessedAt: now }, evidenceClass: 'authoritative-route-section',
      routeId: 'R7', sectionId: 'r7-out', sourceKind: 'tfl-route-metadata'
    }
  };
  service.source.routeMetadata = 'matched';
  service.source.routeMetadataEvidence = {
    provider: 'TfL', endpoint: 'https://api.tfl.gov.uk/Line/R7/Route', retrievedAt: now,
    freshness: 'live-current', routeSection: { id: 'r7-out', direction: 'outbound', origin: 'Town A Bus Station', destination: 'Town D Bus Station' }
  };
  const selected = [{ ...stop, walking: { status: 'routed', distanceMetres: 100 } }];
  const rows = buildPlannerBusServiceSummaries(buildServiceSummaries(selected, [service]), selected);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].origin, rows[0].destination], ['Town A', 'Town D']);
  for (const side of ['origin', 'destination']) {
    const evidence = rows[0].publicEndpointEvidence[side];
    assert.equal(evidence.status, 'resolved');
    assert.equal(evidence.provenance.provider, 'TfL');
    assert.equal(evidence.provenance.value, evidence.value);
    assert.equal(evidence.provenance.evidenceClass, 'authoritative-route-section');
    assert.equal(evidence.provenance.sourceEndpointSide, side);
    assert.match(evidence.provenance.sourceEndpointValue, /Bus Station$/);
  }
}

// M: current TfL sections that spell the same terminal with common public
// abbreviations produce one consistent route identity while the API spelling
// remains available as field-level source provenance.
{
  const sections = [
    currentSection('r7-in', 'inbound', 'Trafalgar Sq / Charing Cross Stn', 'Waltham Cross Bus Station'),
    currentSection('r7-out', 'outbound', 'Waltham Cross Bus Station', 'Trafalgar Square / Charing Cross Stn')
  ];
  const inbound = nationalService({
    id: 'bods-R7-in', origin: 'Trafalgar Square / Charing Cross Stn',
    destination: 'Waltham Cross Bus Station', direction: 'towards Waltham Cross'
  });
  const outbound = nationalService({
    id: 'bods-R7-out', origin: 'Waltham Cross Bus Station',
    destination: 'Trafalgar Square / Charing Cross Stn', direction: 'towards Trafalgar Square'
  });
  const result = await composition({ sections, services: [inbound, outbound] });
  const matched = result.data.filter(service => service.source?.routeMetadata === 'matched');
  assert.equal(matched.length, 2);
  assert.deepEqual(matched.map(service => service.source.routeMetadataEvidence.routeSection.destination), [
    'Waltham Cross Bus Station', 'Trafalgar Square / Charing Cross Station'
  ]);
  assert.equal(matched[1].endpointProvenance.destination.sourceEndpointValue, 'Trafalgar Square / Charing Cross Stn');
  const selected = [{ ...stop, walking: { status: 'routed', distanceMetres: 100 } }];
  const rows = buildPlannerBusServiceSummaries(buildServiceSummaries(selected, matched), selected);
  assert.equal(rows.length, 2, 'abbreviation variants must not multiply the route-direction summaries');
  assert.ok(rows.every(row => row.publicEndpointEvidence.origin.status === 'resolved'
    && row.publicEndpointEvidence.destination.status === 'resolved'));
}

// N: matched current TfL section identity, not conflicting feed-local GTFS
// direction IDs or an opposite national raw endpoint order, controls planner
// direction and prevents duplicate rows for the same public section.
{
  const first = nationalService({
    id: 'bods-R7:0:aaaaaaaaaaaa', origin: 'Town D', destination: 'Town A', direction: 'towards Town D'
  });
  first.source.directionId = '0';
  const second = nationalService({
    id: 'bods-R7:1:bbbbbbbbbbbb', origin: 'Town A', destination: 'Town D', direction: 'towards Town D'
  });
  second.source.directionId = '1';
  second.stopSchedules.S.monday = [600];
  second.departureEvidenceByDay.monday = [{ minute: 600, stopPointId: 'S', provider: 'BODS', sourceRecordId: second.id }];
  const result = await composition({
    sections: [currentSection('r7-out', 'outbound', 'Town A', 'Town D')],
    services: [first, second]
  });
  const matched = result.data.filter(service => service.source?.routeMetadata === 'matched');
  assert.equal(matched.length, 2);
  assert.ok(matched.every(service => service.source.routeMetadataEvidence.routeSection.direction === 'outbound'));
  const selected = [{ ...stop, walking: { status: 'routed', distanceMetres: 100 } }];
  const summaries = buildServiceSummaries(selected, matched);
  assert.equal(summaries.length, 2, 'separate feed-local direction IDs remain auditable before planner consolidation');
  const rows = buildPlannerBusServiceSummaries(summaries, selected);
  assert.equal(rows.length, 1, 'one current TfL section in one public direction must not create duplicate planner rows');
  assert.deepEqual([rows[0].origin, rows[0].destination], ['Town A', 'Town D']);
  assert.equal(rows[0].publicEndpointEvidence.origin.provenance.provider, 'TfL');
  assert.equal(rows[0].publicEndpointEvidence.destination.provenance.provider, 'TfL');
}

// O: the current section's ordered endpoints control the final planner
// direction even when the national pattern/headsign points the other way.
{
  const makeCurrent = (service, section) => {
    service.source.routeMetadata = 'matched';
    service.source.routeMetadataEvidence = {
      provider: 'TfL', endpoint: 'https://api.tfl.gov.uk/Line/R7/Route', retrievedAt: now,
      freshness: 'live-current', routeId: 'R7', routeSection: section
    };
    service.endpointEvidenceFreshness = 'unknown';
    service.endpointProvenance = Object.fromEntries(['origin', 'destination'].map(side => [side, {
      value: service[side], provider: 'TfL', source: 'TfL route metadata',
      endpoint: 'https://api.tfl.gov.uk/Line/R7/Route', retrievedAt: now,
      freshness: { status: 'live-current', assessedAt: now }, evidenceClass: 'authoritative-route-section',
      routeId: 'R7', sectionId: section.id, sourceKind: 'tfl-route-metadata'
    }]));
    return service;
  };
  const outbound = makeCurrent(nationalService({
    id: 'bods-R7-outbound', origin: 'Town A Bus Station', destination: 'Town D Bus Station',
    direction: 'towards Town D', endpointEvidenceFreshness: 'unknown'
  }), { id: 'r7-out', direction: 'outbound', origin: 'Town A Bus Station', destination: 'Town D Bus Station' });
  const inbound = makeCurrent(nationalService({
    id: 'bods-R7-inbound', origin: 'Town D Bus Station', destination: 'Town A Bus Station',
    direction: 'towards Town D', endpointEvidenceFreshness: 'unknown'
  }), { id: 'r7-in', direction: 'inbound', origin: 'Town D Bus Station', destination: 'Town A Bus Station' });
  const selected = [{ ...stop, walking: { status: 'routed', distanceMetres: 100 } }];
  const summaries = buildServiceSummaries(selected, [outbound, inbound]);
  const rows = buildPlannerBusServiceSummaries(summaries, selected);
  assert.equal(rows.length, 2, 'opposite current TfL sections remain separate planner directions');
  assert.deepEqual(rows.map(row => [row.origin, row.destination]).sort(), [
    ['Town A', 'Town D'], ['Town D', 'Town A']
  ]);
}

// P: same-section schedule records at two selected StopPoints consolidate to
// one public route direction without losing either stop or source summary.
{
  const section = { id: 'r7-out', direction: 'outbound', origin: 'Town A Bus Station', destination: 'Town D Bus Station' };
  const makeCurrent = service => {
    service.source.routeMetadataEvidence = { provider: 'TfL', freshness: 'live-current', routeId: 'R7', routeSection: section };
    service.endpointEvidenceFreshness = 'unknown';
    service.endpointProvenance = Object.fromEntries(['origin', 'destination'].map(side => [side, {
      value: service[side], provider: 'TfL', freshness: { status: 'live-current' },
      evidenceClass: 'authoritative-route-section', routeId: 'R7', sectionId: section.id
    }]));
    return service;
  };
  const first = makeCurrent(nationalService({ id: 'bods-R7-stop-S', direction: 'towards Town D' }));
  first.source.directionId = '0';
  const second = makeCurrent(nationalService({ id: 'bods-R7-stop-S2', direction: 'towards Town D' }));
  second.source.directionId = '1';
  second.stopSchedules = { S2: { monday: [600], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } };
  second.departureEvidenceByDay.monday = [{ minute: 600, stopPointId: 'S2', provider: 'BODS', sourceRecordId: second.id }];
  second.frequencyEvidence = [{ periodType: 'Normal', day: 'monday', fromMinute: 600, toMinute: 600, lowestFrequency: 60, highestFrequency: 60, stopPointId: 'S2', source: 'BODS' }];
  const selected = [
    { ...stop, walking: { status: 'routed', distanceMetres: 100 } },
    { ...stop, id: 'S2', name: 'Second selected stop', walking: { status: 'routed', distanceMetres: 140 } }
  ];
  const summaries = buildServiceSummaries(selected, [first, second]);
  assert.equal(summaries.length, 2);
  const rows = buildPlannerBusServiceSummaries(summaries, selected);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].servedStopEvidence.map(item => item.id).sort(), ['S', 'S2']);
  assert.equal(rows[0].rawServiceSummaries.length, 2);
  assert.deepEqual([rows[0].origin, rows[0].destination], ['Town A', 'Town D']);
}

// Q: an unmatched national endpoint variant that conflicts with available
// current TfL sections remains in detailed evidence and is explicitly flagged
// as a non-material diagnostic, not silently promoted to the headline.
{
  const service = nationalService({
    id: 'bods-R7-legacy-terminal', origin: 'Bus Station', destination: 'Old Town Station',
    direction: 'Old Town', endpointEvidenceFreshness: 'unknown'
  });
  service.source.routeMetadata = 'unmatched';
  service.source.routeMetadataEvidence = {
    provider: 'TfL', routeId: 'R7', freshness: 'live-current', currentRouteSections: [
      { direction: 'outbound', origin: 'Town A Bus Station', destination: 'Town D Bus Station' },
      { direction: 'inbound', origin: 'Town D Bus Station', destination: 'Town A Bus Station' }
    ]
  };
  service.source.lowerAuthorityEndpointEvidence = {
    provider: 'BODS', sourceId: service.id, origin: service.origin, destination: service.destination,
    preparedAt: '2026-09-14T12:00:00.000Z'
  };
  service.endpointProvenance = Object.fromEntries(['origin', 'destination'].map(side => [side, {
    value: service[side], provider: 'BODS', endpoint: 'Prepared BODS service data',
    preparedAt: '2026-09-14T12:00:00.000Z', freshness: { status: 'unverified' },
    evidenceClass: 'explicit-public-endpoints'
  }]));
  const assessment = createBusAssessment({
    stopDiscovery: { nearbyStops: async () => ({ ok: true, data: [stop], warnings: [], provenance: { stopCoverageComplete: true } }) },
    timetableData: { servicesForStops: async () => ({
      ok: true, data: [service], warnings: [], provenance: {
        nationalDataFreshness: { status: 'current', preparedAt: '2026-09-14T12:00:00.000Z' },
        nationalSourceAvailable: true,
        tflTimetableDiagnosticRequestIdentities: ['R7|S'],
        routeIdentityUnresolvedRequestIdentities: ['R7|S']
      }
    }) },
    accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: {} }) }
  });
  const result = await assessment.assess({});
  const conflict = result.reviewItems.find(item => item.code === 'current-route-identity-conflict');
  assert.ok(conflict);
  assert.equal(conflict.severity, 'info');
  assert.equal(conflict.actionability, 'diagnostic');
  assert.match(conflict.message, /Old Town Station/);
  assert.ok(result.plannerServiceSummaries.some(row => row.rawServiceSummaries.some(summary =>
    summary.sourceRecords.some(record => record.source?.lowerAuthorityEndpointEvidence?.destination === 'Old Town Station'))));
}

console.log('PASS Alpha.16 route identity/provenance cases A-Q, mixed-source freshness, planner invariant and diagnostics.');
