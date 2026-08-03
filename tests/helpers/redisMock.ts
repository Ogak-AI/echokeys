export function createRedisMock() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: string) => {
      store.set(key, value);
    },
    del: async (...keys: string[]) => {
      keys.forEach((k) => {
        store.delete(k);
        ttls.delete(k);
      });
    },
    expire: async (key: string, seconds: number) => {
      if (store.has(key)) ttls.set(key, seconds);
    },
    list: async (opts?: { prefix?: string }) => {
      const entries = [...store.keys()];
      const filtered = opts?.prefix ? entries.filter((k) => k.startsWith(opts.prefix!)) : entries;
      return filtered.map((key) => ({ key }));
    },
    _store: store,
    _ttls: ttls,
    _clear: () => {
      store.clear();
      ttls.clear();
    },
  };
}
