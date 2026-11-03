// Orders › Bring past orders over (plan 23.7): reads the old shop's order file in the browser and turns it into past
// orders for the server's `importPastOrders` action (functions/orderImport.js), which saves them as history only.
// Column names are matched loosely, so the order files of the common shop builders read the same: one line per order,
// or one line per item with the order's number repeated (its totals on the first line). Pure and tested.
import { parseCsv, parseMoney } from "./catalogImport";

export interface PastOrderLine { title: string; quantity: number; price: number; sku?: string }
export interface PastOrder {
  oldRef: string; number: string; orderedAt: string; email?: string; name?: string; currency?: string;
  items: PastOrderLine[]; subtotal?: number; shipping?: number; tax?: number; discount?: number; total: number; refunded?: number;
  /** Sold in another currency and converted at the owner's rate (plan 23.11): what the old shop charged. */
  paidIn?: { currency: string; total: number; rate: number };
}
export interface PastOrderFile {
  orders: PastOrder[];
  skipped: { line: number; reason: string }[];
  problems: string[];
  /** Other currencies in the file, with how many orders each (plan 23.11). */
  foreign: Record<string, number>;
}
/** What is sent once the owner's rates are applied: every amount in Canadian dollars. */
export interface PastOrdersReady {
  orders: PastOrder[];
  /** Orders in a currency with no rate yet, per currency. */
  waiting: Record<string, number>;
  totalSales: number;
  customers: number;
  /** First and last order day, YYYY-MM-DD. */
  from: string;
  to: string;
}

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();

const REF = ["order number", "order id", "order no", "order #", "order name", "order", "number", "id", "name"];
const DATE = ["created at", "order date", "date created", "sale date", "date", "paid at", "order created"];
const EMAIL = ["email", "customer email", "billing email", "buyer email", "email address", "billing email address"];
const NAME = ["billing name", "customer name", "full name", "buyer name", "shipping name", "customer", "name"];
const FIRST = ["billing first name", "buyer first name", "first name", "shipping first name"];
const LAST = ["billing last name", "buyer last name", "last name", "shipping last name"];
const TOTAL = ["total", "order total", "total price", "grand total", "order total amount", "amount"];
const SUBTOTAL = ["subtotal", "order subtotal", "item total", "items total", "subtotal price"];
const SHIPPING = ["shipping", "shipping total", "shipping cost", "order shipping", "shipping amount", "shipping price"];
const TAX = ["taxes", "tax", "taxes total", "tax total", "sales tax", "order tax", "total tax"];
const DISCOUNT = ["discount amount", "discount", "discount total", "cart discount", "order discount", "total discount"];
const CURRENCY = ["currency", "currency code", "order currency"];
const REFUNDED = ["refunded amount", "refund amount", "amount refunded", "refunded", "total refunded"];
const STATUS = ["financial status", "payment status", "order status", "status"];
const CANCELLED = ["cancelled at", "canceled at", "date cancelled"];
const ITEM = ["lineitem name", "line item name", "item name", "product name", "item", "product", "item title", "product title"];
const QTY = ["lineitem quantity", "line item quantity", "item quantity", "quantity", "qty"];
const PRICE = ["lineitem price", "line item price", "item price", "item cost", "unit price", "price"];
const SKU = ["lineitem sku", "line item sku", "item sku", "sku"];

/** Statuses of an order that never became a sale. */
const NOT_A_SALE = /pending|unpaid|void|cancel|fail|abandon|draft|trash|on.?hold|authori[sz]ed|expired|declined/i;

