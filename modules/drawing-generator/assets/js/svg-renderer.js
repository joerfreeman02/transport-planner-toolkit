import { wgs84ToBng } from './crs.js';
import { extentForDrawing, scaleBarForMode } from './scale-engine.js';
import { modeConfig } from './drawing-modes.js';
import { createLabelPlacements, generalisePresentationFeatures } from './cartography.js';
import { basemapProvider as defaultBasemapProvider, basemapTileMarkup, tileManifestForDrawing } from './basemap-compositor.js';
import { routeArrowPlacements } from './route-geometry.js';
import { resolveSourcePresentation } from './source-review.js';
import { applyBusPresentationGroups, basemapOpacity, normaliseBasemapAppearance } from './presentation-controls.js';

const STYLE = Object.freeze({
  'context-area': { stroke: '#d7d9d5', fill: '#eceee9', width: .35, label: '' },
  'context-road-major': { stroke: '#aeb3b4', width: .72, label: '' },
  'context-road-minor': { stroke: '#d0d3d1', width: .42, label: '' },
  'context-place': { fill: '#555555', label: '' },
  'main-road': { stroke: '#ed1c24', width: 1.35, label: 'MAIN ROAD' },
  motorway: { stroke: '#ec1ce8', width: 2.2, label: 'MOTORWAY' },
  'cycle-network-primary': { stroke: '#00a651', width: 1.35, label: 'NATIONAL / REGIONAL CYCLE NETWORK' },
  'cycle-network-local': { stroke: '#00a651', width: .95, dash: '4 2.5', label: 'LOCAL CYCLE NETWORK' },
  'strategic-cycle': { stroke: '#00a651', width: 1.2, label: 'STRATEGIC CYCLE ROUTE' },
  'cycle-route': { stroke: '#00a651', width: .9, dash: '4 2.5', label: 'LOCAL CYCLE ROUTE' },
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

function styleForFeature(item, modeId = '') {
  const className = item.properties?.class;
  const base = STYLE[className];
  if (!base) return base;
  if (modeId === 'local-context') {
    if (className === 'cycle-network-primary' || className === 'strategic-cycle') return { ...base, stroke: '#00a651', dash: '', label: 'STRATEGIC / REGIONAL CYCLE ROUTE' };
    if (className === 'cycle-network-local' || className === 'cycle-route') return { ...base, stroke: '#00a651', dash: '4 2.5', label: 'LOCAL CYCLE ROUTE' };
    if (className === 'railway') {
      const railMode = item.properties?.railMode || '';
      const railStyles = {
        'London Overground': { stroke: '#f58220', dash: '', label: 'LONDON OVERGROUND' },
        'London Underground': { stroke: '#0057e7', dash: '', label: 'LONDON UNDERGROUND' },
        DLR: { stroke: '#00a4a7', dash: '', label: 'DLR' },
        'Tram/light rail': { stroke: '#5a8f29', dash: '', label: 'TRAM / LIGHT RAIL' },
        'National Rail': { stroke: '#666666', dash: '', label: 'NATIONAL RAIL' },
        Railway: { stroke: '#666666', dash: '4 2', label: 'RAILWAY' }
      };
      return { ...base, ...(railStyles[railMode || 'Railway']) };
    }
  }
  if (className !== 'context-area') return base;
  const contextType = item.properties?.contextType;
  if (contextType === 'water') return { ...base, stroke: '#b7d9e8', fill: '#dceef5' };
  if (contextType === 'wood' || contextType === 'forest') return { ...base, stroke: '#c6d6bd', fill: '#e0eadb' };
  if (contextType === 'grass' || contextType === 'recreation_ground') return { ...base, stroke: '#d2dfc7', fill: '#e9f0e3' };
  if (['commercial', 'retail', 'industrial'].includes(contextType)) return { ...base, stroke: '#ded0d3', fill: '#f0e6e8' };
  return { ...base, stroke: '#dedbd3', fill: '#eeeae2' };
}

function sourceVisible(modeId, className) {
  if (['community-candidate', 'building-support', 'railway-support', 'waterway-review', 'cycle-review', 'bus-route-review'].includes(className)) return false;
  return modeConfig(modeId).visibleClasses.includes(className);
}

export const classVisibleForDrawing = sourceVisible;

function routeArrowMarkup(item, project, family, marker, colour) {
  if (item.geometry?.type !== 'LineString') return '';
  return routeArrowPlacements(item.geometry, family).map(placement => {
    const start = project(placement.start), end = project(placement.end);
    const dx = end[0] - start[0], dy = end[1] - start[1], length = Math.hypot(dx, dy) || 1;
    const cartographicOffset = item.properties?.class === 'route-from-site' ? 3.2 : -3.2;
    const offsetX = -dy / length * cartographicOffset, offsetY = dx / length * cartographicOffset;
    const [x1, y1, x2, y2] = [start[0] + offsetX, start[1] + offsetY, end[0] + offsetX, end[1] + offsetY];
    return `<g class="route-direction-arrow-set" data-cartographic-offset="${cartographicOffset}"><line class="route-direction-arrow-halo" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#ffffff" stroke-width="4.4" marker-end="url(#arrow-halo)" vector-effect="non-scaling-stroke"/><line class="route-direction-arrow" data-distance-m="${placement.distanceMetres.toFixed(1)}" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${escapeXml(colour)}" stroke-width="1.9" marker-end="${marker}" vector-effect="non-scaling-stroke"/></g>`;
  }).join('');
}

function featureMarkup(item, project, index, family, modeId = '') {
  const className = item.properties?.class;
  const style = styleForFeature(item, modeId);
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
  const marker = className === 'route-to-site' ? 'url(#arrow-to)' : className === 'route-from-site' ? 'url(#arrow-from)' : '';
  const routeStatus = item.properties?.route?.status || '';
  const reviewDash = marker && ['rough', 'snapping', 'snap-failed', 'snap-review-required', 'direction-review'].includes(routeStatus) ? '6 3' : style.dash;
  const markup = `<path d="${path}" fill="${isArea ? escapeXml(item.properties?.colour || style.fill || 'none') : 'none'}" fill-opacity="${isArea ? '.34' : '0'}" fill-rule="evenodd" stroke="${escapeXml(colour)}" stroke-width="${className === 'bus-route' ? 1.7 : style.width}"${reviewDash ? ` stroke-dasharray="${reviewDash}"` : ''} stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${marker ? routeArrowMarkup(item, project, family, marker, colour) : ''}`;
  const offset = className === 'bus-route' ? Number(item.properties?.presentationBusOffset || 0) : 0;
  return `<g class="layer-${escapeXml(className)}" data-feature-index="${index}"${routeStatus ? ` data-route-status="${escapeXml(routeStatus)}"` : ''}${offset ? ` transform="translate(0 ${offset.toFixed(2)})"` : ''}>${markup}</g>`;
}

function labelMarkup(placements) {
  return placements.map(item => {
    if (item.className !== 'community') return `<text x="${item.x.toFixed(2)}" y="${item.y.toFixed(2)}" class="map-label label-${escapeXml(item.className)}" data-label-key="${escapeXml(item.key)}">${escapeXml(item.label)}</text>`;
    const width = Math.min(148, Math.max(44, item.label.length * 5.1 + 12));
    const x = item.x + 9, y = item.y - 15;
    return `<g class="community-annotation" data-label-key="${escapeXml(item.key)}"><path class="community-annotation-leader" d="M${item.x.toFixed(2)},${item.y.toFixed(2)} L${(x + 5).toFixed(2)},${(y + 8).toFixed(2)}"/><rect class="community-annotation-backing" x="${x.toFixed(2)}" y="${(y - 11).toFixed(2)}" width="${width.toFixed(2)}" height="17" rx="2"/><text x="${(x + 5).toFixed(2)}" y="${y.toFixed(2)}">${escapeXml(item.label)}</text></g>`;
  }).join('');
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

function projectedCoordinates(value, project, result = []) {
  if (Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) result.push(project(value));
  else if (Array.isArray(value)) value.forEach(item => projectedCoordinates(item, project, result));
  return result;
}

function siteCalloutMarkup(site, project, viewWidth, viewHeight) {
  if (!site) return '';
  const points = projectedCoordinates(site.coordinates, project);
  if (!points.length) return '';
  const anchor = points.reduce((selected, point) => point[1] < selected[1] ? point : selected, points[0]);
  const labelWidth = 58, labelHeight = 22;
  const above = anchor[1] >= labelHeight + 18;
  const y = above ? anchor[1] - labelHeight - 15 : Math.min(viewHeight - labelHeight - 8, anchor[1] + 15);
  const x = Math.max(8, Math.min(viewWidth - labelWidth - 8, anchor[0] - labelWidth / 2));
  const leaderY = above ? y + labelHeight : y;
  return `<g class="site-callout" aria-label="Site callout"><path class="site-callout-leader" d="M${anchor[0].toFixed(2)},${anchor[1].toFixed(2)} L${(x + labelWidth / 2).toFixed(2)},${leaderY.toFixed(2)}" fill="none" stroke="#ed1c24" stroke-width="1.5" vector-effect="non-scaling-stroke"/><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${labelWidth}" height="${labelHeight}" rx="2.5" fill="#ffffff" fill-opacity=".94" stroke="#ed1c24" stroke-width="1.2" vector-effect="non-scaling-stroke"/><text x="${(x + labelWidth / 2).toFixed(2)}" y="${(y + 14.5).toFixed(2)}" text-anchor="middle">SITE</text></g>`;
}

export function legendItemsForDrawing(modeId, sourceFeatures = [], overlays = [], hasSite = false, sourceReview = {}, busGroups = []) {
  const visibleSource = applyBusPresentationGroups(resolveSourcePresentation(sourceFeatures, sourceReview), busGroups).filter(item => sourceVisible(modeId, item.properties?.class));
  const visibleOverlays = overlays.filter(item => item.properties?.visible !== false && sourceVisible(modeId, item.properties?.class));
  const present = new Set(visibleSource.map(item => item.properties.class));
  visibleOverlays.forEach(item => present.add(item.properties.class));
  if (hasSite) present.add('site');
  const priority = ['site', 'main-road', 'motorway', 'cycle-network-primary', 'cycle-network-local', 'strategic-cycle', 'cycle-route', 'waterway', 'railway', 'station-national-rail', 'station-overground', 'station-underground', 'station-dlr', 'station-tram', 'bus-route', 'community', 'route-to-site', 'route-from-site', 'custom-line', 'custom-point', 'custom-area'];
  const busRoutes = [...visibleSource, ...visibleOverlays].filter(item => item.properties?.class === 'bus-route');
  return priority.flatMap(className => {
    if (!present.has(className) || !STYLE[className]) return [];
    if (className === 'railway') {
      if (modeId === 'regional-plan') return [{ className, ...styleForFeature({ properties: { class: 'railway' } }, modeId), label: 'RAILWAY' }];
      const modes = new Map();
      visibleSource.filter(item => item.properties?.class === 'railway').forEach(item => {
        const key = item.properties?.railMode || 'Railway';
        if (!modes.has(key)) modes.set(key, { className, ...styleForFeature({ properties: { className, class: 'railway', railMode: key } }, modeId) });
      });
      return [...modes.values()].sort((left, right) => left.label.localeCompare(right.label));
    }
    if (className === 'bus-route' && busRoutes.length) {
      const routes = new Map();
      busRoutes.forEach(item => {
        const key = item.properties.presentationBusGroup || item.properties.routeGroup || item.properties.ref || item.properties.routeLabel || 'BUS';
        if (!routes.has(key)) {
          const references = item.properties.presentationBusRouteRefs || [];
          const label = item.properties.presentationBusLabel || `BUS ROUTE ${key}`;
          routes.set(key, { className, ...STYLE[className], stroke: item.properties.colour || STYLE[className].stroke, label: label === 'ALL BUS ROUTES' && references.length ? `ALL BUS ROUTES — ${references.join(', ')}` : label });
        }
      });
      return [...routes.values()].sort((left, right) => left.label.localeCompare(right.label, 'en-GB', { numeric: true }));
    }
    return [{ className, ...styleForFeature({ properties: { class: className } }, modeId) }];
  });
}

export function renderDrawingSvg({ modeId, centerBng, site = null, sourceFeatures = [], sourceReview = {}, overlays = [], sourceStatus = 'not-loaded', includeBasemap = true, basemapProvider = defaultBasemapProvider(), basemapStatus = includeBasemap ? 'loading' : 'not-requested', basemapAppearance = {}, busGroups = [] }) {
  const mode = modeConfig(modeId);
  const extent = extentForDrawing(centerBng, modeId);
  const viewWidth = 1000;
  const viewHeight = viewWidth * mode.mapFrameMm.height / mode.mapFrameMm.width;
  const project = projector(extent, viewWidth, viewHeight);
  const appearance = normaliseBasemapAppearance(basemapAppearance);
  const visibleSource = applyBusPresentationGroups(resolveSourcePresentation(sourceFeatures, sourceReview), busGroups).filter(item => sourceVisible(modeId, item.properties?.class) && !item.properties?.class?.startsWith('context-'));
  const visibleOverlays = overlays.filter(item => item.properties?.visible !== false && sourceVisible(modeId, item.properties?.class));
  const features = generalisePresentationFeatures([...visibleSource, ...visibleOverlays, siteFeature(site)].filter(Boolean));
  const controlledFeatures = features;
  const basemap = includeBasemap ? tileManifestForDrawing({ extent, modeId, viewWidth, viewHeight, provider: basemapProvider }) : null;
  const labels = createLabelPlacements(features, project, modeId, viewWidth, viewHeight);
  const scaleBar = scaleBarForMode(modeId);
  const barWidth = scaleBar.paperMm / mode.mapFrameMm.width * viewWidth;
  const barX = 18, barY = viewHeight - 24;
  const warning = sourceStatus === 'success' || sourceStatus === 'zero' ? '' : 'VECTOR SOURCE NOT LOADED - REVIEW REQUIRED';
  const routeFailure = visibleOverlays.some(item => item.properties?.route?.status === 'snap-failed');
  const routeDirectionReview = visibleOverlays.some(item => item.properties?.route?.directionStatus === 'review-required');
  const busGeometryReview = sourceFeatures.some(item => item.properties?.class === 'bus-route-review');
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" id="drawingSvg" role="img" aria-label="${escapeXml(mode.title)} scale drawing" viewBox="0 0 ${viewWidth} ${viewHeight.toFixed(3)}" preserveAspectRatio="none" data-mode="${modeId}" data-scale="${mode.scale}" data-paper-width-mm="${mode.mapFrameMm.width}" data-paper-height-mm="${mode.mapFrameMm.height}" data-ground-width-m="${extent.groundWidth}" data-ground-height-m="${extent.groundHeight}" data-contextual-basemap="rendered-osm-raster-tiles" data-basemap-provider="${escapeXml(basemapProvider.id)}" data-basemap-status="${escapeXml(basemapStatus)}" data-basemap-colour="${appearance.colour}" data-basemap-emphasis="${appearance.emphasis}" data-basemap-zoom="${basemap?.zoom || ''}" data-basemap-tile-count="${basemap?.tileCount || 0}" data-basemap-alignment-error-px="${(basemap?.maximumAlignmentErrorPx || 0).toFixed(6)}">
    <defs>
      <clipPath id="map-clip"><rect x="0" y="0" width="${viewWidth}" height="${viewHeight.toFixed(3)}"/></clipPath>
      <filter id="basemap-greyscale"><feColorMatrix type="saturate" values="0"/></filter>
      <marker id="arrow-halo" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L11,6 L1,11" fill="none" stroke="#ffffff" stroke-width="4.2" stroke-linejoin="round"/></marker>
      <marker id="arrow-to" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L11,6 L1,11" fill="none" stroke="#ed1c24" stroke-width="2.1" stroke-linejoin="round"/></marker>
      <marker id="arrow-from" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L11,6 L1,11" fill="none" stroke="#0057e7" stroke-width="2.1" stroke-linejoin="round"/></marker>
    </defs>
    <rect width="${viewWidth}" height="${viewHeight.toFixed(3)}" fill="#f7f7f3"/>
    <g clip-path="url(#map-clip)" aria-label="Rendered OpenStreetMap basemap and controlled EAS overlays"><g class="rendered-osm-basemap" style="opacity:${basemapOpacity(appearance)}"${appearance.colour === 'greyscale' ? ' filter="url(#basemap-greyscale)"' : ''} aria-label="OpenStreetMap Standard rendered tile context">${basemap ? basemapTileMarkup(basemap) : ''}</g>${gridMarkup(extent, viewWidth, viewHeight, mode)}<g class="controlled-eas-overlays">${controlledFeatures.map((item, index) => featureMarkup(item, project, index, mode.family, modeId)).join('')}</g><g class="controlled-labels">${labelMarkup(labels)}${siteCalloutMarkup(site, project, viewWidth, viewHeight)}</g></g>
    <g class="north-arrow" aria-label="North arrow" transform="translate(38 34)"><rect class="north-arrow-panel" x="-22" y="-31" width="44" height="70" rx="3"/><path d="M0,-23 L-13,7 L0,1 L13,7 Z" fill="#8d8d8d" stroke="#333" stroke-width="1"/><text x="0" y="31" text-anchor="middle">N</text></g>
    <g class="scale-bar" data-paper-mm="${scaleBar.paperMm}" data-ground-metres="${scaleBar.groundMetres}"><rect class="scale-bar-panel" x="${barX - 9}" y="${barY - 23}" width="${(barWidth + 18).toFixed(3)}" height="31" rx="3"/><line x1="${barX}" y1="${barY}" x2="${(barX + barWidth).toFixed(3)}" y2="${barY}" stroke="#111" stroke-width="2" vector-effect="non-scaling-stroke"/><line x1="${barX}" y1="${barY - 5}" x2="${barX}" y2="${barY + 5}" stroke="#111" stroke-width="1"/><line x1="${(barX + barWidth).toFixed(3)}" y1="${barY - 5}" x2="${(barX + barWidth).toFixed(3)}" y2="${barY + 5}" stroke="#111" stroke-width="1"/><text x="${barX}" y="${barY - 9}" class="scale-label">${scaleBar.label}</text></g>
    <g class="osm-attribution" aria-label="OpenStreetMap attribution" transform="translate(${viewWidth - 196} ${(viewHeight - 24).toFixed(2)})"><rect width="187" height="17" rx="2"/><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener"><text x="7" y="11.5">© OpenStreetMap contributors</text></a></g>
    ${warning ? `<text x="${viewWidth - 15}" y="20" text-anchor="end" class="source-warning">${warning}</text>` : ''}
    ${routeFailure ? `<text x="${viewWidth - 15}" y="38" text-anchor="end" class="source-warning route-review-warning">ROAD SNAP FAILED - ROUTE REQUIRES MANUAL REVIEW</text>` : ''}
    ${routeDirectionReview ? `<text x="${viewWidth - 15}" y="56" text-anchor="end" class="source-warning route-review-warning">ROUTE DIRECTION REQUIRES REVIEW</text>` : ''}
    ${busGeometryReview ? `<text x="${viewWidth - 15}" y="74" text-anchor="end" class="source-warning route-review-warning">BUS ROUTE GEOMETRY REQUIRES REVIEW</text>` : ''}
    <g id="basemapFailureWarning" class="basemap-failure-warning" visibility="${basemapStatus === 'failed' ? 'visible' : 'hidden'}"><rect x="180" y="${(viewHeight / 2 - 24).toFixed(2)}" width="640" height="48" rx="4"/><text x="500" y="${(viewHeight / 2 + 4).toFixed(2)}" text-anchor="middle">BASEMAP INCOMPLETE — PRINT BLOCKED</text></g>
    <rect x=".5" y=".5" width="${viewWidth - 1}" height="${(viewHeight - 1).toFixed(3)}" fill="none" stroke="#222" stroke-width="1" vector-effect="non-scaling-stroke"/>
  </svg>`;
  return { markup, extent, viewWidth, viewHeight, legend: legendItemsForDrawing(modeId, sourceFeatures, overlays, Boolean(site), sourceReview, busGroups), scaleBar, presentationFeatures: features, labels, basemap, basemapAppearance: appearance };
}

// Bind separately so the map callback receives the current projector and index.
function featureMarkupBound(item, index, project, family, modeId) { return featureMarkup(item, project, index, family, modeId); }

// Correct the generated feature callback without exposing renderer internals.
export function renderFeatureSetForTest(features, extent, modeId) {
  const mode = modeConfig(modeId), viewWidth = 1000, viewHeight = viewWidth * mode.mapFrameMm.height / mode.mapFrameMm.width;
  const project = projector(extent, viewWidth, viewHeight);
  return generalisePresentationFeatures(features).map((item, index) => featureMarkupBound(item, index, project, mode.family, modeId)).join('');
}
