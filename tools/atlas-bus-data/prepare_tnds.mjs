import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { parseTndsTransXchangeServices } from '../../src/atlas/adapters/tnds-transxchange-adapter.mjs';
import { hasScheduledEvidence } from '../../src/atlas/domain/scheduled-evidence.mjs';

export const TNDS_REGIONS = Object.freeze(['EA', 'EM', 'NE', 'NW', 'SE', 'SW', 'WM', 'Y']);
export const TNDS_SERVICE_SHARD_KEY_LENGTH = 5;
export const TNDS_RUNTIME_SHARD_MAX_BYTES = 8 * 1024 * 1024;
// Exact Run #53 production-file parsing was measured at 169,291,408 bytes.
// Keep a finite guard with roughly 19% headroom above that current maximum.
export const TNDS_XML_MAX_BYTES = 192 * 1024 * 1024;

function emptyDepartureEvidence() {
  return Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day, []]));
}

function journeyKey(entry, day, index) {
  const identity = [entry?.journeyIdentity, entry?.sourceRecordId, entry?.patternIdentity, entry?.calendarProfileId]
    .map(value => String(value ?? '').trim());
  return identity.some(Boolean) ? identity.join('\u0000') : `unidentified\u0000${day}\u0000${index}\u0000${JSON.stringify(entry)}`;
}

export function fragmentTndsServiceRecord(record, maxBytes = TNDS_RUNTIME_SHARD_MAX_BYTES, options = {}) {
  const serializedBytes = Buffer.byteLength(JSON.stringify(record));
  if (serializedBytes <= maxBytes && !options.forceFragment) return [record];
  const days = Object.keys(emptyDepartureEvidence());
  const journeys = new Map();
  for (const day of days) {
    for (const [index, entry] of (record.departureEvidenceByDay?.[day] ?? []).entries()) {
      const key = journeyKey(entry, day, index);
      if (!journeys.has(key)) journeys.set(key, { evidence: emptyDepartureEvidence(), order: emptyDepartureEvidence() });
      journeys.get(key).evidence[day].push(entry);
      journeys.get(key).order[day].push(index);
    }
  }
  const common = { ...record, departureEvidenceByDay: emptyDepartureEvidence() };
  const commonBytes = options.commonBytesOverride ?? Buffer.byteLength(JSON.stringify(common));
  const budget = maxBytes - commonBytes - 512;
  if (budget < 1) throw new Error(`TNDS service ${record.id} requires ${commonBytes} bytes of indivisible metadata; exceeds the bounded ${maxBytes}-byte ceiling; no service was dropped.`);
  // Preserve the source's first-seen journey order. The original per-day row
  // indexes are carried so reconstruction can restore each day exactly even
  // when calendar-specific journey ordering differs between days.
  const groups = [...journeys.entries()];
  const parentDepartureEvidenceCount = days.reduce((total, day) => total + (record.departureEvidenceByDay?.[day] ?? []).length, 0);
  const parentEvidenceByDayCounts = Object.fromEntries(days.map(day => [day, (record.departureEvidenceByDay?.[day] ?? []).length]));
  const parts = [];
  let current = { evidence: emptyDepartureEvidence(), order: emptyDepartureEvidence() };
  let currentBytes = 2;
  for (const [, journey] of groups) {
    const groupBytes = days.reduce((total, day) => total + (journey.evidence[day] ?? []).reduce((sum, entry, index) => sum + Buffer.byteLength(JSON.stringify(entry)) + Buffer.byteLength(String(journey.order[day][index])) + 3, 0), 0);
    if (groupBytes + commonBytes + 1024 > maxBytes) throw new Error(`TNDS service ${record.id} contains one journey identity requiring ${groupBytes + commonBytes + 1024} bytes; exceeds the bounded ${maxBytes}-byte ceiling; no service was dropped.`);
    if (currentBytes + groupBytes > budget && days.some(day => current.evidence[day].length)) {
      parts.push(current);
      current = { evidence: emptyDepartureEvidence(), order: emptyDepartureEvidence() };
      currentBytes = 2;
    }
    for (const day of days) {
      current.evidence[day].push(...journey.evidence[day]);
      current.order[day].push(...journey.order[day]);
    }
    currentBytes += groupBytes;
  }
  if (days.some(day => current.evidence[day].length)) parts.push(current);
  if (parts.length < 2) throw new Error(`TNDS service ${record.id} exceeded the bounded runtime shard ceiling but could not be safely partitioned at journey boundaries.`);
  return parts.map(({ evidence: departureEvidenceByDay, order: evidenceOrderByDay }, index) => {
    const ordinal = index + 1;
    const fragmentDepartureEvidenceCount = days.reduce((total, day) => total + departureEvidenceByDay[day].length, 0);
    const fragment = { parentServiceId: record.id, fragmentId: `${record.id}#journey-fragment-${String(ordinal).padStart(4, '0')}`, ordinal, count: parts.length, fragmentDepartureEvidenceCount, parentDepartureEvidenceCount, parentEvidenceByDayCounts, evidenceOrderByDay };
    const service = { ...record, departureEvidenceByDay, fragment };
    const bytes = Buffer.byteLength(JSON.stringify(service));
    if (!options.deferFinalSizeCheck && bytes > maxBytes) throw new Error(`TNDS service ${record.id} fragment ${ordinal}/${parts.length} measures ${bytes} bytes, exceeding the bounded ${maxBytes}-byte runtime shard ceiling.`);
    return service;
  });
}

