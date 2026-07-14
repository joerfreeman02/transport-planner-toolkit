export const APP_VERSION = 'Alpha 0.1';
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];
export const ROUTING_BASE = 'https://routing.openstreetmap.de';
export const REQUEST_TIMEOUTS = { geocode: 12000, overpass: 22000, route: 9000 };
export const FALLBACK_SPEED_KMH = { foot: 4.8, bike: 15.5 };
export const MAX_ROUTE_CONCURRENCY = 4;
