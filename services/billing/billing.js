// The platform's billing (code plan 2.4): each press's Colophon plan (shop, stockroom or both), on the platform's own
// Stripe account (Stripe Billing, not Connect). One Stripe customer per platform account (the person who pays), one
// subscription per shop.
//
// - startTrial: the subscription starts with a free trial and no card (Stripe's trial without a payment method). If
//   the trial ends with no card, Stripe pauses the subscription (`trial_settings.end_behavior.missing_payment_method:
//   pause`): the shop closes its doors, nothing is deleted, and adding a card opens it again.
// - cardLink: a Stripe Checkout page in setup mode to add or change the card. When it completes, the card becomes the
//   default for the customer and the subscription, and a paused subscription resumes.
// - cancel / keep: cancel at the end of the period already paid for (or the trial), and undo that.
// - changePlan: move a shop to another plan (code plan 6.11). A plan that opens a new app is prorated at once; a plan
//   that drops an app keeps it open to the end of the month already paid for, then closes it (its download is kept 90
//   days); during the trial, or while nothing is paid, the change takes effect at once. `changePlan({ preview: true })`
//   says what would change and the prorated amount, changing nothing.
// - invoices: the plan's invoices with Stripe's own PDF links (6.12).
// - closeDroppedApps / cardExpiryReminders: daily sweeps. The first closes an app a plan dropped once its paid month
//   ends (emailing a week before, with the way to keep it, and on the day, with where to download it); the second
//   emails a month before the card on file runs out, once per card (6.12).
// - tax: with `tax` on (BILLING_TAX, read in index.js), prices are "plus tax" and Stripe Tax adds the tax from the
//   first charge after a card (and so an address) is on file (6.12). Off by default.
// - handleEvent: Stripe's events for the platform account, checked by signature, each handled once. They keep the
//   shop's billing state in step and send the emails: trial ending, card needed, payment failed, cancelled, ended.
//
// Every change is kept in the billing store, mirrored onto the shop's registry row (`billing`, for the control room and
// the shop maker), and logged in the registry and the shop's audit log. Every Stripe call that creates something
// carries an idempotency key, so a retry never makes a second customer, subscription or price.
//
// Clients passed in (fakes.js has in-memory ones):
//   stripe          createStripeApi(...) (services/payments/stripeApi.js); built by services/payments, which alone
//                   reads the platform key (platformBillingStripe)
//   mode            "test" or "live": the Stripe mode billing runs in
//   customers       get(accountId) -> { customerId, email, name, trialUsedAt? } | null; set(accountId, row)
//   subscriptions   get(shopId) -> row | null; set(shopId, row); findBySubscriptionId(id) -> row | null; list() -> rows
//   events          claim(eventId, { at, holdMs }) -> boolean (create-if-absent; a claim older than holdMs may be
//                   taken over); release(eventId); mark(eventId, entry); seen(eventId) -> boolean (true once marked).
//                   One delivery of an event wins the claim and handles it; a copy arriving meanwhile is answered 409
//                   so Stripe sends it again later (eventClaims.js, plan 19.4). A store with no claim falls back to seen.
//   registry        getShop(shopId) -> row | null; updateShop(shopId, fields); recordEvent(shopId, entry)
//   auditLog        ready(shopId); write(shopId, id, entry)
//   email           sendPlatform({ kind, to, data, idempotencyKey, shopId }) (services/email)
//   closeApp        optional: closeApp({ shopId, app, closedAt, downloadUntil }), takes a dropped app's pages down. The
//                   registry row's `closedApps` is written either way and is what the shop maker reads.
//   deleteApp       optional: deleteApp({ shopId, app }), deletes a closed app's records once its 90 days to download
//                   are over (closedApps.js says when). Without it nothing is deleted; a failure is kept on the
//                   app's `closedApps` entry as `problem` and tried again the next day.
//   shopPlan        optional: write(shopId, row, { link, at }) (shopPlan.js shopPlanCopies): the shop's own copy of
//                   its plan (code plan 6.6), written on every change once the shop's database exists
//   live            optional: () -> live settings (services/settings.js liveSettings); the founding offer is read there
//   foundingSeats   optional: claim(shopId, { limit, at, percentOff }) -> boolean (founding.js). Without it (or live),
//                   no founding place is given
//   sleep           optional: the wait between Stripe retries (stripeRetry.js), injected by tests
//
// Every Stripe call that can safely be sent twice (a read, a delete, or a POST with an idempotency key) is tried again
// after a short wait when Stripe can't be reached, is busy (429) or fails on its side (5xx): stripeRetry.js (22.4).
import { createHash } from "node:crypto";
import { verifySignature } from "../payments/stripeSignature.js";
import { isPlan, planPrice, PLAN, PLAN_APPS, PLAN_IDS, OLD_PLANS } from "./plans.js";
import { billingCurrencyFor, currencyOf, homeCurrency, moneyWords } from "./currencies.js";
import { taxWatch as watchTaxLines, WATCH_WINDOW_DAYS } from "./taxWatch.js";
import { cancelEndsAt, currentPaymentWay, payAsYouSellAccess, payAsYouSellEnds, planEnding } from "./paymentWayState.js";
import { claimEvent, releaseEvent, IN_PROGRESS_STATUS } from "./eventClaims.js";
import { CARD_WARNING_DAYS, cardEnds, cardRunningOut, cardWarningDue } from "./cardExpiry.js";
import { leavingAnswer } from "./leaving.js";
import { mailLanguage } from "../email/templatesFr.js";
import { planNameFr } from "../email/templatesFrPress.js";
import { DOWNLOAD_ENDING_DAYS, closedAppSteps, downloadHolds, dropReason, keepLinkProblem, newKeepLink } from "./closedApps.js";
import { cardWords } from "./cards.js";
import { withRetries } from "./stripeRetry.js";
import { ensureFoundingCoupon, foundingAmount, foundingOfferOf } from "./founding.js";
import { createBillingHub, invoiceTax } from "./hub.js";
import { siteUrlOf } from "../domains/names.js";
import { DEFAULT_ALERT_CENTS, monthBounds, monthWords, paidShare, projectedCents } from "./runningCost.js";
import { PAY_AS_YOU_SELL_PLANS } from "../payments/payAsYouSell.js";

export { CARD_WARNING_DAYS, cardEnds, cardWords };

/** What each Stripe subscription status means for the shop: open, paused (a card fixes it) or closed. */
export const ACCESS = Object.freeze({
  trialing: "open",
  active: "open",
  // Stripe is retrying a declined payment; the shop stays open meanwhile (and the press is emailed).
  past_due: "open",
  paused: "paused",
  incomplete: "paused",
  unpaid: "paused",
  canceled: "closed",
  incomplete_expired: "closed",
});

const ENDED = new Set(["canceled", "incomplete_expired"]);
/** Plan states with a bill waiting to be paid. */
const OWING = new Set(["past_due", "unpaid", "incomplete"]);
// Statuses with a month already paid for: a plan that drops an app keeps it open to the end of that month.
const PAID = new Set(["active", "past_due"]);
const DAY = 86400_000;
/** How long the download of a closed app is kept (code plan 6.11, the same 90 days as a closed shop). */
export const DOWNLOAD_DAYS = 90;
/** How long before a dropped app closes its reminder email goes out. */
export const CLOSING_REMINDER_DAYS = 7;
/** The apps, in words, for the page and the emails. */
export const APP_NAMES = Object.freeze({ shop: "the shop", stockroom: "the stockroom" });
const APPS = Object.keys(APP_NAMES);
const iso = (seconds) => (Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null);

/** A date the way the emails say it: "14 November 2026", Toronto time. */
/**
 * The days a bill pays for, from its longest line (the plan's month; a running-cost line is shorter): { from, to } as
 * ISO times, or null when Stripe gave no lines.
 */
export function billCovers(invoice) {
  let best = null;
  for (const line of invoice?.lines?.data ?? []) {
    const start = line?.period?.start;
    const end = line?.period?.end;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    if (!best || end - start > best.end - best.start) best = { start, end };
  }
  return best ? { from: iso(best.start), to: iso(best.end) } : null;
}

export function dateText(isoTime) {
  if (!isoTime) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", day: "numeric", month: "long", year: "numeric" }).format(new Date(isoTime));
}

/**
 * The languages Stripe writes this press's invoices, receipts and its own payment pages in (the customer's
 * `preferred_locales`, first one it supports wins): French (Canada) when the emails go in French or, for a Quebec billing
 * address, in French then English (Charter of the French language: the invoice itself must be in French); else English.
 */
export const invoiceLocales = (language) => (language === "en" ? ["en"] : ["fr-CA", "en"]);

/** The email language already chosen for another shop of the same Stripe customer: { language } or nothing. */
function languageOf(rows, customerId) {
  const known = rows.find((r) => r.customerId === customerId && (r.language === "fr" || r.language === "en"));
  return known ? { language: known.language } : {};
}

/** The province already saved for another shop of the same Stripe customer: { province } or nothing. */
function provinceOf(rows, customerId) {
  const known = rows.find((r) => r.customerId === customerId && r.province !== undefined);
  return known ? { province: known.province } : {};
}

/** The parts of a Stripe subscription the platform keeps. */
export function fromSubscription(sub) {
  const item = sub.items?.data?.[0];
  return {
    subscriptionId: sub.id,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    status: sub.status,
    access: ACCESS[sub.status] ?? "paused",
    plan: isPlan(sub.metadata?.lmb_plan) ? sub.metadata.lmb_plan : null,
    trialEnd: iso(sub.trial_end),
    // Newer Stripe versions keep the period on the item; older ones on the subscription.
    currentPeriodEnd: iso(sub.current_period_end ?? item?.current_period_end),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    hasCard: Boolean(sub.default_payment_method),
    itemId: item?.id ?? null,
    priceId: item?.price?.id ?? null,
  };
}

/**
 * The record of apps a plan change dropped with the month's end still to come (so the press could change their mind):
 * each `{ app, at, keptAt, closedAt }`, oldest first, the last 20 kept. The control room counts how many were kept
 * (control-room/appsClosing.js). An app already waiting to close isn't dropped twice.
 */
export function noteDrops(drops, { dropped = [], kept = [], closed = [], reason = null }, when) {
  const list = (drops ?? []).map((drop) => ({ ...drop }));
  const waiting = (app) => list.findLast((drop) => drop.app === app && !drop.keptAt && !drop.closedAt);
  for (const app of kept) { const drop = waiting(app); if (drop) drop.keptAt = when; }
  for (const app of closed) { const drop = waiting(app); if (drop) drop.closedAt = when; }
  for (const app of dropped) if (!waiting(app)) list.push({ app, at: when, keptAt: null, closedAt: null, ...(reason ? { reason } : {}) });
  return list.slice(-20);
}

