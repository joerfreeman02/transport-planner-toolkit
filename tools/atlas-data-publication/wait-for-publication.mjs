const urls = process.argv.slice(2).filter(Boolean);
if (!urls.length) throw new Error('Usage: node wait-for-publication.mjs <url> [url...]');

const deadline = Date.now() + 10 * 60 * 1000;
let lastError = 'not checked';
while (Date.now() < deadline) {
  try {
    const responses = await Promise.all(urls.map(url => fetch(url, { headers: { 'Cache-Control': 'no-cache' } })));
    if (responses.every(response => response.ok)) {
      console.log(`Reference-data publication is available at ${urls.length} verified URL(s).`);
      process.exit(0);
    }
    lastError = responses.map(response => `${response.status} ${response.url}`).join('; ');
  } catch (error) {
    lastError = error.message;
  }
  await new Promise(resolve => setTimeout(resolve, 5000));
}
throw new Error(`Reference-data publication did not become available within 10 minutes: ${lastError}`);
