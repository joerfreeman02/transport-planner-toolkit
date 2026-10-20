import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { parseTndsTransXchangeServices } from '../../src/atlas/adapters/tnds-transxchange-adapter.mjs';
import { prepareTnds, TNDS_XML_MAX_BYTES } from '../../tools/atlas-bus-data/prepare_tnds.mjs';

const preparedAt = '2026-09-11T00:00:00.000Z';

function serviceXml(code, stopPrefix = 'EA000') {
  const origin = `${stopPrefix}1`;
  const destination = `${stopPrefix}2`;
  return `<TransXChange SchemaVersion="2.5"><Operators><Operator><TradingName>Scale Fixture</TradingName></Operator></Operators><Services><Service><ServiceCode>${code}</ServiceCode><LineName>${code}</LineName><StandardService><Origin>${origin}</Origin><Destination>${destination}</Destination></StandardService></Service></Services><StopPoints><AnnotatedStopPointRef><StopPointRef>${origin}</StopPointRef><CommonName>${origin}</CommonName></AnnotatedStopPointRef><AnnotatedStopPointRef><StopPointRef>${destination}</StopPointRef><CommonName>${destination}</CommonName></AnnotatedStopPointRef></StopPoints><JourneyPatternSections><JourneyPatternSection id="JPS-${code}"><JourneyPatternTimingLink><From><StopPointRef>${origin}</StopPointRef></From><To><StopPointRef>${destination}</StopPointRef></To><RunTime>PT10M</RunTime></JourneyPatternTimingLink></JourneyPatternSection></JourneyPatternSections><JourneyPatterns><JourneyPattern id="JP-${code}"><Direction>outbound</Direction><DestinationDisplay>${destination}</DestinationDisplay><JourneyPatternSectionRefs>JPS-${code}</JourneyPatternSectionRefs></JourneyPattern></JourneyPatterns><VehicleJourneys><VehicleJourney><VehicleJourneyCode>V-${code}</VehicleJourneyCode><JourneyPatternRef>JP-${code}</JourneyPatternRef><DepartureTime>08:00:00</DepartureTime><OperatingProfile><MondayToFriday>true</MondayToFriday></OperatingProfile></VehicleJourney></VehicleJourneys></TransXChange>`;
}

