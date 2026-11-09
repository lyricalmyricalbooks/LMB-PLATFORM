// How a live press sells away from its website (control room, a live shop's record): payment links (the shop admin's
// "Send a payment link", apps/shop functions/paymentLinks.js, which makes an order with `source: "payment_link"`) and
// the fair till (the stockroom's point of sale and its fair helpers, which write one `Book Fair` row per book sold into
// each book's `books/<id>/data/hist`; helpers' sales wait in `fairSales` until the owner's stockroom brings them in).
// So when a press asks "are my payment links working?" or a fair weekend goes quiet, the record says how many sales came
// through each way, for how much, and when the last one was. Read only; changes nothing.
//
// Clients passed in:
//   registry      getShop(shopId)
//   shopData      find(shopId, "orders", { where, limit })
//   stockroomData optional: ready(shopId); get(shopId, path); list(shopId, collection) (the stockroom's own database)
import { ControlError, adminOf, eachInTurn } from "./controlRoom.js";
import { PLANS } from "../setup/steps.js";

const FAIR_CHANNEL = "Book Fair";
const MAX_LINKS = 1000;
const MAX_BOOKS = 500;
const DAY = 86_400_000;
/** "Lately" in the record: the last 30 days. */
export const RECENT_DAYS = 30;
/** A payment link still unpaid this many days after it was made gets a warning in the record. */
export const UNPAID_DAYS = 3;
/** Fair till by month across every press: this many months, this one included. */
export const FAIR_MONTHS = 12;

const later = (a, b) => (!a ? b : !b ? a : a > b ? a : b);
const cents = (n) => Math.round(n * 100) / 100;
const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** Payment-link orders: paid ones (not practice), the ones still waiting to be paid, and when the last was paid. */
export function paymentLinksSummary(orders, nowMs) {
  const since = nowMs - RECENT_DAYS * DAY;
  const out = { made: 0, paid: 0, amount: 0, waiting: 0, recent: 0, lastPaidAt: null, lastMadeAt: null, unpaid: null };
  const unpaid = [];
  for (const order of orders) {
    if (!order || order.isTest || order.sandboxPayment) continue;
    out.made += 1;
    out.lastMadeAt = later(out.lastMadeAt, order.createdAt ?? null);
    if (order.paymentStatus === "paid") {
      const paidAt = order.paidAt ?? order.createdAt ?? null;
      out.paid += 1;
      out.amount = cents(out.amount + (Number(order.total) || 0));
      out.lastPaidAt = later(out.lastPaidAt, paidAt);
      if (Date.parse(paidAt ?? "") >= since) out.recent += 1;
    } else if (order.status === "pending_payment") {
      out.waiting += 1;
      const age = Math.floor((nowMs - Date.parse(order.createdAt ?? "")) / DAY);
      const expired = Date.parse(order.paymentLink?.expiresAt ?? "") <= nowMs;
      // `reminded`: the shop's own reminder to the customer went (the link record's reminderSentAt, read alongside).
      if (age >= UNPAID_DAYS) unpaid.push({ age, amount: Number(order.total) || 0, expired, reminded: Boolean(order.reminderSentAt) });
    }
  }
  // Links a customer hasn't paid after a few days: the press may think they're paid, or the link may be stuck.
  if (unpaid.length) {
    out.unpaid = {
      count: unpaid.length, amount: cents(unpaid.reduce((n, u) => n + u.amount, 0)), oldestDays: Math.max(...unpaid.map((u) => u.age)),
      expired: unpaid.filter((u) => u.expired).length, reminded: unpaid.filter((u) => u.reminded).length,
    };
  }
  return out.made ? out : null;
}

/**
 * The fair till: sales are told apart by their sale number (one checkout of several books shares one), so `sales` is
 * checkouts and `copies` is books. A voided row doesn't count. Dates are the till's own days (YYYY-MM-DD).
 */
export function fairTillSummary(histByBook, helperSales, nowMs) {
  const sinceDay = new Date(nowMs - RECENT_DAYS * DAY).toISOString().slice(0, 10);
  const sales = new Set();
  const recent = new Set();
  const days = new Set();
  const out = { sales: 0, copies: 0, amount: 0, days: 0, recent: 0, lastDay: null, helpers: null };
  for (const [bookId, rows] of Object.entries(histByBook)) {
    for (const [i, row] of rows.entries()) {
      if (!row || row.chan !== FAIR_CHANNEL || row.voided) continue;
      const qty = Number(row.qty) || 0;
      const key = row.num ? `${row.date ?? ""} ${row.num}` : `${bookId} ${i}`;
      sales.add(key);
      out.copies += qty;
      out.amount = cents(out.amount + qty * (Number(row.price) || 0));
      if (row.date) {
        days.add(row.date);
        out.lastDay = later(out.lastDay, row.date);
        if (row.date >= sinceDay) recent.add(key);
      }
    }
  }
  const helping = helperSales.filter((s) => s && !s.cancelled);
  if (helping.length) {
    out.helpers = {
      sales: helping.length,
      people: new Set(helping.map((s) => String(s.by ?? "").toLowerCase()).filter(Boolean)).size,
      lastAt: helping.map((s) => (typeof s.at === "string" ? s.at : null)).filter(Boolean).sort().at(-1) ?? null,
    };
  }
  Object.assign(out, { sales: sales.size, recent: recent.size, days: days.size });
  return out.sales || out.helpers ? out : null;
}

