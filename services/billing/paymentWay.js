// Two ways to pay for a plan (code plan 6.19): **monthly** (the plan's price, on a subscription) or **pay as you sell**
// (a share of each website sale, taken with the sale by services/payments, never more in a billing month than the
// plan's monthly price). Pay as you sell is for the Shop and Shop-and-stockroom plans; the stockroom alone stays monthly.
//
// Switching takes effect at the start of the next billing month, or at once during the trial:
//   - to pay as you sell: the subscription is cancelled at the end of the month already paid for (or the trial), and the
//     fees start then; the trial itself takes no fee. A plan paused for want of a card ends now, and the shop opens:
//     pay as you sell needs no card. No subscription is charged while the press pays as they sell.
//   - to monthly: a switch that hasn't happened yet is undone (the subscription goes on as it was). Otherwise a new
//     subscription starts when the current pay-as-you-sell month ends, free until then; it asks for a card at that date
//     and pauses without one, like the trial.
//
// The billing record (the subscriptions store) keeps `paymentWay` ("monthly" | "payAsYouSell"), `paymentWayFrom` and the
// terms; the shop's registry row gets `payAsYouSell: { basisPoints, capMinor, currency, from, until }`, which is what
// services/payments reads at each checkout (payAsYouSell.js). The terms are fixed when the press chooses: a later change
// of the setting applies to new choices only.
//
// Settings: `liveSettings().payAsYouSell.basisPoints` (default 200 = 2%; 0 closes the option to new choices) and the
// founding offer (`foundingOffer.percentOff`, default 25), which takes its share off both the percentage and the cap for
// a founding press (the registry row's or billing record's `founding: true`). The cap is the plan's monthly price.
// Both come from services/settings.js `liveSettings({ env, store })`.
import { ACCESS, BillingError, dateText } from "./billing.js";
import { planPrice } from "./plans.js";
import { liveSettings, priceText } from "../settings.js";
import { PAY_AS_YOU_SELL_PLANS, billingMonth, createFeeLedger } from "../payments/payAsYouSell.js";
import { currentPaymentWay, payAsYouSellAccess } from "./paymentWayState.js";

export { currentPaymentWay, payAsYouSellAccess };

export const PAYMENT_WAYS = Object.freeze(["monthly", "payAsYouSell"]);

const ENDED = new Set(["canceled", "incomplete_expired"]);

/** "2%" or "1.5%" for a share in hundredths of a percent. */
export const percentText = (basisPoints) => `${Number((basisPoints / 100).toFixed(2))}%`;

/**
 * The pay-as-you-sell terms a press choosing now gets: { basisPoints, capMinor, currency }. Refuses, in plain words,
 * the stockroom alone and an option turned off.
 */
export function payAsYouSellTerms({ plan, settings, live, founding = false }) {
  if (!PAY_AS_YOU_SELL_PLANS.includes(plan)) throw new BillingError(400, "Pay as you sell is for plans with the shop. The stockroom on its own is paid monthly.");
  const basisPoints = live?.payAsYouSell?.basisPoints ?? 0;
  if (!Number.isInteger(basisPoints) || basisPoints <= 0 || basisPoints > 10000) throw new BillingError(409, "Pay as you sell isn't open to new choices right now.");
  const off = founding ? Math.min(Math.max(live?.foundingOffer?.percentOff ?? 0, 0), 100) : 0;
  const less = (value) => Math.floor((value * (100 - off)) / 100);
  return { basisPoints: less(basisPoints), capMinor: less(planPrice(plan, settings).amount), currency: settings.currency.toUpperCase() };
}

/**
 * The Plan & billing page's "How you pay" section (`payment-way`), in plain words, from paymentWay.status():
 * { way, title, lines: [string], button: { label, to } | null, note }.
 */
