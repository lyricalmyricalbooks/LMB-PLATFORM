// In-memory stand-ins for the accounts stores and a shop's own database, for tests. The real stores are Firestore
// collections in the platform project (`memberships/<shopId>_<email>`, `invites/<id>`); a shop's database is its own
// project's Firestore.

export function fakeAccountStores() {
  const members = new Map();
  const invites = new Map();
  const key = (shopId, email) => `${shopId} ${email}`;
  return {
    memberships: {
      rows: members,
      get: async (shopId, email) => structuredClone(members.get(key(shopId, email)) ?? null),
      set: async (shopId, email, row) => void members.set(key(shopId, email), structuredClone(row)),
      remove: async (shopId, email) => void members.delete(key(shopId, email)),
      listByShop: async (shopId) => structuredClone([...members.values()].filter((m) => m.shopId === shopId)),
      listByEmail: async (email) => structuredClone([...members.values()].filter((m) => m.email === email)),
    },
    invites: {
      rows: invites,
      get: async (id) => structuredClone(invites.get(id) ?? null),
      set: async (id, row) => void invites.set(id, structuredClone(row)),
      listByShop: async (shopId) => structuredClone([...invites.values()].filter((i) => i.shopId === shopId)),
    },
  };
}

/** A shop's database: documents by `projectId path`. */
export function fakeShopData() {
  const docs = new Map();
  return {
    docs,
    get: async (projectId, path) => structuredClone(docs.get(`${projectId} ${path}`) ?? null),
    set: async (projectId, path, data) => void docs.set(`${projectId} ${path}`, structuredClone(data)),
    remove: async (projectId, path) => void docs.delete(`${projectId} ${path}`),
  };
}

/** The devices store (accounts/devices.js), like clients/stores.js `firestoreDevices`. */
export function fakeDeviceStore() {
  const rows = new Map();
  return {
    rows,
    get: async (accountId) => structuredClone(rows.get(accountId) ?? null),
    set: async (accountId, row) => void rows.set(accountId, structuredClone(row)),
  };
}

/** The recovery requests store (accounts/recovery.js), like clients/stores.js `firestoreRecoveries`. */
export function fakeRecoveryStore() {
  const rows = new Map();
  const all = () => [...rows.values()].map((r) => structuredClone(r));
  const newestFirst = (a, b) => (a.askedAt < b.askedAt ? 1 : -1);
  return {
    rows,
    get: async (id) => structuredClone(rows.get(id) ?? null),
    put: async (id, row) => void rows.set(id, structuredClone(row)),
    list: async ({ status, limit = 200 }) => all().filter((r) => r.status === status).slice(0, limit),
    listByRequester: async (email) => all().filter((r) => r.requesterEmail === email).sort(newestFirst),
    listByOld: async (email) => all().filter((r) => r.oldEmail === email).sort(newestFirst),
    countSince: async (email, since) => all().filter((r) => r.requesterEmail === email && r.askedAt >= since).length,
  };
}
