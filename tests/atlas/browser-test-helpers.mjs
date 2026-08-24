const TRANSPARENT_TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av3nGQAAAABJRU5ErkJggg==', 'base64');

export async function mockMapTiles(page) {
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_TILE }));
}

export async function chooseFirstCandidateAndConfirm(page) {
  await page.getByRole('button', { name: 'Use this result' }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Use this result' }).first().click();
  await page.locator('.assessment-point-marker').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Confirm assessment point' }).click();
  await page.getByText('Confirmed assessment point', { exact: true }).waitFor({ timeout: 5000 });
}
