import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { allocateTndsPublicationRoots, allocateTndsRegions, assertPublicationFits, buildAtlasDataSources, measureCandidateDatasets, measurePublicationTree, PAGES_DATASET_LIMIT_BYTES, preparePublications, promoteBoundedPublication, renderAtlasDataSourcesModule, rollbackBoundedPublication, SAFE_PUBLICATION_LIMIT_BYTES, TNDS_REGIONS } from '../../tools/atlas-data-publication/publication.mjs';
import { createAtlasDataSourceResolver } from '../../src/atlas/infrastructure/atlas-data-sources.mjs';
import { createPreparedBusDataAdapter, nearbyGridCellKeys } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { confirmSite, createSite } from '../../src/atlas/domain/site.mjs';
import { validatePublishedConfiguration } from '../../tools/atlas-data-publication/validate-publication.mjs';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-data-publication-'));
const candidate = path.join(temp, 'candidate');
await fs.mkdir(path.join(candidate, 'atlas', 'data', 'bus', 'stops'), { recursive: true });
await fs.mkdir(path.join(candidate, 'atlas', 'data', 'bus', 'services'), { recursive: true });
await fs.mkdir(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services'), { recursive: true });
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-data-v1', generatedAt: '2026-09-17T00:00:00Z', sources: { bods: { regions: [{ region: 'SE' }] } } }));
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'stops', 'g1.json.gz'), 'stop');
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'services', '100-se.json.gz'), 'service');
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-tnds-v1', generatedAt: '2026-09-17T00:00:00Z', expectedRegions: TNDS_REGIONS, regions: TNDS_REGIONS }));
for (const region of TNDS_REGIONS) await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services', `100-${region.toLowerCase()}.json`), `tnds-${region}`);

