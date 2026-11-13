// Bookkeeping › Reports (13 November 2026, Julian): the balance sheet for any date, the cash flow forecast for the next
// 90 days and the year-end tax pack. Pure: every figure comes from rules the money pages already use (the ledger in
// moneyReports.ts, stock value in stockValue.ts, invoices in invoiceMake.ts, sales tax in taxPeriods.ts, artist shares in
// ArtistPayouts.tsx, the year report in yearReport.ts), so a number here is the number those pages show. The page is
// ReportsPage.tsx; nothing here writes anything.
import { chargesBetween, normalizeRecurring, recurringStatus } from "@stockroom/recurring.js";
import { receiptRefsOf } from "@stockroom/receipt-storage.js";
import { toCsv } from "@stockroom/csv.js";

import { documentFrame, documentPage, documentTable, documentTotals } from "../../../shared/documentKit";

import type { BookkeepingOrder } from "../../../shared/bookkeeping";
import { artistRows } from "./ArtistPayouts";
import { invoiceList } from "./invoiceMake";
import { taxCenterModel } from "./moneyReports";
import { stockValue } from "./stockValue";
import type { StockroomRecords } from "./stockroomData";
import { pendingList } from "./taxPending";
import { dueOf, filingsOf, taxPeriodModel, taxReportRows, type TaxPeriod } from "./taxPeriods";
import { yearFigures } from "./yearReport";
import type { TaxSources } from "@stockroom/tax-ledger.js";

type Row = Record<string, any>;

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (key: string, n: number) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + n); return dayKey(d); };
const cents = (n: number) => Math.round(n * 100) / 100;
const msDay = (ms: number) => dayKey(new Date(ms));
const lastOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** A year's four quarters, Q1 first, with the ids the Tax centre files them under. */
export function quartersOf(year: number): TaxPeriod[] {
  return [1, 2, 3, 4].map((q) => {
    const first = (q - 1) * 3 + 1;
    return { id: `${year}-Q${q}`, label: `Q${q} ${year}`, start: `${year}-${pad(first)}-01`, end: `${year}-${pad(first + 2)}-${pad(lastOfMonth(year, first + 2))}`, open: false, quarter: true };
  });
}

/** An amount in the base currency at the saved rate; `missing` when there is no rate (then counted 1 to 1). */
function toBase(amount: number, code: string, base: string, fx: Record<string, number>): { value: number; missing: boolean } {
  if (!code || code === base) return { value: amount, missing: false };
  const direct = Number(fx[`${code}_${base}`]);
  if (direct > 0) return { value: amount * direct, missing: false };
  // Rates are kept against CAD; go through it when the base is something else.
  const toCad = code === "CAD" ? 1 : Number(fx[`${code}_CAD`]);
  const baseToCad = base === "CAD" ? 1 : Number(fx[`${base}_CAD`]);
  if (toCad > 0 && baseToCad > 0) return { value: (amount * toCad) / baseToCad, missing: false };
  return { value: amount, missing: true };
}

// ── Sales tax still to send ─────────────────────────────────────────────────────────────────────────────────────

export type TaxOwing = { period: TaxPeriod; taxCents: number; due: string };

/**
 * Website sales tax collected in quarters not marked filed, counted up to `asOf` (a quarter still running counts to that
 * day). Quarters from the first year with records. A filing marked after `asOf` still counts as owed on that day.
 */
export function unfiledSalesTax(input: { orders: BookkeepingOrder[]; ledgerRows: Row[]; states: Record<string, Row>; taxCenter: Row | null; currency: string; asOf: string; firstYear: number }): TaxOwing[] {
  const filed = filingsOf(input.taxCenter);
  const out: TaxOwing[] = [];
  const lastYear = Number(input.asOf.slice(0, 4));
  for (let y = Math.min(input.firstYear, lastYear); y <= lastYear; y++) {
    for (const q of quartersOf(y)) {
      if (q.start > input.asOf) continue;
      const f = filed[q.id];
      if (f?.filedAt && String(f.filedAt).slice(0, 10) <= input.asOf) continue;
      const period = { ...q, end: q.end < input.asOf ? q.end : input.asOf };
      const m = taxPeriodModel({ orders: input.orders, ledgerRows: input.ledgerRows, states: input.states, period, currency: input.currency });
      if (m.taxCents) out.push({ period: q, taxCents: m.taxCents, due: dueOf(q).due });
    }
  }
  return out.sort((a, b) => a.period.start.localeCompare(b.period.start));
}

