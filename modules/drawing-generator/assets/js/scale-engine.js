import { modeConfig } from './drawing-modes.js';
import { bngToWgs84 } from './crs.js';

export function paperMmToGroundMetres(paperMm, scaleDenominator) {
  if (!(paperMm > 0) || !(scaleDenominator > 0)) throw new Error('Paper distance and scale denominator must be positive.');
  return paperMm * scaleDenominator / 1000;
}

export function groundMetresToPaperMm(groundMetres, scaleDenominator) {
  if (!(groundMetres >= 0) || !(scaleDenominator > 0)) throw new Error('Ground distance must be non-negative and scale denominator must be positive.');
  return groundMetres * 1000 / scaleDenominator;
}

export function scaleBarForMode(modeId) {
  const mode = modeConfig(modeId);
  const groundMetres = mode.scale === 50000 ? 1000 : 50;
  return Object.freeze({ paperMm: groundMetresToPaperMm(groundMetres, mode.scale), groundMetres, label: groundMetres >= 1000 ? '1 km' : `${groundMetres} m` });
}

export function extentForDrawing(center, modeId) {
  if (!center || !Number.isFinite(center.easting) || !Number.isFinite(center.northing)) throw new Error('A finite BNG drawing centre is required.');
  const mode = modeConfig(modeId);
  const groundWidth = paperMmToGroundMetres(mode.mapFrameMm.width, mode.scale);
  const groundHeight = paperMmToGroundMetres(mode.mapFrameMm.height, mode.scale);
  return Object.freeze({
    minE: center.easting - groundWidth / 2,
    minN: center.northing - groundHeight / 2,
    maxE: center.easting + groundWidth / 2,
    maxN: center.northing + groundHeight / 2,
    groundWidth,
    groundHeight,
    paperWidthMm: mode.mapFrameMm.width,
    paperHeightMm: mode.mapFrameMm.height,
    scale: mode.scale
  });
}

export function issuedExtentGeoJson(center, modeId) {
  const extent = extentForDrawing(center, modeId);
  const ring = [
    [extent.minE, extent.minN], [extent.minE, extent.maxN],
    [extent.maxE, extent.maxN], [extent.maxE, extent.minN], [extent.minE, extent.minN]
  ].map(bngToWgs84);
  return Object.freeze({
    type: 'Feature',
    properties: Object.freeze({
      class: 'issued-drawing-extent',
      label: `ISSUED DRAWING AREA — 1:${extent.scale.toLocaleString('en-GB')}`,
      scale: extent.scale,
      groundWidth: extent.groundWidth,
      groundHeight: extent.groundHeight
    }),
    geometry: Object.freeze({ type: 'Polygon', coordinates: Object.freeze([Object.freeze(ring)]) })
  });
}
