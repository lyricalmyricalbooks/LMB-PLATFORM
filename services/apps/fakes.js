// An in-memory app store with the shape of the real one (clients/stores.js `firestoreApps`), for tests and the walkthrough.
export function fakeAppStore() {
  const apps = new Map();
  const all = () => [...apps.values()].map((app) => structuredClone(app));
  return {
    apps,
    get: async (appId) => structuredClone(apps.get(appId) ?? null),
    put: async (appId, app) => void apps.set(appId, structuredClone(app)),
    listByMaker: async (email) => all().filter((app) => app.makerEmail === email),
    listByStatus: async (status) => all().filter((app) => app.status === status),
    listOnStore: async () => all().filter((app) => app.onStore === true),
  };
}

/** In-memory installs and one-time codes, the shape of `firestoreAppInstalls` / `firestoreAppCodes`. */
export function fakeAppInstallStores() {
  const installs = new Map();
  const codes = new Map();
  const all = () => [...installs.values()].map((row) => structuredClone(row));
  return {
    installs: {
      rows: installs,
      get: async (id) => structuredClone(installs.get(id) ?? null),
      put: async (id, row) => void installs.set(id, structuredClone(row)),
      getByKeyHash: async (hash) => all().find((row) => row.keyHash === hash) ?? null,
      listByShop: async (shopId) => all().filter((row) => row.shopId === shopId),
      listByApp: async (appId) => all().filter((row) => row.appId === appId),
    },
    codes: {
      rows: codes,
      get: async (hash) => structuredClone(codes.get(hash) ?? null),
      put: async (hash, row) => void codes.set(hash, structuredClone(row)),
    },
  };
}
