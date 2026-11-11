// The top of the Tax centre (redesign, 11 November 2026): sales tax for a period (this quarter, the last two, or the
// year so far). Pure. Website sales tax comes from the shop's own orders by the bookkeeping rules
// (src/shared/bookkeeping.ts: real paid orders only, each tax by its name in the books, refunds on their own day);
// fair, stockist and other stockroom sales come from the ledger, where no tax is recorded. Nothing is invented: a
// figure with no source says so.
import { bookkeepingOrderLines, type BookkeepingOrder, type BookkeepingOrderLine } from "../../../shared/bookkeeping";
import { SHOP_TZ, shopDayKey } from "../../lib/shopDay";

type Row = Record<string, any>;

export type TaxPeriod = { id: string; label: string; start: string; end: string; open: boolean; quarter: boolean };

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dayMs = (key: string) => Date.parse(`${key}T00:00:00Z`);

function quarterOf(year: number, q: number, today: string): TaxPeriod {
  const first = (q - 1) * 3 + 1;
  const start = `${year}-${pad(first)}-01`;
  const end = `${year}-${pad(first + 2)}-${pad(lastDay(year, first + 2))}`;
  const open = today >= start && today <= end;
  return { id: `${year}-Q${q}`, label: `Q${q} ${year}`, start, end, open, quarter: true };
}

/** This quarter, the two before it and the year so far. */
export function taxPeriods(now = Date.now()): TaxPeriod[] {
  const today = shopDayKey(now);
  const year = Number(today.slice(0, 4));
  const q = Math.ceil(Number(today.slice(5, 7)) / 3);
  const back = (n: number) => { const i = year * 4 + (q - 1) - n; return quarterOf(Math.floor(i / 4), (i % 4) + 1, today); };
  return [back(0), back(1), back(2), { id: `${year}-ytd`, label: "Year to date", start: `${year}-01-01`, end: today, open: true, quarter: false }];
}

/** Quarters before this one, newest first (for Past filings). */
export function pastQuarters(count: number, now = Date.now()): TaxPeriod[] {
  const today = shopDayKey(now);
  const year = Number(today.slice(0, 4));
  const q = Math.ceil(Number(today.slice(5, 7)) / 3);
  return Array.from({ length: count }, (_, n) => { const i = year * 4 + (q - 1) - (n + 1); return quarterOf(Math.floor(i / 4), (i % 4) + 1, today); });
}

/** When a quarter's return is due (the last day of the month after it ends), and how far the quarter is. */
export function dueOf(period: TaxPeriod, now = Date.now()) {
  const today = shopDayKey(now);
  const endY = Number(period.end.slice(0, 4));
  const endM = Number(period.end.slice(5, 7));
  const y = endM === 12 ? endY + 1 : endY;
  const m = endM === 12 ? 1 : endM + 1;
  const due = `${y}-${pad(m)}-${pad(lastDay(y, m))}`;
  const daysLeft = Math.round((dayMs(due) - dayMs(today)) / 86_400_000);
  const length = Math.round((dayMs(period.end) - dayMs(period.start)) / 86_400_000) + 1;
  const gone = Math.round((dayMs(today < period.end ? today : period.end) - dayMs(period.start)) / 86_400_000) + 1;
  const through = Math.max(0, Math.min(100, Math.round((gone / length) * 100)));
  return { due, daysLeft, through };
}

const monthsOf = (start: string, end: string) => {
  const out: string[] = [];
  let y = Number(start.slice(0, 4)), m = Number(start.slice(5, 7));
  const last = end.slice(0, 7);
  while (`${y}-${pad(m)}` <= last) { out.push(`${y}-${pad(m)}`); m += 1; if (m > 12) { m = 1; y += 1; } }
  return out;
};

/** The website's sale and refund lines in the period (whole cents, the shop's currency). */
export function websiteLines(orders: BookkeepingOrder[], period: TaxPeriod, currency: string): BookkeepingOrderLine[] {
  return monthsOf(period.start, period.end)
    .flatMap((month) => bookkeepingOrderLines(orders, { month, currency, timeZone: SHOP_TZ }))
    .filter((l) => l.date >= period.start && l.date <= period.end);
}

export type Channel = "fairs" | "stockists" | "other";
export const CHANNEL_WORDS: Record<Channel, string> = { fairs: "Fairs and markets", stockists: "Stockists", other: "Other sales" };

/** Where a stockroom sale happened; null for website sales, which come from the orders instead. */
export function channelOf(entry: Row | undefined): Channel | null {
  const chan = String(entry?.chan || "").toLowerCase();
  if (chan.startsWith("website")) return null;
  if (entry?.consignmentLink || chan === "consignment" || chan === "sold through") return "stockists";
  if (/fair|market|pos|in person|event/.test(chan)) return "fairs";
  return "other";
}

/** Each stockroom sale entry by "book:id" (and "book:num"), to read its channel. */
function entriesByKey(states: Record<string, Row>) {
  const map = new Map<string, Row>();
  for (const [bookId, state] of Object.entries(states || {})) {
    for (const h of Array.isArray(state?.hist) ? state.hist : []) {
      if (!h) continue;
      if (h.id) map.set(`${bookId}:${h.id}`, h);
      if (h.num) map.set(`${bookId}:${h.num}`, h);
    }
  }
  return map;
}

export type RateLine = { id: string; name: string; note: string; netCents: number; taxCents: number; orders: number };
export type ChannelLine = { id: string; name: string; salesCents: number; taxCents: number | null; sales: number };
export type CheckLine = { id: string; text: string; done: boolean };

/**
 * One period's figures. `ledgerRows` are the stockroom ledger's rows (any year: they are filtered by date here),
 * money in the ledger's base currency, which the shop's orders share.
 */
