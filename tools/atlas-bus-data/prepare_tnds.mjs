import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseTndsTransXchangeServices } from '../../src/atlas/adapters/tnds-transxchange-adapter.mjs';

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
  const regions = new Set();
  const paths = [];
  const registeredPaths = new Set();
  let quarantinedPatterns = 0;
  let quarantinedServices = 0;
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(path.join(output, 'services'), { recursive: true });
  for (const file of files) {
    const region = regionFrom(file);
    if (!region) continue;
    const xml = await fs.readFile(file, 'utf8');
    try {
      const parsed = parseTndsTransXchangeServices(xml, { region, sourceArchive: path.basename(file), preparedAt });
      if (parsed.length > 1) console.log(`TNDS ${path.basename(file)}: prepared ${parsed.length} Service records.`);
      for (const service of parsed) {
        const hasSchedules = service.stopSchedules && Object.keys(service.stopSchedules).length > 0;
        const quarantine = service.tndsQuarantine;
        if (!hasSchedules && !quarantine?.affectedStopIds?.length) continue;
        if (quarantine) {
          quarantinedPatterns += quarantine.patterns.length;
          if (quarantine.serviceQuarantined) quarantinedServices += 1;
          console.log(`TNDS ${path.basename(file)}: quarantined ${quarantine.patterns.length} pattern(s) for service ${service.source.serviceCode || service.id}.`);
        }
        regions.add(region);
        const digest = createHash('sha256').update(service.id).digest('hex').slice(0, 12);
        const relative = `services/${service.source.region.toLowerCase()}-${digest}.json`;
        if (registeredPaths.has(relative) || await fs.access(path.join(output, relative)).then(() => true, () => false)) {
          throw new Error(`TNDS prepared output collision ${relative}.`);
        }
        registeredPaths.add(relative);
        await fs.writeFile(path.join(output, relative), `${JSON.stringify(service)}\n`, { flag: 'wx' });
        paths.push(relative);
      }
    } catch (error) {
      if (error.message === 'TNDS XML contains no Service record.') {
        console.log(`TNDS ${path.basename(file)}: no Service record; ignored as non-timetable registration data.`);
        continue;
      }
      throw new Error(`TNDS parser rejected ${path.basename(file)}: ${error.message}`);
    }
  }
  if (!paths.length) throw new Error('TNDS preparation produced no services.');
  await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({
    schema: 'atlas-prepared-bus-tnds-v1',
    generatedAt: preparedAt,
    source: 'Traveline National Dataset v2.5',
    regions: [...regions].sort(),
    services: paths
  })}\n`);
  return { services: paths.length, regions: [...regions].sort(), quarantinedPatterns, quarantinedServices };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).map((value, index, values) => [value.replace(/^--/, ''), values[index + 1]]).filter(([key]) => key));
  const result = await prepareTnds({ input: args.input, output: args.output, preparedAt: args.preparedAt || new Date().toISOString() });
  console.log(JSON.stringify(result));
}
