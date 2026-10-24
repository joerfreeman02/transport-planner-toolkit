import { buildServicePresentation, formatServiceOriginDestination } from '../domain/bus-service-assessment.mjs';
import { buildBusTimetablePresentationNote, plannerRouteDisplayNumber, PLANNER_METHODOLOGY_NOTE, PLANNER_TERMINUS_PRESENTATION_NOTE } from '../domain/bus-planner-summary.mjs';
import { isOtherNearbyStopRecord, plannerFacingServiceNote } from '../domain/bus-source-presentation.mjs';
import { withNumericMapReferences } from './bus-map-references.mjs';

function text(value) { return String(value ?? '').trim(); }

function assessedStopRecords(stops) {
  return (Array.isArray(stops) ? stops : []).filter(stop => !isOtherNearbyStopRecord(stop));
}

function stopRouteNumbers(stop) {
  const routes = [...new Set((stop?.routes ?? []).map(text).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'en-GB', { numeric: true }));
  return routes.length ? routes.join(', ') : 'No route recorded';
}

export function buildBusTransportStatement(result, { services = result?.plannerServiceSummaries ?? result?.serviceSummaries ?? [], nearestGroupName = result?.nearestGroup?.name ?? null } = {}) {
  const count = assessedStopRecords(result?.stops).length;
  const routeNumbers = [...new Set((services ?? []).flatMap(service => service.publicRouteNumbers ?? service.routeNumbers ?? [service.routeNumber]).map(text).filter(Boolean))];
  const destinationValues = (services ?? []).flatMap(service => [service.destination, ...(service.principalLocations ?? [])]).map(text).filter(Boolean);
  const destinationKey = value => value.toLocaleLowerCase('en-GB').replace(/[^a-z0-9]+/gu, ' ').trim().replace(/\s+/gu, ' ');
  const destinations = [];
  for (const destination of destinationValues) {
    const key = destinationKey(destination);
    if (!key) continue;
    const duplicateIndex = destinations.findIndex(existing => {
      const existingKey = destinationKey(existing);
      return existingKey === key || existingKey.endsWith(` ${key}`) || key.endsWith(` ${existingKey}`);
    });
    if (duplicateIndex < 0) destinations.push(destination);
    else if (destinationKey(destination).length > destinationKey(destinations[duplicateIndex]).length) destinations[duplicateIndex] = destination;
  }
  const shownDestinations = destinations.slice(0, 6);
  const connectionText = shownDestinations.length ? `, including connections towards ${shownDestinations.join(', ')}${destinations.length > shownDestinations.length ? ' and other nearby destinations' : ''}` : '';
  const serviceCount = (services ?? []).length;
  const hasQualifications = (services ?? []).some(service => Boolean(service.serviceNote || Object.values(service.plannerNotes ?? {}).some(Boolean))) || (result?.reviewItems?.length ?? 0) > 0;
  const population = nearestGroupName
    ? `in the nearest logical stop group at ${text(nearestGroupName)}`
    : 'within the assessed area';
  const first = serviceCount
    ? `A total of ${count} bus stop${count === 1 ? ' is' : 's are'} located ${population}, providing access to ${routeNumbers.length} bus route${routeNumbers.length === 1 ? '' : 's'}${connectionText}.`
    : `${count} bus stop${count === 1 ? ' is' : 's are'} located ${population}. No usable timetable evidence was available for the selected stops.`;
  const second = serviceCount
    ? `Services operate at a range of frequencies${hasQualifications ? ', with material qualifications shown alongside the relevant rows' : ''}. Assessed stops are summarised in Table 3.2; principal destinations, typical frequencies and operating periods are provided in Table 3.3.`
    : 'The stops and their access information are summarised in Table 3.2.';
  return `${first}\n\n${second}`;
}

function remapStopReference(value, references) {
  return String(value ?? '').replace(/\[([^\]]+)\]/gu, (match, previous) => references.get(previous) ? `[${references.get(previous)}]` : match);
}

function accessText(route) {
  if (route?.status !== 'routed') return 'Route unavailable';
  const distance = Math.round(Number(route.distanceMetres));
  const minutes = Math.max(1, Math.round(Number(route.durationSeconds) / 60));
  return `${distance.toLocaleString('en-GB')} m · ${minutes} min${minutes === 1 ? '' : 's'}`;
}

function principalLocationsText(service) {
  return text(service?.principalLocationsText || service?.presentation?.principalLocationsText);
}

function plannerAnnotationRows(service) {
  const notes = service?.plannerNotes ?? {};
  const sentence = value => text(value).replace(/[.]+$/u, '');
  return [
    notes.terminus ? `Route terminus: ${sentence(notes.terminus)}.` : null,
    notes.additionalServices ? `Additional services: ${sentence(notes.additionalServices)}.` : null,
    notes.shortWorkings ? `Short workings: ${sentence(notes.shortWorkings)}.` : null,
    notes.serviceQualification ? `Service qualification: ${sentence(notes.serviceQualification)}.` : null,
    notes.circularService ? `Circular service: ${notes.circularService}` : null,
  ].filter(Boolean);
}

function noteRow(note, semantic = 'explanatory-note') {
  const shortWorking = /^Short workings:/i.test(note);
  const review = /^Planner review required:/i.test(note);
  const annotationSemantic = /^Additional services:/i.test(note) ? 'additional-services'
    : /^Circular service:/i.test(note) ? 'circular-service'
      : /^Service qualification:/i.test(note) ? 'service-qualification'
        : /^Review note:/i.test(note) ? 'review-note'
          : /^Route terminus:/i.test(note) ? 'terminus'
            : semantic;
  return {
    kind: shortWorking || review ? 'section' : 'summary',
    semantic: shortWorking ? 'short-working' : review ? 'evidence-review' : annotationSemantic,
    text: note
  };
}

