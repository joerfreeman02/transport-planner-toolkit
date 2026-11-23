const text = value => String(value ?? '').trim();

const routeLabels = topic => (topic?.routes ?? []).map(value => String(value).trim()).filter(Boolean);

function rowsForRoute(context, route) {
  const rows = context?.plannerServiceSummaries ?? context?.serviceSummaries ?? [];
  return rows.filter(row => String(row?.routeNumber ?? '').trim() === String(route)
    || (row?.publicRouteNumbers ?? row?.routeNumbers ?? []).map(String).includes(String(route)));
}

const normal = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function plannerSourceLabel(source) {
  return text(source)
    .replace(/\bBODS\b/gi, 'national operator timetable data')
    .replace(/\bTNDS\b/gi, 'national timetable reference data')
    .replace(/\bTfL\b/gi, 'Transport for London')
    .replace(/\bNaPTAN\b/gi, 'national bus stop records')
    .replace(/\bNPTG\b/gi, 'national locality reference data')
    .replace(/\bOSRM\b/gi, 'street-mapping pedestrian routing')
    .replace(/\bStopPoints?\b/gi, match => /^StopPoint$/i.test(match) ? 'bus stop' : 'bus stops')
    .replace(/\bsource provenance\b/gi, 'where this information came from')
    .replace(/\bendpoint identity\b/gi, 'exact starting or finishing stop')
    .replace(/Department for Transport national bus stop records/gi, 'Department for Transport bus stop records')
    .replace(/Transport for London bus stop and Department for Transport bus stop records/gi, 'Transport for London and Department for Transport bus stop records')
    .replace(/^Department for Transport bus stop records and Transport for London bus stop$/i, 'Department for Transport and Transport for London bus stop records')
    .replace(/\s*\/\s*/g, ' and ')
    .replace(/\s*\+\s*/g, ' and ')
    .replace(/\s+supplementary$/i, ' (supplementary)')
    .replace(/^Department for Transport bus stop records and Transport for London bus stop$/i, 'Department for Transport and Transport for London bus stop records');
}

function stopIdentity(context, id) {
  return (context?.stops ?? []).find(item => String(item?.id ?? item?.stopPointId ?? '') === String(id)) ?? null;
}

function rawStopLabel(stop, context) {
  if (!stop) return 'Bus stop (name and direction not supplied)';
  const name = text(stop.name ?? stop.commonName);
  const displayDirection = text(stop.displayDirection);
  const indicator = text(stop.indicator);
  const compassDirection = text(stop.direction).match(/^(?:north|south|east|west|north ?east|north ?west|south ?east|south ?west)bound$/i)?.[0]
    || displayDirection.match(/((?:north|south|east|west|north ?east|north ?west|south ?east|south ?west)bound)/i)?.[1]
    || '';
  const directionLabel = /^adj$/i.test(indicator)
    ? 'adjacent'
    : /^[A-Z]$/i.test(indicator)
      ? `Stop ${indicator.toUpperCase()}${compassDirection ? ` (${compassDirection.replace(/\s+/g, '')})` : ''}`
      : indicator
        || (displayDirection && !/^direction not supplied$/i.test(displayDirection) ? displayDirection : text(stop.direction));
  const duplicateName = name && (context?.stops ?? []).filter(item => normal(item?.name ?? item?.commonName) === normal(name)).length > 1;
  const locality = text(stop.locality ?? stop.localityName);
  const distinguishingLocality = duplicateName && !directionLabel && locality && normal(locality) !== normal(name) ? locality : '';
  const missingDuplicateDiscriminator = duplicateName && !directionLabel && !distinguishingLocality && !text(stop.mapReference);
  const label = name
    ? `${name}${directionLabel ? ` — ${directionLabel}` : distinguishingLocality ? ` — ${distinguishingLocality}` : missingDuplicateDiscriminator ? ' — direction not supplied' : ''}`
    : directionLabel ? `Bus stop — ${directionLabel}` : 'Bus stop (name not supplied)';
  return { label, duplicateName, directionLabel, mapReference: text(stop.mapReference) };
}

export function reviewStopLabel(context, id) {
  const stop = stopIdentity(context, id);
  const display = rawStopLabel(stop, context);
  if (typeof display === 'string') return display;
  const sameLabel = (context?.stops ?? []).filter(item => {
    const candidate = rawStopLabel(item, context);
    return typeof candidate !== 'string' && normal(candidate.label) === normal(display.label);
  }).length > 1;
  if (sameLabel && display.mapReference) return `${display.label} — map marker ${display.mapReference}`;
  if (display.duplicateName && !display.directionLabel && display.mapReference) return `${display.label} — map marker ${display.mapReference}`;
  return display.label;
}

function stopLabel(context, id) {
  return reviewStopLabel(context, id);
}

