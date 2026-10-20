import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseTndsTransXchangeServices } from '../../src/atlas/adapters/tnds-transxchange-adapter.mjs';
import { hasScheduledEvidence } from '../../src/atlas/domain/scheduled-evidence.mjs';

export const TNDS_RECORD_MEASUREMENT_REGIONS = Object.freeze(['EA', 'EM', 'NE', 'NW', 'SE', 'SW', 'WM', 'Y']);
export const TNDS_RECORD_MEASUREMENT_LIMIT_BYTES = 8 * 1024 * 1024;

const SIZE_FIELDS = Object.freeze([
  'departureEvidenceByDay',
  'stopSchedules',
  'patternVariants',
  'routePatternStopIds',
  'routePatternStops',
  'principalLocations',
  'calendarEvidence',
  'stops',
  'source',
  'description'
]);

function serializedBytes(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function countDepartureValues(stopSchedules = {}) {
  return Object.values(stopSchedules).reduce((total, days) => total
    + Object.values(days ?? {}).reduce((dayTotal, values) => dayTotal + (Array.isArray(values) ? values.length : 0), 0), 0);
}

function countJourneyEvidence(departureEvidenceByDay = {}) {
  return Object.values(departureEvidenceByDay).reduce((total, values) => total + (Array.isArray(values) ? values.length : 0), 0);
}

function probableDrivers(fieldBytes) {
  const ranked = Object.entries(fieldBytes).sort((left, right) => right[1] - left[1]);
  const [largestField, largestBytes] = ranked[0] ?? ['', 0];
  if (!largestBytes) return ['empty or scalar service fields'];
  if (largestBytes / Object.values(fieldBytes).reduce((total, value) => total + value, 0) >= 0.5) {
    if (largestField === 'departureEvidenceByDay') return ['timetable journey expansion'];
    if (largestField === 'stopSchedules') return ['per-stop timetable schedule expansion'];
    if (['patternVariants', 'routePatternStopIds', 'routePatternStops'].includes(largestField)) return ['journey-pattern or ordered stop-sequence expansion'];
    if (largestField === 'calendarEvidence') return ['calendar evidence expansion'];
  }
  return ['mixed prepared-service fields'];
}

export function measureTndsRecord(record, { region, sourceFile } = {}) {
  if (!record || typeof record !== 'object' || !record.id) throw new TypeError('TNDS measurement requires a prepared record with a stable identity.');
  const fieldBytes = Object.fromEntries(SIZE_FIELDS.map(field => [field, Object.hasOwn(record, field) ? serializedBytes(record[field]) : 0]));
  const stopIds = [...new Set([
    ...Object.keys(record.stopSchedules ?? {}),
    ...(record.tndsQuarantine?.affectedStopIds ?? [])
  ].map(String))].sort();
  const prefixCopies = new Set(stopIds.map(stopId => stopId.slice(0, 5)).filter(Boolean)).size;
  const bytes = serializedBytes(record);
  return {
    id: String(record.id),
    region: String(region ?? record.source?.region ?? 'unknown').toUpperCase(),
    sourceFile: path.basename(String(sourceFile ?? record.source?.archive ?? 'unknown')),
    bytes,
    fieldBytes,
    probableDrivers: probableDrivers(fieldBytes),
    stopCount: Object.keys(record.stopSchedules ?? {}).length,
    scheduleDepartureCount: countDepartureValues(record.stopSchedules),
    journeyEvidenceCount: countJourneyEvidence(record.departureEvidenceByDay),
    calendarEvidenceCount: Array.isArray(record.calendarEvidence) ? record.calendarEvidence.length : 0,
    patternVariantCount: Array.isArray(record.patternVariants) ? record.patternVariants.length : 0,
    routePatternStopCount: Array.isArray(record.routePatternStopIds) ? record.routePatternStopIds.length : 0,
    stopPrefixCopies: prefixCopies,
    estimatedDuplicatedMetadataBytesAcrossStopPrefixes: bytes * Math.max(0, prefixCopies - 1)
  };
}

async function walkXml(root) {
  const files = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (/\.xml$/i.test(entry.name)) files.push(file);
    }
  }
  await visit(root);
  return files.sort((left, right) => left.localeCompare(right));
}

