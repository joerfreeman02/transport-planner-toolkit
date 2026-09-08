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

function periodDays(name) {
  const value = normal(name);
  if (/monday.*friday|weekday/.test(value)) return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  if (/saturday/.test(value) && !/sunday/.test(value)) return ['saturday'];
  if (/sunday/.test(value) && !/saturday/.test(value)) return ['sunday'];
  if (/monday/.test(value) && !/saturday|sunday/.test(value)) return ['monday'];
  return DAYS;
}

function minutes(value) {
  if (value && typeof value === 'object' && value.hour !== undefined && value.minute !== undefined) return Number(value.hour) * 60 + Number(value.minute);
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

function stationsForPattern(pattern, response) {
  const details = [...(Array.isArray(response?.stations) ? response.stations : []), ...(Array.isArray(response?.stops) ? response.stops : [])];
  const byId = new Map(details.map(station => [text(station?.id ?? station?.stopPointId ?? station?.naptanId), station]));
  const sequence = (Array.isArray(pattern?.intervals) ? pattern.intervals : []).map(interval => text(interval?.stopId)).filter(Boolean);
  return sequence.map(id => byId.get(id) ?? { id }).map(station => ({
    id: text(station?.id ?? station?.stopPointId ?? station?.naptanId),
    name: text(station?.name ?? station?.commonName),
    locality: text(station?.locality ?? station?.parentLocality)
  })).filter(station => station.id && station.name);
}

function timetablePatterns(route, response) {
  const raw = Array.isArray(route?.stationIntervals) ? route.stationIntervals : [];
  const ids = raw.map(pattern => text(pattern?.id));
  const uniqueIds = new Set(ids.filter(Boolean));
  const multiple = raw.length > 1;
  return raw.map((pattern, index) => ({
    id: ids[index] || (raw.length === 1 ? 'single-pattern' : ''),
    sourceId: ids[index] || null,
    stations: stationsForPattern(pattern, response),
    usable: raw.length === 1 || Boolean(ids[index]) && uniqueIds.size === raw.length,
    count: raw.length,
    multiple
  }));
}

function belongsToPattern(journey, pattern, patternCount) {
  const intervalId = text(journey?.intervalId);
  if (!intervalId) return patternCount === 1;
  return Boolean(pattern.sourceId) && intervalId === pattern.sourceId;
}

function scheduleForPattern(route, pattern, stopPointId) {
  const result = emptySchedule();
  const frequencyEvidence = [];
  const schedules = Array.isArray(route?.schedules) ? route.schedules : [];
  let ambiguous = false;
  let evidence = false;
  let hasPeriods = false;
  let chronologyIncomplete = false;
  for (const schedule of schedules) {
    hasPeriods ||= Array.isArray(schedule?.periods) && schedule.periods.length > 0;
    const journeys = Array.isArray(schedule?.knownJourneys) ? schedule.knownJourneys : [];
    const firstJourney = schedule?.firstJourney && belongsToPattern(schedule.firstJourney, pattern, pattern.count) ? schedule.firstJourney : null;
    const lastJourney = schedule?.lastJourney && belongsToPattern(schedule.lastJourney, pattern, pattern.count) ? schedule.lastJourney : null;
    const selectedKnown = journeys.filter(journey => belongsToPattern(journey, pattern, pattern.count));
    const entries = [...journeys, schedule?.firstJourney, schedule?.lastJourney].filter(Boolean);
    if (pattern.multiple && entries.some(journey => !text(journey?.intervalId))) ambiguous = true;
    const first = journeyMinutes(firstJourney);
    const last = journeyMinutes(lastJourney);
    if (selectedKnown.length && (!Number.isFinite(first) || !Number.isFinite(last))) chronologyIncomplete = true;
    const overnight = Number.isFinite(first) && Number.isFinite(last) && last < first;
    const departures = [...selectedKnown, firstJourney, lastJourney].filter(Boolean).map(journeyMinutes).filter(Number.isFinite).map(value => overnight && value < first && value <= last ? value + 1440 : value);
    if (departures.length) evidence = true;
    for (const day of periodDays(schedule?.name ?? schedule?.period ?? schedule?.days)) result[day].push(...departures);
    for (const period of Array.isArray(schedule?.periods) ? schedule.periods : []) {
      const lowestFrequency = Number(period?.frequency?.lowestFrequency);
      const highestFrequency = Number(period?.frequency?.highestFrequency);
      const fromMinute = minutes(period?.fromTime);
      const toMinute = minutes(period?.toTime);
      const periodType = text(period?.type) || 'Unknown';
      if (!Number.isFinite(lowestFrequency) || !Number.isFinite(highestFrequency)) continue;
      for (const day of periodDays(schedule?.name ?? schedule?.period ?? schedule?.days)) frequencyEvidence.push({
        periodType,
        day,
        fromMinute,
        toMinute,
        lowestFrequency,
        highestFrequency,
        stopPointId,
        source: 'TfL'
      });
    }
  }
  for (const day of DAYS) result[day] = [...new Set(result[day].map(Number))].sort((a, b) => a - b);
  return { schedule: result, frequencyEvidence, evidence, ambiguous, hasPeriods, chronologyIncomplete };
}

function sectionsFromMetadata(data, lineId) {
  const lines = Array.isArray(data) ? data : [data];
  const sections = lines.filter(line => normal(line?.id ?? line?.name) === normal(lineId)).flatMap(line => Array.isArray(line?.routeSections) ? line.routeSections : []).map(section => ({
    id: text(section?.id),
    direction: text(section?.direction),
    origin: text(section?.originationName),
    destination: text(section?.destinationName),
    validFrom: text(section?.validFrom) || null,
    validTo: text(section?.validTo) || null
  })).filter(section => section.origin && section.destination);
  const identities = new Map();
  for (const section of sections) {
    const key = [normal(section.direction), normal(section.origin), normal(section.destination)].join('|');
    const existing = identities.get(key);
    if (!existing) identities.set(key, section);
    else if (existing.validFrom !== section.validFrom || existing.validTo !== section.validTo) { existing.validFrom = null; existing.validTo = null; }
  }
  return [...identities.values()];
}

function identityForPattern(pattern, metadata, direction) {
  const directed = (metadata ?? []).filter(section => !direction || normal(section.direction) === normal(direction));
  const terminal = pattern.stations.at(-1)?.name;
  const destinationMatched = terminal ? directed.filter(section => normal(section.destination) === normal(terminal)) : [];
  const candidates = terminal ? destinationMatched : directed;
  return candidates.length === 1 ? candidates[0] : null;
}

function routeRecords(response, stopPointId, metadataResult) {
  const routes = Array.isArray(response?.timetable?.routes) ? response.timetable.routes : Array.isArray(response?.routes) ? response.routes : [];
  const lineId = text(response?.lineId ?? response?.lineName);
  const lineName = text(response?.lineName ?? response?.lineId);
  const direction = text(response?.direction);
  const metadata = metadataResult?.ok ? sectionsFromMetadata(metadataResult.data, lineId) : [];
  const warnings = [];
  const services = [];
  for (const route of routes) {
    for (const [index, pattern] of timetablePatterns(route, response).entries()) {
      if (!pattern.usable || pattern.stations.length < 2) {
        warnings.push('TfL returned multiple timetable interval patterns without distinct deterministic interval identities. No route pattern or zero-service conclusion has been assumed.');
        continue;
      }
      const timing = scheduleForPattern(route, pattern, stopPointId);
      if (timing.ambiguous) {
        warnings.push('TfL returned competing timetable interval patterns without intervalId linkage for one or more journeys. The ambiguous pattern has not been guessed.');
        continue;
      }
      if (timing.chronologyIncomplete) warnings.push('TfL supplied scheduled journeys without both deterministic first and last journey boundaries. ATLAS did not infer overnight chronology for those journeys.');
      if (!timing.evidence) {
        warnings.push('TfL returned an interval pattern without deterministically associated scheduled journeys. The pattern has not been presented as a scheduled service.');
        continue;
      }
      const identity = identityForPattern(pattern, metadata, direction);
      if (!identity) warnings.push(metadataResult?.ok
        ? 'TfL route metadata did not establish one complete route identity for this timetable pattern. ATLAS retained the scheduled pattern without inventing full origin or destination.'
        : 'TfL route metadata could not be checked. ATLAS retained the scheduled pattern without inventing full origin or destination.');
      const hasPeriods = timing.hasPeriods;
      services.push({
        id: `tfl:${lineId}:${normal(direction)}:${normal(pattern.id || `pattern-${index + 1}`)}`,
        routeNumber: lineName || lineId,
        operator: text(route?.operator ?? response?.operator),
        origin: identity?.origin ?? '',
        destination: identity?.destination ?? '',
        direction,
        principalLocations: derivePrincipalLocations(pattern.stations),
        routePatternStopIds: pattern.stations.map(station => station.id),
        operatingPeriodEvidence: hasPeriods,
        stopSchedules: { [stopPointId]: timing.schedule },
        frequencyEvidence: timing.frequencyEvidence,
        frequencyBasisStopId: stopPointId,
        source: { provider: 'TfL', lineId, directionId: text(response?.directionId), intervalId: pattern.sourceId, routeMetadata: identity ? 'matched' : 'incomplete' },
        timetableSource: 'TfL',
        qualifications: [
          ...(hasPeriods ? ['TfL supplied operating-period/frequency evidence; ATLAS retained only exact scheduled journeys and first/last journey boundaries, without synthesising departures from frequency ranges.'] : []),
          ...(!identity ? ['Full TfL route origin and destination were not deterministically established for this selected-stop timetable pattern.'] : [])
        ],
        validFrom: identity?.validFrom ?? null,
        validTo: identity?.validTo ?? null
      });
    }
  }
  return { services, warnings: [...new Set(warnings)] };
}

function validResponse(data) {
  return Boolean(data && text(data.lineId ?? data.lineName) && (Array.isArray(data.stations) || Array.isArray(data.timetable?.routes) || Array.isArray(data.routes)));
}

export function createTflBusTimetableAdapter({ fetchImpl = globalThis.fetch, cache, clock = () => new Date(), timeoutMs = 12000, baseUrl = 'https://api.tfl.gov.uk' } = {}) {
  const metadataInflight = new Map();
  async function routeMetadataForLines(lineIds, { forceRefresh = false } = {}) {
    const lines = [...new Set((lineIds ?? []).map(text).filter(Boolean))].sort();
    const provenance = { source: SOURCE, authoritativeFor: 'London bus route identity', endpoint: `${baseUrl}/Line/{ids}/Route`, anonymousRequest: true, apiKeyEmbedded: false };
    if (!lines.length) return sourceSuccess({ data: [], warnings: [], provenance: { ...provenance, requestCount: 0 } });
    const key = `tfl-route-metadata:${lines.join(',')}`;
    if (!forceRefresh && metadataInflight.has(key)) return metadataInflight.get(key);
    const task = runCachedSourceQuery({ cache, cacheKey: key, freshForMs: 5 * 60 * 1000, forceRefresh, load: async () => {
      const endpointUrl = new URL(`/Line/${lines.map(encodeURIComponent).join(',')}/Route`, baseUrl);
      endpointUrl.searchParams.append('serviceTypes', 'Regular');
      endpointUrl.searchParams.append('serviceTypes', 'Night');
      const endpoint = endpointUrl.toString();
      const response = await requestJson({ url: endpoint, fetchImpl, timeoutMs });
      const source = { ...provenance, endpoint, retrievedAt: clock().toISOString(), httpStatus: response.status ?? null, requestCount: 1, lineIds: lines };
      if (!response.ok) return sourceFailure({ code: response.code, message: `TfL route metadata could not be checked: ${response.message}`, status: response.status, provenance: source });
      if (!Array.isArray(response.data)) return sourceFailure({ code: 'invalid_response', message: 'TfL returned route metadata that ATLAS could not safely interpret.', provenance: source });
      return sourceSuccess({ data: response.data, warnings: [], provenance: source });
    }});
    metadataInflight.set(key, task);
    try { return await task; } finally { metadataInflight.delete(key); }
  }

  async function servicesForStop({ lineId, stopPointId, forceRefresh = false, routeMetadata = null } = {}) {
    const line = text(lineId), stop = text(stopPointId);
    const provenance = { source: SOURCE, authoritativeFor: 'scheduled London bus timetables', endpoint: `${baseUrl}/Line/{id}/Timetable/{fromStopPointId}`, anonymousRequest: true, apiKeyEmbedded: false };
    if (!line || !stop) return sourceFailure({ code: 'invalid_request', message: 'A TfL line and StopPoint identity are required.', provenance });
    const metadataResult = routeMetadata ?? await routeMetadataForLines([line], { forceRefresh });
    const endpoint = new URL(`/Line/${encodeURIComponent(line)}/Timetable/${encodeURIComponent(stop)}`, baseUrl).toString();
    return runCachedSourceQuery({ cache, cacheKey: `tfl-timetable:${line}:${stop}`, freshForMs: 5 * 60 * 1000, forceRefresh, load: async () => {
      const response = await requestJson({ url: endpoint, fetchImpl, timeoutMs });
      const source = { ...provenance, endpoint, retrievedAt: clock().toISOString(), httpStatus: response.status ?? null };
      if (!response.ok) return sourceFailure({ code: response.code, message: `TfL scheduled timetable could not be checked: ${response.message}`, status: response.status, provenance: source });
      if (!validResponse(response.data)) return sourceFailure({ code: 'invalid_response', message: 'TfL returned a scheduled timetable response that ATLAS could not safely interpret.', provenance: source });
      const departureStopId = text(response.data?.timetable?.departureStopId) || stop;
      const parsed = routeRecords(response.data, departureStopId, metadataResult);
      const warnings = parsed.services.length ? parsed.warnings : [...parsed.warnings, 'TfL returned scheduled timetable data without a deterministically resolved route pattern. No route or zero-service conclusion has been assumed.'];
      const evidence = parsed.services.map(service => createEvidence({ subject: { entityType: 'bus-service', id: service.id, name: service.routeNumber }, evidenceType: 'bus.timetable.scheduled', value: service, source: { name: SOURCE, authoritative: true, recordIdentifier: service.id, endpoint, attribution: ATTRIBUTION }, retrievedAt: source.retrievedAt, calculationMethodology: 'TfL scheduled timetable journeys were associated only with their matching StationInterval pattern. TfL line-route metadata establishes complete route identity where deterministic; no arrival predictions were used.', validationStatus: 'validated', confidenceStatus: 'authoritative', freshness: { status: 'live-current', assessedAt: source.retrievedAt }, cache: { status: 'miss' } }));
      const routeMetadataRequests = routeMetadata ? 0 : metadataResult.cache?.status === 'hit' ? 0 : 1;
      return sourceSuccess({ data: parsed.services, evidence, warnings, provenance: { ...source, departureStopId, resultCount: parsed.services.length, serviceDiscovery: 'scheduled-timetable', timetableRequests: 1, routeMetadataRequests, realtimeArrivalsUsed: false } });
    }});
  }
  return Object.freeze({ id: 'tfl-bus-timetable-v1', servicesForStop, routeMetadataForLines });
}