async function ensureDiskReserve(directory, upcomingBytes = 0) {
  const required = Number(process.env.ATLAS_TNDS_DISK_RESERVE_BYTES || 0);
  if (!required) return;
  const { bavail, bsize } = await fs.statfs(directory);
  if (bavail * bsize < required + upcomingBytes) throw new Error('TNDS disk reserve threshold reached; no source service was dropped.');
}

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

async function materializeShardRegion({ sourceFile, outputFile, shardKey, region, entries, stats, maxRuntimeShardBytes }) {
  await ensureDiskReserve(path.dirname(outputFile), (await fs.stat(sourceFile)).size);
  const temporaryOutput = `${outputFile}.part`;
  await fs.rm(temporaryOutput, { force: true });
  const sortedEntries = [...entries].sort((left, right) => left.id.localeCompare(right.id));
  const header = JSON.stringify({ schema: 'atlas-prepared-bus-tnds-v2', region: region.toUpperCase(), stopPrefix: shardKey });
  let uncompressedBytes = Buffer.byteLength(`${header.slice(0, -1)},"services":[`);
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
        uncompressedBytes += entry.byteLength - 1 + (index ? 1 : 0);
        stats.maxBufferedRecordBytes = Math.max(stats.maxBufferedRecordBytes, entry.byteLength);
      }
      yield Buffer.from(']}\n');
      uncompressedBytes += Buffer.byteLength(']}\n');
    } finally {
      await source.close();
    }
  }
  try {
    await pipeline(chunks(), createGzip(), createWriteStream(temporaryOutput, { flags: 'wx' }));
    if (uncompressedBytes > maxRuntimeShardBytes) throw new Error(`uncompressed TNDS runtime shard is ${uncompressedBytes} bytes; exceeds the bounded ${maxRuntimeShardBytes}-byte ceiling; no service was dropped.`);
    await fs.rename(temporaryOutput, outputFile);
  } catch (error) {
    await fs.rm(temporaryOutput, { force: true });
    throw new Error(`TNDS shard ${shardKey}/${region} materialisation failed: ${error.message}`);
  }
  return { compressedBytes: (await fs.stat(outputFile)).size, uncompressedBytes };
}

