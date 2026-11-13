// Orders › Bring past orders over (plan 23.7): reads the old shop's order file in the browser and turns it into past
// orders for the server's `importPastOrders` action (functions/orderImport.js), which saves them as history only.
// Column names are matched loosely, so the order files of the common shop builders read the same: one line per order,
// or one line per item with the order's number repeated (its totals on the first line). Pure and tested.
import { parseCsv, parseMoney } from "./catalogImport";
import { shopDate } from "../../shared/preorder";
import { SHOP_CURRENCY } from "./moneySign";

export interface PastOrderLine { title: string; quantity: number; price: number; sku?: string }
export interface PastOrder {
  oldRef: string; number: string; orderedAt: string; email?: string; name?: string; currency?: string;
  items: PastOrderLine[]; subtotal?: number; shipping?: number; tax?: number; discount?: number; total: number; refunded?: number;
  /** Sold in another currency and converted at the owner's rate (plan 23.11): what the old shop charged. */
  paidIn?: { currency: string; total: number; rate: number };
  /** The name of the file it came from (plan 23.33), shown on the order's page. */
  file?: string;
}
export interface PastOrderFile {
  orders: PastOrder[];
  skipped: { line: number; reason: string }[];
  problems: string[];
  /** Other currencies in the file, with how many orders each (plan 23.11). */
  foreign: Record<string, number>;
}
/** What is sent once the owner's rates are applied: every amount in the shop's own currency. */
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

const REF = ["order number", "order id", "order no", "order #", "order", "order name", "number", "transaction id", "id", "name"];
const DATE = ["created at", "order date", "date created", "sale date", "date", "paid at", "order created"];
const EMAIL = ["email", "customer email", "billing email", "buyer email", "buyer s email", "recipient email", "email address", "billing email address"];
const NAME = ["billing name", "customer name", "full name", "buyer name", "billing customer", "recipient name", "shipping name", "customer", "name"];
const FIRST = ["billing first name", "buyer first name", "first name", "shipping first name"];
const LAST = ["billing last name", "buyer last name", "last name", "shipping last name"];
// "total collected" and "net sales" last: a till's transactions file and a store-analytics list have no other total.
const TOTAL = ["total", "order total", "total price", "grand total", "order total amount", "order total inc tax", "amount", "total collected", "net sales"];
const SUBTOTAL = ["subtotal", "order subtotal", "items total", "subtotal price", "subtotal ex tax", "order value"];
const SHIPPING = ["shipping", "shipping total", "shipping cost", "order shipping", "shipping amount", "shipping price", "order shipping price", "shipping cost ex tax", "shipping rate", "total shipping"];
const TAX = ["taxes", "tax", "taxes total", "tax total", "sales tax", "order tax", "total tax", "order tax total", "order sales tax"];
const DISCOUNT = ["discount amount", "discount", "discount total", "cart discount", "order discount", "total discount", "discounts"];
const CURRENCY = ["currency", "currency code", "order currency", "order currency code"];
const REFUNDED = ["refunded amount", "refund amount", "amount refunded", "refunded", "total refunded", "order refunded amount", "partial refunds"];
const STATUS = ["financial status", "payment status", "order status", "status", "fulfillment status"];
const CANCELLED = ["cancelled at", "canceled at", "date cancelled"];
/** "items" and "product details" hold every item of the order in one cell; see `packedItems`. */
const ITEM = ["lineitem name", "line item name", "item name", "product name", "item", "product", "item title", "product title", "product s", "items", "product details"];
const QTY = ["lineitem quantity", "line item quantity", "item quantity", "quantity", "qty", "items sold"];
const PRICE = ["lineitem price", "line item price", "item price", "item cost", "unit price", "price"];
const SKU = ["lineitem sku", "line item sku", "item sku", "sku"];
/** What one line came to, for a file of order lines that gives no order total. */
const LINE_TOTAL = ["item total price", "item total"];
/** The total after refunds, in files that give it beside the total ("--" when nothing changed). */
const ADJUSTED = ["adjusted order total"];

/** Statuses of an order that never became a sale. */
const NOT_A_SALE = /pending|unpaid|not paid|awaiting|incomplete|void|cancel|fail|abandon|draft|trash|on.?hold|authori[sz]ed|expired|declined/i;

const NUMERIC_DATE = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4}|\d{2})\b/;
/** A file writes its numeric dates day first when one of them can only be read that way ("25/08/2025"). */
const dayFirstIn = (values: string[]) => values.some((v) => { const n = NUMERIC_DATE.exec(v.trim()); return !!n && Number(n[1]) > 12; });

