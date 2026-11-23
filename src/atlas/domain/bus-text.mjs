/** Decode common feed entities once before text is presented to a user. */
export function normalizeBusText(value) {
  return String(value ?? '').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#x[\da-f]+|#\d+);/giu, entity => {
    const key = entity.toLowerCase();
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': '\u00a0', '&#39;': "'" };
    if (Object.hasOwn(named, key)) return named[key];
    const numeric = key.startsWith('&#x') ? Number.parseInt(key.slice(3, -1), 16)
      : key.startsWith('&#') ? Number.parseInt(key.slice(2, -1), 10) : NaN;
    return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff && !(numeric >= 0xd800 && numeric <= 0xdfff)
      ? String.fromCodePoint(numeric)
      : entity;
  });
}

export function professionalPrincipalLocationsFallback(service = {}) {
  const endpointText = [service?.destination, service?.direction].map(normalizeBusText).join(' ');
  return /demand\s+responsive\s+area/i.test(endpointText)
    ? 'Demand-responsive service area; specific locations not supplied'
    : 'Specific principal locations not supplied';
}