export function paymentWayView(status, settings) {
  const money = (minor) => priceText(minor, settings.currency).replace(/\.00$/, "");
  const offerLine = (terms) => `${percentText(terms.basisPoints)} of your website sales, never more than ${money(terms.capMinor)} a month`;
  const base = { id: "payment-way", title: "How you pay" };
  if (!status) return { ...base, way: null, lines: ["Choose a plan first."], button: null, note: "" };
  const monthly = `${status.price.replace(/\.00$/, "")} a month`;

  if (!status.canPayAsYouSell) {
    return { ...base, way: "monthly", lines: [`You pay ${monthly}.`], button: null, note: status.plan === "stockroom" ? "The stockroom on its own is paid monthly." : "" };
  }

  if (status.paymentWayChosen === "monthly" && status.payAsYouSell?.until) {
    return {
      ...base, way: "payAsYouSell",
      lines: [`You pay ${offerLine(status.payAsYouSell)} until ${dateText(status.payAsYouSell.until)}.`, `From then you pay ${monthly}. We'll ask for a card then.`],
      button: { label: "Switch to pay as you sell", to: "payAsYouSell" }, note: "",
    };
  }

  if (status.paymentWayChosen === "payAsYouSell") {
    const terms = status.payAsYouSell;
    const lines = [];
    if (status.paymentWay === "monthly") {
      lines.push(`You pay ${monthly} until ${dateText(terms.from)}.`, `From then you pay ${offerLine(terms)}.`);
    } else {
      lines.push(`You pay ${offerLine(terms)}.`);
      if (status.inTrial) lines.push(`Your free trial takes no fee. Fees start on ${dateText(terms.from)}.`);
      else if (status.month) {
        const { feesMinor, capMinor, end } = status.month;
        lines.push(feesMinor >= capMinor
          ? `You've reached this month's ${money(capMinor)}, so the rest of the month is free. A new month starts on ${dateText(end)}.`
          : `This month so far: ${priceText(feesMinor, settings.currency)}. A new month starts on ${dateText(end)}.`);
      }
    }
    return { ...base, way: "payAsYouSell", lines, button: { label: "Switch to monthly", to: "monthly" }, note: "No card is needed to pay as you sell." };
  }

  const offer = status.offer;
  return {
    ...base, way: "monthly",
    lines: [`You pay ${monthly}.`, ...(offer ? [`Or pay ${offerLine(offer)}. Switching starts ${status.inTrial || status.access !== "open" ? "now" : `on ${dateText(status.currentPeriodEnd)}`}.`] : [])],
    button: offer ? { label: "Switch to pay as you sell", to: "payAsYouSell" } : null,
    note: "",
  };
}

/**
 * @param {object} deps billing's own clients (billing.js lists them), plus:
 * @param {object} deps.billing createBilling(...) for its status and prices
 * @param {object} [deps.feeLedger] the pay-as-you-sell ledger store (services/payments/payAsYouSell.js), for the month's
 *   fees so far
 * @param {() => Promise<object>} [deps.live] the control room's settings (services/settings.js liveSettings by default)
 */
