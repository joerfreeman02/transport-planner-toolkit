const DAY_ORDER = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const DAY_LABELS = Object.freeze({ monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' });
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
  return `Approx. ${period.first}–${period.last}${period.overnight ? ' (next day)' : ''}`;
}

export function formatOperatingPeriod(periods) {
  const weekday = DAY_ORDER.slice(0, 5).map(day => periods?.[day]);
  const lines = [];
  if (weekday.every(value => samePeriod(value, weekday[0]))) lines.push(`Mon-Fri: ${periodText(weekday[0])}`);
  else DAY_ORDER.slice(0, 5).forEach((day, index) => lines.push(`${DAY_LABELS[day]}: ${periodText(weekday[index])}`));
  for (const day of ['saturday', 'sunday']) lines.push(`${DAY_LABELS[day]}: ${periodText(periods?.[day])}`);
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
    locality: text(call?.locality || call?.parentLocality),
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

function representativeRecord(records, stopIds) {
  return [...records].sort((a, b) => {
    const locationDifference = (b.principalLocations?.length ?? 0) - (a.principalLocations?.length ?? 0);
    if (locationDifference) return locationDifference;
    const activityDifference = recordActivity(b, stopIds) - recordActivity(a, stopIds);
    if (activityDifference) return activityDifference;
    return `${text(a.origin)}|${text(a.destination)}`.localeCompare(`${text(b.origin)}|${text(b.destination)}`);
  })[0];
}

export function buildServiceSummaries(stops, serviceRecords) {
  const selectedIds = new Set((stops ?? []).map(stop => text(stop.id || stop.sourceId)).filter(Boolean));
  const groups = new Map();
  for (const service of serviceRecords ?? []) {
    const relevantStops = Object.keys(service.stopSchedules ?? {}).filter(id => selectedIds.has(id));
    if (!relevantStops.length) continue;
    const identity = [service.routeNumber, service.operator, directionGroupKey(service)].map(value => text(value).toLowerCase()).join('|');
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push({ ...service, relevantStops });
  }
  return [...groups.values()].map(records => {
    const stopIds = unique(records.flatMap(record => record.relevantStops));
    const first = representativeRecord(records, stopIds);
    const identity = [first.routeNumber, first.operator, directionGroupKey(first)].map(value => text(value).toLowerCase()).join('|');
    const departuresByDay = mergeDepartures(records, stopIds);
    const periods = calculateOperatingPeriods(departuresByDay);
    const notes = unique(records.flatMap(record => record.qualifications ?? [])).filter(materialQualification);
    const endpointPatterns = unique(records.map(record => `${text(record.origin)} → ${text(record.destination)}`));
    if (endpointPatterns.length > 1) notes.push('Includes scheduled short workings or route variants in this direction; the main origin/destination shown is the most extensive pattern in the source timetable.');
    if (records.some(record => record.circular)) notes.push('Circular service pattern; the displayed origin and destination are the timetable pattern endpoints.');
    if (!DAY_ORDER.some(day => periods[day])) notes.push('No scheduled departures are available for the prepared representative week.');
    if (!text(first.operator) || /not supplied/i.test(text(first.operator))) notes.push('The timetable did not supply a reliable operator name.');
    const principalLocations = unique(records.flatMap(record => record.principalLocations ?? []));
    return Object.freeze({
      id: identity,
      routeNumber: text(first.routeNumber) || 'Not supplied',
      operator: text(first.operator) || 'Operator not supplied in the timetable',
      origin: text(first.origin) || 'Origin not supplied',
      destination: text(first.destination) || 'Destination not supplied',
      direction: text(first.direction),
      circular: records.some(record => record.circular),
      principalLocations,
      operatingPeriods: periods,
      operatingPeriodLines: formatOperatingPeriod(periods),
      serviceNote: unique(notes).join(' '),
      stopIds,
      sourceRecordIds: unique(records.map(record => record.id)),
      departuresByDay,
      validity: Object.freeze({ from: unique(records.map(record => record.validFrom)).sort()[0] || null, to: unique(records.map(record => record.validTo)).sort().at(-1) || null })
    });
  }).sort((a, b) => a.routeNumber.localeCompare(b.routeNumber, undefined, { numeric: true }) || a.origin.localeCompare(b.origin));
}

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