// ── Balance sheet ───────────────────────────────────────────────────────────────────────────────────────────────

export type SheetLine = { id: string; label: string; amount: number; note?: string };
export type BalanceSheet = {
  asOf: string; currency: string; assets: SheetLine[]; liabilities: SheetLine[]; totalAssets: number; totalLiabilities: number;
  equity: number; notes: string[]; ordersRead: boolean;
};

export type StatementInput = {
  records: StockroomRecords; sources: TaxSources; orders: BookkeepingOrder[] | null; today: string;
};

const firstYearOf = (rows: Row[], today: string) => {
  const years = rows.map((r) => Number(String(r.date || "").slice(0, 4))).filter((y) => y > 1990);
  return years.length ? Math.min(...years) : Number(today.slice(0, 4));
};

/**
 * What the business owns and owes on `asOf`. Cash is worked out from the records (money in less money out, less what
 * customers still owe, plus sales tax held for the government), not read from a bank. Stock and artist shares are
 * today's figures: the stockroom keeps no count for past days, and a past date says so.
 */
export function balanceSheet({ records, sources, orders, today }: StatementInput, asOf: string): BalanceSheet {
  const model = taxCenterModel(sources, "all", new Date(`${today}T12:00:00`));
  const base = model.baseCurrency;
  const fx = sources.fxRateCache;
  const notes: string[] = [];
  const past = asOf < today;
  let rateMissing = false;

  let earned = 0;
  for (const r of model.rows) {
    if (r.voided || r.affectsCashFlow === false || !r.date || r.date > asOf) continue;
    earned += (r.isIncome ? 1 : -1) * (Number(r.baseAmount) || 0);
  }

  // Invoices sent on or before the day and not paid by then.
  let owedToYou = 0, invoiceCount = 0;
  for (const inv of invoiceList(records, new Date(`${today}T12:00:00`))) {
    if (inv.status !== "sent" && inv.status !== "paid") continue;
    if (!inv.date || inv.date > asOf) continue;
    if (inv.status === "paid" && (inv.paidAt == null || msDay(inv.paidAt) <= asOf)) continue;
    const v = toBase(inv.total, inv.code, base, fx);
    rateMissing ||= v.missing;
    owedToYou += v.value; invoiceCount += 1;
  }

  const taxOwing = orders ? unfiledSalesTax({ orders, ledgerRows: model.rows, states: sources.states, taxCenter: sources.taxCenter, currency: base, asOf, firstYear: firstYearOf(model.rows, today) }) : [];
  const taxHeld = taxOwing.reduce((s, t) => s + t.taxCents, 0) / 100;
  if (!orders) notes.push("Website orders didn't load, so sales tax collected online is left out.");

  const stock = stockValue(records.books as Row[], sources.states, fx).totals.totalAssetValueCostCAD;
  const stockInBase = toBase(stock, "CAD", base, fx);

  let shares = 0;
  for (const a of artistRows(records)) {
    if (a.direction !== "to-artist" || !a.owed) continue;
    const v = toBase(a.owed, a.currency, base, fx);
    rateMissing ||= v.missing;
    shares += v.value;
  }

  const cash = earned - owedToYou + taxHeld;
  const assets: SheetLine[] = [
    { id: "cash", label: "Cash", amount: cents(cash), note: "Money in less money out, from your records" },
    { id: "owed", label: "Owed to you", amount: cents(owedToYou), note: invoiceCount ? `${invoiceCount} unpaid ${invoiceCount === 1 ? "invoice" : "invoices"}` : "No unpaid invoices" },
    { id: "stock", label: "Stock at cost", amount: cents(stockInBase.value), note: past ? "As counted today" : "Unsold copies at what they cost to make" },
  ];
  const liabilities: SheetLine[] = [
    { id: "tax", label: "Sales tax to send", amount: cents(taxHeld), note: taxOwing.length ? taxOwing.map((t) => t.period.label).join(", ") : "Nothing unfiled" },
  ];
  if (shares || (records.books as Row[]).some((b) => Array.isArray(b.profitTiers) && b.profitTiers.length)) {
    liabilities.push({ id: "shares", label: "Owed to artists", amount: cents(shares), note: past ? "As it stands today" : "Shares not settled yet" });
  }
  if (past) notes.push("Stock and artist shares are today's figures: past counts aren't kept.");
  if (rateMissing || model.notes.missing) notes.push("Some amounts have no exchange rate yet and are counted 1 to 1.");

  const totalAssets = cents(assets.reduce((s, l) => s + l.amount, 0));
  const totalLiabilities = cents(liabilities.reduce((s, l) => s + l.amount, 0));
  return { asOf, currency: base, assets, liabilities, totalAssets, totalLiabilities, equity: cents(totalAssets - totalLiabilities), notes, ordersRead: !!orders };
}

