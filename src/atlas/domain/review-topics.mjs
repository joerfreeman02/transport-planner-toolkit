const text = value => String(value ?? '').trim();

const routeLabels = topic => (topic?.routes ?? []).map(value => String(value).trim()).filter(Boolean);

function rowsForRoute(context, route) {
  const rows = context?.plannerServiceSummaries ?? context?.serviceSummaries ?? [];
  return rows.filter(row => String(row?.routeNumber ?? '').trim() === String(route)
    || (row?.publicRouteNumbers ?? row?.routeNumbers ?? []).map(String).includes(String(route)));
}

function stopLabel(context, id) {
  const stop = (context?.stops ?? []).find(item => String(item?.id ?? item?.stopPointId ?? '') === String(id));
  const name = text(stop?.name ?? stop?.commonName);
  return name ? `${name} (StopPoint ${id})` : `StopPoint ${id}`;
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
  return { id: basisIds[0], name: text(stop.name ?? stop.commonName) || null };
}

/** Build a plain-language explanation from the topic's source records and the
 * exact rows that the planner is about to display. It does not alter evidence. */
export function describeReviewTopic(topic, context = {}) {
  const routes = routeLabels(topic);
  const routeText = routes.length ? `Routes ${routes.join(', ')}` : 'The assessment';
  const stopText = topic?.stop ? stopLabel(context, topic.stop) : 'the assessed stops';
  const source = text(topic?.source) || 'the recorded source';
  const records = topic?.items ?? [];
  const messages = records.map(item => text(item?.message));
  const boardingRole = messages.length > 0 && messages.every(message => /boarding eligibility cannot be independently confirmed/i.test(message));

  if (boardingRole) return Object.freeze({
    heading: 'Boarding at this terminal is not confirmed',
    what: `${source} timetable records include calls for ${routeText} at ${stopText}, but the retained records do not say whether those calls pick up passengers, set down passengers, or both.`,
    impact: `The timetable pattern remains in the assessment; this missing stop-time permission does not by itself show that a route or its wider timetable is invalid. It does mean these terminal calls cannot be confirmed as boarding departures from this snapshot.`,
    action: 'If passengers need to board here, or the final departure time matters, check the operator timetable for this StopPoint.',
    evidenceBased: true
  });

  if (topic?.code === 'unresolved-timetable-request' || topic?.code === 'no-current-timetable-match') {
    const basis = topic?.source === 'TfL' ? frequencyBasisProof(topic, context) : null;
    const noMatch = topic?.code === 'no-current-timetable-match';
    const what = noMatch
      ? `${source} returned no current timetable match for ${routeText} at ${stopText}. This is a missing match for this exact stop; it does not show that the route is absent.`
      : `${source} could not provide an exact-stop timetable match for ${routeText} at ${stopText}. This is a source gap for this StopPoint, not evidence that the route is absent.`;
    if (basis) return Object.freeze({
      heading: 'No exact-stop timetable was returned',
      what,
      impact: `The displayed frequency for ${routeText} is based on timetable evidence at ${stopLabel(context, basis.id)}. ATLAS did not calculate that frequency from a ${source} match at StopPoint ${topic.stop}.`,
      action: 'If departures at this exact StopPoint matter, check the operator timetable for it.',
      evidenceBased: true,
      frequencyBasisStopPointId: basis.id
    });
    const exactEvidence = records.length > 0 && messages.every(message => /exact-stop BODS evidence is retained/i.test(message));
    return Object.freeze({
      heading: 'No exact-stop timetable was returned',
      what,
      impact: exactEvidence
        ? 'The retained records include a national timetable match at this stop, but the displayed route frequency may use a different timetable basis. The TfL response itself adds no departure for this StopPoint.'
        : 'ATLAS cannot confirm departures at this StopPoint from this source response. No zero-service conclusion was made.',
      action: 'If the service or its departure times at this StopPoint matter, check the operator timetable for this stop.',
      evidenceBased: exactEvidence
    });
  }

  if (messages.length > 0 && messages.every(message => /operating-day records conflicted|calendar.*conflict|operating days.*conflict/i.test(message))) return Object.freeze({
    heading: 'Operating-day records conflict',
    what: `${source} records disagree about which days ${routeText} operate at ${stopText}.`,
    impact: 'The operating days and periods shown for these services remain unverified while the source records conflict.',
    action: 'Check the operator timetable for the affected routes and days before relying on a weekday, Saturday, Sunday, or special-day result.',
    evidenceBased: true
  });

  if (topic?.code === 'planner-endpoint-resolution') {
    const rows = routes.map(route => rowsForRoute(context, route).find(row =>
      (Array.isArray(row?.typicalFrequencyLines) ? row.typicalFrequencyLines.some(text) : text(row?.typicalFrequencyLines))
      && text(row?.frequencyBasisStopId)));
    const supportedPatterns = rows.length > 0 && rows.every(Boolean);
    return Object.freeze({
      heading: 'Exact route endpoint not confirmed',
      what: messages.some(message => /generic source endpoint was retained/i.test(message))
        ? `${source} timetable evidence supports the displayed pattern for ${routeText}, but does not identify an exact endpoint StopPoint for this assessment.`
        : `${source} evidence does not establish the exact endpoint identity for ${routeText} at ${stopText}.`,
      impact: supportedPatterns
        ? 'The service pattern remains shown, but its exact terminal place cannot be independently checked from the retained source record. ATLAS has not inferred a destination.'
        : 'ATLAS has not established the exact terminal identity, so no destination should be inferred from this item.',
      action: 'Check the operator timetable if the exact endpoint is important to the assessment.',
      evidenceBased: supportedPatterns
    });
  }

  if (topic?.code === 'supplementary-identity-conflict') return Object.freeze({
    heading: 'Timetable sources disagree about the route pattern',
    what: `${source} records disagree about the direction or principal locations for ${routeText} at ${stopText}.`,
    impact: 'ATLAS retained the authoritative timetable for departures, but the direction and route corridor still need checking against the operator’s information.',
    action: 'Check the operator route pattern if the direction or listed principal locations affect this assessment.',
    evidenceBased: messages.every(message => /authoritative schedule was retained/i.test(message))
  });

  if (messages.length === 1 && /scheduled timetable information could not be checked for one or more services/i.test(messages[0])
    && !/no defensible national fallback was available/i.test(messages[0])) return Object.freeze({
    heading: 'Some timetable requests could not be checked',
    what: 'Transport for London could not confirm every timetable request made for this assessment. ATLAS kept the timetable evidence it could establish and retained the incomplete check for review.',
    impact: 'Some route or stop details may be incomplete. A missing result here does not show that no bus service exists.',
    action: 'Open the source record and check the operator timetable for the affected route and stop before relying on it.',
    evidenceBased: true
  });

  if (messages.length === 1 && /no defensible national fallback was available/i.test(messages[0])) return Object.freeze({
    heading: 'A timetable could not be confirmed for a source request',
    what: 'Transport for London did not return a usable timetable for this request, and no matching national timetable could be confirmed as a fallback.',
    impact: 'ATLAS did not assume zero service, but this assessment cannot confirm the timetable for the affected request.',
    action: 'Check the operator timetable for the affected route and stop before treating the result as complete.',
    evidenceBased: true
  });

  const uniqueMessages = [...new Set(messages)];
  return Object.freeze({
    heading: topic?.code === 'service-source-evidence' ? 'Timetable source information needs checking' : 'Source information needs checking',
    what: uniqueMessages.length === 1 ? uniqueMessages[0] : `${source} supplied incomplete or conflicting information for ${routeText} at ${stopText}.`,
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
    ? 'These supplementary Transport for London exact-stop checks did not return matches. The retained BODS records are authoritative at the listed stops and supply the displayed timetables; the original checks remain below for traceability, with no separate planner action required.'
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