/** The plan that opens exactly these apps (the registry's `plan` says what is open). */
export function planOpening(apps) {
  return [...OLD_PLANS, PLAN].find((plan) => APPS.every((app) => PLAN_APPS[plan][app] === apps.includes(app))) ?? null;
}


export class BillingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createBilling({ stripe, mode = "test", settings, customers, subscriptions, events, registry, auditLog, email, webhookSecrets = [], tax = false, closeApp, deleteApp = null, shopPlan = null, live = null, foundingSeats = null, exchange = null, sleep, now = () => Date.now() }) {
  if (mode !== "test" && mode !== "live") throw new Error('billing mode must be "test" or "live"');
  // Money in words: "$5.00" in Canadian dollars, "US$5.00" in US dollars (currencies.js).
  const moneyText = (cents, currency) => moneyWords(cents, currency, settings);
  /** The currency this shop is billed in (currencies.js): its own, kept when its plan started. */
  const cur = (row) => currencyOf(row, settings);
  // The fees as the control room last set them (Settings > Platform fee, saved in the platform project and read through
  // `live`), on top of the environment's. Read again before anything that prices a plan, so a fee changed there reaches
  // the next plan started without a release. A plan already running keeps the Stripe price it is on.
  let fees = settings;
  async function freshFees() {
    if (!live) return;
    try {
      const now = await live();
      if (now?.prices) fees = { ...settings, prices: { ...settings.prices, ...now.prices }, usdPrices: { ...settings.usdPrices, ...(now.usdPrices ?? {}) } };
    } catch (failure) {
      console.warn("Reading the platform fee from the control room's settings failed; using the last one read:", failure?.message || failure);
    }
  }
  /** The plan's price in this shop's billing currency, at today's fee: for a plan being started or moved to. */
  const priceOf = (plan, row) => planPrice(plan, fees, cur(row));
  /**
   * The price this shop's running plan is on: the fee kept when it started (`feeCents`), never today's fee, which only
   * new plans get (a running plan moves only on purpose, with notice). A plan started before the fee was kept is on the
   * environment's fee, the only one billing read until then.
   */
  const ownPrice = (row) => {
    const base = planPrice(row.plan, settings, cur(row));
    return Number.isInteger(row.feeCents) ? { ...base, amount: row.feeCents, priceText: moneyText(row.feeCents, cur(row)) } : base;
  };
  const at = () => new Date(now()).toISOString();
  const retrying = withRetries((...args) => stripe.call(...args), sleep ? { sleep } : {});
  const call = (method, path, options) => retrying(mode, method, path, options);
  const priceIds = new Map();

  const accountLink = (shopId) => `${settings.platformUrl}/account/billing?shop=${encodeURIComponent(shopId)}`;

  async function logChange(shopId, what, detail) {
    const entry = { id: `billing-${at()}-${what}`, source: "billing", at: at(), what, ...detail };
    await registry.recordEvent(shopId, entry);
    if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
  }

  // The billing store holds the truth; the registry row carries a copy for the control room and the shop maker.
  async function save(shopId, fields, what) {
    const before = (await subscriptions.get(shopId)) ?? {};
    const row = { ...before, ...fields, shopId, updatedAt: at() };
    // A press paying as they sell (6.19, paymentWay.js) has no subscription running, and the shop stays open.
    row.access = payAsYouSellAccess(row, now(), row.access) ?? row.access;
    // When a payment problem or a pause began (19.9): kept while it lasts, for the control room's payment-trouble list.
    row.troubleSince = inTrouble(row) ? (inTrouble(before) ? before.troubleSince ?? row.updatedAt : row.updatedAt) : null;
    await subscriptions.set(shopId, row);
    await mirror(shopId, row);
    await copyToShop(shopId, row);
    if (what) await logChange(shopId, what, { status: row.status, plan: row.plan, access: row.access });
    return row;
  }

  // The copy on the registry row, once the row exists (the sign-up's trial starts before the shop maker makes it).
  async function mirror(shopId, row) {
    if (!(await registry.getShop(shopId))) return;
    const { plan, status, access, trialEnd, currentPeriodEnd, hasCard } = row;
    // "Cancelled" is the press's own choice: Stripe's cancel of a pay-as-you-sell plan is the switch (paymentWayState.js).
    const { cancelling: cancelAtPeriodEnd, endsAt } = planEnding(row);
    await registry.updateShop(shopId, { billing: { plan, status, access, trialEnd, currentPeriodEnd, cancelAtPeriodEnd, endsAt, hasCard, percentOff: row.founding === true ? row.foundingPercentOff ?? null : null, appsClosing: row.appsClosing ?? null, appDrops: row.appDrops ?? [], updatedAt: row.updatedAt, leaving: row.leaving ?? null, troubleSince: row.troubleSince ?? null, remindedAt: row.remindedAt ?? null, noBillingEmail: !row.billingEmail, language: row.language ?? null, province: row.province ?? null, lastRunningCost: row.lastRunningCost ?? null, currency: cur(row), ...(Number.isInteger(row.feeCents) ? { amount: row.feeCents } : {}) } });
  }

  // The shop's own platform/plan and platform/status (shopPlan.js), once its database exists.
  async function copyToShop(shopId, row) {
    if (!shopPlan || !(await auditLog.ready(shopId))) return null;
    return shopPlan.write(shopId, row, { link: accountLink(shopId), hub: `${settings.platformUrl}/api/shop-billing/`, at: at() });
  }

  /** The monthly platform fee this shop pays, its founding share taken off. */
  function feeAfterOffer(row) {
    const amount = ownPrice(row).amount;
    return row.founding === true && row.foundingPercentOff ? foundingAmount(amount, row.foundingPercentOff) : amount;
  }

  async function rowFor(shopId) {
    const row = await subscriptions.get(shopId);
    if (!row?.subscriptionId) throw new BillingError(404, "This shop has no plan yet.");
    return row;
  }

  /** The Stripe price for a plan, made (with its product) the first time it is needed. */
  /**
   * The plan's name as Stripe prints it on every invoice line and receipt: English and French together, one name for
   * every press ("Colophon Shop and stockroom / Colophon Boutique et réserve"), so a Quebec press's French invoice
   * names its plan in French too.
   */
  const productName = (price) => `${settings.platformName} ${price.name} / ${settings.platformName} ${planNameFr(price.name)}`;

  /** A product made before the name was in both languages gets it once (checked once per plan while running). */
  async function nameProduct(price) {
    const product = await call("GET", `/v1/products/${price.productId}`).catch(() => null);
    if (product && product.name !== productName(price)) {
      await call("POST", `/v1/products/${price.productId}`, { params: { name: productName(price) }, idempotencyKey: `product-name-${price.productId}-${createHash("sha256").update(productName(price)).digest("hex").slice(0, 16)}` });
    }
    // The tax code tells Stripe Tax what the plan is (software as a service), so each province and state taxes it right.
    const code = typeof product?.tax_code === "string" ? product.tax_code : product?.tax_code?.id;
    if (product && tax && settings.taxCode && code !== settings.taxCode) {
      await call("POST", `/v1/products/${price.productId}`, { params: { tax_code: settings.taxCode }, idempotencyKey: `product-tax-${price.productId}-${settings.taxCode}` });
    }
  }

  async function ensurePrice(plan, currency = homeCurrency(settings)) {
    const price = planPrice(plan, fees, currency);
    if (priceIds.has(price.lookupKey)) return priceIds.get(price.lookupKey);
    const found = await call("GET", "/v1/prices", { params: { lookup_keys: [price.lookupKey], active: true, limit: 1 } });
    let id = found?.data?.[0]?.id;
    // "Plus tax": a price made before tax was turned on says so once (Stripe lets an unset tax behaviour be set once).
    if (id && tax && (found.data[0].tax_behavior ?? "unspecified") === "unspecified") {
      await call("POST", `/v1/prices/${id}`, { params: { tax_behavior: "exclusive" } });
    }
    if (!id) {
      try {
        await call("GET", `/v1/products/${price.productId}`);
      } catch (error) {
        if (error.statusCode !== 404) throw error;
        await call("POST", "/v1/products", {
          params: { id: price.productId, name: productName(price), metadata: { lmb_plan: plan }, ...(tax ? { tax_code: settings.taxCode } : {}) },
          idempotencyKey: `product-${price.productId}`,
        });
      }
      const made = await call("POST", "/v1/prices", {
        params: { product: price.productId, currency: price.currency, unit_amount: price.amount, recurring: { interval: "month" }, lookup_key: price.lookupKey, nickname: `${price.name} monthly`, metadata: { lmb_plan: plan }, ...(tax ? { tax_behavior: "exclusive" } : {}) },
        idempotencyKey: `price-${price.lookupKey}`,
      });
      id = made.id;
    } else {
      await nameProduct(price);
    }
    priceIds.set(price.lookupKey, id);
    return id;
  }

  /** The Stripe customer for a platform account (the person who pays), made once. */
  async function ensureCustomer({ accountId, email: address, name }) {
    const saved = await customers.get(accountId);
    if (saved?.customerId) return saved;
    const customer = await call("POST", "/v1/customers", {
      params: { email: address, ...(name ? { name } : {}), metadata: { lmb_account_id: accountId } },
      idempotencyKey: `customer-${accountId}`,
    });
    const row = { customerId: customer.id, email: address, name: name ?? "" };
    await customers.set(accountId, row);
    return row;
  }

  /** The running-cost line this customer already has waiting for `month`, if any (Stripe forgets a request key after a day). */
  async function runningCostLine(row, month) {
    const list = await call("GET", "/v1/invoiceitems", { params: { customer: row.customerId, pending: true, limit: 100 } });
    return (list?.data ?? []).find((item) => item.metadata?.lmb_kind === "running-cost" && item.metadata?.lmb_shop_id === row.shopId && item.metadata?.lmb_month === month) ?? null;
  }

  async function notify(shopId, kind, data, key) {
    const row = await subscriptions.get(shopId);
    if (!row?.billingEmail) return null;
    const price = row.plan ? ownPrice(row) : null;
    return email.sendPlatform({
      kind,
      to: row.billingEmail,
      shopId,
      // French for a press that chose it, or French then English for one billed in Quebec (templatesFr.js).
      language: mailLanguage(row),
      idempotencyKey: `billing/${key}`,
      data: { pressName: row.pressName || shopId, planName: price?.name ?? "", price: price?.priceText ?? "", link: accountLink(shopId), ...data },
    });
  }

  async function sync(shopId, sub, what, lastEvent = null) {
    const fields = fromSubscription(sub);
    if (!fields.plan) delete fields.plan;
    if (lastEvent) fields.lastEvent = lastEvent;
    return save(shopId, fields, what);
  }

