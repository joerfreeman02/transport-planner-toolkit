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

// Rail line styling must only use explicit way/relation evidence. Unlike stations,
// a bare railway=rail way does not establish a passenger-service mode.
export function modeForRailGeometryTags(tags = {}) {
  const summary = normal([tags.network, tags.operator, tags.line, tags.route, tags.name, tags.description].filter(Boolean).join(' '));
  if (tags.railway === 'tram' || tags.railway === 'light_rail' || summary.includes('tramlink') || /\btram\b/.test(summary)) return 'Tram/light rail';
  if (summary.includes('docklands light railway') || /\bdlr\b/.test(summary)) return 'DLR';
  if (summary.includes('london overground') || /\boverground\b/.test(summary)) return 'London Overground';
  if (tags.railway === 'subway' || summary.includes('london underground') || /\bunderground\b/.test(summary)) return 'London Underground';
  if (/\b(national rail|network rail|great western|northern|southern|thameslink|southeastern|greater anglia|avanti|chiltern)\b/.test(summary)) return 'National Rail';
  return '';
}

export const RAIL_MODE_CLASS = Object.freeze({
  'National Rail': 'station-national-rail',
  'London Overground': 'station-overground',
  'London Underground': 'station-underground',
  DLR: 'station-dlr',
  'Tram/light rail': 'station-tram'
});
