import { isGreaterLondonPoint } from '../domain/geography.mjs';
import { distanceMetres } from '../adapters/tfl-bus-stop-adapter.mjs';

function normaliseRouteAuthorities(stop, authority = '') {
  const result = new Map();
  const explicit = stop?.routeAuthorities && typeof stop.routeAuthorities === 'object' ? stop.routeAuthorities : {};
  for (const [route, authorities] of Object.entries(explicit)) {
    const key = String(route).trim();
    if (!key) continue;
    const values = Array.isArray(authorities) ? authorities : [authorities];
    result.set(key, new Set(values.map(value => String(value).trim()).filter(Boolean)));
  }
  const hasExplicitRouteAuthorities = Object.prototype.hasOwnProperty.call(stop ?? {}, 'routeAuthorities');
  const fallback = String(authority || stop?.timetableAuthority || '').trim();
  if (!hasExplicitRouteAuthorities && fallback) for (const route of stop?.routes ?? []) {
    const key = String(route).trim();
    if (!key) continue;
    if (!result.has(key)) result.set(key, new Set());
    result.get(key).add(fallback);
  }
  return Object.fromEntries([...result.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([route, authorities]) => [route, [...authorities].sort()]));
}

function mergeRouteAuthorities(...stops) {
  const merged = new Map();
  for (const stop of stops) {
    for (const [route, authorities] of Object.entries(normaliseRouteAuthorities(stop))) {
      if (!merged.has(route)) merged.set(route, new Set());
      for (const authority of authorities) merged.get(route).add(authority);
    }
  }
  return Object.fromEntries([...merged.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([route, authorities]) => [route, [...authorities].sort()]));
}

function unavailableSourceResult(source, error = null) {
  const label = source === 'TfL' ? 'TfL StopPoint' : 'NaPTAN';
  return {
    ok: false,
    code: 'unavailable_source',
    message: `${label} bus-stop discovery was unavailable.`,
    data: null,
    evidence: [],
    warnings: [`${label} bus-stop discovery was unavailable; stop coverage is incomplete.`],
    provenance: { source: label, unavailable: true, technicalErrorType: error ? String(error?.name || 'source_rejected') : null }
  };
}

function settledSource(settled, source) {
  return settled.status === 'fulfilled' ? (settled.value ?? unavailableSourceResult(source)) : unavailableSourceResult(source, settled.reason);
}