  /** What a move to `plan` would do: the apps it adds and closes, when, and whether it is prorated. */
  function planMove(row, plan) {
    const open = APPS.filter((app) => PLAN_APPS[row.plan]?.[app] || row.appsClosing?.apps?.includes(app));
    const wanted = APPS.filter((app) => PLAN_APPS[plan][app]);
    const adds = wanted.filter((app) => !open.includes(app));
    const closes = open.filter((app) => !PLAN_APPS[plan][app]);
    // A trial, or a plan with nothing paid (paused, waiting for a first payment): the change takes effect at once.
    const immediate = !PAID.has(row.status);
    const closesAt = closes.length ? (immediate ? at() : row.currentPeriodEnd) : null;
    const price = priceOf(plan, row);
    const higher = row.plan ? price.amount > ownPrice(row).amount : false;
    return {
      plan, planName: price.name, price: price.priceText, from: row.plan, adds, closes, immediate, closesAt,
      downloadUntil: closesAt ? new Date(Date.parse(closesAt) + DOWNLOAD_DAYS * DAY).toISOString() : null,
      prorate: !immediate && adds.length > 0 && higher,
      // Until a dropped app closes, the shop keeps it: the registry's plan says what is open.
      openPlan: planOpening(immediate ? wanted : [...new Set([...wanted, ...closes])]),
    };
  }

  /** What Stripe would charge now for moving to `plan`: the prorated lines of a preview invoice. */
  async function prorated(row, plan) {
    const preview = await call("POST", "/v1/invoices/create_preview", {
      params: {
        customer: row.customerId,
        subscription: row.subscriptionId,
        subscription_details: { items: [{ id: row.itemId, price: await ensurePrice(plan, cur(row)) }], proration_behavior: "create_prorations", proration_date: Math.floor(now() / 1000) },
      },
    });
    const lines = preview?.lines?.data ?? [];
    const amount = lines.filter((line) => line.proration || line.parent?.subscription_item_details?.proration).reduce((sum, line) => sum + (line.amount ?? 0), 0);
    return { amount, text: moneyText(Math.max(0, amount), preview?.currency ?? cur(row)) };
  }

  /** Closes apps a plan dropped: recorded on the billing row, the registry and the logs; the pages taken down. */
  async function closeApps(shopId, apps) {
    const row = await subscriptions.get(shopId);
    const closedApps = { ...(row?.closedApps ?? {}) };
    const closedAt = at();
    const downloadUntil = new Date(now() + DOWNLOAD_DAYS * DAY).toISOString();
    for (const app of apps) {
      if (closedApps[app]) continue;
      closedApps[app] = { closedAt, downloadUntil };
      if (closeApp) await closeApp({ shopId, app, closedAt, downloadUntil });
    }
    // The registry first: the shop's copies (save → shopPlan.js) and the shop maker read which apps are open from it.
    if (await registry.getShop(shopId)) await registry.updateShop(shopId, { plan: row.plan, closedApps });
    const saved = await save(shopId, { appsClosing: null, closedApps, appDrops: noteDrops(row.appDrops, { closed: apps }, closedAt) }, null);
    await logChange(shopId, "app-closed", { apps, downloadUntil });
    return saved;
  }

  /** A closed app's entry changed: on the registry (the shop maker and the control room read it) and the billing row. */
  async function saveClosedApp(shopId, app, fields) {
    const row = await subscriptions.get(shopId);
    // Gone (the app was added back meanwhile): nothing to mark, and no entry brought back to stop a later close.
    if (!row?.closedApps?.[app]) return row;
    const closedApps = { ...(row?.closedApps ?? {}), [app]: { ...(row?.closedApps?.[app] ?? {}), ...fields } };
    if (await registry.getShop(shopId)) await registry.updateShop(shopId, { closedApps });
    return save(shopId, { closedApps }, null);
  }

  /** The last email before a closed app's download ends, and its deletion once that time is over (closedApps.js). */
  async function afterClosing(shopId) {
    // A shop deleted as a whole (closing.js) has nothing left to delete or email about.
    if ((await registry.getShop(shopId))?.closing?.stage === "deleted") return;
    const row = await subscriptions.get(shopId);
    for (const { app, step } of closedAppSteps(row, now())) {
      const closed = row.closedApps[app];
      if (step === "warn") {
        // The press always gets the full notice: an email sent late moves the download's end (and so the deletion)
        // back, and the export and the account page follow the same date.
        const downloadUntil = new Date(Math.max(Date.parse(closed.downloadUntil), now() + DOWNLOAD_ENDING_DAYS * DAY)).toISOString();
        await saveClosedApp(shopId, app, { downloadUntil });
        await notify(shopId, "app-download-ending", { apps: [app], closing: APP_NAMES[app], holds: downloadHolds([app]), date: dateText(downloadUntil), on: downloadUntil, link: `${settings.platformUrl}/accounts/` }, `${shopId}/app-download-ending/${app}/${closed.closedAt}`);
        await saveClosedApp(shopId, app, { warnedAt: at() });
        continue;
      }
      if (step === "tell") {
        await notify(shopId, "app-records-deleted", { apps: [app], closing: APP_NAMES[app], link: `${settings.platformUrl}/accounts/` }, `${shopId}/app-records-deleted/${app}/${closed.closedAt}`);
        await saveClosedApp(shopId, app, { toldAt: at() });
        continue;
      }
      if (!deleteApp) continue;
      // Read again just before: an app added back meanwhile (changePlan removes its entry) is never deleted.
      const fresh = await subscriptions.get(shopId);
      if (!fresh?.closedApps?.[app] || PLAN_APPS[fresh.plan]?.[app]) continue;
      try {
        await deleteApp({ shopId, app });
      } catch (failure) {
        // Kept for the control room and tried again tomorrow; one shop's trouble never stops the sweep.
        if (closed.problem !== failure.message) await saveClosedApp(shopId, app, { problem: failure.message });
        continue;
      }
      await saveClosedApp(shopId, app, { deletedAt: at(), problem: null });
      await logChange(shopId, "app-deleted", { app });
      // The note that it's done: a failed email is tried again on the next sweeps (closedAppSteps "tell").
      try {
        await notify(shopId, "app-records-deleted", { apps: [app], closing: APP_NAMES[app], link: `${settings.platformUrl}/accounts/` }, `${shopId}/app-records-deleted/${app}/${closed.closedAt}`);
        await saveClosedApp(shopId, app, { toldAt: at() });
      } catch {
        // Left without toldAt: tomorrow's sweep sends it.
      }
    }
  }

  /**
   * Stripe's invoices and receipts in the language of this account's emails (invoiceLocales). One Stripe customer pays
   * for every shop of the account, so every one of its rows records what Stripe holds (`invoiceLocales`), and nothing is
   * sent when Stripe already has it. Never throws: a Stripe hiccup leaves the old language until the daily sweep.
   */
  async function syncInvoiceLanguage(shopId) {
    try {
      const row = await subscriptions.get(shopId);
      if (!row?.customerId) return;
      // One customer, one invoice language: French when any of its shops' emails go in French (older rows may still
      // disagree), so two shops can never pull Stripe back and forth.
      const rows = (await subscriptions.list()).filter((other) => other.customerId === row.customerId);
      const french = [row, ...rows].some((r) => invoiceLocales(mailLanguage(r))[0] !== "en");
      const locales = invoiceLocales(french ? "fr" : "en").join(",");
      if (row.invoiceLocales === locales) return;
      // Counted before the call, like saveBillingDetails: a key Stripe already holds is never reused with other locales.
      const changes = (row.localeChanges ?? 0) + 1;
      await save(shopId, { localeChanges: changes }, null);
      await call("POST", `/v1/customers/${row.customerId}`, { params: { preferred_locales: locales.split(",") }, idempotencyKey: `locales-${row.customerId}-${shopId}-${changes}` });
      for (const id of new Set([shopId, ...rows.map((r) => r.shopId)])) await save(id, { invoiceLocales: locales }, null);
    } catch (failure) {
      console.warn(`Setting the invoice language for ${shopId} failed; tried again tomorrow:`, failure?.message || failure);
    }
  }

  /** One shop in the daily dropped-apps sweep: its closed apps, then a reminder or the close of a dropped one. */
  async function sweepOne(row, closed) {
    // The language of this shop's emails, for one billed before the province was kept (hub.js fillProvince).
    // A Stripe hiccup here never holds up the closing itself: the email goes in English and it's read again tomorrow.
    if (row.province === undefined && row.customerId) {
      await hub.fillProvince(row).catch((failure) => console.warn(`Reading the billing province for ${row.shopId} failed; tried again tomorrow:`, failure?.message || failure));
    }
    // Invoices in the same language (a shop billed before this was kept, or a change Stripe didn't take yesterday).
    await syncInvoiceLanguage(row.shopId);
    await endPayAsYouSell(row);
    if (Object.keys(row.closedApps ?? {}).length) await afterClosing(row.shopId);
    if (!row.appsClosing?.apps?.length) return;
    // A week before: one reminder, with the way to keep it (keepClosingApps), for a press who never opens the admin.
    if (Date.parse(row.appsClosing.at) > now()) {
      if (!row.appsClosing.reminded && Date.parse(row.appsClosing.at) - now() <= CLOSING_REMINDER_DAYS * DAY) {
        // The button keeps it with no sign-in: a one-time link (closedApps.js), saved before the email goes. A link
        // made on an earlier run whose email may have gone can't be shown again (only its hash is kept), so then
        // the button opens the plan page with "Keep it" ready instead (accounts/billing.js reads `keep=closing`).
        let link = `${accountLink(row.shopId)}&keep=closing`;
        let signIn = true;
        if (row.keepLink?.for !== row.appsClosing.at) {
          signIn = false;
          const made = newKeepLink({ closesAt: row.appsClosing.at, now: now() });
          await save(row.shopId, { keepLink: made.stored }, null);
          link = `${settings.platformUrl}/account/keep.html?shop=${encodeURIComponent(row.shopId)}&t=${made.token}`;
        }
        await notify(row.shopId, "app-closing-soon", { apps: row.appsClosing.apps, closing: row.appsClosing.apps.map((app) => APP_NAMES[app]).join(" and "), date: dateText(row.appsClosing.at), on: row.appsClosing.at, link, signIn }, `${row.shopId}/app-closing-soon/${row.appsClosing.at}`);
        await save(row.shopId, { appsClosing: { ...row.appsClosing, reminded: at() } }, null);
      }
      return;
    }
    const saved = await closeApps(row.shopId, row.appsClosing.apps);
    // The day it closes: where the press downloads what was in it, and until when.
    const downloadUntil = row.appsClosing.apps.map((app) => saved.closedApps?.[app]?.downloadUntil).find(Boolean);
    await notify(row.shopId, "app-closed", { apps: row.appsClosing.apps, closing: row.appsClosing.apps.map((app) => APP_NAMES[app]).join(" and "), holds: downloadHolds(row.appsClosing.apps), date: dateText(downloadUntil), on: downloadUntil, link: `${settings.platformUrl}/accounts/` }, `${row.shopId}/app-closed/${row.appsClosing.at}`);
    closed.push({ shopId: row.shopId, apps: row.appsClosing.apps });
  }

