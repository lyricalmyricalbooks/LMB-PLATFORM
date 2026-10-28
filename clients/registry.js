import { missingDatabase } from "./firestore.js";

// The shop registry and a shop's audit log, in Firestore, with the same shape as the in-memory ones in setup/fakes.js.
//
// Registry (the platform project, lmb-platform-prod):
//   shops/{shopId}                        the shop row (status, plan, payments, test marks…)
//   shops/{shopId}/profile/current        the shop's public profile
//   shops/{shopId}/steps/{id}             one setup step outcome; `recordedAt` keeps their order
//   shops/{shopId}/releaseChecks/{runId}  one release check run
//   shops/{shopId}/events/{id}            the payment service's changes to the row
//   shops/{shopId}/files/{name}           per-shop files the release build copies in (clients/shop.js registryFiles)
//   shopLocks/{shopId}                    who is setting the shop up right now (setup/runner.js)
// Audit log (the shop's own project): audit-log/{id}, written once the shop's database exists.
//
// Both are reached only with the platform's token; the platform project's rules let no browser read or write them.

export function firestoreRegistry(firestore, { now = () => new Date() } = {}) {
  let sequence = 0;
  // Several entries can share a millisecond; the counter keeps them in the order they were recorded.
  const stamp = () => `${now().toISOString()}#${String(sequence++).padStart(6, "0")}`;
  return {
    getShop: (shopId) => firestore.get(`shops/${shopId}`),
    async createShop(shopId, row) {
      if (!(await firestore.create(`shops/${shopId}`, row))) throw new Error(`the registry already has ${shopId}`);
    },
    async updateShop(shopId, fields) {
      if (!(await firestore.get(`shops/${shopId}`))) throw new Error(`the registry has no ${shopId}`);
      await firestore.set(`shops/${shopId}`, fields, { fields: Object.keys(fields) });
    },
    getProfile: (shopId) => firestore.get(`shops/${shopId}/profile/current`),
    saveProfile: (shopId, profile) => firestore.set(`shops/${shopId}/profile/current`, profile),
    async readSteps(shopId) {
      const rows = await firestore.query(`shops/${shopId}/steps`, { orderBy: [["recordedAt", "asc"]] });
      return rows.map(({ data: { recordedAt: _, ...entry } }) => entry);
    },
    async recordStep(shopId, entry) {
      const recordedAt = stamp();
      await firestore.create(`shops/${shopId}/steps/${recordedAt.replace(/[^0-9A-Za-z]/g, "")}-${entry.step}`, { ...entry, recordedAt });
    },
    readLock: (shopId) => firestore.get(`shopLocks/${shopId}`),
    // In one transaction: free, lapsed or already this run's -> taken.
    takeLock: (shopId, lock) => firestore.transaction(async (tx) => {
      const held = await tx.get(`shopLocks/${shopId}`);
      if (held && held.runId !== lock.runId && held.expiresAt > lock.takenAt) return { taken: false, runId: held.runId, expiresAt: held.expiresAt };
      tx.set(`shopLocks/${shopId}`, lock);
      return { taken: true };
    }),
    releaseLock: (shopId, runId) => firestore.transaction(async (tx) => {
      const held = await tx.get(`shopLocks/${shopId}`);
      if (held?.runId === runId) tx.remove(`shopLocks/${shopId}`);
    }),
    // The payment service: the shop whose registry row names this account, and its own logged changes.
    async findShopByPaymentAccount(provider, accountId) {
      const rows = await firestore.query("shops", { where: [["payments.provider", "==", provider], ["payments.accountId", "==", accountId]], limit: 2 });
      if (rows.length > 1) throw new Error(`two shops name the ${provider} account ${accountId}; a person checks the registry`);
      return rows[0]?.data ?? null;
    },
    recordEvent: (shopId, entry) => firestore.set(`shops/${shopId}/events/${String(entry.id).replace(/[/]/g, "_")}`, entry),
    async recordReleaseCheck(shopId, entry) {
      await firestore.set(`shops/${shopId}/releaseChecks/${entry.runId}`, { ...entry, recordedAt: stamp() });
    },
    async readReleaseChecks(shopId) {
      const rows = await firestore.query(`shops/${shopId}/releaseChecks`, { orderBy: [["recordedAt", "asc"]] });
      return rows.map(({ data: { recordedAt: _, ...entry } }) => entry);
    },
  };
}

/** `firestoreFor(shopId)` gives a firestore client on that shop's own project and default database. */
export function firestoreAuditLog(firestoreFor) {
  return {
    async ready(shopId) {
      try {
        await firestoreFor(shopId).get("audit-log/_ready");
        return true;
      } catch (error) {
        // No database yet (step 5 makes it), or no project yet (steps 1–2): nothing to write to. The registry keeps
        // every entry meanwhile, and the runner copies them all over once this says ready.
        if (missingDatabase(error) || error?.status === 404 || error?.status === 403) return false;
        throw error;
      }
    },
    write: (shopId, id, entry) => firestoreFor(shopId).set(`audit-log/${String(id).replace(/[/]/g, "_")}`, entry),
  };
}
