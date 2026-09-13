import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { parseTndsTransXchangeServices } from '../../src/atlas/adapters/tnds-transxchange-adapter.mjs';
import { hasScheduledEvidence } from '../../src/atlas/domain/scheduled-evidence.mjs';

export const TNDS_REGIONS = Object.freeze(['EA', 'EM', 'NE', 'NW', 'SE', 'SW', 'WM', 'Y']);
export const TNDS_SERVICE_SHARD_KEY_LENGTH = 5;
export const TNDS_XML_MAX_BYTES = 64 * 1024 * 1024;

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

async function materializeShardRegion({ sourceFile, outputFile, shardKey, region, entries, stats }) {
  const temporaryOutput = `${outputFile}.part`;
  await fs.rm(temporaryOutput, { force: true });
  const sortedEntries = [...entries].sort((left, right) => left.id.localeCompare(right.id));
  const header = JSON.stringify({ schema: 'atlas-prepared-bus-tnds-v1', region: region.toUpperCase(), stopPrefix: shardKey });
  async function* chunks() {
    const source = await fs.open(sourceFile, 'r');
    try {
      yield Buffer.from(`${header.slice(0, -1)},"services":[`);
      for (const [index, entry] of sortedEntries.entries()) {
        const buffer = Buffer.allocUnsafe(entry.byteLength);
        const { bytesRead } = await source.read(buffer, 0, entry.byteLength, entry.offset);
        if (bytesRead !== entry.byteLength || buffer[entry.byteLength - 1] !== 0x0a) {
          throw new Error(`TNDS shard ${shardKey}/${region} contained an incomplete indexed record for ${entry.id}.`);
        }
        if (index) yield Buffer.from(',');
        yield buffer.subarray(0, -1);
        stats.maxBufferedRecordBytes = Math.max(stats.maxBufferedRecordBytes, entry.byteLength);
      }
      yield Buffer.from(']}\n');
    } finally {
      await source.close();
    }
  }
  try {
    await pipeline(chunks(), createGzip(), createWriteStream(temporaryOutput, { flags: 'wx' }));
    await fs.rename(temporaryOutput, outputFile);
  } catch (error) {
    await fs.rm(temporaryOutput, { force: true });
    throw new Error(`TNDS shard ${shardKey}/${region} materialisation failed: ${error.message}`);
  }
}

