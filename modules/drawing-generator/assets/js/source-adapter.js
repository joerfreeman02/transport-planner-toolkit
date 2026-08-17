import { OVERPASS_ENDPOINTS, OSM_ATTRIBUTION } from './config.js';
import { bngToWgs84 } from './crs.js';
import { hasRailEvidence, modeForTags, modeForRailGeometryTags, RAIL_MODE_CLASS } from './railway-adapter.js';
import { resolveCommunityCandidateGeometry } from './community-association.js';

export class SourceError extends Error {
  constructor(kind, message, details = {}) { super(message); this.name = 'SourceError'; this.kind = kind; this.details = details; }
}

function bboxWgs84(extent) {
  const corners = [
    bngToWgs84([extent.minE, extent.minN]), bngToWgs84([extent.minE, extent.maxN]),
    bngToWgs84([extent.maxE, extent.minN]), bngToWgs84([extent.maxE, extent.maxN])
  ];
  return {
    south: Math.min(...corners.map(point => point[1])), west: Math.min(...corners.map(point => point[0])),
    north: Math.max(...corners.map(point => point[1])), east: Math.max(...corners.map(point => point[0]))
  };
}

export function buildOverpassQuery(modeId, extent) {
  const bbox = bboxWgs84(extent);
  const bounds = `${bbox.south.toFixed(7)},${bbox.west.toFixed(7)},${bbox.north.toFixed(7)},${bbox.east.toFixed(7)}`;
  const local = modeId.startsWith('local-') ? `
    node["amenity"~"^(school|college|university|hospital|clinic|library|community_centre|place_of_worship|police)$"](${bounds})->.communityAmenityNodes;
    node["shop"~"^(supermarket|convenience)$"](${bounds})->.communityShopNodes;` : '';
  return `[out:json][timeout:45];${local}(
    way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link)$"](${bounds});
    way["railway"~"^(rail|subway|light_rail|tram)$"](${bounds});
    nwr["railway"~"^(station|halt|tram_stop)$"](${bounds});
    nwr["public_transport"="station"](${bounds});
    way["waterway"~"^(river|canal)$"](${bounds});
    ${modeId.startsWith('local-') ? 'way["highway"="cycleway"](' + bounds + ');' : ''}
    relation["route"="bicycle"](${bounds});
    ${modeId.startsWith('local-') ? 'relation["route"="bus"](' + bounds + ');\n    nwr["amenity"~"^(school|college|university|hospital|clinic|library|community_centre|place_of_worship|police)$"](' + bounds + ');\n    nwr["shop"~"^(supermarket|convenience)$"](' + bounds + ');\n    way(around.communityAmenityNodes:100)["building"];\n    way(around.communityShopNodes:100)["building"];' : ''}
  );out body center geom(${bounds});`;
}

function pointGeometry(element) {
  const lat = Number(element.lat ?? element.center?.lat), lon = Number(element.lon ?? element.center?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { type: 'Point', coordinates: [lon, lat] } : null;
}

function lineGeometry(element) {
  if (Array.isArray(element.geometry)) {
    const coordinates = element.geometry.filter(Boolean).map(point => [Number(point.lon), Number(point.lat)]).filter(point => point.every(Number.isFinite));
    if (coordinates.length >= 2) return { type: 'LineString', coordinates };
  }
  if (Array.isArray(element.members)) {
    const lines = element.members.filter(Boolean).map(member => (member.geometry || []).filter(Boolean).map(point => [Number(point.lon), Number(point.lat)]).filter(point => point.every(Number.isFinite))).filter(line => line.length >= 2);
    if (lines.length) return { type: 'MultiLineString', coordinates: lines };
  }
  return pointGeometry(element);
}

function polygonGeometry(element) {
  if (!Array.isArray(element.geometry)) return null;
  const coordinates = element.geometry.filter(Boolean).map(point => [Number(point.lon), Number(point.lat)]).filter(point => point.every(Number.isFinite));
  if (coordinates.length < 4) return null;
  const first = coordinates[0], last = coordinates.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) return null;
  return { type: 'Polygon', coordinates: [coordinates] };
}

