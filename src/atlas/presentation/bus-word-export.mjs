import { buildServicePresentation, formatServiceOriginDestination } from '../domain/bus-service-assessment.mjs';
import { buildBusTimetablePresentationNote, plannerRouteDisplayNumber, PLANNER_METHODOLOGY_NOTE, PLANNER_TERMINUS_PRESENTATION_NOTE } from '../domain/bus-planner-summary.mjs';
import { reviewItemTaxonomy } from '../domain/review-item-taxonomy.mjs';
import { isOtherNearbyStopRecord, partialTimetableQualification, plannerFacingServiceNote, stopRoutesPresentation } from '../domain/bus-source-presentation.mjs';
import { withNumericMapReferences } from './bus-map-references.mjs';

function text(value) { return String(value ?? '').trim(); }

function assessedStopRecords(stops) {
  return (Array.isArray(stops) ? stops : []).filter(stop => !isOtherNearbyStopRecord(stop));
}

export function buildBusTransportStatement(result, { services = result?.plannerServiceSummaries ?? result?.serviceSummaries ?? [], nearestGroupName = result?.nearestGroup?.name ?? null } = {}) {
  const count = assessedStopRecords(result?.stops).length;
  const routeNumbers = [...new Set((services ?? []).flatMap(service => service.publicRouteNumbers ?? service.routeNumbers ?? [service.routeNumber]).map(text).filter(Boolean))];
  const serviceCount = (services ?? []).length;
  const stopSentence = nearestGroupName
    ? `The assessment covers ${count} assessed stop${count === 1 ? '' : 's'} within the nearest stop group at ${text(nearestGroupName)}.`
    : `The assessment covers ${count} assessed stop${count === 1 ? '' : 's'}.`;
  const routeSentence = serviceCount
    ? `The checked evidence identifies ${routeNumbers.length} bus route${routeNumbers.length === 1 ? '' : 's'} across ${serviceCount} planner-facing service summar${serviceCount === 1 ? 'y' : 'ies'}. Principal locations, timetable frequency and operating periods are set out in the service summary.`
    : 'No matched planner-facing timetable summaries are available for the selected stop evidence.';
  const frequencies = (services ?? []).map(service => String(service.typicalFrequencyText || service.typicalFrequencyLines?.join(' ') || '')).filter(Boolean);
  const frequentCount = frequencies.filter(value => /(?:every\s+(?:5|10|12|15)\s*(?:minutes?|mins?)|(?:4|5|6|7|8|9|10|\d{2,})\s*buses?\s*\/\s*hour)/i.test(value)).length;
  const days = (services ?? []).flatMap(service => service.operatingPeriodLines ?? []).join(' ').toLowerCase();
  const operatingDays = [
    /mon(?:day)?\s*[-–]\s*fri(?:day)?|weekdays?/.test(days) ? 'weekdays' : null,
    /saturdays?|\bsat\b/.test(days) ? 'Saturdays' : null,
    /sundays?|\bsun\b/.test(days) ? 'Sundays' : null
  ].filter(Boolean);
  const reviewCount = Array.isArray(result?.reviewItems) ? result.reviewItems.length : 0;
  const coverage = operatingDays.length ? ` Timetable evidence covers ${operatingDays.join(', ')}.` : '';
  const frequency = frequentCount ? ` The timetable summaries include ${frequentCount} service row${frequentCount === 1 ? '' : 's'} with stated intervals of 15 minutes or less.` : '';
  const qualification = reviewCount ? ` ${reviewCount} evidence item${reviewCount === 1 ? ' requires' : 's require'} planner review before formal use.` : ' No evidence items require review.';
  return [stopSentence, routeSentence + frequency + coverage + qualification].join('\n\n');
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
    notes.reviewNote ? `Review note: ${notes.reviewNote}` : null
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

function reviewQualification(reviewItems) {
  const items = Array.isArray(reviewItems) ? reviewItems.filter(Boolean) : [];
  if (!items.length) return null;
  const categories = new Map();
  for (const item of items) {
    const taxonomy = reviewItemTaxonomy(item.code);
    const entry = categories.get(taxonomy.category) ?? { routeBearing: taxonomy.routeBearing, routes: new Set() };
    entry.routeBearing ||= taxonomy.routeBearing;
    if (taxonomy.routeBearing && text(item.route)) entry.routes.add(text(item.route));
    categories.set(taxonomy.category, entry);
  }
  const sentences = [];
  const timetable = categories.get('timetable');
  if (timetable?.routes.size) {
    const routes = [...timetable.routes].sort((left, right) => left.localeCompare(right, 'en-GB', { numeric: true }));
    sentences.push(`timetable/source evidence requires review for routes ${routes.join(', ')} at one or more assessed stops.`);
  } else if (timetable) sentences.push('timetable/source evidence requires review before formal use.');
  const categoryLabels = {
    'service-source': 'service-source evidence',
    operator: 'operator evidence',
    'planner-route-identity': 'planner route/destination identity evidence',
    'stop-source-coverage': 'stop-source coverage evidence',
    'access-routing': 'access-routing evidence',
    'timetable-source': 'timetable-source availability evidence',
    'other-material': 'additional assessment evidence'
  };
  for (const [category, entry] of categories) {
    if (category === 'timetable') continue;
    const label = categoryLabels[category] ?? categoryLabels['other-material'];
    if (entry.routeBearing && entry.routes.size) {
      const routes = [...entry.routes].sort((left, right) => left.localeCompare(right, 'en-GB', { numeric: true }));
      sentences.push(`Additional ${label} also requires planner review for routes ${routes.join(', ')}.`);
    } else sentences.push(`Additional ${label} also requires planner review.`);
  }
  return `Planner review required: ${sentences.join(' ')} Detailed evidence is retained in ATLAS and should be reviewed before formal use.`;
}

export function buildBusWordTables(result) {
  if (!result?.ok) throw new Error('A completed Bus assessment is required for Word export.');
  if (!(result.stops ?? []).every(stop => stop.displayMapReference)) result = withNumericMapReferences(result);
  const referenceByPrevious = new Map(assessedStopRecords(result.stops).map(stop => [String(stop.originalMapReference ?? ''), String(stop.displayMapReference ?? stop.mapReference ?? '')]).filter(([previous]) => previous));
  const stopRows = assessedStopRecords(result.stops).map(stop => [
    String(stop.displayMapReference || stop.mapReference || '?'),
    stop.name,
    stop.displayDirection,
    accessText(stop.walking),
    accessText(stop.cycling),
    stopRoutesPresentation(stop)
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
        remapStopReference(service.servedAtText || 'Representative stop not supplied', referenceByPrevious),
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
  const qualification = reviewQualification(result.reviewItems);
  if (qualification) serviceRows.push(noteRow(qualification));
  const partialQualification = partialTimetableQualification(result.stops);
  if (partialQualification) serviceRows.push(noteRow(partialQualification, 'partial-timetable-qualification'));
  if (hasPlannerSummary) serviceRows.push({ kind: 'summary', semantic: 'presentation-note', text: 'Additional source evidence remains available in the ATLAS assessment workspace.' });

  return [
    {
      caption: 'Table 3.2 - Bus Stop Summary',
      headers: ['Map reference', 'Stop name', 'Direction', 'Walking distance / time', 'Cycling distance / time', 'Routes serving stop'],
      rows: stopRows,
      widths: [10, 22, 16, 20, 20, 22]
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
  return identity ? `ATLAS Bus Assessment - ${identity}.docx` : 'ATLAS Bus Assessment.docx';
}
