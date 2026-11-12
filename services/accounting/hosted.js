// The QuickBooks link as the hosted server runs it (server/world.js, at /api/accounting): the real stores in the
// platform's database, the owner's email through the platform's email service, and Intuit's address back to us.
//
//   hostedAccounting({ env, fetch, platform, registry, auditLog, email, shopStart, now, log })
//     -> { service, handle(request) }, or null when the QuickBooks settings are broken (the door then answers "not
//        switched on" and every shop's Bookkeeping page stays hidden, as before)
//
// Without Intuit's keys or ACCOUNTING_ENABLED the service is still built: `accounting.status` answers
// { enabled: false } and the shop hides the page, so adding the keys and turning it on needs no other change.
//
// Stores, in the platform project's database (never a shop's folder: they hold Intuit's sealed tokens):
//   accountingConnections/<shop id>   each shop's QuickBooks company, sealed tokens and choices
//   accountingStates/<state>          one-use sign-in states, 15 minutes each
//   accountingSent/<key>              what was written to each company, so nothing is sent twice
import { createAccountingFromEnv } from "./index.js";
import { handleAccounting } from "./http.js";

const SHOP_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
const STATE = /^[0-9a-f]{48}$/;
const shopPath = (shopId) => {
  if (!SHOP_ID.test(String(shopId ?? ""))) throw new Error("not a shop id");
  return `accountingConnections/${shopId}`;
};

/** The three stores accounting.js asks for, in the platform's database. */
export function accountingStores(platform) {
  return {
    connections: {
      get: (shopId) => platform.get(shopPath(shopId)),
      // The shop id is kept on the record too, so list() and byRealm() say whose each one is.
      set: (shopId, record) => platform.set(shopPath(shopId), { ...record, shopId }),
      list: async () => (await platform.query("accountingConnections", { limit: 5000 })).map((row) => row.data),
      byRealm: async (mode, realmId) => (await platform.query("accountingConnections", {
        where: [["mode", "==", String(mode)], ["realmId", "==", String(realmId)]], limit: 50,
      })).map((row) => row.data),
    },
    states: {
      put: (state, record) => {
        if (!STATE.test(state)) throw new Error("not a sign-in state");
        return platform.set(`accountingStates/${state}`, record);
      },
      // One use: read and removed together, so Intuit's answer can't be replayed.
      take: (state) => (STATE.test(String(state)) ? platform.transaction(async (tx) => {
        const found = await tx.get(`accountingStates/${state}`);
        if (found) tx.remove(`accountingStates/${state}`);
        return found;
      }) : Promise.resolve(null)),
    },
    // The key is "<shop>/<company>/<kind>/<ref>": one document id, so its slashes are encoded.
    sent: {
      get: (key) => platform.get(`accountingSent/${encodeURIComponent(key)}`),
      put: (key, record) => platform.set(`accountingSent/${encodeURIComponent(key)}`, record),
    },
  };
}

/**
 * The settings with the platform's own address filled in: Intuit sends the press back to
 * <PLATFORM_URL>/api/accounting/quickbooks/oauth unless QUICKBOOKS_REDIRECT_URL says otherwise.
 */
export function accountingEnv(env = {}) {
  const base = String(env.PLATFORM_URL ?? "").trim().replace(/\/+$/, "");
  const redirect = String(env.QUICKBOOKS_REDIRECT_URL ?? "").trim() || (/^https:\/\//.test(base) ? `${base}/api/accounting/quickbooks/oauth` : "");
  return { ...env, QUICKBOOKS_REDIRECT_URL: redirect };
}

/** The owner's email (a lost connection, a connection ending soon), once per message. */
export function ownerNotifier(email) {
  return async (row, { kind, subject, text }) => {
    if (!row?.ownerEmail) return;
    const day = new Date().toISOString().slice(0, 10);
    await email.send(row.shopId, { kind, custom: true, to: row.ownerEmail, idempotencyKey: `${kind}-${row.shopId}-${day}`, subject, text });
  };
}

export function hostedAccounting({ env = {}, fetch, platform, registry, auditLog, email, shopStart = null, now = () => Date.now(), log = console.error }) {
  let service;
  try {
    service = createAccountingFromEnv({
      env: accountingEnv(env), fetch, registry, auditLog, ...accountingStores(platform),
      notifyOwner: email ? ownerNotifier(email) : null, shopStart, now,
    });
  } catch (error) {
    log(`The QuickBooks link is off: ${error.message}`);
    return null;
  }
  return { service, handle: (request) => handleAccounting(request, { service }) };
}