function frequencyBasisProof(topic, context) {
  if (!topic?.stop || !routeLabels(topic).length) return null;
  const rows = routeLabels(topic).map(route => rowsForRoute(context, route).find(row => {
    const basis = text(row?.frequencyBasisStopId);
    const frequencies = row?.typicalFrequencyLines;
    return basis && basis !== String(topic.stop)
      && (Array.isArray(frequencies) ? frequencies.some(text) : text(frequencies))
      && text(row?.timetableSource || row?.frequencyEvidenceSource || row?.provider);
  }));
  if (rows.some(row => !row)) return null;
  const basisIds = [...new Set(rows.map(row => String(row.frequencyBasisStopId)))];
  if (basisIds.length !== 1) return null;
  const stop = (context?.stops ?? []).find(item => String(item?.id ?? item?.stopPointId ?? '') === basisIds[0]);
  if (!stop) return null;
  return { id: basisIds[0], name: reviewStopLabel(context, basisIds[0]) };
}

/** Build a plain-language explanation from the topic's source records and the
 * exact rows that the planner is about to display. It does not alter evidence. */
export function describeReviewTopic(topic, context = {}) {
  const routes = routeLabels(topic);
  const routeText = routes.length ? `Routes ${routes.join(', ')}` : 'The assessment';
  const stopText = topic?.stop ? stopLabel(context, topic.stop) : 'the assessed stops';
  const source = plannerSourceLabel(topic?.source) || 'the recorded timetable source';
  const timetableSource = source
    .replace(/national operator timetable data/gi, 'national operator timetable information')
    .replace(/national timetable reference data/gi, 'national timetable reference information');
  const records = topic?.items ?? [];
  const messages = records.map(item => text(item?.message));
  const boardingRole = messages.length > 0 && messages.every(message => /boarding eligibility cannot be independently confirmed/i.test(message));

  if (boardingRole) return Object.freeze({
    heading: 'Boarding at this terminal is not confirmed',
    what: `Records from ${source} include calls for ${routeText} at ${stopText}, but do not say whether those calls pick up passengers, set down passengers, or both.`,
    impact: `At ${stopText}, the timetable pattern remains in the assessment; missing boarding information for these calls does not by itself show that a route or its wider timetable is invalid. These terminal calls cannot be confirmed as boarding departures from this snapshot.`,
    action: `If passengers need to board at ${stopText}, or the final departure time matters, check the operator timetable for this bus stop.`,
    evidenceBased: true
  });

  if (topic?.code === 'unresolved-timetable-request' || topic?.code === 'no-current-timetable-match') {
    const basis = topic?.source === 'TfL' ? frequencyBasisProof(topic, context) : null;
    const noMatch = topic?.code === 'no-current-timetable-match';
    const what = noMatch
      ? `${source} returned no current timetable match for ${routeText} at ${stopText}. This is a missing match for this bus stop; it does not show that the route is absent.`
      : `${source} could not provide timetable information for ${routeText} at ${stopText}. This is a gap for this bus stop, not evidence that the route is absent.`;
    if (basis) return Object.freeze({
      heading: 'Timetable information was not returned for this stop',
      what,
      impact: `The displayed frequency for ${routeText} is based on timetable evidence at ${basis.name}. ATLAS did not calculate that frequency from ${source} information for ${stopText}.`,
      action: `If departures at ${stopText} matter, check the operator timetable for that stop.`,
      evidenceBased: true,
      frequencyBasisStopPointId: basis.id
    });
    const exactEvidence = records.length > 0 && messages.every(message => /exact-stop BODS evidence is retained/i.test(message));
    return Object.freeze({
      heading: 'Timetable information was not returned for this stop',
      what,
      impact: exactEvidence
        ? 'The retained records include a national timetable match at this bus stop, but the displayed route frequency may use another stop’s timetable. The Transport for London response adds no departure for this stop.'
        : `ATLAS cannot confirm departures at ${stopText} from this source response. No zero-service conclusion was made.`,
      action: `If the service or its departure times at ${stopText} matter, check the operator timetable for this stop.`,
      evidenceBased: exactEvidence
    });
  }

  if (messages.length > 0 && messages.every(message => /operating-day records conflicted|calendar.*conflict|operating days.*conflict/i.test(message))) return Object.freeze({
    heading: 'Timetable records disagree about operating days',
    what: `Records from ${source} disagree about which days ${routeText} operate at ${stopText}.`,
    impact: `For ${routeText} at ${stopText}, the operating days and periods remain unverified while the source records conflict.`,
    action: `Check the operator timetable for ${routeText} at ${stopText} before relying on the affected weekday, Saturday, Sunday, or special-day result.`,
    evidenceBased: true
  });

  if (topic?.code === 'planner-endpoint-resolution') {
    const rows = routes.map(route => rowsForRoute(context, route).find(row =>
      (Array.isArray(row?.typicalFrequencyLines) ? row.typicalFrequencyLines.some(text) : text(row?.typicalFrequencyLines))
      && text(row?.frequencyBasisStopId)));
    const supportedPatterns = rows.length > 0 && rows.every(Boolean);
    const genericEndpoints = messages.filter(message => /generic source endpoint was retained/i.test(message));
    const hasOrigin = genericEndpoints.some(message => /origin endpoint/i.test(message));
    const hasDestination = genericEndpoints.some(message => /destination endpoint/i.test(message));
    const endpointLabel = hasOrigin && hasDestination ? 'starting or finishing stop'
      : hasOrigin ? 'starting stop' : 'finishing stop';
    return Object.freeze({
      heading: `Exact ${endpointLabel} not confirmed`,
      what: genericEndpoints.length
        ? `The ${timetableSource} supports the displayed pattern for ${routeText} at ${stopText}, but does not identify the exact ${endpointLabel} for this assessment.`
        : `${source} information does not establish the exact ${endpointLabel} for ${routeText} at ${stopText}.`,
      impact: supportedPatterns
        ? `The service pattern remains shown at ${stopText}, but its exact ${endpointLabel} cannot be independently checked from the retained source record. ATLAS has not inferred a destination.`
        : `ATLAS has not established the exact ${endpointLabel} for the service at ${stopText}, so no destination should be inferred from this item.`,
      action: `Check the operator timetable for ${stopText} if the exact starting or finishing stop is important to the assessment.`,
      evidenceBased: supportedPatterns
    });
  }

  if (topic?.code === 'supplementary-identity-conflict') return Object.freeze({
    heading: 'Timetable sources disagree about the route pattern',
    what: `Records from ${source} disagree about the direction or main stops for ${routeText} at ${stopText}.`,
    impact: `At ${stopText}, ATLAS kept the timetable it judged most authoritative for departures, but the direction and route still need checking against the operator’s information.`,
    action: `Check the operator route pattern at ${stopText} if the direction or main stops affect this assessment.`,
    evidenceBased: messages.every(message => /authoritative schedule was retained/i.test(message))
  });

  if (messages.length === 1 && /scheduled timetable information could not be checked for one or more services/i.test(messages[0])
    && !/no defensible national fallback was available/i.test(messages[0])) return Object.freeze({
    heading: 'Some timetable information could not be checked',
    what: 'Transport for London could not confirm timetable information for every bus stop checked in this assessment. ATLAS kept the information it could establish and retained the incomplete check for review.',
    impact: 'Some route or stop details may be incomplete. A missing result here does not show that no bus service exists.',
    action: 'Open the source record and check the operator timetable for the affected route and stop before relying on it.',
    evidenceBased: true
  });

  if (messages.length === 1 && /no defensible national fallback was available/i.test(messages[0])) return Object.freeze({
    heading: 'Timetable information was not confirmed for part of the assessment',
    what: 'Transport for London did not return a usable timetable for this request, and no matching national timetable could be confirmed as a fallback.',
    impact: 'ATLAS did not assume zero service, but this assessment cannot confirm the timetable for the affected request.',
    action: 'Check the operator timetable for the affected route and stop before treating the result as complete.',
    evidenceBased: true
  });

  return Object.freeze({
    heading: topic?.code === 'service-source-evidence' ? 'Timetable source information needs checking' : 'Source information needs checking',
    what: `${source} supplied incomplete or conflicting information for ${routeText} at ${stopText}.`,
    impact: 'The specific effect cannot be established from this grouped item alone; review its underlying source records before relying on affected results.',
    action: 'Open the underlying records and check the relevant operator or source information.',
    evidenceBased: false
  });
}

