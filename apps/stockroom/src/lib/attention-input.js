// What the to-do list (lib/attention-signals.js) is fed from the records, as pure functions. The stockroom app
// (main.js `attentionInput`) and the shop admin's To-do page (admin/stockroom/todo.ts) both call these, so the two
// lists are worked out the same way. Nothing here reads the browser or the network.
import { OC_STAGES } from './opencall.js';
import { roundCents } from './money.js';
import { isPostageExpense } from './postage-matching.js';
import { canonicalExpenseCategory } from './expense-categories.js';
import { unshippedOrders } from './order-followups.js';
import { datedCadRate } from './sale-fx.js';
import { linkedShippingSummary } from './shipping-reconciliation.js';

/**
 * Author submissions waiting, per book: `[{ bookId, bookTitle, sales, expenses }]`.
 * @param {Record<string, { sales?: object, expenses?: object } | null>} authorSubmissions bookId → pending entries by id
 * @param {(bookId: string) => string} [titleOf]
 */
export function submissionsInput(authorSubmissions, titleOf = (bookId) => bookId) {
  return Object.keys(authorSubmissions || {}).map((bookId) => {
    const subs = authorSubmissions[bookId] || {};
    return {
      bookId,
      bookTitle: titleOf(bookId) || bookId,
      sales: Object.keys(subs.sales || {}).length,
      expenses: Object.keys(subs.expenses || {}).length,
    };
  });
}

/**
 * Open-call contributors still waiting on a stage, per book: `[{ bookId, bookTitle, waiting }]`.
 * @param {Record<string, { openCall?: Array<Record<string, unknown>> } | null>} states bookId → records
 * @param {(bookId: string) => string} [titleOf]
 */
export function openCallWaiting(states, titleOf = (bookId) => bookId) {
  return Object.keys(states || {}).map((bookId) => {
    const list = states[bookId]?.openCall;
    if (!Array.isArray(list) || !list.length) return null;
    let waiting = 0;
    for (const c of list) {
      if (OC_STAGES.some((st) => !c?.[st.key])) waiting++;
    }
    return waiting > 0 ? { bookId, bookTitle: titleOf(bookId) || bookId, waiting } : null;
  }).filter(Boolean);
}

/**
 * Whether an expense is parcel postage that can be linked to an order. The old Shippo / Canada Post prefixes are kept,
 * and labels filed from counter receipts, carrier emails and Chit Chats count too — the same rule the shipping
 * analysis uses — so a linked label always shows in its order's margin.
 */
export function isLinkablePostageExpense(expense) {
  const ref = String(expense?.ref || '');
  return /^(shippo:|canadapost:|postage[:-]|chitchats:)/.test(ref) || isPostageExpense(expense || {});
}

/** Of these order numbers, the ones with a shipping label matched to them (the tax centre's expenses hold the labels). */
export function ordersWithLabels(nums = [], businessExpenses = []) {
  const wanted = new Set(nums.filter(Boolean));
  if (!wanted.size) return [];
  const expenses = (businessExpenses || []).filter(isLinkablePostageExpense);
  return [...wanted].filter((num) => linkedShippingSummary({ num }, expenses, 1).linkedCount > 0);
}

/**
 * The unsent orders that have a shipping label matched to them, for the "paid orders haven't been sent" line (an order
 * with a label is on its way). Only the orders that would otherwise be flagged are checked.
 */
export function labelledOrderNums(states, businessExpenses = []) {
  const rows = [];
  Object.entries(states || {}).forEach(([bookId, st]) => (st?.hist || []).forEach((entry) => rows.push({ bookId, entry })));
  return ordersWithLabels(unshippedOrders(rows).map((o) => o.num), businessExpenses);
}

/**
 * An expense's value in the book currency, valued exactly as the ledger does: the stored baseAmount, else a rate known
 * for the expense's own date, else 0 (the ledger flags those until healExpenseRates fills them in) — never today's
 * rate or a silent 1:1. `fxRates` is the app's rate cache; without one only CAD and stored amounts count.
 */
export function expenseBaseAmount(e, fxRates = {}) {
  if (e.baseAmount != null) return e.baseAmount;
  const eFx = datedCadRate(e.currency || 'CAD', e.date, fxRates);
  return (e.fxMissing && eFx.estimated) || eFx.missing
    ? 0
    : roundCents((e.amount || 0) * eFx.rate);
}

export function emptyTripBucket(rec) {
  return {
    total: 0,
    count: 0,
    latestDate: (rec && (rec.endDate || rec.startDate)) || '',
    minDate: (rec && rec.startDate) || '',
    maxDate: (rec && rec.endDate) || '',
    items: [],
    categories: {},
    record: rec || null,
  };
}

/** Every declared trip or event with its costs, keyed by name (what the Missing Costs scan reads as `tripsSummary`). */
export function tripsSummaryAll(taxCenter, fxRates = {}) {
  const tripSummary = {};
  (Array.isArray(taxCenter?.trips) ? taxCenter.trips : []).forEach((rec) => {
    const name = (rec.name || '').trim();
    if (!name) return;
    tripSummary[name] = emptyTripBucket(rec);
  });
  (taxCenter?.businessExpenses || []).forEach((e) => {
    const t = (e.trip || '').trim();
    if (!t) return;
    const eCur = e.currency || 'CAD';
    const eBase = expenseBaseAmount(e, fxRates);
    const cat = canonicalExpenseCategory(e.cat, 'Other');
    if (!tripSummary[t]) {
      tripSummary[t] = { total: 0, count: 0, latestDate: '', items: [], categories: {} };
    }
    tripSummary[t].total += eBase;
    tripSummary[t].count++;
    if (!tripSummary[t].categories[cat]) tripSummary[t].categories[cat] = 0;
    tripSummary[t].categories[cat] += eBase;
    if (e.date && (!tripSummary[t].latestDate || e.date > tripSummary[t].latestDate)) {
      tripSummary[t].latestDate = e.date;
    }
    tripSummary[t].items.push({ ...e, baseAmount: eBase, origCurrency: eCur, origAmount: e.amount || 0 });
  });
  return tripSummary;
}