export async function prepareTnds({ input, output, preparedAt = new Date().toISOString(), maxXmlBytes = TNDS_XML_MAX_BYTES }) {
  const files = await walk(input);
  const filesByRegion = new Map();
  for (const file of files) {
    const region = regionFrom(file);
    if (!region) continue;
    if (!filesByRegion.has(region)) filesByRegion.set(region, []);
    filesByRegion.get(region).push(file);
  }
  const processedRegions = [];
  const regionServiceIds = new Map();
  const sourceFileCounts = {};
  const parsedFileCounts = {};
  const ignoredRegistrationFileCounts = {};
  const shardFiles = new Map();
  const shardRegionFiles = new Map();
  const serviceIds = new Set();
  const registeredPaths = new Set();
  const work = path.join(output, '.tnds-shards-work');
  const materialization = { sourceBytes: 0, recordCount: 0, maxRecordBytes: 0, maxBufferedRecordBytes: 0, shardRegionCount: 0 };
  const xmlByteLimit = Number.isInteger(maxXmlBytes) && maxXmlBytes > 0 ? maxXmlBytes : TNDS_XML_MAX_BYTES;
  let quarantinedPatterns = 0;
  let quarantinedServices = 0;
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(path.join(output, 'services'), { recursive: true });
  await fs.mkdir(work, { recursive: true });
  for (const region of [...filesByRegion.keys()].sort()) {
    const regionFiles = filesByRegion.get(region);
    const retainedServiceIds = new Set();
    let parsedFiles = 0;
    let ignoredRegistrationFiles = 0;
    let regionQuarantinedPatterns = 0;
    let regionQuarantinedServices = 0;
    for (const file of regionFiles) {
      try {
        const xmlSize = (await fs.stat(file)).size;
        if (xmlSize > xmlByteLimit) throw new Error(`XML input is ${xmlSize} bytes; exceeds the bounded ${xmlByteLimit}-byte limit; no data was dropped.`);
        const xml = await fs.readFile(file, 'utf8');
        const parsed = parseTndsTransXchangeServices(xml, { region, sourceArchive: path.basename(file), preparedAt });
        if (parsed.length) parsedFiles += 1;
        if (parsed.length > 1) console.log(`TNDS ${path.basename(file)}: prepared ${parsed.length} Service records.`);
        for (const service of parsed) {
          const hasSchedules = Object.values(service.stopSchedules ?? {}).some(hasScheduledEvidence);
          const quarantine = service.tndsQuarantine;
          if (!hasSchedules && !quarantine?.affectedStopIds?.length) continue;
          if (quarantine) {
            regionQuarantinedPatterns += quarantine.patterns.length;
            regionQuarantinedServices += quarantine.serviceQuarantined ? 1 : 0;
            console.log(`TNDS ${path.basename(file)}: quarantined ${quarantine.patterns.length} pattern(s) for service ${service.source.serviceCode || service.id}.`);
          }
          retainedServiceIds.add(service.id);
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
            if (!shardFiles.has(shardKey)) shardFiles.set(shardKey, { identities: new Set() });
            const shard = shardFiles.get(shardKey);
            if (shard.identities.has(record.id)) throw new Error(`TNDS prepared service ${record.id} was duplicated in shard ${shardKey}.`);
            shard.identities.add(record.id);
            const shardRegionKey = `${shardKey}\u0000${region}`;
            if (!shardRegionFiles.has(shardRegionKey)) shardRegionFiles.set(shardRegionKey, { file: path.join(work, `${shardKey}-${region}.jsonl`), entries: [], bytes: 0 });
            const shardRegion = shardRegionFiles.get(shardRegionKey);
            const serialized = Buffer.from(`${JSON.stringify(record)}\n`);
            shardRegion.entries.push({ id: record.id, offset: shardRegion.bytes, byteLength: serialized.byteLength });
            shardRegion.bytes += serialized.byteLength;
            materialization.sourceBytes += serialized.byteLength;
            materialization.recordCount += 1;
            materialization.maxRecordBytes = Math.max(materialization.maxRecordBytes, serialized.byteLength);
            await fs.appendFile(shardRegion.file, serialized);
          }
        }
      } catch (error) {
        if (error.message === 'TNDS XML contains no Service record.') {
          ignoredRegistrationFiles += 1;
          console.log(`TNDS ${path.basename(file)}: no Service record; ignored as non-timetable registration data.`);
          continue;
        }
        throw new Error(`TNDS parser rejected ${path.basename(file)}: ${error.message}`);
      }
    }
    processedRegions.push(region);
    regionServiceIds.set(region, retainedServiceIds);
    sourceFileCounts[region] = regionFiles.length;
    parsedFileCounts[region] = parsedFiles;
    ignoredRegistrationFileCounts[region] = ignoredRegistrationFiles;
    quarantinedPatterns += regionQuarantinedPatterns;
    quarantinedServices += regionQuarantinedServices;
    console.log(`TNDS ${region}: processed ${regionFiles.length} XML file(s); parsed ${parsedFiles}; retained ${retainedServiceIds.size} service(s); ignored ${ignoredRegistrationFiles} registration file(s); quarantined ${regionQuarantinedPatterns} pattern(s)/${regionQuarantinedServices} service(s).`);
  }
  if (!serviceIds.size) throw new Error('TNDS preparation produced no services.');
  const regionServiceCounts = Object.fromEntries([...regionServiceIds.entries()].map(([region, ids]) => [region, ids.size]));
  const serviceShards = {};
  for (const [shardRegionKey, shardRegion] of [...shardRegionFiles.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const [shardKey, region] = shardRegionKey.split('\u0000');
    const relative = `services/${shardKey}-${region.toLowerCase()}.json.gz`;
    if (registeredPaths.has(relative) || await fs.access(path.join(output, relative)).then(() => true, () => false)) throw new Error(`TNDS prepared output collision ${relative}.`);
    registeredPaths.add(relative);
    await materializeShardRegion({ sourceFile: shardRegion.file, outputFile: path.join(output, relative), shardKey, region, entries: shardRegion.entries, stats: materialization });
    materialization.shardRegionCount += 1;
    if (!serviceShards[shardKey]) serviceShards[shardKey] = [];
    serviceShards[shardKey].push(relative);
  }
  await fs.rm(work, { recursive: true, force: true });
  await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({
    schema: 'atlas-prepared-bus-tnds-v1',
    generatedAt: preparedAt,
    source: 'Traveline National Dataset v2.5',
    expectedRegions: [...TNDS_REGIONS],
    regions: processedRegions,
    regionServiceCounts,
    sourceFileCounts,
    parsedFileCounts,
    ignoredRegistrationFileCounts,
    quarantinedPatternCount: quarantinedPatterns,
    quarantinedServiceCount: quarantinedServices,
    serviceCount: serviceIds.size,
    serviceShardKeyLength: TNDS_SERVICE_SHARD_KEY_LENGTH,
    serviceShards
  })}\n`);
  return { services: serviceIds.size, shards: Object.values(serviceShards).flat().length, expectedRegions: [...TNDS_REGIONS], regions: processedRegions, regionServiceCounts, sourceFileCounts, parsedFileCounts, ignoredRegistrationFileCounts, quarantinedPatterns, quarantinedServices, materialization };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).map((value, index, values) => [value.replace(/^--/, ''), values[index + 1]]).filter(([key]) => key));
  const result = await prepareTnds({ input: args.input, output: args.output, preparedAt: args.preparedAt || new Date().toISOString() });
  console.log(JSON.stringify(result));
}
