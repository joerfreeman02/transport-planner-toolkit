import {
  DAY_ORDER,
  LIMITED_SERVICE_JOURNEY_THRESHOLD,
  calculateOperatingPeriods,
  calculateTypicalServiceFrequency,
  formatOperatingPeriod,
  formatTypicalFrequency,
  formatServiceOriginDestination
} from './bus-service-assessment.mjs';
import { calendarProfileLabel, calendarProfilesMutuallyExclusive } from './service-calendar.mjs';

export const PLANNER_METHODOLOGY_NOTE = 'Typical frequencies and operating periods are derived from one de-duplicated scheduled-departure population at the representative stop. Additional timetable variants may operate. Detailed source evidence is retained within the ATLAS assessment workspace.';

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

function sourceDirectionMarker(value) {
  return /^(?:inbound|outbound|northbound|southbound|eastbound|westbound|clockwise|anticlockwise|north|south|east|west)$/i.test(text(value));
}

function explicitPattern(service) { return (service?.routePatternStopIds ?? []).map(text).filter(Boolean); }
function orderedPatternNames(service) {
  const named = Array.isArray(service?.routePatternStops)
    ? service.routePatternStops.map(stop => text(stop?.name ?? stop?.commonName)).filter(Boolean)
    : Array.isArray(service?.routePatternStopNames) ? service.routePatternStopNames.map(text).filter(Boolean) : [];
  return named;
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
  if (calendarProfilesMutuallyExclusive(first, second)) return false;
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
    const explicitEntries = hasEvidence && Array.isArray(evidence[day]) ? evidence[day] : null;
    const scopedEntries = explicitEntries && explicitEntries.some(item => text(item?.stopPointId))
      ? explicitEntries.filter(item => text(item?.stopPointId) === representativeId)
      : explicitEntries;
    const entries = scopedEntries?.length ? scopedEntries : (service?.departuresByDay?.[day] ?? []);
    return entries.map(item => {
      const minute = Number(item?.minute ?? item?.departureMinute ?? item?.time ?? item);
      if (!Number.isFinite(minute)) return null;
      return { day, minute, stopPointId: text(item?.stopPointId) || representativeId, journeyIdentity: departureIdentity(item) || null, provider: text(item?.provider || service?.timetableSource || service?.source?.provider) || null, sourceRecordId: text(item?.sourceRecordId || service?.id) || null, routeNumber: text(item?.routeNumber || service?.routeNumber), direction: text(item?.direction || service?.direction || service?.destination || service?.origin), origin: text(item?.origin || service?.origin), destination: text(item?.destination || service?.destination), calendarProfileId: text(item?.calendarProfileId || service?.calendarProfileId || service?.source?.calendarProfileId) || null };
    }).filter(Boolean);
  });
}

function semanticDepartureKey(entry) {
  return [entry.routeNumber, entry.direction, entry.origin, entry.destination, entry.stopPointId, entry.day, entry.minute, entry.calendarProfileId].map(normal).join('|');
}

