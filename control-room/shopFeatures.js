// What a live press uses of the shop's newer features (control room, a live shop's record; plan Phase 24): newsletters
// it sent (apps/shop functions/newsletterSend.js `newsletterIssues`), the morning emails (Settings › Notifications ›
// Shop alerts: the orders digest and Running low, with what is low now from `systemStatus/lowStockAlerts`), and orders
// shipped in parts or with items added after payment (`partShipments`, `shipsWith`). So when a press writes "my
// newsletter didn't go" or "I never got the low-stock email", the record already says what happened. Read only.
//
// The daily watch (driftWatch.js) also keeps a paused newsletter on the shop's registry row (`newsletterPaused`), so
// Today lists it without reading every shop.
//
// Clients passed in:
//   registry  getShop(shopId)
//   shopData  get(shopId, path); find(shopId, collection, { where, limit }) -> [{ id, data }]
import { ControlError, adminOf } from "./controlRoom.js";
import { PLANS } from "../setup/steps.js";

const DAY = 86_400_000;
/** Orders looked at for parts and added items: the last 90 days. */
export const ORDER_DAYS = 90;
const MAX_ISSUES = 200;
const MAX_ORDERS = 2000;
const SHOWN_ISSUES = 5;

/** The newsletters, newest first: how many went, the last few with their counts, and any stopped part-way. */
export function newslettersSummary(issues) {
  if (!issues.length) return null;
  const sorted = [...issues].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  const pick = (i) => ({
    id: i.id, subject: String(i.subject ?? "").slice(0, 150), status: i.status ?? "?", createdAt: i.createdAt ?? null, finishedAt: i.finishedAt ?? null,
    sent: Number(i.sent) || 0, skipped: Number(i.skipped) || 0, failed: Number(i.failed) || 0, lastError: i.lastError || null,
  });
  const sent = sorted.filter((i) => i.status === "sent");
  return {
    issues: sorted.length,
    sentIssues: sent.length,
    people: sent.reduce((n, i) => n + (Number(i.sent) || 0), 0),
    lastSentAt: sent[0]?.finishedAt ?? null,
    paused: sorted.filter((i) => i.status === "paused").map(pick),
    latest: sorted.slice(0, SHOWN_ISSUES).map(pick),
  };
}

/** The morning emails' switches (both on unless switched off, as the shop reads them) and what is marked low now. */
export function alertsSummary(notifications, lowMarks) {
  const alerts = notifications?.shopAlerts ?? {};
  const items = Object.values(lowMarks?.items ?? {});
  return {
    ordersDigest: alerts.dailyOrderDigest !== false,
    lowStock: alerts.lowStock !== false,
    low: items.filter((s) => s === "low").length,
    out: items.filter((s) => s === "out").length,
  };
}

/** Orders of the last 90 days shipped in parts, or paid with items added after (their own linked order). */
export function ordersSummary(orders) {
  const parts = orders.filter((o) => Array.isArray(o?.partShipments) && o.partShipments.length);
  const added = orders.filter((o) => o?.shipsWith);
  return { partShipped: parts.length, parts: parts.reduce((n, o) => n + o.partShipments.length, 0), itemsAdded: added.length, paidAdded: added.filter((o) => o.paymentStatus === "paid").length };
}

export function createShopFeatures({ admins, registry, shopData, now = () => new Date() }) {
  return {
    async forShop(claims, { shopId } = {}) {
      const nowMs = now().getTime();
      adminOf(claims, admins, nowMs);
      const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop with that id.");
      if (row.status !== "live") return { shopId, features: null, words: "Not live yet." };
      if (!(PLANS[row.plan] ?? { shop: true }).shop) return { shopId, features: null, words: "This plan has no website, so no newsletters or shop emails." };
      if (!shopData?.find) throw new ControlError(503, "The control room can't read the shop's own records yet.");
      try {
        const issues = (await shopData.find(shopId, "newsletterIssues", { limit: MAX_ISSUES })).map((d) => ({ id: d.id, ...d.data }));
        const since = new Date(nowMs - ORDER_DAYS * DAY).toISOString();
        const orders = (await shopData.find(shopId, "orders", { where: [["createdAt", ">=", since]], limit: MAX_ORDERS })).map((d) => d.data);
        return {
          shopId,
          features: {
            newsletters: newslettersSummary(issues),
            alerts: alertsSummary(await shopData.get(shopId, "settings/notifications"), await shopData.get(shopId, "systemStatus/lowStockAlerts")),
            orders: ordersSummary(orders),
          },
        };
      } catch (failure) {
        if (failure.status === 503) throw new ControlError(503, failure.message);
        throw new ControlError(502, `Couldn't read the shop's records: ${failure.message}`);
      }
    },
  };
}

//   POST /api/control/shop-features  { shopId }: newsletters, the morning emails and changed orders (read only)
export function shopFeaturesRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return { "POST /api/control/shop-features": (claims, request) => desk.forShop(claims, body(request)) };
}