const bus = await measurePublicationTree(path.join(candidate, 'atlas', 'data', 'bus'));
assert.equal(bus.fileCount, 3);
assert.ok(bus.bytes < PAGES_DATASET_LIMIT_BYTES);
const config = buildAtlasDataSources({ publicationVersion: '20260917T000000Z', generatedAt: '2026-09-17T00:00:00Z', busBaseUrl: 'https://example.test/bus/20260917T000000Z', tndsBaseUrl: 'https://example.test/tnds/20260917T000000Z' });
assert.equal(config.datasets.nptg, null);
assert.equal(config.datasets.bus.slot, null);
assert.equal(createAtlasDataSourceResolver({ ...config, datasets: { ...config.datasets, bus: { ...config.datasets.bus, pathRoots: [{ prefix: 'services/', baseUrl: 'https://data.example.test/bus-services/' }] } } }).fileUrl('bus', 'services/100-se.json.gz'), 'https://data.example.test/bus-services/services/100-se.json.gz');
assert.match(renderAtlasDataSourcesModule(config), /atlasDataSources/);
const regionalConfig = buildAtlasDataSources({ publicationVersion: 'v', generatedAt: 'now', busSiteUrl: 'https://data.example.test/bus', tndsSiteUrl: 'https://data.example.test/tnds', busSlot: 'slot-a', tndsSlot: 'slot-b', tndsPathRoots: [{ prefix: 'services/100-ea', baseUrl: 'https://ea.example.test/tnds/slot-b/' }, { prefix: 'services/100-se', baseUrl: 'https://se.example.test/tnds/slot-b/' }] });
const regionalResolver = createAtlasDataSourceResolver(regionalConfig);
assert.equal(regionalResolver.fileUrl('tnds', 'services/100-ea.json'), 'https://ea.example.test/tnds/slot-b/services/100-ea.json');
assert.equal(regionalResolver.fileUrl('tnds', 'services/100-se.json'), 'https://se.example.test/tnds/slot-b/services/100-se.json');
const regionalFixture = { files: TNDS_REGIONS.map(region => ({ path: `services/100-${region.toLowerCase()}.json`, bytes: 1, sha256: 'x' })) };
assert.equal(Object.keys(allocateTndsRegions(regionalFixture, TNDS_REGIONS).regions).length, 8);
assert.throws(() => allocateTndsRegions(regionalFixture, [...TNDS_REGIONS, 'ZZ']), /unsupported expected|missing expected/);
const routingMeasurement = { files: [{ path: 'manifest.json', bytes: 8, sha256: 'manifest' }, ...TNDS_REGIONS.map(region => ({ path: `services/large-${region.toLowerCase()}.json.gz`, bytes: 200_000_000, sha256: region }))] };
const routing = allocateTndsPublicationRoots(routingMeasurement);
assert.equal(routing.roots.length, 4);
assert.deepEqual([...Object.values(routing.shardToRoot)].sort(), ['root-1', 'root-1', 'root-2', 'root-2', 'root-3', 'root-3', 'root-4', 'root-4']);
assert.ok(routing.roots.every(root => root.fit && root.projectedTotalPublicationFootprintBytes <= SAFE_PUBLICATION_LIMIT_BYTES));
assert.throws(() => allocateTndsPublicationRoots(routingMeasurement, { rootIds: ['only-root'], allowAdditionalRoots: false }), /Configured TNDS publication roots/);
assert.throws(() => assertPublicationFits({ bytes: SAFE_PUBLICATION_LIMIT_BYTES + 1, fileCount: 1 }, 'total site'), /safe bounded-publication limit/);
const oversizedCandidate = path.join(temp, 'oversized-candidate');
await fs.cp(candidate, oversizedCandidate, { recursive: true });
await fs.writeFile(path.join(oversizedCandidate, 'atlas', 'data', 'bus-tnds', 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-tnds-v1', expectedRegions: TNDS_REGIONS }));
const syntheticOversizedTnds = { root: 'synthetic', files: [{ path: 'manifest.json', bytes: 8, sha256: 'manifest' }, ...TNDS_REGIONS.map(region => ({ path: `services/synthetic-${region.toLowerCase()}.json`, bytes: 112624999, sha256: region }))], fileCount: 9, bytes: 901000000, sha256: 'oversized', largest: [] };
const oversizedMeasurement = await measureCandidateDatasets(oversizedCandidate, { measureTree: async root => root.endsWith(`${path.sep}bus-tnds`) ? syntheticOversizedTnds : measurePublicationTree(root) });
assert.equal(oversizedMeasurement.tnds.candidateBytes, 901000000);
assert.equal(oversizedMeasurement.tnds.candidateFiles, 9);
assert.equal(oversizedMeasurement.tnds.fitsSafeLimit, false);
assert.equal(Object.values(oversizedMeasurement.tnds.regions.regions).filter(region => region.fileCount > 0).length, 8);
assert.equal(oversizedMeasurement.proposedPublicationGroups.tnds.find(group => group.group === 'national-tnds').fitsSafeLimit, false);

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

const busRepository = path.join(temp, 'bus-publication');
const tndsRepository = path.join(temp, 'tnds-publication');
const result = await preparePublications({ candidateSite: candidate, busRepository, tndsRepository, publicationVersion: '20260917T000000Z', generatedAt: '2026-09-17T00:00:00Z', busSiteUrl: 'https://example.test/bus', tndsSiteUrl: 'https://example.test/tnds', configOutput: path.join(temp, 'app', 'atlas', 'config', 'atlas-data-sources.mjs') });
assert.equal(result.bus.candidate.fileCount, 4);
assert.equal(result.tnds[0].candidate.fileCount, 10);
assert.equal(result.bus.candidateSlot, 'slot-a');
assert.equal(result.tnds[0].candidateSlot, 'slot-a');
assert.ok(result.bus.totalSite.bytes < SAFE_PUBLICATION_LIMIT_BYTES);
assert.ok(result.tnds[0].totalSite.bytes < SAFE_PUBLICATION_LIMIT_BYTES);
const second = await preparePublications({ candidateSite: candidate, busRepository, tndsRepository, activeBusSlot: 'slot-a', activeTndsSlot: 'slot-a', publicationVersion: '20260918T000000Z', generatedAt: '2026-09-18T00:00:00Z', busSiteUrl: 'https://example.test/bus', tndsSiteUrl: 'https://example.test/tnds', configOutput: path.join(temp, 'app', 'atlas', 'config', 'atlas-data-sources.mjs') });
assert.equal(second.bus.candidateSlot, 'slot-b');
assert.equal(second.tnds[0].candidateSlot, 'slot-b');
assert.equal((await fs.readdir(busRepository)).filter(name => name.startsWith('slot-')).length, 2);
assert.equal((await fs.readdir(tndsRepository)).filter(name => name.startsWith('slot-')).length, 2);
assert.equal((await fs.stat(path.join(busRepository, 'releases')).catch(() => null)), null);
const publishedConfig = JSON.parse(await fs.readFile(path.join(temp, 'app', 'atlas', 'config', 'atlas-data-sources.json'), 'utf8'));
assert.equal(publishedConfig.publicationVersion, '20260918T000000Z');
assert.equal(publishedConfig.datasets.bus.slot, 'slot-b');
assert.equal(publishedConfig.datasets.tnds.slot, 'slot-b');
assert.equal(publishedConfig.datasets.tnds.roots[0].slot, 'slot-b');
const publicationFetch = async url => {
  const parsed = new URL(url);
  const repository = parsed.hostname === 'example.test' && parsed.pathname.startsWith('/bus/') ? busRepository : tndsRepository;
  const relative = parsed.pathname.split('/').filter(Boolean).slice(1).join('/');
  try { return new Response(await fs.readFile(path.join(repository, relative)), { status: 200 }); }
  catch { return new Response('', { status: 404 }); }
};
const validation = await validatePublishedConfiguration({ config: publishedConfig, fetchImpl: publicationFetch });
assert.equal(validation.ok, true);
assert.equal(validation.validatedTndsShardCount, 8);
const badFetch = async url => {
  const response = await publicationFetch(url);
  if (new URL(url).pathname.endsWith('/services/100-se.json')) return new Response('tampered', { status: 200 });
  return response;
};
await assert.rejects(() => validatePublishedConfiguration({ config: publishedConfig, fetchImpl: badFetch }), /checksum|byte-count/);
assert.deepEqual(JSON.parse(await fs.readFile(path.join(temp, 'app', 'atlas', 'config', 'atlas-data-sources.json'), 'utf8')), publishedConfig);

const promoted = await promoteBoundedPublication({ repository: busRepository, candidateSlot: 'slot-b', publicationVersion: '20260918T000000Z' });
assert.equal(promoted.lifecycle, 'current');
assert.equal(promoted.currentSlot, 'slot-b');
const rolledBack = await rollbackBoundedPublication({ repository: busRepository });
assert.equal(rolledBack.lifecycle, 'rolled-back');
assert.equal(rolledBack.currentSlot, 'slot-a');
console.log('PASS ATLAS data publication measurement, regional routing, bounded lifecycle, config resolution and publication contracts.');