  /**
   * Where Stripe's card page may send a press back to: the platform's own pages, or this shop's own admin (the billing
   * hub, 22.3) at its main address. Nowhere else, so the page can never be used to send someone to a stranger's site.
   */
  async function comesBackHome(shopId, returnUrl) {
    if (typeof returnUrl !== "string") return false;
    if (returnUrl === settings.platformUrl || returnUrl.startsWith(`${settings.platformUrl}/`)) return true;
    const shop = await registry.getShop(shopId);
    if (!shop) return false;
    let url;
    try { url = new URL(returnUrl); } catch { return false; }
    return url.origin === new URL(siteUrlOf(shop)).origin && (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) && !url.username && !url.password;
  }

  /**
   * Gives this shop a founding place if it hasn't one and places are left (founding.js): called when the press first
   * pays (a card saved, or pay as you sell chosen). Answers the row, marked `founding: true` when it holds a place.
   */
  async function claimFounding(shopId) {
    const row = await subscriptions.get(shopId);
    if (!row || row.founding === true) return row;
    const percentOff = await takeFoundingPlace(shopId);
    return percentOff === null ? row : save(shopId, { founding: true, foundingPercentOff: percentOff, foundingAt: at() }, "founding-place-given");
  }

  /**
   * A press that held a founding place and left before paying anything gives it back, so it can go to a paying press
   * (on by default; the control room's "give a place back" setting turns it off, and then a place once given stays).
   */
  async function giveBackFounding(shopId) {
    if (!live || !foundingSeats?.release) return null;
    if ((await live())?.foundingOffer?.giveBackUnpaid === false) return null;
    await foundingSeats.release(shopId, { at: at() });
    if (await registry.getShop(shopId)) await registry.updateShop(shopId, { founding: false });
    return save(shopId, { founding: false, foundingPercentOff: null, foundingOn: null, foundingAt: null }, "founding-place-given-back");
  }

  /** One of the founding places, if the offer is on and any are left: its percent off, or null. */
  async function takeFoundingPlace(shopId) {
    if (!live || !foundingSeats) return null;
    const offer = foundingOfferOf(await live());
    if (!offer) return null;
    const got = await foundingSeats.claim(shopId, { limit: offer.presses, at: at(), percentOff: offer.percentOff });
    if (!got) return null;
    if (await registry.getShop(shopId)) await registry.updateShop(shopId, { founding: true });
    return offer.percentOff;
  }

  /**
   * A card now pays this shop's plan, from adding one (Stripe's card page) or making a saved one primary (22.3). One path,
   * in an order that matters: the card goes on the customer and the plan, the press becomes a paying one (a founding place
   * and its discount, 22.1) BEFORE a paused plan is reopened or a waiting first bill is paid, so that bill is already the
   * founding price. Every Stripe call is keyed on `key`, so a retry of the same change repeats nothing.
   */
  async function cardNowPays(shopId, card, { key, what, customer = {}, subscription = {} }) {
    const row = await subscriptions.get(shopId);
    await call("POST", `/v1/customers/${row.customerId}`, { params: { invoice_settings: { default_payment_method: card.id }, ...customer }, idempotencyKey: `${key}-customer` });
    let sub = null;
    let reopened = false;
    if (row.subscriptionId && !ENDED.has(row.status)) {
      await claimFounding(shopId);
      await applyFounding(shopId);
      sub = await call("POST", `/v1/subscriptions/${row.subscriptionId}`, { params: { default_payment_method: card.id, ...subscription }, idempotencyKey: `${key}-subscription` });
      // A trial that ended without a card paused the plan: the card opens the shop again, billed from today.
      if (sub.status === "paused") {
        sub = await call("POST", `/v1/subscriptions/${row.subscriptionId}/resume`, { params: { billing_cycle_anchor: "now" }, idempotencyKey: `${key}-resume` });
        reopened = true;
      }
      // A plan started again without a trial waits for its first payment: pay it with the new card.
      const invoice = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
      if (sub.status === "incomplete" && invoice) {
        await call("POST", `/v1/invoices/${invoice}/pay`, { params: { payment_method: card.id }, idempotencyKey: `${key}-pay` });
        sub = await call("GET", `/v1/subscriptions/${row.subscriptionId}`);
      }
    }
    await save(shopId, { card, hasCard: true, cardChanges: (row.cardChanges ?? 0) + 1 }, null);
    const result = sub ? await sync(shopId, sub, what) : await subscriptions.get(shopId);
    // The press hears about it (25.2, 25.3): a card that reopened a paused shop says so; any other new card that now
    // pays is a safety notice, so a change they didn't make doesn't go unseen.
    await notify(shopId, reopened ? "shop-reopened" : "card-changed", { card: cardWords(card) }, `${key}-${reopened ? "reopened" : "card-changed"}`);
    return result;
  }

  /** Puts the founding coupon on the shop's running subscription, once per subscription. */
  async function applyFounding(shopId) {
    const row = await subscriptions.get(shopId);
    if (row?.founding !== true || !row.subscriptionId || ENDED.has(row.status) || row.foundingOn === row.subscriptionId) return row;
    const coupon = await ensureFoundingCoupon(call, row.foundingPercentOff ?? 25, settings.platformName);
    await call("POST", `/v1/subscriptions/${row.subscriptionId}`, { params: { discounts: [{ coupon }] }, idempotencyKey: `founding-${row.subscriptionId}` });
    return save(shopId, { foundingOn: row.subscriptionId }, "founding-discount-on");
  }

  /**
   * Cancelling while paying as they sell (6.19): the terms stop at the end of the current billing month (or before fees
   * start, when they haven't yet), the shop stays open until then, and the daily sweep closes it after (sweepOne). No
   * subscription runs, so Stripe only makes sure a plan still waiting to end (the switch) does end.
   */
  async function cancelPayAsYouSell(shopId, row, leaving) {
    if (payAsYouSellEnds(row)) return row;
    const until = cancelEndsAt(row, now());
    let fields = {};
    if (!ENDED.has(row.status) && !row.cancelAtPeriodEnd) {
      fields = fromSubscription(await call("POST", `/v1/subscriptions/${row.subscriptionId}`, { params: { cancel_at_period_end: true }, idempotencyKey: `pays-${shopId}-leave-${row.subscriptionId}` }));
      if (!fields.plan) delete fields.plan;
    }
    const terms = { ...row.payAsYouSell, until };
    if (await registry.getShop(shopId)) await registry.updateShop(shopId, { payAsYouSell: terms });
    const saved = await save(shopId, { ...fields, payAsYouSell: terms, leaving }, null);
    await logChange(shopId, "cancel-requested", { status: saved.status, plan: saved.plan, access: saved.access, paymentWay: "payAsYouSell", until, ...(leaving ? { reason: leaving.reason, words: leaving.words } : {}) });
    await notify(shopId, "subscription-cancelled", { date: dateText(until) }, `${shopId}/cancel/pays/${until}/${at()}`);
    return saved;
  }

  /**
   * Can Stripe Tax place this press? Only with an address on the account's customer (the card's billing address with tax
   * on, or the billing details): asking for tax without one makes Stripe refuse the whole change.
   */
  async function taxLocated(row) {
    const customer = await call("GET", `/v1/customers/${row.customerId}`);
    return Boolean(customer?.address?.country || customer?.shipping?.address?.country);
  }

  /** A press paying as they sell whose cancel has come: the shop closes, and the closing sweep (closing.js) takes over. */
  async function endPayAsYouSell(row) {
    const until = payAsYouSellEnds(row);
    if (!until || now() < Date.parse(until) || row.access !== "open") return;
    // A subscription still running ends on its own day, and Stripe's event closes the shop then.
    if (ACCESS[row.status] === "open") return;
    await save(row.shopId, { access: ACCESS[row.status] ?? "paused" }, "pay-as-you-sell-ended");
  }

  const hub = createBillingHub({
    call, rowFor, save, logChange, subscriptions, settings, tax, BillingError, money: moneyText, cardNowPays, syncInvoiceLanguage, currencyOf: cur,
    iso, nowIso: at,
    refresh: async (shopId) => {
      const row = await subscriptions.get(shopId);
      return sync(shopId, await call("GET", `/v1/subscriptions/${row.subscriptionId}`), "stripe-refreshed");
    },
  });

