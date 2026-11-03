// The rest of the platform's own records in Firestore (the platform project), one store per fake the hosted web door
// uses (server/world.js), each with exactly its fake's calls and answers. clients/stores.js has the older ones.
//
//   store                       collection (platform project)            its fake
//   firestoreSignupStores       accounts/<uid>, signups/<shopId>         signup/fakes.js fakeSignupStores
//   firestoreThrottle           throttle/<hash of the key>               signup/fakes.js fakeThrottle
//   firestoreBillingStores      billingCustomers/<accountId>,            services/billing/fakes.js fakeBillingStores
//                               billingSubscriptions/<shopId>,
//                               billingEvents/<eventId>                  (fakeEventClaims)
//   firestoreFoundingSeats      foundingPlaces/<shopId>,                 services/billing/fakes.js fakeFoundingSeats
//                               billingCounters/founding
//   firestoreFeeLedger          feeMonths/<shopId>_<month>,              services/payments/feeLedgerFakes.js
//                               feePayments/<shopId>_<paymentId>
//   firestoreAccountStores      memberships/<shopId>_<email>,            accounts/fakes.js fakeAccountStores
//                               teamInvites/<id>
//   firestoreAccessRequests     accessRequests/<id>                      control-room/fakes.js fakeAccessRequestStore
//   firestorePressMessages      pressMessages/<id>                       control-room/messagesFakes.js
//   firestoreDataExports        dataExports/<id>                         services/export/fakes.js fakeExportStore
//   firestoreShopRecords        trialTips/<shopId>, checkups/<shopId>    services/trial-tips/fakes.js fakeTipStore
//   firestoreFrontDoorStores    presses/<pressId>,                       signup/fakes.js fakeFrontDoorStores
//                               signInCodes/<hash of the address>
//
// Team invites are `teamInvites`, not `invites`: `invites` already holds the waitlist's invites (stores.js
// firestoreInvites), whose rows carry a `shopId` once used, so a shared collection would list them as a shop's team.
//
// Reads that pick rows use equality filters only (no extra index to make); sorting and date compares happen here, which
// suits the platform's size. Every "read, then write what it says" call is one Firestore transaction, so of two calls at
// the same moment exactly one wins (the client tries a turned-away transaction again).
import { createHash } from "node:crypto";

