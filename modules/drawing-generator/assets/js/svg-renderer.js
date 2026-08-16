import { wgs84ToBng } from './crs.js';
import { extentForDrawing, scaleBarForMode } from './scale-engine.js';
import { modeConfig } from './drawing-modes.js';
import { createLabelPlacements, generalisePresentationFeatures } from './cartography.js';
import { basemapProvider as defaultBasemapProvider, basemapTileMarkup, tileManifestForDrawing } from './basemap-compositor.js';

const STYLE = Object.freeze({
  'context-area': { stroke: '#d7d9d5', fill: '#eceee9', width: .35, label: '' },
  'context-road-major': { stroke: '#aeb3b4', width: .72, label: '' },
  'context-road-minor': { stroke: '#d0d3d1', width: .42, label: '' },
  'context-place': { fill: '#555555', label: '' },
  'main-road': { stroke: '#ed1c24', width: 1.35, label: 'MAIN ROAD' },
  motorway: { stroke: '#ec1ce8', width: 2.2, label: 'MOTORWAY' },
  'cycle-network-primary': { stroke: '#f0a500', width: 1.35, label: 'NATIONAL / REGIONAL CYCLE NETWORK' },
  'cycle-network-local': { stroke: '#f0a500', width: .9, dash: '3 2', label: 'LOCAL CYCLE NETWORK' },
  'strategic-cycle': { stroke: '#f0a500', width: 1.2, label: 'STRATEGIC CYCLE ROUTE' },
  'cycle-route': { stroke: '#0057e7', width: 1.1, label: 'CYCLE ROUTE' },
  waterway: { stroke: '#0047bb', width: 1.45, label: 'NAVIGABLE WATERWAY' },
  railway: { stroke: '#777777', width: 1.6, dash: '4 2', label: 'RAILWAY' },
  'station-national-rail': { fill: '#888888', label: 'NATIONAL RAIL STATION' },
  'station-overground': { fill: '#ef6c24', label: 'LONDON OVERGROUND STATION' },
  'station-underground': { fill: '#f4e51c', label: 'LONDON UNDERGROUND STATION' },
  'station-dlr': { fill: '#00a4a7', label: 'DLR STATION' },
  'station-tram': { fill: '#5a8f29', label: 'TRAM / LIGHT RAIL STOP' },
  'bus-route': { stroke: '#ed1c24', width: 2.25, label: 'BUS ROUTE' },
  site: { stroke: '#ed1c24', fill: '#ed1c24', width: 2.2, label: 'SITE' },
  'route-to-site': { stroke: '#ed1c24', width: 2.4, label: 'ROUTE TO SITE' },
  'route-from-site': { stroke: '#0057e7', width: 2.4, label: 'ROUTE FROM SITE' },
  community: { stroke: '#666666', fill: '#999999', width: 1.1, label: 'COMMUNITY CONSIDERATIONS' },
  'custom-line': { stroke: '#111111', width: 1.5, label: 'REVIEWED LINE' },
  'custom-point': { stroke: '#666666', fill: '#999999', width: 1, label: 'REVIEWED POINT' },
  'custom-area': { stroke: '#00a651', fill: '#00a651', width: 1.4, label: 'REVIEWED AREA' }
});

const escapeXml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));

function projector(extent, viewWidth, viewHeight) {
  return coordinate => {
    const point = wgs84ToBng(coordinate);
    return [
      (point.easting - extent.minE) / extent.groundWidth * viewWidth,
      (extent.maxN - point.northing) / extent.groundHeight * viewHeight
    ];
  };
}

