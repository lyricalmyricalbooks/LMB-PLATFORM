// Website orders into the stockroom's books, and the books' stock back to the website, from the admin. The same job the
// old stockroom app did whenever it was open (apps/stockroom/src/features/website-link.js), on the same documents:
//   websiteOrders/<id>       the website's Cloud Functions write each paid order there, `pending: true`
//   books/<book>/data/*      a planned order becomes rows in the book (through the admin write layer, WRITING.md)
//   websiteStockFeed/<book>  the count the website follows, published in one transaction with the orders' marks
//   websiteLink/app          when the link was switched on, and when it last brought orders in / sent stock
// Every decision is the stockroom's own (`@stockroom/website-link.js`: planWebsiteOrder, planWebsitePublish). This file
// is the part that lived in the old app's screen code: the planning context, and each planned change applied to a book
// the way its sales ledger does (`features/sales-ledger.js` addSaleToState / voidHistEntry / unvoidHistEntry), minus
// the Google Sheet (WRITING.md rule 11). Pure: no database, no clock unless passed.
import { bookCurrencyCode } from "@stockroom/currency-migration.js";
import { notesWithInvoiceDiscount } from "@stockroom/consignment.js";
import { datedRateKey } from "@stockroom/sale-fx.js";
import {
  appShipmentFor, hasAppTracking, linkedPostageFor, planWebsiteOrder, rowKey, WEBSITE_IMPORT_BATCH,
  type WebAction, type WebDoc, type WebPlan,
} from "@stockroom/website-link.js";

import type { BookState } from "./planSave";
import { newSaleId } from "./recordSale";
import type { StockroomRecords } from "./stockroomData";

type Row = Record<string, any>;
export type Decision = { choice: "same"; key: string } | { choice: "different" };
export type Decisions = Record<string, Record<string, Decision>>;

/** The old app's key for Stripe charge → PaymentIntent, kept in the browser by its payout matching. */
export const STRIPE_CHARGE_PI_KEY = "lm-stripe-charge-pi";

export type PlanSources = {
  records: StockroomRecords;
  /** The whole catalogue as stored, test items included (the old app's BOOKS). */
  catalog: Record<string, Row>;
  /** `settings/modeFlags`: a book in the older store can't be checked inside the publish transaction. */
  flags: Record<string, unknown>;
  /** When the owner switched the link on (`websiteLink/app.importConsentAt`). */
  consentAt: string;
  /** Dated rates, `FROM_CAD@YYYY-MM-DD` → rate. */
  rates: Record<string, number>;
  /** Stripe charge → PaymentIntent, as far as this browser knows. */
  chargeIntents?: Record<string, string>;
};

const inNewStore = (flags: Record<string, unknown>, id: string) => flags.fs_mode_global === true || flags[`fs_mode_${id}`] === true;

/** The context planWebsiteOrder needs, built the way the old app's `planContext` builds it. */
export function planContext(src: PlanSources) {
  const histByBook: Record<string, unknown[]> = {};
  for (const id of Object.keys(src.catalog)) {
    const hist = (src.records.states[id] as Row | undefined)?.hist;
    histByBook[id] = Array.isArray(hist) ? hist : [];
  }
  const charges = src.chargeIntents ?? {};
  return {
    histByBook,
    knowsBook: (id: string) => !!src.catalog[id],
    canWrite: (id: string) => inNewStore(src.flags, id),
    bookCurrencyOf: (id: string) => bookCurrencyCode(src.catalog[id]),
    cadRateFor: (cur: string, day: string) => {
      const rate = Number(src.rates[datedRateKey(String(cur || "").toUpperCase(), "CAD", day)]);
      return rate > 0 ? rate : null;
    },
    piOfCharge: (chargeId: string) => charges[chargeId] || "",
    consentAt: src.consentAt || "",
  };
}

