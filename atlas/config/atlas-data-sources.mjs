const localDataset = directory => Object.freeze({
  baseUrl: new URL(`../data/${directory}/`, import.meta.url).toString(),
  manifest: 'manifest.json',
  publicationManifest: 'publication-manifest.json',
  pathRoots: []
});

export const atlasDataSources = Object.freeze({
  schema: 'atlas-data-sources-v1',
  publicationVersion: 'local-checkout',
  generatedAt: null,
  datasets: Object.freeze({
    bus: localDataset('bus'),
    tnds: localDataset('bus-tnds'),
    nptg: null
  })
});
