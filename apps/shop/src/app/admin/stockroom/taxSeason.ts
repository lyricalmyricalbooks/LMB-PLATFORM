// Tax centre › Tax-season export: the old stockroom's "Tax Season Export" file (features/tax-entries.js
// downloadFullTaxSeasonExport), line for line, so a bookkeeper gets the same file from either app: revenue by book,
// fair and in-person sales by day (the shop's bookkeeping columns, with the "Tax on in-person sales" setting), every
// expense and payout, author settlement cash, and the warnings for amounts that are not final. Pure.
import { dayLineRows, inPersonDailyLines, inPersonTaxOf, isInPersonSale } from "@stockroom/bookkeeping-days.js";
import { csvCell, csvRow } from "@stockroom/csv.js";
import { calcArtistEarnings, payoutNetted, tierEffectiveCap } from "@stockroom/earnings.js";
import { fileStem } from "@stockroom/shop-profile.js";
import { getBookCurrencyCode, roundCents } from "@stockroom/money.js";

type Row = Record<string, any>;
export type TaxSeasonInput = { books: Row[]; states: Record<string, Row>; taxCenter: Row | null; fxRateCache: Record<string, number> };

/** A foreign-currency expense with no value in dollars yet (main.js isExpenseAwaitingRate): it counts 0, never 1 to 1. */
export function isExpenseAwaitingRate(e: Row | null | undefined): boolean {
  if (!e) return false;
  const cur = String(e.currency || e.origCurrency || "CAD").toUpperCase();
  return cur !== "CAD" && !(e.baseAmount || e.amountCAD) && (parseFloat(e.amount) || 0) > 0;
}

/** The author's share earned in one year, tiers walked over all-time sales (main.js filterArtistEarningsByYear). */
export function artistEarningsInYear(book: Row, state: Row, year: number | string): number {
  const tiers = [...(book.profitTiers || [])].sort((a: Row, b: Row) => (a.revenueUpTo || Infinity) - (b.revenueUpTo || Infinity));
  if (tiers.length === 0) return 0;
  const capOf = (t: Row) => tierEffectiveCap(t, book.productionCost);
  const yearStr = String(year);
  let yearArtistEarned = 0;
  let cumulativeRevenue = 0;
  const hist: Row[] = Array.isArray(state.hist) ? state.hist : [];
  for (let i = hist.length - 1; i >= 0; i--) {
    const h = hist[i];
    if (h.voided || h.gratuity || !(h.qty > 0) || !(h.price > 0)) continue;
    const inYear = h.date && String(h.date).startsWith(yearStr);
    let revRemaining = roundCents(h.qty * h.price);
    while (revRemaining > 0.001) {
      const tier = tiers.find((t: Row) => capOf(t) !== null && cumulativeRevenue < capOf(t)!) || tiers[tiers.length - 1];
      const tCap = capOf(tier);
      const isLastTier = tier === tiers[tiers.length - 1] || tCap === null;
      const capacity = isLastTier ? revRemaining : Math.min(revRemaining, tCap! - cumulativeRevenue);
      if (inYear) yearArtistEarned = roundCents(yearArtistEarned + capacity * (tier.artistPct / 100));
      cumulativeRevenue = roundCents(cumulativeRevenue + capacity);
      revRemaining = roundCents(revRemaining - capacity);
    }
  }
  return yearArtistEarned;
}

export type TaxSeasonFile = { text: string; name: string; waiting: number; unconverted: Array<{ title: string; cur: string }> };