/** The foreign currencies and days the pending orders need a rate for (the old app's `prefetchRates`). */
export function ratesWanted(docs: WebDoc[], catalog: Record<string, Row>, rates: Record<string, number>, limit = 10) {
  const wanted = new Map<string, { cur: string; day: string }>();
  for (const d of docs) {
    const web = d.web || {};
    const day = String(web.paidDay || "").slice(0, 10);
    for (const id of Object.keys(web.books || {})) {
      if (!catalog[id]) continue;
      const cur = bookCurrencyCode(catalog[id]);
      if (cur !== "CAD" && day && !(Number(rates[datedRateKey(cur, "CAD", day)]) > 0)) wanted.set(`${cur}@${day}`, { cur, day });
    }
  }
  return [...wanted.values()].slice(0, limit);
}

const byPaidAt = (a: WebDoc, b: WebDoc) => {
  const x = String(a.web?.paidAt || a.web?.paidDay || "");
  const y = String(b.web?.paidAt || b.web?.paidDay || "");
  return x < y ? -1 : x > y ? 1 : 0;
};

export type ImportPlan = {
  /** Website rehearsal orders: never recorded. */
  tests: WebPlan[];
  /** Orders a person has to decide on. */
  review: WebPlan[];
  /** Books still in the older store, whose orders wait. */
  blocked: string[];
  /** Orders waiting for a book that didn't load. */
  waitingOnLoad: number;
  /** Ready now, in paid order, at most one batch. */
  go: WebPlan[];
  /** Ready but left for the next run. */
  more: number;
};

/** Every pending order planned, the way the old app's `importOnce` plans them. */
export function planImport(docs: WebDoc[], src: PlanSources, decisions: Decisions = {}): ImportPlan {
  const all = docs.filter((d) => d && d.web);
  const ctx = planContext(src);
  const tests = all.filter((d) => d.web!.test === true).map((doc) => planWebsiteOrder(doc, ctx));
  const real = all.filter((d) => d.web!.test !== true).sort(byPaidAt);
  const waiting: WebDoc[] = [];
  const candidates: WebDoc[] = [];
  // A book that failed to load is not its real data: leave its orders waiting.
  for (const d of real) {
    if (Object.keys(d.web!.books || {}).some((id) => src.catalog[id] && !src.records.states[id])) waiting.push(d);
    else candidates.push(d);
  }
  const plans = candidates.map((doc) => planWebsiteOrder(doc, {
    ...ctx,
    decisions: { ...(doc.imported?.decisions || {}), ...(decisions[String(doc.id)] || {}) },
  }));
  const ready = plans.filter((p) => p.status === "ready");
  const go = ready.slice(0, WEBSITE_IMPORT_BATCH);
  return {
    tests,
    review: plans.filter((p) => p.status === "review"),
    blocked: [...new Set(plans.filter((p) => p.status === "blocked").flatMap((p) => p.blocked))],
    waitingOnLoad: waiting.length,
    go,
    more: ready.length - go.length,
  };
}

/** Real pending orders not yet brought in at their current version, with their books (the old app's `heldOrders`). */
export function heldOrders(docs: WebDoc[]) {
  return docs
    .filter((d) => d && d.web && d.web.test !== true)
    .filter((d) => !(d.imported && d.imported.hash && d.imported.hash === d.web!.hash))
    .map((d) => ({ orderId: String(d.id), books: Object.keys(d.web!.books || {}) }));
}

/** The mark the publish transaction checks for one order once its rows are saved. */
export const markFor = (plan: WebPlan) => ({ orderId: plan.orderId, hash: plan.hash, effect: plan.effect, decisions: plan.decisions || {}, replyAt: plan.replyAt });

/** The planned changes per book, so each book is saved once. */
export function actionsByBook(go: WebPlan[]) {
  const out = new Map<string, Array<{ action: WebAction; plan: WebPlan }>>();
  for (const plan of go) for (const action of plan.actions) {
    if (!out.has(action.bookId)) out.set(action.bookId, []);
    out.get(action.bookId)!.push({ action, plan });
  }
  return out;
}

// ── One book, as its sales ledger changes it ───────────────────────────────────────────────────────────────────────