function memberPolygonGeometry(element) {
  if (!Array.isArray(element.members)) return null;
  const rings = element.members.filter(Boolean).map(member => (member.geometry || []).filter(Boolean).map(point => [Number(point.lon), Number(point.lat)]).filter(point => point.every(Number.isFinite))).filter(ring => ring.length >= 4 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]);
  if (!rings.length) return null;
  return rings.length === 1 ? { type: 'Polygon', coordinates: [rings[0]] } : { type: 'MultiPolygon', coordinates: rings.map(ring => [ring]) };
}

function feature(element, className, geometry, extra = {}) {
  return {
    type: 'Feature', id: `${element.type}/${element.id}`,
    properties: { class: className, sourceId: `${element.type}/${element.id}`, name: element.tags?.name || '', ref: element.tags?.ref || '', tags: element.tags || {}, ...extra },
    geometry
  };
}

function firstReference(ref, expression) {
  const match = String(ref || '').trim().match(expression);
  return match ? match[1].toUpperCase() : '';
}

function explicitAReference(ref) {
  return firstReference(ref, /(?:^|[;,\s])(A\d{1,4}[A-Z]?)(?=$|[;,\s])/i);
}

function motorwayReference(ref) {
  return firstReference(ref, /(?:^|[;,\s])(M\d{1,4}[A-Z]?)(?=$|[;,\s])/i);
}

function cycleNetwork(tags) {
  const networks = String(tags.network || '').toLowerCase().split(/[;,\s]+/);
  return ['icn', 'ncn', 'rcn', 'lcn'].find(network => networks.includes(network)) || '';
}

function isCurrentCycleRelation(tags) {
  const lifecycle = [tags.state, tags.status, tags.lifecycle, tags.proposed].map(value => String(value || '').toLowerCase());
  const construction = String(tags.construction || '').trim().toLowerCase();
  return !lifecycle.some(value => /^(proposed|planned|future|construction|disused|deprecated|abandoned|removed|razed|yes)$/.test(value))
    && (!construction || construction === 'no')
    && !tags['disused:route'] && !tags['proposed:route'] && !tags['abandoned:route'];
}

function hasNavigableWaterwayEvidence(tags) {
  return tags.boat === 'yes' || tags.motorboat === 'yes';
}

function isCommunityCandidate(tags) {
  return /^(school|college|university|hospital|clinic|library|community_centre|place_of_worship|police)$/.test(tags.amenity || '')
    || /^(supermarket|convenience)$/.test(tags.shop || '');
}

function busColour(reference) {
  const palette = ['#ed1c24', '#7f2a90', '#00a651', '#00a9e0'];
  const hash = [...String(reference || 'BUS')].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
  return palette[hash % palette.length];
}

