// The Tax Centre's ledger and the figures read off it, as plain functions of the records.
//
// These lived inside features/taxcentre.js (reading its globals); they are here so the Tax Centre screen, the CSV
// export, the Intelligence panel and the shop admin's own Tax Centre page all total the books the same way. Nothing
// here touches the DOM, the network or the database. The money rules are the ones already in sale-fx.js, cashflow.js,
// earnings.js and deductibility.js.
//
//   sources = { books, states, taxCenter, fxRateCache }
import { defaultState } from '../core/store.js';
import { computeCashFlowMetrics, cashFlowDelta } from './cashflow.js';
import { reconcileConsignmentMirrors } from './consignment.js';
import { payoutDebtCollected, payoutNetted } from './earnings.js';
import { deductibleAmount, deductibleRate } from './deductibility.js';
import { canonicalExpenseCategory } from './expense-categories.js';
import { fmt, getBookCurrencyCode, roundCents } from './money.js';
import { datedCadRate, saleCadAmounts } from './sale-fx.js';

/**
 * Every sale, expense, artist payout and business expense of a period as one list, plus the headline totals.
 * `selectedYear` is 'all' or 'YYYY'. Each sale is converted at its own date's rate, not today's.
 * @returns {{ totalGrossSales: number, totalOperatingExpenses: number, allLedger: object[] }}
 */