const num = (v: unknown) => Number(v) || 0;
const stats = (s: Row) => (s.chStats && typeof s.chStats === "object" ? s.chStats : (s.chStats = {}));

/** addSaleToState for a website row (`enteredBy: "Website"`, stamped now). Returns the row. */
function addWebsiteSale(s: Row, book: Row, row: Row, now: Date) {
  const { num: orderNum = "", chan, qty, price, notes = "", payment = null, date, sheetsId, ...extra } = row;
  const q = num(qty), p = num(price);
  s.stock = Math.max(0, num(s.stock) - q);
  s.sold = num(s.sold) + q;
  s.revenue = num(s.revenue) + q * p;
  const ch = stats(s);
  if (!ch[chan]) ch[chan] = { txns: 0, units: 0, revenue: 0 };
  ch[chan].txns++; ch[chan].units += q; ch[chan].revenue += q * p;
  const saved = {
    recordedAt: now.toISOString(),
    ...extra,
    num: orderNum, chan, qty, price, after: s.stock, notes: notesWithInvoiceDiscount(s.invoices, orderNum, notes),
    date, payment: payment || null, enteredBy: "Website", sheetsId: sheetsId || newSaleId(now.getTime()), cur: bookCurrencyCode(book),
  };
  s.hist.unshift(saved);
  return saved;
}

/** voidHistEntry: copies back, money and channel totals out, the row marked (never removed). */
export function voidRow(s: Row, h: Row, now: number) {
  let pendingRev = false;
  if (h.artistPending) {
    pendingRev = true;
    const transfers: Row[] = Array.isArray(s.artistTransfers) ? s.artistTransfers : [];
    const i = transfers.findIndex((x) => (h.sheetsId && x.sheetsId === h.sheetsId) || (x.num === h.num && x.qty === h.qty));
    if (i !== -1) h.voidedTransfer = transfers.splice(i, 1)[0];
  }
  s.stock = num(s.stock) + num(h.qty);
  if (!h.gratuity) {
    s.sold = Math.max(0, num(s.sold) - num(h.qty));
    if (!pendingRev) s.revenue = Math.max(0, num(s.revenue) - num(h.qty) * num(h.price));
  }
  const ch = stats(s)[h.chan];
  if (ch) {
    ch.txns = Math.max(0, ch.txns - 1);
    ch.units = Math.max(0, ch.units - num(h.qty));
    if (!pendingRev) ch.revenue = Math.max(0, ch.revenue - num(h.qty) * num(h.price));
    if (ch.txns <= 0) delete stats(s)[h.chan];
  }
  if (h.directToArtist || h.enteredBy === "Artist") s.authorStock = (Number.isFinite(s.authorStock) ? s.authorStock : 0) + num(h.qty);
  h.voided = true;
  h.voidedAt = now;
}

/** unvoidHistEntry for a website row: the sale counts again. */
export function unvoidRow(s: Row, h: Row) {
  s.stock = Math.max(0, num(s.stock) - num(h.qty));
  if (!h.gratuity) {
    s.sold = num(s.sold) + num(h.qty);
    if (!h.artistPending) s.revenue = num(s.revenue) + num(h.qty) * num(h.price);
  }
  const all = stats(s);
  if (!all[h.chan]) all[h.chan] = { txns: 0, units: 0, revenue: 0 };
  all[h.chan].txns++;
  all[h.chan].units += num(h.qty);
  if (!h.artistPending) all[h.chan].revenue += num(h.qty) * num(h.price);
  if (h.voidedTransfer) {
    s.artistTransfers = Array.isArray(s.artistTransfers) ? s.artistTransfers : [];
    s.artistTransfers.push(h.voidedTransfer);
    delete h.voidedTransfer;
  }
  h.voided = false;
  delete h.voidedAt;
  delete h.voidedReason;
}