export function createPaymentWay({ stripe, mode = "test", settings, customers, subscriptions, registry, auditLog, billing, feeLedger = null, live = () => liveSettings(), now = () => Date.now() }) {
  const at = () => new Date(now()).toISOString();
  const call = (method, path, options) => stripe.call(mode, method, path, options);
  const ledger = feeLedger ? createFeeLedger({ store: feeLedger, now }) : null;

  async function logChange(shopId, what, detail) {
    const entry = { id: `billing-${at()}-${what}`, source: "billing", at: at(), what, ...detail };
    await registry.recordEvent(shopId, entry);
    if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
  }

  // The billing record and the registry row's terms move together. The registry's `billing` copy follows with the
  // access (billing.js save() keeps a pay-as-you-sell shop open).
  async function record(shopId, fields, terms, what) {
    const before = (await subscriptions.get(shopId)) ?? {};
    const row = { ...before, ...fields, shopId, updatedAt: at() };
    const access = payAsYouSellAccess(row, now(), ACCESS[row.status]) ?? ACCESS[row.status] ?? row.access;
    row.access = access;
    await subscriptions.set(shopId, row);
    const shop = await registry.getShop(shopId);
    if (shop) await registry.updateShop(shopId, { payAsYouSell: terms, billing: { ...(shop.billing ?? {}), status: row.status, access, cancelAtPeriodEnd: row.cancelAtPeriodEnd, trialEnd: row.trialEnd, currentPeriodEnd: row.currentPeriodEnd, hasCard: row.hasCard, updatedAt: row.updatedAt } });
    await logChange(shopId, what, { paymentWay: row.paymentWay, ...(terms ? { basisPoints: terms.basisPoints, capMinor: terms.capMinor, from: terms.from, until: terms.until ?? null } : {}) });
    return row;
  }

  const subFields = (sub) => ({
    subscriptionId: sub.id,
    status: sub.status,
    trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    currentPeriodEnd: (sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end) ? new Date((sub.current_period_end ?? sub.items.data[0].current_period_end) * 1000).toISOString() : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    hasCard: Boolean(sub.default_payment_method),
    itemId: sub.items?.data?.[0]?.id ?? null,
    priceId: sub.items?.data?.[0]?.price?.id ?? null,
  });

  async function founding(shopId, row) {
    if (row.founding === true) return true;
    return (await registry.getShop(shopId))?.founding === true;
  }

  async function toPayAsYouSell(shopId, row) {
    const nowMs = now();
    // Going back on a switch to monthly that hasn't happened: the new subscription is stopped before it charges.
    if (row.paymentWay === "monthly" && row.payAsYouSell?.until && nowMs < Date.parse(row.payAsYouSell.until)) {
      if (row.subscriptionId && !ENDED.has(row.status)) {
        await call("POST", `/v1/subscriptions/${row.subscriptionId}`, { params: { cancel_at_period_end: true }, idempotencyKey: `pays-${shopId}-back-${row.subscriptionId}` });
      }
      const terms = { ...row.payAsYouSell, until: null };
      return record(shopId, { paymentWay: "payAsYouSell", paymentWayFrom: row.paymentWayChosenAt ?? terms.from, cancelAtPeriodEnd: true, payAsYouSell: terms }, terms, "payment-way-pay-as-you-sell");
    }
    const chosen = payAsYouSellTerms({ plan: row.plan, settings, live: await live(), founding: await founding(shopId, row) });
    let fields = {};
    let from;
    let wayFrom;
    if (ENDED.has(row.status) || ACCESS[row.status] === "paused") {
      // Nothing paid is running (or it waits for a card): pay as you sell starts now, and the waiting plan ends.
      if (!ENDED.has(row.status)) fields = subFields(await call("DELETE", `/v1/subscriptions/${row.subscriptionId}`, { idempotencyKey: `pays-${shopId}-end-${row.subscriptionId}` }));
      from = at();
      wayFrom = from;
    } else {
      const trialing = row.status === "trialing";
      // The fees start when the trial or the month already paid for ends; in the trial the switch shows at once.
      from = (trialing ? row.trialEnd : row.currentPeriodEnd) ?? at();
      wayFrom = trialing ? at() : from;
      if (!row.cancelAtPeriodEnd) {
        fields = subFields(await call("POST", `/v1/subscriptions/${row.subscriptionId}`, { params: { cancel_at_period_end: true }, idempotencyKey: `pays-${shopId}-cancel-${row.subscriptionId}` }));
      }
    }
    const terms = { ...chosen, from, until: null };
    return record(shopId, { ...fields, paymentWay: "payAsYouSell", paymentWayFrom: wayFrom, paymentWayChosenAt: at(), payAsYouSell: terms }, terms, "payment-way-pay-as-you-sell");
  }

  async function toMonthly(shopId, row) {
    const nowMs = now();
    const terms = row.payAsYouSell;
    // Not started yet (the trial, or the month already paid for): the subscription simply goes on.
    if (row.subscriptionId && !ENDED.has(row.status) && (!terms?.from || nowMs < Date.parse(terms.from) || row.status === "trialing")) {
      const sub = row.cancelAtPeriodEnd
        ? await call("POST", `/v1/subscriptions/${row.subscriptionId}`, { params: { cancel_at_period_end: false }, idempotencyKey: `pays-${shopId}-keep-${row.subscriptionId}` })
        : null;
      return record(shopId, { ...(sub ? subFields(sub) : {}), paymentWay: "monthly", paymentWayFrom: at(), payAsYouSell: null }, null, "payment-way-monthly");
    }
    // Paying as they sell now: monthly starts with the next billing month, free until then, and asks for a card then.
    const until = billingMonth(terms.from, nowMs).end;
    const customer = row.customerId ? { customerId: row.customerId } : await customers.get(row.accountId);
    const starts = (row.starts ?? 0) + 1;
    const sub = await call("POST", "/v1/subscriptions", {
      params: {
        customer: customer.customerId,
        items: [{ price: await billing.ensurePrice(row.plan) }],
        metadata: { lmb_shop_id: shopId, lmb_plan: row.plan, lmb_account_id: row.accountId ?? "" },
        payment_settings: { save_default_payment_method: "on_subscription" },
        trial_end: Math.floor(Date.parse(until) / 1000),
        trial_settings: { end_behavior: { missing_payment_method: "pause" } },
      },
      idempotencyKey: `subscription-${shopId}-${starts}`,
    });
    const ended = { ...terms, until };
    return record(shopId, { ...subFields(sub), starts, paymentWay: "monthly", paymentWayFrom: until, payAsYouSell: ended }, ended, "payment-way-monthly");
  }

  /** billing.status() with the way the shop pays, its terms, the month's fees so far and the offer open to it. */
  async function status(shopId) {
    const base = await billing.status(shopId);
    if (!base) return null;
    const row = await subscriptions.get(shopId);
    const nowMs = now();
    const way = currentPaymentWay(row, nowMs);
    const terms = row.payAsYouSell ?? null;
    let offer = null;
    if (PAY_AS_YOU_SELL_PLANS.includes(row.plan) && !terms) {
      try { offer = payAsYouSellTerms({ plan: row.plan, settings, live: await live(), founding: await founding(shopId, row) }); } catch { offer = null; }
    }
    const inTrial = row.status === "trialing" && (!terms || nowMs < Date.parse(terms.from));
    const month = way === "payAsYouSell" && terms && nowMs >= Date.parse(terms.from) && ledger ? await ledger.monthSoFar(shopId, terms) : null;
    return {
      ...base,
      paymentWay: way,
      paymentWayChosen: row.paymentWay ?? "monthly",
      paymentWayFrom: row.paymentWayFrom ?? null,
      canPayAsYouSell: PAY_AS_YOU_SELL_PLANS.includes(row.plan) && Boolean(terms || offer),
      payAsYouSell: terms,
      offer,
      inTrial,
      // The fees taken so far, less refunds (a checkout not paid yet isn't shown, though it holds part of the cap).
      month: month ? { start: month.month.start, end: month.month.end, feesMinor: month.takenMinor - month.refundedMinor, capMinor: month.capMinor } : null,
    };
  }

  return {
    status,

    /**
     * Switches how the shop pays: `to` is "monthly" or "payAsYouSell". Safe to repeat: asking for the way already
     * chosen changes nothing (`changed: false`).
     */
    async switchPaymentWay({ shopId, to }) {
      if (!PAYMENT_WAYS.includes(to)) throw new BillingError(400, "Choose monthly or pay as you sell.");
      const row = await subscriptions.get(shopId);
      if (!row?.subscriptionId) throw new BillingError(404, "This shop has no plan yet.");
      const chosen = row.paymentWay ?? "monthly";
      if (chosen === to) return { ...(await status(shopId)), changed: false };
      if (to === "payAsYouSell") await toPayAsYouSell(shopId, row);
      else await toMonthly(shopId, row);
      return { ...(await status(shopId)), changed: true };
    },
  };
}

/**
 * The Plan & billing page's calls for the "How you pay" section, for the platform's web door (signup/api.js `routes`):
 *   POST /api/billing/payment-way          { shopId } -> { view, status }
 *   POST /api/billing/payment-way/switch   { shopId, to: "monthly" | "payAsYouSell" } -> { view, status, changed }
 * `ownerOnly(claims, shopId)` throws unless the person is the shop's owner (billing is the owner's).
 */
export function paymentWayRoutes({ paymentWay, settings, ownerOnly }) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  const answer = (status, extra = {}) => ({ view: paymentWayView(status, settings), status, ...extra });
  return {
    "POST /api/billing/payment-way": async (claims, request) => {
      const { shopId } = body(request);
      await ownerOnly(claims, shopId);
      return answer(await paymentWay.status(shopId));
    },
    "POST /api/billing/payment-way/switch": async (claims, request) => {
      const { shopId, to } = body(request);
      await ownerOnly(claims, shopId);
      const { changed, ...status } = await paymentWay.switchPaymentWay({ shopId, to });
      return answer(status, { changed });
    },
  };
}
