const WINDOW_MS = 60_000;
export const DEFAULT_TFL_REQUEST_LIMIT = 45;

export function createTflRequestScheduler({
  limit = DEFAULT_TFL_REQUEST_LIMIT,
  windowMs = WINDOW_MS,
  now = () => Date.now(),
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  onEvent = null
} = {}) {
  const requestTimes = [];
  const numericLimit = Math.max(1, Number(limit) || DEFAULT_TFL_REQUEST_LIMIT);

  function prune(current) {
    while (requestTimes.length && current - requestTimes[0] >= windowMs) requestTimes.shift();
  }

  function emit(event) {
    if (typeof onEvent !== 'function') return;
    try { onEvent(Object.freeze({ ...event, snapshot: snapshot() })); } catch { /* observers must never alter request behaviour */ }
  }

  async function schedule(label, operation, { progress = {} } = {}) {
    const hasProgressObserver = progress && Object.keys(progress).length > 0;
    for (;;) {
      const current = Number(now());
      prune(current);
      if (requestTimes.length < numericLimit) {
        requestTimes.push(current);
        const result = await operation();
        return { ...result, requestLabel: label };
      }
      const waitFor = Math.max(1, windowMs - (current - requestTimes[0]));
      if (hasProgressObserver) emit({ ...progress, phase: progress.phase || 'checking-timetables', waiting: true, waitMilliseconds: waitFor, requestLabel: label });
      await sleep(waitFor);
      if (hasProgressObserver) emit({ ...progress, phase: progress.phase || 'checking-timetables', waiting: false, requestLabel: label });
    }
  }

  function snapshot() {
    const current = Number(now());
    prune(current);
    return Object.freeze({
      limit: numericLimit,
      windowMs,
      requestsInWindow: requestTimes.length,
      oldestRequestAt: requestTimes[0] ?? null
    });
  }

  return Object.freeze({ schedule, snapshot });
}