async function readServices(output) {
  const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8'));
  const services = [];
  for (const item of Object.values(manifest.serviceShards).flat()) {
    const relative = typeof item === 'string' ? item : item.path;
    const payload = JSON.parse(gunzipSync(await fs.readFile(path.join(output, relative))).toString('utf8'));
    services.push(...payload.services);
  }
  return services;
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-tnds-scale-'));
try {
  const ordinaryInput = path.join(root, 'ordinary-input');
  const ordinaryOutput = path.join(root, 'ordinary-output');
  await fs.mkdir(ordinaryInput, { recursive: true });
  const ordinaryFiles = [
    ['EA-z.xml', 'ordinary-z'],
    ['EA-a.xml', 'ordinary-a'],
    ['EA-m.xml', 'ordinary-m']
  ];
  await Promise.all(ordinaryFiles.map(([name, code]) => fs.writeFile(path.join(ordinaryInput, name), serviceXml(code))));
  const ordinaryExpected = ordinaryFiles.map(([name, code]) => parseTndsTransXchangeServices(serviceXml(code), { region: 'EA', sourceArchive: name, preparedAt })[0]).sort((left, right) => left.id.localeCompare(right.id));
  const ordinaryResult = await prepareTnds({ input: ordinaryInput, output: ordinaryOutput, preparedAt });
  assert.deepEqual(await readServices(ordinaryOutput), ordinaryExpected, 'streamed materialisation preserves ordinary parser output and ordering');
  assert.equal(ordinaryResult.materialization.recordCount, ordinaryExpected.length);

  assert.equal(TNDS_XML_MAX_BYTES, 192 * 1024 * 1024, 'large XML remains subject to the measured finite document limit');
  const largeInput = path.join(root, 'large-input');
  const largeOutput = path.join(root, 'large-output');
  await fs.mkdir(largeInput, { recursive: true });
  const largeFile = path.join(largeInput, 'SE-large.xml');
  const largeHandle = await fs.open(largeFile, 'w');
  try {
    await largeHandle.writeFile(serviceXml('large-valid', 'SE000').replace('</TransXChange>', '<!--'));
    const commentChunk = Buffer.alloc(1024 * 1024, 0x78);
    for (let index = 0; index < 65; index += 1) await largeHandle.write(commentChunk);
    await largeHandle.writeFile('--></TransXChange>');
  } finally {
    await largeHandle.close();
  }
  const largeSize = (await fs.stat(largeFile)).size;
  assert.ok(largeSize > 64 * 1024 * 1024, 'valid XML regression crosses the historical 64 MiB boundary');
  assert.ok(largeSize < TNDS_XML_MAX_BYTES, 'scaled large XML remains below the measured finite ceiling');
  const largeXml = await fs.readFile(largeFile, 'utf8');
  const largeExpected = parseTndsTransXchangeServices(largeXml, { region: 'SE', sourceArchive: 'SE-large.xml', preparedAt });
  const largeResult = await prepareTnds({ input: largeInput, output: largeOutput, preparedAt });
  const largeServices = await readServices(largeOutput);
  assert.equal(largeResult.services, 1, 'large valid XML retains its Service');
  assert.deepEqual(largeServices, largeExpected, 'large preparation preserves full parser output without truncation');
  assert.equal(largeServices[0].operator, 'Scale Fixture');
  assert.deepEqual(largeServices[0].routePatternStopIds, ['SE0001', 'SE0002']);
  assert.deepEqual(largeServices[0].stopSchedules.SE0001.monday, [480]);
  assert.equal(largeServices[0].calendarEvidence[0].resolutionStatus, 'resolved');
  assert.equal(largeServices[0].patternVariants[0].patternId, 'JP-large-valid');
  assert.deepEqual(largeServices[0].stops.map(stop => stop.id), ['SE0001', 'SE0002']);

  const fragmentedInput = path.join(root, 'fragmented-input');
  const fragmentedOutput = path.join(root, 'fragmented-output');
  await fs.mkdir(fragmentedInput, { recursive: true });
  const journeyRows = Array.from({ length: 500 }, (_, index) => `<VehicleJourney><VehicleJourneyCode>V-FRAG-${String(index).padStart(4, '0')}</VehicleJourneyCode><JourneyPatternRef>JP-fragmented</JourneyPatternRef><DepartureTime>08:00:00</DepartureTime><OperatingProfile><MondayToFriday>true</MondayToFriday></OperatingProfile></VehicleJourney>`).join('');
  const fragmentedXml = serviceXml('fragmented', 'SE000').replace(/<VehicleJourneys>[\s\S]*?<\/VehicleJourneys>/, `<VehicleJourneys>${journeyRows}</VehicleJourneys>`);
  await fs.writeFile(path.join(fragmentedInput, 'SE-fragmented.xml'), fragmentedXml);
  const fragmentedExpected = parseTndsTransXchangeServices(fragmentedXml, { region: 'SE', sourceArchive: 'SE-fragmented.xml', preparedAt })[0];
  const fragmentLimit = 8 * 1024;
  const fragmentResult = await prepareTnds({ input: fragmentedInput, output: fragmentedOutput, preparedAt, maxRuntimeShardBytes: fragmentLimit });
  const fragmentManifest = JSON.parse(await fs.readFile(path.join(fragmentedOutput, 'manifest.json'), 'utf8'));
  const fragmentDescriptors = Object.values(fragmentManifest.serviceShards).flat().filter(item => item.parentServiceId === fragmentedExpected.id);
  assert.ok(fragmentDescriptors.length > 1, 'journey-expanded source record is split into semantic physical shards');
  assert.equal(fragmentManifest.logicalRecordCount, 1);
  assert.ok(fragmentDescriptors.every(item => item.fragmentCount === fragmentDescriptors.length && item.uncompressedBytes <= fragmentLimit && item.compressedBytes > 0));
  const fragmentRows = [];
  for (const descriptor of fragmentDescriptors) {
    const bytes = gunzipSync(await fs.readFile(path.join(fragmentedOutput, descriptor.path)));
    assert.equal(bytes.byteLength, descriptor.uncompressedBytes, 'descriptor decompressed size matches the physical shard');
    const payload = JSON.parse(bytes.toString('utf8'));
    assert.equal(payload.services.length, 1, 'oversized fragments are isolated for exact compressed/decompressed accounting');
    const row = payload.services[0];
    assert.equal(row.fragment.parentServiceId, descriptor.parentServiceId);
    assert.equal(row.fragment.fragmentId, descriptor.fragmentId);
    assert.equal(row.fragment.ordinal, descriptor.fragmentOrdinal);
    fragmentRows.push(row);
  }
  fragmentRows.sort((left, right) => left.fragment.ordinal - right.fragment.ordinal);
  const reconstructedEvidence = Object.fromEntries(Object.keys(fragmentedExpected.departureEvidenceByDay).map(day => [day, fragmentRows.flatMap(row => row.departureEvidenceByDay[day] ?? [])]));
  assert.deepEqual(reconstructedEvidence, fragmentedExpected.departureEvidenceByDay, 'prepared semantic fragments conserve every journey row');
  assert.equal(fragmentRows[0].routeNumber, fragmentedExpected.routeNumber);
  assert.equal(fragmentRows[0].operator, fragmentedExpected.operator);
  assert.deepEqual(fragmentRows[0].calendarEvidence, fragmentedExpected.calendarEvidence);
  assert.deepEqual(fragmentRows[0].stopSchedules, fragmentedExpected.stopSchedules);
  assert.equal(fragmentResult.services, 1, 'fragment count never inflates logical service count');

  const scaleInput = path.join(root, 'scale-input');
  const scaleOutput = path.join(root, 'scale-output');
  await fs.mkdir(scaleInput, { recursive: true });
  const serviceCount = 1800;
  await Promise.all(Array.from({ length: serviceCount }, (_, index) => {
    const code = `scale-${String(index).padStart(4, '0')}`;
    return fs.writeFile(path.join(scaleInput, `EA-${String(serviceCount - index).padStart(5, '0')}.xml`), serviceXml(code));
  }));
  const runtimeLimit = 32 * 1024;
  const scaleResult = await prepareTnds({ input: scaleInput, output: scaleOutput, preparedAt, maxRuntimeShardBytes: runtimeLimit });
  const scaleServices = await readServices(scaleOutput);
  assert.equal(scaleResult.services, serviceCount);
  assert.equal(scaleResult.materialization.recordCount, serviceCount);
  assert.equal(scaleServices.length, serviceCount, 'scale preparation retains every generated service');
  assert.deepEqual(scaleServices.map(service => service.id), [...scaleServices].sort((left, right) => left.id.localeCompare(right.id)).map(service => service.id), 'scale output remains deterministically sorted');
  assert.ok(scaleResult.materialization.sourceBytes > scaleResult.materialization.maxRecordBytes * 1000, 'stress input exceeds one-record memory scale');
  assert.equal(scaleResult.materialization.maxBufferedRecordBytes, scaleResult.materialization.maxRecordBytes, 'materialisation buffers one indexed record at a time');
  const scaleManifest = JSON.parse(await fs.readFile(path.join(scaleOutput, 'manifest.json'), 'utf8'));
  assert.equal(scaleManifest.schema, 'atlas-prepared-bus-tnds-v2');
  assert.equal(scaleManifest.runtimeShardMaxBytes, runtimeLimit);
  assert.ok(scaleManifest.runtimeShardCount > 1, 'large stop-prefix output is split into deterministic bounded subshards');
  assert.ok(scaleManifest.runtimeShardMaxObservedBytes <= runtimeLimit);
  assert.ok(scaleManifest.serviceShards[Object.keys(scaleManifest.serviceShards)[0]].every(shard => shard.stopIds.length > 0 && shard.uncompressedBytes <= runtimeLimit && shard.compressedBytes > 0));
  assert.equal(scaleResult.materialization.shardRegionCount, scaleManifest.runtimeShardCount);
  assert.equal(scaleServices.length, serviceCount, 'multi-shard materialisation preserves every service');
  assert.ok(scaleServices.every(service => service.operator === 'Scale Fixture' && service.calendarEvidence.length && Object.values(service.stopSchedules).some(schedule => schedule.monday.length)), 'multi-shard materialisation preserves operators, calendars and schedules');
  const repeatedOutput = path.join(root, 'scale-output-repeat');
  await prepareTnds({ input: scaleInput, output: repeatedOutput, preparedAt, maxRuntimeShardBytes: runtimeLimit });
  const repeatedManifest = JSON.parse(await fs.readFile(path.join(repeatedOutput, 'manifest.json'), 'utf8'));
  assert.deepEqual(repeatedManifest, scaleManifest, 'same source and preparedAt yield byte-identical shard index metadata');
  for (const shard of Object.values(scaleManifest.serviceShards).flat()) {
    assert.deepEqual(await fs.readFile(path.join(repeatedOutput, shard.path)), await fs.readFile(path.join(scaleOutput, shard.path)), 'gzip subshards are deterministic');
  }

  const oversizedInput = path.join(root, 'oversized-input');
  await fs.mkdir(oversizedInput, { recursive: true });
  await fs.writeFile(path.join(oversizedInput, 'EA-oversized.xml'), Buffer.alloc(2048, 0x20));
  await assert.rejects(
    () => prepareTnds({ input: oversizedInput, output: path.join(root, 'oversized-output'), preparedAt, maxXmlBytes: 1024 }),
    /exceeds the bounded 1024-byte limit; no data was dropped/
  );

  await assert.rejects(
    () => prepareTnds({ input: ordinaryInput, output: path.join(root, 'runtime-oversized-output'), preparedAt, maxRuntimeShardBytes: 256 }),
    /exceeds the bounded 256-byte ceiling; no service was dropped/
  );

  const source = await fs.readFile(new URL('../../tools/atlas-bus-data/prepare_tnds.mjs', import.meta.url), 'utf8');
  assert.match(source, /pipeline\(chunks\(\), createGzip\(\)/, 'shard materialisation is incremental and backpressure-aware');
  assert.doesNotMatch(source, /readFile\(shardFiles/, 'whole-shard read is not used');
  assert.doesNotMatch(source, /JSON\.stringify\(payload\)/, 'whole-shard payload stringify is not used');
  assert.match(source, /TNDS_XML_MAX_BYTES/, 'oversized individual XML input is explicitly bounded');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log('PASS TNDS bounded-materialisation equivalence, large-XML semantics, scale and oversized-input regressions.');