async function enrichPreparedStopSidecars(result, referenceData, naptanAdapter, options = {}) {
  if (!result?.ok || !Array.isArray(result.data) || !result.data.length) return result;
  const references = referenceData?.resolveStopReferences
    ? await referenceData.resolveStopReferences(result.data, options)
    : await (async () => {
      const groupRequest = typeof naptanAdapter?.logicalGroupsForStops === 'function' ? naptanAdapter.logicalGroupsForStops(result.data, options) : Promise.resolve({ ok: true, data: [], provenance: { groupingAvailable: false } });
      const localityRequest = typeof naptanAdapter?.localitiesForStops === 'function' ? naptanAdapter.localitiesForStops(result.data, options) : Promise.resolve({ ok: true, data: [], provenance: { localityAvailable: false } });
      const [groupsSettled, localitiesSettled] = await Promise.allSettled([groupRequest, localityRequest]);
      return {
        ok: groupsSettled.status === 'fulfilled' && localitiesSettled.status === 'fulfilled',
        logicalGroups: groupsSettled.status === 'fulfilled' ? groupsSettled.value.data ?? [] : [],
        localities: localitiesSettled.status === 'fulfilled' ? localitiesSettled.value.data ?? [] : [],
        warnings: [
          ...(groupsSettled.status === 'fulfilled' ? groupsSettled.value.warnings ?? [] : ['Logical stop grouping evidence could not be checked.']),
          ...(localitiesSettled.status === 'fulfilled' ? localitiesSettled.value.warnings ?? [] : ['NPTG locality evidence could not be checked.'])
        ],
        provenance: { logicalGroups: groupsSettled.status === 'fulfilled' ? groupsSettled.value.provenance ?? {} : {}, nptg: localitiesSettled.status === 'fulfilled' ? localitiesSettled.value.provenance ?? {} : {} }
      };
    })();
  const groupsResult = { ok: references.ok, data: references.logicalGroups ?? [], warnings: references.warnings ?? [], provenance: references.provenance?.logicalGroups ?? {} };
  const localitiesResult = { ok: references.ok, data: references.localities ?? [], warnings: references.warnings ?? [], provenance: references.provenance?.nptg ?? {} };
  const groups = new Map((groupsResult.data ?? []).map(group => [String(group.id), group]));
  const localities = new Map((localitiesResult.data ?? []).flatMap(locality => [
    [String(locality.id ?? ''), locality],
    [String(locality.code ?? ''), locality]
  ]));
  const data = result.data.map(stop => {
    const group = (stop.logicalGroupRefs ?? []).map(ref => groups.get(String(ref.id))).find(Boolean);
    const locality = localities.get(`nptg:${stop.nptgLocalityCode}`) || localities.get(String(stop.nptgLocalityCode ?? ''));
    const logicalGroupEvidence = (stop.logicalGroupRefs ?? []).map(ref => groups.get(String(ref.id))).filter(Boolean);
    return {
      ...stop,
      logicalGroup: group || stop.logicalGroup || null,
      logicalGroupId: group?.id || stop.logicalGroupId || null,
      logicalGroupName: group?.name || stop.logicalGroupName || null,
      logicalGroupMemberStopPointIds: group?.memberStopPointIds || stop.logicalGroupMemberStopPointIds || [],
      logicalGroupEvidence,
      nptgLocality: locality || stop.nptgLocality || null,
      nptgLocalityEvidence: locality || stop.nptgLocality || null,
      nptgLocalityCode: stop.nptgLocalityCode || locality?.code || null,
      nptgLocalityName: locality?.name || stop.nptgLocalityName || null,
      locality: stop.locality || locality?.name || null,
      parentLocality: stop.parentLocality || locality?.parentLocalityName || locality?.parentLocality?.name || null,
      parentLocalityId: locality?.parentLocalityId || locality?.parentLocality?.id || stop.parentLocalityId || null,
      districtId: locality?.districtId || stop.districtId || null,
      districtName: locality?.districtName || stop.districtName || null,
      referenceDataProvenance: locality?.provenance || stop.referenceDataProvenance || null,
      localityResolution: locality ? 'resolved' : (stop.nptgLocalityCode ? 'unresolved' : 'not-supplied')
    };
  });
  const warnings = [...new Set([...(result.warnings ?? []), ...(groupsResult.warnings ?? []), ...(localitiesResult.warnings ?? [])])];
  return {
    ...result,
    data,
    warnings,
    provenance: {
      ...(result.provenance ?? {}),
      referenceData: references.provenance ?? {},
      logicalGroupingAvailable: groupsResult.provenance?.groupingAvailable ?? groupsResult.ok,
      localityEvidenceAvailable: localitiesResult.provenance?.localityAvailable ?? localitiesResult.ok
    }
  };
}

async function reconcilePreparedStopPoints(result, referenceData, naptanAdapter, options = {}) {
  if (!result?.ok || !Array.isArray(result.data) || !result.data.length) return result;
  const resolver = referenceData?.resolvePreparedStopPointsByIds || (typeof naptanAdapter?.preparedStopPointsByIds === 'function'
    ? (stopIds, resolverOptions) => naptanAdapter.preparedStopPointsByIds(stopIds, resolverOptions)
    : null);
  if (!resolver) return result;
  const stopIds = result.data.map(stop => String(stop.id || stop.sourceId || '')).filter(Boolean);
  const preparedResult = await resolver(stopIds, options);
  const physicalStops = preparedResult?.physicalStops ?? preparedResult?.data ?? [];
  const preparedById = new Map(physicalStops.map(stop => [String(stop.id), stop]));
  const data = result.data.map(stop => {
    const prepared = preparedById.get(String(stop.id || stop.sourceId));
    if (!prepared) return stop;
    return {
      ...stop,
      logicalGroupRefs: prepared.logicalGroupRefs ?? stop.logicalGroupRefs ?? [],
      nptgLocalityCode: prepared.nptgLocalityCode ?? stop.nptgLocalityCode ?? null,
      status: prepared.status ?? stop.status ?? null,
      transportMode: prepared.transportMode ?? stop.transportMode ?? 'bus',
      administrativeAreaCode: prepared.administrativeAreaCode ?? stop.administrativeAreaCode ?? null,
      coordinateMethod: prepared.coordinateMethod ?? stop.coordinateMethod ?? null,
      preparedNaPTANProvenance: prepared.provenance ?? null
    };
  });
  const available = preparedResult?.provenance?.preparedStopPointsAvailable !== false;
  return {
    ...result,
    data,
    warnings: [...new Set([...(result.warnings ?? []), ...(preparedResult?.warnings ?? [])])],
    provenance: {
      ...(result.provenance ?? {}),
      preparedNaPTANStructural: {
        available,
        exactRequestedIds: stopIds,
        exactMatchedIds: [...preparedById.keys()].sort(),
        exactUnmatchedIds: stopIds.filter(id => !preparedById.has(id)).sort(),
        ...(preparedResult?.provenance ?? {})
      }
    }
  };
}

