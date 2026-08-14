const normal = value => String(value || '').toLowerCase().trim();

// Adapted read-only from the accepted Railway Assessment discovery semantics.
export function hasRailEvidence(tags = {}) {
  const railway = normal(tags.railway);
  const station = normal(tags.station);
  const context = normal([tags.network, tags.operator, tags.line, tags.route, tags.description, tags.name].filter(Boolean).join(' '));
  return ['station', 'halt', 'tram_stop'].includes(railway)
    || ['train', 'subway', 'light_rail', 'monorail'].includes(station)
    || ['train', 'subway', 'tram', 'light_rail', 'monorail'].some(key => normal(tags[key]) === 'yes')
    || /\b(rail|railway|underground|overground|tram|dlr|metro)\b/.test(context);
}

export function modeForTags(tags = {}) {
  const summary = normal([tags.network, tags.operator, tags.line, tags.station, tags.name].filter(Boolean).join(' '));
  if (tags.railway === 'tram_stop' || summary.includes('tramlink') || summary.includes('tram')) return 'Tram/light rail';
  if (summary.includes('docklands light railway') || summary.includes(' dlr') || summary.startsWith('dlr')) return 'DLR';
  if (summary.includes('london overground') || summary.includes('overground')) return 'London Overground';
  if (tags.station === 'subway' || summary.includes('london underground') || summary.includes('underground')) return 'London Underground';
  if (tags.station === 'light_rail') return 'Tram/light rail';
  return 'National Rail';
}

export const RAIL_MODE_CLASS = Object.freeze({
  'National Rail': 'station-national-rail',
  'London Overground': 'station-overground',
  'London Underground': 'station-underground',
  DLR: 'station-dlr',
  'Tram/light rail': 'station-tram'
});
