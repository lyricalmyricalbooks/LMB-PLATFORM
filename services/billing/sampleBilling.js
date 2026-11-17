// Sample billing for the platform's own test shops (Julian, 17 November 2026: "add data so I can see what's going on
// inside"). A test shop is never billed (billing.js skips `testShop` rows), so its Settings › Plan and Settings › Billing
// had nothing to show. Instead of a made-up Stripe customer, the shop's billing door (accounts/shopBillingDoor.js)
// answers a test shop that has no real plan from here: a plan out of its trial, a card on file, the next bill, the
// running costs so far, past monthly bills with a printable copy, and billing details. Every date moves with the day.
//
// - testShopPlanDocument(row, { platformUrl, now }): the shop's `platform/plan` copy (shopPlan.js planDocument's
//   shape), so the admin knows where its billing pages are. Written by the control room's Reset sample data and by setup
//   step 12 for a test shop only; a real plan later writes over it (billing.js syncShopPlan).
// - sampleBillingAnswer(call, row, { settings, now, email }): the answer to one billing call, `undefined` for a call
//   that isn't billing (the download), or a 409 for any change (nothing here is real, so nothing can change).
//
// Amounts are in the shop's own currency (US dollars for the US test shop). The Canadian shops' bills carry Ontario's
// HST, as a Toronto address would; the US shop's carry none. Every name says "Sample" or "Test" and every address is made
// up (example.com, "Example Street").
import { BillingError } from "./billing.js";
import { currencyOf, moneyWords } from "./currencies.js";
import { EXAMPLE_SHOPS, meterCost, monthWords } from "./runningCost.js";
import { trackerAnswer, trackerFigures } from "./costTracker.js";
import { planDocument } from "./shopPlan.js";
import { PLAN_IDS, PLAN_APPS } from "./plans.js";
import { PLAN_NAMES } from "../settings.js";

const FEE_CENTS = 500;
const FOUNDING_PERCENT = 25;
const HST = Object.freeze({ words: "HST (13%), Ontario", rate: 0.13 });
/** The shop document the sample plan lives in (shopPlan.js PLAN_DOC). */
export { PLAN_DOC as SAMPLE_PLAN_DOC } from "./shopPlan.js";
/** The calls the sample answers; every other billing call is a change and is refused. `download` is real either way. */
export const SAMPLE_READS = Object.freeze(["status", "costs", "upcoming", "payment-methods", "invoices", "details", "payment-way"]);
const NOT_BILLING = new Set(["download"]);

/** The first of the month `back` months before `now`'s, as an ISO time. */
const firstOf = (now, back = 0) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1, 12)).toISOString();
const monthOf = (iso) => iso.slice(0, 7);

/** A typical shop's month (runningCost.js EXAMPLE_SHOPS), so the sample's numbers are the platform's own prices. */
const TYPICAL = EXAMPLE_SHOPS.find((shop) => shop.id === "typical").meters;
const scaled = (meters, share) => Object.fromEntries(Object.entries(meters).map(([kind, n]) => [kind, n * share]));

/** The sample's facts for one test shop: currency, the fee after the founding offer, its months and their running costs. */
function sampleFacts(row, settings, nowDate) {
  const currency = String(currencyOf(row, settings)).toUpperCase();
  const money = (cents) => moneyWords(cents, currency, settings);
  const feeAfter = Math.round(FEE_CENTS * (1 - FOUNDING_PERCENT / 100));
  const taxed = currency === "CAD";
  // Three closed months of running costs (busier each month), then this one so far.
  const typical = meterCost(TYPICAL).cents;
  const history = Object.fromEntries([3, 2, 1].map((back, i) => [monthOf(firstOf(nowDate, back)), { cents: Math.round(typical * [0.62, 0.8, 0.94][i]) }]));
  return { currency, money, feeAfter, taxed, history, trialEnd: firstOf(nowDate, 3), periodEnd: firstOf(nowDate, -1) };
}