function deduplicateDepartureEntries(entries) {
  const bySemantic = new Map();
  const byStrongIdentity = new Map();
  const output = [];
  const ordered = entries.slice().sort((first, second) => DAY_ORDER.indexOf(first.day) - DAY_ORDER.indexOf(second.day) || first.minute - second.minute || (departureIdentity(first) ? 0 : 1) - (departureIdentity(second) ? 0 : 1) || semanticDepartureKey(first).localeCompare(semanticDepartureKey(second)));
  for (const entry of ordered) {
    const semantic = semanticDepartureKey(entry);
    const existing = bySemantic.get(semantic) ?? [];
    const identity = departureIdentity(entry);
    const strongKey = identity ? [entry.routeNumber, identity, entry.stopPointId, entry.day, entry.minute, entry.calendarProfileId].map(normal).join('|') : null;
    const provider = normal(entry.provider) || 'provider-unspecified';
    const identityEntries = strongKey ? (byStrongIdentity.get(strongKey) ?? []) : [];
    const duplicate = strongKey
      ? identityEntries.some(candidate => (normal(candidate.provider) || 'provider-unspecified') === provider || semanticDepartureKey(candidate) === semantic)
      : existing.length > 0;
    if (duplicate) continue;
    if (strongKey) {
      identityEntries.push(entry);
      byStrongIdentity.set(strongKey, identityEntries);
    }
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
  return Number(resolvedPlannerDestination(second)) - Number(resolvedPlannerDestination(first))
    || canonicalCount(second, representativeId) - canonicalCount(first, representativeId)
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
  const destination = text(service?.destination);
  const direction = plannerDirection(service);
  if (service?.circular) {
    const names = orderedPatternNames(service);
    const target = destination && !sourceDirectionMarker(destination) && !/^(?:destination not supplied|destination not resolved)$/i.test(destination)
      ? destination
      : names[0] || '';
    const anchor = unique([...names, ...(service?.principalLocations ?? [])]).find(name => normal(name) !== normal(target) && normal(name) !== normal(service?.origin));
    let value = target && anchor ? `Circular — ${target} via ${anchor}` : '';
    if (!value && names.length > 1 && normal(names[0]) === normal(names.at(-1))) value = `Circular — starts/ends at ${names[0]}`;
    if (!value) value = 'Circular service';
    return direction ? `${value} (${direction})` : value;
  }
  const locality = text(service?.destinationLocality || service?.destinationLocalityName || service?.destinationQualifier);
  const target = destination && !/^(?:destination not supplied|destination not resolved)$/i.test(destination)
    ? destination
    : direction && !sourceDirectionMarker(direction) ? direction : '';
  if (!target || sourceDirectionMarker(target)) return 'Destination not resolved';
  return locality && normal(locality) !== normal(target) ? `Towards ${target} (${locality})` : `Towards ${target}`;
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
  if (/school[- ]?days?.*non[- ]school|non[- ]school.*school[- ]?days?/i.test(value)) return 'Timetable varies between school and non-school days.';
  if (/non[- ]school|school holidays?/i.test(value)) return 'Non-school days only.';
  if (/school[- ]?days?(?:[- ]only)?|schooldays?/i.test(value)) return 'School days only.';
  if (/term[- ]time|term[- ]only/i.test(value)) return 'Term-time service.';
  if (/circular service/i.test(value)) return 'Circular service.';
  if (/^Includes scheduled short workings or route variants/i.test(value)) return null;
  if (/^(?:Schedule integrity note:|TfL supplied|ATLAS retained|source (?:evidence|processing)|representative stop.*(?:evidence|frequency)|(?:frequency|operating[- ]period).*evidence|timetable evidence.*(?:derived|retained)|full tfl route origin|the timetable did not supply|tfl route metadata|the scheduled evidence is retained|limited service:\s*no more than three scheduled journeys)/i.test(value)) return null;
  return value;
}

function noteAppliesToCanonicalPopulation(note, schedules) {
  const representedDays = DAY_ORDER.filter(day => (schedules[day] ?? []).length);
  if (/limited service|no more than three scheduled journeys/i.test(note)) return representedDays.length > 0 && representedDays.every(day => (schedules[day] ?? []).length <= 3);
  if (/weekday-only service/i.test(note)) return representedDays.length > 0 && !representedDays.some(day => day === 'saturday' || day === 'sunday');
  if (!/non[- ]school/i.test(note) && /school\s*days?/i.test(note) && representedDays.some(day => day === 'saturday' || day === 'sunday')) return false;
  return true;
}

function variantNote(component) {
  const endpoints = unique(component.map(service => text(service.origin) + ' → ' + text(service.destination)));
  const patterns = unique(component.map(service => explicitPattern(service).map(text).join('>')).filter(Boolean));
  const journeyIdentitySets = component.map(service => new Set(DAY_ORDER.flatMap(day => (service.departureEvidenceByDay?.[day] ?? []).map(item => departureIdentity(item)).filter(Boolean))));
  const sharedJourneyIdentity = journeyIdentitySets.length > 1 && journeyIdentitySets.every(set => set.size) && [...journeyIdentitySets[0]].some(identity => journeyIdentitySets.every(set => set.has(identity)));
  const hasVariant = component.length > 1 && ((endpoints.length > 1 && !sharedJourneyIdentity) || patterns.length > 1 || component.some(service => Number(service.patternVariantCount) > 1));
  return hasVariant ? 'Additional timetable variants and short workings operate; some journeys serve different destinations and operate at different times.' : null;
}

function resolvedPlannerDestination(service) {
  const destination = text(service?.destination);
  const direction = plannerDirection(service);
  return Boolean(destination && !/^(?:destination not supplied|destination not resolved)$/i.test(destination) && !sourceDirectionMarker(destination))
    || Boolean(direction && !sourceDirectionMarker(direction));
}

export function plannerSourceWarning(service) {
  const route = text(service?.routeNumber) || 'Unknown route';
  const warnings = [];
  if (!resolvedPlannerDestination(service)) warnings.push(`Route ${route} — one timetable pattern could not be assigned a complete route identity. The scheduled evidence is retained under Detailed Evidence and is not presented as a separate planner service.`);
  if (!text(service?.operator) || /not supplied/i.test(text(service?.operator))) warnings.push(`Route ${route} — operator identity was not deterministically supplied for one timetable pattern. The source evidence is retained under Detailed Evidence.`);
  return warnings;
}

function principalText(main) {
  const locations = unique(main?.principalLocations ?? []);
  return locations.length ? locations.join(', ') : 'See route origin / destination';
}

function profileLines(lines, profileLabel) {
  if (!profileLabel) return lines;
  return lines.map(line => line.replace(/^([^:]+):\s*/, `$1 (${profileLabel}): `));
}

function buildPlannerRow(component, stops, componentIndex) {
  const representative = selectRepresentativeStop(component, stops);
  const main = [...component].sort((first, second) => compareMain(first, second, representative.id))[0];
  const canonical = canonicalDeparturePopulation(component, representative.id, main);
  const evidence = frequencyEvidence(canonical.eligible.length ? canonical.eligible : [main], representative.id);
  const calculationEvidence = canonical.eligible.length <= 1 || canonical.eligible.every(service => (service.frequencyEvidence ?? []).some(item => !item.stopPointId || text(item.stopPointId) === representative.id)) ? evidence : [];
  const periods = calculateOperatingPeriods(canonical.schedules);
  const frequencyByDay = Object.freeze(Object.fromEntries(DAY_ORDER.map(day => [day, calculateTypicalServiceFrequency(canonical.schedules[day], { day, frequencyEvidence: calculationEvidence })])));
  const calendarProfileId = unique(component.map(service => text(service.calendarProfileId || service.source?.calendarProfileId))).find(Boolean) || null;
  const calendarProfile = calendarProfileLabel(calendarProfileId);
    const notes = unique(component.flatMap(service => text(service.serviceNote).split(/(?<=[.!?])\s+(?=[A-Z])/u).map(materialServiceNote).filter(Boolean))).filter(note => noteAppliesToCanonicalPopulation(note, canonical.schedules));
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
    calendarProfileId,
    calendarProfileLabel: calendarProfile,
    directionFamily: directionKey(main),
    directionPatternText: directionPatternText(main),
    servedAtStopId: representative.id,
    servedAtText: servedAtText(representative),
    frequencyBasisStopId: representative.id,
    frequencyBasisStopName: representative.name,
    principalLocations: Object.freeze(principalLocations),
    principalLocationsText: principalText(main),
    typicalFrequency: frequencyByDay[DAY_ORDER.find(day => !frequencyByDay[day].noService) ?? 'monday'],
    typicalFrequencyLines: Object.freeze(profileLines(formatTypicalFrequency(frequencyByDay), calendarProfile)),
    typicalFrequencyText: profileLines(formatTypicalFrequency(frequencyByDay), calendarProfile).join('\n'),
    frequencyByDay,
    operatingPeriods: periods,
    operatingPeriodLines: Object.freeze(profileLines(formatOperatingPeriod(periods), calendarProfile)),
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
    routePatternStops: Object.freeze([...(main.routePatternStops ?? [])]),
    recordActivity: Math.max(0, ...component.map(service => Number(service.recordActivity) || 0)),
    presentation: Object.freeze({ principalLocationsText: principalText(main), rank: 0 }),
    rawServiceSummaries: Object.freeze(component),
    sourceSelection: canonical.eligible.length ? 'representative-stop scheduled evidence' : 'representative-stop summary fallback',
    routeVariantNote: variantNote(component),
    sourceWarnings: Object.freeze(unique(component.flatMap(service => service.sourceWarnings ?? [])))
  };
  return Object.freeze(row);
}

