const EMPTY_RESULT = Object.freeze({ ok: true, data: [], warnings: [], provenance: {} });

function safeResult(result, fallbackProvenance) {
  return result && typeof result === 'object'
    ? result
    : { ...EMPTY_RESULT, provenance: fallbackProvenance };
}

/**
 * Provider-neutral ATLAS reference-data boundary.
 *
 * Consumers receive locality and logical-group evidence through this
 * interface; they do not need to know whether the records came from
 * prepared NaPTAN/NPTG data, another reference provider, or a V1 fallback.
 * This boundary only resolves evidence. It does not merge physical stops or
 * make planner/service decisions.
 */
export function createAtlasReferenceData({ adapter = null } = {}) {
  async function resolveStopReferences(stops = [], options = {}) {
    const groupRequest = typeof adapter?.logicalGroupsForStops === 'function'
      ? adapter.logicalGroupsForStops(stops, options)
      : Promise.resolve({ ...EMPTY_RESULT, provenance: { logicalGroupingAvailable: false } });
    const localityRequest = typeof adapter?.localitiesForStops === 'function'
      ? adapter.localitiesForStops(stops, options)
      : Promise.resolve({ ...EMPTY_RESULT, provenance: { nptgLocalityAvailable: false } });
    const [groupsSettled, localitiesSettled] = await Promise.allSettled([groupRequest, localityRequest]);
    const groups = groupsSettled.status === 'fulfilled'
      ? safeResult(groupsSettled.value, { logicalGroupingAvailable: false })
      : { ok: false, data: [], warnings: ['Logical stop-group reference data could not be checked.'], provenance: { logicalGroupingAvailable: false } };
    const localities = localitiesSettled.status === 'fulfilled'
      ? safeResult(localitiesSettled.value, { nptgLocalityAvailable: false })
      : { ok: false, data: [], warnings: ['NPTG locality reference data could not be checked.'], provenance: { nptgLocalityAvailable: false } };
    return Object.freeze({
      ok: Boolean(groups.ok && localities.ok),
      logicalGroups: Object.freeze([...(groups.data ?? [])]),
      localities: Object.freeze([...(localities.data ?? [])]),
      warnings: Object.freeze([...new Set([...(groups.warnings ?? []), ...(localities.warnings ?? [])])]),
      provenance: Object.freeze({
        referenceDataSchema: 'atlas-reference-data-v1',
        provider: adapter?.id || 'reference-data-provider',
        logicalGroupingAvailable: groups.provenance?.groupingAvailable ?? groups.provenance?.logicalGroupingAvailable ?? groups.ok,
        nptgLocalityAvailable: localities.provenance?.localityAvailable ?? localities.provenance?.nptgLocalityAvailable ?? localities.ok,
        logicalGroups: groups.provenance ?? {},
        nptg: localities.provenance ?? {}
      })
    });
  }

  return Object.freeze({ id: 'atlas-reference-data-v1', resolveStopReferences });
}