/**
 * Every item of an order written in one cell, in the two ways order files do it:
 *   "product_name:Book|quantity:2|price:20.00;product_name:Zine|…" and
 *   "Product Qty: 2, Product SKU: PB-1, Product Name: Book, Product Unit Price: 20.00|Product Qty: 1, …".
 * Null when the cell is a plain item name.
 */
export function packedItems(text: string): PastOrderLine[] | null {
  const pairs = /\bproduct_name:/.test(text);
  if (!pairs && !/\bProduct Name:/.test(text)) return null;
  const fields = (part: string): Record<string, string> => {
    const out: Record<string, string> = {};
    if (pairs) {
      for (const f of part.split("|")) { const i = f.indexOf(":"); if (i > 0) out[f.slice(0, i).trim().toLowerCase()] = f.slice(i + 1).trim(); }
      return out;
    }
    const marks = [...part.matchAll(/Product ([A-Za-z ]+?):\s*/g)];
    marks.forEach((m, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].index : undefined;
      out[`product ${m[1].toLowerCase()}`] = part.slice((m.index ?? 0) + m[0].length, end).replace(/,\s*$/, "").trim();
    });
    return out;
  };
  const lines: PastOrderLine[] = [];
  for (const part of text.split(pairs ? ";" : "|").map((p) => p.trim()).filter(Boolean)) {
    const f = fields(part);
    const title = f.product_name || f["product name"] || "";
    if (!title) continue;
    const price = amount(f.price ?? f["product unit price"] ?? "");
    const sku = f["product sku"] || f.sku || "";
    lines.push({
      title: title.slice(0, 200), quantity: Math.max(1, Math.round(Number(f.quantity ?? f["product qty"]) || 1)),
      price: Number.isNaN(price) ? 0 : Math.max(0, price), ...(sku ? { sku: sku.slice(0, 80) } : {}),
    });
  }
  return lines;
}

