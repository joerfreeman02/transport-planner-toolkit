export const DRAWING_MODES = Object.freeze({
  'regional-plan': Object.freeze({
    id: 'regional-plan',
    family: 'regional',
    title: 'Regional Plan',
    defaultDrawingTitle: 'REGIONAL PLAN',
    defaultDrawingNumber: 'EAS-SK-H-101',
    scale: 50000,
    mapFrameMm: Object.freeze({ width: 336, height: 245 }),
    requiredClasses: Object.freeze(['site', 'main-road', 'motorway', 'cycle-network', 'waterway', 'railway', 'rail-station']),
    visibleClasses: Object.freeze(['context-area', 'context-road-major', 'context-place', 'site', 'main-road', 'motorway', 'cycle-network-primary', 'cycle-network-local', 'strategic-cycle', 'waterway', 'railway', 'station-national-rail', 'station-overground', 'station-underground', 'station-dlr', 'station-tram', 'custom-line', 'custom-point', 'custom-area'])
  }),
  'regional-routing': Object.freeze({
    id: 'regional-routing',
    family: 'regional',
    title: 'Regional Routing Plan',
    defaultDrawingTitle: 'REGIONAL ROUTING PLAN',
    defaultDrawingNumber: 'EAS-SK-H-102',
    scale: 50000,
    mapFrameMm: Object.freeze({ width: 336, height: 245 }),
    requiredClasses: Object.freeze(['site', 'route-to-site', 'route-from-site']),
    visibleClasses: Object.freeze(['context-area', 'context-road-major', 'context-place', 'site', 'main-road', 'motorway', 'cycle-network-primary', 'cycle-network-local', 'strategic-cycle', 'waterway', 'railway', 'station-national-rail', 'station-overground', 'station-underground', 'station-dlr', 'station-tram', 'route-to-site', 'route-from-site', 'custom-line', 'custom-point', 'custom-area'])
  }),
  'local-context': Object.freeze({
    id: 'local-context',
    family: 'local',
    title: 'Local Context Plan',
    defaultDrawingTitle: 'LOCAL CONTEXT PLAN',
    defaultDrawingNumber: 'EAS-SK-H-105',
    scale: 2500,
    mapFrameMm: Object.freeze({ width: 318, height: 285 }),
    requiredClasses: Object.freeze(['site', 'bus-route', 'railway', 'cycle-route', 'community']),
    visibleClasses: Object.freeze(['context-area', 'context-road-major', 'context-road-minor', 'context-place', 'site', 'main-road', 'cycle-network-primary', 'cycle-network-local', 'cycle-route', 'railway', 'station-national-rail', 'station-overground', 'station-underground', 'station-dlr', 'station-tram', 'bus-route', 'community', 'custom-line', 'custom-point', 'custom-area'])
  }),
  'local-routing': Object.freeze({
    id: 'local-routing',
    family: 'local',
    title: 'Local Routing Plan',
    defaultDrawingTitle: 'LOCAL ROUTING PLAN',
    defaultDrawingNumber: 'EAS-SK-H-103',
    scale: 2500,
    mapFrameMm: Object.freeze({ width: 318, height: 285 }),
    requiredClasses: Object.freeze(['site', 'community', 'route-to-site', 'route-from-site']),
    visibleClasses: Object.freeze(['context-area', 'context-road-major', 'context-road-minor', 'context-place', 'site', 'railway', 'station-national-rail', 'station-overground', 'station-underground', 'station-dlr', 'station-tram', 'cycle-network-primary', 'cycle-network-local', 'cycle-route', 'community', 'route-to-site', 'route-from-site', 'custom-line', 'custom-point', 'custom-area'])
  })
});

export function modeConfig(id) {
  const mode = DRAWING_MODES[id];
  if (!mode) throw new Error(`Unsupported drawing mode: ${id}.`);
  return mode;
}

export function defaultMetadata(id, date = new Date()) {
  const mode = modeConfig(id);
  return {
    client: '', architect: '', project: '', projectNumber: '',
    drawingTitle: mode.defaultDrawingTitle,
    drawingNumber: mode.defaultDrawingNumber,
    designedBy: '', drawnBy: '',
    date: date.toLocaleDateString('en-GB'),
    revision: 'P01', revisionDescription: 'Live review candidate',
    drawingStatus: 'LIVE REVIEW', scale: `1:${mode.scale.toLocaleString('en-GB')}`
  };
}