export function balanceSheetRows(sheet: BalanceSheet, pressName: string): string[][] {
  const m = (n: number) => n.toFixed(2);
  return [
    [`${pressName} balance sheet`, `As of ${sheet.asOf}`, sheet.currency],
    [],
    ["What you own", "", ""],
    ...sheet.assets.map((l) => [l.label, l.note || "", m(l.amount)]),
    ["Total owned", "", m(sheet.totalAssets)],
    [],
    ["What you owe", "", ""],
    ...sheet.liabilities.map((l) => [l.label, l.note || "", m(l.amount)]),
    ["Total owed", "", m(sheet.totalLiabilities)],
    [],
    ["Your share of the business", "What you own less what you owe", m(sheet.equity)],
    ...(sheet.notes.length ? [[], ...sheet.notes.map((n) => ["Note", n, ""])] : []),
  ];
}

export const balanceSheetCsv = (sheet: BalanceSheet, pressName: string) => toCsv(balanceSheetRows(sheet, pressName), { bom: true, eol: "\r\n" });

// ── Cash flow forecast ──────────────────────────────────────────────────────────────────────────────────────────

export type ForecastItem = { date: string; label: string; kind: "in" | "out"; amount: number; source: "invoice" | "recurring" | "pending" | "tax" | "sales"; late?: boolean };
export type ForecastWeek = { start: string; end: string; moneyIn: number; moneyOut: number; balance: number };
export type Forecast = {
  start: string; end: string; currency: string; startCash: number; weeks: ForecastWeek[]; items: ForecastItem[];
  weeklySales: number; lowest: { balance: number; week: string }; endCash: number; notes: string[];
};

export const FORECAST_DAYS = 90;

/**
 * The next 90 days, week by week: today's cash (the balance sheet's), plus unpaid invoices on their due dates, plus the
 * usual week of sales (the last 90 days' average), less recurring costs, expected costs and sales tax as each falls due.
 * Anything already late lands on today.
 */