/** Every book's history rows in one stockroom, by book id (eight books at a time, like the data export). */
export async function histOf(stockroomData, shopId) {
  const catalogDoc = await stockroomData.get(shopId, "settings/catalog");
  const catalog = (catalogDoc && parse(catalogDoc.data)) || {};
  const ids = Object.keys(catalog).filter((id) => !id.startsWith("_") && catalog[id] && typeof catalog[id] === "object").slice(0, MAX_BOOKS);
  const hist = {};
  await eachInTurn(ids, 8, async (bookId) => {
    const doc = await stockroomData.get(shopId, `books/${bookId}/data/hist`);
    const rows = doc ? parse(doc.data) : null;
    hist[bookId] = Array.isArray(rows) ? rows : [];
  });
  return hist;
}

/**
 * Fair till sales by month, from many presses' history rows: for each of the last `months` months (oldest first), the
 * checkouts, copies, money and how many presses sold at a fair. `perShop` is [{ shopId, hist }].
 */
export function fairTillMonths(perShop, nowMs, months = FAIR_MONTHS) {
  // This month is Toronto's, like the till's own days: on the last evening of a month UTC is already in the next one.
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit" }).format(nowMs).split("-").map(Number);
  const keys = Array.from({ length: months }, (_, i) => new Date(Date.UTC(year, month - 1 - (months - 1 - i), 1)).toISOString().slice(0, 7));
  const byMonth = new Map(keys.map((k) => [k, { month: k, sales: new Set(), copies: 0, amount: 0, presses: new Set() }]));
  for (const { shopId, hist } of perShop) {
    for (const [bookId, rows] of Object.entries(hist)) {
      for (const [i, row] of rows.entries()) {
        if (!row || row.chan !== FAIR_CHANNEL || row.voided || typeof row.date !== "string") continue;
        const month = byMonth.get(row.date.slice(0, 7));
        if (!month) continue;
        const qty = Number(row.qty) || 0;
        month.sales.add(`${shopId} ${row.num ? `${row.date} ${row.num}` : `${bookId} ${i}`}`);
        month.copies += qty;
        month.amount = cents(month.amount + qty * (Number(row.price) || 0));
        month.presses.add(shopId);
      }
    }
  }
  return [...byMonth.values()].map((m) => ({ month: m.month, sales: m.sales.size, copies: m.copies, amount: m.amount, presses: m.presses.size }));
}

/** The live shops whose plan has the stockroom (not the test shop, not closed). */
const fairShops = (rows) => rows.filter((row) => row.status === "live" && !row.closure && row.testShop !== true && (PLANS[row.plan] ?? { stockroom: true }).stockroom);

export function createSalesChannels({ admins, registry, shopData, stockroomData = null, now = () => new Date() }) {

  return {
    async forShop(claims, { shopId } = {}) {
      const nowMs = now().getTime();
      adminOf(claims, admins, nowMs);
      const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop with that id.");
      if (row.status !== "live") return { shopId, channels: null, words: "Not live yet, so nothing has been sold." };
      if (!shopData?.find) throw new ControlError(503, "The control room can't read the shop's own records yet.");
      const apps = PLANS[row.plan] ?? { shop: true, stockroom: true };
      try {
        let links = null;
        if (apps.shop) {
          const orders = await shopData.find(shopId, "orders", { where: [["source", "==", "payment_link"]], limit: MAX_LINKS });
          // For a link still waiting, whether the shop's reminder to the customer has gone (paymentLinks/<orderId>).
          await eachInTurn(orders.filter((d) => d.data?.status === "pending_payment"), 8, async (d) => {
            const link = shopData.get ? await shopData.get(shopId, `paymentLinks/${d.id}`) : null;
            if (link?.reminderSentAt) d.data.reminderSentAt = link.reminderSentAt;
          });
          links = paymentLinksSummary(orders.map((d) => d.data), nowMs);
        }
        let fair = null;
        let stockroom = "none";
        if (apps.stockroom && stockroomData) {
          stockroom = (await stockroomData.ready(shopId)) ? "read" : "not made yet";
          if (stockroom === "read") {
            const helpers = stockroomData.list ? (await stockroomData.list(shopId, "fairSales")).map((d) => d.data) : [];
            fair = fairTillSummary(await histOf(stockroomData, shopId), helpers, nowMs);
          }
        }
        return { shopId, channels: { links, fair, hasShop: Boolean(apps.shop), hasStockroom: Boolean(apps.stockroom), stockroom } };
      } catch (failure) {
        if (failure.status === 503) throw new ControlError(503, failure.message);
        throw new ControlError(502, `Couldn't read the shop's records: ${failure.message}`);
      }
    },

    /** Fair till sales by month across every live press with the stockroom; a press that can't be read is named, not fatal. */
    async fairMonths(claims) {
      const nowMs = now().getTime();
      adminOf(claims, admins, nowMs);
      if (!stockroomData) throw new ControlError(503, "The control room can't read the stockrooms yet.");
      const perShop = [];
      const unread = [];
      await eachInTurn(fairShops(await registry.listShops()), 4, async (row) => {
        try {
          if (await stockroomData.ready(row.shopId)) perShop.push({ shopId: row.shopId, hist: await histOf(stockroomData, row.shopId) });
        } catch (failure) {
          unread.push({ shopId: row.shopId, pressName: row.pressName ?? row.shopId, error: failure.message });
        }
      });
      return { months: fairTillMonths(perShop, nowMs), presses: perShop.length, unread };
    },
  };
}

//   POST /api/control/sales-channels  { shopId }: payment-link and fair-till sales, from the shop's own records (read only)
//   GET  /api/control/fair-months      fair till sales by month across every press with the stockroom (read only)
export function salesChannelsRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "POST /api/control/sales-channels": (claims, request) => desk.forShop(claims, body(request)),
    "GET /api/control/fair-months": (claims) => desk.fairMonths(claims),
  };
}
