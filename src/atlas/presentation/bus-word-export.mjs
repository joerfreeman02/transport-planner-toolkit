import { buildServicePresentation, formatServiceOriginDestination } from '../domain/bus-service-assessment.mjs';

function text(value) { return String(value ?? '').trim(); }

function accessText(route) {
  if (route?.status !== 'routed') return 'Route unavailable';
  const distance = Math.round(Number(route.distanceMetres));
  const minutes = Math.max(1, Math.round(Number(route.durationSeconds) / 60));
  return `${distance.toLocaleString('en-GB')} m · ${minutes} min${minutes === 1 ? '' : 's'}`;
}

function principalLocationsText(service) {
  return text(service?.presentation?.principalLocationsText);
}

export function buildBusWordTables(result) {
  if (!result?.ok) throw new Error('A completed Bus assessment is required for Word export.');
  const stopRows = (result.stops ?? []).map(stop => [
    stop.name,
    stop.displayDirection,
    accessText(stop.walking),
    accessText(stop.cycling),
    stop.routes?.length ? stop.routes.join(', ') : 'Timetable route match unavailable'
  ]);

  const serviceRows = [];
  for (const service of buildServicePresentation(result.serviceSummaries ?? [])) {
    serviceRows.push([
      service.routeNumber,
      service.operator,
      formatServiceOriginDestination(service, ' – '),
      principalLocationsText(service),
      service.typicalFrequencyText || 'Frequency unavailable',
      (service.operatingPeriodLines ?? []).join('\n')
    ]);
    if (service.serviceNote) serviceRows.push({ kind: 'summary', text: `Service note: ${service.serviceNote}` });
  }

  return [
    {
      caption: 'Table 3.2 - Bus Stop Summary',
      headers: ['Stop name', 'Direction', 'Walking distance / time', 'Cycling distance / time', 'Routes serving stop'],
      rows: stopRows,
      widths: [22, 16, 20, 20, 22]
    },
    {
      caption: 'Table 3.3 - Bus Service Summary',
      headers: ['Route', 'Operator', 'Origin / destination', 'Principal locations', 'Typical frequency', 'Operating period'],
      rows: serviceRows,
      widths: [7, 14, 22, 25, 17, 15]
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