  // Named, so a call can use another (keepClosingApps goes through changePlan).
  const api = {
    ensurePrice,
    ensureCustomer,
    claimFounding,
    applyFounding,
    ...hub,

    /**
     * Is this person the one whose account pays for the shop's plan? The card and billing details sit on that account's
     * Stripe customer, shared by every shop it pays for, so a co-owner is not. `payer` is { accountId?, email }: the
     * platform's sign-in gives both, the shop admin's only the email. A plan with no account on record answers true.
     */
    async paidBy(shopId, { accountId = null, email = null } = {}) {
      const row = await subscriptions.get(shopId);
      if (!row?.accountId) return true;
      if (accountId && accountId === row.accountId) return true;
      const holder = String((await customers.get(row.accountId))?.email ?? "").toLowerCase();
      return Boolean(holder) && typeof email === "string" && email.toLowerCase() === holder;
    },

    /**
     * Writes the shop's copy of its plan again (the shop maker once the database exists; the closing sweep), and the
     * registry row's copy for the control room: a trial that began at sign-up has neither until the shop exists.
     */
    async publishPlan(shopId) {
      const row = await subscriptions.get(shopId);
      if (!row) return null;
      await mirror(shopId, row);
      return copyToShop(shopId, row);
    },

    /**
     * Starts a shop's plan. A press's first plan has the free trial and needs no card; a plan started again after one
     * ended (or for a second shop of an account that already had a trial) starts unpaid until a card is added.
     * Safe to repeat: a shop with a plan that hasn't ended gets that plan back.
     */
    async startTrial({ account, shopId, pressName, plan = PLAN, language = null, country = null }) {
      await freshFees();
      if (!isPlan(plan)) throw new BillingError(400, "Choose a plan: shop, stockroom or both.");
      if (!account?.accountId || !account?.email) throw new BillingError(400, "The account is missing.");
      const existing = await subscriptions.get(shopId);
      if (existing?.subscriptionId && !ENDED.has(existing.status)) {
        if (existing.accountId !== account.accountId) throw new BillingError(403, "This shop belongs to another account.");
        return existing;
      }
      let customer = await ensureCustomer(account);
      // The currency the person pays in (currencies.js): set by their first shop's country, then kept, because Stripe
      // bills one customer in one currency. A customer billed before this was kept paid in the home currency.
      const billedBefore = (await subscriptions.list()).some((r) => r.customerId === customer.customerId && r.subscriptionId);
      const currency = customer.currency ?? (billedBefore ? homeCurrency(settings) : billingCurrencyFor(country, settings));
      if (customer.currency !== currency) {
        customer = { ...customer, currency };
        await customers.set(account.accountId, customer);
      }
      const trial = settings.trialDays > 0 && !customer.trialUsedAt;
      const starts = (existing?.starts ?? 0) + 1;
      // With no trial the first bill is made with the plan, so a founding press's discount goes on it from the start:
      // the place it already has, or (it pays today, so it is a paying press) one taken now (22.1).
      let percentOff = existing?.founding === true ? existing.foundingPercentOff ?? 25 : null;
      const newPlace = !trial && percentOff === null ? await takeFoundingPlace(shopId) : null;
      if (newPlace !== null) percentOff = newPlace;
      const discounts = !trial && percentOff !== null ? [{ coupon: await ensureFoundingCoupon(call, percentOff, settings.platformName) }] : null;
      const sub = await call("POST", "/v1/subscriptions", {
        params: {
          customer: customer.customerId,
          items: [{ price: await ensurePrice(plan, currency) }],
          metadata: { lmb_shop_id: shopId, lmb_plan: plan, lmb_account_id: account.accountId },
          payment_settings: { save_default_payment_method: "on_subscription" },
          ...(trial
            ? { trial_period_days: settings.trialDays, trial_settings: { end_behavior: { missing_payment_method: "pause" } } }
            : { payment_behavior: "default_incomplete" }),
          ...(discounts ? { discounts } : {}),
        },
        idempotencyKey: `subscription-${shopId}-${starts}`,
      });
      if (trial) await customers.set(account.accountId, { ...customer, trialUsedAt: at() });
      const others = await subscriptions.list();
      const chosen = language === "fr" || language === "en" ? language : null;
      const saved = await save(shopId, {
        ...fromSubscription(sub), accountId: account.accountId, billingEmail: account.email, pressName: pressName ?? "", starts, planChanges: 0, currency,
        // The fee this plan started on, which it keeps (ownPrice).
        feeCents: planPrice(plan, fees, currency).amount,
        // The language is the person's, like setEmailLanguage: one chosen now is the account's; none keeps the account's.
        ...(chosen ? { language: chosen } : languageOf(others, customer.customerId)),
        // A second shop of an account billed in Quebec writes in French too (hub.js saveBillingDetails sets it per account).
        ...(existing?.province === undefined ? provinceOf(others, customer.customerId) : {}),
        ...(newPlace !== null ? { founding: true, foundingPercentOff: newPlace, foundingAt: at() } : {}),
        ...(discounts ? { foundingOn: sub.id } : {}),
      }, trial ? "trial-started" : "plan-started");
      // Every shop the account pays for (one Stripe customer, one invoice language) follows a language chosen now.
      if (chosen) for (const other of others.filter((r) => r.customerId === customer.customerId && r.shopId !== shopId && r.language !== chosen)) await save(other.shopId, { language: chosen }, null);
      await syncInvoiceLanguage(shopId);
      // A founding press starting again keeps its place: the new subscription gets the discount too.
      return saved.founding === true ? applyFounding(shopId) : saved;
    },

    /** A Stripe page to add or change the card. `returnUrl` must be one of the platform's pages or this shop's admin. */
    async cardLink({ shopId, returnUrl }) {
      const row = await rowFor(shopId);
      if (!(await comesBackHome(shopId, returnUrl))) throw new BillingError(400, "The page to come back to must be on the platform or in this shop's admin.");
      const back = new URL(returnUrl);
      back.searchParams.set("card", "added");
      const session = await call("POST", "/v1/checkout/sessions", {
        params: {
          mode: "setup",
          customer: row.customerId,
          currency: cur(row).toLowerCase(),
          success_url: back.toString(),
          cancel_url: returnUrl,
          metadata: { lmb_shop_id: shopId },
          setup_intent_data: { metadata: { lmb_shop_id: shopId } },
        },
      });
      return { url: session.url };
    },

    /**
     * Cancels at the end of the paid period (or the trial). The shop stays open until then. `reason` and `words` are the
     * press's optional answer to "why are you leaving?" (19.8, leaving.js), kept on the row as `leaving` and logged;
     * cancelling with no answer works the same.
     */
    async cancel({ shopId, reason, words }) {
      const leaving = leavingAnswer({ reason, words, at: at() });
      const row = await rowFor(shopId);
      if (row.paymentWay === "payAsYouSell" && row.payAsYouSell) return cancelPayAsYouSell(shopId, row, leaving);
      if (ENDED.has(row.status)) return row;
      if (row.cancelAtPeriodEnd) return row;
      const sub = await call("POST", `/v1/subscriptions/${row.subscriptionId}`, { params: { cancel_at_period_end: true } });
      const fields = fromSubscription(sub);
      if (!fields.plan) delete fields.plan;
      const saved = await save(shopId, { ...fields, leaving }, null);
      await logChange(shopId, "cancel-requested", { status: saved.status, plan: saved.plan, access: saved.access, ...(leaving ? { reason: leaving.reason, words: leaving.words } : {}) });
      const until = saved.status === "trialing" ? saved.trialEnd : saved.currentPeriodEnd;
      await notify(shopId, "subscription-cancelled", { date: dateText(until) }, `${shopId}/cancel/${saved.subscriptionId}/${at()}`);
      return saved;
    },

    /**
     * Ends the plan now, with no refund for the rest of the period: the closing sweep's step after 60 days paused
     * (closing.js). A plan that has ended already is left as it is.
     */
    async endPlan({ shopId }) {
      const row = await rowFor(shopId);
      if (ENDED.has(row.status)) return row;
      const sub = await call("DELETE", `/v1/subscriptions/${row.subscriptionId}`);
      return sync(shopId, sub, "plan-ended");
    },

    /** Undoes a cancel that hasn't happened yet. */
    async keep({ shopId }) {
      const row = await rowFor(shopId);
      // Paying as they sell, Stripe's cancel is the switch itself: undoing it would bill monthly on top of the fees.
      if (row.paymentWay === "payAsYouSell") {
        const until = payAsYouSellEnds(row);
        if (!until) throw new BillingError(409, "You pay as you sell, so there's no cancel to undo. To pay monthly instead, switch under How you pay.");
        if (now() >= Date.parse(until)) return row;
        const terms = { ...row.payAsYouSell, until: null };
        if (await registry.getShop(shopId)) await registry.updateShop(shopId, { payAsYouSell: terms });
        const kept = await save(shopId, { payAsYouSell: terms, ...(row.leaving ? { leaving: { ...row.leaving, keptAt: at() } } : {}) }, "cancel-undone");
        await notify(shopId, "cancel-undone", {}, `${shopId}/kept/pays/${at()}`);
        return kept;
      }
      if (!row.cancelAtPeriodEnd || ENDED.has(row.status)) return row;
      const sub = await call("POST", `/v1/subscriptions/${row.subscriptionId}`, { params: { cancel_at_period_end: false } });
      // The press's answer stays, marked as one who stayed (19.8).
      if (row.leaving) await save(shopId, { leaving: { ...row.leaving, keptAt: at() } }, null);
      const kept = await sync(shopId, sub, "cancel-undone");
      await notify(shopId, "cancel-undone", {}, `${shopId}/kept/${row.subscriptionId}/${at()}`);
      return kept;
    },

    /**
     * Moves the shop to another plan (code plan 6.11). A plan that opens an app the shop doesn't have yet, for more
     * money, is prorated at once. A plan that drops an app keeps it open to the end of the month already paid for and
     * then closes it (closeDroppedApps), with its download kept 90 days; the new price starts with the next month.
     * During the trial, or while nothing is paid, the change takes effect at once. The registry row's `plan` says what
     * is open: the shop maker's sweep then builds the app the new plan brings and rewrites the profile's `apps`
     * (signup/shopMaker.js syncPlan), and does the same when a dropped app closes.
     *
     * `preview: true` changes nothing and answers what would change: the apps added and closed, when, and the
     * prorated amount Stripe would charge now.
     */
    async changePlan({ shopId, plan, preview = false, reason = null, everything = false }) {
      await freshFees();
      if (!isPlan(plan)) throw new BillingError(400, "Choose a plan: shop, stockroom or both.");
      // The optional answer to "why are you dropping it?", checked before anything changes.
      const why = dropReason(reason, (message) => new BillingError(400, message));
      const row = await rowFor(shopId);
      // Paying as they sell (6.19): the subscription has ended on purpose, and the fees need the website.
      const asItSells = row.paymentWay === "payAsYouSell";
      if (asItSells && !PAY_AS_YOU_SELL_PLANS.includes(plan)) {
        throw new BillingError(409, "You pay as you sell, which needs the website. To keep only the stockroom, switch to paying monthly first, under How you pay.");
      }
      const subscriptionOn = !ENDED.has(row.status);
      if (!subscriptionOn && !asItSells) throw new BillingError(409, "This plan has ended; start a new one instead.");
      const move = planMove(row, plan);
      if (preview) return { ...move, prorated: move.prorate ? await prorated(row, plan) : null };
      if (row.plan === plan) return { ...row, changed: false };
      const changes = (row.planChanges ?? 0) + 1;
      // Paying as they sell: the monthly cap follows the plan's price (in the same proportion, so a founding press keeps
      // its share off); the share of each sale stays as chosen.
      // That holds while those terms still apply: paying as they sell, or the last month of it before monthly starts.
      const termsApply = row.payAsYouSell && (asItSells || (row.payAsYouSell.until && now() < Date.parse(row.payAsYouSell.until)));
      const terms = termsApply
        ? { ...row.payAsYouSell, capMinor: Math.floor((row.payAsYouSell.capMinor * priceOf(plan, row).amount) / ownPrice(row).amount) }
        : null;
      // No subscription runs while a press pays as they sell, so there is nothing to change on Stripe.
      const sub = !subscriptionOn ? null : await call("POST", `/v1/subscriptions/${row.subscriptionId}`, {
        params: {
          items: [{ id: row.itemId, price: await ensurePrice(plan, cur(row)) }],
          proration_behavior: move.prorate ? "create_prorations" : "none",
          metadata: { lmb_plan: plan },
          // Only once Stripe Tax can place the press: a card added while tax was off left no address on the customer.
          ...(tax && row.hasCard && (await taxLocated(row)) ? { automatic_tax: { enabled: true } } : {}),
        },
        idempotencyKey: `plan-${shopId}-${changes}-${plan}`,
      });
      const closedApps = { ...(row.closedApps ?? {}) };
      for (const app of move.adds) delete closedApps[app];
      const appsClosing = move.closes.length && !move.immediate ? { apps: move.closes, at: move.closesAt, downloadUntil: move.downloadUntil } : null;
      // The registry first: the shop's copies read which apps are open from it, and the shop maker's sweep builds an
      // added app from it (signup/shopMaker.js syncPlan).
      if (await registry.getShop(shopId)) await registry.updateShop(shopId, { plan: move.openPlan, closedApps, ...(terms ? { payAsYouSell: terms } : {}) });
      // Which apps the press dropped with time to change their mind, and which closing ones they kept after all.
      // An immediate close (a trial) is recorded too, with its answer, and marked closed by closeApps just after.
      const appDrops = noteDrops(row.appDrops, { dropped: move.immediate ? move.closes : appsClosing?.apps ?? [], kept: (row.appsClosing?.apps ?? []).filter((app) => PLAN_APPS[plan][app]), reason: why }, at());
      // Any plan change ends an emailed keep link: it was for the press's earlier choice (closedApps.js).
      let saved = await save(shopId, { ...(sub ? fromSubscription(sub) : {}), plan, planChanges: changes, feeCents: priceOf(plan, row).amount, appsClosing, closedApps, appDrops, keepLink: null, ...(terms ? { payAsYouSell: terms } : {}) }, "plan-changed");
      if (move.immediate && move.closes.length) saved = await closeApps(shopId, move.closes);
      const closing = move.closes.length ? { closing: move.closes.map((app) => APP_NAMES[app]).join(" and "), date: dateText(move.closesAt), now: move.immediate } : {};
      await notify(shopId, "plan-changed", { prorated: move.prorate, ...closing, ...(everything ? { everything: true, adds: move.adds } : {}) }, `${shopId}/plan/${changes}`);
      return { ...saved, changed: true };
    },

    /**
     * Colophon's own plan sales over the last 12 months by the press's province, against the lines where registering
     * for GST/HST, Quebec's tax and BC's tax becomes due (code plan 15.20, taxWatch.js). Reads Stripe's paid invoices.
     */
    async taxWatch() {
      const since = Math.floor(now() / 1000) - WATCH_WINDOW_DAYS * 86400;
      const invoices = [];
      let after;
      for (let page = 0; page < 200; page += 1) {
        const list = await call("GET", "/v1/invoices", { params: { status: "paid", created: { gte: since }, limit: 100, ...(after ? { starting_after: after } : {}) } });
        for (const inv of list?.data ?? []) {
          invoices.push({ created: inv.created, amount: (inv.total ?? 0) - invoiceTax(inv), currency: inv.currency, state: inv.customer_address?.state, country: inv.customer_address?.country });
        }
        if (!list?.has_more || !list.data?.length) break;
        after = list.data.at(-1).id;
      }
      return watchTaxLines({ invoices, now: now() });
    },

    /** The plan's invoices, newest first, each with Stripe's own PDF and page (code plan 6.12): the first page. */
    async invoices(shopId) {
      return (await this.invoicePage(shopId)).invoices;
    },

    /**
     * One page of a shop's platform bills, newest first: { invoices, more, after }. Every bill the shop was ever sent,
     * not only its current plan's: one Stripe customer can pay for several shops, and a shop that ended and came back
     * has a new subscription, so the customer's bills are read and kept when their subscription is this shop's (its id,
     * or the shop id Stripe copies onto the bill from the subscription). `after` (from the last page) reads older ones.
     */
    async invoicePage(shopId, { after = null, limit = 24 } = {}) {
      const row = await subscriptions.get(shopId);
      if (!row?.subscriptionId && !row?.customerId) return { invoices: [], more: false, after: null };
      const size = Math.min(Math.max(Number(limit) || 24, 1), 100);
      const mine = (invoice) => {
        const sub = invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
        const meta = invoice.parent?.subscription_details?.metadata ?? invoice.subscription_details?.metadata ?? {};
        return (sub && sub === row.subscriptionId) || meta.lmb_shop_id === shopId;
      };
      const found = [];
      let cursor = typeof after === "string" && /^in_\w+$/.test(after) ? after : null;
      let more = false;
      // A customer paying for many shops: read on until a page is full, at most ten Stripe pages a call.
      for (let page = 0; page < 10 && found.length < size; page += 1) {
        const params = row.customerId ? { customer: row.customerId, limit: 100 } : { subscription: row.subscriptionId, limit: 100 };
        const list = await call("GET", "/v1/invoices", { params: { ...params, ...(cursor ? { starting_after: cursor } : {}) } });
        const data = list?.data ?? [];
        more = Boolean(list?.has_more);
        for (const invoice of data) {
          cursor = invoice.id;
          if (invoice.status !== "draft" && mine(invoice)) found.push(invoice);
          if (found.length >= size) { more = more || invoice !== data.at(-1); break; }
        }
        if (!more || !data.length) break;
      }
      return {
        invoices: found.map((invoice) => ({
          id: invoice.id,
          number: invoice.number ?? "",
          date: iso(invoice.created),
          covers: billCovers(invoice),
          amount: moneyText(invoice.total ?? invoice.amount_due ?? 0, invoice.currency ?? cur(row)),
          tax: invoiceTax(invoice) ? moneyText(invoiceTax(invoice), invoice.currency ?? cur(row)) : "",
          status: invoice.status,
          pdfUrl: httpsOrNull(invoice.invoice_pdf),
          pageUrl: httpsOrNull(invoice.hosted_invoice_url),
        })),
        more,
        after: more ? cursor : null,
      };
    },

    /** The shop's plan as the Plan & billing page shows it. */
    async status(shopId) {
      await freshFees();
      const row = await subscriptions.get(shopId);
      if (!row) return null;
      const price = row.plan ? ownPrice(row) : null;
      const ended = ENDED.has(row.status);
      const trialDaysLeft = row.status === "trialing" && row.trialEnd ? Math.max(0, Math.ceil((Date.parse(row.trialEnd) - now()) / DAY)) : null;
      const nextPaymentAt = ended || row.cancelAtPeriodEnd || !row.hasCard ? null : row.status === "trialing" ? row.trialEnd : PAID.has(row.status) ? row.currentPeriodEnd : null;
      return {
        plan: row.plan, planName: price?.name ?? "", price: price?.priceText ?? "", plusTax: tax, currency: cur(row), status: row.status, access: row.access,
        trialEnd: row.trialEnd, trialDaysLeft, currentPeriodEnd: row.currentPeriodEnd, nextPaymentAt,
        // Cancelled by the press (never Stripe's cancel that is a switch to pay as you sell), and the day a cancel (asked
        // for, or asked for now) closes the shop.
        cancelAtPeriodEnd: planEnding(row).cancelling, cancelEndsAt: cancelEndsAt(row, now()),
        hasCard: row.hasCard, card: row.hasCard && row.card ? { brand: row.card.brand, last4: row.card.last4, expMonth: row.card.expMonth, expYear: row.card.expYear, words: cardWords(row.card) } : null,
        appsClosing: row.appsClosing ?? null, closedApps: row.closedApps ?? {},
        plans: PLAN_IDS.map((id) => { const p = priceOf(id, row); return { plan: id, name: p.name, price: p.priceText, apps: APPS.filter((app) => PLAN_APPS[id][app]) }; }),
        paymentWay: currentPaymentWay(row, now()),
        // Pay what you use: the flat fee plus last month's running cost, and the "tell me if it may pass" amount.
        usage: {
          fee: price?.priceText ?? "",
          lastMonth: row.lastRunningCost ? { month: row.lastRunningCost.month, monthWords: monthWords(row.lastRunningCost.month), cents: row.lastRunningCost.cents, text: moneyText(row.lastRunningCost.cents, cur(row)) } : null,
          alert: { cents: Number.isInteger(row.costAlert?.cents) ? row.costAlert.cents : DEFAULT_ALERT_CENTS, text: moneyText(Number.isInteger(row.costAlert?.cents) ? row.costAlert.cents : DEFAULT_ALERT_CENTS, cur(row)) },
        },
        founding: row.founding === true ? { percentOff: row.foundingPercentOff ?? null, price: price && row.foundingPercentOff ? moneyText(foundingAmount(price.amount, row.foundingPercentOff), price.currency) : "" } : null,
        // Only while something is owed: a problem left over from a bill voided or settled some other way doesn't linger.
        paymentProblem: OWING.has(row.status) && row.paymentProblem ? { kind: row.paymentProblem.kind, at: row.paymentProblem.at, amount: row.paymentProblem.amount ?? "", nextTry: row.paymentProblem.nextTry ?? null, pageUrl: httpsOrNull(row.paymentProblem.pageUrl) } : null,
        canPayNow: OWING.has(row.status) && Boolean(row.hasCard),
        // The paying card runs out within a month (or has): the Billing page asks for a new one until it's saved.
        cardRunsOut: cardRunningOut(row, now()),
        // The language of the platform's emails: the press's choice ("fr", "en" or "auto"), and what "auto" comes to.
        emailLanguage: { choice: row.language ?? "auto", sends: mailLanguage(row) },
      };
    },

    /**
     * The language of the platform's emails to this account ("fr", "en", or "auto": French then English for a Quebec
     * billing address, else English). It's the person's, so every shop the account pays for (one Stripe customer) follows.
     */
    async setEmailLanguage({ shopId, language }) {
      if (!["fr", "en", "auto"].includes(language)) throw new BillingError(400, "Choose French, English, or automatic.");
      const row = await subscriptions.get(shopId);
      if (!row) throw new BillingError(404, "This shop has no plan yet.");
      const shops = row.customerId ? (await subscriptions.list()).filter((other) => other.customerId === row.customerId).map((other) => other.shopId) : [];
      for (const id of new Set([shopId, ...shops])) await save(id, { language: language === "auto" ? null : language }, null);
      await logChange(shopId, "email-language-changed", { language });
      await syncInvoiceLanguage(shopId);
      return { changed: true, emailLanguage: { choice: language, sends: mailLanguage({ ...row, language: language === "auto" ? null : language }) } };
    },

    /**
     * "Keep it": the press changes their mind about an app their plan change will close at the end of the paid month.
     * The plan goes back to one with every app open now (a plan change like any other, so Stripe, the registry and the
     * shop's copies follow the one path). Nothing to keep answers 409.
     */
    async keepClosingApps({ shopId }) {
      const row = await rowFor(shopId);
      const closing = row.appsClosing?.apps ?? [];
      if (!closing.length) throw new BillingError(409, "Nothing on your plan is closing, so there's nothing to keep.");
      const plan = planOpening([...new Set([...APPS.filter((app) => PLAN_APPS[row.plan]?.[app]), ...closing])]);
      return api.changePlan({ shopId, plan });
    },

    /**
     * "Keep it" from the reminder email's one-time link, with no sign-in (closedApps.js keepLinkProblem): only for the
     * closing it was made for, only once, only until the app closes, and it can do nothing but keep the closing app.
     */
    async keepClosingAppsByLink({ shopId, token }) {
      const row = await subscriptions.get(shopId);
      const problem = keepLinkProblem(row, token, now());
      if (problem) throw new BillingError(problem.status, problem.message);
      const kept = await api.keepClosingApps({ shopId });
      await save(shopId, { keepLink: { ...row.keepLink, usedAt: at() } }, null);
      await logChange(shopId, "apps-kept-by-email", { apps: row.appsClosing.apps });
      return kept;
    },

    /**
     * The daily sweep for 6.11: an app a plan dropped closes once the month already paid for ends. Safe to repeat: a
     * closed app is not closed again.
     */
    /**
     * Every shop gets the website and the stockroom (10 November 2026). The daily job moves a shop still on the shop or
     * stockroom plan to the one plan, at the same fee and with nothing prorated; any app it was closing stays open, and
     * a closed one comes back. The shop maker's sweep then builds the app it didn't have (signup/shopMaker.js syncPlan).
     * Safe to repeat: a shop on the one plan, or whose plan has ended, is left alone.
     */
    async giveEveryApp() {
      const moved = [];
      const failed = [];
      for (const row of await subscriptions.list()) {
        if (!row?.plan || row.plan === PLAN) continue;
        if (ENDED.has(row.status) && row.paymentWay !== "payAsYouSell") continue;
        try {
          await api.changePlan({ shopId: row.shopId, plan: PLAN, everything: true });
          moved.push(row.shopId);
        } catch (failure) {
          failed.push(`${row.shopId}: ${failure.message}`);
        }
      }
      if (failed.length) throw new Error(`Moving shops to every app finished, but ${failed.length} had trouble: ${failed.join("; ")}`);
      return moved;
    },

    async closeDroppedApps() {
      const closed = [];
      const failed = [];
      for (const row of await subscriptions.list()) {
        try {
          await sweepOne(row, closed);
        } catch (failure) {
          // One shop's trouble (an email that won't go, say) never stops the others; the run still reports it.
          failed.push(`${row.shopId}: ${failure.message}`);
        }
      }
      if (failed.length) throw new Error(`The dropped-apps sweep finished, but ${failed.length} shop${failed.length > 1 ? "s" : ""} had trouble: ${failed.join("; ")}`);
      return closed;
    },


    /**
     * Pay what you use (runningCost.js): last month's running cost goes on each paying shop's next bill as its own line,
     * "Running cost, October 2026". `costs` is { [shopId]: cents } for the whole of `month` (meters or the billing
     * export, read by the job). Only the part of the month the plan was paid for is charged (a trial month costs
     * nothing), never the platform fee's founding share (the line isn't discountable). Safe to run every day: a month
     * once billed is kept on the billing record and Stripe's idempotency key stops a second line.
     */
    async billRunningCosts({ month, costs = {} }) {
      monthBounds(month);
      const billed = [], skipped = [], missing = [], failed = [], waiting = [];
      const home = homeCurrency(settings);
      // Google bills the platform in its home currency (CAD). A press billed in another currency (US dollars) pays the
      // same cost converted at the month's exchange rate (exchangeRate.js), with no markup; one rate per month and
      // currency, read once. No rate yet: the line waits for the next run.
      const rates = new Map();
      const rateFor = async (currency) => {
        if (currency === home) return 1;
        if (!rates.has(currency)) rates.set(currency, exchange ? await exchange.rate({ from: home, to: currency, month }).catch(() => null) : null);
        return rates.get(currency);
      };
      for (const row of await subscriptions.list()) {
        if (!row.subscriptionId || row.runningCosts?.[month]) continue;
        if (ENDED.has(row.status) || row.testShop === true || currentPaymentWay(row, now()) === "payAsYouSell") { skipped.push(row.shopId); continue; }
        const full = costs[row.shopId];
        if (!Number.isInteger(full)) { missing.push(row.shopId); continue; }
        try {
          const currency = cur(row);
          const rate = await rateFor(currency);
          if (!(Number.isFinite(rate) && rate > 0)) { waiting.push(row.shopId); continue; }
          const share = paidShare({ month, paidFrom: row.trialEnd });
          const cents = Math.round(Math.max(0, full) * share * rate);
          let invoiceItemId = null;
          // A line made on an earlier run whose record didn't save: use it, never add a second one.
          const made = cents > 0 ? await runningCostLine(row, month) : null;
          if (made) invoiceItemId = made.id;
          else if (cents > 0) {
            const item = await call("POST", "/v1/invoiceitems", {
              params: {
                customer: row.customerId, subscription: row.subscriptionId, amount: cents, currency: currency.toLowerCase(),
                description: `Running cost, ${monthWords(month)} / Coût de fonctionnement`, discountable: false,
                // "Plus tax", taxed as the same service as the fee.
                ...(tax ? { tax_behavior: "exclusive", tax_code: settings.taxCode } : {}),
                metadata: { lmb_shop_id: row.shopId, lmb_month: month, lmb_kind: "running-cost", ...(currency !== home ? { lmb_cost_currency: home, lmb_cost_cents: String(full), lmb_rate: String(rate) } : {}) },
              },
              idempotencyKey: `running-cost-${row.shopId}-${month}`,
            });
            invoiceItemId = item?.id ?? null;
          }
          const entry = { cents: made ? made.amount : cents, fullCents: full, share, invoiceItemId, at: at(), ...(currency !== home ? { currency, costCurrency: home, rate } : {}) };
          await save(row.shopId, { runningCosts: { ...(row.runningCosts ?? {}), [month]: entry }, lastRunningCost: { month, cents: entry.cents } }, null);
          await logChange(row.shopId, "running-cost-billed", { month, cents: entry.cents });
          billed.push({ shopId: row.shopId, cents: entry.cents });
        } catch (failure) {
          failed.push(`${row.shopId}: ${failure.message}`);
        }
      }
      if (failed.length) throw new Error(`Running costs billed, but ${failed.length} shop${failed.length > 1 ? "s" : ""} had trouble: ${failed.join("; ")}`);
      return { month, billed, skipped, missing, waiting };
    },

    /**
     * The daily heads-up: when this month's bill (fee plus running cost so far, carried on to the month's end) looks set
     * to pass the amount the press chose (DEFAULT_ALERT_CENTS unless they set one), they're emailed once that month.
     * `soFar` is { [shopId]: cents } for the month so far.
     */
    async runningCostAlerts({ month, soFar = {} }) {
      await freshFees();
      const sent = [];
      const home = homeCurrency(settings);
      // A press billed in US dollars: the cost so far (in the home currency) at the latest rate this month.
      const rates = new Map();
      for (const row of await subscriptions.list()) {
        if (!row.subscriptionId || ENDED.has(row.status) || row.status === "trialing" || row.costAlert?.sentFor === month) continue;
        if (!Number.isInteger(soFar[row.shopId])) continue;
        const limit = Number.isInteger(row.costAlert?.cents) ? row.costAlert.cents : DEFAULT_ALERT_CENTS;
        if (limit <= 0) continue;
        const fee = row.plan ? feeAfterOffer(row) : 0;
        const currency = cur(row);
        if (currency !== home && !rates.has(currency)) rates.set(currency, exchange ? await exchange.rate({ from: home, to: currency, month }).catch(() => null) : null);
        const rate = currency === home ? 1 : rates.get(currency);
        if (!(Number.isFinite(rate) && rate > 0)) continue;
        const projected = fee + Math.round(projectedCents({ soFarCents: soFar[row.shopId], now: now(), month }) * rate);
        if (projected <= limit) continue;
        await notify(row.shopId, "bill-heads-up", { month: monthWords(month), projected: moneyText(projected, cur(row)), limit: moneyText(limit, cur(row)) }, `${row.shopId}/bill-heads-up/${month}`);
        await save(row.shopId, { costAlert: { ...(row.costAlert ?? {}), sentFor: month } }, "bill-heads-up-sent");
        sent.push(row.shopId);
      }
      return sent;
    },

    /** The press's "tell me if my bill may pass" amount, in cents (0 turns the email off). */
    async setCostAlert({ shopId, cents }) {
      if (!Number.isInteger(cents) || cents < 0 || cents > 1_000_000) throw new BillingError(400, "Choose an amount from $0 to $10,000. $0 turns the email off.");
      const row = await rowFor(shopId);
      await save(shopId, { costAlert: { ...(row.costAlert ?? {}), cents } }, "cost-alert-changed");
      return { costAlert: { cents, text: moneyText(cents, cur(row)) } };
    },

    /**
     * The daily sweep for 6.12 (cardExpiry.js, run nightly since 19.9): a month before the card on file runs out, the
     * person who pays is emailed, once per card and expiry (a new card, or a new expiry date, gets its own email when its
     * time comes). Only for a plan still running and not cancelled.
     */
    /**
     * The control room's "Send reminder" on a failed plan payment: the press gets the email the failure sent (or the
     * bank-confirm one) again, with the link to fix it. Only while a payment is owed; a paused plan already had its own
     * email. At most one a day per shop (the email key carries the day), so a double tap never sends two.
     * `note` is the owner's own short line, put first in the email. Answers { sent, to, kind } or { sent: false, why }.
     */
    async remindPayment({ shopId, note = "" }) {
      const line = typeof note === "string" ? note.trim().replace(/\s+/g, " ").slice(0, 300) : "";
      const row = await subscriptions.get(shopId);
      if (!row || !OWING.has(row.status)) return { sent: false, why: "Nothing is owed on this shop's plan." };
      if (row.access === "paused") return { sent: false, why: "This shop is paused; the press already has the email to add a card." };
      if (!row.billingEmail) return { sent: false, why: "This shop has no billing email to send to." };
      const problem = row.paymentProblem ?? null;
      const kind = problem?.kind === "confirm" ? "payment-needs-confirming" : "payment-failed";
      const mail = await notify(shopId, kind, { ...(problem?.amount ? { price: problem.amount } : {}), nextTry: dateText(problem?.nextTry ?? null), ...(line ? { note: line } : {}) }, `${shopId}/remind/${at().slice(0, 10)}`);
      if (mail?.alreadySent) return { sent: false, why: "This press was already reminded today." };
      await logChange(shopId, "payment-reminder", { kind, note: line || null });
      // Kept on the row (and its registry copy) so Today and Failed payments show when the press was last reminded.
      const { remindedAt } = await save(shopId, { remindedAt: at() }, null);
      return { sent: true, to: row.billingEmail, kind, remindedAt };
    },

    async cardExpiryReminders() {
      const sent = [];
      for (const row of await subscriptions.list()) {
        const due = cardWarningDue(row, now());
        if (!due) continue;
        const { ends, key } = due;
        await notify(row.shopId, "card-expiring", { card: cardWords(row.card), date: dateText(ends), month: new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(ends)) }, `${row.customerId}/card-expiring/${key}`);
        await save(row.shopId, { cardWarned: key }, "card-expiring-sent");
        sent.push(row.shopId);
      }
      return sent;
    },