export function cashForecast(input: StatementInput, sheet: BalanceSheet = balanceSheet(input, input.today)): Forecast {
  const { records, sources, today } = input;
  const now = new Date(`${today}T12:00:00`);
  const model = taxCenterModel(sources, "all", now);
  const base = model.baseCurrency;
  const fx = sources.fxRateCache;
  const end = addDays(today, FORECAST_DAYS - 1);
  const items: ForecastItem[] = [];
  const notes: string[] = [];
  const at = (date: string) => (date && date > today ? date : today);
  const add = (item: Omit<ForecastItem, "amount">, amount: number, code: string) => {
    const v = toBase(amount, code, base, fx);
    if (v.missing && !notes.includes("rate")) notes.push("rate");
    if (v.value > 0 && item.date <= end) items.push({ ...item, amount: cents(v.value) });
  };

  for (const inv of invoiceList(records, now)) {
    if (inv.status !== "sent") continue;
    add({ date: at(inv.dueDate), label: `Invoice ${inv.num || ""} from ${inv.billedTo}`.replace(/\s+/g, " "), kind: "in", source: "invoice", late: !!inv.dueDate && inv.dueDate < today }, inv.total, inv.code);
  }

  const tc = (records.taxCenter || {}) as Row;
  for (const raw of (Array.isArray(tc.recurring) ? tc.recurring : []) as Row[]) {
    const status = recurringStatus(raw, now);
    if (status !== "active" && status !== "scheduled") continue;
    const sub = normalizeRecurring(raw);
    for (const c of chargesBetween(raw, addDays(today, 1), end)) {
      if (c.posted) continue;
      add({ date: c.date, label: String(sub.desc || "Recurring cost"), kind: "out", source: "recurring" }, Number(c.amount) || 0, String(sub.currency || base));
    }
  }

  for (const p of pendingList(tc)) {
    const amount = Number(p.estAmount) || 0;
    if (!amount) continue;
    const when = String(p.expectedDate || "");
    add({ date: at(when), label: String(p.desc || "Expected cost"), kind: "out", source: "pending", late: !!when && when < today }, amount, String(p.currency || base));
  }

  if (input.orders) {
    for (const t of unfiledSalesTax({ orders: input.orders, ledgerRows: model.rows, states: sources.states, taxCenter: sources.taxCenter, currency: base, asOf: end, firstYear: firstYearOf(model.rows, today) })) {
      // Only quarters that have ended by the time they're due count; a running quarter's tax is due after the window.
      if (t.due > end) continue;
      items.push({ date: at(t.due), label: `Sales tax for ${t.period.label}`, kind: "out", amount: cents(t.taxCents / 100), source: "tax", late: t.due < today });
    }
  }

  // The usual week of sales: money in over the last 90 days (sales and shipping charged), as a weekly average.
  const since = addDays(today, -FORECAST_DAYS);
  let recent = 0;
  for (const r of model.rows) {
    if (!r.isIncome || r.voided || !r.date || r.date <= since || r.date > today) continue;
    if (r.sourceType !== "sale" && r.sourceType !== "shippingIncome") continue;
    recent += Number(r.baseAmount) || 0;
  }
  const weeklySales = cents((recent / FORECAST_DAYS) * 7);

  const weeks: ForecastWeek[] = [];
  let balance = sheet.assets.find((l) => l.id === "cash")?.amount ?? 0;
  const startCash = balance;
  let lowest = { balance, week: today };
  for (let i = 0; i < Math.ceil(FORECAST_DAYS / 7); i++) {
    const start = addDays(today, i * 7);
    const last = addDays(start, 6) < end ? addDays(start, 6) : end;
    const days = Math.round((Date.parse(`${last}T12:00:00`) - Date.parse(`${start}T12:00:00`)) / 86_400_000) + 1;
    const these = items.filter((it) => it.date >= start && it.date <= last);
    const usual = cents((weeklySales / 7) * days);
    const moneyIn = cents(these.filter((it) => it.kind === "in").reduce((s, it) => s + it.amount, 0) + usual);
    const moneyOut = cents(these.filter((it) => it.kind === "out").reduce((s, it) => s + it.amount, 0));
    balance = cents(balance + moneyIn - moneyOut);
    weeks.push({ start, end: last, moneyIn, moneyOut, balance });
    if (balance < lowest.balance) lowest = { balance, week: start };
  }
  if (weeklySales) items.push({ date: today, label: `Usual sales, about ${weeklySales.toFixed(2)} a week`, kind: "in", amount: cents(weekTotal(weeks, weeklySales)), source: "sales" });
  if (!input.orders) notes.push("Website orders didn't load, so sales tax due is left out.");
  const words = notes.map((n) => (n === "rate" ? "Some amounts have no exchange rate yet and are counted 1 to 1." : n));
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === "in" ? -1 : 1));
  return { start: today, end, currency: base, startCash, weeks, items, weeklySales, lowest, endCash: balance, notes: words };
}

const weekTotal = (weeks: ForecastWeek[], weekly: number) => weeks.reduce((s, w) => {
  const days = Math.round((Date.parse(`${w.end}T12:00:00`) - Date.parse(`${w.start}T12:00:00`)) / 86_400_000) + 1;
  return s + (weekly / 7) * days;
}, 0);

export function forecastCsv(f: Forecast, pressName: string): string {
  const m = (n: number) => n.toFixed(2);
  return toCsv([
    [`${pressName} cash flow forecast`, `${f.start} to ${f.end}`, f.currency],
    ["Cash today", m(f.startCash)],
    ["Usual sales a week", m(f.weeklySales)],
    [],
    ["Week starting", "Week ending", "Money in", "Money out", "Cash at the end"],
    ...f.weeks.map((w) => [w.start, w.end, m(w.moneyIn), m(w.moneyOut), m(w.balance)]),
    [],
    ["Date", "What", "In or out", "Amount", "Late"],
    ...f.items.filter((it) => it.source !== "sales").map((it) => [it.date, it.label, it.kind === "in" ? "In" : "Out", m(it.amount), it.late ? "Yes" : ""]),
    ...(f.notes.length ? [[], ...f.notes.map((n) => ["Note", n])] : []),
  ], { bom: true, eol: "\r\n" });
}

// ── Year-end tax pack ───────────────────────────────────────────────────────────────────────────────────────────

