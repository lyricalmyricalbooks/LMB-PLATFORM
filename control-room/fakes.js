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
    // People with two-step on, by "shopId email" -> how many second steps; removeTwoStep takes them off.
    twoStep: new Map(),
    async removeTwoStep(shopId, email) {
      if (this.fail) throw new Error("the shop didn't answer (pretend error)");
      calls.push({ shopId, removeTwoStep: email });
      const key = `${shopId} ${email.toLowerCase()}`;
      if (!this.twoStep.has(key)) return { found: false, removed: 0 };
      const removed = this.twoStep.get(key);
      this.twoStep.set(key, 0);
      return { found: true, removed };
    },
    // Backup codes left, by "shopId email"; a person is found when either map knows them.
    codes: new Map(),
    async signInSafety(shopId, emails) {
      if (this.fail) throw new Error("the shop didn't answer (pretend error)");
      return emails.map((email) => {
        const key = `${shopId} ${email.toLowerCase()}`;
        const found = this.twoStep.has(key) || this.codes.has(key);
        return { email, found, twoStep: (this.twoStep.get(key) ?? 0) > 0, codesLeft: found ? this.codes.get(key) ?? 0 : null, codesMadeAt: null };
      });
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

/** The activity log, in memory (clients/stores.js `firestoreActivity` is the real one). No delete, like it. */
export function fakeActivity() {
  const rows = new Map();
  return {
    rows,
    record: async (entry) => void rows.set(entry.id, structuredClone(entry)),
    list: async ({ shopId, limit = 200 } = {}) => structuredClone([...rows.values()]
      .filter((e) => !shopId || e.shopId === shopId)
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, limit)),
  };
}

/** Waitlist invites' store and the waitlist itself, in memory (clients/stores.js `firestoreInvites`, `firestoreWaitlist`). */
export function fakeInviteStore() {
  const rows = new Map();
  return { rows, get: async (id) => structuredClone(rows.get(id) ?? null), set: async (id, row) => void rows.set(id, structuredClone(row)) };
}

export const fakeWaitlist = (rows = []) => ({ list: async () => structuredClone(rows) });

/**
 * Support-access requests (accessRequests.js, plan 19.6), in memory. `update` reads and writes with nothing awaited in
 * between, so it is atomic like the real store's transaction.
 */
export function fakeAccessRequestStore() {
  const rows = new Map();
  return {
    rows,
    get: async (id) => structuredClone(rows.get(id) ?? null),
    create: async (id, row) => {
      if (rows.has(id)) throw new Error(`request ${id} already exists`);
      rows.set(id, structuredClone(row));
    },
    listByShop: async (shopId) => structuredClone([...rows.values()].filter((row) => row.shopId === shopId)),
    update: async (id, fn) => {
      const next = fn(structuredClone(rows.get(id) ?? null));
      if (next) rows.set(id, structuredClone(next));
      return structuredClone(next ?? null);
    },
  };
}

/** The nightly income records (incomeHistory.js, plan 19.7), in memory (clients/stores.js `firestoreIncomeHistory`). */
export function fakeIncomeHistory() {
  const rows = new Map();
  return {
    rows,
    get: async (day) => structuredClone(rows.get(day) ?? null),
    set: async (day, record) => void rows.set(day, structuredClone(record)),
    list: async ({ since = "" } = {}) => structuredClone([...rows.values()].filter((r) => r.day >= since).sort((a, b) => (a.day < b.day ? -1 : 1))),
  };
}
