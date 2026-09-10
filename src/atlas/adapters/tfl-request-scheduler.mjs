const WINDOW_MS = 60_000;
export const DEFAULT_TFL_REQUEST_LIMIT = 45;

export function createTflRequestScheduler({
  limit = DEFAULT_TFL_REQUEST_LIMIT,
  windowMs = WINDOW_MS,
  now = () => Date.now(),
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
} = {}) {
  const requestTimes = [];
  const numericLimit = Math.max(1, Number(limit) || DEFAULT_TFL_REQUEST_LIMIT);

  function prune(current) {
    while (requestTimes.length && current - requestTimes[0] >= windowMs) requestTimes.shift();
  }

  async function schedule(label, operation) {
    for (;;) {
      const current = Number(now());
      prune(current);
      if (requestTimes.length < numericLimit) {
        requestTimes.push(current);
        const result = await operation();
        return { ...result, requestLabel: label };
      }
      const waitFor = Math.max(1, windowMs - (current - requestTimes[0]));
      await sleep(waitFor);
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