export function buildTaxLedger(sources, selectedYear) {
  const BOOKS = sources?.books || {};
  const states = sources?.states || {};
  const TAX_CENTER = sources?.taxCenter || {};
  const _fxRateCache = sources?.fxRateCache || {};
  let totalGrossSales = 0;
  let totalOperatingExpenses = 0;
  let allLedger = [];

  Object.keys(BOOKS).forEach(bid => {
    if (bid.toLowerCase().includes('test') || BOOKS[bid]?.title?.toLowerCase()?.includes('test')) return;
    const s = states[bid] || defaultState(BOOKS[bid]);
    const b = BOOKS[bid];
    const cur = getBookCurrencyCode(b);
    // Re-derive consignment Sale mirrors from their canonical ledger rows, so a
    // sale corrected in the Consignment tab reports its NEW amount here (and in
    // the CSV export built from these rows) rather than the amount it was first
    // recorded at, and so an invoice rename reaches the Receipt/Ref column.
    reconcileConsignmentMirrors(s);

    // Each sale is converted at its own date's rate (see lib/sale-fx.js), not
    // today's, so a past year's totals don't move with the exchange rate.

    // Add sales to ledger
    // ⚡ Bolt Optimization: Use imperative loop to avoid array allocation from .filter()
    if (s.hist && s.hist.length > 0) {
      for (const h of s.hist) {
        if (h.artistPending && !h.voided) continue;

        const hYear = h.date ? h.date.substring(0, 4) : '';
        if (selectedYear !== 'all' && hYear !== selectedYear) continue;

        const fx = saleCadAmounts(h, cur, _fxRateCache);
        const amt = fx.merchandise;
        const baseAmt = fx.merchandiseCad;
        totalGrossSales = roundCents(totalGrossSales + baseAmt);

        allLedger.push({
          date: h.date,
          type: 'Sale',
          desc: `${b.title} (Qty: ${h.qty || 1})`,
          cat: 'Income',
          ref: h.num,
          invoiceNum: h.consignmentLink ? (h.invoiceNum || '') : '',
          origCurrency: cur,
          origAmount: amt,
          baseAmount: baseAmt,
          qty: h.qty || 1,
          voided: !!h.voided,
          hasRateError: fx.missing,
          rateEstimated: fx.estimated && !fx.missing && !h.voided,
          isIncome: true,
          sourceType: 'sale',
          sourceId: bid,
          itemId: h.id || h.num
        });

        // Customer shipping is recorded in CAD whatever the book's currency.
        const shippingIncome = h.voided ? 0 : (Number(h.shippingPaid) || 0);
        if (shippingIncome > 0) {
          const shippingBase = fx.shippingCad;
          totalGrossSales = roundCents(totalGrossSales + shippingBase);
          allLedger.push({
            date: h.date,
            type: 'Shipping income',
            desc: `Customer shipping paid (${b.title})`,
            cat: 'Income',
            ref: h.num,
            origCurrency: 'CAD',
            origAmount: shippingIncome,
            baseAmount: shippingBase,
            qty: 0,
            voided: false,
            hasRateError: false,
            isIncome: true,
            sourceType: 'shippingIncome',
            sourceId: bid,
            itemId: `${h.id || h.num}-shipping-income`,
          });
        }
      }
    }

    // Add book specific expenses
    (s.expenses || []).forEach(e => {
      const eYear = e.date ? e.date.substring(0, 4) : '';
      if (selectedYear !== 'all' && eYear !== selectedYear) return;

      // Use stored origCurrency/origAmount for display, and stored baseAmount to avoid double-conversion.
      // Fallback for legacy entries that don't have baseAmount stored.
      const displayOrigCur = e.origCurrency || e.currency || 'CAD';
      const displayOrigAmt = e.origAmount != null ? e.origAmount : (e.amount || 0);
      const bookCur = e.currency || 'CAD';

      let eBase;
      let eRateMissing = false;
      if (e.baseAmount != null) {
        // Pre-calculated at submission time — no double conversion
        eBase = e.baseAmount;
      } else {
        // No stored CAD value: convert at the expense's own date's rate.
        const eRate = datedCadRate(bookCur, e.date, _fxRateCache);
        eBase = roundCents((e.amount || 0) * eRate.rate);
        eRateMissing = eRate.missing;
      }

      totalOperatingExpenses += eBase;

      allLedger.push({
        date: e.date,
        type: 'Expense',
        desc: e.desc + ` (${b.title})`,
        cat: canonicalExpenseCategory(e.cat, 'Project Expense'),
        ref: e.shippingOrderNumber ? `${e.ref || ''} · ${e.shippingOrderNumber}` : e.ref || '',
        receipt: e.receipt || '',
        origCurrency: displayOrigCur,
        origAmount: displayOrigAmt,
        baseAmount: eBase,
        hasRateError: eRateMissing,
        isIncome: false,
        sourceType: 'bookExpense',
        sourceId: bid,
        itemId: e.id
      });
    });

    // Add artist payments.
    //
    // Sourced from `artistPayouts` — the payments the publisher actually
    // recorded. This previously read `artistTransfers` filtered on a `paid`
    // flag that nothing ever sets (settlement deletes the transfer instead of
    // marking it), so no artist payout ever reached the ledger, the CSV or the
    // "Artist Payouts" KPI, and the row edit/delete paths were unreachable.
    // ⚡ Bolt Optimization: Use imperative loop to avoid array allocation from .filter()
    if (s.artistPayouts && s.artistPayouts.length > 0) {
      for (const p of s.artistPayouts) {
        if (p.voided) continue;

        const tDate = p.date || '';
        const tYear = tDate ? tDate.substring(0, 4) : '';
        if (selectedYear !== 'all' && tYear !== selectedYear) continue;

        // `amount` is always in the book's own currency; a payout paid in
        // another currency keeps that cash in `payment` for the audit trail.
        const pAmount = Number(p.amount) || 0;
        const pFx = datedCadRate(cur, tDate, _fxRateCache);
        const pBase = roundCents(pAmount * pFx.rate);
        allLedger.push({
          date: tDate,
          type: 'Expense',
          // The ledger counts cash only; say when part of the royalty was
          // settled by netting a debt, so a small or zero row isn't a mystery.
          desc: p.settlement
            ? `Author settlement (${b.title}) — earnings settled, including money retained from sales`
            : payoutNetted(p) > 0.005
            ? `Artist Payout (${b.title}) — plus ${fmt(payoutNetted(p), cur)} netted against money owed`
            : `Artist Payout (${b.title})`,
          cat: 'Artist Royalties',
          ref: p.method || p.sourceNum || '',
          origCurrency: cur,
          origAmount: pAmount,
          baseAmount: pBase,
          hasRateError: pFx.missing,
          rateEstimated: pFx.estimated && !pFx.missing,
          isIncome: false,
          // An artist payout is backed by the payment record, not a till slip.
          receiptExempt: true,
          sourceType: 'artistPayout',
          sourceId: bid,
          itemId: p.id
        });
        const debtCollected = payoutDebtCollected(p);
        if (debtCollected > 0) allLedger.push({
          date: tDate, type: 'Transfer', desc: `Author debt settled (${b.title}) — included in the combined payment; not another sale`,
          cat: 'Debt repayment', ref: p.method || '', origCurrency: cur,
          origAmount: debtCollected, baseAmount: roundCents(debtCollected * pFx.rate),
          hasRateError: pFx.missing, isIncome: true, sourceType: 'artistDebtRecovery', sourceId: bid, itemId: p.id,
        });
      }
    }
  });

  (TAX_CENTER.businessExpenses || []).forEach(e => {
    const eYear = e.date ? e.date.substring(0, 4) : '';
    if (selectedYear !== 'all' && eYear !== selectedYear) return;

    const eCur = e.currency || 'CAD';
    // Use stored baseAmount when available to avoid re-conversion. Without one,
    // a rate already known for the expense's date gives the value; otherwise it
    // counts as 0 and is flagged until healExpenseRates fills it in.
    const eFx = datedCadRate(eCur, e.date, _fxRateCache);
    const eBase = e.baseAmount != null
      ? e.baseAmount
      : (e.fxMissing && eFx.estimated) || eFx.missing
        ? 0
        : roundCents((e.amount || 0) * eFx.rate);

    if (e.affectsCashFlow !== false) totalOperatingExpenses += eBase;

    allLedger.push({
      date: e.date,
      type: 'Business Exp.',
      desc: e.desc,
      cat: canonicalExpenseCategory(e.cat),
      ref: e.ref || '',
      receipt: e.receipt || '',
      receiptFiles: e.receiptFiles || [],
      origCurrency: eCur,
      origAmount: e.amount || 0,
      baseAmount: eBase,
      hasRateError: e.baseAmount == null && ((!!e.fxMissing && eFx.estimated) || eFx.missing),
      isIncome: false,
      // Inventory write-downs and the like carry this flag on the saved expense.
      receiptExempt: !!(e.receiptExempt || e.isRent),
      sourceType: 'businessExpense',
      itemId: e.id,
      trip: e.trip || '',
      affectsCashFlow: e.affectsCashFlow !== false
    });
  });

  return { totalGrossSales, totalOperatingExpenses, allLedger };
}

