import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { gridCellKey } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const dataRoot = path.join(root, 'atlas', 'data', 'bus');
const manifest = JSON.parse(readFileSync(path.join(dataRoot, 'manifest.json'), 'utf8'));

assert.equal(manifest.schema, 'atlas-prepared-bus-data-v1');
assert.match(manifest.snapshotDate, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(Number.isNaN(Date.parse(`${manifest.snapshotDate}T00:00:00Z`)), false);
assert.equal(Object.hasOwn(manifest.sources.naptan, 'downloadedAt'), false, 'NaPTAN preparation time must not be labelled as a source download timestamp.');
assert.equal(Object.hasOwn(manifest.sources.bods, 'downloadedAt'), false, 'BODS preparation time must not be labelled as a source download timestamp.');

assert.ok(
  manifest.sources.naptan.stopCount > 300000,
  'Prepared NaPTAN population is unexpectedly small.'
);

assert.ok(
  Array.isArray(manifest.sources.bods.regions) && manifest.sources.bods.regions.length >= 8,
  'Prepared BODS input does not contain the expected national regional coverage.'
);

assert.equal(
  new Set(manifest.sources.bods.regions.map(region => region.region)).size,
  manifest.sources.bods.regions.length,
  'Prepared BODS region identifiers are not unique.'
);

assert.ok(
  Object.keys(manifest.stopShards).length > 300,
  'Prepared stop index contains unexpectedly few spatial shards.'
);

assert.ok(
  manifest.sources.bods.regions.reduce((total, region) => total + region.serviceCount, 0) > 25000,
  'Prepared BODS service population is unexpectedly small.'
);

const referenced = [
  ...Object.values(manifest.stopShards),
  ...new Set(Object.values(manifest.serviceShards).flat())
];

assert.ok(referenced.length > 700, 'Prepared bus dataset references unexpectedly few shards.');

for (const relative of referenced) {
  const absolute = path.join(dataRoot, relative);
  assert.equal(existsSync(absolute), true, `Missing prepared-data shard: ${relative}`);
  assert.ok(
    statSync(absolute).size < 10 * 1024 * 1024,
    `Prepared-data shard is too large for controlled browser use: ${relative}`
  );
}

const sourceFiles = readdirSync(dataRoot, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => entry.name);

assert.equal(
  sourceFiles.some(name => /\.(?:csv|zip)$/i.test(name)),
  false,
  'Raw official downloads must not be committed as browser data.'
);

function readGzip(relative) {
  return JSON.parse(gunzipSync(readFileSync(path.join(dataRoot, relative))).toString('utf8'));
}

for (const control of [
  { name: 'Waltham Cross', latitude: 51.6857829, longitude: -0.0330001 },
  { name: 'Cambridge', latitude: 52.2053, longitude: 0.1218 }
]) {
  const cell = gridCellKey(
    Math.floor(control.latitude / manifest.gridSize),
    Math.floor(control.longitude / manifest.gridSize)
  );

  const stopPath = manifest.stopShards[cell];
  assert.ok(stopPath, `${control.name} has no prepared stop shard.`);

  const stopDocument = readGzip(stopPath);
  assert.equal(stopDocument.schema, manifest.schema);
  assert.ok(stopDocument.stops.length > 0, `${control.name} prepared stop shard is empty.`);

  const nearby = stopDocument.stops
    .map(raw => Object.fromEntries(manifest.stopFields.map((field, index) => [field, raw[index]])))
    .filter(stop => {
      const latitude = (stop.latitude - control.latitude) * Math.PI / 180;
      const longitude = (stop.longitude - control.longitude) * Math.PI / 180;
      const a = Math.sin(latitude / 2) ** 2
        + Math.cos(control.latitude * Math.PI / 180)
        * Math.cos(stop.latitude * Math.PI / 180)
        * Math.sin(longitude / 2) ** 2;
      return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= 700;
    });

  assert.ok(nearby.length > 0, `${control.name} has no prepared NaPTAN stop within 700 metres.`);

  if (control.name === 'Cambridge') {
    assert.ok(
      nearby.some(stop => /British National Grid/.test(stop.coordinateMethod)),
      'Cambridge control does not prove British National Grid conversion.'
    );
  }
}

const servicePaths = Object.values(manifest.serviceShards).flat();
assert.ok(servicePaths.length > 0, 'Prepared bus dataset contains no service shards.');
const sampleServiceDocument = readGzip(servicePaths[0]);
assert.equal(sampleServiceDocument.schema, manifest.schema);
assert.ok(
  Array.isArray(sampleServiceDocument.services) && sampleServiceDocument.services.length > 0
);

console.log(
  `PASS Prepared bus data integrity - ${manifest.sources.naptan.stopCount} active NaPTAN stops, `
  + `${referenced.length} referenced shards and ${manifest.sources.bods.regions.length} BODS regions verified.`
);
