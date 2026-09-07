const DAYS = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

function text(value) { return String(value ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim(); }
function first(source, tag, fallback = '') {
  const match = String(source ?? '').match(new RegExp(`<[^>]*${tag}[^>]*>([\\s\\S]*?)</[^>]*${tag}>`, 'i'));
  return match ? text(match[1].replace(/<[^>]+>/g, '')) : fallback;
}
function blocks(source, tag) { return [...String(source ?? '').matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi'))].map(match => match[0]); }
function attr(source, name) { return (String(source ?? '').match(new RegExp(`\\b${name}="([^"]+)"`, 'i')) || [])[1] || ''; }
function minutes(value) {
  const match = text(value).match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]) + Math.round(Number(match[3] || 0) / 60);
}
function seconds(value) {
  const match = text(value).match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!match) return null;
  return Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0);
}
function dayNames(block) {
  const lower = text(block).toLowerCase();
  if (/mondaytosunday|monday.to.sunday/.test(lower)) return [...DAYS];
  if (/mondaytosaturday|monday.to.saturday/.test(lower)) return DAYS.slice(0, 6);
  if (/mondaytofriday|monday.to.friday/.test(lower)) return DAYS.slice(0, 5);
  if (/weekend/.test(lower)) return DAYS.slice(5);
  return DAYS.filter(day => new RegExp(`<${day}>|\\b${day}\\b`, 'i').test(block));
}

export function parseTndsTransXchange(xml, { region = null, sourceArchive = null, preparedAt = new Date().toISOString() } = {}) {
  const source = String(xml ?? '');
  if (!/<TransXChange\b/i.test(source) || !/SchemaVersion\s*=\s*"2\.5"/i.test(source)) throw new Error('TNDS XML is not TransXChange schema 2.5.');
  const operatorBlock = blocks(source, 'Operator')[0] || '';
  const operator = first(operatorBlock, 'TradingName') || first(operatorBlock, 'OperatorShortName') || first(operatorBlock, 'OperatorName');
  const operatorCode = first(operatorBlock, 'OperatorCode') || attr(operatorBlock, 'id');
  const serviceBlocks = blocks(source, 'Service');
  if (serviceBlocks.length > 1) throw new Error('TNDS XML contains multiple Service records; deterministic single-service preparation is not safe.');
  const serviceBlock = serviceBlocks[0] || source;
  const serviceCode = first(serviceBlock, 'ServiceCode') || attr(serviceBlock, 'id');
  const routeNumber = first(serviceBlock, 'LineName') || first(serviceBlock, 'Line') || first(serviceBlock, 'PrivateCode');
  const description = first(serviceBlock, 'Description');
  const operating = blocks(serviceBlock, 'OperatingPeriod')[0] || blocks(source, 'OperatingPeriod')[0] || '';
  const validFrom = first(operating, 'StartDate') || null;
  const validTo = first(operating, 'EndDate') || null;
  const stops = blocks(source, 'AnnotatedStopPointRef').map(block => ({ id: first(block, 'StopPointRef'), name: first(block, 'CommonName'), indicator: first(block, 'Indicator'), locality: first(block, 'LocalityName'), localityQualifier: first(block, 'LocalityQualifier') })).filter(stop => stop.id);
  const stopSchedules = Object.fromEntries(stops.map(stop => [stop.id, Object.fromEntries(DAYS.map(day => [day, []]))]));
  const sections = new Map(blocks(source, 'JourneyPatternSection').map(section => [attr(section, 'id'), section]));
  const sectionTiming = section => blocks(section, 'JourneyPatternTimingLink').map(link => {
    const from = first(blocks(link, 'From')[0] || '', 'StopPointRef');
    const to = first(blocks(link, 'To')[0] || '', 'StopPointRef');
    const runTime = seconds(first(link, 'RunTime'));
    const waitTime = seconds(first(link, 'WaitTime')) || 0;
    return { from, to, runTime, waitTime };
  }).filter(link => link.from && link.to);
  const patterns = blocks(source, 'JourneyPattern');
  const patternById = new Map(patterns.map(pattern => {
    const sectionIds = first(pattern, 'JourneyPatternSectionRefs').split(/\s+/).filter(Boolean);
    const links = sectionIds.flatMap(sectionId => sectionTiming(sections.get(sectionId) || ''));
    const stopIds = links.length ? [links[0].from, ...links.map(link => link.to)] : [];
    const offsets = new Map([[stopIds[0], 0]]);
    let elapsed = 0;
    for (const link of links) {
      if (link.runTime == null) throw new Error(`TNDS journey pattern ${attr(pattern, 'id') || 'unknown'} lacks a complete RunTime sequence.`);
      elapsed += link.runTime + link.waitTime;
      offsets.set(link.to, elapsed);
    }
    return [attr(pattern, 'id'), { direction: first(pattern, 'Direction'), destination: first(pattern, 'DestinationDisplay'), routeRef: first(pattern, 'RouteRef') || attr(pattern, 'RouteRef'), stopIds: [...new Set(stopIds)], offsets }];
  }));
  const journeys = blocks(source, 'VehicleJourney');
  for (const journey of journeys) {
    const pattern = patternById.get(first(journey, 'JourneyPatternRef')) || {};
    const departure = minutes(first(journey, 'DepartureTime'));
    if (departure == null) continue;
    const profile = blocks(journey, 'OperatingProfile')[0] || blocks(serviceBlock, 'OperatingProfile')[0] || '';
    const patternStopIds = pattern.stopIds?.length ? pattern.stopIds : stops.map(stop => stop.id);
    if (pattern.stopIds?.length && pattern.stopIds.length > 1 && pattern.offsets.size !== pattern.stopIds.length) throw new Error(`TNDS journey pattern ${first(journey, 'JourneyPatternRef') || 'unknown'} has incomplete stop timing.`);
    for (const day of dayNames(profile)) for (const stopId of patternStopIds) if (stopSchedules[stopId]) {
      const offset = pattern.offsets?.get(stopId) ?? 0;
      stopSchedules[stopId][day].push(departure + Math.round(offset / 60));
    }
  }
  return Object.freeze({ id: `tnds:${serviceCode || routeNumber}:${sourceArchive || 'xml'}`, routeNumber: text(routeNumber), operator: text(operator) || 'Operator not supplied', origin: first(serviceBlock, 'Origin') || first(serviceBlock, 'StandardService'), destination: first(serviceBlock, 'Destination'), direction: text(patternById.values().next().value?.direction), description, validFrom, validTo, stopSchedules, stops, source: { type: 'TNDS', region, archive: sourceArchive, serviceCode, operatorCode, schemaVersion: '2.5', preparedAt } });
}

export { DAYS };
