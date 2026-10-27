// In-memory stand-ins for the shop registry and a shop's audit log, for tests and dry runs. The real ones (Firestore in
// the platform project, and the shop's own `audit-log` collection) keep the same shape.
//
// Registry: `readSteps(shopId)` returns every step entry recorded for the shop, oldest first; `recordStep(shopId, entry)`
// adds one; `getShop`/`createShop` keep the shop row (create refuses a row that exists); `getProfile`/`saveProfile` keep
// the shop's public profile. Audit log: `ready(shopId)` says whether the shop's database exists yet; `write(shopId, id, entry)` stores
// the entry under `id`, replacing any entry with that id.

export function fakeRegistry(seed = {}) {
  const steps = new Map(Object.entries(seed).map(([shopId, list]) => [shopId, [...list]]));
  const shops = new Map();
  const profiles = new Map();
  return {
    steps,
    shops,
    profiles,
    async getShop(shopId) {
      return shops.has(shopId) ? structuredClone(shops.get(shopId)) : null;
    },
    async createShop(shopId, row) {
      if (shops.has(shopId)) throw new Error(`the registry already has ${shopId}`);
      shops.set(shopId, structuredClone(row));
    },
    async getProfile(shopId) {
      return profiles.has(shopId) ? structuredClone(profiles.get(shopId)) : null;
    },
    async saveProfile(shopId, profile) {
      profiles.set(shopId, structuredClone(profile));
    },
    async readSteps(shopId) {
      return [...(steps.get(shopId) ?? [])];
    },
    async recordStep(shopId, entry) {
      if (!steps.has(shopId)) steps.set(shopId, []);
      steps.get(shopId).push({ ...entry });
    },
  };
}

/** `isReady(shopId)` decides when the shop's database exists; by default it always does. */
export function fakeAuditLog({ isReady = () => true } = {}) {
  const entries = new Map();
  return {
    entries,
    async ready(shopId) {
      return Boolean(await isReady(shopId));
    },
    async write(shopId, id, entry) {
      if (!entries.has(shopId)) entries.set(shopId, new Map());
      entries.get(shopId).set(id, { ...entry });
    },
  };
}

/** The per-shop /shop-profile.js files Hosting will serve. */
export function fakeProfileFiles() {
  const files = new Map();
  return {
    files,
    read: async (shopId) => files.get(shopId) ?? null,
    write: async (shopId, text) => void files.set(shopId, text),
  };
}

/**
 * A pretend Google for steps.js: every client it uses, over one in-memory world. `calls` lists every change asked for
 * (never the looks), so a test can prove a dry run changed nothing. `failOnce` names calls (like "projects.create")
 * that throw the first time, as Google sometimes does.
 */
export function fakeGoogle({ failOnce = [] } = {}) {
  const world = { projects: new Map(), billing: new Map(), firebase: new Set(), apps: new Map(), services: new Map(), databases: new Map(), buckets: new Map() };
  const calls = [];
  const failures = [...failOnce];
  const change = (name, ...args) => {
    calls.push([name, ...args]);
    const at = failures.indexOf(name);
    if (at >= 0) {
      failures.splice(at, 1);
      throw new Error(`${name} failed (pretend Google error)`);
    }
  };
  const needProject = (projectId) => {
    if (!world.projects.has(projectId)) throw new Error(`no project ${projectId}`);
  };
  const number = (projectId) => String(100000000000 + [...projectId].reduce((sum, c) => sum + c.charCodeAt(0), 0));

  return {
    world,
    calls,
    projects: {
      get: async (projectId) => (world.projects.has(projectId) ? { ...world.projects.get(projectId) } : null),
      async create({ projectId, displayName, parent, labels }) {
        change("projects.create", projectId);
        if (world.projects.has(projectId)) throw new Error(`project ${projectId} already exists`);
        world.projects.set(projectId, { projectId, displayName, parent, labels, state: "ACTIVE" });
      },
    },
    billing: {
      get: async (projectId) => world.billing.get(projectId) ?? { billingEnabled: false, billingAccountName: "" },
      async link(projectId, billingAccountName) {
        change("billing.link", projectId);
        needProject(projectId);
        world.billing.set(projectId, { billingEnabled: true, billingAccountName });
      },
    },
    firebase: {
      getProject: async (projectId) => (world.firebase.has(projectId) ? { projectId } : null),
      async addFirebase(projectId) {
        change("firebase.addFirebase", projectId);
        needProject(projectId);
        world.firebase.add(projectId);
      },
      listWebApps: async (projectId) => [...(world.apps.get(projectId) ?? [])].map(({ appId, displayName }) => ({ appId, displayName })),
      async createWebApp(projectId, displayName) {
        change("firebase.createWebApp", projectId);
        if (!world.firebase.has(projectId)) throw new Error(`Firebase is not on ${projectId}`);
        const list = world.apps.get(projectId) ?? [];
        const appId = `1:${number(projectId)}:web:${String(list.length + 1).padStart(22, "0")}`;
        list.push({ appId, displayName });
        world.apps.set(projectId, list);
        return { appId };
      },
      async getWebAppConfig(projectId, appId) {
        return {
          apiKey: `AIzaFake${projectId.replace(/-/g, "")}`.padEnd(39, "0"),
          authDomain: `${projectId}.firebaseapp.com`,
          projectId,
          storageBucket: `${projectId}.firebasestorage.app`,
          messagingSenderId: number(projectId),
          appId,
        };
      },
    },
    services: {
      listEnabled: async (projectId) => [...(world.services.get(projectId) ?? [])],
      async enable(projectId, names) {
        change("services.enable", projectId, names.length);
        needProject(projectId);
        world.services.set(projectId, new Set([...(world.services.get(projectId) ?? []), ...names]));
      },
    },
    firestore: {
      getDatabase: async (projectId) => world.databases.get(projectId) ?? null,
      async createDatabase(projectId, { locationId }) {
        change("firestore.createDatabase", projectId);
        needProject(projectId);
        world.databases.set(projectId, { locationId });
      },
    },
    storage: {
      getDefaultBucket: async (projectId) => world.buckets.get(projectId) ?? null,
      async createDefaultBucket(projectId, { location }) {
        change("storage.createDefaultBucket", projectId);
        needProject(projectId);
        world.buckets.set(projectId, { name: `${projectId}.firebasestorage.app`, location: location.toUpperCase() });
      },
    },
  };
}
