import { bngToWgs84, wgs84ToBng } from './crs.js';

export const BASEMAP_PROVIDERS = Object.freeze({
  'osm-standard': Object.freeze({
    id: 'osm-standard',
    name: 'OpenStreetMap Standard',
    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: 'Map data (c) OpenStreetMap contributors, ODbL 1.0',
    policyUrl: 'https://operations.osmfoundation.org/policies/tiles/',
    reportIssueUrl: 'https://www.openstreetmap.org/fixthemap',
    tileSize: 256,
    minZoom: 0,
    maxZoom: 19,
    maxTilesPerView: 80
  })
});

const MODE_ZOOM = Object.freeze({
  'regional-plan': 13,
  'regional-routing': 13,
  'local-context': 17,
  'local-routing': 17
});

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function basemapProvider(id = 'osm-standard') {
  const provider = BASEMAP_PROVIDERS[id];
  if (!provider) throw new Error(`Unsupported basemap provider: ${id}.`);
  return provider;
}

export function validateBasemapProvider(provider) {
  if (!provider || !provider.id || !provider.name) throw new Error('A named basemap provider is required.');
  if (!/\{z\}/.test(provider.urlTemplate || '') || !/\{x\}/.test(provider.urlTemplate || '') || !/\{y\}/.test(provider.urlTemplate || '')) throw new Error('Basemap provider URL must contain {z}, {x} and {y}.');
  if (!(provider.tileSize > 0) || !(provider.maxTilesPerView > 0)) throw new Error('Basemap provider tile size and viewport limit must be positive.');
  return Object.freeze({ ...provider });
}

export function tileUrl(provider, zoom, x, y) {
  return provider.urlTemplate.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y));
}

function worldPixel(lonLat, zoom) {
  const [lon, latitude] = lonLat;
  const lat = clamp(latitude, -85.05112878, 85.05112878) * Math.PI / 180;
  const scale = 2 ** zoom;
  return {
    x: (lon + 180) / 360 * scale,
    y: (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * scale
  };
}

function lonLatFromWorld(x, y, zoom) {
  const scale = 2 ** zoom;
  const lon = x / scale * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * 180 / Math.PI;
  return [lon, lat];
}

function extentCorners(extent) {
  return [
    bngToWgs84([extent.minE, extent.maxN]),
    bngToWgs84([extent.maxE, extent.maxN]),
    bngToWgs84([extent.minE, extent.minN]),
    bngToWgs84([extent.maxE, extent.minN])
  ];
}

function svgProject(lonLat, extent, viewWidth, viewHeight) {
  const point = wgs84ToBng(lonLat);
  return {
    x: (point.easting - extent.minE) / extent.groundWidth * viewWidth,
    y: (extent.maxN - point.northing) / extent.groundHeight * viewHeight
  };
}

export function tileManifestForDrawing({ extent, modeId, viewWidth, viewHeight, provider = basemapProvider() }) {
  const selected = validateBasemapProvider(provider);
  const zoom = MODE_ZOOM[modeId];
  if (!Number.isInteger(zoom)) throw new Error(`No basemap zoom is configured for ${modeId}.`);
  if (zoom < selected.minZoom || zoom > selected.maxZoom) throw new Error(`Basemap zoom ${zoom} is outside provider limits.`);

  const projectedCorners = extentCorners(extent).map(corner => worldPixel(corner, zoom));
  const scale = 2 ** zoom;
  const minimumX = clamp(Math.floor(Math.min(...projectedCorners.map(point => point.x))), 0, scale - 1);
  const maximumX = clamp(Math.floor(Math.max(...projectedCorners.map(point => point.x)) - 1e-10), 0, scale - 1);
  const minimumY = clamp(Math.floor(Math.min(...projectedCorners.map(point => point.y))), 0, scale - 1);
  const maximumY = clamp(Math.floor(Math.max(...projectedCorners.map(point => point.y)) - 1e-10), 0, scale - 1);
  const tileCount = (maximumX - minimumX + 1) * (maximumY - minimumY + 1);
  if (tileCount > selected.maxTilesPerView) throw new Error(`Basemap requires ${tileCount} tiles, exceeding the ${selected.maxTilesPerView}-tile user viewport limit.`);

  const tiles = [];
  let maximumAlignmentErrorPx = 0;
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const northWest = svgProject(lonLatFromWorld(x, y, zoom), extent, viewWidth, viewHeight);
      const northEast = svgProject(lonLatFromWorld(x + 1, y, zoom), extent, viewWidth, viewHeight);
      const southWest = svgProject(lonLatFromWorld(x, y + 1, zoom), extent, viewWidth, viewHeight);
      const exactCentre = svgProject(lonLatFromWorld(x + .5, y + .5, zoom), extent, viewWidth, viewHeight);
      const affineCentre = {
        x: northWest.x + (northEast.x - northWest.x) / 2 + (southWest.x - northWest.x) / 2,
        y: northWest.y + (northEast.y - northWest.y) / 2 + (southWest.y - northWest.y) / 2
      };
      const alignmentErrorPx = Math.hypot(exactCentre.x - affineCentre.x, exactCentre.y - affineCentre.y);
      maximumAlignmentErrorPx = Math.max(maximumAlignmentErrorPx, alignmentErrorPx);
      tiles.push({
        x,
        y,
        zoom,
        url: tileUrl(selected, zoom, x, y),
        alignmentErrorPx,
        matrix: {
          a: (northEast.x - northWest.x) / selected.tileSize,
          b: (northEast.y - northWest.y) / selected.tileSize,
          c: (southWest.x - northWest.x) / selected.tileSize,
          d: (southWest.y - northWest.y) / selected.tileSize,
          e: northWest.x,
          f: northWest.y
        }
      });
    }
  }

  const geographic = extentCorners(extent);
  return Object.freeze({
    provider: selected,
    modeId,
    zoom,
    tiles: Object.freeze(tiles),
    tileCount: tiles.length,
    maximumAlignmentErrorPx,
    coverage: Object.freeze({
      west: Math.min(...geographic.map(point => point[0])),
      south: Math.min(...geographic.map(point => point[1])),
      east: Math.max(...geographic.map(point => point[0])),
      north: Math.max(...geographic.map(point => point[1]))
    })
  });
}

export function basemapTileMarkup(manifest) {
  const size = manifest.provider.tileSize;
  const escapeXml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
  return manifest.tiles.map((tile, index) => {
    const matrix = [tile.matrix.a, tile.matrix.b, tile.matrix.c, tile.matrix.d, tile.matrix.e, tile.matrix.f].map(value => value.toFixed(8)).join(' ');
    return `<image class="osm-rendered-tile" data-basemap-tile="${index}" data-z="${tile.zoom}" data-x="${tile.x}" data-y="${tile.y}" href="${escapeXml(tile.url)}" x="0" y="0" width="${size}" height="${size}" transform="matrix(${matrix})" preserveAspectRatio="none" crossorigin="anonymous"/>`;
  }).join('');
}

export const BASEMAP_MODE_ZOOM = MODE_ZOOM;
