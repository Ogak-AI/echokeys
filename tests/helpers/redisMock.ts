export function createRedisMock() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: string) => { store.set(key, value); },
    del: async (...keys: string[]) => { keys.forEach(k => store.delete(k)); },
    list: async (opts?: { prefix?: string }) => {
      const entries = [...store.keys()];
      const filtered = opts?.prefix ? entries.filter(k => k.startsWith(opts.prefix!)) : entries;
      return filtered.map(key => ({ key }));
    },
    _store: store,
    _clear: () => store.clear(),
  };
}
