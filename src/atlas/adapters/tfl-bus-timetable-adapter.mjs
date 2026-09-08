import { createEvidence } from '../domain/evidence.mjs';
import { derivePrincipalLocations } from '../domain/bus-service-assessment.mjs';
import { requestJson } from '../infrastructure/http-client.mjs';
import { runCachedSourceQuery, sourceFailure, sourceSuccess } from './source-adapter.mjs';

const SOURCE = 'Transport for London Unified API';
const ATTRIBUTION = 'Scheduled timetable data provided by Transport for London';
const DAYS = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

const text = value => String(value ?? '').trim();
const normal = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const emptySchedule = () => Object.fromEntries(DAYS.map(day => [day, []]));
const unique = values => [...new Set(values.map(text).filter(Boolean))];

function periodDays(name) {
  const value = normal(name);
  if (/monday.*friday|weekday/.test(value)) return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  if (/saturday/.test(value) && !/sunday/.test(value)) return ['saturday'];
  if (/sunday/.test(value) && !/saturday/.test(value)) return ['sunday'];
  if (/monday/.test(value) && !/saturday|sunday/.test(value)) return ['monday'];
  return DAYS;
}

function minutes(value) {
  if (Number.isFinite(Number(value))) return Number(value) * 60;
  const match = text(value).match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function journeyMinutes(journey) {
  const value = journey?.departureTime ?? journey?.time ?? journey?.arrivalTime;
  if (value !== undefined) return minutes(value);
  if (journey?.hour !== undefined && journey?.minute !== undefined) return Number(journey.hour) * 60 + Number(journey.minute);
  return null;
}

function stationsFor(route, response) {
  const details = [...(Array.isArray(response?.stations) ? response.stations : []), ...(Array.isArray(response?.stops) ? response.stops : [])];
  const byId = new Map(details.map(station => [text(station?.id ?? station?.stopPointId ?? station?.naptanId), station]));
  const sequence = (Array.isArray(route?.stationIntervals) ? route.stationIntervals : []).flatMap(group => Array.isArray(group?.intervals) ? group.intervals : []).map(interval => text(interval?.stopId ?? interval?.id)).filter(Boolean);
  const raw = sequence.length ? sequence.map(id => byId.get(id) ?? { id }) : [];
  return (Array.isArray(raw) ? raw : []).map(station => ({
    id: text(station?.id ?? station?.stopPointId ?? station?.naptanId),
    name: text(station?.name ?? station?.commonName),
    locality: text(station?.locality ?? station?.parentLocality)
  })).filter(station => station.id && station.name);
}

function knownJourneys(schedule) {
  const rows = schedule?.knownJourneys ?? schedule?.journeys ?? schedule?.departures ?? [];
  return (Array.isArray(rows) ? rows : []).map(journeyMinutes).filter(Number.isFinite);
}

function scheduleForRoute(route) {
  const result = emptySchedule();
  const schedules = Array.isArray(route?.schedules) ? route.schedules : [];
  for (const schedule of schedules) {
    const scheduled = knownJourneys(schedule);
    const boundaries = [journeyMinutes(schedule?.firstJourney), journeyMinutes(schedule?.lastJourney)].filter(Number.isFinite);
    for (const day of periodDays(schedule?.name ?? schedule?.period ?? schedule?.days)) result[day].push(...scheduled, ...boundaries);
  }
  for (const day of DAYS) result[day] = [...new Set(result[day].map(Number))].sort((a, b) => a - b);
  return result;
}

function routeRecords(response, stopPointId) {
  const routes = Array.isArray(response?.timetable?.routes) ? response.timetable.routes : Array.isArray(response?.routes) ? response.routes : [];
  const lineId = text(response?.lineId ?? response?.lineName);
  const lineName = text(response?.lineName ?? response?.lineId);
  return routes.map((route, index) => {
    const stations = stationsFor(route, response);
    if (stations.length < 2) return null;
    const origin = stations[0]?.name;
    const destination = stations.at(-1)?.name;
    const direction = text(response?.direction);
    const hasPeriods = (route?.schedules ?? []).some(schedule => Array.isArray(schedule?.periods) && schedule.periods.length);
    return {
      id: `tfl:${lineId}:${normal(direction)}:${index}`,
      routeNumber: lineName || lineId,
      operator: text(route?.operator ?? response?.operator),
      origin, destination, direction,
      principalLocations: derivePrincipalLocations(stations),
      stopSchedules: { [stopPointId]: scheduleForRoute(route) },
      source: { provider: 'TfL', lineId, directionId: text(route?.directionId ?? response?.directionId) },
      timetableSource: 'TfL',
      qualifications: hasPeriods ? ['TfL supplied operating-period/frequency evidence; ATLAS retained only exact scheduled journeys and first/last journey boundaries, without synthesising departures from frequency ranges.'] : [],
      validFrom: text(route?.validFrom ?? response?.validFrom) || null,
      validTo: text(route?.validTo ?? response?.validTo) || null
    };
  }).filter(Boolean);
}

function validResponse(data) {
  return Boolean(data && text(data.lineId ?? data.lineName) && (Array.isArray(data.stations) || Array.isArray(data.timetable?.routes) || Array.isArray(data.routes)));
}

export function createTflBusTimetableAdapter({ fetchImpl = globalThis.fetch, cache, clock = () => new Date(), timeoutMs = 12000, baseUrl = 'https://api.tfl.gov.uk' } = {}) {
  async function servicesForStop({ lineId, stopPointId, forceRefresh = false } = {}) {
    const line = text(lineId), stop = text(stopPointId);
    const provenance = { source: SOURCE, authoritativeFor: 'scheduled London bus timetables', endpoint: `${baseUrl}/Line/{id}/Timetable/{fromStopPointId}`, anonymousRequest: true, apiKeyEmbedded: false };
    if (!line || !stop) return sourceFailure({ code: 'invalid_request', message: 'A TfL line and StopPoint identity are required.', provenance });
    const endpoint = new URL(`/Line/${encodeURIComponent(line)}/Timetable/${encodeURIComponent(stop)}`, baseUrl).toString();
    return runCachedSourceQuery({ cache, cacheKey: `tfl-timetable:${line}:${stop}`, freshForMs: 5 * 60 * 1000, forceRefresh, load: async () => {
      const response = await requestJson({ url: endpoint, fetchImpl, timeoutMs });
      const source = { ...provenance, endpoint, retrievedAt: clock().toISOString(), httpStatus: response.status ?? null };
      if (!response.ok) return sourceFailure({ code: response.code, message: `TfL scheduled timetable could not be checked: ${response.message}`, status: response.status, provenance: source });
      if (!validResponse(response.data)) return sourceFailure({ code: 'invalid_response', message: 'TfL returned a scheduled timetable response that ATLAS could not safely interpret.', provenance: source });
      const departureStopId = text(response.data?.timetable?.departureStopId) || stop;
      const services = routeRecords(response.data, departureStopId);
      const warnings = services.length ? [] : ['TfL returned scheduled timetable data without a deterministically resolved route-specific stop sequence. No route or zero-service conclusion has been assumed.'];
      const evidence = services.map(service => createEvidence({ subject: { entityType: 'bus-service', id: service.id, name: service.routeNumber }, evidenceType: 'bus.timetable.scheduled', value: service, source: { name: SOURCE, authoritative: true, recordIdentifier: service.id, endpoint, attribution: ATTRIBUTION }, retrievedAt: source.retrievedAt, calculationMethodology: 'TfL scheduled timetable routes, station order and known journeys were mapped to the existing ATLAS service shape; no arrival predictions were used.', validationStatus: 'validated', confidenceStatus: 'authoritative', freshness: { status: 'live-current', assessedAt: source.retrievedAt }, cache: { status: 'miss' } }));
      return sourceSuccess({ data: services, evidence, warnings, provenance: { ...source, departureStopId, resultCount: services.length, serviceDiscovery: 'scheduled-timetable', realtimeArrivalsUsed: false } });
    }});
  }
  return Object.freeze({ id: 'tfl-bus-timetable-v1', servicesForStop });
}