/** The order's moment as an ISO time, or just its day ("2025-06-01") when only that reads; null when nothing does. */
const day = (value: string): string | null => {
  const v = value.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // "2025-06-01 15:30:00 -0400" → "2025-06-01T15:30:00-04:00", which every browser reads.
  const t = Date.parse(v.replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T").replace(/\s*([+-])(\d{2}):?(\d{2})$/, "$1$2:$3").replace(/\s+UTC$/i, "Z"));
  if (!Number.isNaN(t)) return new Date(t).toISOString();
  return /^(\d{4}-\d{2}-\d{2})/.exec(v)?.[1] ?? null;
};

export function readPastOrders(text: string, now = new Date()): PastOrderFile {
  const out: PastOrderFile = { orders: [], skipped: [], problems: [], foreign: {} };
  const table = parseCsv(text);
  if (!table.length) { out.problems.push("This file is empty."); return out; }
  const heads = table[0].map(key);
  const used = new Set<number>();
  const at = (names: string[]) => { for (const n of names) { const i = heads.indexOf(n); if (i >= 0 && !used.has(i)) return i; } return -1; };
  const take = (names: string[]) => { const i = at(names); if (i >= 0) used.add(i); return i; };
  // Order of taking matters: the order number before a customer's "name", item columns before a bare "price".
  const col = {
    ref: take(REF), date: take(DATE), email: take(EMAIL), first: take(FIRST), last: take(LAST), item: take(ITEM), qty: take(QTY),
    sku: take(SKU), subtotal: take(SUBTOTAL), shipping: take(SHIPPING), tax: take(TAX), discount: take(DISCOUNT), refunded: take(REFUNDED),
    total: take(TOTAL), price: take(PRICE), currency: take(CURRENCY), status: take(STATUS), cancelled: take(CANCELLED), name: take(NAME),
  };
  if (col.ref < 0 || col.date < 0 || col.total < 0) {
    out.problems.push("This file doesn't look like a list of orders: it needs each order's number, its date and its total.");
    return out;
  }
  const cell = (row: string[], i: number) => (i >= 0 ? String(row[i] ?? "").trim() : "");
  const num = (row: string[], i: number) => { const v = cell(row, i); if (!v) return undefined; const n = parseMoney(v); return Number.isNaN(n) ? undefined : n; };

  const groups = new Map<string, { line: number; rows: string[][] }>();
  table.slice(1).forEach((row, n) => {
    if (!row.some((c) => String(c ?? "").trim())) return;
    const ref = cell(row, col.ref);
    if (!ref) { out.skipped.push({ line: n + 2, reason: "no order number" }); return; }
    const g = groups.get(ref);
    if (g) g.rows.push(row); else groups.set(ref, { line: n + 2, rows: [row] });
  });

  for (const [ref, { line, rows }] of groups) {
    const first = (i: number) => { for (const r of rows) { const v = cell(r, i); if (v) return v; } return ""; };
    const firstNum = (i: number) => { for (const r of rows) { const v = num(r, i); if (v !== undefined) return v; } return undefined; };
    const skip = (reason: string) => out.skipped.push({ line, reason: `Order ${ref}: ${reason}` });
    const status = first(col.status);
    if (first(col.cancelled) || NOT_A_SALE.test(status)) { skip(`it was ${first(col.cancelled) ? "cancelled" : status.toLowerCase().replace(/[_-]+/g, " ")}, so it never became a sale`); continue; }
    const when = day(first(col.date));
    if (!when) { skip("its date couldn't be read"); continue; }
    if (Date.parse(when) > now.getTime() + 86400000) { skip("its date is in the future"); continue; }
    const total = firstNum(col.total);
    if (total === undefined || total < 0) { skip("its total couldn't be read"); continue; }
    const currency = first(col.currency).toUpperCase();
    if (currency && !/^[A-Z]{3}$/.test(currency)) { skip(`its currency (${currency.slice(0, 20)}) couldn't be read`); continue; }
    const items: PastOrderLine[] = [];
    for (const r of rows) {
      const title = cell(r, col.item);
      if (!title) continue;
      const quantity = Math.max(1, Math.round(num(r, col.qty) ?? 1));
      items.push({ title: title.slice(0, 200), quantity, price: Math.max(0, num(r, col.price) ?? 0), ...(cell(r, col.sku) ? { sku: cell(r, col.sku).slice(0, 80) } : {}) });
    }
    const email = first(col.email).toLowerCase();
    const name = first(col.name) || [first(col.first), first(col.last)].filter(Boolean).join(" ");
    let refunded = firstNum(col.refunded);
    if (refunded === undefined && /refunded/i.test(status) && !/partial/i.test(status)) refunded = total;
    const order: PastOrder = {
      oldRef: `order:${ref}`.slice(0, 200), number: ref.slice(0, 40), orderedAt: when, items: items.slice(0, 100), total,
      ...(email ? { email } : {}), ...(name ? { name: name.slice(0, 100) } : {}), ...(currency ? { currency } : {}),
      ...(firstNum(col.subtotal) !== undefined ? { subtotal: firstNum(col.subtotal) } : {}),
      ...(firstNum(col.shipping) !== undefined ? { shipping: firstNum(col.shipping) } : {}),
      ...(firstNum(col.tax) !== undefined ? { tax: firstNum(col.tax) } : {}),
      ...(firstNum(col.discount) !== undefined ? { discount: Math.abs(firstNum(col.discount)!) } : {}),
      ...(refunded ? { refunded: Math.min(total, refunded) } : {}),
    };
    out.orders.push(order);
    if (currency && currency !== "CAD") out.foreign[currency] = (out.foreign[currency] || 0) + 1;
  }
  if (!out.orders.length && !out.skipped.length) out.problems.push("This file has no orders in it.");
  return out;
}

const cents = (n: number) => Math.round(n * 100) / 100;
/** A usable rate: how many Canadian dollars one unit of the other currency was worth. */
/**
 * Several order files read as one (plan 23.27): old shops that export a year at a time give a press one file per year.
 * An order in two files comes over once (the first file's copy). With more than one file, what was left out and any
 * problem name its file. Pure.
 */
export function mergePastOrderFiles(files: { name: string; file: PastOrderFile }[]): PastOrderFile {
  if (files.length === 1) return files[0].file;
  const out: PastOrderFile = { orders: [], skipped: [], problems: [], foreign: {} };
  const seen = new Set<string>();
  for (const { name, file } of files) {
    for (const p of file.problems) out.problems.push(`${name}: ${p}`);
    for (const s of file.skipped) out.skipped.push({ line: s.line, reason: `${name}, line ${s.line}: ${s.reason}` });
    for (const o of file.orders) {
      if (seen.has(o.oldRef)) continue;
      seen.add(o.oldRef);
      out.orders.push(o);
      if (o.currency && o.currency !== "CAD") out.foreign[o.currency] = (out.foreign[o.currency] || 0) + 1;
    }
  }
  return out;
}

export const goodRate = (r: unknown): r is number => typeof r === "number" && Number.isFinite(r) && r > 0 && r <= 10000;

/**
 * The orders ready to send (plan 23.11): Canadian-dollar orders as they are, and each other-currency order converted at
 * the owner's rate for that currency, keeping what the old shop charged in `paidIn`. Orders in a currency without a
 * rate wait. The preview's figures come from the orders that will be sent.
 */
export function readyToSend(file: PastOrderFile, rates: Record<string, number>): PastOrdersReady {
  const out: PastOrdersReady = { orders: [], waiting: {}, totalSales: 0, customers: 0, from: "", to: "" };
  const emails = new Set<string>();
  for (const o of file.orders) {
    const currency = o.currency || "CAD";
    let order = o;
    if (currency !== "CAD") {
      const rate = rates[currency];
      if (!goodRate(rate)) { out.waiting[currency] = (out.waiting[currency] || 0) + 1; continue; }
      const conv = (n: number) => cents(n * rate);
      const { subtotal, shipping, tax, discount, refunded } = o;
      order = {
        ...o, currency: "CAD", total: conv(o.total), items: o.items.map((i) => ({ ...i, price: conv(i.price) })),
        ...(subtotal !== undefined ? { subtotal: conv(subtotal) } : {}), ...(shipping !== undefined ? { shipping: conv(shipping) } : {}),
        ...(tax !== undefined ? { tax: conv(tax) } : {}), ...(discount !== undefined ? { discount: conv(discount) } : {}),
        ...(refunded !== undefined ? { refunded: conv(refunded) } : {}),
        paidIn: { currency, total: o.total, rate },
      };
    }
    out.orders.push(order);
    out.totalSales += order.total - (order.refunded || 0);
    if (order.email) emails.add(order.email);
    const d = order.orderedAt.slice(0, 10);
    if (!out.from || d < out.from) out.from = d;
    if (!out.to || d > out.to) out.to = d;
  }
  out.customers = emails.size;
  out.totalSales = cents(out.totalSales);
  return out;
}
