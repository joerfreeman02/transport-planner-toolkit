const TRANSPARENT_TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av3nGQAAAABJRU5ErkJggg==', 'base64');

export async function mockMapTiles(page) {
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_TILE }));
}

export async function mockAccessRouting(page, { fail = false } = {}) {
  await page.route('https://routing.openstreetmap.de/**', route => {
    if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'Unavailable' }) });
    const url = route.request().url();
    if (url.includes('/table/')) {
      const coordinates = decodeURIComponent(url.split('/').at(-1).split('?')[0]).split(';');
      const distances = coordinates.map((_value, index) => index === 0 ? 0 : 120 + index * 35);
      const durations = coordinates.map((_value, index) => index === 0 ? 0 : 80 + index * 25);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', distances: [distances], durations: [durations] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ distance: 180, duration: 120, geometry: { type: 'LineString', coordinates: [[-0.08, 51.41], [-0.081, 51.42]] } }] }) });
  });
}

export async function mockPreparedBusTimetables(page, { serviceResolver = null } = {}) {
  const generatedAt = '2026-09-04T08:00:00.000Z';
  const manifest = {
    schema: 'atlas-prepared-bus-data-v1', generatedAt, refreshAfterDays: 8, serviceShardKeyLength: 5,
    sources: { naptan: { url: 'https://naptan.api.dft.gov.uk/', downloadedAt: generatedAt, sha256: 'fixture-naptan' }, bods: { url: 'https://data.bus-data.dft.gov.uk/timetable/download/', sha256: 'fixture-bods', regions: [{ region: 'london' }] } },
    serviceShards: { '490TE': ['services/490TE-london.json.gz'] }, representativeDates: { monday: '2026-09-07', tuesday: '2026-09-08', wednesday: '2026-09-09', thursday: '2026-09-10', friday: '2026-09-11', saturday: '2026-09-12', sunday: '2026-09-13' }
  };
  const weekdays = { monday: [360, 390, 420], tuesday: [360, 390, 420], wednesday: [360, 390, 420], thursday: [360, 390, 420], friday: [360, 390, 420], saturday: [420, 480], sunday: [480, 540] };
  const services = {
    schema: 'atlas-prepared-bus-data-v1', services: [
      { id: 'fixture:322:outbound', routeNumber: '322', operator: 'London General', origin: 'Crystal Palace', destination: 'Clapham Common', direction: 'Clapham Common', principalLocations: ['West Norwood', 'Brixton'], stopSchedules: { '490TEST001': weekdays }, validFrom: '2026-09-04', validTo: '2027-01-01' },
      { id: 'fixture:450:outbound', routeNumber: '450', operator: 'Arriva London', origin: 'Lower Sydenham', destination: 'West Croydon', direction: 'West Croydon', principalLocations: ['Crystal Palace', 'Thornton Heath'], stopSchedules: { '490TEST001': weekdays }, validFrom: '2026-09-04', validTo: '2027-01-01' },
      { id: 'fixture:N3:night', routeNumber: 'N3', operator: 'Transport UK London Bus', origin: 'Oxford Circus', destination: 'Bromley North', direction: 'Bromley North', principalLocations: ['Brixton', 'Crystal Palace'], stopSchedules: { '490TEST002': { ...weekdays, monday: [1380, 1470], tuesday: [1380, 1470], wednesday: [1380, 1470], thursday: [1380, 1470], friday: [1380, 1470] } }, validFrom: '2026-09-04', validTo: '2027-01-01' }
    ]
  };
  await page.route('**/atlas/data/bus/manifest.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(manifest) }));
  await page.route('**/atlas/data/bus/services/**', route => {
    const resolved = typeof serviceResolver === 'function' ? serviceResolver(route.request(), services) : services;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resolved) });
  });
}

export async function chooseFirstCandidateAndConfirm(page) {
  await page.getByRole('button', { name: 'Use this result' }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Use this result' }).first().click();
  await page.locator('.assessment-point-marker').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Confirm assessment point' }).click();
  await page.getByText('Confirmed assessment point', { exact: true }).waitFor({ timeout: 5000 });
}
