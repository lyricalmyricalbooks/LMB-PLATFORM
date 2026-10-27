// Short stock holds while a shopper pays, so two people can't both pay for the last copy.
// One server-only doc per book in `stock-holds` (firestore.rules deny every browser
// access): { holds: { <orderId>: { lines: { <variantId|"_">: qty }, expiresAt: ms } } }.
// The book doc and its hold doc are read and written in one transaction, so concurrent
// checkouts for the same book are serialized. Holds expire on their own (no sweep needed);
// paying, or giving up, releases them. Stock itself still only moves when the payment is
// confirmed (webhook / verified capture), exactly as before.

const crypto = require("crypto");
const { stockLines } = require("./shared/promotions");
const { ipKey } = require("./rateLimit");
const { readStockPools, poolMembers } = require("./stockPools");

const HOLD_MS = 30 * 60 * 1000; // matches the hosted Stripe session lifetime

// Caps on what one shopper can hold at once, so a script can't lock the catalogue by opening
// checkouts it never pays for (holds cost nothing). Counted across every active hold of the
// same holder in the server-only `stock-hold-owners/{key}` docs: "e_<holdOwner>" (email hash)
// and "ip_<sha256(ip)>". Only books whose stock is actually held (tracked, no backorders) count.
// The connection caps are looser because homes, schools and offices share one address.
const HOLD_LIMITS = {
  owner: { perBook: 10, units: 50, orders: 3 },
  ip: { perBook: 20, units: 100, orders: 10 },
};

// Settings › General › Checkout stock holds (`settings/website.stockHolds`) lets the owner raise or lower
// the per-shopper numbers; the per-connection caps follow them (never below today's defaults), because
// homes, schools and offices share one address. Mirrored for the cart warning in
// src/app/features/site/holdLimits.ts (holdLimits.parity.test.ts).
const clampInt = (value, fallback, min, max) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
function holdLimitsFrom(settings) {
  const saved = settings?.stockHolds || {};
  const owner = {
    perBook: clampInt(saved.perBook, HOLD_LIMITS.owner.perBook, 1, 99),
    units: clampInt(saved.units, HOLD_LIMITS.owner.units, 1, 2000),
    orders: clampInt(saved.orders, HOLD_LIMITS.owner.orders, 1, 50),
  };
  return {
    owner,
    ip: {
      perBook: Math.max(HOLD_LIMITS.ip.perBook, owner.perBook * 2),
      units: Math.max(HOLD_LIMITS.ip.units, owner.units * 2),
      orders: Math.max(HOLD_LIMITS.ip.orders, owner.orders * 3),
    },
  };
}

// Who a hold belongs to: a hash of the shopper's email (never the address itself). A shopper
// who fixes a typo or changes delivery after a declined card gets a new order; their earlier
// order's hold must not lock them out of the copy they were already buying.
function holdOwner(order) {
  const email = String(order?.customer?.email || "").trim().toLowerCase();
  return email ? crypto.createHash("sha256").update(email).digest("hex").slice(0, 32) : "";
}

const lineKey = variantId => variantId || "_";

// Pure: holds still active at `now`, without the given order's own hold (and, when `owner`
// is given, without the same shopper's other holds).
function activeHolds(holds, now, exceptOrderId, owner = "") {
  const out = {};
  for (const [orderId, hold] of Object.entries(holds || {})) {
    if (orderId === exceptOrderId) continue;
    if (!hold || Number(hold.expiresAt) <= now) continue;
    if (owner && hold.owner === owner) continue;
    out[orderId] = hold;
  }
  return out;
}

// Pure: units of one edition held by other shoppers right now.
function heldUnits(holds, key) {
  return Object.values(holds || {}).reduce((sum, hold) => sum + (Number(hold?.lines?.[key]) || 0), 0);
}

// Pure: what one book's lines need, grouped by edition. Quantities are clamped like checkout does.
// A box set's quantity is clamped first, then counted as the books inside it.
function linesByBook(items) {
  const byBook = new Map();
  const clamped = (items || []).map(item => item && { ...item, quantity: Math.max(1, Math.min(99, Math.floor(Number(item.quantity) || 1))) });
  for (const item of stockLines(clamped)) {
    if (!item || !item.id) continue;
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const lines = byBook.get(item.id) || {};
    const key = lineKey(item.variantId);
    lines[key] = (lines[key] || 0) + qty;
    byBook.set(item.id, lines);
  }
  return byBook;
}

