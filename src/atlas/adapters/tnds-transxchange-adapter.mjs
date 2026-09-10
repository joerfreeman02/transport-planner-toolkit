import { derivePrincipalLocations } from '../domain/bus-service-assessment.mjs';
import { hasScheduledEvidence } from '../domain/scheduled-evidence.mjs';
import { calendarQualificationNotes, createServiceCalendarEvidence } from '../domain/service-calendar.mjs';

const DAYS = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

function text(value) { return String(value ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim(); }
function first(source, tag, fallback = '') {
  const match = String(source ?? '').match(new RegExp(`<[^>]*${tag}[^>]*>([\\s\\S]*?)</[^>]*${tag}>`, 'i'));
  return match ? text(match[1].replace(/<[^>]+>/g, '')) : fallback;
}
function all(source, tag) { return [...String(source ?? '').matchAll(new RegExp(`<[^>]*${tag}[^>]*>([\\s\\S]*?)</[^>]*${tag}>`, 'gi'))].map(match => text(match[1].replace(/<[^>]+>/g, ''))).filter(Boolean); }
function blocks(source, tag) { return [...String(source ?? '').matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi'))].map(match => match[0]); }
function attr(source, name) { return (String(source ?? '').match(new RegExp(`\\b${name}="([^"]+)"`, 'i')) || [])[1] || ''; }
function minutes(value) { const match = text(value).match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?/); return match ? Number(match[1]) * 60 + Number(match[2]) + Math.round(Number(match[3] || 0) / 60) : null; }
function seconds(value) { const match = text(value).match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i); return match ? Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0) : null; }
const DAY_ALIASES = Object.freeze({ monday: 'monday', mon: 'monday', tuesday: 'tuesday', tue: 'tuesday', tues: 'tuesday', wednesday: 'wednesday', wed: 'wednesday', thursday: 'thursday', thu: 'thursday', thur: 'thursday', thurs: 'thursday', friday: 'friday', fri: 'friday', saturday: 'saturday', sat: 'saturday', sunday: 'sunday', sun: 'sunday' });
function dayTokens(value) { return [...new Set(normaliseCalendarText(value).split(/\s+/).map(token => DAY_ALIASES[token]).filter(Boolean))]; }
function normaliseCalendarText(value) { return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
function enabledTag(block, tag) { return new RegExp(`<${tag}(?:\\s[^>]*)?>\\s*(?:true|1|yes)\\s*</${tag}>`, 'i').test(block); }
function firstTagValue(block, tag) { return first(blocks(block, tag)[0] || '', tag); }

function parseOperatingProfile(block, { sourceLabel = null, precedence = null } = {}) {
  const raw = text(block);
  const value = normaliseCalendarText(raw);
  const days = new Set();
  if (enabledTag(block, 'MondayToSunday') || /monday to sunday/.test(value)) DAYS.forEach(day => days.add(day));
  if (enabledTag(block, 'MondayToSaturday') || /monday to saturday/.test(value)) DAYS.slice(0, 6).forEach(day => days.add(day));
  if (enabledTag(block, 'MondayToFriday') || /monday to friday|weekdays?/.test(value)) DAYS.slice(0, 5).forEach(day => days.add(day));
  for (const day of DAYS) if (enabledTag(block, day)) days.add(day);
  for (const field of ['DaysOfOperation', 'OperatingDays', 'DaysOfWeek']) {
    for (const day of dayTokens(firstTagValue(block, field))) days.add(day);
  }
  const nonOperationDays = new Set();
  for (const field of ['DaysOfNonOperation', 'NonOperatingDays']) {
    for (const day of dayTokens(firstTagValue(block, field))) nonOperationDays.add(day);
  }
  for (const day of nonOperationDays) days.delete(day);
  const dayType = firstTagValue(block, 'ServicedOrganisationDayType') || firstTagValue(block, 'DayType') || firstTagValue(block, 'ServiceDayType');
  const qualificationRefs = ['TermTime', 'TermTimeOnly', 'TermTimeOperation', 'SchoolDays', 'SchoolDaysOnly', 'HolidayOnly', 'SchoolHoliday'].flatMap(tag => firstTagValue(block, tag)).join(' ');
  const semantics = [normaliseCalendarText(dayType), normaliseCalendarText(qualificationRefs), value].filter(Boolean).join(' ');
  const schoolDayOnly = /school\s*days?|schooldays?|school\s*term/.test(semantics) && !/non\s*school|nonschool|holiday/.test(semantics);
  const termTimeOnly = /term\s*time|termtime|term\s*only|termonly/.test(semantics);
  const nonSchoolDayOnly = /non\s*school|nonschool|school\s*holiday|schoolholiday|holiday\s*only|holidayonly/.test(semantics);
  const holidayOnly = /holiday\s*only|holidayonly|school\s*holiday|schoolholiday/.test(semantics);
  const specialFields = ['SpecialDaysOperation', 'BankHolidaysOperation', 'OperatingProfileSpecialDay'].filter(field => blocks(block, field).length || new RegExp(`<${field}(?:\\s[^>]*)?\\s*/>`, 'i').test(block));
  const dateExceptions = [...blocks(block, 'SpecialDay').map(value => text(value.replace(/<[^>]+>/g, ''))), ...blocks(block, 'DateException').map(value => text(value.replace(/<[^>]+>/g, '')))].filter(Boolean);
  const complex = Boolean(specialFields.length) && !days.size;
  const resolved = days.size > 0 && !complex;
  const warning = complex
    ? `TNDS ${sourceLabel || 'service'} has an unsupported complex operating profile (${specialFields.join(', ')}); operating days remain unresolved and no timetable days were fabricated.`
    : specialFields.length
      ? `TNDS ${sourceLabel || 'service'} includes special-day operating metadata (${specialFields.join(', ')}); regular-day evidence was retained, but special dates require review.`
      : null;
  return createServiceCalendarEvidence({
    daysOfWeek: DAYS.filter(day => days.has(day)),
    calendarResolved: resolved,
    schoolDayOnly,
    termTimeOnly,
    nonSchoolDayOnly,
    holidayOnly,
    sourceCalendarLabel: dayType || sourceLabel || (raw ? value : null),
    dateExceptions,
    qualificationMetadata: { precedence, specialFields, nonOperationDays: [...nonOperationDays] },
    provenance: { provider: 'TNDS', authority: 'Traveline National Dataset', sourceField: sourceLabel || null },
    resolutionStatus: resolved ? (specialFields.length ? 'partial' : 'resolved') : 'unresolved',
    warnings: warning ? [warning] : []
  });
}

export const parseTndsOperatingProfile = parseOperatingProfile;
function refs(block, tag) { return all(block, tag).flatMap(value => value.split(/\s+/).filter(Boolean)); }
function patternRefs(block) { return [...refs(block, 'JourneyPatternRef'), ...refs(block, 'JourneyPatternRefs')]; }

function resolveOperator(serviceBlock, source, serviceCode) {
  const operators = blocks(source, 'Operator').map(block => ({ id: attr(block, 'id'), code: first(block, 'OperatorCode'), name: first(block, 'TradingName') || first(block, 'OperatorShortName') || first(block, 'OperatorName') }));
  const index = new Map();
  for (const operator of operators) for (const key of [operator.id, operator.code].filter(Boolean)) index.set(key, operator);
  const reference = first(serviceBlock, 'RegisteredOperatorRef') || first(serviceBlock, 'OperatorRef');
  if (reference) {
    const operator = index.get(reference);
    if (!operator) throw new Error(`TNDS service ${serviceCode || 'unknown'} references unknown operator ${reference}.`);
    return operator;
  }
  if (operators.length !== 1) throw new Error(`TNDS service ${serviceCode || 'unknown'} has no unambiguous operator reference.`);
  return operators[0];
}

function patternProfile(pattern, sections) {
  const sectionIds = refs(pattern, 'JourneyPatternSectionRefs');
  const links = sectionIds.flatMap(sectionId => blocks(sections.get(sectionId) || '', 'JourneyPatternTimingLink').map(link => ({
    from: first(blocks(link, 'From')[0] || '', 'StopPointRef'), to: first(blocks(link, 'To')[0] || '', 'StopPointRef'),
    runTime: seconds(first(link, 'RunTime')), waitTime: seconds(first(link, 'WaitTime')) || 0,
  }))).filter(link => link.from && link.to);
  const explicitStopIds = [...new Set([...refs(pattern, 'StopPointRef'), ...sectionIds.flatMap(sectionId => refs(sections.get(sectionId) || '', 'StopPointRef'))])];
  const stopIds = [...new Set(links.length ? [links[0].from, ...links.map(link => link.to)] : explicitStopIds)];
  const offsets = new Map(stopIds.length ? [[stopIds[0], 0]] : []);
  let elapsed = 0;
  for (const link of links) {
    if (link.runTime == null) return { direction: first(pattern, 'Direction'), destination: first(pattern, 'DestinationDisplay'), stopIds: [...new Set(stopIds)], offsets: new Map(), status: 'quarantine', reasonCode: 'incomplete_runtime_sequence', operatingProfile: blocks(pattern, 'OperatingProfile')[0] || '' };
    elapsed += link.runTime + link.waitTime;
    offsets.set(link.to, elapsed);
  }
  return { direction: first(pattern, 'Direction'), origin: first(pattern, 'Origin'), destination: first(pattern, 'DestinationDisplay'), stopIds, offsets, status: links.length ? 'valid' : 'no_timing_links', operatingProfile: blocks(pattern, 'OperatingProfile')[0] || '' };
}

function patternCalls(profile, stops) {
  const byId = new Map(stops.map(stop => [stop.id, stop]));
  return profile.stopIds.map(id => byId.get(id) || { id, name: '', locality: '', localityQualifier: '', parentLocality: '' });
}

function parseService({ source, serviceBlock, serviceBlocks, patternById, journeys, stops, multiService, region, sourceArchive, preparedAt }) {
  const serviceCode = first(serviceBlock, 'ServiceCode') || attr(serviceBlock, 'id');
  const serviceId = attr(serviceBlock, 'id');
  const operator = resolveOperator(serviceBlock, source, serviceCode);
  const servicePatternIds = new Set([...blocks(serviceBlock, 'JourneyPattern').map(pattern => attr(pattern, 'id')).filter(Boolean), ...patternRefs(serviceBlock)]);
  if (!multiService) for (const patternId of patternById.keys()) servicePatternIds.add(patternId);
  const ownerOfPattern = patternRef => serviceBlocks.findIndex(block => {
    const ids = new Set([...blocks(block, 'JourneyPattern').map(pattern => attr(pattern, 'id')).filter(Boolean), ...patternRefs(block)]);
    return patternRef && ids.has(patternRef);
  });
  const assignedJourneys = [];
  for (const journey of journeys) {
    const serviceRef = first(journey, 'ServiceRef');
    const patternRef = first(journey, 'JourneyPatternRef');
    const owner = ownerOfPattern(patternRef);
    const belongsByRef = serviceRef && (serviceRef === serviceCode || serviceRef === serviceId);
    if (serviceRef && !belongsByRef) continue;
    if (belongsByRef && owner >= 0 && serviceBlocks[owner] !== serviceBlock) throw new Error(`TNDS VehicleJourney ${first(journey, 'VehicleJourneyCode') || 'unknown'} has conflicting ServiceRef ${serviceRef} and JourneyPatternRef ${patternRef}.`);
    if (!serviceRef && multiService && owner < 0) throw new Error(`TNDS VehicleJourney ${first(journey, 'VehicleJourneyCode') || 'unknown'} has ambiguous service ownership.`);
    if (!serviceRef && multiService && owner >= 0 && serviceBlocks[owner] !== serviceBlock) continue;
    if (belongsByRef || (!serviceRef && (!multiService || servicePatternIds.has(patternRef)))) { assignedJourneys.push(journey); if (belongsByRef && patternRef) servicePatternIds.add(patternRef); }
  }
  if (multiService && !assignedJourneys.length) throw new Error(`TNDS service ${serviceCode || 'unknown'} has no deterministically associated VehicleJourneys.`);
  const serviceStopIds = new Set();
  const serviceExplicitStopIds = new Set(refs(serviceBlock, 'StopPointRef'));
  const quarantinePatterns = [];
  for (const patternId of servicePatternIds) {
    const profile = patternById.get(patternId);
    if (!profile) continue;
    if (profile.status === 'valid') for (const stopId of profile.stopIds) serviceStopIds.add(stopId);
    if (profile.status === 'quarantine' || (profile.status === 'no_timing_links' && stops.length > 1)) quarantinePatterns.push({ patternId, reasonCode: profile.reasonCode || 'missing_timing_links', affectedStopIds: profile.stopIds.length ? profile.stopIds : [...serviceExplicitStopIds] });
  }
  const quarantineStopIds = new Set(quarantinePatterns.flatMap(pattern => pattern.affectedStopIds));
  if (quarantinePatterns.some(pattern => !pattern.affectedStopIds.length)) throw new Error(`TNDS service ${serviceCode || 'unknown'} has a quarantined journey pattern with no deterministically identifiable affected StopPoint IDs.`);
  if (!serviceStopIds.size && !quarantinePatterns.length) for (const stop of stops) serviceStopIds.add(stop.id);
  const serviceStops = serviceStopIds.size ? stops.filter(stop => serviceStopIds.has(stop.id)) : [];
  const patternVariants = [...servicePatternIds].map(patternId => {
    const profile = patternById.get(patternId);
    if (!profile) return null;
    const calls = profile.status === 'valid' ? patternCalls(profile, stops) : [];
    return { patternId, status: profile.status, reasonCode: profile.reasonCode || null, direction: text(profile.direction), origin: text(profile.origin), destination: text(profile.destination), routePatternStopIds: [...profile.stopIds], routePatternStops: calls.map(call => ({ id: call.id, name: call.name })).filter(call => call.id || call.name), calls, principalLocations: calls.length ? derivePrincipalLocations(calls) : [], operatingProfile: profile.operatingProfile || '' };
  }).filter(Boolean);
  const validVariants = patternVariants.filter(variant => variant.status === 'valid');
  const serviceOrigin = first(serviceBlock, 'Origin') || first(serviceBlock, 'StandardService');
  const serviceDestination = first(serviceBlock, 'Destination');
  const serviceOperatingProfile = blocks(serviceBlock, 'OperatingProfile')[0] || '';
  const baseId = `tnds:${region || 'unknown'}:${sourceArchive || 'xml'}:${serviceCode || 'service'}`;
  const quarantine = quarantinePatterns.length ? { serviceQuarantined: !serviceStopIds.size, affectedStopIds: [...quarantineStopIds], patterns: quarantinePatterns } : null;
  const recordVariants = validVariants.length ? validVariants : (patternVariants.length === 1 ? patternVariants : []);
  const createRecord = variant => {
    const profile = patternById.get(variant.patternId) || {};
    const patternStopIds = variant.status === 'valid' && variant.routePatternStopIds.length ? variant.routePatternStopIds : serviceStops.map(stop => stop.id);
    const patternStops = stops.filter(stop => patternStopIds.includes(stop.id));
    const stopSchedules = Object.fromEntries(patternStops.map(stop => [stop.id, Object.fromEntries(DAYS.map(day => [day, []]))]));
    const calendarEvidence = [];
    const calendarWarnings = [];
    const patternJourneys = assignedJourneys.filter(journey => {
      const journeyPatternRef = first(journey, 'JourneyPatternRef');
      if (journeyPatternRef) return journeyPatternRef === variant.patternId;
      return recordVariants.length === 1;
    });
    for (const journey of patternJourneys) {
      const departure = minutes(first(journey, 'DepartureTime'));
      if (departure == null || variant.status === 'quarantine') continue;
      const profileSource = blocks(journey, 'OperatingProfile')[0]
        || profile.operatingProfile
        || serviceOperatingProfile;
      const calendar = parseOperatingProfile(profileSource, { sourceLabel: firstTagValue(profileSource, 'ServicedOrganisationDayType') || variant.patternId, precedence: blocks(journey, 'OperatingProfile').length ? 'VehicleJourney' : profile.operatingProfile ? 'JourneyPattern' : 'Service' });
      calendarEvidence.push(calendar);
      calendarWarnings.push(...calendar.warnings);
      for (const day of calendar.daysOfWeek) for (const stopId of patternStopIds) if (stopSchedules[stopId]) stopSchedules[stopId][day].push(departure + Math.round((profile.offsets?.get(stopId) ?? 0) / 60));
    }
    for (const schedule of Object.values(stopSchedules)) for (const day of DAYS) schedule[day] = [...new Set(schedule[day])].sort((a, b) => a - b);
    const calls = variant.calls ?? [];
    const origin = variant.origin || (recordVariants.length === 1 ? serviceOrigin : calls[0]?.name || '');
    const destination = variant.destination || (recordVariants.length === 1 ? serviceDestination : calls.at(-1)?.name || '');
    return Object.freeze({
      id: recordVariants.length > 1 ? `${baseId}:pattern:${variant.patternId}` : baseId,
      routeNumber: text(first(serviceBlock, 'LineName') || first(serviceBlock, 'Line') || first(serviceBlock, 'PrivateCode')),
      operator: text(operator.name) || 'Operator not supplied',
      origin,
      destination,
      direction: text(variant.direction),
      principalLocations: [...variant.principalLocations],
      routePatternStopIds: [...variant.routePatternStopIds],
      routePatternStops: [...(variant.routePatternStops ?? [])],
      patternVariants: [variant],
      description: first(serviceBlock, 'Description'),
      validFrom: first(blocks(serviceBlock, 'OperatingPeriod')[0] || blocks(source, 'OperatingPeriod')[0] || '', 'StartDate') || null,
      validTo: first(blocks(serviceBlock, 'OperatingPeriod')[0] || blocks(source, 'OperatingPeriod')[0] || '', 'EndDate') || null,
      stopSchedules,
      calendarEvidence: Object.freeze([...new Map(calendarEvidence.map(item => [JSON.stringify(item), item])).values()]),
      serviceNotes: Object.freeze(calendarQualificationNotes(calendarEvidence)),
      sourceWarnings: Object.freeze([...new Set(calendarWarnings)]),
      stops: patternStops,
      tndsQuarantine: quarantine,
      source: { type: 'TNDS', provider: 'TNDS', region, archive: sourceArchive, serviceCode, operatorCode: operator.code || operator.id, schemaVersion: '2.5', preparedAt, patternIds: [variant.patternId], patternVariantCount: patternVariants.length, patternVariantId: variant.patternId, operatingProfilePrecedence: 'VehicleJourney > JourneyPattern > Service' }
    });
  };
  if (recordVariants.length) {
    const records = recordVariants.map(createRecord);
    const scheduledRecords = records.filter(record => Object.values(record.stopSchedules ?? {}).some(hasScheduledEvidence));
    const unresolvedCalendar = records.some(record => (record.calendarEvidence ?? []).some(calendar => calendar.resolutionStatus === 'unresolved'));
    if (scheduledRecords.length) return scheduledRecords;
    if (quarantine || unresolvedCalendar) return [records[0]];
    return [];
    return [records[0]];
  }
  if (quarantine) {
    const variant = patternVariants[0] || { patternId: [...servicePatternIds][0] || null, status: 'quarantine', reasonCode: 'missing_pattern', direction: '', origin: '', destination: '', routePatternStopIds: [], calls: [], principalLocations: [] };
    return [createRecord({ ...variant, status: 'quarantine', routePatternStopIds: [] })];
  }
  return [];
}

export function parseTndsTransXchangeServices(xml, { region = null, sourceArchive = null, preparedAt = new Date().toISOString() } = {}) {
  const source = String(xml ?? '');
  if (!/<TransXChange\b/i.test(source) || !/SchemaVersion\s*=\s*"2\.5"/i.test(source)) throw new Error('TNDS XML is not TransXChange schema 2.5.');
  const serviceBlocks = blocks(source, 'Service');
  if (!serviceBlocks.length) throw new Error('TNDS XML contains no Service record.');
  const identities = new Set();
  for (const serviceBlock of serviceBlocks) {
    const serviceCode = first(serviceBlock, 'ServiceCode');
    const serviceId = attr(serviceBlock, 'id');
    if (serviceBlocks.length > 1 && !serviceCode && !serviceId) throw new Error('TNDS multi-Service document contains a Service without ServiceCode or Service @id.');
    const identity = serviceCode || serviceId;
    if (identity && identities.has(identity)) throw new Error(`TNDS duplicate Service identity ${identity}.`);
    if (identity) identities.add(identity);
  }
  const stops = blocks(source, 'AnnotatedStopPointRef').map(block => ({ id: first(block, 'StopPointRef'), name: first(block, 'CommonName'), indicator: first(block, 'Indicator'), locality: first(block, 'LocalityName'), localityQualifier: first(block, 'LocalityQualifier'), parentLocality: first(block, 'ParentLocalityName') || first(block, 'ParentLocality') })).filter(stop => stop.id);
  const sections = new Map(blocks(source, 'JourneyPatternSection').map(section => [attr(section, 'id'), section]));
  const patternById = new Map();
  for (const pattern of blocks(source, 'JourneyPattern')) { const id = attr(pattern, 'id'); if (!id) continue; if (patternById.has(id)) throw new Error(`TNDS journey pattern ${id} is defined more than once.`); patternById.set(id, patternProfile(pattern, sections)); }
  const journeys = blocks(source, 'VehicleJourney');
  return Object.freeze(serviceBlocks.flatMap(serviceBlock => parseService({ source, serviceBlock, serviceBlocks, patternById, journeys, stops, multiService: serviceBlocks.length > 1, region, sourceArchive, preparedAt })));
}

export function parseTndsTransXchange(xml, options = {}) {
  if ((String(xml ?? '').match(/<Service(?:\s[^>]*)?>/gi) || []).length > 1) throw new Error('TNDS XML contains multiple Service records; use parseTndsTransXchangeServices for document-level parsing.');
  const services = parseTndsTransXchangeServices(xml, options);
  if (services.length !== 1) throw new Error('TNDS XML contains multiple planner pattern records; use parseTndsTransXchangeServices for pattern-specific preparation.');
  return services[0];
}

export { DAYS };
