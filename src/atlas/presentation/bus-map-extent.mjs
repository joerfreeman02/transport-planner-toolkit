function point(value) {
  const latitude = Number(value?.latitude ?? value?.lat);
  const longitude = Number(value?.longitude ?? value?.lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    ? { latitude, longitude }
    : null;
}

/** Return deterministic south/west and north/east bounds for an assessment map. */
export function buildAssessmentMapExtent({ site, stops = [], radiusMetres = 0 } = {}) {
  const center = point(site);
  if (!center) throw new Error('A valid assessment point is required to frame the map.');
  const points = [center, ...(stops ?? []).map(point).filter(Boolean)];
  const radius = Number(radiusMetres);
  if (Number.isFinite(radius) && radius > 0) {
    const latitudeDelta = radius / 111_320;
    const longitudeDelta = radius / (111_320 * Math.max(0.15, Math.cos(center.latitude * Math.PI / 180)));
    points.push(
      { latitude: center.latitude - latitudeDelta, longitude: center.longitude - longitudeDelta },
      { latitude: center.latitude + latitudeDelta, longitude: center.longitude + longitudeDelta }
    );
  }
  return Object.freeze([
    Object.freeze({ latitude: Math.min(...points.map(item => item.latitude)), longitude: Math.min(...points.map(item => item.longitude)) }),
    Object.freeze({ latitude: Math.max(...points.map(item => item.latitude)), longitude: Math.max(...points.map(item => item.longitude)) })
  ]);
}
