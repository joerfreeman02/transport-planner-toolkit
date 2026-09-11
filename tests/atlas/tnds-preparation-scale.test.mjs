import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
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
  for (const relative of Object.values(manifest.serviceShards).flat()) {
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

  const scaleInput = path.join(root, 'scale-input');
  const scaleOutput = path.join(root, 'scale-output');
  await fs.mkdir(scaleInput, { recursive: true });
  const serviceCount = 1800;
  await Promise.all(Array.from({ length: serviceCount }, (_, index) => {
    const code = `scale-${String(index).padStart(4, '0')}`;
    return fs.writeFile(path.join(scaleInput, `EA-${String(serviceCount - index).padStart(5, '0')}.xml`), serviceXml(code));
  }));
  const scaleResult = await prepareTnds({ input: scaleInput, output: scaleOutput, preparedAt });
  const scaleServices = await readServices(scaleOutput);
  assert.equal(scaleResult.services, serviceCount);
  assert.equal(scaleResult.materialization.recordCount, serviceCount);
  assert.equal(scaleServices.length, serviceCount, 'scale preparation retains every generated service');
  assert.deepEqual(scaleServices.map(service => service.id), [...scaleServices].sort((left, right) => left.id.localeCompare(right.id)).map(service => service.id), 'scale output remains deterministically sorted');
  assert.ok(scaleResult.materialization.sourceBytes > scaleResult.materialization.maxRecordBytes * 1000, 'stress input exceeds one-record memory scale');
  assert.equal(scaleResult.materialization.maxBufferedRecordBytes, scaleResult.materialization.maxRecordBytes, 'materialisation buffers one indexed record at a time');
  assert.equal(scaleResult.materialization.shardRegionCount, 1);

  const oversizedInput = path.join(root, 'oversized-input');
  await fs.mkdir(oversizedInput, { recursive: true });
  await fs.writeFile(path.join(oversizedInput, 'EA-oversized.xml'), Buffer.alloc(2048, 0x20));
  await assert.rejects(
    () => prepareTnds({ input: oversizedInput, output: path.join(root, 'oversized-output'), preparedAt, maxXmlBytes: 1024 }),
    /exceeds the bounded 1024-byte limit; no data was dropped/
  );

  const source = await fs.readFile(new URL('../../tools/atlas-bus-data/prepare_tnds.mjs', import.meta.url), 'utf8');
  assert.match(source, /pipeline\(chunks\(\), createGzip\(\)/, 'shard materialisation is incremental and backpressure-aware');
  assert.doesNotMatch(source, /readFile\(shardFiles/, 'whole-shard read is not used');
  assert.doesNotMatch(source, /JSON\.stringify\(payload\)/, 'whole-shard payload stringify is not used');
  assert.match(source, /TNDS_XML_MAX_BYTES/, 'oversized individual XML input is explicitly bounded');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log('PASS TNDS bounded-materialisation equivalence, scale and oversized-input regressions.');