export type PackReceipt = { url: string; path: string; date: string; desc: string; amount: number };
export type PackSkipped = { date: string; desc: string; amount: number; where: string };

const safeName = (s: string) => s.replace(/[\\/:*?"<>|#%]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "receipt";
const extOf = (url: string) => {
  const clean = decodeURIComponent(url.split("?")[0] || "");
  const m = /\.([a-z0-9]{2,5})$/i.exec(clean);
  return m ? m[1].toLowerCase() : "jpg";
};

/** The year's expenses' receipts: our own cloud files go in the zip, everything else is listed with where it is. */
export function packReceipts(ledgerRows: Row[], year: string): { files: PackReceipt[]; skipped: PackSkipped[] } {
  const files: PackReceipt[] = [];
  const skipped: PackSkipped[] = [];
  const used = new Set<string>();
  for (const r of ledgerRows) {
    if (r.isIncome || r.voided || !String(r.date || "").startsWith(year)) continue;
    const refs = receiptRefsOf(r);
    refs.forEach((ref, i) => {
      const amount = Number(r.baseAmount) || 0;
      if (/^https?:\/\//i.test(ref) && /firebasestorage/i.test(ref)) {
        let path = `receipts/${r.date} ${safeName(String(r.desc || ""))} ${amount.toFixed(2)}${refs.length > 1 ? ` (${i + 1})` : ""}.${extOf(ref)}`;
        for (let n = 2; used.has(path); n++) path = path.replace(/(\.[a-z0-9]+)$/i, ` ${n}$1`);
        used.add(path);
        files.push({ url: ref, path, date: String(r.date), desc: String(r.desc || ""), amount });
      } else {
        skipped.push({ date: String(r.date), desc: String(r.desc || ""), amount, where: ref.startsWith("local://") ? `In your own folder: ${ref.slice(8)}` : `At a link: ${ref}` });
      }
    });
  }
  return { files, skipped };
}

export type PackFile = { path: string; text: string };

/**
 * Every text file of the pack, named so an accountant can follow it. Receipt files are fetched by the page and added
 * under receipts/; `receipts` here is the list that says which receipt is which.
 */
export function taxPackFiles(input: StatementInput & { pressName: string; year: string; yearReport: { text: string }; taxSeason: { text: string }; ledger: { text: string } }): { files: PackFile[]; receipts: PackReceipt[] } {
  const { records, sources, orders, today, pressName, year } = input;
  const yearEnd = `${year}-12-31`;
  const asOf = yearEnd < today ? yearEnd : today;
  const csv = (rows: unknown[][]) => toCsv(rows, { bom: true, eol: "\r\n" });
  const m = (n: number) => n.toFixed(2);

  const figures = yearFigures({ books: records.books as Row[], states: sources.states, taxCenter: sources.taxCenter, fxRateCache: sources.fxRateCache }, year);
  const pl = csv([
    [`${pressName} profit and loss`, year],
    [],
    ["Sales", m(figures.revenue)],
    ["Cost of goods sold", m(-figures.cogs)],
    ["Gross profit", m(figures.revenue - figures.cogs)],
    ["Expenses", m(-figures.opex)],
    ...(figures.shares ? [["Artist shares", m(-figures.shares)]] : []),
    ["Net profit", m(figures.profit)],
    [],
    ["By item", "Units", "Sales", "Cost per unit", "Cost of goods", "Artist share", "Net"],
    ...figures.bookStats.filter((b) => b.units || b.revenue || b.shares).map((b) => [b.title, String(b.units), m(b.revenue), m(b.unitCost), m(b.cogs), m(b.shares), m(b.net)]),
    ...(figures.fxWaitingCount ? [[], ["Note", `${figures.fxWaitingCount} expenses are waiting for an exchange rate and count 0.`]] : []),
  ]);

  const sheet = balanceSheet(input, asOf);
  const model = taxCenterModel(sources, "all", new Date(`${today}T12:00:00`));
  const base = model.baseCurrency;

  const taxRows: unknown[][] = [];
  const filed = filingsOf(sources.taxCenter);
  if (orders) {
    const quarters = quartersOf(Number(year)).filter((p) => p.start <= asOf);
    for (const q of quarters) {
      const period = { ...q, end: q.end < asOf ? q.end : asOf };
      const tm = taxPeriodModel({ orders, ledgerRows: model.rows, states: sources.states, period, currency: base });
      taxRows.push(...taxReportRows(tm, period, base), ["Filed", filed[q.id]?.filedAt ? String(filed[q.id].filedAt).slice(0, 10) : "Not marked filed"], []);
    }
  } else taxRows.push(["Website orders didn't load, so this summary is empty. Download the pack again when you're online."]);

  const yearModel = taxCenterModel(sources, year, new Date(`${today}T12:00:00`));
  const categories = csv([
    ["Category", "Entries", "Spent", "Deductible"],
    ...yearModel.categories.list.map((c: Row) => [c.name, String(c.count), m(c.spent), m(c.total)]),
  ]);

  const { files: receipts, skipped } = packReceipts(yearModel.rows, year);
  const receiptList = csv([
    ["Date", "Expense", "Amount", "File in this pack"],
    ...receipts.map((r) => [r.date, r.desc, m(r.amount), r.path]),
    ...skipped.map((s) => [s.date, s.desc, m(s.amount), `Not in this pack. ${s.where}`]),
  ]);

  const readme = [
    `${pressName}: tax pack for ${year}`,
    `Made on ${today}. Amounts are in ${base}.`,
    "",
    "What each file is:",
    `01 Profit and loss ${year}.csv: sales, cost of goods sold, expenses and profit, then each item.`,
    `02 Balance sheet ${asOf}.csv: what the business owned and owed on ${asOf}.`,
    `03 General ledger ${year}.csv: every sale and cost of the year, one line each.`,
    `04 Sales tax ${year}.csv: website sales tax by quarter, and whether each quarter was marked filed.`,
    `05 Expenses by category ${year}.csv: spent and deductible, per category.`,
    `06 Year report ${year}.csv: every sale and item expense, then cost of goods and artist shares per item.`,
    `07 Tax season file ${year}.csv: revenue by item, in-person sales by day, every expense and payout.`,
    `08 Receipts list ${year}.csv: each receipt, and the file name it has in the receipts folder.`,
    `receipts/: ${receipts.length} receipt ${receipts.length === 1 ? "file" : "files"}, named by date, expense and amount.`,
    ...(skipped.length ? [`${skipped.length} ${skipped.length === 1 ? "receipt is" : "receipts are"} kept elsewhere; the receipts list says where.`] : []),
    ...(sheet.notes.length ? ["", "Notes:", ...sheet.notes] : []),
  ].join("\r\n");

  return {
    receipts,
    files: [
      { path: "00 Read me.txt", text: readme },
      { path: `01 Profit and loss ${year}.csv`, text: pl },
      { path: `02 Balance sheet ${asOf}.csv`, text: balanceSheetCsv(sheet, pressName) },
      { path: `03 General ledger ${year}.csv`, text: input.ledger.text },
      { path: `04 Sales tax ${year}.csv`, text: csv(taxRows) },
      { path: `05 Expenses by category ${year}.csv`, text: categories },
      { path: `06 Year report ${year}.csv`, text: input.yearReport.text },
      { path: `07 Tax season file ${year}.csv`, text: input.taxSeason.text },
      { path: `08 Receipts list ${year}.csv`, text: receiptList },
    ],
  };
}

/** The balance sheet as a printed page (the shared document kit), for Print or save PDF. */
export function balanceSheetPage(sheet: BalanceSheet, pressName: string, money: (n: number) => string): string {
  const rows = (lines: SheetLine[]) => lines.map((l) => [l.label, l.note || "", money(l.amount)]);
  const cols = [{ label: "" }, { label: "" }, { label: sheet.currency, align: "right" as const }];
  const body = [
    "<h2 style=\"font-size:15px;margin:18px 0 6px\">What you own</h2>", documentTable(cols, rows(sheet.assets)),
    documentTotals([{ label: "Total owned", value: money(sheet.totalAssets), strong: true }]),
    "<h2 style=\"font-size:15px;margin:18px 0 6px\">What you owe</h2>", documentTable(cols, rows(sheet.liabilities)),
    documentTotals([{ label: "Total owed", value: money(sheet.totalLiabilities), strong: true }, { label: "Your share of the business", value: money(sheet.equity), strong: true }]),
  ].join("");
  return documentPage(`Balance sheet ${sheet.asOf}`, documentFrame({ press: { name: pressName }, title: "Balance sheet", reference: `As of ${sheet.asOf}`, body, footer: sheet.notes.join(" ") }));
}