function stockOf(book, key) {
  if (key === "_") return Number(book.stockLevel) || 0;
  const variant = (book.variants || []).find(v => v.id === key);
  return variant ? Number(variant.stock ?? variant.stockLevel) || 0 : 0;
}

class StockHoldError extends Error {
  constructor(title, available) {
    super(available > 0
      ? `Only ${available} of "${title}" can be bought right now: other shoppers are checking out with the rest. Lower the quantity or try again in a few minutes.`
      : `"${title}" is being bought by another shopper right now. Try again in a few minutes, or remove it from your bag.`);
    this.code = "stock_held";
    this.available = available;
  }
}

// Refused because this shopper (email or connection) already holds as much as one shopper may.
// The storefront shows its own Studio words for the "hold_limit" code (Text & labels › Checkout).
class HoldLimitError extends StockHoldError {
  constructor(limit) {
    super("", 0);
    this.message = "You already have as many copies set aside as one shopper can at a time. Finish or cancel your other checkouts, lower the quantity, or contact us for a larger order.";
    this.code = "hold_limit";
    this.limit = limit;
  }
}

// The holder docs one checkout is counted in: the shopper's email hash and, when the request
// came from a known address, a hash of that address (never the address itself).
function holderKeys(owner, ip, limits = HOLD_LIMITS) {
  const keys = [];
  if (owner) keys.push({ key: `e_${owner}`, limits: limits.owner });
  // An IPv6 connection is counted by its /64 (ipKey), not the single address it happened to use.
  const addr = ipKey(ip);
  if (addr && addr !== "unknown") keys.push({ key: `ip_${crypto.createHash("sha256").update(addr).digest("hex").slice(0, 32)}`, limits: limits.ip });
  return keys;
}

// Pure: a holder's other orders still holding something at `now`.
function liveHolderOrders(orders, now, exceptOrderId) {
  const out = {};
  for (const [id, entry] of Object.entries(orders || {})) {
    if (id === exceptOrderId || !entry || Number(entry.expiresAt) <= now) continue;
    out[id] = entry;
  }
  return out;
}

// Pure: which limit (if any) holding `books` ({ bookId: units }) as one more order would
// break for a holder whose other active orders are `orders`.
function holderLimitProblem(orders, books, limits) {
  const entries = [...Object.values(orders || {}), { books }];
  if (entries.length > limits.orders) return "orders";
  let units = 0;
  const perBook = {};
  for (const entry of entries) {
    for (const [bookId, qty] of Object.entries(entry.books || {})) {
      const n = Number(qty) || 0;
      units += n;
      perBook[bookId] = (perBook[bookId] || 0) + n;
    }
  }
  if (Object.values(perBook).some(n => n > limits.perBook)) return "perBook";
  if (units > limits.units) return "units";
  return "";
}