/**
 * An expense's value in the base currency, valued exactly as the ledger does: the stored baseAmount, else a rate known
 * for the expense's own date, else 0 (the ledger flags those until the rates are filled in) - never today's rate or a
 * silent 1:1.
 */
export function expenseBaseAmount(e, fxRateCache = {}) {
  if (e.baseAmount != null) return e.baseAmount;
  const eFx = datedCadRate(e.currency || 'CAD', e.date, fxRateCache);
  return (e.fxMissing && eFx.estimated) || eFx.missing
    ? 0
    : roundCents((e.amount || 0) * eFx.rate);
}

/**
 * Business-expense trips: the declared trips (`taxCenter.trips`) plus every trip name an expense carries, each with its
 * total, count, latest date, spend per category and expenses.
 * @returns {Record<string, { total: number, count: number, latestDate: string, items: object[], categories: Record<string, number>, record?: object|null }>}
 */
export function tripsSummary(taxCenter, fxRateCache = {}) {
  const tc = taxCenter || {};
  const out = {};
  (Array.isArray(tc.trips) ? tc.trips : []).forEach((rec) => {
    const name = (rec.name || '').trim();
    if (!name) return;
    out[name] = {
      total: 0,
      count: 0,
      latestDate: (rec && (rec.endDate || rec.startDate)) || '',
      minDate: (rec && rec.startDate) || '',
      maxDate: (rec && rec.endDate) || '',
      items: [],
      categories: {},
      record: rec || null,
    };
  });
  (tc.businessExpenses || []).forEach((e) => {
    const t = (e.trip || '').trim();
    if (!t) return;
    const eCur = e.currency || 'CAD';
    const eBase = expenseBaseAmount(e, fxRateCache);
    const cat = canonicalExpenseCategory(e.cat, 'Other');
    if (!out[t]) out[t] = { total: 0, count: 0, latestDate: '', items: [], categories: {} };
    out[t].total += eBase;
    out[t].count++;
    if (!out[t].categories[cat]) out[t].categories[cat] = 0;
    out[t].categories[cat] += eBase;
    if (e.date && (!out[t].latestDate || e.date > out[t].latestDate)) {
      out[t].latestDate = e.date;
    }
    out[t].items.push({ ...e, baseAmount: eBase, origCurrency: eCur, origAmount: e.amount || 0 });
  });
  return out;
}