function linePath(coordinates, project) {
  return coordinates.map((coordinate, index) => { const [x, y] = project(coordinate); return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`; }).join(' ');
}

function pathForGeometry(geometry, project) {
  if (geometry.type === 'LineString') return linePath(geometry.coordinates, project);
  if (geometry.type === 'MultiLineString') return geometry.coordinates.map(line => linePath(line, project)).join(' ');
  if (geometry.type === 'Polygon') return geometry.coordinates.map(ring => `${linePath(ring, project)} Z`).join(' ');
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flatMap(polygon => polygon.map(ring => `${linePath(ring, project)} Z`)).join(' ');
  return '';
}

function geometryPoint(geometry, project) {
  if (geometry.type !== 'Point') return null;
  return project(geometry.coordinates);
}

function styleForFeature(item) {
  const className = item.properties?.class;
  const base = STYLE[className];
  if (!base || className !== 'context-area') return base;
  const contextType = item.properties?.contextType;
  if (contextType === 'water') return { ...base, stroke: '#b7d9e8', fill: '#dceef5' };
  if (contextType === 'wood' || contextType === 'forest') return { ...base, stroke: '#c6d6bd', fill: '#e0eadb' };
  if (contextType === 'grass' || contextType === 'recreation_ground') return { ...base, stroke: '#d2dfc7', fill: '#e9f0e3' };
  if (['commercial', 'retail', 'industrial'].includes(contextType)) return { ...base, stroke: '#ded0d3', fill: '#f0e6e8' };
  return { ...base, stroke: '#dedbd3', fill: '#eeeae2' };
}

function sourceVisible(modeId, className) {
  if (className === 'community-candidate' || className === 'waterway-review' || className === 'cycle-review') return false;
  return modeConfig(modeId).visibleClasses.includes(className);
}

export const classVisibleForDrawing = sourceVisible;

function featureMarkup(item, project, index) {
  const className = item.properties?.class;
  const style = styleForFeature(item);
  if (!style) return '';
  if (className === 'context-place') return '';
  const colour = item.properties?.colour || style.stroke || style.fill;
  const point = geometryPoint(item.geometry, project);
  if (point) {
    const [x, y] = point;
    const station = className.startsWith('station-');
    const symbol = station
      ? `<rect x="${(x - 4).toFixed(2)}" y="${(y - 4).toFixed(2)}" width="8" height="8" fill="${style.fill}" stroke="#333" stroke-width=".6" vector-effect="non-scaling-stroke"/>`
      : `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4.5" fill="${escapeXml(item.properties?.colour || style.fill)}" stroke="${escapeXml(style.stroke || '#555')}" stroke-width=".8" vector-effect="non-scaling-stroke"/>`;
    return `<g class="layer-${escapeXml(className)}" data-feature-index="${index}">${symbol}</g>`;
  }
  const path = pathForGeometry(item.geometry, project);
  if (!path) return '';
  const isArea = item.geometry.type.includes('Polygon');
  const arrow = className === 'route-to-site' ? 'url(#arrow-to)' : className === 'route-from-site' ? 'url(#arrow-from)' : '';
  const markup = `<path d="${path}" fill="${isArea ? escapeXml(item.properties?.colour || style.fill || 'none') : 'none'}" fill-opacity="${isArea ? '.34' : '0'}" fill-rule="evenodd" stroke="${escapeXml(colour)}" stroke-width="${style.width}"${style.dash ? ` stroke-dasharray="${style.dash}"` : ''}${arrow ? ` marker-mid="${arrow}" marker-end="${arrow}"` : ''} stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
  return `<g class="layer-${escapeXml(className)}" data-feature-index="${index}">${markup}</g>`;
}

function labelMarkup(placements) {
  return placements.map(item => `<text x="${item.x.toFixed(2)}" y="${item.y.toFixed(2)}" class="map-label label-${escapeXml(item.className)}" data-label-key="${escapeXml(item.key)}">${escapeXml(item.label)}</text>`).join('');
}

function gridMarkup(extent, viewWidth, viewHeight, mode) {
  const interval = mode.family === 'regional' ? 1000 : 100;
  const lines = [];
  for (let easting = Math.ceil(extent.minE / interval) * interval; easting < extent.maxE; easting += interval) {
    const x = (easting - extent.minE) / extent.groundWidth * viewWidth;
    lines.push(`<line x1="${x.toFixed(2)}" y1="0" x2="${x.toFixed(2)}" y2="${viewHeight.toFixed(2)}"/>`);
  }
  for (let northing = Math.ceil(extent.minN / interval) * interval; northing < extent.maxN; northing += interval) {
    const y = (extent.maxN - northing) / extent.groundHeight * viewHeight;
    lines.push(`<line x1="0" y1="${y.toFixed(2)}" x2="${viewWidth}" y2="${y.toFixed(2)}"/>`);
  }
  return `<g class="bng-grid" aria-label="British National Grid ${interval} metre grid">${lines.join('')}</g>`;
}

function siteFeature(site) {
  return site ? { type: 'Feature', properties: { class: 'site', label: 'SITE' }, geometry: site } : null;
}

export function legendItemsForDrawing(modeId, sourceFeatures = [], overlays = [], hasSite = false) {
  const present = new Set(sourceFeatures.filter(item => sourceVisible(modeId, item.properties?.class)).map(item => item.properties.class));
  overlays.filter(item => item.properties?.visible !== false && sourceVisible(modeId, item.properties?.class)).forEach(item => present.add(item.properties.class));
  if (hasSite) present.add('site');
  const priority = ['site', 'main-road', 'motorway', 'cycle-network-primary', 'cycle-network-local', 'strategic-cycle', 'cycle-route', 'waterway', 'railway', 'station-national-rail', 'station-overground', 'station-underground', 'station-dlr', 'station-tram', 'bus-route', 'community', 'route-to-site', 'route-from-site', 'custom-line', 'custom-point', 'custom-area'];
  return priority.filter(className => present.has(className) && STYLE[className]).map(className => ({ className, ...STYLE[className] }));
}

export function renderDrawingSvg({ modeId, centerBng, site = null, sourceFeatures = [], overlays = [], sourceStatus = 'not-loaded', includeBasemap = true, basemapProvider = defaultBasemapProvider(), basemapStatus = includeBasemap ? 'loading' : 'not-requested' }) {
  const mode = modeConfig(modeId);
  const extent = extentForDrawing(centerBng, modeId);
  const viewWidth = 1000;
  const viewHeight = viewWidth * mode.mapFrameMm.height / mode.mapFrameMm.width;
  const project = projector(extent, viewWidth, viewHeight);
  const visibleSource = sourceFeatures.filter(item => sourceVisible(modeId, item.properties?.class) && !item.properties?.class?.startsWith('context-'));
  const visibleOverlays = overlays.filter(item => item.properties?.visible !== false && sourceVisible(modeId, item.properties?.class));
  const features = generalisePresentationFeatures([...visibleSource, ...visibleOverlays, siteFeature(site)].filter(Boolean));
  const controlledFeatures = features;
  const basemap = includeBasemap ? tileManifestForDrawing({ extent, modeId, viewWidth, viewHeight, provider: basemapProvider }) : null;
  const labels = createLabelPlacements(features, project, modeId, viewWidth, viewHeight);
  const scaleBar = scaleBarForMode(modeId);
  const barWidth = scaleBar.paperMm / mode.mapFrameMm.width * viewWidth;
  const barX = 18, barY = viewHeight - 24;
  const warning = sourceStatus === 'success' || sourceStatus === 'zero' ? '' : 'VECTOR SOURCE NOT LOADED - REVIEW REQUIRED';
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" id="drawingSvg" role="img" aria-label="${escapeXml(mode.title)} scale drawing" viewBox="0 0 ${viewWidth} ${viewHeight.toFixed(3)}" preserveAspectRatio="none" data-mode="${modeId}" data-scale="${mode.scale}" data-paper-width-mm="${mode.mapFrameMm.width}" data-paper-height-mm="${mode.mapFrameMm.height}" data-ground-width-m="${extent.groundWidth}" data-ground-height-m="${extent.groundHeight}" data-contextual-basemap="rendered-osm-raster-tiles" data-basemap-provider="${escapeXml(basemapProvider.id)}" data-basemap-status="${escapeXml(basemapStatus)}" data-basemap-zoom="${basemap?.zoom || ''}" data-basemap-tile-count="${basemap?.tileCount || 0}" data-basemap-alignment-error-px="${(basemap?.maximumAlignmentErrorPx || 0).toFixed(6)}">
    <defs>
      <clipPath id="map-clip"><rect x="0" y="0" width="${viewWidth}" height="${viewHeight.toFixed(3)}"/></clipPath>
      <marker id="arrow-to" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,4 L0,8" fill="none" stroke="#ed1c24" stroke-width="1.3"/></marker>
      <marker id="arrow-from" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,4 L0,8" fill="none" stroke="#0057e7" stroke-width="1.3"/></marker>
    </defs>
    <rect width="${viewWidth}" height="${viewHeight.toFixed(3)}" fill="#f7f7f3"/>
    <g clip-path="url(#map-clip)" aria-label="Rendered OpenStreetMap basemap and controlled EAS overlays"><g class="rendered-osm-basemap" aria-label="OpenStreetMap Standard rendered tile context">${basemap ? basemapTileMarkup(basemap) : ''}</g>${gridMarkup(extent, viewWidth, viewHeight, mode)}<g class="controlled-eas-overlays">${controlledFeatures.map((item, index) => featureMarkup(item, project, index)).join('')}</g><g class="controlled-labels">${labelMarkup(labels)}</g></g>
    <g class="north-arrow" aria-label="North arrow" transform="translate(38 34)"><path d="M0,-23 L-13,7 L0,1 L13,7 Z" fill="#8d8d8d" stroke="#333" stroke-width="1"/><text x="0" y="31" text-anchor="middle">N</text></g>
    <g class="scale-bar" data-paper-mm="${scaleBar.paperMm}" data-ground-metres="${scaleBar.groundMetres}"><line x1="${barX}" y1="${barY}" x2="${(barX + barWidth).toFixed(3)}" y2="${barY}" stroke="#111" stroke-width="2" vector-effect="non-scaling-stroke"/><line x1="${barX}" y1="${barY - 5}" x2="${barX}" y2="${barY + 5}" stroke="#111" stroke-width="1"/><line x1="${(barX + barWidth).toFixed(3)}" y1="${barY - 5}" x2="${(barX + barWidth).toFixed(3)}" y2="${barY + 5}" stroke="#111" stroke-width="1"/><text x="${barX}" y="${barY - 9}" class="scale-label">${scaleBar.label}</text></g>
    ${warning ? `<text x="${viewWidth - 15}" y="20" text-anchor="end" class="source-warning">${warning}</text>` : ''}
    <g id="basemapFailureWarning" class="basemap-failure-warning" visibility="${basemapStatus === 'failed' ? 'visible' : 'hidden'}"><rect x="180" y="${(viewHeight / 2 - 24).toFixed(2)}" width="640" height="48" rx="4"/><text x="500" y="${(viewHeight / 2 + 4).toFixed(2)}" text-anchor="middle">BASEMAP FAILED TO LOAD - REVIEW REQUIRED</text></g>
    <rect x=".5" y=".5" width="${viewWidth - 1}" height="${(viewHeight - 1).toFixed(3)}" fill="none" stroke="#222" stroke-width="1" vector-effect="non-scaling-stroke"/>
  </svg>`;
  return { markup, extent, legend: legendItemsForDrawing(modeId, sourceFeatures, overlays, Boolean(site)), scaleBar, presentationFeatures: features, labels, basemap };
}

// Bind separately so the map callback receives the current projector and index.
function featureMarkupBound(item, index, project) { return featureMarkup(item, project, index); }

// Correct the generated feature callback without exposing renderer internals.
export function renderFeatureSetForTest(features, extent, modeId) {
  const mode = modeConfig(modeId), viewWidth = 1000, viewHeight = viewWidth * mode.mapFrameMm.height / mode.mapFrameMm.width;
  const project = projector(extent, viewWidth, viewHeight);
  return generalisePresentationFeatures(features).map((item, index) => featureMarkupBound(item, index, project)).join('');
}
