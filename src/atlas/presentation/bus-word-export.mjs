import { buildServicePresentation, formatServiceOriginDestination } from '../domain/bus-service-assessment.mjs';
import { PLANNER_METHODOLOGY_NOTE } from '../domain/bus-planner-summary.mjs';
import { reviewItemTaxonomy } from '../domain/review-item-taxonomy.mjs';

function text(value) { return String(value ?? '').trim(); }

function accessText(route) {
  if (route?.status !== 'routed') return 'Route unavailable';
  const distance = Math.round(Number(route.distanceMetres));
  const minutes = Math.max(1, Math.round(Number(route.durationSeconds) / 60));
  return `${distance.toLocaleString('en-GB')} m · ${minutes} min${minutes === 1 ? '' : 's'}`;
}

function principalLocationsText(service) {
  return text(service?.principalLocationsText || service?.presentation?.principalLocationsText);
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
  const stopRows = (result.stops ?? []).map(stop => [
    stop.mapReference || '?',
    stop.name,
    stop.displayDirection,
    accessText(stop.walking),
    accessText(stop.cycling),
    stop.routes?.length ? stop.routes.join(', ') : 'Timetable route match unavailable'
  ]);

  const hasPlannerSummary = Array.isArray(result.plannerServiceSummaries);
  const services = hasPlannerSummary ? result.plannerServiceSummaries : buildServicePresentation(result.serviceSummaries ?? []);
  const serviceRows = [];
  services.forEach((service, index) => {
    serviceRows.push(hasPlannerSummary
      ? [
        service.routeNumber,
        service.operator,
        service.directionPatternText || formatServiceOriginDestination(service, ' – '),
        service.servedAtText || 'Representative stop not supplied',
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
    if (service.serviceNote) serviceRows.push({ kind: 'summary', text: `Service note: ${service.serviceNote}` });
    const next = services[index + 1];
    if (hasPlannerSummary && service.routeGroupNote && (!next || next.publicRouteFamilyKey !== service.publicRouteFamilyKey)) serviceRows.push({ kind: 'summary', text: `Service note: ${service.routeGroupNote}` });
  });
  const qualification = reviewQualification(result.reviewItems);
  if (qualification) serviceRows.push({ kind: 'summary', text: qualification });
  if (hasPlannerSummary) serviceRows.push({ kind: 'summary', text: PLANNER_METHODOLOGY_NOTE });

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
      widths: hasPlannerSummary ? [7, 13, 20, 16, 18, 12, 14] : [7, 14, 22, 25, 17, 15]
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
