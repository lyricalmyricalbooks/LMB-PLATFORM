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
