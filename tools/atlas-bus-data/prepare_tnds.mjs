import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { parseTndsTransXchangeServices } from '../../src/atlas/adapters/tnds-transxchange-adapter.mjs';

export const TNDS_REGIONS = Object.freeze(['EA', 'EM', 'NE', 'NW', 'SE', 'SW', 'WM', 'Y']);
export const TNDS_SERVICE_SHARD_KEY_LENGTH = 5;

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
  const shardFiles = new Map();
  const serviceIds = new Set();
  const registeredPaths = new Set();
  const work = path.join(output, '.tnds-shards-work');
  let quarantinedPatterns = 0;
  let quarantinedServices = 0;
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(path.join(output, 'services'), { recursive: true });
  await fs.mkdir(work, { recursive: true });
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
        serviceIds.add(service.id);
        const ids = [...Object.keys(service.stopSchedules || {}), ...(service.tndsQuarantine?.affectedStopIds || [])];
        const shardKeys = [...new Set(ids.map(id => String(id).slice(0, TNDS_SERVICE_SHARD_KEY_LENGTH)).filter(Boolean))];
        if (!shardKeys.length) throw new Error(`TNDS service ${service.source.serviceCode || service.id} has no shardable StopPoint IDs.`);
        for (const shardKey of shardKeys) {
          const scheduled = Object.fromEntries(Object.entries(service.stopSchedules || {}).filter(([stopId]) => stopId.startsWith(shardKey)));
          const quarantine = service.tndsQuarantine ? {
            ...service.tndsQuarantine,
            affectedStopIds: service.tndsQuarantine.affectedStopIds.filter(stopId => stopId.startsWith(shardKey)),
            patterns: service.tndsQuarantine.patterns.filter(pattern => pattern.affectedStopIds.some(stopId => stopId.startsWith(shardKey))).map(pattern => ({ ...pattern, affectedStopIds: pattern.affectedStopIds.filter(stopId => stopId.startsWith(shardKey)) }))
          } : null;
          const record = { ...service, stopSchedules: scheduled, tndsQuarantine: quarantine?.affectedStopIds.length ? quarantine : null };
          if (!shardFiles.has(shardKey)) shardFiles.set(shardKey, { file: path.join(work, `${shardKey}.jsonl`), identities: new Set() });
          const shard = shardFiles.get(shardKey);
          if (shard.identities.has(record.id)) throw new Error(`TNDS prepared service ${record.id} was duplicated in shard ${shardKey}.`);
          shard.identities.add(record.id);
          await fs.appendFile(shard.file, `${JSON.stringify(record)}\n`);
        }
      }
    } catch (error) {
      if (error.message === 'TNDS XML contains no Service record.') {
        console.log(`TNDS ${path.basename(file)}: no Service record; ignored as non-timetable registration data.`);
        continue;
      }
      throw new Error(`TNDS parser rejected ${path.basename(file)}: ${error.message}`);
    }
  }
  if (!serviceIds.size) throw new Error('TNDS preparation produced no services.');
  const serviceShards = {};
  for (const shardKey of [...shardFiles.keys()].sort()) {
    const byRegion = new Map();
    const lines = (await fs.readFile(shardFiles.get(shardKey).file, 'utf8')).trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const service = JSON.parse(line);
      const region = service.source.region.toLowerCase();
      if (!byRegion.has(region)) byRegion.set(region, []);
      byRegion.get(region).push(service);
    }
    for (const [region, records] of byRegion) {
      const relative = `services/${shardKey}-${region}.json.gz`;
      if (registeredPaths.has(relative) || await fs.access(path.join(output, relative)).then(() => true, () => false)) throw new Error(`TNDS prepared output collision ${relative}.`);
      registeredPaths.add(relative);
      const payload = { schema: 'atlas-prepared-bus-tnds-v1', region: region.toUpperCase(), stopPrefix: shardKey, services: records.sort((left, right) => left.id.localeCompare(right.id)) };
      await fs.writeFile(path.join(output, relative), gzipSync(`${JSON.stringify(payload)}\n`), { flag: 'wx' });
      if (!serviceShards[shardKey]) serviceShards[shardKey] = [];
      serviceShards[shardKey].push(relative);
    }
  }
  await fs.rm(work, { recursive: true, force: true });
  await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({
    schema: 'atlas-prepared-bus-tnds-v1',
    generatedAt: preparedAt,
    source: 'Traveline National Dataset v2.5',
    regions: [...regions].sort(),
    serviceCount: serviceIds.size,
    serviceShardKeyLength: TNDS_SERVICE_SHARD_KEY_LENGTH,
    serviceShards
  })}\n`);
  return { services: serviceIds.size, shards: Object.values(serviceShards).flat().length, regions: [...regions].sort(), quarantinedPatterns, quarantinedServices };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).map((value, index, values) => [value.replace(/^--/, ''), values[index + 1]]).filter(([key]) => key));
  const result = await prepareTnds({ input: args.input, output: args.output, preparedAt: args.preparedAt || new Date().toISOString() });
  console.log(JSON.stringify(result));
}
