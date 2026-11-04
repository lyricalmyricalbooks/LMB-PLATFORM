// Alerts to apps (code plan 26.4, docs/app-store.md): when an order is paid, sent or refunded, a product changes, stock
// changes or the app is removed, each installed app that asked for that alert gets a signed message at its alerts
// address. Retried for a day, then given up and counted for the control room.
//
//   createAppAlerts({ apps, installs, outbox, state, shopData, fetch, now })
//     scan()      every minute: reads what changed in each shop with apps since the last look, and queues alerts
//     deliver()   every minute: sends the alerts that are due, and plans the next try for the ones that failed
//     removed(install)   queues app/uninstalled at once (services/apps/installs.js calls it)
//     sweep()     scan, then deliver (the `app-alerts` job)
//
// The platform finds changes by looking (each shop's orders and products changed since the last look, by `updatedAt`),
// so the shops need no change to send alerts. A change is alerted once: each alert's id comes from the install, the
// topic, the record and what changed, and the outbox never queues the same id twice.
//
// The message: POST, JSON `{ id, topic, shopId, createdAt, data }`, with headers X-Colophon-Topic, X-Colophon-Shop,
// X-Colophon-Alert-Id and X-Colophon-Signature: Base64 HMAC-SHA256 of the exact body, keyed with the SHA-256 (hex) of
// the app's secret. The platform only keeps that fingerprint, never the secret; the app computes the same key from its
// secret. A 2xx answer within 10 seconds counts as delivered.
//
// Clients passed in:
//   apps      get(appId)
//   installs  listActive() -> active installs (all shops); get(installId)
//   outbox    get(id); put(id, alert); listDue(nowIso, limit); listByInstall(installId)
//   state     get(shopId); put(shopId, state)   what the last look saw, per shop
//   shopData  find(shopId, collection, { where, limit }) (clients/shop.js)
import { createHash, createHmac } from "node:crypto";
import { grantedScopes } from "./scopes.js";
import { TOPICS } from "./topics.js";
import { order, product, stockOf } from "./connection.js";

/** Minutes to wait before each new try. After the last, the alert is given up (a little over a day in all). */
export const RETRY_MINUTES = Object.freeze([1, 5, 15, 60, 180, 360, 720]);
export const TIMEOUT_MS = 10_000;
const BATCH = 200;
const KEEP_MARKS_DAYS = 45;

/**
 * May the platform send to this address? https only, and never to an address inside a network: no IP numbers, no
 * local or internal names (so an app can't point alerts at the platform's own machines).
 */