function activeLogicalGroupRefs(stop) {
  return (stop?.logicalGroupRefs ?? []).filter(ref => String(ref?.status ?? '').toLowerCase() === 'active' && String(ref?.id ?? '').trim());
}

function stopAreaGroupRef(group) {
  return { id: group.id, sourceId: group.sourceId || String(group.id).replace(/^naptan:/, ''), status: 'active', targetExists: true };
}

function withStopAreaMetadata(stop, { groupIds = [], logicalGroupIds = null, groups = [], memberIds = [], core = false, groupCompleted = false, status = null, logicalGroupRefs = null } = {}) {
  const ids = [...new Set((logicalGroupIds ?? groupIds).map(String).filter(Boolean))].sort();
  const evidence = groups.filter(Boolean).sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const refs = ids.map(id => stopAreaGroupRef(evidence.find(group => String(group.id) === id) || { id }));
  const firstGroup = evidence[0] || null;
  return {
    ...stop,
    logicalGroupIds: ids,
    logicalGroupRefs: logicalGroupRefs || (refs.length ? refs : (stop.logicalGroupRefs ?? [])),
    logicalGroupEvidence: evidence,
    logicalGroup: firstGroup || stop.logicalGroup || null,
    logicalGroupId: firstGroup?.id || ids[0] || stop.logicalGroupId || null,
    logicalGroupName: firstGroup?.name || stop.logicalGroupName || null,
    logicalGroupMemberStopPointIds: [...new Set(memberIds.map(String).filter(Boolean))].sort(),
    core,
    groupCompleted,
    stopAreaCompletionStatus: status || (groupCompleted ? 'GROUP_COMPLETED_OUTSIDE_CORE_RADIUS' : 'CORE')
  };
}