/** A document id can't hold "/": the only character Firestore refuses that our ids could carry. */
const safe = (part) => String(part).replace(/\//g, "_");
const rowsOf = (found) => found.map((row) => row.data);

/** Sign-up's own records (signup/signup.js): the person's account and each shop in the making. */
export function firestoreSignupStores(firestore) {
  return {
    accounts: {
      get: (id) => firestore.get(`accounts/${safe(id)}`),
      set: (id, row) => firestore.set(`accounts/${safe(id)}`, row),
      /** The account with this (lower-case) email, for account recovery (accounts/recovery.js findAccount). */
      async findByEmail(email) {
        const found = await firestore.query("accounts", { where: [["email", "==", String(email ?? "").toLowerCase()]], limit: 1 });
        return found[0]?.data ?? null;
      },
    },
    signups: {
      get: (id) => firestore.get(`signups/${safe(id)}`),
      set: (id, row) => firestore.set(`signups/${safe(id)}`, row),
      listByAccount: async (accountId) => rowsOf(await firestore.query("signups", { where: [["accountId", "==", accountId]], limit: 500 })),
      list: async () => rowsOf(await firestore.query("signups", { limit: 5000 })),
    },
    throttle: firestoreThrottle(firestore),
  };
}

/** Reads one document, lets `change(row | null)` decide { row, result }, and writes `row` (unless null) in one step. */
const inTransaction = (firestore, path, change) => firestore.transaction(async (tx) => {
  const { row, result } = change(await tx.get(path));
  if (row) tx.set(path, row);
  return result;
});

/**
 * The front door's records (signup/frontDoor.js): each press's setup record (signup/pressRecord.js; the presses rules in
 * waitlist/firestore.rules let its owner read it) and the sign-in codes, which no page can read (only a hash of a code
 * is kept, signup/signInCode.js). `create` never overwrites: of two presses taking one id, one gets false. `update`
 * reads and writes in one transaction, so two requests at the same moment can't both act on the same old row.
 */
export function firestoreFrontDoorStores(firestore) {
  return {
    presses: {
      get: (id) => firestore.get(`presses/${safe(id)}`),
      set: (id, row) => firestore.set(`presses/${safe(id)}`, row),
      create: (id, row) => firestore.create(`presses/${safe(id)}`, row),
      listByOwner: async (ownerUid) => rowsOf(await firestore.query("presses", { where: [["ownerUid", "==", ownerUid]], limit: 50 })),
      update: (id, change) => inTransaction(firestore, `presses/${safe(id)}`, change),
    },
    codes: {
      get: (key) => firestore.get(`signInCodes/${safe(key)}`),
      update: (key, change) => inTransaction(firestore, `signInCodes/${safe(key)}`, change),
    },
  };
}

/** How long a hit is kept, and at most how many per key: longer and more than any limit counts (signup/limits.js). */
export const THROTTLE_KEEP_MS = 24 * 3600_000;
export const THROTTLE_CAP = 1000;

/**
 * The fair-use and sign-in-link counter: one document per key (its id a hash, so no address or id is kept in the clear)
 * holding the times of its recent hits. `add` is a transaction that also drops hits older than a day; `addIfUnder`
 * counts and adds in the same transaction, so a burst of calls can't all pass the count.
 */
export function firestoreThrottle(firestore, { keepMs = THROTTLE_KEEP_MS, cap = THROTTLE_CAP } = {}) {
  const path = (key) => `throttle/${createHash("sha256").update(String(key)).digest("hex").slice(0, 40)}`;
  return {
    async count(key, since) {
      const row = await firestore.get(path(key));
      return (row?.hits ?? []).filter((at) => at >= since).length;
    },
    add: (key, at) => firestore.transaction(async (tx) => {
      const row = await tx.get(path(key));
      const cutoff = new Date(Date.parse(at) - keepMs).toISOString();
      const hits = [...(row?.hits ?? []).filter((hit) => hit >= cutoff), at].sort().slice(-cap);
      tx.set(path(key), { hits, updatedAt: at });
    }),
    /** Counts the hits since `since` and adds one only when fewer than `max`, in one transaction. True when added. */
    addIfUnder: (key, since, at, max) => firestore.transaction(async (tx) => {
      const row = await tx.get(path(key));
      const kept = row?.hits ?? [];
      if (kept.filter((hit) => hit >= since).length >= max) return false;
      const cutoff = new Date(Date.parse(at) - keepMs).toISOString();
      tx.set(path(key), { hits: [...kept.filter((hit) => hit >= cutoff), at].sort().slice(-cap), updatedAt: at });
      return true;
    }),
  };
}

/**
 * Billing's records (services/billing/billing.js): who pays, each shop's subscription, and each Stripe event claimed
 * once (eventClaims.js). `claim` is create-if-absent in a transaction; a claim older than `holdMs` may be taken over.
 */
export function firestoreBillingStores(firestore) {
  return {
    customers: {
      get: (id) => firestore.get(`billingCustomers/${safe(id)}`),
      set: (id, row) => firestore.set(`billingCustomers/${safe(id)}`, row),
    },
    subscriptions: {
      get: (shopId) => firestore.get(`billingSubscriptions/${safe(shopId)}`),
      set: (shopId, row) => firestore.set(`billingSubscriptions/${safe(shopId)}`, row),
      async findBySubscriptionId(id) {
        const found = await firestore.query("billingSubscriptions", { where: [["subscriptionId", "==", id]], limit: 1 });
        return found[0]?.data ?? null;
      },
      list: async () => rowsOf(await firestore.query("billingSubscriptions", { limit: 5000 })),
    },
    events: firestoreEventClaims(firestore),
  };
}

/**
 * The founding places (services/billing/founding.js): one row per shop given a place, and a count, changed together in
 * one transaction so two presses paying at the same moment can't both take the last place.
 */
export function firestoreFoundingSeats(firestore) {
  const COUNT = "billingCounters/founding";
  return {
    claim: (shopId, { limit, at, percentOff }) => firestore.transaction(async (tx) => {
      const place = `foundingPlaces/${safe(shopId)}`;
      if (await tx.get(place)) return true;
      const count = (await tx.get(COUNT))?.count ?? 0;
      if (count >= limit) return false;
      tx.set(place, { shopId, at, percentOff });
      tx.set(COUNT, { count: count + 1, updatedAt: at });
      return true;
    }),
    count: async () => (await firestore.get(COUNT))?.count ?? 0,
  };
}

export function firestoreEventClaims(firestore, collection = "billingEvents") {
  const path = (eventId) => `${collection}/${safe(eventId)}`;
  return {
    claim: (eventId, { at, holdMs }) => firestore.transaction(async (tx) => {
      const row = await tx.get(path(eventId));
      if (row?.state === "done") return false;
      if (row && Date.parse(at) - Date.parse(row.claimedAt) < holdMs) return false;
      tx.set(path(eventId), { state: "claimed", claimedAt: at, ...(row ? { tookOverFrom: row.claimedAt } : {}) });
      return true;
    }),
    release: (eventId) => firestore.transaction(async (tx) => {
      if ((await tx.get(path(eventId)))?.state === "claimed") tx.remove(path(eventId));
    }),
    mark: (eventId, entry) => firestore.set(path(eventId), { ...entry, state: "done" }),
    seen: async (eventId) => (await firestore.get(path(eventId)))?.state === "done",
  };
}

/** The pay-as-you-sell ledger (services/payments/payAsYouSell.js): a month's record, changed in a transaction. */
export function firestoreFeeLedger(firestore) {
  const month = (shopId, m) => `feeMonths/${safe(`${shopId}_${m}`)}`;
  const payment = (shopId, id) => `feePayments/${safe(`${shopId}_${id}`)}`;
  return {
    get: (shopId, m) => firestore.get(month(shopId, m)),
    update: (shopId, m, fn) => firestore.transaction(async (tx) => {
      const next = fn(await tx.get(month(shopId, m)));
      if (next) tx.set(month(shopId, m), next);
      return next;
    }),
    link: (shopId, paymentId, ref) => firestore.set(payment(shopId, paymentId), { ...ref }),
    find: (shopId, paymentId) => firestore.get(payment(shopId, paymentId)),
  };
}

/** One sign-in for every shop (accounts/accounts.js): who is in each shop's team, and the invites not yet taken. */
export function firestoreAccountStores(firestore) {
  const member = (shopId, email) => `memberships/${safe(`${shopId}_${email}`)}`;
  return {
    memberships: {
      get: (shopId, email) => firestore.get(member(shopId, email)),
      set: (shopId, email, row) => firestore.set(member(shopId, email), row),
      remove: async (shopId, email) => void (await firestore.remove(member(shopId, email))),
      listByShop: async (shopId) => rowsOf(await firestore.query("memberships", { where: [["shopId", "==", shopId]], limit: 1000 })),
      listByEmail: async (email) => rowsOf(await firestore.query("memberships", { where: [["email", "==", email]], limit: 1000 })),
    },
    invites: {
      get: (id) => firestore.get(`teamInvites/${safe(id)}`),
      set: (id, row) => firestore.set(`teamInvites/${safe(id)}`, row),
      listByShop: async (shopId) => rowsOf(await firestore.query("teamInvites", { where: [["shopId", "==", shopId]], limit: 1000 })),
    },
  };
}

/** `update(id, fn)` for a store whose rows change by "read it, then write what fn says" (null writes nothing). */
const updateIn = (firestore, path) => (id, fn) => firestore.transaction(async (tx) => {
  const next = fn(await tx.get(path(id)));
  if (next) tx.set(path(id), next);
  return next ?? null;
});

/** "Make changes" asks the press first (control-room/accessRequests.js, plan 19.6). */
export function firestoreAccessRequests(firestore) {
  const path = (id) => `accessRequests/${safe(id)}`;
  return {
    get: (id) => firestore.get(path(id)),
    async create(id, row) {
      if (!(await firestore.create(path(id), row))) throw new Error(`request ${id} already exists`);
    },
    listByShop: async (shopId) => rowsOf(await firestore.query("accessRequests", { where: [["shopId", "==", shopId]], limit: 1000 })),
    update: updateIn(firestore, path),
  };
}

/** Messages to presses (control-room/messages.js, plan 19.14). Never deleted from here: an ended one stays on record. */
export function firestorePressMessages(firestore) {
  return {
    get: (id) => firestore.get(`pressMessages/${safe(id)}`),
    set: (id, row) => firestore.set(`pressMessages/${safe(id)}`, row),
    list: async () => rowsOf(await firestore.query("pressMessages", { limit: 5000 })),
  };
}

/** A press's data on request (services/export/export.js, plan 19.16): each export made, and the owner's daily lock. */
export function firestoreDataExports(firestore) {
  const path = (id) => `dataExports/${safe(id)}`;
  return {
    get: (id) => firestore.get(path(id)),
    set: (id, row) => firestore.set(path(id), row),
    list: async ({ shopId } = {}) => rowsOf(await firestore.query("dataExports", { ...(shopId ? { where: [["shopId", "==", shopId]] } : {}), limit: 5000 })),
    update: updateIn(firestore, path),
  };
}

/** One small record per shop: the trial tips' (`trialTips`) and the monthly check-up's (`checkups`) own rows. */
export function firestoreShopRecords(firestore, collection) {
  if (!["trialTips", "checkups"].includes(collection)) throw new Error(`there is no shop record called ${collection}`);
  return {
    get: (shopId) => firestore.get(`${collection}/${safe(shopId)}`),
    set: (shopId, row) => firestore.set(`${collection}/${safe(shopId)}`, row),
  };
}