/** applyRowPatch: a refund voids, a refund the bank turned back counts again, anything else is copied over. */
function patchRow(s: Row, h: Row, patch: Row, now: number) {
  const { voided, ...rest } = patch;
  if (voided === true && !h.voided) {
    voidRow(s, h, now);
    Object.assign(h, rest, { voidedReason: "Refunded on the website" });
    return;
  }
  if (voided === false && h.voided) {
    Object.assign(h, rest);
    unvoidRow(s, h);
    return;
  }
  if (!h.voided && Object.prototype.hasOwnProperty.call(rest, "qty")) {
    // Only matters for an item with no print run, whose on-hand is a running count.
    s.stock = Math.max(0, num(s.stock) - (num(rest.qty) - num(h.qty)));
  }
  Object.assign(h, rest);
}

export type Counted = "added" | "linked" | "updated" | "";

/**
 * One planned change applied to a book's private copy, exactly as the old app's `applyAction` applies it to its own
 * copy. Runs inside `saveBookState`'s `mutate`, so it always sees what is stored now: a second device (or a retry)
 * never adds the same order twice.
 */
export function applyWebsiteAction(state: BookState, book: Row, action: WebAction, plan: WebPlan, now = new Date()): Counted {
  const s = state as Row;
  if (!Array.isArray(s.hist)) return "";
  if (action.kind === "new") {
    const row = (action as { row: Row }).row;
    if (s.hist.some((h: Row) => h && (h.uid === row.uid || h.webOrderId === plan.orderId))) return "";
    if (row.voided) {
      // Refunded with every copy back before it was ever brought in: kept as a record, moves nothing.
      s.hist.unshift({ recordedAt: now.toISOString(), enteredBy: "Website", voidedAt: now.getTime(), ...row, voidedReason: "Refunded on the website" });
      return "added";
    }
    addWebsiteSale(s, book, row, now);
    return "added";
  }
  if (action.kind === "replace") {
    const h = s.hist.find((r: Row) => rowKey(r) === action.key);
    if (!h || h.voided) return "";
    h.webReplacedBy = (action as { replacedBy: string }).replacedBy;
    voidRow(s, h, now.getTime());
    h.voidedReason = "Same sale as a website order — the website’s copy replaces it";
    return "linked";
  }
  const patch = (action as { patch?: Row | null }).patch;
  if (!patch) return "";
  const a = action as { uid?: string; key?: string };
  const h = action.kind === "own"
    ? s.hist.find((r: Row) => r && (r.uid === a.uid || r.webOrderId === plan.orderId))
    : s.hist.find((r: Row) => rowKey(r) === a.key);
  if (!h) return "";
  patchRow(s, h, patch, now.getTime());
  return action.kind === "adopt" ? "linked" : "updated";
}

// ── Labels bought or linked in the stockroom, sent back to the website ─────────────────────────────────────────────

/** Orders whose label (bought or linked in the stockroom) the website hasn't answered yet (the old `shipmentCandidates`). */
export function shipmentCandidates(records: StockroomRecords, sent: Record<string, string> = {}) {
  const expenses = (records.taxCenter?.businessExpenses as unknown[]) || [];
  const byOrder = new Map<string, Row[]>();
  for (const state of Object.values(records.states)) for (const h of ((state as Row).hist || []) as Row[]) {
    if (!h || !h.webOrderId) continue;
    if (!byOrder.has(h.webOrderId)) byOrder.set(h.webOrderId, []);
    byOrder.get(h.webOrderId)!.push(h);
  }
  const out: Array<{ orderId: string; linkedPostage: Row | null }> = [];
  for (const [orderId, rows] of byOrder) {
    if (!rows.some((r) => !r.voided && hasAppTracking(r))) continue;
    const linkedPostage = linkedPostageFor(rows[0].num, expenses);
    const shipment = appShipmentFor(rows, linkedPostage, null);
    if (!shipment) continue;
    if (rows.some((r) => r.webShipment && r.webShipment.hash === shipment.hash)) continue;
    if (sent[orderId] === shipment.hash) continue;
    out.push({ orderId, linkedPostage });
    if (out.length >= WEBSITE_IMPORT_BATCH) break;
  }
  return out;
}
