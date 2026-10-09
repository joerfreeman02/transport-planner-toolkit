import { createEvidence } from '../domain/evidence.mjs';
import { derivePrincipalLocations } from '../domain/bus-service-assessment.mjs';
import { requestJson } from '../infrastructure/http-client.mjs';
import { runCachedSourceQuery, sourceFailure, sourceSuccess } from './source-adapter.mjs';
import { createTflRequestScheduler } from './tfl-request-scheduler.mjs';
import { calendarProfilesMutuallyExclusive, calendarQualificationNotes, createServiceCalendarEvidence } from '../domain/service-calendar.mjs';

const SOURCE = 'Transport for London Unified API';
const ATTRIBUTION = 'Scheduled timetable data provided by Transport for London';
const DAYS = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

const text = value => String(value ?? '').trim();
const normal = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const emptySchedule = () => Object.fromEntries(DAYS.map(day => [day, []]));

const WEEKDAYS = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);

const DAY_ALIASES = Object.freeze({
  monday: 'monday', mon: 'monday', tuesday: 'tuesday', tue: 'tuesday', tues: 'tuesday',
  wednesday: 'wednesday', wed: 'wednesday', thursday: 'thursday', thu: 'thursday', thur: 'thursday', thurs: 'thursday',
  th: 'thursday',
  friday: 'friday', fri: 'friday', saturday: 'saturday', sat: 'saturday', sunday: 'sunday', sun: 'sunday'
});

function daysFromTokens(value) {
  const matches = normal(value).split(/\s+/).map(token => DAY_ALIASES[token]).filter(Boolean);
  return [...new Set(matches)];
}

function expandedDayRange(raw) {
  if (!/(?:-|–|\bto\b)/i.test(raw)) return [];
  const endpoints = daysFromTokens(raw);
  if (endpoints.length !== 2) return [];
  const firstIndex = DAYS.indexOf(endpoints[0]), lastIndex = DAYS.indexOf(endpoints[1]);
  if (firstIndex < 0 || lastIndex < firstIndex) return [];
  return DAYS.slice(firstIndex, lastIndex + 1);
}

function calendarInput(input) {
  if (Array.isArray(input)) return { raw: input.join(', '), days: daysFromTokens(input.join(' ')), structured: true };
  if (input && typeof input === 'object') {
    const raw = text(input.name ?? input.label ?? input.period ?? input.sourceCalendarLabel);
    const structuredDays = input.daysOfWeek ?? input.days ?? input.operatingDays ?? input.daysOfOperation;
    return { raw, days: Array.isArray(structuredDays) ? daysFromTokens(structuredDays.join(' ')) : [], structured: Boolean(structuredDays) };
  }
  return { raw: text(input), days: [], structured: false };
}

function periodCalendar(input) {
  const { raw, days: structuredDays, structured } = calendarInput(input);
  const value = normal(raw);
  const nonSchoolDayOnly = /\bnon\s*school\s*days?\b|\bschool\s*holidays?\b|\bholidays?\s*only\b/.test(value);
  const schoolDayOnly = !nonSchoolDayOnly && (/\bschool\s*days?\b|\bschooldays?\b/.test(value)
    || /\bschool\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(value));
  const termTimeOnly = /\bterm\s*[- ]?time\b|\bterm\s*[- ]?only\b/.test(value);
  const holidayOnly = /\bholiday(?:s)?\s*only\b|\bschool\s*holidays?\b/.test(value);
  let days = expandedDayRange(raw);
  if (!days.length) days = structuredDays.length ? structuredDays : null;
  const nightLabel = value.replace(/\s+/g, ' ');
  if (/^sunday\s+night\s*\/?\s*monday\s+morning$/.test(nightLabel)) days = ['sunday'];
  else if (/^friday\s+night\s*\/?\s*saturday\s+morning$/.test(nightLabel)) days = ['friday'];
  else if (/^saturday\s+night\s*\/?\s*sunday\s+morning$/.test(nightLabel)) days = ['saturday'];
  else if (/^mo(?:n)?\s+th(?:u)?\s+nights?\s+tu(?:e)?\s+fr(?:i)?\s+morning$/.test(nightLabel)) days = ['monday', 'tuesday', 'wednesday', 'thursday'];
  else if (/monday\s+(?:to\s+)?sunday|mon\s+(?:to\s+)?sun|mondaytosunday/.test(value)) days = DAYS;
  else if (/monday\s+(?:to\s+)?saturday|mon\s+(?:to\s+)?sat|mondaytosaturday/.test(value)) days = [...WEEKDAYS, 'saturday'];
  else if (/monday\s+(?:to\s+)?friday|mon\s+(?:to\s+)?fri|weekdays?/.test(value)) days = WEEKDAYS;
  else if (/saturday\s+(?:and\s+)?sunday|sat\s+(?:and\s+)?sun|weekends?/.test(value)) days = ['saturday', 'sunday'];
  else if (/\bdaily\b|every\s*day|mon\s*[- ]?sun/.test(value)) days = DAYS;
  else if (/^night$/.test(value)) days = DAYS;
  else if (days == null) {
    const explicit = daysFromTokens(value);
    if (explicit.length) days = explicit;
  }
  if (!days?.length && (schoolDayOnly || termTimeOnly || nonSchoolDayOnly || holidayOnly)) days = WEEKDAYS;
  return createServiceCalendarEvidence({
    daysOfWeek: days ?? [],
    calendarResolved: Boolean(days?.length),
    schoolDayOnly,
    termTimeOnly,
    nonSchoolDayOnly,
    holidayOnly,
    sourceCalendarLabel: raw || null,
    qualificationMetadata: { structuredInput: structured },
    provenance: { provider: 'TfL', authority: 'Transport for London Unified API' }
  });
}

