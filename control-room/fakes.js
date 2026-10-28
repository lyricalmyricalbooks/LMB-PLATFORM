// Pretend clients for the control room's tests. The registry, audit log, profile files and deploys come from
// setup/fakes.js.

/** A pretend support sign-in to a shop's admin. `calls` lists each one; `fail` makes the next one throw. */
export function fakeShopAccess() {
  const calls = [];
  return {
    calls,
    fail: false,
    async supportSignIn(shopId, options) {
      if (this.fail) throw new Error("the shop didn't answer (pretend error)");
      calls.push({ shopId, ...options });
      return { url: `https://${shopId}.example/admin/?support=${calls.length}` };
    },
  };
}

/** The repair queue's store, in memory (clients/stores.js `firestoreRepairs` is the real one). */
export function fakeRepairStore() {
  const rows = new Map();
  return {
    rows,
    get: async (id) => structuredClone(rows.get(id) ?? null),
    set: async (id, item) => void rows.set(id, structuredClone(item)),
    list: async ({ shopId, status } = {}) => structuredClone([...rows.values()].filter((r) => (!shopId || r.shopId === shopId) && (!status || r.status === status))),
  };
}

/** A pretend repair queue with open items by shop. */
export function fakeRepairQueue(open = {}) {
  return { open: async (shopId) => structuredClone(open[shopId] ?? []) };
}

/** The breach register's store, in memory (clients/stores.js `firestoreBreaches` is the real one). No delete, like it. */
export function fakeBreachStore() {
  const rows = new Map();
  return {
    rows,
    get: async (id) => structuredClone(rows.get(id) ?? null),
    set: async (id, entry) => void rows.set(id, structuredClone(entry)),
    list: async () => structuredClone([...rows.values()]),
  };
}

/** The platform's small records and the emergency log, in memory (clients/stores.js `firestorePlatformState`). */
export function fakePlatformState() {
  const docs = new Map();
  const log = new Map();
  return {
    docs,
    entries: log,
    get: async (name) => structuredClone(docs.get(name) ?? null),
    set: async (name, value) => void docs.set(name, structuredClone(value)),
    log: async (id, entry) => void log.set(id, structuredClone(entry)),
  };
}
