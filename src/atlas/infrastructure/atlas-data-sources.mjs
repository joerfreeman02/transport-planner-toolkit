import { atlasDataSources } from '../../../atlas/config/atlas-data-sources.mjs';

function normaliseRelativePath(relativePath) {
  const value = String(relativePath ?? '').replace(/^\/+/, '');
  if (!value || value.includes('..') || value.includes('\\')) throw new Error(`Invalid ATLAS reference-data path: ${relativePath}`);
  return value;
}

function normaliseBaseUrl(value) {
  const url = new URL(String(value));
  if (!url.href.endsWith('/')) url.pathname += '/';
  return url.href;
}

function datasetConfig(config, key) {
  const dataset = config?.datasets?.[key];
  if (!dataset?.baseUrl) throw new Error(`ATLAS reference-data dataset is not configured: ${key}`);
  return { ...dataset, baseUrl: normaliseBaseUrl(dataset.baseUrl) };
}

export function createAtlasDataSourceResolver(config = atlasDataSources) {
  const datasets = new Map(['bus', 'tnds'].map(key => [key, datasetConfig(config, key)]));
  function getDataset(key) {
    const dataset = datasets.get(key);
    if (!dataset) throw new Error(`ATLAS reference-data dataset is not configured: ${key}`);
    return dataset;
  }
  function baseUrl(key) { return getDataset(key).baseUrl; }
  function fileUrl(key, relativePath) {
    const dataset = getDataset(key);
    const path = normaliseRelativePath(relativePath);
    const exact = dataset.pathMap?.[path];
    if (exact) return new URL(path, normaliseBaseUrl(exact)).toString();
    const root = [...(dataset.pathRoots ?? [])]
      .filter(item => item?.prefix && item?.baseUrl && path.startsWith(String(item.prefix)))
      .sort((left, right) => String(right.prefix).length - String(left.prefix).length)[0];
    return new URL(path, normaliseBaseUrl(root?.baseUrl ?? dataset.baseUrl)).toString();
  }
  return Object.freeze({
    baseUrl,
    fileUrl,
    manifestUrl: key => fileUrl(key, getDataset(key).manifest || 'manifest.json'),
    publicationManifestUrl: key => fileUrl(key, getDataset(key).publicationManifest || 'publication-manifest.json')
  });
}

export { normaliseRelativePath };
