function text(value) {
  return String(value ?? '').trim();
}

function stopId(stop) {
  return text(stop?.id || stop?.sourceId);
}

function walkingRank(stop) {
  return stop?.walking?.status === 'routed' && Number.isFinite(Number(stop.walking.distanceMetres))
    ? Number(stop.walking.distanceMetres)
    : Number.POSITIVE_INFINITY;
}

function straightLineRank(stop) {
  return Number.isFinite(Number(stop?.distanceMetres)) ? Number(stop.distanceMetres) : Number.POSITIVE_INFINITY;
}

function alphaLabel(index) {
  let value = Number(index) + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return `Stop ${result}`;
}

function explicitGroupId(stop) {
  return text(stop?.logicalGroupId || stop?.logicalGroup?.id || stop?.logicalGroupRefs?.[0]?.id);
}

function explicitGroupName(stop) {
  return text(stop?.logicalGroupName || stop?.logicalGroup?.name || stop?.logicalGroup?.commonName);
}

function groupMemberIds(stop) {
  const ids = stop?.logicalGroupMemberStopPointIds || stop?.logicalGroup?.memberStopPointIds || [];
  return [...new Set((Array.isArray(ids) ? ids : []).map(text).filter(Boolean))].sort();
}

function groupLabel(name, labels) {
  if (!name || !labels.length) return null;
  const suffix = labels.length === 1
    ? labels[0]
    : labels.length === 2
      ? `${labels[0]} and ${labels[1]}`
      : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
  return `${name} — ${suffix}`;
}

export function plannerStopIdentity(stop) {
  return stopId(stop);
}

export function buildPlannerStopPresentation(stops = []) {
  const source = [...(stops ?? [])];
  const ranked = [...source].sort((first, second) =>
    walkingRank(first) - walkingRank(second)
    || straightLineRank(first) - straightLineRank(second)
    || text(first?.name).localeCompare(text(second?.name))
    || stopId(first).localeCompare(stopId(second))
  );
  const labels = new Map(ranked.map((stop, index) => [plannerStopIdentity(stop), alphaLabel(index)]));
  const groups = new Map();
  for (const stop of source) {
    const id = explicitGroupId(stop);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, { name: explicitGroupName(stop), ids: [] });
    const group = groups.get(id);
    if (!group.name) group.name = explicitGroupName(stop);
    group.ids.push(plannerStopIdentity(stop));
    group.ids.push(...groupMemberIds(stop));
  }
  for (const group of groups.values()) {
    group.ids = [...new Set(group.ids)].filter(Boolean);
    group.labels = group.ids.map(id => labels.get(id)).filter(Boolean).sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
    group.label = groupLabel(group.name, group.labels);
  }
  return source.map(stop => {
    const id = plannerStopIdentity(stop);
    const groupId = explicitGroupId(stop);
    const group = groupId ? groups.get(groupId) : null;
    return Object.freeze({
      ...stop,
      plannerLabel: labels.get(id) || 'Stop A',
      plannerLabelIndex: ranked.findIndex(candidate => plannerStopIdentity(candidate) === id),
      logicalGroupId: groupId || null,
      logicalGroupName: group?.name || explicitGroupName(stop) || null,
      logicalGroupMemberStopPointIds: Object.freeze(group?.ids || groupMemberIds(stop)),
      logicalGroupLabel: group?.label || null
    });
  });
}
