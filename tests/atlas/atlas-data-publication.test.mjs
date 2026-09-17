import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildAtlasDataSources, measurePublicationTree, PAGES_DATASET_LIMIT_BYTES, preparePublications, renderAtlasDataSourcesModule } from '../../tools/atlas-data-publication/publication.mjs';
import { createAtlasDataSourceResolver } from '../../src/atlas/infrastructure/atlas-data-sources.mjs';
import { createPreparedBusDataAdapter, nearbyGridCellKeys } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { confirmSite, createSite } from '../../src/atlas/domain/site.mjs';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-data-publication-'));
const candidate = path.join(temp, 'candidate');
await fs.mkdir(path.join(candidate, 'atlas', 'data', 'bus', 'stops'), { recursive: true });
await fs.mkdir(path.join(candidate, 'atlas', 'data', 'bus', 'services'), { recursive: true });
await fs.mkdir(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services'), { recursive: true });
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-data-v1', generatedAt: '2026-09-17T00:00:00Z', sources: { bods: { regions: [{ region: 'SE' }] } } }));
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'stops', 'g1.json.gz'), 'stop');
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'services', '100-se.json.gz'), 'service');
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-tnds-v1', generatedAt: '2026-09-17T00:00:00Z', regions: ['SE'] }));
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services', '100-se.json'), 'tnds');

const bus = await measurePublicationTree(path.join(candidate, 'atlas', 'data', 'bus'));
assert.equal(bus.fileCount, 3);
assert.ok(bus.bytes < PAGES_DATASET_LIMIT_BYTES);
const config = buildAtlasDataSources({ publicationVersion: '20260917T000000Z', generatedAt: '2026-09-17T00:00:00Z', busBaseUrl: 'https://example.test/bus/20260917T000000Z', tndsBaseUrl: 'https://example.test/tnds/20260917T000000Z' });
assert.equal(config.datasets.nptg, null);
assert.equal(createAtlasDataSourceResolver({ ...config, datasets: { ...config.datasets, bus: { ...config.datasets.bus, pathRoots: [{ prefix: 'services/', baseUrl: 'https://data.example.test/bus-services/' }] } } }).fileUrl('bus', 'services/100-se.json.gz'), 'https://data.example.test/bus-services/services/100-se.json.gz');
assert.match(renderAtlasDataSourcesModule(config), /atlasDataSources/);

const externalSite = confirmSite(createSite({ suppliedAddress: 'External fixture', displayAddress: 'External fixture', latitude: 51.6858, longitude: -0.033, assessmentPoint: { method: 'coordinates_entered' } }), { confirmedAt: '2026-09-17T00:00:00Z' });
const externalCell = nearbyGridCellKeys(externalSite, 700, 0.1)[0];
const externalStop = { id: '2100A', name: 'External stop', indicator: 'A', direction: 'N', latitude: 51.6859, longitude: -0.0331, areaCode: '210', modifiedAt: '2026-09-17T00:00:00Z', routes: ['10'] };
const externalBusManifest = { schema: 'atlas-prepared-bus-data-v1', generatedAt: '2026-09-17T00:00:00Z', gridSize: 0.1, serviceShardKeyLength: 5, stopFields: ['id', 'name', 'indicator', 'direction', 'latitude', 'longitude', 'areaCode', 'modifiedAt', 'routes'], stopShards: { [externalCell]: 'stops/external.json.gz' }, serviceShards: { '2100A': ['services/external.json.gz'] }, sources: { naptan: { url: 'https://official.example/naptan' }, bods: { url: 'https://official.example/bods' } } };
const externalTndsManifest = { schema: 'atlas-prepared-bus-tnds-v1', generatedAt: '2026-09-17T00:00:00Z', serviceShardKeyLength: 5, serviceShards: { '2100A': ['services/external.json.gz'] }, regions: ['SE'], serviceCount: 1 };
const externalService = { id: 'external:10', routeNumber: '10', operator: 'External Buses', origin: 'Town', destination: 'City', direction: 'City', stopSchedules: { '2100A': { monday: [360] } } };
const externalTndsService = { id: 'tnds:external:10', routeNumber: '10', operator: 'External Buses', stopSchedules: { '2100A': { monday: [360] } }, tndsQuarantine: null };
const externalCalls = [];
const externalFetch = async url => {
  const pathname = new URL(url).pathname;
  externalCalls.push(url);
  const body = pathname.endsWith('/manifest.json') && pathname.includes('/tnds/') ? externalTndsManifest
    : pathname.endsWith('/manifest.json') ? externalBusManifest
      : pathname.endsWith('/stops/external.json.gz') ? { schema: 'atlas-prepared-bus-data-v1', stops: [externalStop] }
        : pathname.endsWith('/services/external.json.gz') && pathname.includes('/tnds/') ? { schema: 'atlas-prepared-bus-tnds-v1', stopPrefix: '2100A', services: [externalTndsService] }
          : pathname.endsWith('/services/external.json.gz') ? { schema: 'atlas-prepared-bus-data-v1', services: [externalService] }
            : null;
  return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response('', { status: 404 });
};
const externalConfig = { ...config, datasets: { ...config.datasets, bus: { ...config.datasets.bus, baseUrl: 'https://data.example.test/bus/20260917T000000Z/' }, tnds: { ...config.datasets.tnds, baseUrl: 'https://data.example.test/tnds/20260917T000000Z/' } } };
const externalResolver = createAtlasDataSourceResolver(externalConfig);
const externalAdapter = createPreparedBusDataAdapter({ fetchImpl: externalFetch, baseUrl: externalResolver.baseUrl('bus'), tndsBaseUrl: externalResolver.baseUrl('tnds'), busFileUrl: path => externalResolver.fileUrl('bus', path), tndsFileUrl: path => externalResolver.fileUrl('tnds', path) });
assert.equal((await externalAdapter.nearbyStops(externalSite)).data[0].id, '2100A');
assert.equal((await externalAdapter.servicesForStops([externalStop])).data[0].id, 'external:10');
assert.ok(externalCalls.some(url => url.startsWith('https://data.example.test/')));

const result = await preparePublications({ candidateSite: candidate, busDestination: path.join(temp, 'bus-publication'), tndsDestination: path.join(temp, 'tnds-publication'), publicationVersion: '20260917T000000Z', generatedAt: '2026-09-17T00:00:00Z', busBaseUrl: 'https://example.test/bus/20260917T000000Z/', tndsBaseUrl: 'https://example.test/tnds/20260917T000000Z/', configOutput: path.join(temp, 'app', 'atlas', 'config', 'atlas-data-sources.mjs') });
assert.equal(result.bus.fileCount, 4);
assert.equal(result.tnds.fileCount, 3);
assert.equal(JSON.parse(await fs.readFile(path.join(temp, 'app', 'atlas', 'config', 'atlas-data-sources.json'), 'utf8')).publicationVersion, '20260917T000000Z');
console.log('PASS ATLAS data publication measurement, config resolution, manifest and publication preparation contracts.');