function attachRouteNotes(rows) {
  const groups = new Map();
  rows.forEach((row, index) => { if (!groups.has(row.routeGroupKey)) groups.set(row.routeGroupKey, []); groups.get(row.routeGroupKey).push({ row, index }); });
  const notesFor = row => unique(text(row.serviceNote).split(/(?<=[.!?])\s+(?=[A-Z])/u).map(materialServiceNote).filter(Boolean));
  const sharedTaxonomy = new Set(['School days only.', 'Term-time service.', 'Non-school days only.', 'Circular service.']);
  const updates = new Map();
  for (const group of groups.values()) {
    const rowNotes = group.map(({ row }) => notesFor(row));
    const shared = [...sharedTaxonomy].filter(note => rowNotes.length > 1 && rowNotes.every(notes => notes.includes(note)));
    const hasVariant = group.some(({ row }) => row.routeVariantNote);
    const routeNotes = [...shared];
    if (hasVariant) {
      const route = text(group[0].row.routeNumber) || 'Not supplied';
      const patternLabel = group.length > 1 ? 'main directional timetable patterns' : 'main timetable pattern';
      routeNotes.push(`Route ${route} — ${patternLabel} shown above. Additional variants and short workings operate; some journeys use different destinations or times.`);
    }
    group.forEach(({ row, index }, position) => {
      const remainingNotes = notesFor(row).filter(note => !shared.includes(note));
      updates.set(index, { serviceNote: remainingNotes.join(' '), routeGroupNote: position === group.length - 1 ? routeNotes.join(' ') || null : null });
    });
  }
  return rows.map((row, index) => Object.freeze({ ...row, ...(updates.get(index) ?? { routeGroupNote: null }) }));
}