export function publicAlertAddress(address) {
  let url;
  try {
    url = new URL(address);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (/^[\d.]+$/.test(host) || host.startsWith("[") || host.includes(":")) return false;
  if (!host.includes(".") || /(^|\.)(localhost|internal|local|localdomain|home|lan|corp|intranet)$/.test(host)) return false;
  return true;
}

const idOf = (...parts) => `alert_${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32)}`;

/** The signature of a body, keyed with the fingerprint of the app's secret (what an app checks). */
export function alertSignature(secretFingerprintHex, body) {
  return createHmac("sha256", Buffer.from(String(secretFingerprintHex), "utf8")).update(body, "utf8").digest("base64");
}

/** What an order's state means for alerts: the marks it has earned so far. */
function orderMarks(data) {
  const marks = [];
  if (["paid", "refunded", "partially_refunded"].includes(data.paymentStatus)) marks.push("paid");
  if (["shipped", "out_for_delivery", "delivered"].includes(data.fulfillmentStatus)) marks.push("shipped");
  if (["refunded", "partially_refunded"].includes(data.paymentStatus)) marks.push(`refunded:${data.refundedAmount ?? data.paymentStatus}`);
  return marks;
}

export function createAppAlerts({ apps, installs, outbox, state, shopData, fetch, now = () => new Date() }) {
  const at = () => now().toISOString();

  /** The copy of the app's details that applies to this install, and the app record. */
  async function detailsFor(install) {
    const app = await apps.get(install.appId);
    if (!app) return { app: null, details: null };
    return { app, details: install.testing ? app.draft : app.listing?.details ?? app.draft };
  }

  async function queue(install, topic, recordKey, data) {
    const id = idOf(install.installId, install.installedAt ?? "", topic, recordKey);
    if (await outbox.get(id)) return false;
    await outbox.put(id, {
      id, installId: install.installId, appId: install.appId, shopId: install.shopId, topic, data, createdAt: at(),
      status: "waiting", tries: 0, nextAt: at(), lastError: null,
    });
    return true;
  }

  /** The installs on each shop that want this topic and have its permission. */
  async function wanting(byShop, shopId, topic) {
    const out = [];
    for (const install of byShop.get(shopId) ?? []) {
      const { details } = await detailsFor(install);
      const needs = TOPICS[topic]?.needs;
      if (!details?.alertsAddress || !(details.alertTopics ?? []).includes(topic)) continue;
      if (needs && !grantedScopes(install.scopes).includes(needs)) continue;
      out.push(install);
    }
    return out;
  }

  async function scanShop(shopId, byShop) {
    const seen = (await state.get(shopId)) ?? { cursor: null, orders: {}, stock: {} };
    const since = seen.cursor ?? (byShop.get(shopId) ?? []).map((i) => i.installedAt).sort()[0] ?? at();
    const started = at();
    let queued = 0;

    const changedOrders = await shopData.find(shopId, "orders", { where: [["updatedAt", ">=", since]], limit: 1000 });
    for (const { id, data } of changedOrders) {
      if (!data || data.isTest === true) continue;
      const before = new Set(seen.orders[id]?.marks ?? []);
      const marks = orderMarks(data);
      for (const mark of marks.filter((m) => !before.has(m))) {
        const topic = mark === "paid" ? "orders/paid" : mark === "shipped" ? "orders/shipped" : "orders/refunded";
        for (const install of await wanting(byShop, shopId, topic)) {
          if (await queue(install, topic, `${id} ${mark}`, { order: order(id, data, grantedScopes(install.scopes)) })) queued += 1;
        }
      }
      seen.orders[id] = { marks, at: started };
    }

    const changedProducts = await shopData.find(shopId, "books", { where: [["updatedAt", ">=", since]], limit: 1000 });
    for (const { id, data } of changedProducts) {
      if (!data) continue;
      for (const install of await wanting(byShop, shopId, "products/changed")) {
        if (await queue(install, "products/changed", `${id} ${data.updatedAt}`, { product: product(id, data, grantedScopes(install.scopes)) })) queued += 1;
      }
      const stock = stockOf(id, data);
      const key = JSON.stringify([stock.available, stock.variants.map((v) => v.available)]);
      if (seen.stock[id] !== undefined && seen.stock[id] !== key) {
        for (const install of await wanting(byShop, shopId, "inventory/changed")) {
          if (await queue(install, "inventory/changed", `${id} ${data.updatedAt} ${key}`, { inventory: stock })) queued += 1;
        }
      }
      seen.stock[id] = key;
    }

    // Forget orders not touched for a while, so the record stays small.
    const oldest = new Date(now().getTime() - KEEP_MARKS_DAYS * 24 * 3600_000).toISOString();
    for (const [id, entry] of Object.entries(seen.orders)) if (entry.at < oldest) delete seen.orders[id];
    // The next look starts a minute before this one did: a write landing while we read is seen twice, never missed
    // (the outbox drops the repeat).
    seen.cursor = new Date(Date.parse(started) - 60_000).toISOString();
    await state.put(shopId, seen);
    return queued;
  }

  async function sendOne(alert) {
    const install = await installs.get(alert.installId);
    const { app, details } = install ? await detailsFor(install) : { app: null, details: null };
    // An app removed since the alert was queued gets only its app/uninstalled message.
    const stillThere = install && (install.status === "active" || alert.topic === "app/uninstalled");
    if (!stillThere || !app?.secretHash || !details?.alertsAddress || !publicAlertAddress(details.alertsAddress)) {
      await outbox.put(alert.id, { ...alert, status: "dropped", lastError: "the app or its alerts address is gone, or the address isn't a public https one", nextAt: null });
      return "dropped";
    }
    const body = JSON.stringify({ id: alert.id, topic: alert.topic, shopId: alert.shopId, createdAt: alert.createdAt, data: alert.data });
    let problem = null;
    try {
      const answer = await fetch(details.alertsAddress, {
        method: "POST", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), body,
        headers: {
          "Content-Type": "application/json", "User-Agent": "Colophon-Alerts/1", "X-Colophon-Topic": alert.topic, "X-Colophon-Shop": alert.shopId,
          "X-Colophon-Alert-Id": alert.id, "X-Colophon-Signature": alertSignature(app.secretHash, body),
        },
      });
      if (answer.status < 200 || answer.status >= 300) problem = `answered ${answer.status}`;
    } catch (error) {
      problem = `couldn't be reached (${String(error?.name === "TimeoutError" ? "no answer in 10 seconds" : error?.message ?? error).slice(0, 120)})`;
    }
    const tries = alert.tries + 1;
    if (!problem) {
      await outbox.put(alert.id, { ...alert, status: "sent", tries, sentAt: at(), nextAt: null, lastError: null });
      return "sent";
    }
    if (tries > RETRY_MINUTES.length) {
      await outbox.put(alert.id, { ...alert, status: "failed", tries, nextAt: null, lastError: problem, failedAt: at() });
      return "failed";
    }
    const next = new Date(now().getTime() + RETRY_MINUTES[tries - 1] * 60_000).toISOString();
    await outbox.put(alert.id, { ...alert, status: "waiting", tries, nextAt: next, lastError: problem });
    return "retry";
  }

  const api = {
    async scan() {
      const active = await installs.listActive();
      const byShop = new Map();
      for (const install of active) {
        if (!byShop.has(install.shopId)) byShop.set(install.shopId, []);
        byShop.get(install.shopId).push(install);
      }
      let queued = 0;
      const problems = [];
      for (const shopId of byShop.keys()) {
        try {
          queued += await scanShop(shopId, byShop);
        } catch (error) {
          problems.push(`${shopId}: ${String(error?.message ?? error).slice(0, 200)}`);
        }
      }
      return { shops: byShop.size, queued, problems };
    },

    async deliver() {
      const due = await outbox.listDue(at(), BATCH);
      const counts = { sent: 0, retry: 0, failed: 0, dropped: 0 };
      for (const alert of due) counts[await sendOne(alert)] += 1;
      return counts;
    },

    /** The app was removed: tell it now (it is the one alert a removed app still gets). */
    async removed(install) {
      await queue({ ...install, status: "active" }, "app/uninstalled", `${install.removedAt ?? at()}`, { shopId: install.shopId, removedAt: install.removedAt ?? at() });
    },

    async sweep() {
      const scanned = await api.scan();
      const delivered = await api.deliver();
      return { ...scanned, ...delivered, summary: `${scanned.queued} queued across ${scanned.shops} shops; ${delivered.sent} sent, ${delivered.retry} to try again, ${delivered.failed} given up` };
    },
  };
  return api;
}
