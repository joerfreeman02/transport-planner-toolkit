import { mkdir, writeFile } from 'node:fs/promises';

const stopPointId = '490003378H';
const lines = ['217', '279', '317', '327', '491', 'N279'];
const output = new URL('../../tests/atlas/fixtures/tfl-waltham-operating-period-diagnostic.json', import.meta.url);

function time(value) {
  if (!value || value.hour === undefined || value.minute === undefined) return value ?? null;
  return { hour: String(value.hour), minute: String(value.minute) };
}

function journey(value) {
  if (!value) return null;
  return { hour: String(value.hour), minute: String(value.minute), intervalId: value.intervalId ?? null };
}

function period(value) {
  return {
    type: String(value?.type ?? ''),
    fromTime: time(value?.fromTime),
    toTime: time(value?.toTime),
    frequency: value?.frequency ? {
      lowestFrequency: Number(value.frequency.lowestFrequency),
      highestFrequency: Number(value.frequency.highestFrequency)
    } : null
  };
}

function stripResponse(body) {
  const routes = body?.timetable?.routes ?? body?.routes ?? [];
  return {
    lineId: body?.lineId ?? null,
    lineName: body?.lineName ?? null,
    direction: body?.direction ?? null,
    timetable: {
      departureStopId: body?.timetable?.departureStopId ?? null,
      routes: routes.map(route => ({
        stationIntervals: (route.stationIntervals ?? []).map(pattern => ({
          id: pattern.id ?? null,
          intervals: (pattern.intervals ?? []).map(interval => ({
            stopId: interval.stopId ?? interval.stopPointId ?? interval.stationId ?? null,
            timeToArrival: interval.timeToArrival ?? null
          }))
        })),
        schedules: (route.schedules ?? []).map(schedule => ({
          name: schedule.name ?? null,
          firstJourney: journey(schedule.firstJourney),
          lastJourney: journey(schedule.lastJourney),
          knownJourneys: (schedule.knownJourneys ?? []).map(journey),
          periods: (schedule.periods ?? []).map(period)
        }))
      }))
    }
  };
}

const requests = [];
for (const lineId of lines) {
  const endpoint = `https://api.tfl.gov.uk/Line/${encodeURIComponent(lineId)}/Timetable/${encodeURIComponent(stopPointId)}`;
  const response = await fetch(endpoint, {
    headers: { Accept: 'application/json', 'User-Agent': 'ATLAS BUS-TFL-PERIOD-1 bounded diagnostic' }
  });
  if (!response.ok) throw new Error(`TfL ${lineId} returned HTTP ${response.status}`);
  requests.push({ lineId, stopPointId, endpoint, status: response.status, response: stripResponse(await response.json()) });
}

await mkdir(new URL('.', output), { recursive: true });
await writeFile(output, `${JSON.stringify({
  schema: 'atlas-tfl-operating-period-diagnostic-v1',
  provider: 'Transport for London Unified API',
  capturedAt: new Date().toISOString(),
  requestedStopPointId: stopPointId,
  requests
}, null, 2)}\n`);
console.log(`Captured ${requests.length} TfL timetable responses at ${output.pathname}`);