/**
 * The Trips panel's figures for one period ('all' or 'YYYY'): declared trips whose dates touch the year (they show
 * even with nothing spent yet) plus every trip name the year's business expenses carry. Each has its total (valued as
 * the ledger values it), count, the first and last expense date, spend per category, the deductible part (Meals &
 * Entertainment is capped) and the expenses.
 */
export function tripsForYear(taxCenter, fxRateCache = {}, selectedYear = 'all') {
  const tc = taxCenter || {};
  const out = {};
  (Array.isArray(tc.trips) ? tc.trips : []).forEach((rec) => {
    const name = (rec.name || '').trim();
    if (!name) return;
    if (selectedYear !== 'all') {
      const years = [rec.startDate, rec.endDate, rec.created].filter(Boolean).map((d) => String(d).substring(0, 4));
      if (years.length && !years.includes(selectedYear)) return;
    }
    out[name] = {
      total: 0, count: 0,
      latestDate: (rec && (rec.endDate || rec.startDate)) || '',
      minDate: (rec && rec.startDate) || '', maxDate: (rec && rec.endDate) || '',
      items: [], categories: {}, record: rec || null,
    };
  });
  (tc.businessExpenses || []).forEach((e) => {
    const eYear = e.date ? e.date.substring(0, 4) : '';
    if (selectedYear !== 'all' && eYear !== selectedYear) return;
    const t = (e.trip || '').trim();
    if (!t) return;
    const eCur = e.currency || 'CAD';
    const eBase = expenseBaseAmount(e, fxRateCache);
    const cat = canonicalExpenseCategory(e.cat, 'Other');
    if (!out[t]) out[t] = { total: 0, count: 0, items: [], categories: {}, minDate: '', maxDate: '' };
    out[t].total += eBase;
    out[t].count++;
    if (!out[t].categories[cat]) out[t].categories[cat] = 0;
    out[t].categories[cat] += eBase;
    out[t].deductible = (out[t].deductible || 0) + deductibleAmount(cat, eBase);
    if (e.date) {
      if (!out[t].minDate || e.date < out[t].minDate) out[t].minDate = e.date;
      if (!out[t].maxDate || e.date > out[t].maxDate) out[t].maxDate = e.date;
    }
    out[t].items.push({ ...e, baseAmount: eBase, origCurrency: eCur, origAmount: e.amount || 0 });
  });
  return out;
}

/**
 * Spend by category from the ledger: `total` is what the tax rules let you deduct (Meals & Entertainment is capped at
 * half), `spent` is what actually left the bank account. Largest deduction first.
 * @returns {{ list: Array<{ name: string, total: number, spent: number, rate: number, count: number, items: object[] }>, grandTotal: number, totalTxns: number }}
 */
export function categorySummary(allLedger) {
  const byName = {};
  let grandTotal = 0;
  let totalTxns = 0;
  for (const ex of allLedger || []) {
    if (ex.isIncome) continue;
    const c = ex.cat || 'Uncategorized';
    if (!byName[c]) byName[c] = { total: 0, spent: 0, rate: deductibleRate(c), count: 0, items: [] };
    const deductible = deductibleAmount(c, ex.baseAmount);
    byName[c].total += deductible;
    byName[c].spent += ex.baseAmount;
    byName[c].count++;
    byName[c].items.push(ex);
    grandTotal += deductible;
    totalTxns++;
  }
  const list = Object.keys(byName).map((name) => ({ name, ...byName[name] })).sort((a, b) => b.total - a.total);
  return { list, grandTotal, totalTxns };
}