export async function prepareTnds({ input, output, preparedAt = new Date().toISOString(), maxXmlBytes = TNDS_XML_MAX_BYTES, maxRuntimeShardBytes = TNDS_RUNTIME_SHARD_MAX_BYTES }) {
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
  const regionServiceIdentitySha256 = {};
  const sourceFileCounts = {};
  const parsedFileCounts = {};
  const ignoredRegistrationFileCounts = {};
  const shardFiles = new Map();
  const shardRegionFiles = new Map();
  const serviceIds = new Set();
  const registeredPaths = new Set();
  const work = path.join(output, '.tnds-shards-work');
  const materialization = { sourceBytes: 0, recordCount: 0, logicalRecordCount: 0, logicalDepartureEvidenceCount: 0, fragmentDepartureEvidenceCount: 0, fragmentCount: 0, maxRecordBytes: 0, maxBufferedRecordBytes: 0, shardRegionCount: 0 };
  const xmlByteLimit = Number.isInteger(maxXmlBytes) && maxXmlBytes > 0 ? maxXmlBytes : TNDS_XML_MAX_BYTES;
  const runtimeShardByteLimit = Number.isInteger(maxRuntimeShardBytes) && maxRuntimeShardBytes > 0 ? maxRuntimeShardBytes : TNDS_RUNTIME_SHARD_MAX_BYTES;
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
          materialization.logicalRecordCount += 1;
          const serviceDepartureEvidenceCount = Object.values(service.departureEvidenceByDay || {}).reduce((total, values) => total + (Array.isArray(values) ? values.length : 0), 0);
          materialization.logicalDepartureEvidenceCount += serviceDepartureEvidenceCount;
          const ids = [...Object.keys(service.stopSchedules || {}), ...(service.tndsQuarantine?.affectedStopIds || [])];
          const shardKeys = [...new Set(ids.map(id => String(id).slice(0, TNDS_SERVICE_SHARD_KEY_LENGTH)).filter(Boolean))];
          if (!shardKeys.length) throw new Error(`TNDS service ${service.source.serviceCode || service.id} has no shardable StopPoint IDs.`);
          const scopedByShard = new Map();
          let largestScopedCommonBytes = 0;
          let requiresFragmentation = false;
          for (const shardKey of shardKeys) {
            if (!/^[A-Za-z0-9_-]{1,5}$/.test(shardKey)) throw new Error(`TNDS service ${service.source.serviceCode || service.id} has an unsafe StopPoint shard key.`);
            const scheduled = Object.fromEntries(Object.entries(service.stopSchedules || {}).filter(([stopId]) => stopId.startsWith(shardKey)));
            const quarantine = service.tndsQuarantine ? {
              ...service.tndsQuarantine,
              affectedStopIds: service.tndsQuarantine.affectedStopIds.filter(stopId => stopId.startsWith(shardKey)),
              patterns: service.tndsQuarantine.patterns.filter(pattern => pattern.affectedStopIds.some(stopId => stopId.startsWith(shardKey))).map(pattern => ({ ...pattern, affectedStopIds: pattern.affectedStopIds.filter(stopId => stopId.startsWith(shardKey)) }))
            } : null;
            const scopedQuarantine = quarantine?.affectedStopIds.length ? quarantine : null;
            const scopedRecord = { ...service, stopSchedules: scheduled, tndsQuarantine: scopedQuarantine };
            scopedByShard.set(shardKey, scopedRecord);
            const commonRecord = { ...scopedRecord, departureEvidenceByDay: emptyDepartureEvidence() };
            largestScopedCommonBytes = Math.max(largestScopedCommonBytes, Buffer.byteLength(JSON.stringify(commonRecord)));
            if (Buffer.byteLength(JSON.stringify(scopedRecord)) > runtimeShardByteLimit) requiresFragmentation = true;
          }
          let recordsByShard;
          if (requiresFragmentation) {
            // Fragment once against the largest prefix-scoped metadata shape.
            // This keeps every prefix copy on the same journey boundaries.
            const stableBase = { ...service, stopSchedules: {}, tndsQuarantine: null };
            const fragments = fragmentTndsServiceRecord(stableBase, runtimeShardByteLimit, {
              commonBytesOverride: largestScopedCommonBytes,
              forceFragment: true,
              deferFinalSizeCheck: true
            });
            if (fragments.length < 2) throw new Error(`TNDS service ${service.id} requires fragmentation but could not be partitioned safely.`);
            materialization.fragmentCount += fragments.length * scopedByShard.size;
            recordsByShard = new Map([...scopedByShard].map(([shardKey, scopedRecord]) => [shardKey, fragments.map(fragment => ({
              ...fragment,
              stopSchedules: scopedRecord.stopSchedules,
              tndsQuarantine: scopedRecord.tndsQuarantine
            }))]));
          } else {
            recordsByShard = new Map([...scopedByShard].map(([shardKey, scopedRecord]) => [shardKey, [scopedRecord]]));
          }
          for (const [shardKey, records] of recordsByShard) {
            for (const record of records) {
              const bytes = Buffer.byteLength(JSON.stringify(record));
              if (bytes > runtimeShardByteLimit) throw new Error(`TNDS service ${service.id}${record.fragment ? ` fragment ${record.fragment.ordinal}/${record.fragment.count}` : ''} measures ${bytes} bytes after stop-prefix scoping, exceeding the bounded ${runtimeShardByteLimit}-byte runtime shard ceiling.`);
            }
            if (!shardFiles.has(shardKey)) shardFiles.set(shardKey, { identities: new Set() });
            const shard = shardFiles.get(shardKey);
            const shardRegionKey = `${shardKey}\u0000${region}`;
            if (!shardRegionFiles.has(shardRegionKey)) shardRegionFiles.set(shardRegionKey, { file: path.join(work, `${shardKey}-${region}.jsonl`), entries: [], bytes: 0 });
            const shardRegion = shardRegionFiles.get(shardRegionKey);
            for (const record of records) {
              const identity = record.fragment?.fragmentId || record.id;
              if (shard.identities.has(identity)) throw new Error(`TNDS prepared fragment ${identity} was duplicated in shard ${shardKey}.`);
              shard.identities.add(identity);
              const serialized = Buffer.from(`${JSON.stringify(record)}\n`);
              const stopIds = [...new Set([...Object.keys(record.stopSchedules || {}), ...(record.tndsQuarantine?.affectedStopIds || [])])].sort();
              shardRegion.entries.push({ id: identity, parentServiceId: record.fragment?.parentServiceId, fragmentId: record.fragment?.fragmentId, fragmentOrdinal: record.fragment?.ordinal, fragmentCount: record.fragment?.count, fragmentDepartureEvidenceCount: record.fragment?.fragmentDepartureEvidenceCount, parentDepartureEvidenceCount: record.fragment?.parentDepartureEvidenceCount, parentEvidenceByDayCounts: record.fragment?.parentEvidenceByDayCounts, offset: shardRegion.bytes, byteLength: serialized.byteLength, stopIds });
              shardRegion.bytes += serialized.byteLength;
              materialization.sourceBytes += serialized.byteLength;
              materialization.recordCount += 1;
              materialization.fragmentDepartureEvidenceCount += Object.values(record.departureEvidenceByDay || {}).reduce((total, values) => total + (Array.isArray(values) ? values.length : 0), 0);
              materialization.maxRecordBytes = Math.max(materialization.maxRecordBytes, serialized.byteLength);
              await ensureDiskReserve(work, serialized.byteLength);
              await fs.appendFile(shardRegion.file, serialized);
            }
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
    regionServiceIdentitySha256[region] = createHash('sha256').update(`${[...retainedServiceIds].sort().join('\n')}\n`).digest('hex');
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
  const shardMetrics = [];
  for (const [shardRegionKey, shardRegion] of [...shardRegionFiles.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const [shardKey, region] = shardRegionKey.split('\u0000');
    const header = JSON.stringify({ schema: 'atlas-prepared-bus-tnds-v2', region: region.toUpperCase(), stopPrefix: shardKey });
    const baseBytes = Buffer.byteLength(`${header.slice(0, -1)},"services":[`);
    const footerBytes = Buffer.byteLength(']}\n');
    const partitions = [];
    let partition = [];
    let partitionBytes = baseBytes + footerBytes;
    for (const entry of [...shardRegion.entries].sort((left, right) => left.id.localeCompare(right.id))) {
      const recordBytes = entry.byteLength - 1;
      const nextBytes = partitionBytes + recordBytes + (partition.length ? 1 : 0);
      if (baseBytes + footerBytes + recordBytes > runtimeShardByteLimit) {
        throw new Error(`TNDS service ${entry.id} requires ${baseBytes + footerBytes + recordBytes} bytes in one runtime shard; exceeds the bounded ${runtimeShardByteLimit}-byte ceiling; no service was dropped.`);
      }
      if (entry.fragmentId) {
        if (partition.length) { partitions.push(partition); partition = []; partitionBytes = baseBytes + footerBytes; }
        partitions.push([entry]);
        continue;
      }
      if (partition.length && nextBytes > runtimeShardByteLimit) {
        partitions.push(partition);
        partition = [];
        partitionBytes = baseBytes + footerBytes;
      }
      partitionBytes += recordBytes + (partition.length ? 1 : 0);
      partition.push(entry);
    }
    if (partition.length) partitions.push(partition);
    for (let index = 0; index < partitions.length; index += 1) {
      const entries = partitions[index];
      const relative = `services/${shardKey}-${region.toLowerCase()}-${String(index + 1).padStart(4, '0')}.json.gz`;
      if (registeredPaths.has(relative) || await fs.access(path.join(output, relative)).then(() => true, () => false)) throw new Error(`TNDS prepared output collision ${relative}.`);
      registeredPaths.add(relative);
      const measured = await materializeShardRegion({ sourceFile: shardRegion.file, outputFile: path.join(output, relative), shardKey, region, entries, stats: materialization, maxRuntimeShardBytes: runtimeShardByteLimit });
      materialization.shardRegionCount += 1;
      if (!serviceShards[shardKey]) serviceShards[shardKey] = [];
      const descriptor = { path: relative, stopIds: [...new Set(entries.flatMap(entry => entry.stopIds))].sort(), ...measured };
      if (entries.length === 1 && entries[0].fragmentId) {
        Object.assign(descriptor, { parentServiceId: entries[0].parentServiceId, fragmentId: entries[0].fragmentId, fragmentOrdinal: entries[0].fragmentOrdinal, fragmentCount: entries[0].fragmentCount, fragmentDepartureEvidenceCount: entries[0].fragmentDepartureEvidenceCount, parentDepartureEvidenceCount: entries[0].parentDepartureEvidenceCount, parentEvidenceByDayCounts: entries[0].parentEvidenceByDayCounts });
      }
      serviceShards[shardKey].push(descriptor);
      shardMetrics.push(measured);
    }
  }
  await fs.rm(work, { recursive: true, force: true });
  await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({
    schema: 'atlas-prepared-bus-tnds-v2',
    generatedAt: preparedAt,
    source: 'Traveline National Dataset v2.5',
    expectedRegions: [...TNDS_REGIONS],
    regions: processedRegions,
    regionServiceCounts,
    regionServiceIdentitySha256,
    sourceFileCounts,
    parsedFileCounts,
    ignoredRegistrationFileCounts,
    quarantinedPatternCount: quarantinedPatterns,
    quarantinedServiceCount: quarantinedServices,
    serviceCount: serviceIds.size,
    logicalRecordCount: materialization.logicalRecordCount,
    logicalDepartureEvidenceCount: materialization.logicalDepartureEvidenceCount,
    fragmentDepartureEvidenceCount: materialization.fragmentDepartureEvidenceCount,
    fragmentRecordCount: materialization.fragmentCount,
    serviceShardKeyLength: TNDS_SERVICE_SHARD_KEY_LENGTH,
    runtimeShardMaxBytes: runtimeShardByteLimit,
    runtimeShardCount: shardMetrics.length,
    runtimeShardMaxObservedBytes: Math.max(...shardMetrics.map(shard => shard.uncompressedBytes)),
    runtimeShardTotalBytes: shardMetrics.reduce((total, shard) => total + shard.uncompressedBytes, 0),
    serviceShards
  })}\n`);
  return { services: serviceIds.size, shards: Object.values(serviceShards).flat().length, expectedRegions: [...TNDS_REGIONS], regions: processedRegions, regionServiceCounts, sourceFileCounts, parsedFileCounts, ignoredRegistrationFileCounts, quarantinedPatterns, quarantinedServices, materialization };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map((value, index, values) => [value.replace(/^--/, ''), values[index + 1]]).filter(([key]) => key));
  try {
    const result = await prepareTnds({ input: args.input, output: args.output, preparedAt: args.preparedAt || new Date().toISOString() });
    console.log(JSON.stringify(result));
  } catch (error) {
    // Keep diagnostics bounded and omit stack traces or source XML.
    process.stderr.write(`TNDS preparation failed (${error.name || 'Error'}): ${String(error.message || '').slice(0, 512)}\n`);
    process.exitCode = 1;
  }
}
