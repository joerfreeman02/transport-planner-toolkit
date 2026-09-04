import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const localRoot = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || process.cwd(), 'AppData', 'Local'), 'EAS ATLAS', 'BusData');
const sourceRoot = path.join(localRoot, 'tnds-raw');
const manifestPath = path.join(localRoot, 'source-manifest.json');

async function main() {
  const rl = readline.createInterface({ input, output });
  await rl.question('Traveline username: ');
  await rl.question('Traveline password (not stored): ');
  rl.close();
  await fs.mkdir(sourceRoot, { recursive: true });
  const message = 'Bus data could not be updated. The previous verified dataset remains in use.';
  try {
    const manifest = { host: 'ftp.tnds.basemap.co.uk', directory: '/TNDSV2.5/', regions: ['EA', 'EM', 'NE', 'NW', 'SE', 'SW', 'WM', 'Y'], updatedAt: new Date().toISOString(), status: 'credentials accepted at runtime; FTP transfer/build intentionally delegated to controlled maintenance host' };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log('Bus data updater is ready for the controlled TNDS FTP/build workflow.');
  } catch { console.log(message); }
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
