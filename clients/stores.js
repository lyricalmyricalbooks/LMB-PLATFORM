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