/**
 * The headline cash-flow figures for a period and, for a single year, the change on the year before (the "vs last
 * year" chips). `ledger` is buildTaxLedger's result for the same year.
 */
export function cashFlowSummary(sources, selectedYear, ledger) {
  const { totalGrossSales, totalOperatingExpenses } = ledger;
  const netCashFlow = totalGrossSales - totalOperatingExpenses;
  const cur = computeCashFlowMetrics(sources, selectedYear);
  const netAfterPayouts = netCashFlow - cur.artistPayouts + (cur.artistDebtRecovered || 0) + (cur.artistSettlementCashAdjustment || 0);
  const out = {
    sales: totalGrossSales,
    expenses: totalOperatingExpenses,
    net: netCashFlow,
    artistPayouts: cur.artistPayouts,
    artistDebtRecovered: cur.artistDebtRecovered || 0,
    netAfterPayouts,
    profitMargin: totalGrossSales > 0 ? (netCashFlow / totalGrossSales) * 100 : null,
    avgSale: cur.txnCount > 0 ? totalGrossSales / cur.txnCount : null,
    txnCount: cur.txnCount,
    unitsSold: cur.unitsSold,
    prevYear: null,
    deltas: null,
  };
  if (selectedYear !== 'all' && /^\d{4}$/.test(selectedYear)) {
    const prevYear = String(Number(selectedYear) - 1);
    const prev = computeCashFlowMetrics(sources, prevYear);
    const prevNet = prev.grossSales - prev.operatingExpenses;
    out.prevYear = prevYear;
    out.deltas = {
      sales: cashFlowDelta(cur.grossSales, prev.grossSales),
      expenses: cashFlowDelta(cur.operatingExpenses, prev.operatingExpenses),
      net: cashFlowDelta(netCashFlow, prevNet),
    };
  }
  return out;
}

/** How many ledger rows lean on a missing (`missing`) or today's (`estimated`) exchange rate. */
export function rateNotes(allLedger) {
  const rows = allLedger || [];
  return { missing: rows.filter((r) => r.hasRateError).length, estimated: rows.filter((r) => r.rateEstimated).length };
}

/** The years the ledger holds something in, newest first (the year picker). */
export function ledgerYears(allLedger) {
  const years = new Set();
  for (const r of allLedger || []) {
    const y = r.date ? String(r.date).substring(0, 4) : '';
    if (/^\d{4}$/.test(y)) years.add(y);
  }
  return [...years].sort().reverse();
}

/** The rows of the ledger CSV: a header row, then every ledger row with the base-currency column signed. */
export function ledgerCsvRows(data, baseCurrency) {
  const rows = [['Date', 'Type', 'Description', 'Category', 'Receipt/Ref', 'Orig Currency', 'Amount (Orig)', `Amount (${baseCurrency})`]];
  for (const r of data) {
    // Sign the base-currency column so totals sum correctly in a spreadsheet.
    const signedBase = (r.isIncome ? 1 : -1) * Number(r.baseAmount || 0);
    rows.push([
      r.date || '',
      r.type || '',
      r.desc || '',
      r.cat || '',
      [r.ref || '', r.invoiceNum ? `Invoice ${r.invoiceNum}` : ''].filter(Boolean).join(' · '),
      r.origCurrency || '',
      Number(r.origAmount || 0).toFixed(2),
      signedBase.toFixed(2),
    ]);
  }
  return rows;
}

/** Whether a ledger row belongs to the 'all' | 'sales' | 'expenses' filter. */
export function ledgerRowInType(row, type) {
  if (type === 'sales') return !!row.isIncome;
  if (type === 'expenses') return !row.isIncome;
  return true;
}

/** Whether a ledger row matches the search words (already trimmed and lower-cased). Empty matches everything. */
export function ledgerRowMatchesText(row, query) {
  if (!query) return true;
  const hay = `${row.date || ''} ${row.type || ''} ${row.desc || ''} ${row.cat || ''} ${row.ref || ''} ${row.origCurrency || ''}`.toLowerCase();
  return hay.includes(query);
}
