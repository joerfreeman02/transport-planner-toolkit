function distance(left, right) { return Math.hypot(left.x - right.x, left.y - right.y); }

/** Deterministically offsets clustered exported stop markers without changing source coordinates. */
export function layoutNumberedMapMarkers(items, { width, top, mapHeight, threshold = 28, edgePadding = 16 } = {}) {
  const points = (items ?? []).map(item => ({ item, original: { x: Number(item.x), y: Number(item.y) } }));
  return points.map((entry, index) => {
    const nearby = points.filter(other => distance(other.original, entry.original) < threshold);
    const rank = nearby.indexOf(entry);
    const displaced = nearby.length > 1;
    const radius = displaced ? 30 + Math.floor(rank / 6) * 13 : 0;
    const angle = displaced ? (rank % 6) * (Math.PI * 2 / 6) - Math.PI / 2 : 0;
    const point = {
      x: Math.max(edgePadding, Math.min(width - edgePadding, entry.original.x + Math.cos(angle) * radius)),
      y: Math.max(top + edgePadding, Math.min(top + mapHeight - edgePadding, entry.original.y + Math.sin(angle) * radius))
    };
    return { item: entry.item, original: entry.original, point, displaced };
  });
}