export function classifyOverpassElement(element) {
  const tags = element?.tags || {};
  const geometry = lineGeometry(element);
  if (tags.route === 'bus') {
    const routeLabel = tags.ref || tags.name || 'Bus route';
    if (geometry && ['LineString', 'MultiLineString'].includes(geometry.type)) return [feature(element, 'bus-route', geometry, { routeLabel, routeGroup: tags.ref || routeLabel, colour: busColour(tags.ref || routeLabel), geometryEvidence: 'osm-clipped-route-relation' })];
    const reviewGeometry = pointGeometry(element);
    return reviewGeometry ? [feature(element, 'bus-route-review', reviewGeometry, { routeLabel, reviewRequired: true, reviewReason: 'BUS ROUTE GEOMETRY REQUIRES REVIEW' })] : [];
  }
  if (tags.route === 'bicycle') {
    const network = cycleNetwork(tags);
    const metadata = {
      network: network || tags.network || 'unclassified', ref: tags.ref || '', name: tags.name || '', operator: tags.operator || '',
      cycleNetwork: tags.cycle_network || '', routeLabel: tags.ref || tags.name || ''
    };
    if (!geometry || !['LineString', 'MultiLineString'].includes(geometry.type)) {
      const reviewGeometry = pointGeometry(element);
      return reviewGeometry ? [feature(element, 'cycle-review', reviewGeometry, { ...metadata, reviewRequired: true, reviewReason: 'cycle-route-geometry-missing' })] : [];
    }
    if (!isCurrentCycleRelation(tags)) return [feature(element, 'cycle-review', geometry, { ...metadata, reviewRequired: true, reviewReason: 'non-current-route' })];
    if (network) return [feature(element, network === 'lcn' ? 'cycle-network-local' : 'cycle-network-primary', geometry, { ...metadata, hierarchyEvidence: 'osm-route-network', currentStatusEvidence: 'no-non-current-lifecycle-tags' })];
    return [feature(element, 'cycle-review', geometry, { ...metadata, reviewRequired: true, reviewReason: 'unsupported-network-hierarchy' })];
  }
  if (isCommunityCandidate(tags)) {
    const area = polygonGeometry(element) || memberPolygonGeometry(element);
    const point = pointGeometry(element);
    const communityGeometry = area || point;
    return communityGeometry ? [feature(element, 'community-candidate', communityGeometry, { category: tags.amenity || tags.shop, originalGeometryType: area ? area.type : 'Point' })] : [];
  }
  if (tags.building) {
    const area = polygonGeometry(element) || memberPolygonGeometry(element);
    return area ? [feature(element, 'building-support', area, { supportOnly: true })] : [];
  }
  if (!geometry) return [];
  if (tags.highway) {
    if (/^motorway/.test(tags.highway)) {
      const reference = motorwayReference(tags.ref);
      return [feature(element, 'motorway', geometry, { motorwayLabel: reference, label: reference })];
    }
    if (/^(trunk|primary)/.test(tags.highway)) {
      const reference = explicitAReference(tags.ref);
      return [feature(element, 'main-road', geometry, { roadFunction: tags.highway, officialARef: reference, roadLabel: reference, label: reference })];
    }
    if (/^(secondary|tertiary)/.test(tags.highway)) return [feature(element, 'context-road-major', geometry, { contextType: tags.highway })];
    if (/^(unclassified|residential|living_street)$/.test(tags.highway)) return [feature(element, 'context-road-minor', geometry, { contextType: tags.highway })];
    if (tags.highway === 'cycleway') return [feature(element, isCurrentCycleRelation(tags) ? 'cycle-route' : 'cycle-review', geometry, { network: 'local', currentStatusEvidence: 'no-non-current-lifecycle-tags', ...(isCurrentCycleRelation(tags) ? {} : { reviewRequired: true, reviewReason: 'non-current-route' }) })];
  }
  if (tags.railway && /^(rail|subway|light_rail|tram)$/.test(tags.railway)) {
    const serviceTrack = /^(siding|yard|spur|crossover)$/.test(tags.service || '');
    const railMode = modeForRailGeometryTags(tags);
    return [feature(element, serviceTrack ? 'railway-support' : 'railway', geometry, { railType: tags.railway, railMode, usage: tags.usage || '', service: tags.service || '', supportOnly: serviceTrack })];
  }
  if (hasRailEvidence(tags) && (tags.railway === 'station' || tags.railway === 'halt' || tags.railway === 'tram_stop' || tags.public_transport === 'station')) {
    const mode = modeForTags(tags);
    return [feature(element, RAIL_MODE_CLASS[mode] || 'station-national-rail', pointGeometry(element) || geometry, { mode })];
  }
  if (tags.waterway && (/^(river|canal)$/.test(tags.waterway))) {
    const navigable = hasNavigableWaterwayEvidence(tags);
    return [feature(element, navigable ? 'waterway' : 'waterway-review', geometry, { navigable, navigabilityEvidence: navigable ? (tags.boat === 'yes' ? 'boat=yes' : 'motorboat=yes') : 'none' })];
  }
  if (tags.landuse || tags.natural === 'wood' || tags.natural === 'water') {
    const area = polygonGeometry(element);
    if (area) return [feature(element, 'context-area', area, { contextType: tags.landuse || tags.natural })];
  }
  if (tags.place) return [feature(element, 'context-place', pointGeometry(element) || geometry, { contextType: tags.place })];
  return [];
}