export function buildBusWordTables(result, { includeMap = true } = {}) {
  if (!result?.ok) throw new Error('A completed Bus assessment is required for Word export.');
  if (!(result.stops ?? []).every(stop => stop.displayMapReference)) result = withNumericMapReferences(result);
  const referenceByPrevious = new Map(assessedStopRecords(result.stops).map(stop => [String(stop.originalMapReference ?? ''), String(stop.displayMapReference ?? stop.mapReference ?? '')]).filter(([previous]) => previous));
  const stopRows = assessedStopRecords(result.stops).map(stop => [
    ...(includeMap ? [String(stop.displayMapReference || stop.mapReference || 'Unnumbered')] : []),
    text(stop.name) || 'Unnamed bus stop',
    stop.displayDirection,
    accessText(stop.walking),
    accessText(stop.cycling),
    stopRouteNumbers(stop)
  ]);

  const hasPlannerSummary = Array.isArray(result.plannerServiceSummaries);
  const services = hasPlannerSummary ? result.plannerServiceSummaries : buildServicePresentation(result.serviceSummaries ?? []);
  const serviceRows = [];
  const timetableNote = hasPlannerSummary ? buildBusTimetablePresentationNote(result, services) : null;
  if (timetableNote) serviceRows.push({ kind: 'summary', semantic: 'presentation-note', text: `Timetable note: ${timetableNote}` });
  if (hasPlannerSummary && services.some(service => service.plannerNotes?.terminus)) {
    serviceRows.push({ kind: 'summary', semantic: 'presentation-note', text: `Presentation note: ${PLANNER_TERMINUS_PRESENTATION_NOTE}` });
  }
  services.forEach((service, index) => {
    serviceRows.push(hasPlannerSummary
      ? [
        plannerRouteDisplayNumber(service),
        service.operator,
        service.directionPatternText || formatServiceOriginDestination(service, ' – '),
        (includeMap ? remapStopReference(service.servedAtText || 'Representative stop not supplied', referenceByPrevious) : String(service.servedAtText || 'Representative stop not supplied').replace(/\s*\[\d+\]/gu, '')),
        principalLocationsText(service),
        service.typicalFrequencyText || 'Frequency unavailable',
        (service.operatingPeriodLines ?? []).join('\n')
      ]
      : [
        service.routeNumber,
        service.operator,
        formatServiceOriginDestination(service, ' – '),
        principalLocationsText(service),
        service.typicalFrequencyText || 'Frequency unavailable',
        (service.operatingPeriodLines ?? []).join('\n')
    ]);
    const duplicateTerminusNote = service.plannerNotes?.terminus && /\broute terminus\b/i.test(text(service.serviceNote));
    const structuredQualificationNote = /^(?:school[- ]day(?:s)?(?:[- ]only)?(?: journeys? only| service)?|runs? on school days only|operates? during term time only|term[- ]time service|runs? on non-school days only|non-school days only|operates? on holidays only|operating days could not be fully confirmed)(?:;.*)?\.?$/i.test(text(service.serviceNote));
    const visibleServiceNote = plannerFacingServiceNote(service.serviceNote);
    if (visibleServiceNote && !duplicateTerminusNote && !structuredQualificationNote) serviceRows.push(noteRow(`Service note: ${visibleServiceNote}`));
    const plannerAnnotations = hasPlannerSummary ? plannerAnnotationRows(service) : [];
    const next = services[index + 1];
    if (hasPlannerSummary && (!next || next.publicRouteFamilyKey !== service.publicRouteFamilyKey)) {
      if (plannerAnnotations.length) {
        plannerAnnotations.forEach(textValue => serviceRows.push(noteRow(textValue)));
      }
      else if (plannerFacingServiceNote(service.routeGroupNote)) serviceRows.push(noteRow(`Service note: ${plannerFacingServiceNote(service.routeGroupNote)}`));
    }
  });
  return [
    {
      caption: 'Table 3.2 - Bus Stop Summary',
      headers: [...(includeMap ? ['Map reference'] : []), 'Stop name', 'Direction', 'Walking distance / time', 'Cycling distance / time', 'Routes serving stop'],
      rows: stopRows,
      widths: includeMap ? [8, 22, 15, 20, 20, 15] : [25, 17, 22, 22, 14]
    },
    {
      caption: 'Table 3.3 - Bus Service Summary',
      headers: hasPlannerSummary
        ? ['Route', 'Operator', 'Direction / main service pattern', 'Served at', 'Principal locations', 'Typical frequency', 'Operating period at stop']
        : ['Route', 'Operator', 'Origin / destination', 'Principal locations', 'Typical frequency', 'Operating period'],
      rows: serviceRows,
      prelude: hasPlannerSummary ? PLANNER_METHODOLOGY_NOTE : null,
      widths: hasPlannerSummary ? [6, 12, 17, 17, 22, 13, 13] : [7, 14, 22, 25, 17, 15]
    }
  ];
}

export function busWordFilename(site) {
  const identity = text(site?.displayAddress || site?.suppliedAddress)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70);
  return identity ? `Bus Assessment - ${identity}.docx` : 'Bus Assessment.docx';
}
