// Firestore stores for the platform services' own records, in the platform project, with the shapes of their fakes:
// the email service's sent log (services/email/fakes.js `fakeSentLog`), the payment service's account record
// (services/payments/fakes.js `fakeAccounts`), the support inbox (services/support/fakes.js `fakeSupportStore`) and the
// repair queue (control-room/fakes.js `fakeRepairStore`).

/** emailSent/<key>: { shopId, kind, status, at, … }. */
export function firestoreSentLog(firestore) {
  // A document id can't hold "/" (clients/firestore.js escapes everything else in the address).
  const id = (key) => String(key).replace(/\//g, "_");
  return {
    get: (key) => firestore.get(`emailSent/${id(key)}`),
    put: (key, entry) => firestore.set(`emailSent/${id(key)}`, entry),
    async findSent(shopId, kind) {
      const rows = await firestore.query("emailSent", { where: [["shopId", "==", shopId], ["kind", "==", kind], ["status", "==", "sent"]], limit: 1 });
      return rows[0]?.data ?? null;
    },
    async countSince(shopId, since) {
      // Equality filters only, which need no extra index; the date is compared here. A shop's sent emails are read
      // in full, so this suits the daily-limit check while shops are small; an index on (shopId, status, at) replaces
      // it once one shop sends tens of thousands.
      const rows = await firestore.query("emailSent", { where: [["shopId", "==", shopId], ["status", "==", "sent"]], limit: 20000 });
      return rows.filter((row) => row.data.at >= since).length;
    },
    // The platform's own emails about one shop, newest first (control-room/timeline.js, plan 19.10). Equality filters
    // only; the date order is put here.
    async listForShop(shopId, { limit = 200 } = {}) {
      const rows = await firestore.query("emailSent", { where: [["shopId", "==", shopId], ["platform", "==", true]], limit: 5000 });
      return rows.map((row) => row.data).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
    },
  };
}

/** paymentAccounts/<shopId>: { provider, accountId, mode, createdAt }. */
export function firestoreAccounts(firestore) {
  return {
    get: (shopId) => firestore.get(`paymentAccounts/${shopId}`),
    set: (shopId, record) => firestore.set(`paymentAccounts/${shopId}`, record),
  };
}

/**
 * support/<id>: one help request with all its messages (services/support/inbox.js). Queries use equality filters only,
 * which need no extra index; sorting and the date compare happen here, which suits a support inbox's size.
 */
export function firestoreSupport(firestore) {
  const rows = async (where, limit) => (await firestore.query("support", { where, limit })).map((row) => row.data);
  return {
    get: (id) => firestore.get(`support/${id}`),
    put: (id, ticket) => firestore.set(`support/${id}`, ticket),
    list: ({ status, limit = 200 }) => rows([["status", "==", status]], limit),
    async listByEmail(email) {
      return (await rows([["email", "==", email]], 500)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },
    async countSince(email, since) {
      return (await rows([["email", "==", email]], 500)).filter((t) => t.openedAt >= since).length;
    },
    // One shop's requests, newest first (control-room/timeline.js, plan 19.10).
    async listByShop(shopId) {
      return (await rows([["shopId", "==", shopId]], 500)).sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
    },
  };
}

/** repairs/<id>: one problem for a person (control-room/repairs.js). Equality filters only, no extra index. */
export function firestoreRepairs(firestore) {
  return {
    get: (id) => firestore.get(`repairs/${id}`),
    set: (id, item) => firestore.set(`repairs/${id}`, item),
    async list({ shopId, status }) {
      const where = [...(shopId ? [["shopId", "==", shopId]] : []), ...(status ? [["status", "==", status]] : [])];
      return (await firestore.query("repairs", { where, limit: 1000 })).map((row) => row.data);
    },
  };
}

/** breaches/<id>: the breach register (control-room/breaches.js). Never deleted from here; kept at least two years. */
export function firestoreBreaches(firestore) {
  return {
    get: (id) => firestore.get(`breaches/${id}`),
    set: (id, entry) => firestore.set(`breaches/${id}`, entry),
    list: async () => (await firestore.query("breaches", { limit: 5000 })).map((row) => row.data),
  };
}

/**
 * platformState/<name>: small platform-wide records the run book keeps (control-room/runbook.js): `releasePause`
 * { paused, by, reason, at }, `statusNote` { text, by, at } and `backupSeal` { by, reason, openedAt, until }.
 * emergencyLog/<id>: every use of the backup person's access (control-room/backupPerson.js), never deleted from here.
 */
export function firestorePlatformState(firestore) {
  return {
    get: (name) => firestore.get(`platformState/${name}`),
    set: (name, value) => firestore.set(`platformState/${name}`, value),
    log: (id, entry) => firestore.set(`emergencyLog/${id}`, entry),
  };
}

/** devices/<accountId>: { known: { <hash>: { firstSeenAt, lastSeenAt, browser } } } (accounts/devices.js). */
export function firestoreDevices(firestore) {
  return {
    get: (accountId) => firestore.get(`devices/${accountId}`),
    set: (accountId, row) => firestore.set(`devices/${accountId}`, row),
  };
}

/** recoveries/<id>: one account recovery request with its history (accounts/recovery.js). Equality filters only. */
export function firestoreRecoveries(firestore) {
  const rows = async (where) => (await firestore.query("recoveries", { where, limit: 200 })).map((row) => row.data);
  const newestFirst = (a, b) => (a.askedAt < b.askedAt ? 1 : -1);
  return {
    get: (id) => firestore.get(`recoveries/${id}`),
    put: (id, row) => firestore.set(`recoveries/${id}`, row),
    list: ({ status }) => rows([["status", "==", status]]),
    listByRequester: async (email) => (await rows([["requesterEmail", "==", email]])).sort(newestFirst),
    listByOld: async (email) => (await rows([["oldEmail", "==", email]])).sort(newestFirst),
    async countSince(email, since) {
      return (await rows([["requesterEmail", "==", email]])).filter((r) => r.askedAt >= since).length;
    },
  };
}

/**
 * controlActivity/<id>: the control room's activity log (control-room/activity.js, plan 9.9), kept a year. All entries
 * come newest first by their time; one shop's are read with an equality filter (no extra index) and sorted here.
 */
export function firestoreActivity(firestore) {
  const newestFirst = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
  return {
    record: (entry) => firestore.set(`controlActivity/${String(entry.id).replace(/[/]/g, "_")}`, entry),
    async list({ shopId, limit = 200 } = {}) {
      const rows = shopId
        ? (await firestore.query("controlActivity", { where: [["shopId", "==", shopId]], limit: 5000 })).map((row) => row.data).sort(newestFirst)
        : (await firestore.query("controlActivity", { orderBy: [["at", "desc"]], limit })).map((row) => row.data);
      return rows.slice(0, limit);
    },
  };
}

/** waitlist/<id>: the waitlist page's sign-ups (waitlist/signup.js), read by the control room only. */
export function firestoreWaitlist(firestore) {
  return { list: async () => (await firestore.query("waitlist", { limit: 5000 })).map((row) => row.data) };
}

/** invites/<id>: waitlist invites (waitlist/invites.js, plan 9.5). */
export function firestoreInvites(firestore) {
  return {
    get: (id) => firestore.get(`invites/${id}`),
    set: (id, row) => firestore.set(`invites/${id}`, row),
  };
}

/**
 * incomeHistory/<YYYY-MM-DD>: one record a night of the platform's own income (control-room/incomeHistory.js, plan
 * 19.7). `list` reads one range on the record's own `day` field, which needs no extra index.
 */
export function firestoreIncomeHistory(firestore) {
  return {
    get: (day) => firestore.get(`incomeHistory/${day}`),
    set: (day, record) => firestore.set(`incomeHistory/${day}`, record),
    async list({ since = "" } = {}) {
      const rows = await firestore.query("incomeHistory", { where: [["day", ">=", since]], orderBy: [["day", "asc"]], limit: 1000 });
      return rows.map((row) => row.data);
    },
  };
}

/**
 * jobRuns/<name>-<startedAt>: the scheduled jobs' runs (services/jobs, plan 19.11), the newest 50 kept per job;
 * jobState/<name>: whether that job's late alert was sent.
 */
export function firestoreJobRuns(firestore, { keep = 50 } = {}) {
  const id = (name, run) => `${name}-${run.startedAt}`.replace(/[^0-9A-Za-z_-]/g, "_");
  const newestFirst = (a, b) => (a.data.startedAt < b.data.startedAt ? 1 : a.data.startedAt > b.data.startedAt ? -1 : 0);
  const rows = async (name) => (await firestore.query("jobRuns", { where: [["name", "==", name]], limit: 500 })).sort(newestFirst);
  return {
    async add(name, run) {
      await firestore.set(`jobRuns/${id(name, run)}`, { ...run, name });
      for (const old of (await rows(name)).slice(keep)) await firestore.remove(`jobRuns/${old.id}`);
    },
    list: async (name, { limit = keep } = {}) => (await rows(name)).slice(0, limit).map((row) => row.data),
    getState: (name) => firestore.get(`jobState/${name}`),
    setState: (name, state) => firestore.set(`jobState/${name}`, state),
  };
}

/**
 * deliveryStats/<shopId>_<kind>_<day>: per shop, per day, how many payment events came in and how many failed
 * (services/payments, plan 19.12). One counter a day, raised in a transaction.
 */
export function firestoreDeliveryStats(firestore) {
  const docOf = (shopId, kind, day) => `deliveryStats/${`${shopId}_${kind}_${day}`.replace(/[^0-9A-Za-z_-]/g, "_")}`;
  return {
    add: (shopId, kind, at) => firestore.transaction(async (tx) => {
      const day = String(at).slice(0, 10);
      const path = docOf(shopId, kind, day);
      const found = await tx.get(path);
      tx.set(path, { shopId, kind, day, count: (found?.count ?? 0) + 1 });
    }),
    async count(shopId, kind, sinceIso) {
      const rows = await firestore.query("deliveryStats", { where: [["shopId", "==", shopId], ["kind", "==", kind]], limit: 1000 });
      return rows.filter((row) => row.data.day >= String(sinceIso).slice(0, 10)).reduce((sum, row) => sum + (row.data.count ?? 0), 0);
    },
  };
}

/** shopNotes/<shopId>: the control room's private notes and tags on a shop (control-room/notes.js, plan 19.13). */
export function firestoreShopNotes(firestore) {
  return {
    get: (shopId) => firestore.get(`shopNotes/${shopId}`),
    set: (shopId, doc) => firestore.set(`shopNotes/${shopId}`, doc),
    list: async () => (await firestore.query("shopNotes", { limit: 5000 })).map((row) => row.data),
  };
}