function countByClass(features) {
  return features.reduce((counts, item) => { const key = item.properties.class; counts[key] = (counts[key] || 0) + 1; return counts; }, {});
}

async function checksum(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export class OverpassTransportAdapter {
  constructor({ fetchImpl, endpoints = OVERPASS_ENDPOINTS, timeoutMs = 30000 } = {}) {
    this.fetch = fetchImpl || ((...args) => globalThis.fetch(...args));
    this.endpoints = endpoints;
    this.timeoutMs = timeoutMs;
  }

  async retrieve(modeId, extent, build) {
    const query = buildOverpassQuery(modeId, extent);
    const failures = [];
    for (const endpoint of this.endpoints) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const started = Date.now();
      try {
        const response = await this.fetch(endpoint, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: `data=${encodeURIComponent(query)}` });
        if (!response.ok) throw new SourceError('http', `HTTP ${response.status}`, { status: response.status });
        let payload;
        try { payload = await response.json(); } catch { throw new SourceError('malformed', 'The provider returned invalid JSON.'); }
        if (!payload || !Array.isArray(payload.elements)) throw new SourceError('malformed', 'The provider response has no elements array.');
        const features = resolveCommunityCandidateGeometry(payload.elements.flatMap(classifyOverpassElement));
        const retrievedAt = new Date().toISOString();
        const snapshotCore = {
          schema: 'tpt-drawing-source-snapshot-v1', version: 1, drawingBuild: build, drawingType: modeId,
          provider: 'OpenStreetMap via Overpass API', endpoint, query, retrievedAt,
          returnedSourceIdentifiers: payload.elements.map(element => `${element.type}/${element.id}`),
          rawFeatureCount: payload.elements.length, normalisedFeatureCount: features.length,
          classificationCounts: countByClass(features), priorFailures: failures,
          warnings: [
            ...(features.some(item => item.properties.class === 'waterway-review') ? ['Some waterways are not evidenced as navigable and remain review-only.'] : []),
            ...(features.some(item => item.properties.class === 'cycle-review') ? ['Some bicycle-route relations are non-current or lack a supported OSM network hierarchy and remain review-only.'] : [])
            ,...(features.some(item => item.properties.class === 'bus-route-review') ? ['BUS ROUTE GEOMETRY REQUIRES REVIEW.'] : [])
            ,...(features.some(item => item.properties.class === 'community-candidate' && item.properties.communityEvidence?.reviewRequired) ? ['Some community candidates have no single evidenced footprint and remain review-only.'] : [])
          ],
          attribution: OSM_ATTRIBUTION
        };
        const snapshot = { ...snapshotCore, checksum: await checksum(JSON.stringify(snapshotCore)) };
        return { status: payload.elements.length ? 'success' : 'zero', features, snapshot };
      } catch (error) {
        const kind = error.name === 'AbortError' ? 'timeout' : error.kind || (error instanceof TypeError && /fetch|network|load failed/i.test(error.message) ? 'network' : 'normalisation');
        failures.push({ endpoint, kind, message: error.message, elapsedMs: Date.now() - started });
      } finally { clearTimeout(timer); }
    }
    throw new SourceError('all-providers-failed', 'All configured vector-data providers failed. This is not a zero-feature result.', { failures });
  }
}
