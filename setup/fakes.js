// In-memory stand-ins for the shop registry and a shop's audit log, for tests and dry runs. The real ones (Firestore in
// the platform project, and the shop's own `audit-log` collection) keep the same shape.
//
// Registry: `readSteps(shopId)` returns every step entry recorded for the shop, oldest first; `recordStep(shopId, entry)`
// adds one; `getShop`/`createShop` keep the shop row (create refuses a row that exists); `getProfile`/`saveProfile` keep
// the shop's public profile; `updateShop(shopId, fields)` merges fields into the row (status, payments). Locks:
// `readLock(shopId)` -> { runId, takenAt, expiresAt } | null; `takeLock(shopId, lock)` takes the lock when it is free,
// lapsed (expiresAt passed) or already this run's, and returns { taken: true } or { taken: false, runId, expiresAt }
// (the real one does this in one Firestore transaction); `releaseLock(shopId, runId)` frees it only for the run that
// holds it. The payment service also uses `findShopByPaymentAccount(provider, accountId)` (the row whose `payments`
// names that account, or null) and `recordEvent(shopId, entry)` (its own changes, by entry id). The release check keeps
// its runs with `recordReleaseCheck(shopId, entry)` / `readReleaseChecks(shopId)`; the release runner reads `listShops()`
// and writes `recordRelease(entry)`. Audit log: `ready(shopId)` says
// whether the shop's database exists yet; `write(shopId, id, entry)` stores the entry under `id`, replacing any entry
// with that id.

export function fakeRegistry(seed = {}) {
  const steps = new Map(Object.entries(seed).map(([shopId, list]) => [shopId, [...list]]));
  const shops = new Map();
  const profiles = new Map();
  const locks = new Map();
  const events = new Map();
  const releaseChecks = new Map();
  const releases = new Map();
  return {
    steps,
    releaseChecks,
    // Release check runs (release-check/runner.js), oldest first.
    async recordReleaseCheck(shopId, entry) {
      if (!releaseChecks.has(shopId)) releaseChecks.set(shopId, []);
      releaseChecks.get(shopId).push(structuredClone(entry));
    },
    // Every shop row, for the release runner's rings and the health checks.
    async listShops() {
      return [...shops.values()].map((row) => structuredClone(row));
    },
    releases,
    async recordRelease(entry) {
      releases.set(`${entry.version}-${entry.runId}`, structuredClone(entry));
    },
    async readReleaseChecks(shopId) {
      return structuredClone(releaseChecks.get(shopId) ?? []);
    },
    shops,
    profiles,
    locks,
    events,
    async findShopByPaymentAccount(provider, accountId) {
      const row = [...shops.values()].find((shop) => shop.payments?.provider === provider && shop.payments?.accountId === accountId);
      return row ? structuredClone(row) : null;
    },
    async recordEvent(shopId, entry) {
      if (!events.has(shopId)) events.set(shopId, new Map());
      events.get(shopId).set(entry.id, structuredClone(entry));
    },
    async getShop(shopId) {
      return shops.has(shopId) ? structuredClone(shops.get(shopId)) : null;
    },
    async createShop(shopId, row) {
      if (shops.has(shopId)) throw new Error(`the registry already has ${shopId}`);
      shops.set(shopId, structuredClone(row));
    },
    async updateShop(shopId, fields) {
      if (!shops.has(shopId)) throw new Error(`the registry has no ${shopId}`);
      shops.set(shopId, { ...shops.get(shopId), ...structuredClone(fields) });
    },
    async readLock(shopId) {
      return locks.has(shopId) ? { ...locks.get(shopId) } : null;
    },
    async takeLock(shopId, lock) {
      const held = locks.get(shopId);
      if (held && held.runId !== lock.runId && held.expiresAt > lock.takenAt) return { taken: false, runId: held.runId, expiresAt: held.expiresAt };
      locks.set(shopId, { ...lock });
      return { taken: true };
    },
    async releaseLock(shopId, runId) {
      if (locks.get(shopId)?.runId === runId) locks.delete(shopId);
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
  const world = {
    projects: new Map(), billing: new Map(), firebase: new Set(), apps: new Map(), services: new Map(), databases: new Map(), buckets: new Map(),
    backupPermission: new Set(), backups: new Map(), testFiles: new Set(),
    // Each project's Functions secrets: "projectId NAME" -> list of versions, newest last.
    secrets: new Map(),
    // The stockroom's own pieces (plan 1.20): named databases by "<project>/<database>", extra buckets by name, and
    // each project's default Realtime Database instance.
    namedDatabases: new Map(), extraBuckets: new Map(), realtimeDatabases: new Map(),
    // What an unsigned read of the storage test file gets; 403 is private, as the shop's storage rules make it.
    unsignedReadStatus: 403,
  };
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
      getDatabase: async (projectId, databaseId = "(default)") =>
        (databaseId === "(default)" ? world.databases.get(projectId) : world.namedDatabases.get(`${projectId}/${databaseId}`)) ?? null,
      async createDatabase(projectId, { databaseId = "(default)", locationId }) {
        change("firestore.createDatabase", projectId, databaseId);
        needProject(projectId);
        if (databaseId === "(default)") world.databases.set(projectId, { locationId });
        else world.namedDatabases.set(`${projectId}/${databaseId}`, { locationId });
      },
    },
    storage: {
      getDefaultBucket: async (projectId) => world.buckets.get(projectId) ?? null,
      async createDefaultBucket(projectId, { location }) {
        change("storage.createDefaultBucket", projectId);
        needProject(projectId);
        world.buckets.set(projectId, { name: `${projectId}.firebasestorage.app`, location: location.toUpperCase() });
      },
      // Bucket names are shared by everyone on Google Cloud; `project` says whose a bucket is.
      getBucket: async (projectId, name) => world.extraBuckets.get(name) ?? null,
      async createBucket(projectId, { name, location }) {
        change("storage.createBucket", projectId, name);
        needProject(projectId);
        if (world.extraBuckets.has(name)) throw new Error(`the bucket name ${name} is taken`);
        world.extraBuckets.set(name, { name, location: location.toUpperCase(), project: projectId });
      },
    },
    realtimeDatabase: {
      getInstance: async (projectId) => world.realtimeDatabases.get(projectId) ?? null,
      async createInstance(projectId, { location }) {
        change("realtimeDatabase.createInstance", projectId);
        needProject(projectId);
        world.realtimeDatabases.set(projectId, { name: `${projectId}-default-rtdb`, location });
      },
    },
    backups: {
      hasPermission: async (projectId) => world.backupPermission.has(projectId),
      async grantPermission(projectId) {
        change("backups.grantPermission", projectId);
        needProject(projectId);
        world.backupPermission.add(projectId);
      },
      latest: async (projectId) => world.backups.get(projectId)?.at(-1) ?? null,
      async run(projectId) {
        change("backups.run", projectId);
        if (!world.backupPermission.has(projectId)) throw new Error(`the backup has no permission on ${projectId}`);
        const list = world.backups.get(projectId) ?? [];
        const backup = { name: `backups/${projectId}/${list.length + 1}` };
        world.backups.set(projectId, [...list, backup]);
        return backup;
      },
    },
    storageProbe: {
      hasTestFile: async (projectId) => world.testFiles.has(projectId),
      async writeTestFile(projectId) {
        change("storageProbe.writeTestFile", projectId);
        if (!world.buckets.has(projectId)) throw new Error(`no storage bucket on ${projectId}`);
        world.testFiles.add(projectId);
      },
      readUnsigned: async (projectId) => ({ status: world.testFiles.has(projectId) ? world.unsignedReadStatus : 404 }),
    },
    secrets: {
      latest: async (projectId, name) => world.secrets.get(`${projectId} ${name}`)?.at(-1) ?? null,
      async add(projectId, name, value) {
        change("secrets.add", projectId, name);
        needProject(projectId);
        world.secrets.set(`${projectId} ${name}`, [...(world.secrets.get(`${projectId} ${name}`) ?? []), value]);
      },
    },
  };
}

