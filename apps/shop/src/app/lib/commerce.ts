import { ga4BookItem, ga4Event, purchaseEvent } from "./ga4";
import { cleanAcquisition } from "./visitSource";
import { inEditorPreview, trackingAllowed } from "./trackingGuard";
import { analyticsKey, cleanSearchTerm, deviceOf } from "./analyticsKeys";
import { orderDay } from "./shopDay";
import { lite } from "../../lib/lite";

export type FulfillmentStatus =
  | "pending_payment"
  | "paid"
  | "processing"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "refunded";

export const FULFILLMENT_FLOW: FulfillmentStatus[] = [
  "pending_payment",
  "paid",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
];

export const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  pending_payment: "Awaiting Payment",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

// ──────────────────────────────────────────────────────────────
// Order helpers
// ──────────────────────────────────────────────────────────────
export const orderApi = {
  setFulfillmentStatus: async (
    orderId: string,
    status: FulfillmentStatus,
    note?: string,
  ) => {
    const { doc, updateDoc, liteDb } = await lite();
    await updateDoc(doc(liteDb, "orders", orderId), {
      fulfillmentStatus: status,
      updatedAt: new Date().toISOString(),
    });
    // Admin-only path: load the admin API on demand so the shopper bundle never carries it.
    const { adminApi } = await import("../admin/api");
    await adminApi.addOrderNote(
      orderId,
      note || `Fulfillment status changed to ${FULFILLMENT_LABELS[status]}.`,
    );
  },

  bulkSetStatus: async (orderIds: string[], status: FulfillmentStatus) => {
    const { doc, updateDoc, liteDb } = await lite();
    await Promise.all(
      orderIds.map(id =>
        updateDoc(doc(liteDb, "orders", id), {
          fulfillmentStatus: status,
          updatedAt: new Date().toISOString(),
        }),
      ),
    );
  },

  /**
   * Orders as CSV for bookkeeping and sales-tax filing. By default only money that
   * changed hands (paid, refunded) is exported; abandoned card attempts stay out.
   * Amounts are in CAD (the shop's base currency); ChargedAmount/ChargedCurrency
   * show what the customer actually paid when that was USD or EUR.
   */
  exportToCsv: (orders: any[], { paidOnly = true }: { paidOnly?: boolean } = {}): string => {
    const header = [
      "OrderID", "Date", "PaidAt", "Customer", "Email",
      "Country", "Province", "PostalCode",
      "Status", "PaymentStatus", "PaymentMethod", "FulfillmentStatus",
      "Subtotal", "Discount", "DiscountCode", "Shipping", "Tax", "Total", "Currency",
      "ChargedAmount", "ChargedCurrency",
      "RefundedAt", "RefundAmount", "RefundCurrency",
      "TrackingCarrier", "TrackingNumber", "ItemCount",
      // The Toronto calendar day the order was placed: Date/PaidAt are UTC moments, so an evening order
      // (and the last evening of a month or tax period) would otherwise land on the next day.
      "ShopDate", "PaidShopDate",
      // How the shopper found the shop (lib/visitSource.ts); older orders have only Source (referralSource).
      "Source", "Medium", "Campaign", "ReferringPage", "LandingPage",
    ];
    const money = (v: any) => (v === undefined || v === null || v === "" ? "" : (Number(v) || 0).toFixed(2));
    const kept = orders.filter(o => o.isTest !== true
      && (!paidOnly || ["paid", "refunded", "refund_pending"].includes(o.paymentStatus)));
    const rows = kept.map(o => {
      const address = o.customer?.address || o.customer?.billingAddress || {};
      const rate = Number(o.exchangeRate);
      // The card/PayPal payment was created for exactly expectedAmountMinor in expectedCurrency.
      const exact = o.expectedAmountMinor != null && Number.isFinite(Number(o.expectedAmountMinor)) && o.expectedCurrency;
      const charged = exact ? money(Number(o.expectedAmountMinor) / 100)
        : o.checkoutCurrency && o.checkoutCurrency !== "CAD" && rate > 0 ? money(Number(o.total || 0) * rate) : money(o.total);
      return [
        o.orderId || o.id,
        o.createdAt || "",
        o.paidAt || "",
        (o.customer?.name || "").replace(/[",\n]/g, " "),
        o.customer?.email || "",
        address.country || "",
        address.state || "",
        address.zip || "",
        o.status || "",
        o.paymentStatus || "",
        o.paymentMethod || "",
        o.fulfillmentStatus || (o.status === "completed" ? "delivered" : o.paymentStatus === "paid" ? "paid" : ""),
        money(o.subtotal),
        money(o.discount),
        o.appliedDiscount?.code || "",
        money(o.shipping),
        money(o.tax),
        money(o.total),
        "CAD",
        charged,
        exact ? String(o.expectedCurrency).toUpperCase() : o.checkoutCurrency || "CAD",
        o.refundedAt || "",
        // A partial refund (Stripe/PayPal Dashboard) keeps the order paid and only records refundedAmountMinor.
        o.refund?.amount != null ? money(o.refund.amount) : Number(o.refundedAmountMinor) > 0 ? money(Number(o.refundedAmountMinor) / 100) : "",
        o.refund?.currency || (Number(o.refundedAmountMinor) > 0 ? String(o.expectedCurrency || o.checkoutCurrency || "CAD").toUpperCase() : ""),
        o.trackingCarrier || "",
        o.trackingNumber || "",
        (o.items || []).reduce((acc: number, i: any) => acc + (i.quantity || 0), 0),
        orderDay(o.createdAt),
        o.paidAt ? orderDay(o.paidAt) : "",
        cleanAcquisition(o.acquisition)?.source || o.referralSource || "",
        cleanAcquisition(o.acquisition)?.medium || "",
        cleanAcquisition(o.acquisition)?.campaign || "",
        cleanAcquisition(o.acquisition)?.referrer || "",
        cleanAcquisition(o.acquisition)?.landingPage || "",
      ];
    });
    // A cell starting with = + - @ is run as a formula by spreadsheet apps: quote it as text.
    const cell = (v: any) => {
      const text = String(v);
      const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    return [header, ...rows].map(r => r.map(cell).join(",")).join("\n");
  },

  downloadCsv: (filename: string, csv: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// ──────────────────────────────────────────────────────────────
// Abandoned cart tracking
// ──────────────────────────────────────────────────────────────
export const abandonedCartApi = {
  upsert: async (
    cartKey: string,
    payload: {
      email: string;
      items: any[];
      subtotal: number;
      customer?: any;
    },
  ) => {
    if (!payload.email) return;
    // Lower-cased (also inside `customer`) so privacy export/erase and opt-outs match whatever was typed.
    payload = { ...payload, email: payload.email.trim().toLowerCase(), ...(payload.customer ? { customer: { ...payload.customer, email: String(payload.customer.email || "").trim().toLowerCase() } } : {}) };
    const { doc, getDoc, setDoc, liteDb } = await lite();
    const ref = doc(liteDb, "abandoned-carts", cartKey);
    const now = new Date().toISOString();
    // createdAt/recovered are set once: later saves must not reset the cart's
    // age or reopen a cart that was already bought (firestore.rules forbids that).
    const existing = await getDoc(ref).catch(() => null);
    if (existing?.exists() && existing.data()?.recovered === true) return;
    await setDoc(
      ref,
      {
        ...payload,
        cartKey,
        updatedAt: now,
        ...(existing?.exists() ? {} : { recovered: false, createdAt: now }),
      },
      { merge: true },
    );
  },

  markRecovered: async (cartKey: string) => {
    try {
      const { doc, updateDoc, liteDb } = await lite();
      await updateDoc(doc(liteDb, "abandoned-carts", cartKey), {
        recovered: true,
        recoveredAt: new Date().toISOString(),
      });
    } catch {}
  },

  list: async (max = 100) => {
    const { collection, getDocs, limit, orderBy, query, liteDb } = await lite();
    const snap = await getDocs(
      query(
        collection(liteDb, "abandoned-carts"),
        orderBy("updatedAt", "desc"),
        limit(max),
      ),
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
};

// ──────────────────────────────────────────────────────────────
// Funnel + traffic analytics
// ──────────────────────────────────────────────────────────────
// Everything lands in today's `analytics/<date>` doc as `1` merges, which Firestore applies itself, so
// shoppers arriving at the same moment never overwrite each other's counts. Each call checks consent, the Studio
// preview and the admin session (see trackingGuard). Best-effort: tracking must never break browsing or checkout.
const dayKey = () => new Date().toISOString().split("T")[0];
const mapKey = analyticsKey;

/**
 * One counter to add: `field.key` (or the top-level `visits`, key "") on day `day`. firestore.rules decides what may
 * share a write (see planCounterWrites).
 */
export type CounterBump = { day: string; field: string; key: string; n: number };
export type CounterWrite = { day: string; counts: Record<string, Record<string, number>> };

/** Maps whose keys firestore.rules lists one by one: any number of keys per write, each up by at most one. */
const FIXED_KEY_FIELDS = new Set(["funnel", "devices", "checkout"]);
const stepsByOne = (field: string) => field === "visits" || FIXED_KEY_FIELDS.has(field);
/**
 * Rough rules-engine cost of one changed field: a fixed-key map runs one `stepOk` per listed key (funnel 4, devices 3,
 * checkout 7), a free-key map one `freeMapStepOk`, visits nothing extra. The Firestore emulator refused writes at
 * about 16 (e.g. checkout + funnel + devices + two free maps; funnel + devices + nine free maps), so a write is kept
 * at MAX_WRITE_RULE_COST or less. scripts/firestore-rules-emulator.mjs checks the heaviest allowed shapes.
 */
const RULE_COST: Record<string, number> = { visits: 0, funnel: 4, devices: 3, checkout: 7 };
export const ruleCost = (field: string) => RULE_COST[field] ?? 1;
export const MAX_WRITE_RULE_COST = 12;

/**
 * Packs queued counters into as few writes as firestore.rules' analytics match accepts, keeping their order:
 * - `visits` and each fixed-key map entry (funnel, devices, checkout) rise by at most 1 per write;
 * - a free-key map (sources, searches, noResults, bookViews, categoryViews, bookAdds, wishlistAdds, unbuyableViews,
 *   vitals) may change ONE entry per write (repeats of that same entry are added together, which the rules allow);
 * - each day is its own document;
 * - a write stays inside the rules engine's budget (ruleCost, MAX_WRITE_RULE_COST).
 * Nothing is dropped: a counter that fits no planned write starts a new one. Pure, so tests can check every plan
 * against the rules' text.
 */
export function planCounterWrites(bumps: CounterBump[]): CounterWrite[] {
  const writes: CounterWrite[] = [];
  for (const b of bumps) {
    if (!b.day || !b.field || !(b.n > 0)) continue;
    // A fixed-key step of more than one (never sent today) becomes single steps.
    const steps = stepsByOne(b.field) ? Array.from({ length: Math.max(1, Math.floor(b.n)) }, () => 1) : [b.n];
    for (const n of steps) {
      const fits = (w: CounterWrite) => {
        if (w.day !== b.day) return false;
        const have = w.counts[b.field];
        if (!have) return Object.keys(w.counts).reduce((sum, f) => sum + ruleCost(f), 0) + ruleCost(b.field) <= MAX_WRITE_RULE_COST;
        if (stepsByOne(b.field)) return !(b.key in have);
        const keys = Object.keys(have);
        return keys.length === 1 && keys[0] === b.key;
      };
      let w = writes.find(fits);
      if (!w) { w = { day: b.day, counts: {} }; writes.push(w); }
      const have = (w.counts[b.field] ||= {});
      have[b.key] = (have[b.key] || 0) + n;
    }
  }
  return writes;
}

/** How long counters wait to share a write: a page's signals (visit + source/device, book view + its categories) arrive together. */
export const COUNTER_FLUSH_MS = 300;

type Queued = CounterBump & { done: () => void };
let queue: Queued[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushOnHideInstalled = false;

/** One planned write: `visits` is a top-level number, the rest are maps of increment(). */
async function writeCounters(w: CounterWrite) {
  const { doc, increment, setDoc, liteDb } = await lite();
  const today = w.day;
  const patch: Record<string, unknown> = {};
  for (const [field, keys] of Object.entries(w.counts)) {
    patch[field] = field === "visits"
      ? increment(keys[""] || 0)
      : Object.fromEntries(Object.entries(keys).map(([key, n]) => [key, increment(n)]));
  }
  await setDoc(doc(liteDb, "analytics", today), { date: today, ...patch }, { merge: true });
}

/** Sends everything queued: one write per planned group; a group the rules refuse is retried one counter at a time. */
export async function flushCounters(): Promise<void> {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  const batch = queue;
  queue = [];
  if (!batch.length) return;
  try {
    await Promise.all(planCounterWrites(batch).map(async w => {
      try {
        await writeCounters(w);
      } catch (e: any) {
        // A combined write is refused as a whole (e.g. one map already at its size cap): send each counter alone so
        // the others still count, exactly as they did before counters were combined.
        const singles = Object.entries(w.counts).flatMap(([field, keys]) => Object.entries(keys).map(([key, n]) => ({ field, key, n })));
        if (singles.length < 2 || e?.code !== "permission-denied") return;
        await Promise.all(singles.map(s => writeCounters({ day: w.day, counts: { [s.field]: { [s.key]: s.n } } }).catch(() => { /* best-effort */ })));
      }
    }));
  } catch {
    // best-effort: tracking must never break browsing or checkout
  } finally {
    for (const q of batch) q.done();
  }
}

/** Queues counters for `day`; settles once they were sent (or given up on). */
function queueCounters(day: string, counts: Record<string, Record<string, number>>): Promise<void> {
  return new Promise(resolve => {
    let left = 0;
    const done = () => { if (--left <= 0) resolve(); };
    for (const [field, keys] of Object.entries(counts)) {
      for (const [key, n] of Object.entries(keys)) { left++; queue.push({ day, field, key, n, done }); }
    }
    if (!left) { resolve(); return; }
    // Start loading Firestore Lite now, so a flush on leaving the page doesn't wait on the import.
    void lite().catch(() => { /* retried at flush */ });
    if (!flushOnHideInstalled && typeof window !== "undefined" && typeof window.addEventListener === "function") {
      flushOnHideInstalled = true;
      // Leaving or hiding the page sends what is waiting at once, so a quick exit doesn't lose the count.
      const now = () => { void flushCounters(); };
      window.addEventListener("pagehide", now);
      try {
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") now(); });
      } catch { /* no document */ }
    }
    let hidden = false;
    try { hidden = typeof document !== "undefined" && document.visibilityState === "hidden"; } catch { hidden = false; }
    // Counted while the page is already hidden (page speed is sent on leaving): no waiting, the tab may be closing.
    if (hidden) { void Promise.resolve().then(flushCounters); return; }
    if (!flushTimer) flushTimer = setTimeout(() => { void flushCounters(); }, COUNTER_FLUSH_MS);
  });
}

/**
 * Adds each count to today's analytics doc (`{ funnel: { view: 1 } }` → increment(1) on funnel.view). Counts from
 * the same moment share as few writes as firestore.rules allows (planCounterWrites).
 */
async function bump(counts: Record<string, Record<string, number>>) {
  if (!(await trackingAllowed())) return;
  await queueCounters(dayKey(), counts);
}

/** One visit on today's counter, sharing a write with the session's source/device. Callers check trackingAllowed first. */
export function queueVisit(): Promise<void> {
  return queueCounters(dayKey(), { visits: { "": 1 } });
}

/** True the first time `key` is seen this browser session (so reloads and back-and-forth don't double count). */
function firstThisSession(key: string): boolean {
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, "1");
  } catch {
    // storage unavailable: count it
  }
  return true;
}

/**
 * Whether a completed purchase should be added to the funnel: never a sandbox/test order, and only once per
 * order however often the confirmation page is reloaded or reopened (remembered in this browser).
 */
export function shouldCountPurchase(orderId: string, order: any, storage: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  if (!orderId || order?.isTest === true || order?.sandboxPayment === true) return false;
  const key = `fm_purchase_counted_${orderId}`;
  try {
    if (storage?.getItem(key)) return false;
    storage?.setItem(key, "1");
  } catch {
    // storage unavailable: count it
  }
  return true;
}

/**
 * Checkout steps after "Started checkout" (funnel.checkout_start) and before "Bought" (funnel.purchase): typed an
 * email, finished the address, saw the delivery price, pressed Pay. The last three are why a press of Pay didn't
 * pay: details missing, the card refused, or another failure. firestore.rules lists the same keys.
 */
export const CHECKOUT_STEPS = ["email", "address", "delivery", "pay", "fields", "declined", "failed"] as const;
export type CheckoutStep = (typeof CHECKOUT_STEPS)[number];

export const funnelApi = {
  track: async (event: "view" | "add_to_cart" | "checkout_start" | "purchase") => {
    await bump({ funnel: { [event]: 1 } });
  },

  /** "Started checkout": once per browser session, not once per page load of the checkout. */
  trackCheckoutStart: async () => {
    if (typeof window !== "undefined" && !firstThisSession(`fm_checkout_start_${dayKey()}`)) return;
    await bump({ funnel: { checkout_start: 1 } });
  },

  /** "Completed purchase": once per real order (see shouldCountPurchase). */
  trackPurchase: async (orderId: string, order?: any) => {
    let storage: Storage | null = null;
    try { storage = typeof window !== "undefined" ? window.localStorage : null; } catch { storage = null; }
    if (!shouldCountPurchase(orderId, order, storage)) return;
    // Google Analytics revenue is money received: a manual (e-Transfer/cash) order still waiting for payment isn't sent.
    const purchase = order?.paymentStatus === "paid" ? purchaseEvent(orderId, order) : null;
    if (purchase) ga4Event("purchase", purchase);
    await bump({ funnel: { purchase: 1 } });
  },

  trackCategory: async (categoryName: string) => {
    const key = mapKey((categoryName || "").toUpperCase());
    if (!key || inEditorPreview()) return;
    await bump({ categoryViews: { [key]: 1 } });
  },

  /** Where this session came from and on what kind of screen — once per session, in its own write. */
  trackSession: async () => {
    if (typeof window === "undefined" || !firstThisSession(`fm_session_${dayKey()}`)) return;
    let source = "direct";
    try { source = mapKey((window.sessionStorage.getItem("referral_source") || "direct").toLowerCase()) || "direct"; } catch { /* direct */ }
    await bump({ sources: { [source]: 1 }, devices: { [deviceOf(window.innerWidth)]: 1 } });
  },

  /** A product page opened — once per book per session. */
  trackProductView: async (bookId: string) => {
    if (!bookId || typeof window === "undefined" || !firstThisSession(`fm_bookview_${bookId}`)) return;
    await bump({ bookViews: { [mapKey(bookId)]: 1 } });
  },

  /** A book put in the bag (any button: book page, cards, wishlist, bag suggestion) — once per book per session. */
  trackBookAdd: async (bookId: string) => {
    if (!bookId || typeof window === "undefined" || !firstThisSession(`fm_bookadd_${bookId}`)) return;
    await bump({ bookAdds: { [mapKey(bookId)]: 1 } });
  },

  /** A book saved to the wishlist — once per book per session (taking it off again isn't counted). */
  trackWishlistAdd: async (bookId: string) => {
    if (!bookId || typeof window === "undefined" || !firstThisSession(`fm_wishadd_${bookId}`)) return;
    ga4Event("add_to_wishlist", { items: [ga4BookItem(bookId)] });
    await bump({ wishlistAdds: { [mapKey(bookId)]: 1 } });
  },

  /** A book page opened while the book couldn't be bought (sold out or coming soon) — demand you can't serve yet. */
  trackUnavailableView: async (bookId: string) => {
    if (!bookId || typeof window === "undefined" || !firstThisSession(`fm_unbuyable_${bookId}`)) return;
    await bump({ unbuyableViews: { [mapKey(bookId)]: 1 } });
  },

  /** How far a shopper got in checkout (CHECKOUT_STEPS) — each step once per session and day. */
  trackCheckoutStep: async (step: CheckoutStep) => {
    if (!CHECKOUT_STEPS.includes(step) || typeof window === "undefined" || !firstThisSession(`fm_checkout_${step}_${dayKey()}`)) return;
    await bump({ checkout: { [step]: 1 } });
  },

  /** Real page speed for this visit (lib/pageSpeed.ts), one combined entry per session. */
  trackPageSpeed: async (key: string) => {
    if (!/^(phone|computer)_[gopn]{3}$/.test(key) || typeof window === "undefined" || !firstThisSession("fm_pagespeed")) return;
    await bump({ vitals: { [key]: 1 } });
  },

  /** What shoppers type into search, and whether it found anything. Personal-looking terms are never stored. */
  trackSearch: async (rawTerm: string, resultCount: number) => {
    const term = cleanSearchTerm(rawTerm);
    if (!term || typeof window === "undefined") return;
    const field = resultCount > 0 ? "searches" : "noResults";
    if (!firstThisSession(`fm_search_${field}_${term}`)) return;
    // Google's own search report reads `search_term`; a search that found nothing is its own event so it shows
    // in Reports › Engagement › Events without setting up a custom dimension.
    ga4Event(resultCount > 0 ? "search" : "search_no_results", { search_term: term });
    await bump({ [field]: { [term]: 1 } });
  },
};
