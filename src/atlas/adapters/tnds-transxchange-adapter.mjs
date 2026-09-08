import { derivePrincipalLocations } from '../domain/bus-service-assessment.mjs';

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
function dayNames(block) {
  const lower = text(block).toLowerCase();
  if (/mondaytosunday|monday.to.sunday/.test(lower)) return [...DAYS];
  if (/mondaytosaturday|monday.to.saturday/.test(lower)) return DAYS.slice(0, 6);
  if (/mondaytofriday|monday.to.friday/.test(lower)) return DAYS.slice(0, 5);
  if (/weekend/.test(lower)) return DAYS.slice(5);
  return DAYS.filter(day => new RegExp(`<${day}>|\\b${day}\\b`, 'i').test(block));
}
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
    if (link.runTime == null) return { direction: first(pattern, 'Direction'), destination: first(pattern, 'DestinationDisplay'), stopIds: [...new Set(stopIds)], offsets: new Map(), status: 'quarantine', reasonCode: 'incomplete_runtime_sequence' };
    elapsed += link.runTime + link.waitTime;
    offsets.set(link.to, elapsed);
  }
  return { direction: first(pattern, 'Direction'), destination: first(pattern, 'DestinationDisplay'), stopIds, offsets, status: links.length ? 'valid' : 'no_timing_links' };
}

function patternCalls(profile, stops) {
  const byId = new Map(stops.map(stop => [stop.id, stop]));
  return profile.stopIds.map(id => byId.get(id) || { id, name: id, locality: '', localityQualifier: '', parentLocality: '' });
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
  const stopSchedules = Object.fromEntries(serviceStops.map(stop => [stop.id, Object.fromEntries(DAYS.map(day => [day, []]))]));
  for (const journey of assignedJourneys) {
    const patternRef = first(journey, 'JourneyPatternRef');
    const pattern = patternById.get(patternRef) || {};
    if (multiService && !patternRef) throw new Error(`TNDS VehicleJourney ${first(journey, 'VehicleJourneyCode') || 'unknown'} has no JourneyPatternRef for deterministic service assignment.`);
    if (patternRef && !patternById.has(patternRef)) throw new Error(`TNDS VehicleJourney ${first(journey, 'VehicleJourneyCode') || 'unknown'} references unknown JourneyPattern ${patternRef}.`);
    if (pattern.status === 'quarantine' || (pattern.status === 'no_timing_links' && stops.length > 1)) continue;
    const departure = minutes(first(journey, 'DepartureTime'));
    if (departure == null) continue;
    const profile = blocks(journey, 'OperatingProfile')[0] || blocks(serviceBlock, 'OperatingProfile')[0] || '';
    const patternStopIds = pattern.stopIds?.length ? pattern.stopIds : serviceStops.map(stop => stop.id);
    for (const day of dayNames(profile)) for (const stopId of patternStopIds) if (stopSchedules[stopId]) stopSchedules[stopId][day].push(departure + Math.round((pattern.offsets?.get(stopId) ?? 0) / 60));
  }
  const patternVariants = [...servicePatternIds].map(patternId => {
    const profile = patternById.get(patternId);
    if (!profile) return null;
    const calls = profile.status === 'valid' ? patternCalls(profile, stops) : [];
    return { patternId, status: profile.status, reasonCode: profile.reasonCode || null, direction: text(profile.direction), destination: text(profile.destination), routePatternStopIds: [...profile.stopIds], calls, principalLocations: calls.length ? derivePrincipalLocations(calls) : [] };
  }).filter(Boolean);
  const validVariants = patternVariants.filter(variant => variant.status === 'valid');
  const pattern = validVariants.length === 1 ? validVariants[0] : (patternVariants.length === 1 ? patternVariants[0] : {});
  const principalLocations = [...new Set(validVariants.flatMap(variant => variant.principalLocations))];
  return Object.freeze({ id: `tnds:${region || 'unknown'}:${sourceArchive || 'xml'}:${serviceCode || 'service'}`, routeNumber: text(first(serviceBlock, 'LineName') || first(serviceBlock, 'Line') || first(serviceBlock, 'PrivateCode')), operator: text(operator.name) || 'Operator not supplied', origin: first(serviceBlock, 'Origin') || first(serviceBlock, 'StandardService'), destination: first(serviceBlock, 'Destination') || pattern.destination, direction: validVariants.length === 1 || patternVariants.length === 1 ? text(pattern.direction) : '', principalLocations, routePatternStopIds: validVariants.length === 1 ? [...pattern.routePatternStopIds] : [], patternVariants, description: first(serviceBlock, 'Description'), validFrom: first(blocks(serviceBlock, 'OperatingPeriod')[0] || blocks(source, 'OperatingPeriod')[0] || '', 'StartDate') || null, validTo: first(blocks(serviceBlock, 'OperatingPeriod')[0] || blocks(source, 'OperatingPeriod')[0] || '', 'EndDate') || null, stopSchedules, stops: serviceStops, tndsQuarantine: quarantinePatterns.length ? { serviceQuarantined: !serviceStopIds.size, affectedStopIds: [...quarantineStopIds], patterns: quarantinePatterns } : null, source: { type: 'TNDS', region, archive: sourceArchive, serviceCode, operatorCode: operator.code || operator.id, schemaVersion: '2.5', preparedAt, patternIds: [...servicePatternIds], patternVariantCount: patternVariants.length } });
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
  return Object.freeze(serviceBlocks.map(serviceBlock => parseService({ source, serviceBlock, serviceBlocks, patternById, journeys, stops, multiService: serviceBlocks.length > 1, region, sourceArchive, preparedAt })));
}

export function parseTndsTransXchange(xml, options = {}) {
  if ((String(xml ?? '').match(/<Service(?:\s[^>]*)?>/gi) || []).length > 1) throw new Error('TNDS XML contains multiple Service records; use parseTndsTransXchangeServices for document-level parsing.');
  const services = parseTndsTransXchangeServices(xml, options);
  if (services.length !== 1) throw new Error('TNDS XML contains multiple Service records; use parseTndsTransXchangeServices for document-level parsing.');
  return services[0];
}

export { DAYS };
