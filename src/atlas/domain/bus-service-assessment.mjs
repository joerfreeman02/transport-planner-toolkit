import { hasScheduledEvidence } from './scheduled-evidence.mjs';

const DAY_ORDER = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const DAY_LABELS = Object.freeze({ monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' });
const DAY_SHORT_LABELS = Object.freeze({ monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' });
const REPRESENTATIVE_DAY_ORDER = Object.freeze(['wednesday', 'tuesday', 'thursday', 'monday', 'friday', 'saturday', 'sunday']);
const LIMITED_SERVICE_JOURNEY_THRESHOLD = 5;
const REGULARITY_INTERVAL_TOLERANCE = 0.25;
const HUB_PATTERN = /\b(?:bus|coach)\s+(?:station|interchange)\b|\btransport\s+interchange\b/i;
const GENERIC_QUALIFICATION_PATTERNS = Object.freeze([
  /date-specific exceptions/i,
  /scheduled variants? (?:are )?retained/i,
  /scheduled route patterns serve/i,
  /weekday-only service in the prepared representative week/i
]);

function text(value) { return String(value ?? '').trim(); }
function unique(values) { return [...new Set(values.map(text).filter(Boolean))]; }
function numeric(values) { return unique(values).map(Number).filter(Number.isFinite).sort((a, b) => a - b); }
function normal(value) { return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }

function sourceJourneyIdentity(record) {
  const source = record?.source ?? {};
  return text(source.vehicleJourneyCode || source.vehicleJourneyId || source.tripId || source.journeyId || source.journeyCode);
}

function patternIdentity(record) {
  const source = record?.source ?? {};
  return text(source.patternVariantId || source.patternId || source.intervalId || record?.patternId);
}

function normaliseSchedule(schedule = {}, warnings = []) {
  const output = {};
  for (const day of DAY_ORDER) {
    const values = numeric(schedule?.[day] ?? []).filter(value => value >= 0 && value <= 2880);
    output[day] = [...new Set(values)];
    if (values.length !== numeric(schedule?.[day] ?? []).length) warnings.push(`Invalid or out-of-range schedule evidence was excluded on ${day}.`);
  }
  return output;
}

function mergeRecordSchedules(first, second) {
  const stopSchedules = { ...(first.stopSchedules ?? {}) };
  for (const [stopId, schedule] of Object.entries(second.stopSchedules ?? {})) {
    const existing = stopSchedules[stopId] ?? {};
    stopSchedules[stopId] = Object.fromEntries(DAY_ORDER.map(day => [day, numeric([...(existing[day] ?? []), ...(schedule?.[day] ?? [])])]));
  }
  return { ...first, stopSchedules, scheduleIntegrityWarnings: unique([...(first.scheduleIntegrityWarnings ?? []), ...(second.scheduleIntegrityWarnings ?? [])]) };
}

function deduplicateServiceRecords(records = []) {
  const byIdentity = new Map();
  for (const raw of records) {
    const scheduleWarnings = [];
    const record = {
      ...raw,
      stopSchedules: Object.fromEntries(Object.entries(raw.stopSchedules ?? {}).map(([stopId, schedule]) => [stopId, normaliseSchedule(schedule, scheduleWarnings)])),
      scheduleIntegrityWarnings: unique([...(raw.scheduleIntegrityWarnings ?? []), ...scheduleWarnings])
    };
    const explicitIdentity = sourceJourneyIdentity(record);
    const identity = explicitIdentity
      ? ['journey', record.timetableSource || record.source?.provider, record.routeNumber, patternIdentity(record), explicitIdentity].map(normal).join('|')
      : ['record', record.id, record.timetableSource || record.source?.provider, record.routeNumber, patternIdentity(record), JSON.stringify(record.routePatternStopIds ?? [])].map(normal).join('|');
    const existing = byIdentity.get(identity);
    byIdentity.set(identity, existing ? mergeRecordSchedules(existing, record) : record);
  }
  return [...byIdentity.values()];
}

export function formatClock(totalMinutes) {
  if (!Number.isFinite(Number(totalMinutes))) return null;
  const minutes = Math.round(Number(totalMinutes));
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

export function calculateOperatingPeriods(departuresByDay = {}) {
  const periods = {};
  for (const day of DAY_ORDER) {
    const values = numeric(departuresByDay[day] ?? []);
    periods[day] = values.length ? Object.freeze({
      firstMinute: values[0],
      lastMinute: values.at(-1),
      first: formatClock(values[0]),
      last: formatClock(values.at(-1)),
      overnight: values.at(-1) >= 1440,
      departureCount: values.length
    }) : null;
  }
  return Object.freeze(periods);
}

function samePeriod(a, b) {
  if (!a || !b) return a === b;
  return a.firstMinute === b.firstMinute && a.lastMinute === b.lastMinute;
}

function periodText(period) {
  if (!period) return 'No scheduled service';
  if (period.departureCount === 1) return `Departs approx. ${period.first}`;
  return `Approx. ${period.first}–${period.last}${period.overnight ? ' (next day)' : ''}`;
}

export function formatOperatingPeriod(periods) {
  const labels = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
  const days = DAY_ORDER;
  const lines = [];
  let start = 0;
  while (start < days.length) {
    let end = start;
    while (end + 1 < days.length && samePeriod(periods?.[days[end]], periods?.[days[end + 1]])) end += 1;
    const label = start === end ? labels[days[start]] : `${labels[days[start]]}-${labels[days[end]]}`;
    lines.push(`${label}: ${periodText(periods?.[days[start]])}`);
    start = end + 1;
  }
  return lines;
}

export function calculateScheduledFrequency(departures, { startMinute, endMinute, label = '' } = {}) {
  const start = Number(startMinute);
  const end = Number(endMinute);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('A valid representative assessment period is required.');
  const scheduled = numeric(departures).filter(value => value >= start && value < end);
  const hours = (end - start) / 60;
  const busesPerHour = scheduled.length / hours;
  const intervalMinutes = busesPerHour > 0 ? 60 / busesPerHour : null;
  return Object.freeze({
    period: Object.freeze({ startMinute: start, endMinute: end, label: text(label) }),
    departureCount: scheduled.length,
    busesPerHour: Number(busesPerHour.toFixed(2)),
    intervalMinutes: intervalMinutes == null ? null : Math.round(intervalMinutes),
    wording: scheduled.length ? `${Number(busesPerHour.toFixed(1))} buses per hour${intervalMinutes ? ` (approximately every ${Math.round(intervalMinutes)} minutes)` : ''}` : 'No scheduled buses during the defined assessment period'
  });
}

export function derivePrincipalLocations(calls, { maximum = 7 } = {}) {
  const clean = (calls ?? []).map((call, index) => ({
    index,
    name: text(call?.name),
    locality: text(call?.locality || call?.localityQualifier || call?.parentLocality),
    major: /(?:bus|coach|rail(?:way)?|metro) station|town centre|city centre|hospital|airport|university|interchange|shopping centre/i.test(text(call?.name))
  })).filter(call => call.name);
  if (clean.length <= 2) return [];
  const endpoints = new Set([clean[0].name.toLowerCase(), clean.at(-1).name.toLowerCase()]);
  const chosen = [];
  const add = value => { if (value && !endpoints.has(value.toLowerCase()) && !chosen.some(item => item.toLowerCase() === value.toLowerCase())) chosen.push(value); };
  clean.slice(1, -1).filter(call => call.major).forEach(call => add(call.name));
  let previousLocality = text(clean[0].locality).toLowerCase();
  for (const call of clean.slice(1, -1)) {
    const locality = call.locality;
    if (locality && locality.toLowerCase() !== previousLocality) add(locality);
    if (locality) previousLocality = locality.toLowerCase();
  }
  if (chosen.length < 2) [0.25, 0.5, 0.75].forEach(position => add(clean[Math.round((clean.length - 1) * position)]?.name));
  return chosen.slice(0, Math.max(1, Number(maximum) || 7));
}

function mergeDepartures(records, stopIds) {
  const merged = Object.fromEntries(DAY_ORDER.map(day => [day, []]));
  for (const record of records) {
    for (const stopId of stopIds) {
      const schedule = record.stopSchedules?.[stopId];
      if (!schedule) continue;
      for (const day of DAY_ORDER) merged[day].push(...(schedule[day] ?? []));
    }
  }
  for (const day of DAY_ORDER) merged[day] = numeric(merged[day]);
  return merged;
}

function materialQualification(note) {
  return note && !GENERIC_QUALIFICATION_PATTERNS.some(pattern => pattern.test(note));
}

export function collectServiceWarnings(serviceRecords = []) {
  const qualifications = unique(serviceRecords.flatMap(record => record.qualifications ?? []));
  const warnings = [];
  if (qualifications.some(note => /date-specific exceptions/i.test(note))) warnings.push('Some timetables contain date-specific changes. Check the assessment date before formal use.');
  if (serviceRecords.some(record => (record.scheduleIntegrityWarnings ?? []).length)) warnings.push('One or more timetable records contained duplicate or invalid chronology evidence; the affected values were retained only after deterministic integrity checks.');
  return warnings;
}

function directionGroupKey(service) {
  const explicit = text(service?.source?.directionId);
  if (/^[01]$/.test(explicit)) return `gtfs:${explicit}`;
  const match = text(service?.id).match(/:([01]):[0-9a-f]{12}$/i);
  if (match) return `gtfs:${match[1]}`;
  return `headsign:${normal(service?.direction || service?.destination || service?.origin)}`;
}

function recordActivity(record, stopIds) {
  let total = 0;
  for (const stopId of stopIds) {
    const schedule = record.stopSchedules?.[stopId];
    if (!schedule) continue;
    for (const day of DAY_ORDER) total += (schedule[day] ?? []).length;
  }
  return total;
}

function serviceStopDirection(stop) {
  if (!stop) return null;
  const indicator = compassDirection(stop.indicator);
  const direction = compassDirection(stop.direction);
  if (indicator || direction) return indicator || direction;
  if (text(stop.direction)) return displayStopDirection(stop);
  return null;
}

function selectedStopDirectionKey(stop) {
  return normal(serviceStopDirection(stop));
}

function representativeStop(stops, records) {
  const supporting = (stops ?? []).filter(stop => records.some(record => {
    const schedule = record.stopSchedules?.[text(stop.id || stop.sourceId)];
    return hasScheduledEvidence(schedule);
  }));
  return [...supporting].sort((a, b) => {
    const walkingA = a.walking?.status === 'routed' ? Number(a.walking.distanceMetres) : Number.POSITIVE_INFINITY;
    const walkingB = b.walking?.status === 'routed' ? Number(b.walking.distanceMetres) : Number.POSITIVE_INFINITY;
    const validWalkingA = Number.isFinite(walkingA), validWalkingB = Number.isFinite(walkingB);
    if (validWalkingA !== validWalkingB) return validWalkingA ? -1 : 1;
    if (validWalkingA && walkingA !== walkingB) return walkingA - walkingB;
    const distanceA = Number(a.distanceMetres), distanceB = Number(b.distanceMetres);
    const validDistanceA = Number.isFinite(distanceA), validDistanceB = Number.isFinite(distanceB);
    if (validDistanceA !== validDistanceB) return validDistanceA ? -1 : 1;
    if (validDistanceA && distanceA !== distanceB) return distanceA - distanceB;
    return text(a.id || a.sourceId).localeCompare(text(b.id || b.sourceId));
  })[0] || null;
}

function representativeRecord(records, stopIds) {
  return [...records].sort((a, b) => {
    const patternDifference = (b.routePatternStopIds?.length ?? 0) - (a.routePatternStopIds?.length ?? 0);
    if (patternDifference) return patternDifference;
    const locationDifference = (b.principalLocations?.length ?? 0) - (a.principalLocations?.length ?? 0);
    if (locationDifference) return locationDifference;
    const activityDifference = recordActivity(b, stopIds) - recordActivity(a, stopIds);
    if (activityDifference) return activityDifference;
    return `${text(a.origin)}|${text(a.destination)}`.localeCompare(`${text(b.origin)}|${text(b.destination)}`);
  })[0];
}

export function buildServiceSummaries(stops, serviceRecords) {
  const preparedRecords = deduplicateServiceRecords(serviceRecords);
  const selectedIds = new Set((stops ?? []).map(stop => text(stop.id || stop.sourceId)).filter(Boolean));
  const selectedStopsById = new Map((stops ?? []).map(stop => [text(stop.id || stop.sourceId), stop]));
  const groups = new Map();
  for (const service of preparedRecords) {
    const relevantStops = Object.entries(service.stopSchedules ?? {})
      .filter(([id, schedule]) => selectedIds.has(id) && hasScheduledEvidence(schedule))
      .map(([id]) => id);
    if (!relevantStops.length) continue;
    const stopDirections = unique(relevantStops.map(id => selectedStopDirectionKey(selectedStopsById.get(id))).filter(Boolean)).sort().join(',');
    const directionKey = directionGroupKey(service);
    const terminiKey = `${service.origin}|${service.destination}`;
    const identity = [service.routeNumber, service.operator, directionKey, terminiKey, stopDirections].map(value => text(value).toLowerCase()).join('|');
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push({ ...service, relevantStops });
  }
  const summaries = [...groups.values()].map(records => {
    const stopIds = unique(records.flatMap(record => record.relevantStops));
    const first = representativeRecord(records, stopIds);
    const identity = [first.routeNumber, first.operator, directionGroupKey(first), first.origin, first.destination].map(value => text(value).toLowerCase()).join('|');
    const frequencyStop = representativeStop(stops, records);
    const frequencyBasisStopId = text(frequencyStop?.id || frequencyStop?.sourceId) || stopIds[0] || null;
    const departuresByDay = mergeDepartures(records, frequencyBasisStopId ? [frequencyBasisStopId] : stopIds);
    const periods = calculateOperatingPeriods(departuresByDay);
    const frequencyEvidence = records.flatMap(record => (record.frequencyEvidence ?? [])
      .filter(item => !item.stopPointId || item.stopPointId === frequencyBasisStopId)
      .map(item => ({ ...item, source: item.source || record.timetableSource || record.source?.provider || null })));
    const frequencyByDay = Object.freeze(Object.fromEntries(DAY_ORDER.map(day => [day, calculateTypicalServiceFrequency(departuresByDay[day], { day, frequencyEvidence })])));
    const frequencyRepresentativeDay = representativeDay(departuresByDay);
    const typicalFrequency = frequencyRepresentativeDay
      ? frequencyByDay[frequencyRepresentativeDay]
      : Object.freeze({ day: null, dayLabel: null, departureCount: 0, basis: 'unavailable', classification: 'unavailable', noService: true, busesPerHour: null, intervalMinutes: null, valueText: 'Frequency unavailable', wording: 'Frequency unavailable' });
    const notes = unique(records.flatMap(record => record.qualifications ?? []))
      .filter(materialQualification)
      .filter(note => qualificationAppliesToFinalRow(note, departuresByDay));
    const endpointPatterns = unique(records.map(record => `${text(record.origin)} → ${text(record.destination)}`));
    if (endpointPatterns.length > 1) notes.push('Includes scheduled short workings or route variants in this direction; the main origin/destination shown is the most extensive pattern in the source timetable.');
    if (records.some(record => record.circular)) notes.push('Circular service pattern; the displayed origin and destination are the timetable pattern endpoints.');
    if (!DAY_ORDER.some(day => periods[day])) notes.push('No scheduled departures are available for the prepared representative week.');
    if (!text(first.operator) || /not supplied/i.test(text(first.operator))) notes.push('The timetable did not supply a reliable operator name.');
    const principalLocations = unique(records.flatMap(record => record.principalLocations ?? []));
    const assessedStops = stopIds.map(id => selectedStopsById.get(id)).filter(Boolean);
    const stopLabel = stop => [text(stop?.name), text(stop?.indicator)].filter(Boolean).join(' — ') || text(stop?.id || stop?.sourceId);
    const servedAtStops = unique(assessedStops.map(stopLabel)).sort((a, b) => a.localeCompare(b));
    const frequencyStopLabel = stopLabel(frequencyStop) || 'selected stop';
    const companionStops = servedAtStops.filter(label => label !== frequencyStopLabel);
    const commonNames = unique(assessedStops.map(stop => text(stop?.name)));
    const stopContext = companionStops.length
      ? (commonNames.length === 1
        ? `Served at: ${commonNames[0]} (Stops ${assessedStops.map(stop => text(stop?.indicator || stop?.id || stop?.sourceId)).filter(Boolean).join(', ')})`
        : `Served at: ${frequencyStopLabel} (Stops ${companionStops.join(', ')})`)
      : null;
    const integrityWarnings = unique(records.flatMap(record => record.scheduleIntegrityWarnings ?? []));
    if (integrityWarnings.length) notes.push(`Schedule integrity note: ${integrityWarnings.join(' ')}`);
    return Object.freeze({
      id: identity,
      routeNumber: text(first.routeNumber) || 'Not supplied',
      operator: text(first.operator) || 'Operator not supplied in the timetable',
      origin: text(first.origin) || 'Origin not supplied',
      destination: text(first.destination) || 'Destination not supplied',
      direction: text(first.direction),
      stopDirection: serviceStopDirection(frequencyStop),
      stopDirectionEvidenceId: frequencyBasisStopId,
      circular: records.some(record => record.circular),
      principalLocations,
      directionFamily: directionGroupKey(first),
      routePatternStopIds: Object.freeze([...(first.routePatternStopIds ?? [])]),
      routePatternExtent: Math.max(0, ...records.map(record => Array.isArray(record.routePatternStopIds) ? record.routePatternStopIds.length : 0)),
      recordActivity: Math.max(0, ...records.map(record => recordActivity(record, stopIds))),
      operatingPeriods: periods,
      operatingPeriodLines: formatOperatingPeriod(periods),
      frequencyByDay,
      typicalFrequencyLines: formatTypicalFrequency(frequencyByDay),
      typicalFrequency,
      typicalFrequencyText: formatTypicalFrequency(frequencyByDay).join('\n'),
      frequencyBasisStopId,
      frequencyBasisStopName: text(frequencyStop?.name) || null,
      servedAtStops: Object.freeze(servedAtStops),
      assessedStops: Object.freeze(assessedStops.map(stop => text(stop.id || stop.sourceId))),
      stopContext,
      frequencyEvidenceSource: unique(records.map(record => record.timetableSource || record.source?.provider)).join(' + ') || null,
      frequencyRepresentativeDay,
      frequencyEvidence: Object.freeze(frequencyEvidence),
      serviceNote: unique(notes).join(' '),
      stopIds,
      sourceRecordIds: unique(records.map(record => record.id)),
      departuresByDay,
      validity: Object.freeze({ from: unique(records.map(record => record.validFrom)).sort()[0] || null, to: unique(records.map(record => record.validTo)).sort().at(-1) || null })
    });
  });
  return buildServicePresentation(summaries);
}

function presentationText(value) {
  return normal(value);
}

function sameLocations(first = [], second = []) {
  const left = first.map(presentationText).filter(Boolean);
  const right = second.map(presentationText).filter(Boolean);
  return left.length === right.length && left.every(value => right.includes(value));
}

function isSubset(first = [], second = []) {
  const right = new Set(second.map(presentationText).filter(Boolean));
  return first.map(presentationText).filter(Boolean).every(value => right.has(value));
}

function strictSubsequence(shorter = [], longer = []) {
  if (!shorter.length || shorter.length >= longer.length) return false;
  let cursor = 0;
  for (const value of shorter) {
    const index = longer.indexOf(value, cursor);
    if (index < 0) return false;
    cursor = index + 1;
  }
  return true;
}

function provenPatternRelationship(candidate, main) {
  const candidateFamily = text(candidate?.directionFamily);
  const mainFamily = text(main?.directionFamily);
  if (candidateFamily && mainFamily && candidateFamily === mainFamily) return true;
  const candidatePattern = (candidate?.routePatternStopIds ?? []).map(text).filter(Boolean);
  const mainPattern = (main?.routePatternStopIds ?? []).map(text).filter(Boolean);
  return Boolean(candidatePattern.length && mainPattern.length
    && (strictSubsequence(candidatePattern, mainPattern) || strictSubsequence(mainPattern, candidatePattern)));
}

function comparePresentationRank(first, second) {
  return (second.routePatternExtent ?? second.routePatternStopIds?.length ?? 0) - (first.routePatternExtent ?? first.routePatternStopIds?.length ?? 0)
    || (second.principalLocations?.length ?? 0) - (first.principalLocations?.length ?? 0)
    || (second.recordActivity ?? 0) - (first.recordActivity ?? 0)
    || `${text(first.origin)}|${text(first.destination)}|${text(first.id)}`.localeCompare(`${text(second.origin)}|${text(second.destination)}|${text(second.id)}`);
}

function serviceFamilyKey(service) {
  return [text(service?.routeNumber).toLowerCase(), text(service?.operator).toLowerCase(), text(service?.directionFamily || service?.direction || service?.destination || service?.origin).toLowerCase()].join('|');
}

function routeLabel(service) {
  return text(service?.routeNumber) || 'the main service';
}

function independentPrincipalLocationsText(service) {
  const pattern = Array.isArray(service?.routePatternStopIds)
    ? service.routePatternStopIds.map(text).filter(Boolean)
    : [];
  const extent = service?.routePatternExtent;
  const extentConfirmsTwoStops = extent === undefined || extent === null || Number(extent) === 2;
  return pattern.length === 2 && extentConfirmsTwoStops
    ? 'Route endpoints only'
    : 'See route origin / destination';
}

function finalPrincipalLocationsText(service, main) {
  const locations = service?.principalLocations ?? [];
  if (!main || !provenPatternRelationship(service, main)) return locations.length ? locations.join(', ') : independentPrincipalLocationsText(service);
  if (sameLocations(locations, main.principalLocations)) return `As main ${routeLabel(main)} service`;

  const candidateNames = locations.map(presentationText).filter(Boolean);
  const mainNames = (main.principalLocations ?? []).map(presentationText).filter(Boolean);
  const candidateIsShorter = strictSubsequence(
    (service.routePatternStopIds ?? []).map(text).filter(Boolean),
    (main.routePatternStopIds ?? []).map(text).filter(Boolean)
  );
  if (candidateIsShorter && (!locations.length || isSubset(locations, main.principalLocations))) return `Short working of main ${routeLabel(main)} service`;
  if (isSubset(main.principalLocations, locations)) {
    const additions = locations.filter((location, index) => !mainNames.includes(candidateNames[index])).map(text).filter(Boolean);
    if (additions.length && additions.length <= 3) return `As main ${routeLabel(main)} service, plus ${additions.join(', ')}`;
  }
  return locations.length ? locations.join(', ') : `Short working of main ${routeLabel(main)} service`;
}

/**
 * One deterministic decision for the planner-facing Bus service table.
 * It retains the authoritative principalLocations array and only adds
 * presentation metadata; it does not infer or rewrite source evidence.
 */
export function buildServicePresentation(serviceSummaries = []) {
  const routeFamilies = new Map();
  for (const service of serviceSummaries ?? []) {
    const routeKey = serviceFamilyKey(service).split('|').slice(0, 2).join('|');
    const directionKey = text(service?.directionFamily || service?.direction || service?.destination || service?.origin).toLowerCase();
    if (!routeFamilies.has(routeKey)) routeFamilies.set(routeKey, new Map());
    const families = routeFamilies.get(routeKey);
    if (!families.has(directionKey)) families.set(directionKey, []);
    families.get(directionKey).push(service);
  }
  const presented = [];
  for (const families of routeFamilies.values()) {
    const components = [...families.values()].map(members => [...members]);
    for (let index = 0; index < components.length; index += 1) {
      for (let other = index + 1; other < components.length; other += 1) {
        if (!components[index].some(first => components[other].some(second => provenPatternRelationship(first, second)))) continue;
        components[index].push(...components[other]);
        components.splice(other, 1);
        other -= 1;
      }
    }
    for (const component of components) {
      const ranked = component.sort(comparePresentationRank);
      const main = ranked[0];
      ranked.forEach((service, index) => {
        const relationshipMain = index === 0 ? null : (provenPatternRelationship(service, main) ? main : null);
        const principalLocationsText = finalPrincipalLocationsText(service, relationshipMain);
        presented.push(Object.freeze({
          ...service,
          presentation: Object.freeze({
            rank: index,
            familyKey: serviceFamilyKey(main),
            mainServiceId: relationshipMain?.id ?? null,
            principalLocationsText
          }),
          principalLocationsDisplay: principalLocationsText
        }));
      });
    }
  }
  return presented.sort((a, b) => {
    const route = text(a.routeNumber).localeCompare(text(b.routeNumber), undefined, { numeric: true });
    if (route) return route;
    const operator = text(a.operator).localeCompare(text(b.operator));
    if (operator) return operator;
    const family = text(a.presentation?.familyKey || a.directionFamily || a.direction || a.destination || a.origin).localeCompare(text(b.presentation?.familyKey || b.directionFamily || b.direction || b.destination || b.origin));
    if (family) return family;
    return (a.presentation?.rank ?? 0) - (b.presentation?.rank ?? 0)
      || `${text(a.origin)}|${text(a.destination)}|${text(a.id)}`.localeCompare(`${text(b.origin)}|${text(b.destination)}|${text(b.id)}`);
  });
}

function dayLabel(day) { return DAY_LABELS[day] || text(day); }

function dayShortLabel(day) { return DAY_SHORT_LABELS[day] || text(day); }

function intervals(values) {
  const ordered = numeric(values);
  return ordered.slice(1).map((value, index) => value - ordered[index]).filter(value => value > 0);
}

function deterministicFrequencyBand(evidence, day) {
  const bands = (evidence ?? []).filter(item => !item.day || item.day === day)
    .map(item => ({
      periodType: text(item.periodType),
      fromMinute: Number(item.fromMinute),
      toMinute: Number(item.toMinute),
      lowestFrequency: Number(item.lowestFrequency),
      highestFrequency: Number(item.highestFrequency)
    }))
    .filter(item => item.periodType === 'FrequencyMinutes'
      && Number.isFinite(item.lowestFrequency) && item.lowestFrequency > 0
      && Number.isFinite(item.highestFrequency) && item.highestFrequency >= item.lowestFrequency
      && (!Number.isFinite(item.fromMinute) || !Number.isFinite(item.toMinute) || item.toMinute > item.fromMinute));
  const uniqueBands = [...new Map(bands.map(item => [JSON.stringify(item), item])).values()];
  if (!uniqueBands.length) return null;
  const lowestFrequency = Math.min(...uniqueBands.map(item => item.lowestFrequency));
  const highestFrequency = Math.max(...uniqueBands.map(item => item.highestFrequency));
  return { ...uniqueBands[0], lowestFrequency, highestFrequency, bandCount: uniqueBands.length };
}

export function formatServiceOriginDestination(service, separator = ' - ') {
  const origin = text(service?.origin) || 'Origin not supplied';
  const destination = text(service?.destination) || 'Destination not supplied';
  const base = `${origin}${separator}${destination}${service?.circular && service?.direction ? ` (${service.direction})` : ''}`;
  const directed = service?.stopDirection ? `${base} (${service.stopDirection})` : base;
  return service?.stopContext ? `${directed}; ${service.stopContext}` : directed;
}

/** Shared planner-facing frequency rule; no synthetic departures are created. */
export function calculateTypicalServiceFrequency(departures, { day, label = '', frequencyEvidence = [] } = {}) {
  const scheduled = numeric(departures);
  const band = deterministicFrequencyBand(frequencyEvidence, day);
  const dayText = dayLabel(day);
  if (band) {
    const busesPerHour = 60 / ((band.lowestFrequency + band.highestFrequency) / 2);
    const valueText = band.lowestFrequency === band.highestFrequency
      ? `Every ${band.lowestFrequency} mins`
      : `Every ${band.lowestFrequency}–${band.highestFrequency} mins`;
    return Object.freeze({ day, dayLabel: dayText, departureCount: scheduled.length, basis: 'frequency-band', classification: 'regular-frequency', noService: false, busesPerHour: Number(busesPerHour.toFixed(2)), intervalMinutes: band.lowestFrequency === band.highestFrequency ? band.lowestFrequency : null, intervalRange: Object.freeze([band.lowestFrequency, band.highestFrequency]), valueText, wording: `${dayText}: ${valueText}` });
  }
  if (!scheduled.length) return Object.freeze({ day, dayLabel: dayText, departureCount: 0, basis: 'scheduled', classification: 'no-service', noService: true, busesPerHour: null, intervalMinutes: null, valueText: 'No scheduled service', wording: `${dayText}: No scheduled service` });
  if (scheduled.length <= LIMITED_SERVICE_JOURNEY_THRESHOLD) {
    const valueText = `${scheduled.length} journey${scheduled.length === 1 ? '' : 's'}/day`;
    return Object.freeze({ day, dayLabel: dayText, departureCount: scheduled.length, basis: 'scheduled', classification: 'journeys-per-day', noService: false, busesPerHour: null, intervalMinutes: null, valueText, wording: `${dayText}: ${valueText}` });
  }
  const gaps = intervals(scheduled);
  const orderedGaps = gaps.slice().sort((a, b) => a - b);
  const median = orderedGaps.length
    ? (orderedGaps.length % 2 ? orderedGaps[Math.floor(orderedGaps.length / 2)] : (orderedGaps[orderedGaps.length / 2 - 1] + orderedGaps[orderedGaps.length / 2]) / 2)
    : null;
  const regular = median != null && gaps.every(gap => Math.abs(gap - median) <= Math.max(1, median * REGULARITY_INTERVAL_TOLERANCE));
  if (!regular) {
    const valueText = `${scheduled.length} scheduled journeys/day (irregular)`;
    return Object.freeze({ day, dayLabel: dayText, departureCount: scheduled.length, basis: 'scheduled', classification: 'irregular', noService: false, busesPerHour: null, intervalMinutes: null, valueText, wording: `${dayText}: ${valueText}` });
  }
  const roundedMedian = Math.round(median);
  const frequency = calculateScheduledFrequency(scheduled, { startMinute: scheduled[0], endMinute: scheduled.at(-1) + roundedMedian, label });
  const valueText = `Every ~${roundedMedian} mins`;
  return Object.freeze({ day, dayLabel: dayText, departureCount: scheduled.length, basis: 'scheduled', classification: 'regular-frequency', noService: false, busesPerHour: frequency.busesPerHour, intervalMinutes: roundedMedian, valueText, wording: `${dayText}: ${valueText}` });
}

function frequencyEquivalenceKey(result) {
  if (result?.basis === 'frequency-band') return JSON.stringify([result.basis, result.valueText, result.noService === true]);
  return JSON.stringify([
    result?.basis ?? null,
    result?.classification ?? null,
    result?.departureCount ?? null,
    result?.busesPerHour ?? null,
    result?.intervalMinutes ?? null,
    result?.noService === true
  ]);
}

export function formatTypicalFrequency(frequencyByDay = {}) {
  const lines = [];
  let start = 0;
  while (start < DAY_ORDER.length) {
    let end = start;
    while (end + 1 < DAY_ORDER.length && frequencyEquivalenceKey(frequencyByDay[DAY_ORDER[end]]) === frequencyEquivalenceKey(frequencyByDay[DAY_ORDER[end + 1]])) end += 1;
    const firstDay = DAY_ORDER[start];
    const lastDay = DAY_ORDER[end];
    const label = start === end ? dayShortLabel(firstDay) : `${dayShortLabel(firstDay)}-${dayShortLabel(lastDay)}`;
    const result = frequencyByDay[firstDay];
    lines.push(`${label}: ${result?.valueText || 'Frequency unavailable'}`);
    start = end + 1;
  }
  return lines;
}

function qualificationAppliesToFinalRow(note, departuresByDay = {}) {
  const representedDays = DAY_ORDER.filter(day => numeric(departuresByDay[day] ?? []).length);
  if (/limited service|no more than three scheduled journeys/i.test(note)) {
    return representedDays.length > 0 && representedDays.every(day => numeric(departuresByDay[day] ?? []).length <= 3);
  }
  if (/weekday-only service/i.test(note)) {
    return representedDays.length > 0 && !representedDays.some(day => day === 'saturday' || day === 'sunday');
  }
  return true;
}

function representativeDay(departuresByDay = {}) { return REPRESENTATIVE_DAY_ORDER.find(day => numeric(departuresByDay[day] ?? []).length) || null; }

function compassDirection(value) {
  const raw = text(value);
  if (!raw) return null;
  const word = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const words = {
    northbound: 'Northbound', southbound: 'Southbound', eastbound: 'Eastbound', westbound: 'Westbound',
    'north bound': 'Northbound', 'south bound': 'Southbound', 'east bound': 'Eastbound', 'west bound': 'Westbound',
    northeastbound: 'Northeastbound', northwestbound: 'Northwestbound', southeastbound: 'Southeastbound', southwestbound: 'Southwestbound'
  };
  if (words[word]) return words[word];
  const compact = raw.toUpperCase().replace(/\s+/g, '').replace(/^-*>/, '');
  const points = { N: 'Northbound', S: 'Southbound', E: 'Eastbound', W: 'Westbound', NE: 'Northeastbound', NW: 'Northwestbound', SE: 'Southeastbound', SW: 'Southwestbound' };
  return points[compact] || null;
}

export function displayStopDirection(stop = {}) {
  const indicator = text(stop.indicator);
  const direction = text(stop.direction);
  const indicatorCompass = compassDirection(indicator);
  const directionCompass = compassDirection(direction);
  if (indicator && !indicatorCompass) return directionCompass ? `${indicator} (${directionCompass})` : indicator;
  if (indicatorCompass) return indicatorCompass;
  if (directionCompass) return directionCompass;
  if (direction) return /^towards\b/i.test(direction) ? direction : `Towards ${direction}`;
  return 'Direction not supplied';
}

export function groupStopsForPresentation(stops) {
  return (stops ?? []).map(stop => Object.freeze({
    ...stop,
    presentationKey: text(stop.id || stop.sourceId),
    displayDirection: displayStopDirection(stop)
  }));
}

function stopDistanceMetres(first, second) {
  const lat1 = Number(first?.latitude), lon1 = Number(first?.longitude), lat2 = Number(second?.latitude), lon2 = Number(second?.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const radians = value => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1), dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function localityKey(stop) {
  return normal(stop?.locality || stop?.parentLocality);
}

function hubCore(name) {
  return normal(name).replace(/\b(?:bus|coach|station|interchange|transport|stop|stand|bay)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function sameLogicalStopGroup(anchor, candidate, maximumSeparationMetres) {
  const separation = stopDistanceMetres(anchor, candidate);
  if (separation > maximumSeparationMetres) return false;
  const anchorName = normal(anchor.name);
  const candidateName = normal(candidate.name);
  if (anchorName && anchorName === candidateName) return true;

  if (!HUB_PATTERN.test(text(anchor.name)) || !HUB_PATTERN.test(text(candidate.name))) return false;
  const anchorLocality = localityKey(anchor), candidateLocality = localityKey(candidate);
  if (anchorLocality && candidateLocality && anchorLocality === candidateLocality) return true;
  const firstCore = hubCore(anchor.name), secondCore = hubCore(candidate.name);
  return Boolean(firstCore && secondCore && (firstCore === secondCore || firstCore.includes(secondCore) || secondCore.includes(firstCore)));
}

export function selectNearestStopGroup(stops, { maximumSeparationMetres = 350 } = {}) {
  const candidates = (stops ?? []).filter(stop => stop?.walking?.status === 'routed' && Number.isFinite(Number(stop.walking.distanceMetres)));
  if (!candidates.length) return Object.freeze({
    ok: false,
    code: 'walking_route_unavailable',
    message: 'Walking routes could not be checked, so ATLAS did not choose a nearest bus stop group.',
    stops: Object.freeze([])
  });
  const anchor = [...candidates].sort((a, b) => Number(a.walking.distanceMetres) - Number(b.walking.distanceMetres) || text(a.id).localeCompare(text(b.id)))[0];
  const members = (stops ?? []).filter(stop => sameLogicalStopGroup(anchor, stop, maximumSeparationMetres))
    .sort((a, b) => (Number(a.walking?.distanceMetres) || Number.POSITIVE_INFINITY) - (Number(b.walking?.distanceMetres) || Number.POSITIVE_INFINITY) || text(a.id).localeCompare(text(b.id)));
  return Object.freeze({
    ok: true,
    anchor,
    stops: Object.freeze(members),
    groupName: text(anchor.name),
    basis: 'Nearest routed walking stop; associated stop records selected by matching the authoritative stop CommonName, with a controlled interchange/locality fallback and spatial sanity check.'
  });
}

export function buildControlledBusWording(serviceSummaries, { nearestGroupName = null } = {}) {
  const services = serviceSummaries ?? [];
  if (!services.length) return 'No verified bus-service wording is available for the confirmed assessment point.';
  const routes = unique(services.map(service => service.routeNumber));
  const locations = unique(services.flatMap(service => service.principalLocations)).slice(0, 8);
  const routeWords = routes.length === 1 ? `bus route ${routes[0]}` : `bus routes ${routes.join(', ')}`;
  const nearestLead = nearestGroupName ? `The nearest assessed bus stop group is ${nearestGroupName}. ` : '';
  return `${nearestLead}The assessed stop${nearestGroupName ? ' group is' : 's are'} served by ${routeWords}${locations.length ? `, providing direct connections along the verified service patterns to ${locations.join(', ')}` : ''}. Timetable periods and any material qualifications are shown in the Bus Service Summary.`;
}

export { DAY_ORDER };