async function completePreparedStopAreas(result, site, referenceData, naptanAdapter, options = {}) {
  if (!result?.ok || !Array.isArray(result.data)) return result;
  const coreStops = result.data.map(stop => ({
    ...stop,
    distanceMetres: Number.isFinite(Number(stop.distanceMetres)) ? Number(stop.distanceMetres) : distanceMetres(site, stop),
    core: true,
    groupCompleted: false,
    stopAreaCompletionStatus: 'CORE'
  }));
  const resolver = referenceData?.resolveStopAreaStructure || (typeof naptanAdapter?.stopAreaStructureForStops === 'function'
    ? (stops, resolverOptions) => naptanAdapter.stopAreaStructureForStops(stops, resolverOptions)
    : null);
  if (!resolver) {
    return {
      ...result,
      data: coreStops,
      warnings: [...new Set([...(result.warnings ?? []), 'StopArea physical structure completion was not available for this prepared dataset.'])],
      provenance: { ...(result.provenance ?? {}), stopAreaCompletion: { algorithm: 'CORE_SET -> direct active StopAreas -> direct physical members', available: false, qualifiedGroupCount: 0, completedMemberCount: 0 } }
    };
  }
  const structureResult = await resolver(coreStops, options);
  const structure = structureResult?.structure ?? structureResult?.data ?? null;
  const available = structureResult?.provenance?.stopAreaCompletionAvailable !== false;
  if (!structureResult?.ok) {
    return {
      ...result,
      ok: false,
      code: structureResult.code || 'unavailable_source',
      message: structureResult.message || 'StopArea physical structure could not be safely checked.',
      data: null,
      warnings: [...new Set([...(result.warnings ?? []), ...(structureResult.warnings ?? []), 'StopArea physical structure evidence was incomplete; no structural zero conclusion was made.'])],
      provenance: { ...(result.provenance ?? {}), stopAreaCompletion: { algorithm: 'CORE_SET -> direct active StopAreas -> direct physical members', available, failed: true, ...(structureResult.provenance ?? {}) } }
    };
  }
  if (!available) {
    return {
      ...result,
      data: coreStops,
      warnings: [...new Set([...(result.warnings ?? []), ...(structureResult.warnings ?? [])])],
      provenance: { ...(result.provenance ?? {}), stopAreaCompletion: { algorithm: 'CORE_SET -> direct active StopAreas -> direct physical members', available: false, qualifiedGroupCount: 0, completedMemberCount: 0, ...(structureResult.provenance ?? {}) } }
    };
  }
  const groups = Array.isArray(structure.groups) ? structure.groups : [];
  const members = Array.isArray(structure.members) ? structure.members : [];
  const byCoreId = new Map(coreStops.map(stop => [String(stop.id || stop.sourceId), stop]));
  const groupById = new Map(groups.map(group => [String(group.id), group]));
  const memberIdsByGroup = new Map(groups.map(group => [String(group.id), [...new Set((group.directMemberIds ?? group.memberStopPointIds ?? []).map(String).filter(Boolean))]]));
  const qualifiedGroupsByStop = new Map();
  for (const stop of coreStops) {
    const ids = activeLogicalGroupRefs(stop).map(ref => String(ref.id));
    qualifiedGroupsByStop.set(String(stop.id || stop.sourceId), ids.map(id => groupById.get(id)).filter(Boolean));
  }
  const allGroupIdsByMember = new Map();
  for (const group of groups) for (const id of memberIdsByGroup.get(String(group.id)) ?? []) {
    if (!allGroupIdsByMember.has(id)) allGroupIdsByMember.set(id, []);
    allGroupIdsByMember.get(id).push(String(group.id));
  }
  const completed = [];
  for (const member of members) {
    const id = String(member.id || member.sourceId || '');
    if (!id || byCoreId.has(id)) continue;
    const groupIds = [...new Set([...(member.groupIds ?? []), ...(allGroupIdsByMember.get(id) ?? [])].map(String))].sort();
    const memberGroups = groupIds.map(groupId => groupById.get(groupId)).filter(Boolean);
    completed.push(withStopAreaMetadata({
      ...member,
      id,
      sourceId: member.sourceId || id,
      indicator: Object.prototype.hasOwnProperty.call(member, 'indicator') ? member.indicator : null,
      direction: Object.prototype.hasOwnProperty.call(member, 'direction') ? member.direction : null,
      routes: Array.isArray(member.routes) ? member.routes : [],
      routeAuthorities: member.routeAuthorities && typeof member.routeAuthorities === 'object' ? member.routeAuthorities : {},
      timetableAuthority: member.timetableAuthority || 'NaPTAN',
      distanceMetres: distanceMetres(site, member)
    }, {
      groupIds,
      logicalGroupIds: [...new Set([...groupIds, ...activeLogicalGroupRefs(member).map(ref => String(ref.id))])],
      groups: memberGroups,
      memberIds: memberGroups.flatMap(group => memberIdsByGroup.get(String(group.id)) ?? []),
      core: false,
      groupCompleted: true,
      status: 'GROUP_COMPLETED_OUTSIDE_CORE_RADIUS',
      logicalGroupRefs: member.logicalGroupRefs
    }));
  }
  const enrichedCore = coreStops.map(stop => {
    const id = String(stop.id || stop.sourceId);
    const stopGroups = qualifiedGroupsByStop.get(id) ?? [];
    const groupIds = [...new Set([...activeLogicalGroupRefs(stop).map(ref => String(ref.id)), ...stopGroups.map(group => String(group.id))])];
    return withStopAreaMetadata(stop, {
      groupIds,
      groups: stopGroups,
      memberIds: stopGroups.flatMap(group => memberIdsByGroup.get(String(group.id)) ?? []),
      core: true,
      groupCompleted: false,
      status: 'CORE',
      logicalGroupRefs: stop.logicalGroupRefs
    });
  });
  const data = [...enrichedCore, ...completed].sort((left, right) => Number(left.distanceMetres) - Number(right.distanceMetres) || String(left.id).localeCompare(String(right.id)));
  const qaInvalid = structure.invalidMembers ?? [];
  const qaUnresolved = structure.unresolvedGroups ?? [];
  const completionProvenance = {
    algorithm: 'CORE_SET -> directly referenced active StopAreas -> union of active direct physical members -> STOP',
    noRecursion: true,
    available: true,
    qualifiedGroupCount: groups.length,
    coreCount: coreStops.length,
    completedMemberCount: completed.length,
    invalidMemberCount: qaInvalid.length,
    unresolvedGroupCount: qaUnresolved.length,
    invalidMembers: qaInvalid,
    unresolvedGroups: qaUnresolved,
    ...(structureResult.provenance ?? {})
  };
  return {
    ...result,
    data,
    warnings: [...new Set([...(result.warnings ?? []), ...(structureResult.warnings ?? [])])],
    provenance: { ...(result.provenance ?? {}), stopAreaCompletion: completionProvenance }
  };
}

