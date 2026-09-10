import {
  DAY_ORDER,
  calculateOperatingPeriods,
  calculateTypicalServiceFrequency,
  formatOperatingPeriod,
  formatTypicalFrequency,
  formatServiceOriginDestination
} from './bus-service-assessment.mjs';

export const PLANNER_METHODOLOGY_NOTE = 'Typical frequencies and operating periods are derived from scheduled departures at the representative stop. Additional timetable variants may operate; detailed source evidence is available under Show detailed evidence.';

function text(value) { return String(value ?? '').trim(); }
function normal(value) { return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
function unique(values) { return [...new Set((values ?? []).map(text).filter(Boolean))]; }
function numeric(values) { return unique(values).map(Number).filter(Number.isFinite).sort((a, b) => a - b); }
function stopId(stop) { return text(stop?.id || stop?.sourceId); }
function scheduleCount(schedule = {}) { return DAY_ORDER.reduce((total, day) => total + numeric(schedule?.[day] ?? []).length, 0); }
function emptySchedule() { return Object.fromEntries(DAY_ORDER.map(day => [day, []])); }

function directionKey(service) {
  const family = text(service?.directionFamily);
  if (family) return family.toLowerCase();
  const direction = text(service?.direction || service?.stopDirection || service?.destination || service?.origin);
  return normal(direction) || 'direction-not-supplied';
}

function explicitDirectionMarker(service) {
  const family = text(service?.directionFamily).toLowerCase();
  if (family && !/^headsign:/.test(family)) return family;
  const direction = normal(service?.direction || service?.stopDirection);
  if (/^(?:inbound|outbound|northbound|southbound|eastbound|westbound|clockwise|anticlockwise|north|south|east|west)$/.test(direction)) return direction;
  return '';
}

function explicitPattern(service) {
  return unique(service?.routePatternStopIds ?? []);
}

function strictSubsequence(shorter, longer) {
  if (!shorter.length || shorter.length > longer.length) return false;
  let cursor = 0;
  for (const value of shorter) {
    const index = longer.indexOf(value, cursor);
    if (index < 0) return false;
    cursor = index + 1;
  }
  return true;
}

function provenPatternRelationship(first, second) {
  if (Boolean(first?.circular) !== Boolean(second?.circular) && (first?.circular !== undefined || second?.circular !== undefined)) return false;
  const left = explicitPattern(first);
  const right = explicitPattern(second);
  if (!left.length || !right.length) return true;
  return strictSubsequence(left, right) || strictSubsequence(right, left);
}

function compatibleDirection(first, second) {
  const leftMarker = explicitDirectionMarker(first);
  const rightMarker = explicitDirectionMarker(second);
  if (leftMarker && rightMarker) return leftMarker === rightMarker && provenPatternRelationship(first, second);
  const leftPattern = explicitPattern(first);
  const rightPattern = explicitPattern(second);
  if (leftPattern.length && rightPattern.length) return provenPatternRelationship(first, second);
  if (directionKey(first) === directionKey(second)) return true;
  return normal(first?.origin) === normal(second?.origin) && normal(first?.destination) === normal(second?.destination);
}

function groupKey(service) {
  return [
    normal(service?.routeNumber),
    normal(service?.operator),
    service?.circular ? 'circular' : 'linear'
  ].join('|');
}

function candidateStopIds(component) {
  return unique(component.flatMap(service => [
    service.frequencyBasisStopId,
    ...(service.stopIds ?? []),
    ...(service.assessedStops ?? [])
  ]));
}

function stopRank(stop) {
  const walking = stop?.walking?.status === 'routed' ? Number(stop.walking.distanceMetres) : Number.POSITIVE_INFINITY;
  const distance = Number(stop?.distanceMetres);
  return [
    Number.isFinite(walking) ? 0 : 1,
    Number.isFinite(walking) ? walking : Number.POSITIVE_INFINITY,
    Number.isFinite(distance) ? 0 : 1,
    Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY,
    stopId(stop)
  ];
}

function compareStopRank(first, second) {
  const left = stopRank(first);
  const right = stopRank(second);
  for (let index = 0; index < left.length - 1; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.at(-1).localeCompare(right.at(-1));
}

function selectRepresentativeStop(component, stops) {
  const byId = new Map((stops ?? []).map(stop => [stopId(stop), stop]).filter(([id]) => id));
  const candidates = candidateStopIds(component).map(id => byId.get(id)).filter(Boolean);
  const stop = [...candidates].sort(compareStopRank)[0] ?? null;
  const fallbackId = candidateStopIds(component)[0] || null;
  return {
    stop,
    id: stopId(stop) || fallbackId,
    name: text(stop?.name) || text(component.find(service => service.frequencyBasisStopId === fallbackId)?.frequencyBasisStopName) || null
  };
}

function scheduleAtRepresentative(service, representativeId) {
  if (!representativeId) return 0;
  const basis = text(service?.frequencyBasisStopId);
  if (basis && basis !== representativeId) return 0;
  if (!basis && !(service?.stopIds ?? []).map(text).includes(representativeId)) return 0;
  return scheduleCount(service.departuresByDay);
}

function compareMain(first, second, representativeId) {
  return scheduleAtRepresentative(second, representativeId) - scheduleAtRepresentative(first, representativeId)
    || (second.routePatternExtent ?? explicitPattern(second).length) - (first.routePatternExtent ?? explicitPattern(first).length)
    || (second.principalLocations?.length ?? 0) - (first.principalLocations?.length ?? 0)
    || (second.recordActivity ?? 0) - (first.recordActivity ?? 0)
    || (text(first.origin) + '|' + text(first.destination) + '|' + text(first.id)).localeCompare(text(second.origin) + '|' + text(second.destination) + '|' + text(second.id));
}

function mergeSchedules(component, representativeId, main) {
  const eligible = component.filter(service => text(service.frequencyBasisStopId) === representativeId
    || (!text(service.frequencyBasisStopId) && (service.stopIds ?? []).map(text).includes(representativeId)));
  const records = eligible.length ? eligible : [main];
  const merged = emptySchedule();
  for (const service of records) {
    for (const day of DAY_ORDER) merged[day].push(...numeric(service.departuresByDay?.[day] ?? []));
  }
  for (const day of DAY_ORDER) merged[day] = numeric(merged[day]);
  return { schedules: merged, eligible };
}

function frequencyEvidence(component, representativeId) {
  return component.flatMap(service => (service.frequencyEvidence ?? [])
    .filter(item => !item.stopPointId || text(item.stopPointId) === representativeId));
}

function plannerDirection(service) {
  const value = text(service?.stopDirection || service?.direction);
  if (!value || /^(?:gtfs|headsign):/i.test(value)) return '';
  return value;
}

function directionPatternText(service) {
  const origin = text(service?.origin) || 'Origin not supplied';
  const destination = text(service?.destination) || 'Destination not supplied';
  const direction = plannerDirection(service);
  const route = service?.circular ? origin + ' loop' : origin + ' to ' + destination;
  return direction ? direction + ' — ' + route : route;
}

function servedAtText(representative) {
  const stop = representative.stop;
  const name = text(stop?.name) || representative.name || 'Representative stop not supplied';
  const indicator = text(stop?.indicator);
  const distance = stop?.walking?.status === 'routed' ? Number(stop.walking.distanceMetres) : Number(stop?.distanceMetres);
  const suffix = Number.isFinite(distance) ? ' · ' + Math.round(distance).toLocaleString('en-GB') + ' m' : '';
  return name + (indicator ? ' — ' + indicator : '') + suffix;
}

function materialServiceNote(note) {
  const value = text(note);
  if (!value) return null;
  if (/^Includes scheduled short workings or route variants/i.test(value)) return null;
  if (/^(?:Schedule integrity note:|TfL supplied|ATLAS retained|source (?:evidence|processing)|representative stop.*(?:evidence|frequency)|(?:frequency|operating[- ]period).*evidence|timetable evidence.*(?:derived|retained))/i.test(value)) return null;
  return value;
}

function variantNote(component) {
  const endpoints = unique(component.map(service => text(service.origin) + ' → ' + text(service.destination)));
  const patterns = new Set(component.flatMap(explicitPattern));
  const hasVariant = component.length > 1 && (
    endpoints.length > 1
    || patterns.size > 1
    || component.some(service => Number(service.patternVariantCount) > 1)
  );
  if (!hasVariant) return null;
  return 'Additional timetable variants and short workings operate; some journeys serve different destinations and operate at different times.';
}

function principalText(main) {
  const locations = unique(main?.principalLocations ?? []);
  return locations.length ? locations.join(', ') : 'See route origin / destination';
}

function buildPlannerRow(component, stops, componentIndex) {
  const representative = selectRepresentativeStop(component, stops);
  const main = [...component].sort((first, second) => compareMain(first, second, representative.id))[0];
  const merged = mergeSchedules(component, representative.id, main);
  const evidence = frequencyEvidence(merged.eligible.length ? merged.eligible : [main], representative.id);
  const periods = calculateOperatingPeriods(merged.schedules);
  const frequencyByDay = Object.freeze(Object.fromEntries(DAY_ORDER.map(day => [
    day,
    calculateTypicalServiceFrequency(merged.schedules[day], { day, frequencyEvidence: evidence })
  ])));
  const notes = unique(component.flatMap(service => text(service.serviceNote).split(/(?<=[.!?])\s+(?=[A-Z])/u).map(materialServiceNote).filter(Boolean)));
  if (main.circular) notes.push('Circular service pattern; the displayed origin and destination are the timetable pattern endpoints.');
  const extraVariantNote = variantNote(component);
  if (extraVariantNote) notes.push(extraVariantNote);
  const ids = unique(component.flatMap(service => service.sourceRecordIds ?? []));
  const principalLocations = unique(main.principalLocations ?? []);
  const id = 'planner:' + normal(main.routeNumber) + '|' + normal(main.operator) + '|' + directionKey(main) + '|' + (componentIndex + 1);
  return Object.freeze({
    id,
    routeNumber: text(main.routeNumber) || 'Not supplied',
    operator: text(main.operator) || 'Operator not supplied in the timetable',
    origin: text(main.origin) || 'Origin not supplied',
    destination: text(main.destination) || 'Destination not supplied',
    direction: text(main.direction),
    stopDirection: text(main.stopDirection) || null,
    circular: Boolean(main.circular),
    directionFamily: directionKey(main),
    directionPatternText: directionPatternText(main),
    servedAtStopId: representative.id,
    servedAtText: servedAtText(representative),
    frequencyBasisStopId: representative.id,
    frequencyBasisStopName: representative.name,
    principalLocations: Object.freeze(principalLocations),
    principalLocationsText: principalText(main),
    typicalFrequency: frequencyByDay[DAY_ORDER.find(day => !frequencyByDay[day].noService) ?? 'monday'],
    typicalFrequencyLines: Object.freeze(formatTypicalFrequency(frequencyByDay)),
    typicalFrequencyText: formatTypicalFrequency(frequencyByDay).join('\n'),
    frequencyByDay,
    operatingPeriods: periods,
    operatingPeriodLines: Object.freeze(formatOperatingPeriod(periods)),
    departuresByDay: Object.freeze(merged.schedules),
    frequencyEvidence: Object.freeze(evidence),
    serviceNote: unique(notes).join(' '),
    stopIds: Object.freeze(representative.id ? [representative.id] : unique(component.flatMap(service => service.stopIds ?? []))),
    sourceRecordIds: Object.freeze(ids),
    variantCount: component.length,
    variantServiceIds: Object.freeze(unique(component.map(service => service.id))),
    routePatternExtent: Math.max(0, ...component.map(service => Number(service.routePatternExtent) || explicitPattern(service).length)),
    recordActivity: Math.max(0, ...component.map(service => Number(service.recordActivity) || 0)),
    presentation: Object.freeze({ principalLocationsText: principalText(main), rank: 0 }),
    rawServiceSummaries: Object.freeze(component),
    sourceSelection: merged.eligible.length ? 'representative-stop scheduled evidence' : 'representative-stop summary fallback'
  });
}

export function buildPlannerBusServiceSummaries(serviceSummaries = [], stops = []) {
  const grouped = new Map();
  for (const service of serviceSummaries ?? []) {
    const key = groupKey(service);
    if (!grouped.has(key)) grouped.set(key, []);
    const groups = grouped.get(key);
    const existing = groups.find(component => component.some(member => compatibleDirection(member, service)));
    if (existing) existing.push(service);
    else groups.push([service]);
  }
  const rows = [];
  for (const components of grouped.values()) {
    components.forEach((component, index) => rows.push(buildPlannerRow(component, stops, index)));
  }
  return rows.sort((first, second) => text(first.routeNumber).localeCompare(text(second.routeNumber), undefined, { numeric: true })
    || text(first.operator).localeCompare(text(second.operator))
    || text(first.directionPatternText).localeCompare(text(second.directionPatternText))
    || text(first.id).localeCompare(text(second.id)));
}

export const buildPlannerBusServiceSummary = buildPlannerBusServiceSummaries;
export { directionPatternText, servedAtText, formatServiceOriginDestination };