/** A bill: what the shop's Bills list and its printed copy read (billing.js invoicePage), all made up. */
function sampleBill({ number, date, coversFrom, coversTo, lines, discount, tax, currency, money, to, settings }) {
  const subtotal = lines.reduce((sum, l) => sum + l.cents, 0);
  const total = subtotal - discount + tax;
  return {
    id: `in_sample_${number.slice(-4)}`,
    number,
    date,
    covers: { from: coversFrom, to: coversTo },
    amount: money(total),
    tax: tax ? money(tax) : "",
    status: "paid",
    pdfUrl: null,
    pageUrl: null,
    paper: {
      from: { name: settings.platformName, address: settings.mailingAddress || "", taxNumbers: [] },
      to,
      currency,
      lines: lines.map((l) => ({ words: l.words, amount: money(l.cents) })),
      subtotal: money(subtotal),
      discount: discount ? money(discount) : "",
      taxes: tax ? [{ words: HST.words, amount: money(tax) }] : [],
      total: money(total),
      paid: money(total),
      due: money(0),
      paidAt: date,
    },
  };
}

/** The billing address a test shop shows: made up, in its own country. */
const sampleAddress = (currency) => (currency === "USD"
  ? { line1: "1 Example Street", line2: "", city: "Portland", state: "OR", postalCode: "97205", country: "US" }
  : { line1: "1 Example Street", line2: "", city: "Toronto", state: "ON", postalCode: "M5V 0A1", country: "CA" });

/**
 * The shop's `platform/plan` for a test shop: open, out of its trial, a card on file, the founding offer, and the hub its
 * admin's Settings › Billing calls. Same shape as a real plan's copy (shopPlan.js planDocument).
 */
export function testShopPlanDocument(row, { platformUrl, now = new Date() }) {
  if (row?.testShop !== true) throw new Error("only a test shop gets sample billing");
  const base = String(platformUrl ?? "").replace(/\/+$/, "");
  if (!/^https:\/\/[^/\s]+$/.test(base)) throw new Error("the platform's https address is needed for the sample plan");
  const doc = planDocument(
    { shopId: row.shopId, plan: "both", status: "active", access: "open", hasCard: true, founding: true, trialEnd: firstOf(now, 3), currentPeriodEnd: firstOf(now, -1), paymentWay: "monthly" },
    { link: `${base}/account/billing?shop=${encodeURIComponent(row.shopId)}`, hub: `${base}/api/shop-billing/`, at: now.toISOString() },
  );
  // Marked, so a reset only ever writes over its own sample, never a real plan's copy.
  return { ...doc, sample: true };
}

/**
 * One billing call answered from the sample. `email` is the signed-in owner's (printed on the bills and details).
 * Returns undefined for a call that isn't billing, so the door runs the real one.
 */
