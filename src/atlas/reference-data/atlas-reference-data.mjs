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

  async function resolveStopAreaStructure(stops = [], options = {}) {
    if (typeof adapter?.stopAreaStructureForStops !== 'function') {
      return Object.freeze({
        ok: true,
        structure: { groups: [], members: [], invalidMembers: [], unresolvedGroups: [] },
        warnings: [],
        provenance: {
          referenceDataSchema: 'atlas-reference-data-v1',
          provider: adapter?.id || 'reference-data-provider',
          stopAreaCompletionAvailable: false
        }
      });
    }
    const result = await adapter.stopAreaStructureForStops(stops, options);
    const safe = result && typeof result === 'object' ? result : { ok: false, code: 'invalid_response', message: 'StopArea structure evidence could not be checked.', data: null, warnings: [] };
    return Object.freeze({
      ok: Boolean(safe.ok),
      structure: safe.data ?? { groups: [], members: [], invalidMembers: [], unresolvedGroups: [] },
      warnings: Object.freeze([...(safe.warnings ?? [])]),
      provenance: Object.freeze({
        referenceDataSchema: 'atlas-reference-data-v1',
        provider: adapter?.id || 'reference-data-provider',
        stopAreaCompletionAvailable: safe.provenance?.stopAreaCompletionAvailable ?? safe.ok,
        stopArea: safe.provenance ?? {}
      }),
      ...(safe.code ? { code: safe.code } : {}),
      ...(safe.message ? { message: safe.message } : {})
    });
  }

  async function resolvePreparedStopPointsByIds(stopIds = [], options = {}) {
    if (typeof adapter?.preparedStopPointsByIds !== 'function') {
      return Object.freeze({
        ok: true,
        physicalStops: [],
        warnings: [],
        provenance: {
          referenceDataSchema: 'atlas-reference-data-v1',
          provider: adapter?.id || 'reference-data-provider',
          preparedStopPointsAvailable: false,
          requestedIds: [...new Set(stopIds.map(String))]
        }
      });
    }
    const result = await adapter.preparedStopPointsByIds(stopIds, options);
    const safe = result && typeof result === 'object' ? result : { ok: false, code: 'invalid_response', message: 'Prepared physical StopPoint evidence could not be checked.', data: [], warnings: [] };
    return Object.freeze({
      ok: Boolean(safe.ok),
      physicalStops: Object.freeze([...(safe.data ?? [])]),
      warnings: Object.freeze([...(safe.warnings ?? [])]),
      provenance: Object.freeze({
        referenceDataSchema: 'atlas-reference-data-v1',
        provider: adapter?.id || 'reference-data-provider',
        preparedStopPointsAvailable: safe.provenance?.preparedStopPointsAvailable ?? safe.ok,
        physicalStops: safe.provenance ?? {}
      }),
      ...(safe.code ? { code: safe.code } : {}),
      ...(safe.message ? { message: safe.message } : {})
    });
  }

  return Object.freeze({ id: 'atlas-reference-data-v1', resolveStopReferences, resolveStopAreaStructure, resolvePreparedStopPointsByIds });
}