export function periodDays(name) {
  return periodCalendar(name).days;
}

export const parseTflPeriodCalendar = periodCalendar;

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

function journeyIdentity(journey) {
  return text(journey?.vehicleJourneyCode || journey?.vehicleJourneyId || journey?.tripId || journey?.journeyId || journey?.journeyCode || journey?.id);
}

function stopSpecificMinute(journey, stopPointId) {
  const containers = [journey?.stopTimes, journey?.times, journey?.departures, journey?.departuresByStop, journey?.stopDepartures];
  for (const container of containers) {
    if (Array.isArray(container)) {
      const match = container.find(item => text(item?.stopId ?? item?.stopPointId ?? item?.stationId ?? item?.id) === stopPointId);
      const value = journeyMinutes(match);
      if (Number.isFinite(value)) return value;
    } else if (container && typeof container === 'object') {
      const value = journeyMinutes(container[stopPointId] ?? container[Object.keys(container).find(key => text(key) === stopPointId)]);
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

function journeyMinutesAtStop(journey, stopPointId, responseDepartureStopId) {
  const specific = stopSpecificMinute(journey, stopPointId);
  if (Number.isFinite(specific)) return specific;
  const statedStop = text(journey?.departureStopId ?? journey?.stopPointId ?? journey?.stopId);
  if (statedStop && statedStop !== stopPointId) return null;
  if (responseDepartureStopId && responseDepartureStopId !== stopPointId) return null;
  return journeyMinutes(journey);
}

function chronologicalPeriods(periods) {
  let previousTo = null;
  return (periods ?? []).map(period => {
    const rawFromMinute = minutes(period?.fromTime);
    const rawToMinute = minutes(period?.toTime);
    if (!Number.isFinite(rawFromMinute) || !Number.isFinite(rawToMinute)) return null;
    let fromMinute = rawFromMinute;
    while (Number.isFinite(previousTo) && fromMinute < previousTo) fromMinute += 1440;
    let toMinute = rawToMinute;
    while (toMinute < fromMinute) toMinute += 1440;
    previousTo = toMinute;
    return {
      periodType: text(period?.type) || 'Unknown',
      fromMinute,
      toMinute,
      rawFromMinute,
      rawToMinute,
      rollover: fromMinute >= 1440 || toMinute >= 1440,
      lowestFrequency: Number.isFinite(Number(period?.frequency?.lowestFrequency)) ? Number(period.frequency.lowestFrequency) : null,
      highestFrequency: Number.isFinite(Number(period?.frequency?.highestFrequency)) ? Number(period.frequency.highestFrequency) : null
    };
  }).filter(Boolean);
}

function journeyMinuteInPeriodChronology(minute, periodEntries) {
  if (!Number.isFinite(minute) || !periodEntries.length) return minute;
  const firstPeriodMinute = periodEntries[0].fromMinute;
  const lastPeriodMinute = periodEntries.at(-1).toMinute;
  const crossesMidnight = firstPeriodMinute < 1440 && lastPeriodMinute >= 1440;
  if (!crossesMidnight || minute >= firstPeriodMinute) return minute;
  return minute + 1440;
}

function stationsForPattern(pattern, response) {
  const details = [...(Array.isArray(response?.stations) ? response.stations : []), ...(Array.isArray(response?.stops) ? response.stops : [])];
  const byId = new Map(details.map(station => [text(station?.id ?? station?.stopPointId ?? station?.naptanId), station]));
  const sequence = (Array.isArray(pattern?.intervals) ? pattern.intervals : []).map(interval => text(interval?.stopId ?? interval?.stopPointId ?? interval?.stationId ?? interval?.station?.id)).filter(Boolean);
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

function scheduleForPattern(route, pattern, stopPointId, responseDepartureStopId) {
  const result = emptySchedule();
  const departureEvidence = Object.fromEntries(DAYS.map(day => [day, []]));
  const frequencyEvidence = [];
  const operatingPeriodEvidence = [];
  const calendarEvidence = [];
  const profileBuckets = new Map();
  const schedules = Array.isArray(route?.schedules) ? route.schedules : [];
  let ambiguous = false;
  let evidence = false;
  let hasPeriods = false;
  let chronologyIncomplete = false;
  for (const schedule of schedules) {
    hasPeriods ||= Array.isArray(schedule?.periods) && schedule.periods.length > 0;
    const calendar = periodCalendar(schedule);
    calendarEvidence.push(calendar);
    const profileId = calendar.calendarProfileId;
    if (!profileBuckets.has(profileId)) profileBuckets.set(profileId, {
      calendarProfileId: profileId,
      schedule: emptySchedule(),
      departureEvidence: Object.fromEntries(DAYS.map(day => [day, []])),
      frequencyEvidence: [],
      operatingPeriodEvidence: [],
      calendarEvidence: [],
      evidence: false
    });
    const profileBucket = profileBuckets.get(profileId);
    profileBucket.calendarEvidence.push(calendar);
    const periodEntries = chronologicalPeriods(schedule?.periods);
    const journeys = Array.isArray(schedule?.knownJourneys) ? schedule.knownJourneys : [];
    const firstJourney = schedule?.firstJourney && belongsToPattern(schedule.firstJourney, pattern, pattern.count) ? schedule.firstJourney : null;
    const lastJourney = schedule?.lastJourney && belongsToPattern(schedule.lastJourney, pattern, pattern.count) ? schedule.lastJourney : null;
    const selectedKnown = journeys.filter(journey => belongsToPattern(journey, pattern, pattern.count));
    const entries = [...journeys, schedule?.firstJourney, schedule?.lastJourney].filter(Boolean);
    if (pattern.multiple && entries.some(journey => !text(journey?.intervalId))) ambiguous = true;
    const first = journeyMinuteInPeriodChronology(journeyMinutesAtStop(firstJourney, stopPointId, responseDepartureStopId), periodEntries);
    const last = journeyMinuteInPeriodChronology(journeyMinutesAtStop(lastJourney, stopPointId, responseDepartureStopId), periodEntries);
    if (selectedKnown.length && (!Number.isFinite(first) || !Number.isFinite(last))) chronologyIncomplete = true;
    const overnight = Number.isFinite(first) && Number.isFinite(last) && last < first;
    const departureEntries = [...selectedKnown.map(journey => ({ journey, minute: journeyMinuteInPeriodChronology(journeyMinutesAtStop(journey, stopPointId, responseDepartureStopId), periodEntries) })), ...(firstJourney ? [{ journey: firstJourney, minute: first }] : []), ...(lastJourney ? [{ journey: lastJourney, minute: last }] : [])]
      .filter(entry => Number.isFinite(entry.minute));
    const departures = departureEntries.map(entry => overnight && entry.minute < first && entry.minute <= last ? entry.minute + 1440 : entry.minute);
    if (departures.length) evidence = true;
    for (const day of calendar.days) {
      result[day].push(...departures);
      const entries = departureEntries.map((entry, index) => ({
        minute: departures[index],
        stopPointId,
        journeyIdentity: journeyIdentity(entry.journey) || null,
        sourceRecordId: null,
        provider: 'TfL',
        patternIdentity: pattern.sourceId || null,
        calendarProfileId: profileId
      }));
      departureEvidence[day].push(...entries);
      profileBucket.schedule[day].push(...departures);
      profileBucket.departureEvidence[day].push(...entries);
      profileBucket.evidence ||= departures.length > 0;
    }
    for (const period of periodEntries) {
      for (const day of calendar.days) {
        const entry = {
        periodType: period.periodType,
        day,
        fromMinute: period.fromMinute,
        toMinute: period.toMinute,
        rawFromMinute: period.rawFromMinute,
        rawToMinute: period.rawToMinute,
        lowestFrequency: period.lowestFrequency,
        highestFrequency: period.highestFrequency,
        stopPointId,
        provider: 'TfL',
        source: 'TfL',
        calendarProfileId: profileId,
        patternIdentity: pattern.sourceId || null,
        rollover: period.rollover,
        evidenceBasis: 'TfL periods.fromTime/toTime operating-span evidence'
        };
        operatingPeriodEvidence.push(entry);
        profileBucket.operatingPeriodEvidence.push(entry);
        if (!Number.isFinite(period.lowestFrequency) || !Number.isFinite(period.highestFrequency)) continue;
        const frequencyEntry = {
          periodType: period.periodType,
          day,
          fromMinute: period.rawFromMinute,
          toMinute: period.rawToMinute,
          lowestFrequency: period.lowestFrequency,
          highestFrequency: period.highestFrequency,
          stopPointId,
          source: 'TfL',
          calendarProfileId: profileId
        };
        frequencyEvidence.push(frequencyEntry);
        profileBucket.frequencyEvidence.push(frequencyEntry);
      }
    }
  }
  for (const day of DAYS) {
    result[day] = result[day].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    departureEvidence[day].sort((a, b) => a.minute - b.minute || text(a.journeyIdentity).localeCompare(text(b.journeyIdentity)));
  }
  const buckets = [...profileBuckets.values()].map(bucket => {
    for (const day of DAYS) {
      bucket.schedule[day] = [...new Set(bucket.schedule[day].map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
      bucket.departureEvidence[day].sort((a, b) => a.minute - b.minute || text(a.journeyIdentity).localeCompare(text(b.journeyIdentity)));
    }
    return bucket;
  });
  const splitByCalendarProfile = buckets.length > 1
    && buckets.some((bucket, index) => buckets.slice(index + 1).some(other => calendarProfilesMutuallyExclusive(bucket.calendarEvidence[0], other.calendarEvidence[0])));
  const profiles = splitByCalendarProfile
    ? buckets.filter(bucket => bucket.evidence)
    : [{ calendarProfileId: buckets.length === 1 ? buckets[0].calendarProfileId : null, schedule: result, departureEvidence, frequencyEvidence: frequencyEvidence.map(({ calendarProfileId, ...entry }) => entry), operatingPeriodEvidence, calendarEvidence, evidence }];
  return { schedule: result, departureEvidence, frequencyEvidence, operatingPeriodEvidence, calendarEvidence, profiles, splitByCalendarProfile, evidence, ambiguous, hasPeriods, chronologyIncomplete };
}

function sectionsFromMetadata(data, lineId) {
  const lines = Array.isArray(data) ? data : [data];
  const sections = lines.filter(line => normal(line?.id ?? line?.name) === normal(lineId)).flatMap(line => {
    if (Array.isArray(line?.routeSections)) return line.routeSections;
    if (Array.isArray(line?.sections)) return line.sections;
    return [];
  }).map(section => ({
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

function routeRecords(response, stopPointId, responseDepartureStopId, metadataResult) {
  const routes = Array.isArray(response?.timetable?.routes) ? response.timetable.routes : Array.isArray(response?.routes) ? response.routes : [];
  const lineId = text(response?.lineId ?? response?.lineName);
  const lineName = text(response?.lineName ?? response?.lineId);
  const direction = text(response?.direction);
  const metadata = metadataResult?.ok ? sectionsFromMetadata(metadataResult.data, lineId) : [];
  const warnings = [];
  const services = [];
  for (const route of routes) {
    for (const [index, pattern] of timetablePatterns(route, response).entries()) {
      const departureStopConfirmed = responseDepartureStopId === stopPointId;
      if (!pattern.usable || pattern.stations.length < 1 || (!departureStopConfirmed && pattern.stations.length < 2)) {
        warnings.push('TfL returned multiple timetable interval patterns without distinct deterministic interval identities. No route pattern or zero-service conclusion has been assumed.');
        continue;
      }
      const hasRequestedStop = pattern.stations.some(station => station.id === stopPointId);
      if (!hasRequestedStop && !departureStopConfirmed) {
        warnings.push(`TfL returned a StationInterval pattern without the requested StopPoint ${stopPointId}. No adjacent-stop departure time was used.`);
        continue;
      }
      const timing = scheduleForPattern(route, pattern, stopPointId, responseDepartureStopId);
      for (const calendar of timing.calendarEvidence.filter(item => !item.resolved)) warnings.push(`TfL timetable period "${calendar.sourceCalendarLabel}" could not be safely mapped to operating days; no unverified days were fabricated.`);
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
      const profileTimings = timing.profiles ?? [{ calendarProfileId: null, schedule: timing.schedule, departureEvidence: timing.departureEvidence, frequencyEvidence: timing.frequencyEvidence, operatingPeriodEvidence: timing.operatingPeriodEvidence, calendarEvidence: timing.calendarEvidence, evidence: timing.evidence }];
      for (const profileTiming of profileTimings) services.push({
        id: `tfl:${lineId}:${normal(direction)}:${normal(pattern.id || `pattern-${index + 1}`)}${timing.splitByCalendarProfile ? `:calendar:${normal(profileTiming.calendarProfileId)}` : ''}`,
        routeNumber: lineName || lineId,
        operator: text(route?.operator ?? response?.operator),
        origin: identity?.origin ?? '',
        destination: identity?.destination ?? '',
        originStopPointId: pattern.stations[0]?.id || null,
        destinationStopPointId: pattern.stations.at(-1)?.id || null,
        direction,
        principalLocations: derivePrincipalLocations(pattern.stations),
        routePatternStopIds: [
          ...(departureStopConfirmed && !hasRequestedStop ? [stopPointId] : []),
          ...pattern.stations.map(station => station.id)
        ],
        operatingPeriodEvidence: profileTiming.operatingPeriodEvidence ?? [],
        stopSchedules: { [stopPointId]: profileTiming.schedule },
        departureEvidenceByDay: profileTiming.departureEvidence,
        frequencyEvidence: profileTiming.frequencyEvidence,
        calendarEvidence: profileTiming.calendarEvidence,
        calendarProfileId: profileTiming.calendarProfileId,
        frequencyBasisStopId: stopPointId,
        source: { provider: 'TfL', lineId, directionId: text(response?.directionId), intervalId: pattern.sourceId, calendarProfileId: profileTiming.calendarProfileId, routeMetadata: identity ? 'matched' : 'incomplete', endpointIdentity: 'StationInterval exact ordered endpoints' },
        timetableSource: 'TfL',
        serviceNotes: calendarQualificationNotes(profileTiming.calendarEvidence),
        sourceWarnings: profileTiming.calendarEvidence.filter(calendar => !calendar.resolved).map(calendar => `TfL timetable period "${calendar.sourceCalendarLabel}" could not be safely mapped to operating days; no unverified days were fabricated.`),
        qualifications: [
          ...(hasPeriods ? ['TfL supplied operating-period/frequency evidence; ATLAS retained the structured period boundaries separately from exact scheduled journeys, without synthesising departures from frequency ranges.'] : []),
          ...(!identity ? ['Full TfL route origin and destination were not deterministically established for this selected-stop timetable pattern.'] : [])
        ],
        validFrom: identity?.validFrom ?? null,
        validTo: identity?.validTo ?? null
      });
    }
  }
  return { services, warnings: [...new Set(warnings)] };
}

/** Parse TfL's ordered direction route-sequence response without flattening branches. */
export function parseTflRouteSequenceResponse(data, { lineId, direction } = {}) {
  const expectedLine = text(lineId);
  const expectedDirection = normal(direction);
  const responseLine = text(data?.lineId ?? data?.id);
  const responseDirection = text(data?.direction);
  if (!data || !Array.isArray(data.stopPointSequences)
    || (responseLine && expectedLine && normal(responseLine) !== normal(expectedLine))
    || (responseDirection && expectedDirection && normal(responseDirection) !== expectedDirection)) return null;
  const sequences = data.stopPointSequences.map((sequence, index) => {
    const stops = sequence?.stopPointSequence ?? sequence?.stopPoint ?? sequence?.stops ?? [];
    const orderedStops = (Array.isArray(stops) ? stops : []).map(stop => ({
      id: text(typeof stop === 'string' ? stop : stop?.id ?? stop?.naptanId ?? stop?.stopPointId),
      name: text(typeof stop === 'object' ? stop?.name ?? stop?.commonName ?? stop?.platformName : '') || null
    })).filter(stop => stop.id);
    if (!orderedStops.length) return null;
    return Object.freeze({
      lineId: responseLine || expectedLine,
      direction: responseDirection || text(direction),
      branchId: sequence?.branchId ?? null,
      serviceType: text(sequence?.serviceType) || null,
      orderedStops: Object.freeze(orderedStops),
      orderedStopPointIds: Object.freeze(orderedStops.map(stop => stop.id)),
      sourceSequenceIndex: index
    });
  }).filter(Boolean);
  return Object.freeze(sequences);
}

/** Link sequence evidence only when the timetable record proves the complete ordered pattern. */
export function tflRouteSequenceEvidenceForService(service, result) {
  const lineId = text(service?.source?.lineId ?? service?.routeNumber);
  const direction = text(service?.direction);
  const assessedStopIds = Object.keys(service?.stopSchedules ?? {}).sort();
  const entry = (result?.data ?? []).find(item => normal(item.lineId) === normal(lineId) && normal(item.direction) === normal(direction));
  const sequences = entry?.sequences ?? [];
  const patternIds = (service?.routePatternStopIds ?? []).map(text).filter(Boolean);
  const candidates = sequences.filter(sequence => {
    const ids = sequence.orderedStopPointIds ?? [];
    return normal(sequence.direction) === normal(direction)
      && assessedStopIds.some(id => ids.includes(id))
      && patternIds.length === ids.length
      && patternIds.every((id, index) => id === ids[index])
      && text(service.originStopPointId) === ids[0]
      && text(service.destinationStopPointId) === ids.at(-1);
  });
  const resolved = candidates.length === 1;
  return Object.freeze({
    provider: SOURCE,
    lineId: lineId || null,
    direction: direction || null,
    status: resolved ? 'resolved' : entry ? (sequences.length ? 'ambiguous-or-incomplete-link' : 'no-sequence') : 'lookup-failed-or-not-requested',
    candidateCount: candidates.length,
    endpointStopPointIds: resolved ? Object.freeze({ origin: candidates[0].orderedStopPointIds[0], destination: candidates[0].orderedStopPointIds.at(-1) }) : null,
    sequences: Object.freeze(sequences.map(sequence => Object.freeze({ branchId: sequence.branchId, serviceType: sequence.serviceType, orderedStopPointIds: sequence.orderedStopPointIds }))),
    cacheStatus: entry?.cache?.status ?? null,
    provenance: entry?.provenance ?? result?.provenance?.requests?.find(request => normal(request.lineId) === normal(lineId) && normal(request.direction) === normal(direction)) ?? null
  });
}

function validResponse(data) {
  return Boolean(data && text(data.lineId ?? data.lineName) && (Array.isArray(data.stations) || Array.isArray(data.timetable?.routes) || Array.isArray(data.routes)));
}

export function createTflBusTimetableAdapter({ fetchImpl = globalThis.fetch, cache, clock = () => new Date(), timeoutMs = 12000, baseUrl = 'https://api.tfl.gov.uk', requestScheduler = createTflRequestScheduler() } = {}) {
  const metadataInflight = new Map();
  const sequenceInflight = new Map();
  async function routeMetadataForLines(lineIds, { forceRefresh = false, progress = null } = {}) {
    const lines = [...new Set((lineIds ?? []).map(text).filter(Boolean))].sort();
    const provenance = { source: SOURCE, authoritativeFor: 'London bus route identity', endpoint: `${baseUrl}/Line/{ids}/Route`, anonymousRequest: true, apiKeyEmbedded: false };
    if (!lines.length) return sourceSuccess({ data: [], warnings: [], provenance: { ...provenance, requestCount: 0 } });
    const key = `tfl-route-metadata:${lines.join(',')}`;
    if (!forceRefresh && metadataInflight.has(key)) return metadataInflight.get(key);
    const task = runCachedSourceQuery({ cache, cacheKey: key, freshForMs: 5 * 60 * 1000, forceRefresh, load: async () => {
      const endpointUrl = new URL(`/Line/${lines.map(encodeURIComponent).join(',')}/Route`, baseUrl);
      endpointUrl.searchParams.set('serviceTypes', 'Regular,Night');
      const endpoint = endpointUrl.toString();
      const response = await requestScheduler.schedule('route-metadata', () => requestJson({ url: endpoint, fetchImpl, timeoutMs }), { progress: progress ?? {} });
      const source = { ...provenance, endpoint, retrievedAt: clock().toISOString(), httpStatus: response.status ?? null, requestCount: 1, lineIds: lines };
      if (!response.ok) return sourceFailure({ code: response.code, message: `TfL route metadata could not be checked: ${response.message}`, status: response.status, provenance: source });
      const routeMetadata = Array.isArray(response.data)
        ? response.data
        : response.data && typeof response.data === 'object'
          ? [response.data]
          : null;
      if (!routeMetadata) return sourceFailure({ code: 'invalid_response', message: 'TfL returned route metadata that ATLAS could not safely interpret.', provenance: source });
      return sourceSuccess({ data: routeMetadata, warnings: [], provenance: source });
    }});
    metadataInflight.set(key, task);
    try { return await task; } finally { metadataInflight.delete(key); }
  }

  async function routeSequencesForLineDirections(requests, { forceRefresh = false, progress = null } = {}) {
    const unique = new Map();
    for (const request of requests ?? []) {
      const lineId = text(request?.lineId);
      const direction = text(request?.direction);
      const serviceTypes = [...new Set((request?.serviceTypes ?? ['Regular', 'Night']).map(text).filter(Boolean))].sort();
      if (!lineId || !direction || !serviceTypes.length) continue;
      const key = `${normal(lineId)}|${normal(direction)}|${serviceTypes.map(normal).join(',')}`;
      unique.set(key, { lineId, direction, serviceTypes, key });
    }
    const identities = [...unique.values()].sort((a, b) => a.key.localeCompare(b.key));
    const outcomes = await Promise.all(identities.map(async identity => {
      const provenance = {
        source: SOURCE,
        authoritativeFor: 'direction-aware ordered TfL route sequence',
        endpoint: `${baseUrl}/Line/${encodeURIComponent(identity.lineId)}/Route/Sequence/${encodeURIComponent(identity.direction)}`,
        anonymousRequest: true,
        apiKeyEmbedded: false,
        lineId: identity.lineId,
        direction: identity.direction,
        serviceTypes: identity.serviceTypes
      };
      if (!forceRefresh && sequenceInflight.has(identity.key)) return sequenceInflight.get(identity.key);
      const task = runCachedSourceQuery({ cache, cacheKey: `tfl-route-sequence:${identity.key}`, freshForMs: 5 * 60 * 1000, forceRefresh, load: async () => {
        const endpointUrl = new URL(provenance.endpoint, baseUrl);
        endpointUrl.searchParams.set('serviceTypes', identity.serviceTypes.join(','));
        const endpoint = endpointUrl.toString();
        const response = await requestScheduler.schedule('route-sequence', () => requestJson({ url: endpoint, fetchImpl, timeoutMs }), { progress: progress ?? {} });
        const source = { ...provenance, endpoint, retrievedAt: clock().toISOString(), httpStatus: response.status ?? null, requestCount: 1 };
        if (!response.ok) return sourceFailure({ code: response.code, message: `TfL route sequence could not be checked: ${response.message}`, status: response.status, provenance: source });
        const sequences = parseTflRouteSequenceResponse(response.data, identity);
        if (!sequences) return sourceFailure({ code: 'invalid_response', message: 'TfL returned a route sequence that ATLAS could not safely interpret.', provenance: source });
        return sourceSuccess({ data: sequences, warnings: [], provenance: { ...source, sequenceCount: sequences.length } });
      }});
      sequenceInflight.set(identity.key, task);
      try { return await task; } finally { sequenceInflight.delete(identity.key); }
    }));
    const data = outcomes.flatMap((result, index) => result.ok ? [{ ...identities[index], sequences: result.data, provenance: result.provenance, cache: result.cache }] : []);
    const failed = outcomes.filter(result => !result.ok);
    return sourceSuccess({
      data,
      warnings: failed.map(result => result.message),
      provenance: {
        source: SOURCE,
        authoritativeFor: 'direction-aware ordered TfL route sequence',
        requestCount: outcomes.reduce((sum, result) => sum + (result.cache?.status === 'hit' ? 0 : result.provenance?.requestCount || 0), 0),
        cacheHits: outcomes.filter(result => result.cache?.status === 'hit').length,
        reusedRequests: Math.max(0, (requests ?? []).length - identities.length),
        failedRequests: failed.length,
        ambiguousSequenceMatches: 0,
        requests: identities.map((identity, index) => ({ ...identity, ok: outcomes[index]?.ok ?? false, cacheStatus: outcomes[index]?.cache?.status ?? null, retrievedAt: outcomes[index]?.provenance?.retrievedAt ?? null, endpoint: outcomes[index]?.provenance?.endpoint ?? null }))
      }
    });
  }

  async function servicesForStop({ lineId, stopPointId, forceRefresh = false, routeMetadata = null, progress = null } = {}) {
    const line = text(lineId), stop = text(stopPointId);
    const provenance = { source: SOURCE, authoritativeFor: 'scheduled London bus timetables', endpoint: `${baseUrl}/Line/{id}/Timetable/{fromStopPointId}`, anonymousRequest: true, apiKeyEmbedded: false, timetableConclusion: 'UNRESOLVED' };
    if (!line || !stop) return sourceFailure({ code: 'invalid_request', message: 'A TfL line and StopPoint identity are required.', provenance });
    const metadataResult = routeMetadata ?? await routeMetadataForLines([line], { forceRefresh, progress });
    const endpoint = new URL(`/Line/${encodeURIComponent(line)}/Timetable/${encodeURIComponent(stop)}`, baseUrl).toString();
    return runCachedSourceQuery({ cache, cacheKey: `tfl-timetable:${line}:${stop}`, freshForMs: 5 * 60 * 1000, forceRefresh, load: async () => {
      const response = await requestScheduler.schedule('timetable', () => requestJson({ url: endpoint, fetchImpl, timeoutMs }), { progress: progress ?? {} });
      const source = { ...provenance, endpoint, retrievedAt: clock().toISOString(), httpStatus: response.status ?? null };
      if (!response.ok) return sourceFailure({ code: response.code, message: `TfL scheduled timetable could not be checked: ${response.message}`, status: response.status, provenance: source });
      if (!validResponse(response.data)) return sourceFailure({ code: 'invalid_response', message: 'TfL returned a scheduled timetable response that ATLAS could not safely interpret.', provenance: source });
      const responseDepartureStopId = text(response.data?.timetable?.departureStopId) || null;
      const parsed = routeRecords(response.data, stop, responseDepartureStopId, metadataResult);
      if (responseDepartureStopId && responseDepartureStopId !== stop) parsed.warnings.push(`TfL response departureStopId ${responseDepartureStopId} did not match requested StopPoint ${stop}; only exact StopPoint-level journey evidence was retained.`);
      const matchedServices = parsed.services.filter(service => Object.values(service.stopSchedules?.[stop] ?? {}).some(day => Array.isArray(day) && day.length));
      const warnings = matchedServices.length ? parsed.warnings : [...parsed.warnings, 'TfL returned scheduled timetable data without a deterministically resolved route pattern. No route or zero-service conclusion has been assumed.'];
      const evidence = parsed.services.map(service => createEvidence({ subject: { entityType: 'bus-service', id: service.id, name: service.routeNumber }, evidenceType: 'bus.timetable.scheduled', value: service, source: { name: SOURCE, authoritative: true, recordIdentifier: service.id, endpoint, attribution: ATTRIBUTION }, retrievedAt: source.retrievedAt, calculationMethodology: 'TfL scheduled timetable journeys were associated only with their matching StationInterval pattern. TfL line-route metadata establishes complete route identity where deterministic; no arrival predictions were used.', validationStatus: 'validated', confidenceStatus: 'authoritative', freshness: { status: 'live-current', assessedAt: source.retrievedAt }, cache: { status: 'miss' } }));
      const routeMetadataRequests = routeMetadata ? 0 : metadataResult.cache?.status === 'hit' ? 0 : 1;
      return sourceSuccess({ data: parsed.services, evidence, warnings, provenance: { ...source, requestedStopPointId: stop, departureStopId: responseDepartureStopId || stop, departureStopMatched: !responseDepartureStopId || responseDepartureStopId === stop, resultCount: matchedServices.length, serviceDiscovery: 'scheduled-timetable', timetableRequests: 1, routeMetadataRequests, realtimeArrivalsUsed: false, timetableConclusion: matchedServices.length ? 'MATCHED' : 'UNRESOLVED' } });
    }});
  }
  return Object.freeze({ id: 'tfl-bus-timetable-v1', servicesForStop, routeMetadataForLines, routeSequencesForLineDirections });
}
