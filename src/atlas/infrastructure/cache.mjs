export function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

export function createJsonCache({ storage = globalThis.localStorage, clock = () => Date.now(), namespace = 'atlas.alpha1' } = {}) {
  const keyFor = key => `${namespace}:${key}`;
  return {
    read(key, { freshForMs }) {
      if (!storage) return { status: 'miss', value: null };
      try {
        const record = JSON.parse(storage.getItem(keyFor(key)) || 'null');
        if (!record || !Number.isFinite(record.storedAt)) return { status: 'miss', value: null };
        const ageMs = Math.max(0, clock() - record.storedAt);
        return { status: ageMs <= freshForMs ? 'hit' : 'stale', value: record.value, storedAt: new Date(record.storedAt).toISOString(), ageMs, key: keyFor(key) };
      } catch {
        return { status: 'miss', value: null, warning: 'Cached data was unreadable and was ignored.' };
      }
    },
    write(key, value) {
      if (!storage) return { status: 'write-failed', key: keyFor(key) };
      const storedAt = clock();
      try {
        storage.setItem(keyFor(key), JSON.stringify({ storedAt, value }));
        return { status: 'miss', key: keyFor(key), storedAt: new Date(storedAt).toISOString() };
      } catch {
        return { status: 'write-failed', key: keyFor(key) };
      }
    }
  };
}