function quantile(sorted, fraction) {
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function summariseTndsRecordMeasurements(records, { xmlFileCount = 0, ignoredRegistrationFileCount = 0 } = {}) {
  const sortedSizes = records.map(record => record.bytes).sort((left, right) => left - right);
  const sortedIdentities = [...new Set(records.map(record => record.id))].sort();
  const perRegion = Object.fromEntries(TNDS_RECORD_MEASUREMENT_REGIONS.map(region => [region, records.filter(record => record.region === region).length]));
  const perRegionIdentitySha256 = Object.fromEntries(TNDS_RECORD_MEASUREMENT_REGIONS.map(region => {
    const identities = records.filter(record => record.region === region).map(record => record.id).sort();
    return [region, createHash('sha256').update(`${identities.join('\n')}\n`).digest('hex')];
  }));
  const over = threshold => records.filter(record => record.bytes > threshold).length;
  const mib = 1024 * 1024;
  return {
    schema: 'atlas-tnds-logical-record-measurement-v1',
    recordCount: records.length,
    distinctRecordIdentityCount: new Set(records.map(record => record.id)).size,
    logicalRecordIdentitySha256: createHash('sha256').update(`${sortedIdentities.join('\n')}\n`).digest('hex'),
    perRegionIdentitySha256,
    logicalDepartureEvidenceCount: records.reduce((total, record) => total + Number(record.journeyEvidenceCount || 0), 0),
    xmlFileCount,
    ignoredRegistrationFileCount,
    perRegionRecordCounts: perRegion,
    serializedBytes: {
      total: sortedSizes.reduce((total, value) => total + value, 0),
      minimum: sortedSizes[0] ?? null,
      median: quantile(sortedSizes, 0.5),
      p90: quantile(sortedSizes, 0.9),
      p95: quantile(sortedSizes, 0.95),
      p99: quantile(sortedSizes, 0.99),
      maximum: sortedSizes.at(-1) ?? null,
      countOver8MiB: over(8 * mib),
      countOver12MiB: over(12 * mib),
      countOver16MiB: over(16 * mib),
      countOver32MiB: over(32 * mib),
      buckets: {
        upTo8MiB: records.filter(record => record.bytes <= 8 * mib).length,
        over8To12MiB: records.filter(record => record.bytes > 8 * mib && record.bytes <= 12 * mib).length,
        over12To16MiB: records.filter(record => record.bytes > 12 * mib && record.bytes <= 16 * mib).length,
        over16To32MiB: records.filter(record => record.bytes > 16 * mib && record.bytes <= 32 * mib).length,
        over32MiB: records.filter(record => record.bytes > 32 * mib).length
      }
    },
    top25: [...records].sort((left, right) => right.bytes - left.bytes || left.id.localeCompare(right.id)).slice(0, 25)
  };
}

export async function measureTndsSnapshot({ input, output = null, requireAllRegions = true, preparedAt = '2026-10-19T07:45:16Z' } = {}) {
  const root = path.resolve(input);
  const files = await walkXml(root);
  const records = [];
  const preparedRecords = [];
  const nonRuntimeMaterializableRecords = [];
  const errors = [];
  let ignoredRegistrationFileCount = 0;
  const seenIdentities = new Set();
  for (const file of files) {
    const relative = path.relative(root, file);
    const match = relative.match(/(?:^|[\\/_.-])(EA|EM|NE|NW|SE|SW|WM|Y)(?:[\\/_.-]|$)/i);
    const region = match?.[1]?.toUpperCase();
    if (!region) throw new Error(`TNDS source XML has no recognised region identity: ${relative}`);
    let services;
    try {
      const stat = await fs.stat(file);
      if (stat.size > 192 * 1024 * 1024) throw new Error(`XML input is ${stat.size} bytes; exceeds the established 201326592-byte preparation limit.`);
      const xml = await fs.readFile(file, 'utf8');
      services = parseTndsTransXchangeServices(xml, { region, sourceArchive: path.basename(file), preparedAt });
    } catch (error) {
      if (error.message === 'TNDS XML contains no Service record.') {
        ignoredRegistrationFileCount += 1;
        continue;
      }
      errors.push(`${relative}: ${String(error.message ?? error).slice(0, 512)}`);
      throw new Error(`TNDS exhaustive measurement aborted; no malformed source was skipped. ${errors.at(-1)}`);
    }
    for (const service of services) {
      const measured = measureTndsRecord(service, { region, sourceFile: file });
      if (seenIdentities.has(measured.id)) throw new Error(`TNDS measurement found duplicate logical record identity ${measured.id}.`);
      seenIdentities.add(measured.id);
      records.push(measured);
      const hasSchedules = Object.values(service.stopSchedules ?? {}).some(hasScheduledEvidence);
      const quarantineHasStops = (service.tndsQuarantine?.affectedStopIds ?? []).length > 0;
      if (hasSchedules || quarantineHasStops) preparedRecords.push(measured);
      else nonRuntimeMaterializableRecords.push({
        id: measured.id,
        region: measured.region,
        sourceFile: measured.sourceFile,
        scheduleDepartureCount: measured.scheduleDepartureCount,
        quarantineAffectedStopCount: 0,
        reason: 'no scheduled departure evidence and no quarantine-affected stops'
      });
    }
  }
  const receivedRegions = new Set(records.map(record => record.region));
  const missingRegions = TNDS_RECORD_MEASUREMENT_REGIONS.filter(region => !receivedRegions.has(region));
  if (requireAllRegions && missingRegions.length) throw new Error(`TNDS exhaustive measurement is missing region(s): ${missingRegions.join(', ')}.`);
  const parsedSummary = summariseTndsRecordMeasurements(records, { xmlFileCount: files.length, ignoredRegistrationFileCount });
  const report = {
    ...summariseTndsRecordMeasurements(preparedRecords, { xmlFileCount: files.length, ignoredRegistrationFileCount }),
    preparedRecordCount: preparedRecords.length,
    parsedRecordCount: records.length,
    nonRuntimeMaterializableRecordCount: nonRuntimeMaterializableRecords.length,
    nonRuntimeMaterializableRecords,
    parsedLogicalRecordIdentitySha256: parsedSummary.logicalRecordIdentitySha256,
    parsedPerRegionRecordCounts: parsedSummary.perRegionRecordCounts,
    parsedPerRegionIdentitySha256: parsedSummary.perRegionIdentitySha256,
    parsedSerializedBytes: parsedSummary.serializedBytes,
    parsedLogicalDepartureEvidenceCount: parsedSummary.logicalDepartureEvidenceCount,
    parsedTop25: parsedSummary.top25,
    regions: [...receivedRegions].sort(),
    missingRegions,
    limitBytes: TNDS_RECORD_MEASUREMENT_LIMIT_BYTES,
    preparedAt,
    sourceAcquisition: false
  };
  if (output) await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map((value, index, values) => [value.replace(/^--/, ''), values[index + 1]]).filter(([key]) => key));
  try {
    const report = await measureTndsSnapshot({ input: args.input, output: args.output, requireAllRegions: args['require-all-regions'] !== 'false', preparedAt: args['prepared-at'] || '2026-10-19T07:45:16Z' });
    console.log(JSON.stringify({ schema: report.schema, recordCount: report.recordCount, maxBytes: report.serializedBytes.maximum, countOver8MiB: report.serializedBytes.countOver8MiB, countOver12MiB: report.serializedBytes.countOver12MiB, countOver16MiB: report.serializedBytes.countOver16MiB, countOver32MiB: report.serializedBytes.countOver32MiB, output: args.output || null }));
  } catch (error) {
    process.stderr.write(`TNDS measurement failed (${error.name || 'Error'}): ${String(error.message || error).slice(0, 1024)}\n`);
    process.exitCode = 1;
  }
}