/** The order's moment as an ISO time, or just its day ("2025-06-01") when only that reads; null when nothing does. */
const day = (value: string, dayFirst = false): string | null => {
  const v = value.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // "06/01/25", "01/06/2025": month first unless the file writes its days first (`dayFirstIn`). Kept as the day.
  const n = NUMERIC_DATE.exec(v);
  if (n) {
    const [a, b, y] = [Number(n[1]), Number(n[2]), Number(n[3])];
    const [m, d] = dayFirst ? [b, a] : [a, b];
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${y < 100 ? 2000 + y : y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  // "2025-06-01 15:30:00 -0400" → "2025-06-01T15:30:00-04:00", which every browser reads.
  const t = Date.parse(v.replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T").replace(/\s*([+-])(\d{2}):?(\d{2})$/, "$1$2:$3").replace(/\s+UTC$/i, "Z"));
  if (!Number.isNaN(t)) return new Date(t).toISOString();
  return /^(\d{4}-\d{2}-\d{2})/.exec(v)?.[1] ?? null;
};

/**
 * An amount in an order file: "35.00", "CA$35.00", "US$35.00", "€35,00", and a discount or refund written as money
 * taken off, "-5.00" or "(5.00)", which comes back negative. NaN when it isn't an amount.
 */
const amount = (value: string): number => {
  let v = value.replace(/\s/g, "");
  let sign = 1;
  if (/^\(.*\)$/.test(v)) { sign = -1; v = v.slice(1, -1); }
  if (v.startsWith("-")) { sign = -sign; v = v.slice(1); }
  v = v.replace(/^[A-Z]{0,3}[$€£¥]/i, "").replace(/([$€£¥]|[A-Z]{3})$/i, "");
  const n = parseMoney(v);
  return Number.isNaN(n) ? NaN : sign * n;
};

export function readPastOrders(text: string, now = new Date(), home: string = SHOP_CURRENCY): PastOrderFile {
  const out: PastOrderFile = { orders: [], skipped: [], problems: [], foreign: {} };
  const table = parseCsv(text);
  if (!table.length) { out.problems.push("This file is empty."); return out; }
  const heads = table[0].map(key);
  const used = new Set<number>();
  const at = (names: string[]) => { for (const n of names) { const i = heads.indexOf(n); if (i >= 0 && !used.has(i)) return i; } return -1; };
  const take = (names: string[]) => { const i = at(names); if (i >= 0) used.add(i); return i; };
  // A file with both a "Name" written like "#1001" and an "Id" (a long number) keeps the order number people know.
  const nameAt = heads.indexOf("name");
  if (nameAt >= 0 && /^#/.test(String(table[1]?.[nameAt] ?? "").trim())) used.add(heads.indexOf("id"));
  const refAt = take(REF);
  used.delete(heads.indexOf("id"));
  if (refAt >= 0) used.add(refAt);
  // Order of taking matters: the order number before a customer's "name", item columns before a bare "price".
  const col = {
    ref: refAt, date: take(DATE), email: take(EMAIL), first: take(FIRST), last: take(LAST), item: take(ITEM), qty: take(QTY),
    sku: take(SKU), subtotal: take(SUBTOTAL), shipping: take(SHIPPING), tax: take(TAX), discount: take(DISCOUNT), refunded: take(REFUNDED),
    total: take(TOTAL), price: take(PRICE), currency: take(CURRENCY), status: take(STATUS), cancelled: take(CANCELLED), name: take(NAME),
    lineTotal: take(LINE_TOTAL), adjusted: take(ADJUSTED),
  };
  // A file of order lines with no order total (one line per item sold) still reads: the total is its lines plus
  // shipping and tax, less the discount.
  if (col.ref < 0 || col.date < 0 || (col.total < 0 && col.lineTotal < 0 && col.price < 0)) {
    out.problems.push("This file doesn't look like a list of orders: it needs each order's number, its date and its total.");
    return out;
  }
  const cell = (row: string[], i: number) => (i >= 0 ? String(row[i] ?? "").trim() : "");
  const num = (row: string[], i: number) => { const v = cell(row, i); if (!v) return undefined; const n = amount(v); return Number.isNaN(n) ? undefined : n; };

  const dayFirst = dayFirstIn(table.slice(1).map((row) => cell(row, col.date)));
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
    // A till's file puts a refund on its own line under the sale's number, with the money as a negative total.
    const sales = rows.filter((r) => (num(r, col.total) ?? 0) >= 0);
    const refundLines = rows.filter((r) => (num(r, col.total) ?? 0) < 0);
    const when = day(first(col.date), dayFirst);
    if (!when) { skip("its date couldn't be read"); continue; }
    if (Date.parse(when) > now.getTime() + 86400000) { skip("its date is in the future"); continue; }
    const currency = first(col.currency).toUpperCase();
    if (currency && !/^[A-Z]{3}$/.test(currency)) { skip(`its currency (${currency.slice(0, 20)}) couldn't be read`); continue; }
    const items: PastOrderLine[] = [];
    let linesSum = 0;
    for (const r of sales) {
      const title = cell(r, col.item);
      if (!title) continue;
      const packed = packedItems(title);
      // A file with only what each line came to gives the price of one: the line's total over its quantity.
      const qty = Math.max(1, Math.round(num(r, col.qty) ?? 1));
      const each = num(r, col.price) ?? (num(r, col.lineTotal) !== undefined ? cents(num(r, col.lineTotal)! / qty) : 0);
      const these = packed ?? [{ title: title.slice(0, 200), quantity: qty, price: Math.max(0, each), ...(cell(r, col.sku) ? { sku: cell(r, col.sku).slice(0, 80) } : {}) }];
      items.push(...these);
      linesSum += num(r, col.lineTotal) ?? these.reduce((t, i) => t + i.quantity * i.price, 0);
    }
    linesSum = cents(linesSum);
    const subtotal = firstNum(col.subtotal) ?? (col.lineTotal >= 0 && items.length ? linesSum : undefined);
    const shipping = firstNum(col.shipping);
    const tax = firstNum(col.tax);
    const discount = firstNum(col.discount) === undefined ? undefined : Math.abs(firstNum(col.discount)!);
    let total: number | undefined;
    for (const r of sales) { const v = num(r, col.total); if (v !== undefined) { total = v; break; } }
    if (total === undefined && col.total < 0 && items.length) total = cents(linesSum + (shipping ?? 0) + (tax ?? 0) - (discount ?? 0));
    if (total === undefined || total < 0) { skip("its total couldn't be read"); continue; }
    const email = first(col.email).toLowerCase();
    const name = first(col.name) || [first(col.first), first(col.last)].filter(Boolean).join(" ");
    let refunded = firstNum(col.refunded);
    if (refunded !== undefined) refunded = Math.abs(refunded);
    const refundRows = cents(refundLines.reduce((t, r) => t + Math.abs(num(r, col.total) ?? 0), 0));
    if (refundRows > (refunded ?? 0)) refunded = refundRows;
    const adjusted = firstNum(col.adjusted);
    if (refunded === undefined && adjusted !== undefined && adjusted >= 0 && adjusted < total) refunded = cents(total - adjusted);
    if (refunded === undefined && /refunded/i.test(status) && !/partial/i.test(status)) refunded = total;
    const order: PastOrder = {
      oldRef: `order:${ref}`.slice(0, 200), number: ref.slice(0, 40), orderedAt: when, items: items.slice(0, 100), total,
      ...(email ? { email } : {}), ...(name ? { name: name.slice(0, 100) } : {}), ...(currency ? { currency } : {}),
      ...(subtotal !== undefined ? { subtotal } : {}),
      ...(shipping !== undefined ? { shipping } : {}),
      ...(tax !== undefined ? { tax } : {}),
      ...(discount !== undefined ? { discount } : {}),
      ...(refunded ? { refunded: Math.min(total, refunded) } : {}),
    };
    out.orders.push(order);
    if (currency && currency !== home) out.foreign[currency] = (out.foreign[currency] || 0) + 1;
  }
  if (!out.orders.length && !out.skipped.length) out.problems.push("This file has no orders in it.");
  return out;
}

const cents = (n: number) => Math.round(n * 100) / 100;
/** A usable rate: how much of the shop's own currency one unit of the other currency was worth. */
/**
 * Several order files read as one (plan 23.27): old shops that export a year at a time give a press one file per year.
 * An order in two files comes over once (the first file's copy). With more than one file, what was left out and any
 * problem name its file. Pure.
 */
export function mergePastOrderFiles(files: { name: string; file: PastOrderFile }[], home: string = SHOP_CURRENCY): PastOrderFile {
  if (files.length === 1) return files[0].file;
  const out: PastOrderFile = { orders: [], skipped: [], problems: [], foreign: {} };
  const seen = new Map<string, number>();
  for (const { name, file } of files) {
    for (const p of file.problems) out.problems.push(`${name}: ${p}`);
    for (const s of file.skipped) out.skipped.push({ line: s.line, reason: `${name}, line ${s.line}: ${s.reason}` });
    for (const o of file.orders) {
      const at = seen.get(o.oldRef);
      if (at !== undefined) {
        // Old shops that give orders and their items as two files: the order keeps its first file's figures and
        // takes its items from the other.
        if (!out.orders[at].items.length && o.items.length) out.orders[at] = { ...out.orders[at], items: o.items };
        continue;
      }
      seen.set(o.oldRef, out.orders.length);
      out.orders.push(o);
      if (o.currency && o.currency !== home) out.foreign[o.currency] = (out.foreign[o.currency] || 0) + 1;
    }
  }
  return out;
}

export const goodRate = (r: unknown): r is number => typeof r === "number" && Number.isFinite(r) && r > 0 && r <= 10000;

/**
 * The orders ready to send (plan 23.11): orders in the shop's own currency as they are, and each other-currency order converted at
 * the owner's rate for that currency, keeping what the old shop charged in `paidIn`. Orders in a currency without a
 * rate wait. The preview's figures come from the orders that will be sent.
 */
export function readyToSend(file: PastOrderFile, rates: Record<string, number>, home: string = SHOP_CURRENCY): PastOrdersReady {
  const out: PastOrdersReady = { orders: [], waiting: {}, totalSales: 0, customers: 0, from: "", to: "" };
  const emails = new Set<string>();
  for (const o of file.orders) {
    const currency = o.currency || home;
    let order = o;
    if (currency !== home) {
      const rate = rates[currency];
      if (!goodRate(rate)) { out.waiting[currency] = (out.waiting[currency] || 0) + 1; continue; }
      const conv = (n: number) => cents(n * rate);
      const { subtotal, shipping, tax, discount, refunded } = o;
      order = {
        ...o, currency: home, total: conv(o.total), items: o.items.map((i) => ({ ...i, price: conv(i.price) })),
        ...(subtotal !== undefined ? { subtotal: conv(subtotal) } : {}), ...(shipping !== undefined ? { shipping: conv(shipping) } : {}),
        ...(tax !== undefined ? { tax: conv(tax) } : {}), ...(discount !== undefined ? { discount: conv(discount) } : {}),
        ...(refunded !== undefined ? { refunded: conv(refunded) } : {}),
        paidIn: { currency, total: o.total, rate },
      };
    }
    out.orders.push(order);
    out.totalSales += order.total - (order.refunded || 0);
    if (order.email) emails.add(order.email);
    // A bare day stays as written; a moment is named by its day in the shop's own time, not in UTC.
    const d = /^\d{4}-\d{2}-\d{2}$/.test(order.orderedAt) ? order.orderedAt : shopDate(new Date(order.orderedAt));
    if (!out.from || d < out.from) out.from = d;
    if (!out.to || d > out.to) out.to = d;
  }
  out.customers = emails.size;
  out.totalSales = cents(out.totalSales);
  return out;
}
