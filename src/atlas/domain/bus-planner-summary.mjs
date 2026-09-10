import {
  DAY_ORDER,
  LIMITED_SERVICE_JOURNEY_THRESHOLD,
  calculateOperatingPeriods,
  calculateTypicalServiceFrequency,
  formatOperatingPeriod,
  formatTypicalFrequency,
  formatServiceOriginDestination
} from './bus-service-assessment.mjs';

export const PLANNER_METHODOLOGY_NOTE = 'Typical frequencies and operating periods are derived from one de-duplicated scheduled-departure population at the representative stop. Additional timetable variants may operate; detailed source evidence is available under Show detailed evidence.';

function text(value) { return String(value ?? '').trim(); }
function normal(value) { return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
function unique(values) { return [...new Set((values ?? []).map(text).filter(Boolean))]; }
function numeric(values) { return unique(values).map(Number).filter(Number.isFinite).sort((a, b) => a - b); }
function stopId(stop) { return text(stop?.id || stop?.sourceId); }
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

function explicitPattern(service) { return unique(service?.routePatternStopIds ?? []); }

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

function routeGroupKey(service) {
  return [normal(service?.routeNumber), normal(service?.operator), service?.circular ? 'circular' : 'linear'].join('|');
}

function candidateStopIds(component) {
  return unique(component.flatMap(service => [service.frequencyBasisStopId, ...(service.stopIds ?? []), ...(service.assessedStops ?? [])]));
}

function stopRank(stop) {
  const walking = stop?.walking?.status === 'routed' ? Number(stop.walking.distanceMetres) : Number.POSITIVE_INFINITY;
  const distance = Number(stop?.distanceMetres);
  return [Number.isFinite(walking) ? 0 : 1, Number.isFinite(walking) ? walking : Number.POSITIVE_INFINITY, Number.isFinite(distance) ? 0 : 1, Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY, stopId(stop)];
}

function compareStopRank(first, second) {
  const left = stopRank(first);
  const right = stopRank(second);
  for (let index = 0; index < left.length - 1; index += 1) if (left[index] !== right[index]) return left[index] - right[index];
  return left.at(-1).localeCompare(right.at(-1));
}

function selectRepresentativeStop(component, stops) {
  const byId = new Map((stops ?? []).map(stop => [stopId(stop), stop]).filter(([id]) => id));
  const ids = candidateStopIds(component);
  const candidates = ids.map(id => byId.get(id)).filter(Boolean);
  const stop = [...candidates].sort(compareStopRank)[0] ?? null;
  const fallbackId = ids[0] || null;
  return { stop, id: stopId(stop) || fallbackId, name: text(stop?.name) || text(component.find(service => service.frequencyBasisStopId === fallbackId)?.frequencyBasisStopName) || null };
}

function serviceAtRepresentative(service, representativeId) {
  if (!representativeId) return false;
  const basis = text(service?.frequencyBasisStopId);
  if (basis) return basis === representativeId;
  return (service?.stopIds ?? []).map(text).includes(representativeId);
}

function departureIdentity(item) {
  return text(item?.journeyIdentity || item?.journeyId || item?.sourceJourneyId || item?.vehicleJourneyCode || item?.tripId || item?.vehicleJourneyId || item?.journeyCode);
}

function serviceDepartureEntries(service, representativeId) {
  if (!serviceAtRepresentative(service, representativeId)) return [];
  const evidence = service?.departureEvidenceByDay;
  const hasEvidence = evidence && DAY_ORDER.some(day => Array.isArray(evidence[day]));
  return DAY_ORDER.flatMap(day => {
    const entries = hasEvidence ? (evidence[day] ?? []) : (service?.departuresByDay?.[day] ?? []);
    return entries.map(item => {
      const minute = Number(item?.minute ?? item?.departureMinute ?? item?.time ?? item);
      if (!Number.isFinite(minute)) return null;
      return { day, minute, stopPointId: representativeId, journeyIdentity: departureIdentity(item) || null, provider: text(item?.provider || service?.timetableSource || service?.source?.provider) || null, sourceRecordId: text(item?.sourceRecordId || service?.id) || null, routeNumber: text(item?.routeNumber || service?.routeNumber), direction: text(item?.direction || service?.direction || service?.destination || service?.origin), origin: text(item?.origin || service?.origin), destination: text(item?.destination || service?.destination) };
    }).filter(Boolean);
  });
}

function semanticDepartureKey(entry) {
  return [entry.routeNumber, entry.direction, entry.origin, entry.destination, entry.stopPointId, entry.day, entry.minute].map(normal).join('|');
}

function deduplicateDepartureEntries(entries) {
  const bySemantic = new Map();
  const output = [];
  const ordered = entries.slice().sort((first, second) => DAY_ORDER.indexOf(first.day) - DAY_ORDER.indexOf(second.day) || first.minute - second.minute || semanticDepartureKey(first).localeCompare(semanticDepartureKey(second)));
  for (const entry of ordered) {
    const semantic = semanticDepartureKey(entry);
    const existing = bySemantic.get(semantic) ?? [];
    const identity = departureIdentity(entry);
    const duplicate = identity ? existing.some(item => departureIdentity(item) === identity || !departureIdentity(item)) : existing.length > 0;
    if (duplicate) continue;
    existing.push(entry);
    bySemantic.set(semantic, existing);
    output.push(entry);
  }
  return output;
}

function canonicalDeparturePopulation(component, representativeId, main) {
  const eligible = component.filter(service => serviceAtRepresentative(service, representativeId));
  const records = eligible.length ? eligible : (main ? [main] : []);
  const entries = deduplicateDepartureEntries(records.flatMap(service => serviceDepartureEntries(service, representativeId)));
  const schedules = emptySchedule();
  for (const entry of entries) schedules[entry.day].push(entry.minute);
  for (const day of DAY_ORDER) schedules[day].sort((first, second) => first - second);
  return { entries, schedules, eligible };
}

function canonicalCount(service, representativeId) {
  return deduplicateDepartureEntries(serviceDepartureEntries(service, representativeId)).length;
}

function compareMain(first, second, representativeId) {
  return canonicalCount(second, representativeId) - canonicalCount(first, representativeId)
    || (second.routePatternExtent ?? explicitPattern(second).length) - (first.routePatternExtent ?? explicitPattern(first).length)
    || (second.principalLocations?.length ?? 0) - (first.principalLocations?.length ?? 0)
    || (second.recordActivity ?? 0) - (first.recordActivity ?? 0)
    || (text(first.origin) + '|' + text(first.destination) + '|' + text(first.id)).localeCompare(text(second.origin) + '|' + text(second.destination) + '|' + text(second.id));
}

function frequencyEvidence(component, representativeId) {
  return component.flatMap(service => (service.frequencyEvidence ?? []).filter(item => !item.stopPointId || text(item.stopPointId) === representativeId));
}

function plannerDirection(service) {
  const value = text(service?.stopDirection || service?.direction);
  if (!value || /^(?:gtfs|headsign):/i.test(value)) return '';
  return value;
}

function directionPatternText(service) {
  const origin = text(service?.origin);
  const destination = text(service?.destination);
  const direction = plannerDirection(service);
  if (service?.circular) return `Circular service${direction ? ` (${direction})` : ''}`;
  const target = destination || (direction && !/^(?:inbound|outbound|northbound|southbound|eastbound|westbound)$/i.test(direction) ? direction : 'destination not supplied');
  if (!target || /^destination not supplied$/i.test(target)) return direction ? `Towards ${direction}` : 'Direction not supplied';
  return origin && normal(origin) !== normal(target) ? `Towards ${target} (${origin})` : `Towards ${target}`;
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

function noteAppliesToCanonicalPopulation(note, schedules) {
  const representedDays = DAY_ORDER.filter(day => (schedules[day] ?? []).length);
  if (/limited service|no more than three scheduled journeys/i.test(note)) return representedDays.length > 0 && representedDays.every(day => (schedules[day] ?? []).length <= 3);
  if (/weekday-only service/i.test(note)) return representedDays.length > 0 && !representedDays.some(day => day === 'saturday' || day === 'sunday');
  return true;
}

function variantNote(component) {
  const endpoints = unique(component.map(service => text(service.origin) + ' → ' + text(service.destination)));
  const patterns = new Set(component.flatMap(explicitPattern));
  const hasVariant = component.length > 1 && (endpoints.length > 1 || patterns.size > 1 || component.some(service => Number(service.patternVariantCount) > 1));
  return hasVariant ? 'Additional timetable variants and short workings operate; some journeys serve different destinations and operate at different times.' : null;
}

function principalText(main) {
  const locations = unique(main?.principalLocations ?? []);
  return locations.length ? locations.join(', ') : 'See route origin / destination';
}

function buildPlannerRow(component, stops, componentIndex) {
  const representative = selectRepresentativeStop(component, stops);
  const main = [...component].sort((first, second) => compareMain(first, second, representative.id))[0];
  const canonical = canonicalDeparturePopulation(component, representative.id, main);
  const evidence = frequencyEvidence(canonical.eligible.length ? canonical.eligible : [main], representative.id);
  const calculationEvidence = canonical.eligible.length <= 1 || canonical.eligible.every(service => (service.frequencyEvidence ?? []).some(item => !item.stopPointId || text(item.stopPointId) === representative.id)) ? evidence : [];
  const periods = calculateOperatingPeriods(canonical.schedules);
  const frequencyByDay = Object.freeze(Object.fromEntries(DAY_ORDER.map(day => [day, calculateTypicalServiceFrequency(canonical.schedules[day], { day, frequencyEvidence: calculationEvidence })])));
  const notes = unique(component.flatMap(service => text(service.serviceNote).split(/(?<=[.!?])\s+(?=[A-Z])/u).map(materialServiceNote).filter(Boolean))).filter(note => noteAppliesToCanonicalPopulation(note, canonical.schedules));
  if (main.circular) notes.push('Circular service pattern; the displayed origin and destination are the timetable pattern endpoints.');
  const ids = unique(component.flatMap(service => service.sourceRecordIds ?? []));
  const principalLocations = unique(main.principalLocations ?? []);
  const row = {
    id: 'planner:' + normal(main.routeNumber) + '|' + normal(main.operator) + '|' + directionKey(main) + '|' + (componentIndex + 1),
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
    departuresByDay: Object.freeze(canonical.schedules),
    canonicalDeparturePopulation: Object.freeze(Object.fromEntries(DAY_ORDER.map(day => [day, Object.freeze(canonical.entries.filter(entry => entry.day === day))]))),
    frequencyEvidence: Object.freeze(evidence),
    serviceNote: unique(notes).join(' '),
    routeGroupKey: routeGroupKey(main),
    stopIds: Object.freeze(representative.id ? [representative.id] : unique(component.flatMap(service => service.stopIds ?? []))),
    sourceRecordIds: Object.freeze(ids),
    variantCount: component.length,
    variantServiceIds: Object.freeze(unique(component.map(service => service.id))),
    routePatternExtent: Math.max(0, ...component.map(service => Number(service.routePatternExtent) || explicitPattern(service).length)),
    recordActivity: Math.max(0, ...component.map(service => Number(service.recordActivity) || 0)),
    presentation: Object.freeze({ principalLocationsText: principalText(main), rank: 0 }),
    rawServiceSummaries: Object.freeze(component),
    sourceSelection: canonical.eligible.length ? 'representative-stop scheduled evidence' : 'representative-stop summary fallback',
    routeVariantNote: variantNote(component)
  };
  return Object.freeze(row);
}

function attachRouteNotes(rows) {
  const notes = new Map();
  for (const row of rows) if (row.routeVariantNote && !notes.has(row.routeGroupKey)) notes.set(row.routeGroupKey, row.routeVariantNote);
  return rows.map(row => Object.freeze({ ...row, routeGroupNote: notes.get(row.routeGroupKey) || null }));
}

export function buildPlannerBusServiceSummaries(serviceSummaries = [], stops = []) {
  const grouped = new Map();
  for (const service of serviceSummaries ?? []) {
    const key = routeGroupKey(service);
    if (!grouped.has(key)) grouped.set(key, []);
    const groups = grouped.get(key);
    const existing = groups.find(component => component.some(member => compatibleDirection(member, service)));
    if (existing) existing.push(service);
    else groups.push([service]);
  }
  const rows = [];
  for (const components of grouped.values()) components.forEach((component, index) => rows.push(buildPlannerRow(component, stops, index)));
  const sorted = rows.sort((first, second) => text(first.routeNumber).localeCompare(text(second.routeNumber), undefined, { numeric: true })
    || text(first.operator).localeCompare(text(second.operator))
    || text(first.directionPatternText).localeCompare(text(second.directionPatternText))
    || text(first.id).localeCompare(text(second.id)));
  return attachRouteNotes(sorted);
}

export const buildPlannerBusServiceSummary = buildPlannerBusServiceSummaries;
export { directionPatternText, servedAtText, formatServiceOriginDestination };