export function sampleBillingAnswer(call, row, { settings, now = new Date(), email = "" }) {
  if (NOT_BILLING.has(call)) return undefined;
  if (!SAMPLE_READS.includes(call)) {
    throw new BillingError(409, "This is a test shop, so its billing is sample data and can't be changed. A real shop's billing works as normal.");
  }
  const facts = sampleFacts(row, settings, now);
  const { currency, money, feeAfter, taxed, history } = facts;
  const pressName = row.pressName || row.shopId;
  const address = sampleAddress(currency);
  const discount = FEE_CENTS - feeAfter;
  const taxOn = (cents) => (taxed ? Math.round(cents * HST.rate) : 0);
  const card = { brand: "visa", last4: "4242", expMonth: 12, expYear: now.getUTCFullYear() + 3 };
  const name = PLAN_NAMES.both;

  if (call === "status") {
    const lastMonth = monthOf(firstOf(now, 1));
    return {
      billing: {
        plan: "both", planName: name, price: money(FEE_CENTS), plusTax: taxed, currency, status: "active", access: "open",
        trialEnd: facts.trialEnd, trialDaysLeft: null, currentPeriodEnd: facts.periodEnd, nextPaymentAt: facts.periodEnd,
        cancelAtPeriodEnd: false, cancelEndsAt: null,
        hasCard: true, card: { ...card, words: "Visa ending 4242" },
        appsClosing: null, closedApps: {},
        plans: PLAN_IDS.map((id) => ({ plan: id, name: PLAN_NAMES[id], price: money(FEE_CENTS), apps: ["shop", "stockroom"].filter((app) => PLAN_APPS[id][app]) })),
        paymentWay: "monthly",
        usage: { fee: money(FEE_CENTS), lastMonth: { month: lastMonth, monthWords: monthWords(lastMonth), cents: history[lastMonth].cents, text: money(history[lastMonth].cents) }, alert: { cents: 2500, text: money(2500) } },
        founding: { percentOff: FOUNDING_PERCENT, price: money(feeAfter) },
        paymentProblem: null, canPayNow: false, cardRunsOut: null,
        emailLanguage: { choice: "auto", sends: ["en"] },
      },
    };
  }
  if (call === "costs") {
    const month = monthOf(now.toISOString());
    // This month so far: the typical shop's counts at the month's pace, its sizes as they stand.
    const start = Date.parse(firstOf(now));
    const gone = Math.min(1, Math.max(0.03, (now.getTime() - start) / (30 * 86_400_000)));
    const record = { ...scaled(TYPICAL, gone), firestoreGb: TYPICAL.firestoreGb, storageGb: TYPICAL.storageGb };
    const figures = trackerFigures({ month, now: now.getTime(), record, history, feeCents: FEE_CENTS, feeAfterCents: feeAfter, alertCents: 2500, paidFrom: facts.trialEnd });
    return { costs: trackerAnswer(figures, { currency, money, plusTax: taxed, updatedAt: new Date(now.getTime() - 3 * 3_600_000).toISOString(), percentOff: FOUNDING_PERCENT }) };
  }
  if (call === "upcoming") {
    const lastMonth = monthOf(firstOf(now, 1));
    const next = monthOf(facts.periodEnd);
    const lines = [{ words: `${name} fee, ${monthWords(next)}`, cents: FEE_CENTS }, { words: `Running cost, ${monthWords(lastMonth)}`, cents: history[lastMonth].cents }];
    const beforeTax = FEE_CENTS + history[lastMonth].cents - discount;
    const tax = taxOn(beforeTax);
    return {
      bill: {
        date: facts.periodEnd,
        lines: lines.map((l) => ({ words: l.words, amount: money(l.cents) })),
        subtotal: money(FEE_CENTS + history[lastMonth].cents),
        discount: money(discount),
        tax: tax ? money(tax) : "",
        total: money(beforeTax + tax),
        cents: { beforeTax, tax },
      },
    };
  }
  if (call === "payment-methods") {
    return {
      cards: [
        { id: "pm_sample_visa", words: "Visa ending 4242", ...card, primary: true, expired: false },
        { id: "pm_sample_mc", words: "Mastercard ending 4444", brand: "mastercard", last4: "4444", expMonth: 8, expYear: now.getUTCFullYear() + 1, primary: false, expired: false },
      ],
    };
  }
  if (call === "details") {
    return { details: { name: pressName, email, address, taxNumber: "", taxLabel: taxed ? "GST/HST" : "", plusTax: taxed, currency, country: address.country } };
  }
  if (call === "payment-way") return { view: null, status: null };

  // invoices: the month the trial ended, then each month since, newest first. A month's bill is its fee plus the
  // running cost of the month before (none for the first).
  const to = { name: pressName, email, address: [address.line1, `${address.city} ${address.state} ${address.postalCode}`, address.country], taxNumbers: [] };
  const bills = [3, 2, 1, 0].map((back, i) => {
    const date = firstOf(now, back);
    const before = monthOf(firstOf(now, back + 1));
    const lines = [{ words: `${name} fee, ${monthWords(monthOf(date))}`, cents: FEE_CENTS }, ...(history[before] ? [{ words: `Running cost, ${monthWords(before)}`, cents: history[before].cents }] : [])];
    const tax = taxOn(lines.reduce((sum, l) => sum + l.cents, 0) - discount);
    return sampleBill({ number: `SAMPLE-${String(i + 1).padStart(4, "0")}`, date, coversFrom: date, coversTo: firstOf(now, back - 1), lines, discount, tax, currency, money, to, settings });
  });
  return { invoices: bills.reverse(), more: false, after: null };
}