export function taxPeriodModel({ orders, ledgerRows, states, period, currency }: {
  orders: BookkeepingOrder[]; ledgerRows: Row[]; states: Record<string, Row>; period: TaxPeriod; currency: string;
}) {
  const lines = websiteLines(orders, period, currency);
  const sales = lines.filter((l) => l.kind === "Sale");
  const refunds = lines.filter((l) => l.kind === "Refund");
  const net = (l: BookkeepingOrderLine) => l.salesCents - l.discountsCents;

  const byName = new Map<string, RateLine>();
  let noTax: RateLine | null = null;
  for (const l of sales) {
    const names = Object.entries(l.taxes).filter(([, c]) => c);
    if (!names.length) {
      noTax ||= { id: "none", name: "No tax charged", note: "Website", netCents: 0, taxCents: 0, orders: 0 };
      noTax.netCents += net(l); noTax.orders += 1;
      continue;
    }
    names.forEach(([name, cents], i) => {
      const r = byName.get(name) || { id: `tax:${name}`, name, note: "Website", netCents: 0, taxCents: 0, orders: 0 };
      // An order with two taxes (GST and PST) counts its sales once, under its first tax.
      if (i === 0) r.netCents += net(l);
      r.taxCents += cents; r.orders += 1;
      byName.set(name, r);
    });
  }

  const entries = entriesByKey(states);
  const channels: Record<Channel, ChannelLine> = {
    fairs: { id: "fairs", name: CHANNEL_WORDS.fairs, salesCents: 0, taxCents: null, sales: 0 },
    stockists: { id: "stockists", name: CHANNEL_WORDS.stockists, salesCents: 0, taxCents: null, sales: 0 },
    other: { id: "other", name: CHANNEL_WORDS.other, salesCents: 0, taxCents: null, sales: 0 },
  };
  for (const r of ledgerRows) {
    if (r.sourceType !== "sale" || r.voided || !r.date || r.date < period.start || r.date > period.end) continue;
    const channel = channelOf(entries.get(`${r.sourceId}:${r.itemId}`));
    if (!channel) continue;
    channels[channel].salesCents += Math.round(Number(r.baseAmount || 0) * 100);
    channels[channel].sales += 1;
  }
  const inPerson = Object.values(channels).filter((c) => c.sales);

  const taxCents = sales.reduce((sum, l) => sum + Object.values(l.taxes).reduce((a, b) => a + b, 0), 0);
  const refundsCents = refunds.reduce((sum, l) => sum + l.refundsCents, 0);
  const fees = sales.filter((l) => l.feeCents !== null);
  const feesCents = fees.reduce((sum, l) => sum + (l.feeCents || 0), 0);
  const unpaidOut = sales.filter((l) => !l.payoutId).length;
  const salesCents = sales.reduce((sum, l) => sum + net(l), 0) + inPerson.reduce((sum, c) => sum + c.salesCents, 0);
  const salesCount = sales.length + inPerson.reduce((sum, c) => sum + c.sales, 0);

  const rates = [...byName.values()].sort((a, b) => b.taxCents - a.taxCents);
  if (noTax) rates.push(noTax);
  for (const c of inPerson) rates.push({ id: `chan:${c.id}`, name: c.name, note: "No tax recorded", netCents: c.salesCents, taxCents: 0, orders: c.sales });

  const website: ChannelLine = { id: "website", name: "Website", salesCents: sales.reduce((s, l) => s + net(l), 0), taxCents, sales: sales.length };
  const checks: CheckLine[] = [
    noTax
      ? { id: "no-tax", text: `${noTax.orders} website ${noTax.orders === 1 ? "sale has" : "sales have"} no tax`, done: false }
      : { id: "no-tax", text: "Every website sale has tax", done: true },
    refunds.length
      ? { id: "refunds", text: `${refunds.length} ${refunds.length === 1 ? "refund" : "refunds"}: take off the tax you gave back`, done: false }
      : { id: "refunds", text: "No refunds to account for", done: true },
    unpaidOut
      ? { id: "payouts", text: `${unpaidOut} ${unpaidOut === 1 ? "payment is" : "payments are"} not in a payout yet`, done: false }
      : { id: "payouts", text: "Fees matched to payouts", done: true },
  ];
  if (inPerson.length) checks.push({ id: "in-person", text: "Fair and stockist sales have no tax recorded", done: false });

  return {
    taxCents, salesCents, salesCount, refundsCents, refunds: refunds.length,
    feesCents, feesKnown: fees.length > 0, unpaidOut,
    rates, channels: [website, ...inPerson], checks,
  };
}

export type TaxPeriodModel = ReturnType<typeof taxPeriodModel>;

/** Past filings saved in the Tax centre (`taxCenter.filings`, by quarter id). */
export function filingsOf(taxCenter: Row | null | undefined): Record<string, { filedAt: string; taxCents: number }> {
  const raw = taxCenter?.filings;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

/** The period's report as spreadsheet rows. */
export function taxReportRows(model: TaxPeriodModel, period: TaxPeriod, currency: string): string[][] {
  const m = (c: number) => (c / 100).toFixed(2);
  return [
    ["Tax report", period.label, `${period.start} to ${period.end}`, currency],
    [],
    ["Rate or channel", "Note", "Net sales", "Tax", "Orders"],
    ...model.rates.map((r) => [r.name, r.note, m(r.netCents), m(r.taxCents), String(r.orders)]),
    ["Total", "", "", m(model.taxCents), ""],
    [],
    ["Sales in period", m(model.salesCents)],
    ["Refunds", m(model.refundsCents)],
    ["Card and platform fees", model.feesKnown ? m(model.feesCents) : "Not recorded"],
  ];
}