    /**
     * Stripe's events for the platform account. `rawBody` is the request body exactly as received (the signature
     * covers it). Answers { status, body }: 400 for a bad signature, 200 once handled or when the event isn't ours.
     * A failure answers 500 and releases the claim, so Stripe sends the event again; nothing is marked handled until it
     * succeeds. A copy that arrives while another is being handled answers 409, so Stripe sends it again later.
     */
    async handleEvent({ headers, rawBody }) {
      const signature = Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === "stripe-signature")?.[1];
      if (!webhookSecrets.some((secret) => verifySignature(secret, rawBody, signature, { now: now() }))) {
        return { status: 400, body: { ok: false, message: "The signature doesn't match." } };
      }
      let event;
      try {
        event = JSON.parse(rawBody);
      } catch {
        return { status: 400, body: { ok: false, message: "The event isn't JSON." } };
      }
      if (Boolean(event.livemode) !== (mode === "live")) return { status: 200, body: { ok: true, ignored: "other mode" } };
      // One copy of the event claims it (19.4); a copy arriving meanwhile is sent back to try later.
      const claim = await claimEvent(events, event.id, { at: at() });
      if (claim === "duplicate") return { status: 200, body: { ok: true, duplicate: true } };
      if (claim === "in-progress") return { status: IN_PROGRESS_STATUS, body: { ok: false, inProgress: true, message: "This event is being handled right now. Send it again later." } };
      try {
        const handled = await handle(event);
        await events.mark(event.id, { type: event.type, at: at(), handled });
        return { status: 200, body: { ok: true, handled } };
      } catch (error) {
        await releaseEvent(events, event.id);
        return { status: 500, body: { ok: false, message: error.message } };
      }
    },
  };
  return api;

  /** The shop row an invoice belongs to, by its subscription (both Stripe shapes), or null. */
  async function rowOfInvoice(invoice) {
    const subscriptionId = invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
    if (!subscriptionId) return null;
    return subscriptions.findBySubscriptionId(typeof subscriptionId === "string" ? subscriptionId : subscriptionId.id);
  }

  /** One event. Returns what it did, for the events log. */
  async function handle(event) {
    const object = event.data?.object ?? {};
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
      case "customer.subscription.deleted":
      case "customer.subscription.trial_will_end": {
        const shopId = object.metadata?.lmb_shop_id;
        const known = shopId ? await subscriptions.get(shopId) : null;
        if (!known || known.subscriptionId !== object.id) return "not ours";
        // Stripe doesn't promise to send events in order: an "updated" from before a "deleted" can come after it. An
        // event older than the last one this subscription's row took would put old state back, so it is left alone.
        const created = Number.isFinite(event.created) ? event.created : null;
        const last = known.lastEvent?.subscriptionId === object.id ? known.lastEvent.created : null;
        if (created !== null && last !== null && created < last) return "older than what we have";
        // An ended Stripe subscription never comes back, and Stripe stamps events in whole seconds: an "updated" from the
        // same second as the "deleted" could otherwise pass the check above and reopen the plan.
        if (ENDED.has(known.status) && event.type !== "customer.subscription.deleted") return "already ended";
        const saved = await sync(shopId, object, event.type.replace("customer.subscription.", "stripe-"), created === null ? null : { subscriptionId: object.id, created });
        // Paying as they sell: the subscription ending is the switch itself, and no card is asked for.
        if (saved.paymentWay === "payAsYouSell") return saved.status;
        if (event.type === "customer.subscription.trial_will_end") {
          await notify(shopId, "trial-ending", { date: dateText(saved.trialEnd), hasCard: saved.hasCard }, event.id);
        } else if (event.type === "customer.subscription.paused") {
          await notify(shopId, "card-needed", {}, event.id);
        } else if (event.type === "customer.subscription.deleted") {
          await notify(shopId, "subscription-ended", {}, event.id);
          if (saved.founding === true && !saved.paidOnce) await giveBackFounding(shopId);
        }
        return saved.status;
      }
      case "invoice.payment_failed": {
        const subscriptionId = object.subscription ?? object.parent?.subscription_details?.subscription;
        const row = subscriptionId ? await subscriptions.findBySubscriptionId(typeof subscriptionId === "string" ? subscriptionId : subscriptionId.id) : null;
        if (!row) return "not ours";
        if (paidAlready(row, object)) return "already paid";
        const amount = moneyText(object.amount_due ?? 0, object.currency ?? cur(row));
        await save(row.shopId, { paymentProblem: { kind: "declined", at: at(), invoiceId: object.id ?? null, amount, nextTry: iso(object.next_payment_attempt), pageUrl: httpsOrNull(object.hosted_invoice_url) } }, null);
        await logChange(row.shopId, "payment-failed", { attempt: object.attempt_count ?? null });
        await notify(row.shopId, "payment-failed", { price: amount, nextTry: dateText(iso(object.next_payment_attempt)) }, event.id);
        return "payment failed";
      }
      case "invoice.payment_action_required": {
        // The bank wants the press to confirm the payment (3D Secure): Stripe keeps the bill open meanwhile.
        const row = await rowOfInvoice(object);
        if (!row) return "not ours";
        if (paidAlready(row, object)) return "already paid";
        const amount = moneyText(object.amount_due ?? 0, object.currency ?? cur(row));
        await save(row.shopId, { paymentProblem: { kind: "confirm", at: at(), invoiceId: object.id ?? null, amount, nextTry: null, pageUrl: httpsOrNull(object.hosted_invoice_url) } }, null);
        await logChange(row.shopId, "payment-needs-confirming", {});
        // The button opens Stripe's page for this bill, where the bank's step happens; the account page if there's none.
        await notify(row.shopId, "payment-needs-confirming", { price: amount, ...(httpsOrNull(object.hosted_invoice_url) ? { link: object.hosted_invoice_url } : {}) }, event.id);
        return "payment needs confirming";
      }
      case "invoice.paid": {
        // A bill paid: a payment problem it settles is cleared, and the press hears it went through.
        const row = await rowOfInvoice(object);
        if (!row) return "not ours";
        const problem = row.paymentProblem;
        const settles = problem && (!problem.invoiceId || problem.invoiceId === object.id);
        await save(row.shopId, { lastPaidAt: at(), lastPaidInvoiceId: object.id ?? null, ...((object.amount_paid ?? 0) > 0 ? { paidOnce: true } : {}), ...(settles ? { paymentProblem: null } : {}) }, null);
        const paid = moneyText(object.amount_paid ?? object.total ?? 0, object.currency ?? cur(row));
        const bill = httpsOrNull(object.hosted_invoice_url);
        if (!settles) {
          // A receipt for every bill with money on it (25.1), keyed on the bill so a second event never sends it twice.
          if ((object.amount_paid ?? 0) <= 0) return "paid";
          const period = object.lines?.data?.[0]?.period ?? {};
          const taxCents = invoiceTax(object);
          await notify(row.shopId, "bill-paid", {
            price: paid, number: typeof object.number === "string" ? object.number : "",
            paidOn: dateText(iso(object.status_transitions?.paid_at) ?? at()),
            from: dateText(iso(period.start)), to: dateText(iso(Number.isFinite(period.end) ? period.end - 1 : null)),
            tax: taxCents > 0 ? moneyText(taxCents, object.currency ?? cur(row)) : "",
            bill,
          }, `bill-paid/${object.id ?? event.id}`);
          return "paid";
        }
        await logChange(row.shopId, "payment-recovered", {});
        await notify(row.shopId, "payment-received", { price: paid, bill }, event.id);
        return "payment recovered";
      }
      case "checkout.session.completed": {
        if (object.mode !== "setup") return "not ours";
        const shopId = object.metadata?.lmb_shop_id;
        const row = shopId ? await subscriptions.get(shopId) : null;
        if (!row?.subscriptionId || row.customerId !== object.customer) return "not ours";
        const intentId = typeof object.setup_intent === "string" ? object.setup_intent : object.setup_intent?.id;
        const intent = await call("GET", `/v1/setup_intents/${intentId}`);
        const card = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
        if (!card) return "no card";
        const method = await call("GET", `/v1/payment_methods/${card}`);
        const address = method?.billing_details?.address;
        // With tax on, the card's billing address is where Stripe Tax places the press, so it goes on the customer first.
        const located = tax && address?.country;
        const details = method?.card ?? {};
        await cardNowPays(shopId, { id: card, brand: details.brand ?? "card", last4: details.last4 ?? "", expMonth: details.exp_month ?? null, expYear: details.exp_year ?? null }, {
          key: `card-${event.id}`, what: "card-added",
          customer: located ? { address: plainAddress(address) } : {},
          subscription: located ? { automatic_tax: { enabled: true } } : {},
        });
        return "card added";
      }
      case "payment_method.automatically_updated": {
        // The card company gave the card a new number or expiry date (Stripe's card updater): keep the plan's copy in
        // step, so the expiry warning follows the new date (19.9).
        const details = object.card ?? {};
        let updated = 0;
        for (const row of await subscriptions.list()) {
          if (row.card?.id !== object.id) continue;
          await save(row.shopId, { card: { ...row.card, brand: details.brand ?? row.card.brand, last4: details.last4 ?? row.card.last4, expMonth: details.exp_month ?? row.card.expMonth, expYear: details.exp_year ?? row.card.expYear } }, "card-updated");
          updated += 1;
        }
        return updated ? "card updated" : "not ours";
      }
      default:
        return "not handled";
    }
  }
}

/** A plan payment failing, or the plan paused or waiting for a card (the control room's payment-trouble list). */
const TROUBLE = new Set(["past_due", "unpaid", "incomplete", "paused"]);
const inTrouble = (row) => TROUBLE.has(row?.status) && row?.paymentWay !== "payAsYouSell";

/** Stripe doesn't promise the order of events: a failure arriving after its bill was paid is old news. */
const paidAlready = (row, invoice) => invoice?.status === "paid" || (Boolean(invoice?.id) && row.lastPaidInvoiceId === invoice.id);

const httpsOrNull = (url) => (typeof url === "string" && url.startsWith("https://") ? url : null);

/** The parts of a Stripe address the customer takes, without empty ones. */
function plainAddress(address) {
  return Object.fromEntries(["line1", "line2", "city", "state", "postal_code", "country"].filter((part) => address[part]).map((part) => [part, address[part]]));
}