/** Plain summary for diagnostics already classified as non-actionable by the
 * application. Raw diagnostic records remain available inside the disclosure. */
export function describeReviewDiagnostics(items = []) {
  const allSafeSupplementary = items.length > 0 && items.every(item => item?.actionability === 'diagnostic'
    && /BODS is the recorded authority at this StopPoint and supplies the displayed schedule/i.test(String(item?.message ?? '')));
  return allSafeSupplementary
    ? 'These additional Transport for London timetable checks found no matching information for some bus stops. National operator timetable data remains the recorded source for the displayed times at those stops. No separate planner action is needed for these checks; the original records remain below.'
    : 'These additional source checks are retained below for reference.';
}

function routePattern(route) {
  const escaped = text(route).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\broute\\s+${escaped}\\b`, 'gi');
}

function topicMessage(item) {
  return text(item?.message).replace(routePattern(item?.route), 'route {route}');
}

/**
 * Group repeated review records only when cause, source, and exact StopPoint
 * scope agree. The returned records are the original objects, unchanged.
 */
export function groupReviewItems(items = []) {
  const groups = new Map();
  for (const item of items) {
    const key = [item?.code, item?.source, item?.stop, topicMessage(item)]
      .map(value => text(value).toLowerCase()).join('|');
    const group = groups.get(key) ?? { key, code: item?.code ?? 'other', source: item?.source ?? 'source not supplied', stop: item?.stop ?? null, message: topicMessage(item), items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => Object.freeze({
    ...group,
    items: Object.freeze(group.items),
    routes: Object.freeze([...new Set(group.items.map(item => text(item?.route)).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true })))
  }));
}
