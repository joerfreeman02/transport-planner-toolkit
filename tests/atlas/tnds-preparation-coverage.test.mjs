import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { prepareTnds, TNDS_REGIONS } from '../../tools/atlas-bus-data/prepare_tnds.mjs';

function serviceXml(region) {
  const origin = `${region}0001`;
  const destination = `${region}0002`;
  return `<TransXChange SchemaVersion="2.5"><Operators><Operator><TradingName>Coverage Fixture</TradingName></Operator></Operators><Services><Service><ServiceCode>S-${region}</ServiceCode><LineName>${region}</LineName><StandardService><Origin>${origin}</Origin><Destination>${destination}</Destination></StandardService></Service></Services><StopPoints><AnnotatedStopPointRef><StopPointRef>${origin}</StopPointRef><CommonName>${origin}</CommonName></AnnotatedStopPointRef><AnnotatedStopPointRef><StopPointRef>${destination}</StopPointRef><CommonName>${destination}</CommonName></AnnotatedStopPointRef></StopPoints><JourneyPatternSections><JourneyPatternSection id="JPS-${region}"><JourneyPatternTimingLink><From><StopPointRef>${origin}</StopPointRef></From><To><StopPointRef>${destination}</StopPointRef></To><RunTime>PT10M</RunTime></JourneyPatternTimingLink></JourneyPatternSection></JourneyPatternSections><JourneyPatterns><JourneyPattern id="JP-${region}"><Direction>outbound</Direction><DestinationDisplay>${destination}</DestinationDisplay><JourneyPatternSectionRefs>JPS-${region}</JourneyPatternSectionRefs></JourneyPattern></JourneyPatterns><VehicleJourneys><VehicleJourney><VehicleJourneyCode>V-${region}</VehicleJourneyCode><JourneyPatternRef>JP-${region}</JourneyPatternRef><DepartureTime>08:00:00</DepartureTime><OperatingProfile><RegularDayType><DaysOfWeek><MondayToFriday/></DaysOfWeek></RegularDayType></OperatingProfile></VehicleJourney></VehicleJourneys></TransXChange>`;
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-tnds-coverage-'));
const input = path.join(root, 'input');
const output = path.join(root, 'prepared');
try {
  for (const region of TNDS_REGIONS) {
    const directory = path.join(input, region);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, `${region}-service.xml`), serviceXml(region));
  }
  await fs.writeFile(path.join(input, 'EA', 'EA-registration.xml'), '<TransXChange SchemaVersion="2.5"><Operators/></TransXChange>');

  const result = await prepareTnds({ input, output, preparedAt: '2026-09-11T00:00:00.000Z' });
  assert.equal(result.services, TNDS_REGIONS.length);
  assert.deepEqual(result.expectedRegions, TNDS_REGIONS);
  assert.deepEqual(result.regions, TNDS_REGIONS);
  assert.deepEqual(result.regionServiceCounts, Object.fromEntries(TNDS_REGIONS.map(region => [region, 1])));
  assert.equal(result.sourceFileCounts.EA, 2);
  assert.equal(result.parsedFileCounts.EA, 1);
  assert.equal(result.ignoredRegistrationFileCounts.EA, 1);
  assert.equal(result.sourceFileCounts.Y, 1);

  const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.expectedRegions, TNDS_REGIONS);
  assert.deepEqual(manifest.regions, TNDS_REGIONS);
  assert.deepEqual(manifest.regionServiceCounts, result.regionServiceCounts);
  assert.deepEqual(manifest.sourceFileCounts, result.sourceFileCounts);
  assert.deepEqual(manifest.ignoredRegistrationFileCounts, result.ignoredRegistrationFileCounts);
  const paths = Object.values(manifest.serviceShards).flat();
  const prepared = (await Promise.all(paths.map(async relative => {
    const payload = JSON.parse(gunzipSync(await fs.readFile(path.join(output, relative))).toString('utf8'));
    assert.equal(payload.schema, 'atlas-prepared-bus-tnds-v1');
    assert.equal(payload.stopPrefix.length, 5);
    return payload.services;
  }))).flat();
  const unique = [...new Map(prepared.map(service => [service.id, service])).values()];
  assert.equal(unique.length, TNDS_REGIONS.length);
  assert.deepEqual(unique.map(service => service.source.region).sort(), [...TNDS_REGIONS].sort());
  for (const service of unique) {
    const records = prepared.filter(candidate => candidate.id === service.id);
    assert.ok(records.some(candidate => candidate.stopSchedules[`${service.source.region}0001`]?.monday?.[0] === 480));
  }
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
console.log('PASS TNDS preparation processed-region coverage, diagnostics and EmptyType end-to-end fixture.');
