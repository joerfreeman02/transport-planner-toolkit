const DAY_ORDER = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const DAY_LABELS = Object.freeze({ monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' });

function text(value) { return String(value ?? '').trim(); }
function unique(values) { return [...new Set(values.map(text).filter(Boolean))]; }
function numeric(values) { return unique(values).map(Number).filter(Number.isFinite).sort((a, b) => a - b); }

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
    periods[day] = values.length ? Object.freeze({ firstMinute: values[0], lastMinute: values.at(-1), first: formatClock(values[0]), last: formatClock(values.at(-1)), overnight: values.at(-1) >= 1440, departureCount: values.length }) : null;
  }
  return Object.freeze(periods);
}

function samePeriod(a, b) {
  if (!a || !b) return a === b;
  return a.firstMinute === b.firstMinute && a.lastMinute === b.lastMinute;
}

export function formatOperatingPeriod(periods) {
  const weekday = DAY_ORDER.slice(0, 5).map(day => periods?.[day]);
  const lines = [];
  if (weekday.every(value => samePeriod(value, weekday[0]))) lines.push(`Mon-Fri: ${weekday[0] ? `Approx. ${weekday[0].first}-${weekday[0].last}` : 'No scheduled service'}`);
  else DAY_ORDER.slice(0, 5).forEach((day, index) => lines.push(`${DAY_LABELS[day]}: ${weekday[index] ? `Approx. ${weekday[index].first}-${weekday[index].last}` : 'No scheduled service'}`));
  for (const day of ['saturday', 'sunday']) {
    const value = periods?.[day];
    lines.push(`${DAY_LABELS[day]}: ${value ? `Approx. ${value.first}-${value.last}` : 'No scheduled service'}`);
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
  if (chosen.length < 2) {
    [0.25, 0.5, 0.75].forEach(position => add(clean[Math.round((clean.length - 1) * position)]?.name));
  }
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

export function buildServiceSummaries(stops, serviceRecords) {
  const selectedIds = new Set((stops ?? []).map(stop => text(stop.id || stop.sourceId)).filter(Boolean));
  const groups = new Map();
  for (const service of serviceRecords ?? []) {
    const relevantStops = Object.keys(service.stopSchedules ?? {}).filter(id => selectedIds.has(id));
    if (!relevantStops.length) continue;
    const identity = [service.routeNumber, service.operator, service.origin, service.destination, service.direction].map(value => text(value).toLowerCase()).join('|');
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push({ ...service, relevantStops });
  }
  return [...groups.values()].map(records => {
    const first = records[0];
    const identity = [first.routeNumber, first.operator, first.origin, first.destination, first.direction].map(value => text(value).toLowerCase()).join('|');
    const stopIds = unique(records.flatMap(record => record.relevantStops));
    const departuresByDay = mergeDepartures(records, stopIds);
    const periods = calculateOperatingPeriods(departuresByDay);
    const notes = unique(records.flatMap(record => record.qualifications ?? []));
    if (records.length > 1 && !notes.some(note => /variant|route patterns/i.test(note))) notes.push(`${records.length} scheduled route patterns serve the selected stops; source records remain available in Sources and checks.`);
    if (!periods.saturday && !periods.sunday && !notes.some(note => /weekday-only|no (?:scheduled )?weekend/i.test(note))) notes.push('No scheduled weekend service is shown in the prepared timetable week.');
    if (DAY_ORDER.some(day => periods[day]?.overnight)) notes.push('Some journeys continue after midnight.');
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

export function groupStopsForPresentation(stops) {
  return (stops ?? []).map(stop => Object.freeze({
    ...stop,
    presentationKey: text(stop.id || stop.sourceId),
    displayDirection: unique([stop.indicator, stop.direction]).join(' - ') || 'Direction not supplied'
  }));
}

export function buildControlledBusWording(serviceSummaries) {
  const services = serviceSummaries ?? [];
  if (!services.length) return 'No verified bus-service wording is available for the confirmed assessment point.';
  const routes = unique(services.map(service => service.routeNumber));
  const locations = unique(services.flatMap(service => service.principalLocations)).slice(0, 8);
  const routeWords = routes.length === 1 ? `bus route ${routes[0]}` : `bus routes ${routes.join(', ')}`;
  return `The site is served by ${routeWords} from the assessed nearby stops${locations.length ? `, providing direct connections along the verified service patterns to ${locations.join(', ')}` : ''}. Timetable periods and any material qualifications are shown in the Bus Service Summary.`;
}

export { DAY_ORDER };
