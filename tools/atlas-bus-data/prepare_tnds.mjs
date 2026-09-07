import fs from 'node:fs/promises';
import path from 'node:path';
import { parseTndsTransXchange } from '../../src/atlas/adapters/tnds-transxchange-adapter.mjs';

export const TNDS_REGIONS = Object.freeze(['EA', 'EM', 'NE', 'NW', 'SE', 'SW', 'WM', 'Y']);

async function walk(root) {
  const result = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (/\.xml$/i.test(entry.name)) result.push(file);
    }
  }
  await visit(root);
  return result.sort();
}

function regionFrom(file) {
  const match = file.match(/(?:^|[\\/_.-])(EA|EM|NE|NW|SE|SW|WM|Y)(?:[\\/_.-]|$)/i);
  return match ? match[1].toUpperCase() : null;
}

export async function prepareTnds({ input, output, preparedAt = new Date().toISOString() }) {
  const files = await walk(input);
  const services = [];
  const regions = new Set();
  for (const file of files) {
    const region = regionFrom(file);
    if (!region) continue;
    const xml = await fs.readFile(file, 'utf8');
    try {
      const service = parseTndsTransXchange(xml, { region, sourceArchive: path.basename(file), preparedAt });
      if (!service.stopSchedules || !Object.keys(service.stopSchedules).length) continue;
      services.push(service);
      regions.add(region);
    } catch (error) {
      throw new Error(`TNDS parser rejected ${path.basename(file)}: ${error.message}`);
    }
  }
  if (!services.length) throw new Error('TNDS preparation produced no services.');
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(path.join(output, 'services'), { recursive: true });
  const paths = [];
  for (const [index, service] of services.entries()) {
    const safe = `${String(index + 1).padStart(5, '0')}-${service.source.region.toLowerCase()}.json`;
    const relative = `services/${safe}`;
    await fs.writeFile(path.join(output, relative), `${JSON.stringify(service)}\n`);
    paths.push(relative);
  }
  await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({
    schema: 'atlas-prepared-bus-tnds-v1',
    generatedAt: preparedAt,
    source: 'Traveline National Dataset v2.5',
    regions: [...regions].sort(),
    services: paths
  })}\n`);
  return { services: services.length, regions: [...regions].sort() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).map((value, index, values) => [value.replace(/^--/, ''), values[index + 1]]).filter(([key]) => key));
  const result = await prepareTnds({ input: args.input, output: args.output, preparedAt: args.preparedAt || new Date().toISOString() });
  console.log(JSON.stringify(result));
}