export function buildPlannerBusServiceSummaries(serviceSummaries = [], stops = []) {
  const grouped = new Map();
  const sourceRecords = serviceSummaries ?? [];
  for (const service of sourceRecords) {
    const duplicateOperatorRecord = (!text(service.operator) || /not supplied/i.test(text(service.operator)))
      && sourceRecords.some(candidate => candidate !== service && text(candidate.routeNumber) === text(service.routeNumber) && text(candidate.operator) && !/not supplied/i.test(text(candidate.operator)) && compatibleDirection(candidate, service));
    if (duplicateOperatorRecord) continue;
    const key = routeGroupKey(service);
    if (!grouped.has(key)) grouped.set(key, []);
    const groups = grouped.get(key);
    const existing = groups.find(component => component.every(member => compatibleDirection(member, service)));
    if (existing) existing.push(service);
    else groups.push([service]);
  }
  const rows = [];
  for (const components of grouped.values()) components.forEach((component, index) => {
    const row = buildPlannerRow(component, stops, index);
    if (resolvedPlannerDestination(row)) rows.push(row);
  });
  const sorted = rows.sort((first, second) => text(first.routeNumber).localeCompare(text(second.routeNumber), undefined, { numeric: true })
    || text(first.operator).localeCompare(text(second.operator))
    || text(first.directionPatternText).localeCompare(text(second.directionPatternText))
    || text(first.id).localeCompare(text(second.id)));
  return attachRouteNotes(sorted);
}

export const buildPlannerBusServiceSummary = buildPlannerBusServiceSummaries;
export { directionPatternText, servedAtText, formatServiceOriginDestination };