/** The export for `year` ("all" for every year). `pressName` heads the file; `today` is its date. */
export function taxSeasonExport(input: TaxSeasonInput, year: string, { pressName, today }: { pressName: string; today: string }): TaxSeasonFile {
  const isAllTime = year === "all";
  const fx = input.fxRateCache;
  const stateOf = (book: Row): Row => ({ hist: [], expenses: [], artistPayouts: [], ...(input.states[book.id] || {}) });
  let csv = `${pressName} Tax Season Export\n`;
  csv += "Generated on: " + today + "\n";
  csv += "Tax Year: " + (isAllTime ? "All Time" : year) + "\n\n";

  const esc = csvCell;
  const rateWarnings = new Map<string, { title: string; cur: string }>();
  const waitingExpenses = new Set<Row>();
  const getAmt = (e: Row) => {
    if (isExpenseAwaitingRate(e)) { waitingExpenses.add(e); return 0; }
    return parseFloat(e.baseAmount || e.amountCAD || e.amount || 0);
  };
  const flagRateIfMissing = (book: Row, cur: string, rawRate: number | undefined, hasAmount: boolean) => {
    if (hasAmount && cur && cur !== "CAD" && !rawRate) rateWarnings.set(book.id, { title: book.title, cur });
  };
  const inYear = (d: unknown) => isAllTime || (typeof d === "string" && d.startsWith(year));

  // Section 1: Revenue by Book
  csv += "--- REVENUE BY BOOK ---\n";
  csv += "Book Title,Gross Revenue,Net Revenue (after COGS & Royalty),Total Units Sold\n";
  for (const book of input.books) {
    const s = stateOf(book);
    const cur = getBookCurrencyCode(book);
    const rawRate = fx[`${cur}_CAD`];
    const hRate = rawRate || 1;
    let sold = 0, revenue = 0;
    for (const h of s.hist as Row[]) {
      if (h.voided || h.gratuity) continue;
      if (!isAllTime && (!h.date || !h.date.startsWith(year))) continue;
      sold += h.qty || 0;
      revenue += (h.qty || 0) * (h.price || 0);
    }
    let expTotal = 0;
    for (const e of (s.expenses || []) as Row[]) {
      if (e.voided) continue;
      if (!isAllTime && (!e.date || !e.date.startsWith(year))) continue;
      expTotal += getAmt(e);
    }
    let shares = 0;
    if (isAllTime) {
      const earn = calcArtistEarnings(book, s);
      shares = earn && typeof earn === "object" ? earn.totalArtistEarned || 0 : earn || 0;
    } else {
      shares = artistEarningsInYear(book, s, parseInt(year, 10));
    }
    const revenueCAD = revenue * hRate;
    const sharesCAD = shares * hRate;
    const net = revenueCAD - expTotal - sharesCAD;
    flagRateIfMissing(book, cur, rawRate, revenue > 0 || shares > 0);
    csv += `${esc(book.title)},${revenueCAD.toFixed(2)},${net.toFixed(2)},${sold}\n`;
  }

  // Section 1b: fair and in-person sales as the shop's bookkeeping day lines.
  const inPersonTax = inPersonTaxOf(input.taxCenter?.settings?.inPersonTax);
  const inPersonSales: Array<{ date: string; amount: number }> = [];
  for (const book of input.books) {
    const s = stateOf(book);
    const cur = getBookCurrencyCode(book);
    const rawRate = fx[`${cur}_CAD`];
    let any = false;
    for (const h of (s.hist || []) as Row[]) {
      if (!isInPersonSale(h) || (!isAllTime && !h.date.startsWith(year))) continue;
      const amount = (h.qty || 0) * (h.price || 0);
      any = any || amount > 0;
      inPersonSales.push({ date: h.date, amount: amount * (rawRate || 1) });
    }
    flagRateIfMissing(book, cur, rawRate, any);
  }
  csv += "\n--- FAIR & IN-PERSON SALES BY DAY (same lines as the shop's bookkeeping file) ---\n";
  csv += inPersonTax
    ? `${esc(`Tax: ${inPersonTax.name} at ${inPersonTax.rate}%, ${inPersonTax.included ? "included in the prices" : "added on top of the prices"}.`)}\n`
    : `${esc("No tax on in-person sales set (Tax centre › Tax on in-person sales): all of it is shown as sales before tax.")}\n`;
  dayLineRows(inPersonDailyLines(inPersonSales, { tax: inPersonTax, currency: "CAD" })).forEach((row) => { csv += csvRow(row) + "\n"; });

  // Section 2: All Expenses & Payouts
  csv += "\n--- ALL EXPENSES & PAYOUTS ---\n";
  csv += "Date,Book/Entity,Category,Description,Amount (CAD),Receipt Link\n";
  for (const book of input.books) {
    const s = stateOf(book);
    const cur = getBookCurrencyCode(book);
    const rawRate = fx[`${cur}_CAD`];
    const hRate = rawRate || 1;
    for (const e of (s.expenses || []) as Row[]) {
      if (e.voided || !(isAllTime || (e.date && e.date.startsWith(year)))) continue;
      csv += `${e.date},${esc(book.title)},${esc(e.cat)},${esc(e.desc)},${getAmt(e).toFixed(2)},${esc(e.receipt)}\n`;
    }
    for (const p of (s.artistPayouts || []) as Row[]) {
      if (p.voided || !(isAllTime || (p.date && p.date.startsWith(year)))) continue;
      const payoutRaw = parseFloat(p.amount || 0);
      flagRateIfMissing(book, cur, rawRate, payoutRaw > 0);
      const payoutCAD = payoutRaw * hRate;
      if (p.settlement) {
        csv += `${p.date},${esc(book.title)},"Earnings settled",${esc("Royalty credit including earnings retained from held sales; see settlement cash section for the actual payment")},${payoutCAD.toFixed(2)},""\n`;
        continue;
      }
      const netted = payoutNetted(p);
      const desc = [p.method || "Payment to artist", netted > 0.005 ? `plus ${(netted * hRate).toFixed(2)} netted against money the artist owed` : ""].filter(Boolean).join(" — ");
      csv += `${p.date},${esc(book.title)},"Artist Payout",${esc(desc)},${payoutCAD.toFixed(2)},""\n`;
    }
  }
  const ledger: Row[] = Array.isArray(input.taxCenter?.businessExpenses) ? input.taxCenter!.businessExpenses : [];
  for (const l of ledger) {
    if (l.voided || !(isAllTime || (l.date && l.date.startsWith(year)))) continue;
    csv += `${l.date},"Publisher (General)",${esc(l.cat)},${esc(l.desc)},${getAmt(l).toFixed(2)},${esc(l.receipt)}\n`;
  }

  csv += "\n--- AUTHOR SETTLEMENT CASH (NOT ADDITIONAL SALES OR EXPENSES) ---\n";
  csv += "Date,Book,Currency,Money Held,Author Cut Kept,Remaining Earnings,Expenses Repaid,Other Debt Repaid,Overpayment Recovered,Cash Received,Cash Sent,Method\n";
  for (const book of input.books) {
    for (const p of (input.states[book.id]?.artistPayouts || []) as Row[]) {
      if (!p.settlement || p.voided || !inYear(p.date)) continue;
      const b = p.settlement.balance;
      csv += [p.date, esc(book.title), esc(p.settlement.cur), b.heldGross, b.heldShare, b.royaltiesOwed,
        b.expensesOwed || 0, b.otherDebt, b.overpaid, b.direction === "to-publisher" ? b.amount : 0,
        b.direction === "to-artist" ? b.amount : 0, esc(p.method || "")].join(",") + "\n";
    }
  }

  if (rateWarnings.size) {
    csv += "\n--- ⚠ FX RATE WARNINGS ---\n";
    csv += `${esc("No saved CAD exchange rate for these books — their amounts above were exported UNCONVERTED (rate 1.0) and are NOT correct. Open the Tax centre while online so today's rates are saved, then export again.")}\n`;
    csv += "Book Title,Currency,Rate Used\n";
    rateWarnings.forEach((w) => { csv += `${esc(w.title)},${esc(w.cur)},1.00\n`; });
  }
  if (waitingExpenses.size) {
    const n = waitingExpenses.size;
    csv += "\n--- ⚠ EXPENSES WAITING FOR AN EXCHANGE RATE ---\n";
    csv += `${esc(`${n} expense${n === 1 ? " is" : "s are"} still waiting for an exchange rate — counted as 0.00 CAD above, so the expense totals are NOT final. Open the Tax centre while online to fill them in, then export again.`)}\n`;
  }
  return {
    text: "﻿" + csv,
    name: `${fileStem({}, { name: pressName })}_Tax_Season_${isAllTime ? "AllTime" : year}_Export.csv`,
    waiting: waitingExpenses.size,
    unconverted: [...rateWarnings.values()],
  };
}