// Holds the order's tracked stock for HOLD_MS (renewing its own earlier hold). Throws
// StockHoldError when someone else's active holds leave too little. With `limits: true`
// (a shopper starting a checkout) it also throws HoldLimitError when the shopper's email or
// connection (`ip`) would hold more than HOLD_LIMITS; renewals at payment time pass no limits.
async function reserveStock(db, orderId, items, now = Date.now(), owner = "", { limits = false, ip = "", holdLimits = HOLD_LIMITS } = {}) {
  const byBook = linesByBook(items);
  if (!byBook.size) return;
  const ids = [...byBook.keys()].sort(); // stable lock order
  const holders = limits ? holderKeys(owner, ip, holdLimits) : [];
  await db.runTransaction(async tx => {
    const bookRefs = ids.map(id => db.collection("books").doc(id));
    const holdRefs = ids.map(id => db.collection("stock-holds").doc(id));
    const holderRefs = holders.map(h => db.collection("stock-hold-owners").doc(h.key));
    const snaps = await Promise.all([...bookRefs, ...holdRefs, ...holderRefs].map(ref => tx.get(ref)));
    // Editions sharing one pile (stockPools.js) are held against that one pile.
    const pools = await readStockPools(tx, db);
    const writes = [];
    const heldBooks = {};
    ids.forEach((id, i) => {
      const bookSnap = snaps[i];
      const holdSnap = snaps[ids.length + i];
      if (!bookSnap.exists) return;
      const book = bookSnap.data();
      if (!book.trackInventory || book.allowBackorder) return; // nothing to hold
      const existing = holdSnap.exists ? holdSnap.data().holds : {};
      // The shopper's newer attempt replaces their earlier holds, so holds never add up past stock.
      const others = activeHolds(existing, now, orderId, owner);
      const lines = byBook.get(id);
      // A payment-time renewal passes no limits, so it names no holders: keep the ones this order was
      // counted in, or paying would leave it counting against the shopper's caps until it expires.
      const holderNames = holders.length ? holders.map(h => h.key) : (Array.isArray(existing?.[orderId]?.holders) ? existing[orderId].holders : []);
      for (const key of Object.keys(lines)) {
        const members = poolMembers(pools, id, key);
        const qty = members.reduce((sum, k) => sum + (Number(lines[k]) || 0), 0);
        const available = Math.max(0, stockOf(book, key) - members.reduce((sum, k) => sum + heldUnits(others, k), 0));
        if (qty > available) {
          const variant = key === "_" ? null : (book.variants || []).find(v => v.id === key);
          throw new StockHoldError(variant?.name ? `${book.title} (${variant.name})` : book.title || "This book", available);
        }
      }
      heldBooks[id] = Object.values(lines).reduce((sum, qty) => sum + qty, 0);
      writes.push([holdRefs[i], { holds: { ...others, [orderId]: { lines, expiresAt: now + HOLD_MS, ...(owner ? { owner } : {}), ...(holderNames.length ? { holders: holderNames } : {}) } }, updatedAt: new Date(now).toISOString() }]);
    });
    if (Object.keys(heldBooks).length) {
      holders.forEach((holder, i) => {
        const snap = snaps[ids.length * 2 + i];
        const orders = liveHolderOrders(snap.exists ? snap.data().orders : {}, now, orderId);
        // The same shopper's earlier attempts give up these books (as the per-book holds just
        // did), and an attempt left holding nothing drops out: a retry never counts twice.
        for (const [id, entry] of Object.entries(orders)) {
          if (!owner || entry.owner !== owner) continue;
          const books = { ...(entry.books || {}) };
          for (const bookId of Object.keys(heldBooks)) delete books[bookId];
          if (Object.keys(books).length) orders[id] = { ...entry, books };
          else delete orders[id];
        }
        const problem = holderLimitProblem(orders, heldBooks, holder.limits);
        if (problem) throw new HoldLimitError(problem);
        writes.push([holderRefs[i], { orders: { ...orders, [orderId]: { books: heldBooks, expiresAt: now + HOLD_MS, ...(owner ? { owner } : {}) } }, updatedAt: new Date(now).toISOString() }]);
      });
    }
    for (const [ref, data] of writes) tx.set(ref, data);
  });
}

// Drops the order's holds (after payment or when the order closes). Best effort: an expired
// hold frees itself anyway, so a failure here only delays other shoppers by up to HOLD_MS.
async function releaseStock(db, orderId, items) {
  const ids = [...linesByBook(items).keys()];
  if (!ids.length) return;
  try {
    await db.runTransaction(async tx => {
      const refs = ids.map(id => db.collection("stock-holds").doc(id));
      const snaps = await Promise.all(refs.map(ref => tx.get(ref)));
      // The holder docs this order was counted in (every read before any write).
      const holderIds = [...new Set(snaps.flatMap(snap => (snap.exists && snap.data().holds?.[orderId]?.holders) || []))];
      const holderRefs = holderIds.map(key => db.collection("stock-hold-owners").doc(key));
      const holderSnaps = await Promise.all(holderRefs.map(ref => tx.get(ref)));
      const now = Date.now();
      snaps.forEach((snap, i) => {
        if (!snap.exists || !snap.data().holds?.[orderId]) return;
        const rest = activeHolds(snap.data().holds, now, orderId);
        tx.set(refs[i], { holds: rest, updatedAt: new Date(now).toISOString() });
      });
      holderSnaps.forEach((snap, i) => {
        if (!snap.exists || !snap.data().orders?.[orderId]) return;
        tx.set(holderRefs[i], { orders: liveHolderOrders(snap.data().orders, now, orderId), updatedAt: new Date(now).toISOString() });
      });
    });
  } catch (err) {
    console.warn(`Could not release stock holds for ${orderId}:`, err.message);
  }
}

async function releaseStockForOrder(db, orderId) {
  try {
    const snap = await db.collection("orders").doc(orderId).get();
    if (snap.exists) await releaseStock(db, orderId, snap.data().items || []);
  } catch (err) {
    console.warn(`Could not release stock holds for ${orderId}:`, err.message);
  }
}

module.exports = { HOLD_MS, HOLD_LIMITS, holdLimitsFrom, holdOwner, holderKeys, holderLimitProblem, activeHolds, heldUnits, linesByBook, reserveStock, releaseStock, releaseStockForOrder, StockHoldError, HoldLimitError };