/**
 * The rest of the world steps 7–16 reach, in memory: deploys, the per-shop env file, the shop's database, the payment
 * providers (through the payment service), the email service, the page checker, the shop's stockroom link and the
 * stockroom's catalogue. Like fakeGoogle, `calls` lists
 * every change asked for and `failOnce` names calls that throw the first time.
 */
export function fakeServices({ failOnce = [], pageStatus = () => 200 } = {}) {
  const world = { deployed: new Map(), envFiles: new Map(), docs: new Map(), accounts: { stripe: new Map() }, sent: new Map(), pageStatus, links: new Map(), stockroomReachable: true, stockroomBooks: new Map() };
  const calls = [];
  const failures = [...failOnce];
  const change = (name, ...args) => {
    calls.push([name, ...args]);
    const at = failures.indexOf(name);
    if (at >= 0) {
      failures.splice(at, 1);
      throw new Error(`${name} failed (pretend error)`);
    }
  };
  const key = (projectId, part) => `${projectId} ${part}`;
  const siteUrl = (projectId, app) => (app === "shop" ? `https://${projectId}.web.app` : `https://${projectId}-${app}.web.app`);

  return {
    world,
    calls,
    deploy: {
      deployed: async (projectId, part) => structuredClone(world.deployed.get(key(projectId, part)) ?? null),
      async rules(projectId, { version, apps }) {
        change("deploy.rules", projectId, version);
        world.deployed.set(key(projectId, "rules"), { version, apps: [...apps] });
      },
      async functions(projectId, { version, region, envFile }) {
        change("deploy.functions", projectId, version, region);
        if (!envFile) throw new Error("no env file");
        world.deployed.set(key(projectId, "functions"), { version, region });
      },
      async pages(projectId, { version, app }) {
        change("deploy.pages", projectId, version, app);
        const url = siteUrl(projectId, app);
        world.deployed.set(key(projectId, `pages:${app}`), { version, url });
        return { url };
      },
    },
    envFiles: {
      read: async (projectId) => world.envFiles.get(projectId) ?? null,
      async write(projectId, text) {
        change("envFiles.write", projectId);
        world.envFiles.set(projectId, text);
      },
    },
    shopData: {
      get: async (projectId, path) => structuredClone(world.docs.get(key(projectId, path)) ?? null),
      async set(projectId, path, data) {
        change("shopData.set", projectId, path);
        world.docs.set(key(projectId, path), structuredClone(data));
      },
      async create(projectId, path, data) {
        change("shopData.create", projectId, path);
        if (world.docs.has(key(projectId, path))) throw new Error(`${path} already exists`);
        world.docs.set(key(projectId, path), structuredClone(data));
      },
    },
    providers: {
      stripe: {
        findAccount: async (shopId) => (world.accounts.stripe.has(shopId) ? { accountId: world.accounts.stripe.get(shopId) } : null),
        async createAccount(shopId, details) {
          change("stripe.createAccount", shopId, details.testMode);
          // Like the real service, the shop id is the idempotency key: asking twice gives the same account.
          if (!world.accounts.stripe.has(shopId)) world.accounts.stripe.set(shopId, `acct_fake${String(world.accounts.stripe.size + 1).padStart(10, "0")}`);
          return { accountId: world.accounts.stripe.get(shopId) };
        },
      },
    },
    email: {
      wasSent: async (shopId, kind) => world.sent.has(`${shopId} ${kind}`),
      async send(shopId, message) {
        change("email.send", shopId, message.kind);
        world.sent.set(`${shopId} ${message.kind}`, structuredClone(message));
      },
    },
    siteCheck: {
      get: async (url) => ({ status: world.pageStatus(url), problems: [] }),
    },
    // The stockroom's catalogue: books are added when missing and never changed (the real one also turns on the newer
    // storage for them, so the shop's link can read them).
    stockroom: {
      books: async (projectId) => Object.fromEntries([...(world.stockroomBooks.get(projectId) ?? new Map())].map(([id, book]) => [id, structuredClone(book)])),
      async addBooks(projectId, books) {
        change("stockroom.addBooks", projectId, books.map((book) => book.id));
        const catalog = world.stockroomBooks.get(projectId) ?? new Map();
        for (const book of books) if (!catalog.has(book.id)) catalog.set(book.id, structuredClone(book));
        world.stockroomBooks.set(projectId, catalog);
      },
    },
    // Like the shop's link admin: no start day until the connection check passes; a start day is never moved later.
    inventoryLink: {
      state: async (projectId) => structuredClone(world.links.get(projectId) ?? null),
      async check(projectId) {
        change("inventoryLink.check", projectId);
        const ok = world.stockroomReachable;
        world.links.set(projectId, { ...(world.links.get(projectId) ?? {}), connection: { ok } });
        return ok ? { ok } : { ok, problem: "permission-denied" };
      },
      // Like op "saveLinks": the whole map, each link checked against the shop's books and the stockroom's catalogue
      // (which it must be able to read); refused links come back as errors and are left out.
      async saveLinks(projectId, links) {
        change("inventoryLink.saveLinks", projectId, Object.keys(links).length);
        if (!world.stockroomReachable) throw new Error("The website can't read the inventory app yet.");
        const stock = world.stockroomBooks.get(projectId) ?? new Map();
        const kept = {};
        const errors = [];
        const used = new Map();
        for (const [bookId, entry] of Object.entries(links)) {
          for (const [key, inventoryBookId] of Object.entries(entry ?? {})) {
            if (!inventoryBookId) continue;
            const book = world.docs.get(key === "_" ? `${projectId} books/${bookId}` : null);
            const fail = (reason) => errors.push({ bookId, variantId: key === "_" ? null : key, reason });
            if (!book) { fail("This book is no longer in the website catalog."); continue; }
            if (!stock.has(inventoryBookId)) { fail("That book is not in the inventory app."); continue; }
            if (book.digital === true) { fail("E-books and audiobooks have no stock to link."); continue; }
            if (used.has(inventoryBookId) && used.get(inventoryBookId) !== bookId) { fail("That inventory book is already linked."); continue; }
            used.set(inventoryBookId, bookId);
            kept[bookId] = { ...(kept[bookId] ?? {}), [key]: inventoryBookId };
          }
        }
        world.links.set(projectId, { ...(world.links.get(projectId) ?? {}), links: kept });
        return { links: kept, errors };
      },
      async startSales(projectId, { startDay }) {
        change("inventoryLink.startSales", projectId, startDay);
        const link = world.links.get(projectId) ?? {};
        if (link.connection?.ok !== true) throw new Error("Check the connection to the inventory app first.");
        if (link.startDay) throw new Error(`Website sales are already being sent from ${link.startDay}.`);
        world.links.set(projectId, { ...link, startDay });
      },
    },
  };
}
