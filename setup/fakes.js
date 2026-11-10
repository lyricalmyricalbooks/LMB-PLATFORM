import { accountKey } from "../services/payments/accountSlots.js";

// In-memory stand-ins for the shop registry and a shop's audit log, for tests and dry runs. The real ones (Firestore in
// the platform project, and the shop's own `audit-log` collection) keep the same shape.
//
// Registry: `readSteps(shopId)` returns every step entry recorded for the shop, oldest first; `recordStep(shopId, entry)`
// adds one; `getShop`/`createShop` keep the shop row (create refuses a row that exists); `getProfile`/`saveProfile` keep
// the shop's public profile; `updateShop(shopId, fields)` merges fields into the row (status, payments). Locks:
// `readLock(shopId)` -> { runId, takenAt, expiresAt } | null; `takeLock(shopId, lock)` takes the lock when it is free,
// lapsed (expiresAt passed) or already this run's, and returns { taken: true } or { taken: false, runId, expiresAt }
// (the real one does this in one Firestore transaction); `releaseLock(shopId, runId)` frees it only for the run that
// holds it. The payment service also uses `findShopByPaymentAccount(provider, accountId)` (the row whose `payments`, or its
// `payments.otherAccounts`, names that account, or null) and `recordEvent(shopId, entry)` (its own changes, by entry id). The release check keeps
// its runs with `recordReleaseCheck(shopId, entry)` / `readReleaseChecks(shopId)`; the release runner reads `listShops()`
// and writes `recordRelease(entry)`. Audit log: `ready(shopId)` says
// whether the shop's database exists yet; `write(shopId, id, entry)` stores the entry under `id`, replacing any entry
// with that id.
import { childrenOf } from "../accounts/fakes.js";
import { tenantIdOf } from "./shopTenant.js";

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
      const matches = [...shops.values()].filter((shop) => (shop.payments?.provider === provider && shop.payments?.accountId === accountId)
        // As the real registry does: earlier and next accounts only through payments.otherAccounts.
        || (Array.isArray(shop.payments?.otherAccounts) && shop.payments.otherAccounts.includes(accountKey(provider, accountId))));
      if (matches.length > 1) throw new Error(`two shops name the ${provider} account ${accountId}; a person checks the registry`);
      const row = matches[0];
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
    // One shop's timeline (control-room/timeline.js, plan 19.10): its events, and the release runs.
    async readEvents(shopId) {
      return structuredClone([...(events.get(shopId)?.values() ?? [])]);
    },
    async listReleases() {
      return structuredClone([...releases.values()]);
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
    // Scheduled jobs by project (a set of job ids) and the projects whose build repository has the cleanup rule (plan 15.16).
    schedulerJobs: new Map(), buildCleanup: new Set(),
    // Each project's sign-in settings (plan 22.6): { subtype, mfa }. A new Firebase project starts as plain Firebase Auth.
    authConfigs: new Map(), googleSignIns: new Map(),
    // Budgets on the billing account (plan 15.17): { id, displayName, body }.
    budgets: [],
    // Each project's bot check token lifetime in minutes (absent: no reCAPTCHA configuration yet), and its assessments this month (plan 15.18).
    appCheckMinutes: new Map(), assessments: new Map(),
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
      async createDatabase(projectId, { databaseId = "(default)", locationId, pointInTimeRecovery = false }) {
        change("firestore.createDatabase", projectId, databaseId);
        needProject(projectId);
        if (databaseId === "(default)") world.databases.set(projectId, { locationId, pointInTimeRecovery });
        else world.namedDatabases.set(`${projectId}/${databaseId}`, { locationId, pointInTimeRecovery });
      },
      async enablePointInTimeRecovery(projectId, databaseId = "(default)") {
        change("firestore.enablePointInTimeRecovery", projectId, databaseId);
        needProject(projectId);
        const database = databaseId === "(default)" ? world.databases.get(projectId) : world.namedDatabases.get(`${projectId}/${databaseId}`);
        if (!database) throw new Error(`no database ${databaseId} on ${projectId}`);
        database.pointInTimeRecovery = true;
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
    // Plan 15.16: the shop's scheduled jobs and the build repository's cleanup rule.
    scheduler: {
      listJobs: async (projectId) => [...(world.schedulerJobs.get(projectId) ?? [])],
      async deleteJob(projectId, region, id) {
        change("scheduler.deleteJob", projectId, id);
        world.schedulerJobs.get(projectId)?.delete(id);
      },
    },
    budgets: {
      list: async () => world.budgets.map(({ id, displayName, body }) => ({ id, name: `billingAccounts/x/budgets/${id}`, displayName, cap: Boolean(body.spendCap) })),
      async create(billingAccount, body) {
        change("budgets.create", body.displayName);
        const id = `budget-${world.budgets.length + 1}`;
        world.budgets.push({ id, displayName: body.displayName, body, billingAccount });
        return { id, name: `${billingAccount}/budgets/${id}` };
      },
      projectNumber: async (projectId) => number(projectId),
    },
    appCheck: {
      tokenMinutes: async (projectId) => world.appCheckMinutes.get(projectId) ?? null,
      async setTokenMinutes(projectId, appId, minutes) {
        change("appCheck.setTokenMinutes", projectId, minutes);
        world.appCheckMinutes.set(projectId, minutes);
      },
    },
    monitoring: { assessments: async (projectId) => world.assessments.get(projectId) ?? 0 },
    authConfig: {
      get: async (projectId) => structuredClone(world.authConfigs.get(projectId) ?? { subtype: "FIREBASE_AUTH" }),
      async upgrade(projectId) {
        change("authConfig.upgrade", projectId);
        world.authConfigs.set(projectId, { ...(world.authConfigs.get(projectId) ?? {}), subtype: "IDENTITY_PLATFORM" });
      },
      async setMfa(projectId, mfa) {
        change("authConfig.setMfa", projectId);
        const config = world.authConfigs.get(projectId) ?? { subtype: "FIREBASE_AUTH" };
        if (config.subtype !== "IDENTITY_PLATFORM") throw new Error(`a second step needs Identity Platform on ${projectId}`);
        world.authConfigs.set(projectId, { ...config, mfa: structuredClone(mfa) });
      },
      async allowTenants(projectId) {
        change("authConfig.allowTenants", projectId);
        const config = world.authConfigs.get(projectId) ?? { subtype: "FIREBASE_AUTH" };
        if (config.subtype !== "IDENTITY_PLATFORM") throw new Error(`sign-in lists need Identity Platform on ${projectId}`);
        world.authConfigs.set(projectId, { ...config, multiTenant: { allowTenants: true } });
      },
      // The project's own Google sign-in, which only a person turns on (in the Firebase console).
      googleSignIn: async (projectId) => structuredClone(world.googleSignIns.get(projectId) ?? null),
    },
    buildCleanup: {
      has: async (projectId) => (world.firebase.has(projectId) ? world.buildCleanup.has(projectId) : null),
      async set(projectId) {
        change("buildCleanup.set", projectId);
        world.buildCleanup.add(projectId);
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
      find: async (projectId, collection, { where = [], limit } = {}) => childrenOf(world.docs, projectId, collection, where).slice(0, limit ?? Infinity),
      async set(projectId, path, data, { fields } = {}) {
        change("shopData.set", projectId, path);
        // `fields`: only those fields change, as Firestore's update mask does (clients/firestore.js set).
        const kept = fields ? { ...(world.docs.get(key(projectId, path)) ?? {}) } : {};
        if (fields) for (const field of fields) delete kept[field];
        world.docs.set(key(projectId, path), structuredClone({ ...kept, ...(fields ? Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]])) : data) }));
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

/** Google's sign-in lists, in memory (as in shopTenant.test.js). */
export function fakeTenants() {
  const lists = [];
  const signIns = new Map();
  return {
    lists,
    authConfig: { googleSignIn: async () => ({ enabled: true, clientId: "client.example", clientSecret: "made-up-secret" }) },
    tenants: {
      list: async () => lists.map((t) => ({ ...t })),
      async create(projectId, fields) { const list = { name: `projects/${projectId}/tenants/${fields.displayName}-x`, ...fields }; lists.push(list); return list; },
      async patch(_p, id, fields) { Object.assign(lists.find((t) => tenantIdOf(t) === id), fields); },
      googleSignIn: async (_p, id) => signIns.get(id) ?? null,
      async addGoogleSignIn(_p, id, c) { signIns.set(id, c); },
      async patchGoogleSignIn(_p, id, c) { signIns.set(id, c); },
    },
  };
}

/** The shared project's records, their copies and the addresses, in memory (clients/shared.js shape). */
export function fakeShared() {
  const store = () => {
    const docs = new Map();
    return {
      docs,
      get: async (id) => structuredClone(docs.get(id) ?? null),
      async set(id, data, { fields } = {}) {
        const kept = fields ? { ...(docs.get(id) ?? {}) } : {};
        docs.set(id, structuredClone({ ...kept, ...(fields ? Object.fromEntries(fields.map((f) => [f, data[f]])) : data) }));
      },
    };
  };
  const addresses = new Map();
  return {
    records: store(), stockroomRecords: store(), liveRecords: store(), addresses: {
      map: addresses,
      get: async (host) => structuredClone(addresses.get(host) ?? null),
      async create(host, data) { if (addresses.has(host)) return false; addresses.set(host, structuredClone(data)); return true; },
    },
  };
}