export function createBusStopDiscovery({ tflAdapter, naptanAdapter, referenceData = null, londonCoverage = isGreaterLondonPoint, crossBoundaryTfL = false } = {}) {
  if (!tflAdapter?.nearbyStops || !naptanAdapter?.nearbyStops) throw new Error('TfL and NaPTAN bus-stop adapters are required.');

  async function nearbyStops(site, options = {}) {
    const insideLondon = londonCoverage(site);
    const provider = insideLondon ? tflAdapter : naptanAdapter;
    let result = await provider.nearbyStops(site, options);
    if (!insideLondon && crossBoundaryTfL) {
      const [nationalResult, tflResult] = await Promise.allSettled([
        Promise.resolve(result),
        tflAdapter.nearbyStops(site, options)
      ]);
      const national = settledSource(nationalResult, 'NaPTAN');
      const tfl = settledSource(tflResult, 'TfL');
      const nationalAvailable = Boolean(national?.ok);
      const tflAvailable = Boolean(tfl?.ok);
      const usable = [national, tfl].filter(candidate => candidate?.ok);
      if (usable.length) {
        const combined = usable.flatMap(candidate => candidate.data ?? []);
        const mergedStops = new Map();
        for (const stop of combined) {
          const id = String(stop.id || stop.sourceId || '').trim();
          if (!id) continue;
          const authority = String(stop.timetableAuthority || '').trim();
          const existing = mergedStops.get(id);
          if (!existing) {
            mergedStops.set(id, {
              ...stop,
              sourceId: stop.sourceId || id,
              sourceAuthorities: authority ? [authority] : [],
              timetableAuthorities: authority ? [authority] : [],
              routes: [...new Set(stop.routes ?? [])],
              routeAuthorities: normaliseRouteAuthorities(stop, authority)
            });
            continue;
          }
          const authorities = [...new Set([...(existing.sourceAuthorities ?? []), ...(authority ? [authority] : [])])].sort();
          const timetableAuthorities = [...new Set([...(existing.timetableAuthorities ?? []), ...(authority ? [authority] : [])])].sort();
          const prefersTfL = timetableAuthorities.includes('TfL');
          mergedStops.set(id, {
            ...existing,
            ...stop,
            id,
            name: existing.name || stop.name,
            latitude: Number.isFinite(Number(existing.latitude)) ? existing.latitude : stop.latitude,
            longitude: Number.isFinite(Number(existing.longitude)) ? existing.longitude : stop.longitude,
            distanceMetres: Math.min(Number(existing.distanceMetres) || Number.POSITIVE_INFINITY, Number(stop.distanceMetres) || Number.POSITIVE_INFINITY),
            sourceAuthorities: authorities,
            timetableAuthorities,
            timetableAuthority: prefersTfL ? 'TfL' : (timetableAuthorities[0] || existing.timetableAuthority || null),
            routes: [...new Set([...(existing.routes ?? []), ...(stop.routes ?? [])])].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })),
            routeAuthorities: mergeRouteAuthorities(existing, stop)
          });
        }
        const data = [...mergedStops.values()].sort((a, b) => Number(a.distanceMetres) - Number(b.distanceMetres) || String(a.id).localeCompare(String(b.id)));
        result = {
          ok: true,
          status: nationalAvailable && tflAvailable ? 'complete' : 'partial',
          data,
          evidence: usable.flatMap(candidate => candidate.evidence ?? []),
          warnings: [...new Set([
            ...[national, tfl].flatMap(candidate => candidate.warnings ?? []),
            ...(nationalAvailable && tflAvailable ? [] : ['Cross-boundary stop coverage is incomplete because one required stop source was unavailable.']),
            ...(tflAvailable ? ['TfL StopPoint records were checked at this confirmed point outside the Greater London boundary; TfL timetable authority is limited to the returned StopPoint records.'] : []),
            ...(!tflAvailable ? ['TfL StopPoint records were unavailable; cross-boundary TfL stop coverage could not be checked.'] : []),
            ...(!nationalAvailable ? ['NaPTAN stop records were unavailable; national stop coverage could not be checked.'] : [])
          ])],
          provenance: {
            source: 'NaPTAN with source-aware TfL cross-boundary check',
            retrievedAt: national?.provenance?.retrievedAt || tfl?.provenance?.retrievedAt || null,
            providerSelectedBy: 'Confirmed point checked against the official Greater London boundary and returned source-specific StopPoint records',
            providerAdapter: 'prepared-naptan-bus-stop-v1 + tfl-bus-stop-v1',
            national: national?.provenance ?? null,
            tfl: tfl?.provenance ?? null,
            crossBoundaryTfL: tflAvailable,
            crossBoundaryTfLAttempted: true,
            nationalStopSourceAvailable: nationalAvailable,
            tflStopSourceAvailable: tflAvailable,
            stopCoverageComplete: nationalAvailable && tflAvailable
          }
        };
      } else {
        return {
          ok: false,
          code: national.code || tfl.code || 'unavailable_source',
          message: 'Required bus-stop sources could not be checked. Stop coverage is unavailable.',
          data: null,
          evidence: [],
          warnings: [...new Set([...(national.warnings ?? []), ...(tfl.warnings ?? []), 'Required national and TfL stop sources were unavailable; no authoritative zero-stop conclusion can be made.'])],
          provenance: {
            source: 'NaPTAN with source-aware TfL cross-boundary check',
            national: national.provenance ?? null,
            tfl: tfl.provenance ?? null,
            crossBoundaryTfL: false,
            crossBoundaryTfLAttempted: true,
            nationalStopSourceAvailable: false,
            tflStopSourceAvailable: false,
            stopCoverageComplete: false
          }
        };
      }
    }
    if (insideLondon) {
      const hasPreparedStructure = Boolean(referenceData?.resolvePreparedStopPointsByIds || typeof naptanAdapter?.preparedStopPointsByIds === 'function');
      if (hasPreparedStructure) {
        result = await reconcilePreparedStopPoints(result, referenceData, naptanAdapter, { forceRefresh: options.forceRefresh });
        result = await enrichPreparedStopSidecars(result, referenceData, naptanAdapter, { forceRefresh: options.forceRefresh });
        if (result.provenance?.preparedNaPTANStructural?.available !== false) result = await completePreparedStopAreas(result, site, referenceData, naptanAdapter, { forceRefresh: options.forceRefresh });
      }
    } else {
      result = await enrichPreparedStopSidecars(result, referenceData, naptanAdapter, { forceRefresh: options.forceRefresh });
      result = await completePreparedStopAreas(result, site, referenceData, naptanAdapter, { forceRefresh: options.forceRefresh });
    }
    if (!result?.provenance) return result;
    return Object.freeze({
      ...result,
      provenance: Object.freeze({
        ...result.provenance,
        providerSelectedBy: 'Confirmed assessment point checked against the official Greater London boundary',
        providerAdapter: result.provenance.providerAdapter || provider.id,
        nationalStopSourceAvailable: result.provenance.nationalStopSourceAvailable ?? (insideLondon ? null : Boolean(result.ok)),
        tflStopSourceAvailable: result.provenance.tflStopSourceAvailable ?? (insideLondon ? Boolean(result.ok) : null),
        stopCoverageComplete: result.provenance.stopCoverageComplete ?? Boolean(result.ok)
      })
    });
  }

  return Object.freeze({ id: 'authoritative-bus-stop-discovery-v1', nearbyStops });
}
