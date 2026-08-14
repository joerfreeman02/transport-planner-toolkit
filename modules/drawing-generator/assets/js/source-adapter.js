import { OVERPASS_ENDPOINTS, OSM_ATTRIBUTION } from './config.js';
import { bngToWgs84 } from './crs.js';
import { hasRailEvidence, modeForTags, RAIL_MODE_CLASS } from './railway-adapter.js';

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
  const context = `
    way["highway"~"^(secondary|secondary_link|tertiary|tertiary_link)$"](${bounds});
    way["landuse"~"^(residential|commercial|retail|industrial|forest|grass|recreation_ground)$"](${bounds});
    way["natural"~"^(water|wood)$"](${bounds});
    nwr["place"~"^(city|town|village|suburb|neighbourhood)$"](${bounds});`;
  const local = modeId.startsWith('local-') ? `
    way["highway"~"^(unclassified|residential|living_street)$"](${bounds});
    relation["route"="bus"](${bounds});
    nwr["amenity"~"^(school|college|university|hospital|clinic|library|community_centre|place_of_worship|police)$"](${bounds});
    nwr["shop"~"^(supermarket|convenience)$"](${bounds});` : '';
  return `[out:json][timeout:45];(
    way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link)$"](${bounds});
    way["railway"~"^(rail|subway|light_rail|tram)$"](${bounds});
    nwr["railway"~"^(station|halt|tram_stop)$"](${bounds});
    nwr["public_transport"="station"](${bounds});
    way["waterway"~"^(river|canal)$"](${bounds});
    way["highway"="cycleway"](${bounds});
    relation["route"="bicycle"](${bounds});${context}${local}
  );out tags center geom;`;
}

function pointGeometry(element) {
  const lat = Number(element.lat ?? element.center?.lat), lon = Number(element.lon ?? element.center?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { type: 'Point', coordinates: [lon, lat] } : null;
}

function lineGeometry(element) {
  if (Array.isArray(element.geometry)) {
    const coordinates = element.geometry.map(point => [Number(point.lon), Number(point.lat)]).filter(point => point.every(Number.isFinite));
    if (coordinates.length >= 2) return { type: 'LineString', coordinates };
  }
  if (Array.isArray(element.members)) {
    const lines = element.members.map(member => (member.geometry || []).map(point => [Number(point.lon), Number(point.lat)]).filter(point => point.every(Number.isFinite))).filter(line => line.length >= 2);
    if (lines.length) return { type: 'MultiLineString', coordinates: lines };
  }
  return pointGeometry(element);
}

function polygonGeometry(element) {
  if (!Array.isArray(element.geometry)) return null;
  const coordinates = element.geometry.map(point => [Number(point.lon), Number(point.lat)]).filter(point => point.every(Number.isFinite));
  if (coordinates.length < 4) return null;
  const first = coordinates[0], last = coordinates.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) return null;
  return { type: 'Polygon', coordinates: [coordinates] };
}

function feature(element, className, geometry, extra = {}) {
  return {
    type: 'Feature', id: `${element.type}/${element.id}`,
    properties: { class: className, sourceId: `${element.type}/${element.id}`, name: element.tags?.name || '', ref: element.tags?.ref || '', tags: element.tags || {}, ...extra },
    geometry
  };
}

function labelFromReferenceAndName(tags, fallback) {
  const ref = String(tags.ref || '').trim();
  const name = String(tags.name || '').trim();
  return ref && name ? `${ref} - ${name}` : ref || name || fallback;
}

function isExplicitAReference(ref) {
  return /(^|[;\s])A\d{1,4}[A-Z]?(?=$|[;\s])/i.test(String(ref || '').trim());
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

export function classifyOverpassElement(element) {
  const tags = element?.tags || {};
  const geometry = lineGeometry(element);
  if (!geometry) return [];
  if (tags.highway) {
    if (/^motorway/.test(tags.highway)) return [feature(element, 'motorway', geometry, { motorwayLabel: labelFromReferenceAndName(tags, ''), label: labelFromReferenceAndName(tags, '') })];
    if (/^(trunk|primary)/.test(tags.highway)) {
      const roadLabel = labelFromReferenceAndName(tags, '');
      return [feature(element, 'main-road', geometry, { roadFunction: tags.highway, officialARef: isExplicitAReference(tags.ref) ? String(tags.ref).trim() : '', roadLabel, label: roadLabel })];
    }
    if (/^(secondary|tertiary)/.test(tags.highway)) return [feature(element, 'context-road-major', geometry, { contextType: tags.highway })];
    if (/^(unclassified|residential|living_street)$/.test(tags.highway)) return [feature(element, 'context-road-minor', geometry, { contextType: tags.highway })];
    if (tags.highway === 'cycleway') return [feature(element, 'cycle-route', geometry, { network: 'local' })];
  }
  if (tags.route === 'bicycle') {
    const network = cycleNetwork(tags);
    const metadata = {
      network: network || tags.network || 'unclassified',
      ref: tags.ref || '',
      name: tags.name || '',
      operator: tags.operator || '',
      cycleNetwork: tags.cycle_network || '',
      routeLabel: tags.ref || tags.name || ''
    };
    if (!isCurrentCycleRelation(tags)) return [feature(element, 'cycle-review', geometry, { ...metadata, reviewRequired: true, reviewReason: 'non-current-route' })];
    if (network) return [feature(element, network === 'lcn' ? 'cycle-network-local' : 'cycle-network-primary', geometry, { ...metadata, hierarchyEvidence: 'osm-route-network' })];
    return [feature(element, 'cycle-review', geometry, { ...metadata, reviewRequired: true, reviewReason: 'unsupported-network-hierarchy' })];
  }
  if (tags.route === 'bus') return [feature(element, 'bus-route', geometry, { routeLabel: tags.ref || tags.name || 'Bus route' })];
  if (tags.railway && /^(rail|subway|light_rail|tram)$/.test(tags.railway)) return [feature(element, 'railway', geometry, { railType: tags.railway })];
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
  if (tags.amenity || tags.shop) return [feature(element, 'community-candidate', pointGeometry(element) || geometry, { category: tags.amenity || tags.shop })];
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
        const features = payload.elements.flatMap(classifyOverpassElement);
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
          ],
          attribution: OSM_ATTRIBUTION
        };
        const snapshot = { ...snapshotCore, checksum: await checksum(JSON.stringify(snapshotCore)) };
        return { status: payload.elements.length ? 'success' : 'zero', features, snapshot };
      } catch (error) {
        const kind = error.name === 'AbortError' ? 'timeout' : error.kind || (error instanceof TypeError ? 'network' : 'provider');
        failures.push({ endpoint, kind, message: error.message, elapsedMs: Date.now() - started });
      } finally { clearTimeout(timer); }
    }
    throw new SourceError('all-providers-failed', 'All configured vector-data providers failed. This is not a zero-feature result.', { failures });
  }
}
