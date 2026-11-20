const text = value => String(value ?? '').trim();

function routePattern(route) {
  const escaped = text(route).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\broute\\s+${escaped}\\b`, 'gi');
}

function topicMessage(item) {
  return text(item?.message).replace(routePattern(item?.route), 'route {route}');
}

/**
 * Group repeated review records only when cause, source, and exact StopPoint
 * scope agree. The returned records are the original objects, unchanged.
 */
export function groupReviewItems(items = []) {
  const groups = new Map();
  for (const item of items) {
    const key = [item?.code, item?.source, item?.stop, topicMessage(item)]
      .map(value => text(value).toLowerCase()).join('|');
    const group = groups.get(key) ?? { key, code: item?.code ?? 'other', source: item?.source ?? 'source not supplied', stop: item?.stop ?? null, message: topicMessage(item), items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => Object.freeze({
    ...group,
    items: Object.freeze(group.items),
    routes: Object.freeze([...new Set(group.items.map(item => text(item?.route)).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true })))
  }));
}
