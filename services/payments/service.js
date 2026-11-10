// The platform payment service (docs/payments.md): the one place that holds the Stripe platform key and makes Stripe
// calls for every shop, on each press's connected (Standard) account. Three doors:
//
//   shopCall(request)               a shop's own server asks for one Stripe call on its account (checkout, lookups,
//                                   refunds, onboarding). `X-Shop-Id` + `Authorization: Bearer <shop service key>`, the
//                                   same proof the email service takes (services/email/http.js); checked against the
//                                   registry's `serviceKeyHash` and the shop's `payments` account.
//   stripeEvent(headers, rawBody)   the one Stripe Connect events address. Checks Stripe's signature, finds the shop by
//                                   the event's `account` in the registry and passes the event on to that shop. The shop
//                                   trusts nothing in what it receives: it fetches the event again through shopCall
//                                   (`events.retrieve`), which only reaches its own account.
//   findAccount / createAccount     the shop maker's step 13 (setup/payments.js), inside the platform.
//   registerPaymentDomain(shopId, domain)  the domain service (services/domains, plan 2.9), inside the platform: a
//                                   shop's web address registered with Stripe for Apple Pay and Google Pay on the press's
//                                   account. The shop's admin asks for the same through shopCall (`account.paymentDomain`).
//
// A shop whose registry `payments.provider` is "square" (code plan 2.2b) gets the Square calls instead (square.js):
// `square.*`, `account.status` and `account.connectLink`, plus `squareOAuth` (Square sends the press back there) and
// `squareEvent` (Square's events, one address per environment).
//
// A shop can switch providers after opening (accountSlots.js). `payments` stays the account that takes new sales; the
// account it sold through before is kept in `payments.earlier`, so `square.*` calls go to its Square account and the
// rest to its Stripe account, whichever is current, and only the current one starts a sale (`switched_provider`). The
// account it is moving to waits in `payments.next`: Connect Square on a Stripe shop, or Stripe's onboarding on a
// Square shop, makes it, `account.status` with `{ which: "next" }` says whether it is ready, and its events change only
// its own state. Events for an earlier account still reach the shop.
//
// The service never writes a shop's database: the shop decides what an event means for its orders and stock. It keeps
// the shop row's `payments` in the registry up to date (the account's state), and logs each change to the registry and
// the shop's audit log.
//
// Clients passed in (fakes.js has in-memory ones):
//   stripe     createStripeApi(...) from stripeApi.js
//   registry   getShop(shopId) -> row | null; findShopByPaymentAccount(provider, accountId) -> row | null;
//              updateShop(shopId, fields); recordEvent(shopId, entry)
//   auditLog   write(shopId, id, entry) (the shop's own audit-log collection)
//   accounts   the service's own record of accounts it made: get(shopId) -> { provider, accountId, mode } | null;
//              set(shopId, row)
//   deliver    (row, rawBody, provider) -> { status } posts an event to the shop's webhook (httpDeliver below)
//   squareApi  createSquareApi(...) from squareApi.js, with `tokens` and `states` (square.js); optional: without it
//              Square shops are refused
//   email      sendPlatform(message) (services/email); optional: emails the owner once when a requirement on their
//              Stripe account goes past its deadline (code plan 7.9)
//   feeLedger  the pay-as-you-sell ledger store (payAsYouSell.js, code plan 6.19); optional: without it a shop on pay
//              as you sell takes no fee (and it is logged), never the wrong one
//   deliveryStats  optional: add(shopId, kind, atIso), the control room's per-shop counts (plan 19.12): every Stripe
//              event for a shop is counted as "payment-event", and one the service answers with a failure as
//              "payment-event-failed" too. A counter that fails never stops the event.
import { shopPlaces } from "../../clients/shared.js";
import { isDeepStrictEqual } from "node:util";
import { merchantProfile } from "../../shared/sells/sells.js";
import { StripeApiError } from "./stripeApi.js";
import { SquareApiError } from "./squareApi.js";
import { createSquareService, SQUARE_CREATE_OPS, SQUARE_OP_NAMES } from "./square.js";
import { accountFor, accountOnly, findSlot, nextReady, replaceSlot, switchingTo, viewOf, withNext } from "./accountSlots.js";
import { verifySignature } from "./stripeSignature.js";
import { feeFor, feeForShop, feeSummary, takesFee } from "./fees.js";
import { activeTerms, createFeeLedger, intentBooksMinor, sessionBooksMinor } from "./payAsYouSell.js";
import { accountNeeds } from "./requirements.js";
import { serviceKeyMatches } from "../email/http.js";

const PAYOUT_INTERVALS = new Set(["manual", "daily", "weekly", "monthly"]);
const WEEKDAYS = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);

/**
 * When Stripe pays the press (the account's settings.payouts.schedule), shown under Payouts in Settings › Payments:
 * { interval, delayDays, weeklyAnchor, monthlyAnchor }, or null when Stripe doesn't say. Only known values pass.
 */
export function payoutSchedule(account) {
  const s = account?.settings?.payouts?.schedule;
  if (!s || !PAYOUT_INTERVALS.has(s.interval)) return null;
  const whole = (n, lo, hi) => (Number.isInteger(n) && n >= lo && n <= hi ? n : null);
  return {
    interval: s.interval,
    delayDays: whole(s.delay_days, 0, 365),
    weeklyAnchor: s.interval === "weekly" && WEEKDAYS.has(s.weekly_anchor) ? s.weekly_anchor : null,
    monthlyAnchor: s.interval === "monthly" ? whole(s.monthly_anchor, 1, 31) : null,
  };
}

/** A refusal by the service itself (not Stripe), with the HTTP status to answer with. */
export class ServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
    this.code = code;
  }
}

const ACCOUNT_ID = /^acct_[A-Za-z0-9]+$/;
const ids = { pi: /^pi_[A-Za-z0-9_]+$/, cs: /^cs_[A-Za-z0-9_]+$/, evt: /^evt_[A-Za-z0-9_]+$/, po: /^po_[A-Za-z0-9_]+$/, txn: /^txn_[A-Za-z0-9_]+$/ };

// Parameters that would move money anywhere but the press's own account, or set the platform's fee. A shop never
// sets them: the service adds the fee itself, and any of these from a shop is refused, at any depth.
const MONEY_ROUTING = new Set(["application_fee_amount", "application_fee_percent", "transfer_data", "on_behalf_of", "transfer_group", "stripe_account", "destination", "refund_application_fee", "reverse_transfer"]);

function routingKey(value) {
  if (!value || typeof value !== "object") return null;
  for (const [key, inner] of Object.entries(value)) {
    if (MONEY_ROUTING.has(key)) return key;
    const deeper = routingKey(inner);
    if (deeper) return deeper;
  }
  return null;
}

const bad = (message) => new ServiceError(400, "bad_request", message);
const plainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function idFor(kind, value) {
  if (typeof value !== "string" || !ids[kind].test(value)) throw bad(`a ${kind}_… id is needed`);
  return value;
}

// Only these parameters, for the lookups.
function only(params, allowed) {
  if (params !== undefined && !plainObject(params)) throw bad("parameters must be an object");
  const out = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (!allowed.includes(key)) throw bad(`${key} can't be sent here`);
    out[key] = value;
  }
  return out;
}
const expandOnly = (params, allowed) => {
  const out = only(params, ["expand"]);
  if (out.expand === undefined) return {};
  if (!Array.isArray(out.expand) || !out.expand.every((item) => allowed.includes(item))) throw bad(`only ${allowed.join(", ") || "nothing"} can be expanded`);
  return out;
};
const limitOk = (limit) => {
  if (limit !== undefined && !(Number.isInteger(limit) && limit >= 1 && limit <= 100)) throw bad("limit must be 1 to 100");
};
const listParams = (params) => {
  const out = only(params, ["payment_intent", "limit"]);
  idFor("pi", out.payment_intent);
  limitOk(out.limit);
  return out;
};
// A payment's refunds, with each one's balance transaction when asked (its fee and net, code plan 7.10).
const refundListParams = (params) => {
  const out = only(params, ["payment_intent", "limit", "expand"]);
  idFor("pi", out.payment_intent);
  limitOk(out.limit);
  if (out.expand !== undefined) expandOnly({ expand: out.expand }, ["data.balance_transaction"]);
  return out;
};
// What one payout paid in (code plan 7.10): its balance transactions, page by page, with each one's charge or refund.
const payoutListParams = (params) => {
  const out = only(params, ["payout", "limit", "starting_after", "expand"]);
  idFor("po", out.payout);
  limitOk(out.limit);
  if (out.starting_after !== undefined) idFor("txn", out.starting_after);
  if (out.expand !== undefined) expandOnly({ expand: out.expand }, ["data.source"]);
  return out;
};

// What a Checkout Session charges, from its line items (the shop always prices with price_data). null when Stripe may
// take money off later (coupons or promotion codes): the true total isn't known here, and a fee above it would make
// Stripe refuse the whole session.
function sessionAmount(params) {
  if (params?.discounts !== undefined || params?.allow_promotion_codes) return null;
  const items = params?.line_items;
  if (!Array.isArray(items) || !items.length) return null;
  let total = 0;
  for (const item of items) {
    const unit = item?.price_data?.unit_amount;
    const quantity = item?.quantity ?? 1;
    if (!Number.isInteger(unit) || !Number.isInteger(quantity)) return null;
    total += unit * quantity;
  }
  return total;
}

/** The Stripe calls a shop may ask for. Each names Stripe's path and checks the shop's parameters. */
const SHOP_OPS = Object.freeze({
  "paymentIntents.create": { method: "POST", path: () => "/v1/payment_intents", create: "top" },
  // latest_charge.balance_transaction: the charge's fee and net, once Stripe has them (code plan 7.10).
  "paymentIntents.retrieve": { method: "GET", path: (a) => `/v1/payment_intents/${idFor("pi", a.id)}`, params: (p) => expandOnly(p, ["latest_charge", "latest_charge.balance_transaction"]) },
  "paymentIntents.cancel": { method: "POST", path: (a) => `/v1/payment_intents/${idFor("pi", a.id)}/cancel`, params: (p) => only(p, []) },
  "checkout.sessions.create": { method: "POST", path: () => "/v1/checkout/sessions", create: "payment_intent_data" },
  "checkout.sessions.retrieve": { method: "GET", path: (a) => `/v1/checkout/sessions/${idFor("cs", a.id)}`, params: (p) => expandOnly(p, []) },
  "checkout.sessions.expire": { method: "POST", path: (a) => `/v1/checkout/sessions/${idFor("cs", a.id)}/expire`, params: (p) => only(p, []) },
  "refunds.create": { method: "POST", path: () => "/v1/refunds", refund: true },
  "refunds.list": { method: "GET", path: () => "/v1/refunds", params: refundListParams },
  "disputes.list": { method: "GET", path: () => "/v1/disputes", params: listParams },
  "events.retrieve": { method: "GET", path: (a) => `/v1/events/${idFor("evt", a.id)}`, params: (p) => only(p, []) },
  "balanceTransactions.list": { method: "GET", path: () => "/v1/balance_transactions", params: payoutListParams },
});

export const SHOP_OP_NAMES = Object.freeze([...Object.keys(SHOP_OPS), "account.status", "account.onboardingLink", "account.connectLink", "account.paymentDomain", "account.switch", ...SQUARE_OP_NAMES]);

/** Stripe's controller settings that match a Standard account (the deprecated `type: "standard"`). */
export const STANDARD_CONTROLLER = Object.freeze({
  losses: Object.freeze({ payments: "stripe" }),
  fees: Object.freeze({ payer: "account" }),
  requirement_collection: "stripe",
  stripe_dashboard: Object.freeze({ type: "full" }),
});

/** The merchant category for a press selling its books to readers: "Book Stores". */
export const BOOK_STORES_MCC = "5942";

/** Stripe's business_profile category and description for what the shop sells (sign-up's answer). */
function businessKind(sells) {
  const { mcc, description } = merchantProfile(sells);
  return { mcc, product_description: description };
}

/** The shop's public web address for Stripe's business profile: its own site, or the address it starts on. */
function shopAddress(row) {
  if (typeof row.siteUrl === "string" && /^https:\/\/[^/\s]+/.test(row.siteUrl)) return row.siteUrl;
  if (row.shared === true) return row.freeAddress ? `https://${row.freeAddress}` : undefined;
  return /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(row.projectId ?? "") ? `https://${row.projectId}.web.app` : undefined;
}

/**
 * Where a shop's server code receives Stripe events (the shop's `stripeWebhook` function, apps/shop functionLink): in
 * the shared system the one shared server, told the shop by `?shop=` (clients/shared.js shopPlaces).
 */
export function shopWebhookUrl(row) {
  if (!row?.projectId) return null;
  try {
    return shopPlaces(row).fn?.("stripeWebhook") ?? null;
  } catch {
    return null;
  }
}

/** The default `deliver`: posts the event to the shop's webhook with an injected fetch. */
export function httpDeliver(fetch, { timeoutMs = 20000 } = {}) {
  return async (row, rawBody, provider = "stripe") => {
    const url = shopWebhookUrl(row);
    if (!url) return { status: 0, error: "the registry has no webhook address for this shop" };
    try {
      const response = await fetch(url, {
        method: "POST",
        // No signature: the shop fetches the event again from the service before believing any of it.
        headers: { "Content-Type": "application/json", "X-Platform-Event": provider === "square" ? "square" : "stripe" },
        body: rawBody,
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { status: response.status };
    } catch (err) {
      return { status: 0, error: String(err?.message || err) };
    }
  };
}

/** The web addresses a shop's admin can send a press back to after Stripe's sign-up pages. */
export function shopHosts(row) {
  const hosts = new Set();
  if (row.projectId) hosts.add(`${row.projectId}.web.app`).add(`${row.projectId}.firebaseapp.com`);
  const domains = Array.isArray(row.domains) ? row.domains.map((d) => (typeof d === "string" ? d : d?.name)) : [];
  for (const value of [row.siteUrl, ...domains]) {
    if (typeof value !== "string" || !value) continue;
    try { hosts.add(new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase()); } catch { /* not an address */ }
  }
  return hosts;
}

export function errorAnswer(err) {
  if (err instanceof ServiceError) return { status: err.status, body: { error: { type: "platform_error", code: err.code, message: err.message } } };
  if (err instanceof SquareApiError) return { status: err.statusCode, body: { error: { type: "square_error", code: err.code, param: err.field, message: err.message } } };
  if (err instanceof StripeApiError) return { status: err.statusCode, body: { error: { type: err.type, code: err.code, param: err.param, message: err.message } } };
  console.error("Payment service error:", err);
  return { status: 500, body: { error: { type: "platform_error", code: "internal", message: "The payment service had a problem. Try again." } } };
}

const header = (headers, name) => {
  const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  const value = Array.isArray(found?.[1]) ? found[1][0] : found?.[1];
  return typeof value === "string" ? value : "";
};

/**
 * @param {object} deps see the header comment
 * @param {{ webhookSecrets: { live: string[], test: string[] }, fee: object }} deps.config readServiceConfig()
 */
export function createPaymentService({ stripe, registry, auditLog, accounts, deliver, config, squareApi = null, tokens = null, states = null, email = null, feeLedger = null, deliveryStats = null, now = () => Date.now() }) {
  const { webhookSecrets } = config;
  const iso = () => new Date(now()).toISOString();
  const ledger = feeLedger ? createFeeLedger({ store: feeLedger, now }) : null;

  // Pay as you sell (6.19): the terms in force for this shop now, or null when it pays monthly.
  function termsFor(row) {
    try { return activeTerms(row, now()); } catch (err) { throw new ServiceError(500, "fee_setting", `The shop's pay-as-you-sell setting is wrong: ${err.message}`); }
  }

  // The fee on one checkout under pay as you sell: a share of its books, within what is left of the month's cap.
  // Answers { feeMinor, ref } (ref: the ledger entry to link the provider's ids to), or { feeMinor: 0 } when nothing
  // can be counted safely.
  async function payAsYouSellFee(row, terms, { key, booksMinor, currency }) {
    if (!ledger) {
      console.error(`${row.shopId} is on pay as you sell but the service has no fee ledger: no fee taken`);
      return { feeMinor: 0, ref: null };
    }
    if (booksMinor === null) {
      console.warn(`${row.shopId}: a checkout without a known book total takes no pay-as-you-sell fee`);
      return { feeMinor: 0, ref: null };
    }
    if (String(currency ?? "").toUpperCase() !== terms.currency) {
      console.warn(`${row.shopId}: a checkout in ${String(currency).slice(0, 3)} takes no pay-as-you-sell fee (the cap is in ${terms.currency})`);
      return { feeMinor: 0, ref: null };
    }
    return ledger.hold(row.shopId, terms, { key, booksMinor });
  }

  // Every change the service makes is written down twice: the registry's history for the shop, and the shop's own
  // audit log. Stable ids, so writing the same change twice keeps one entry.
  async function logChange(shopId, id, entry) {
    const full = { id, source: "payment-service", at: iso(), ...entry };
    await registry.recordEvent(shopId, full);
    await auditLog.write(shopId, id, full);
  }

  // The shop's admin, where the press presses Continue with Stripe. Stripe's own link is never emailed: it works
  // once, for a few minutes.
  function paymentsPage(row) {
    const site = typeof row.siteUrl === "string" && /^https:\/\/[^/\s]+/.test(row.siteUrl) ? row.siteUrl.replace(/\/+$/, "") : `https://${row.projectId}.web.app`;
    return `${site}/admin#settings/payments/methods`;
  }

  // One email for each time the account goes past due: the key holds when it did, so a repeated event (or a retry
  // after a lost answer) sends nothing new. Answers false when the email couldn't be sent, so Stripe retries.
  async function emailPastDue(row, payments, needs, accountId) {
    try {
      await email.sendPlatform({
        kind: "payments-past-due",
        to: row.ownerEmail,
        shopId: row.shopId,
        idempotencyKey: `payments-past-due/${row.shopId}/${accountId}/${payments.pastDueSince || "first"}`,
        data: { pressName: row.pressName || row.shopId, provider: "Stripe", needs: needs.needs.filter((n) => n.pastDue).map((n) => n.words), link: paymentsPage(row) },
      });
    } catch (err) {
      console.error(`The past-due email for ${row.shopId} wasn't sent: ${err?.message || err}`);
      return false;
    }
    await registry.updateShop(row.shopId, { payments: replaceSlot(row.payments, { slot: "current" }, { ...payments, pastDueEmailedAt: iso() }) });
    await logChange(row.shopId, `payments-past-due-emailed-${accountId}-${payments.pastDueSince}`, { kind: "payments.past-due-emailed", accountId });
    return true;
  }

  const square = squareApi
    ? createSquareService({ square: squareApi, registry, tokens, states, deliver, config, logChange, shopHosts, now, refuse: (status, code, message) => new ServiceError(status, code, message), payAsYouSell: { termsFor, fee: payAsYouSellFee, ledger } })
    : null;

  // The shop a call comes from: its service key must match the registry, and it must have a Stripe account there (or
  // be a Square shop: its account comes later, through Connect Square).
  async function provenShop(headers) {
    const shopId = header(headers, "x-shop-id");
    const key = header(headers, "authorization").replace(/^Bearer\s+/i, "");
    const row = shopId ? await registry.getShop(shopId) : null;
    // One answer for "no such shop" and "wrong key", so the door can't be used to find shop ids.
    if (!row || !serviceKeyMatches(key, row.serviceKeyHash)) throw new ServiceError(401, "unknown_shop", "This shop can't use the platform's payments.");
    // Abandoned, or closed by a platform admin for abuse (control room, plan 8.4): no payments either way.
    if (row.status === "abandoned" || row.closure) throw new ServiceError(403, "shop_closed", "This shop is closed.");
    const payments = row.payments;
    if (payments?.provider === "square") return row;
    if (payments?.provider !== "stripe" || !ACCOUNT_ID.test(payments.accountId ?? "")) {
      throw new ServiceError(409, "no_account", "This shop has no Stripe account with the platform yet.");
    }
    return row;
  }

  // A live call needs an account made in live mode. Accounts made in test mode (the test shop, a trial) never take
  // real money, whatever the shop asks.
  function modeFor(row, mode) {
    if (mode !== "live" && mode !== "test") throw bad("mode must be live or test");
    if (mode === "live" && row.payments.mode !== "live") throw new ServiceError(403, "test_only", "This shop takes test payments only.");
    return mode;
  }

  // A new press takes real money only once Stripe has checked them (charges_enabled; plan 8.4, so a trial made for
  // fraud can't sell before then). The registry keeps Stripe's answer from account.updated. Until it says yes, Stripe is
  // asked again, so a missed event never keeps a checked press from selling.
  // Always the shop's current account (only it takes new sales); `row` is the whole registry row.
  async function liveChargesAllowed(row) {
    if (row.payments.chargesEnabled === true) return;
    const account = await stripe.call("live", "GET", `/v1/accounts/${row.payments.accountId}`);
    if (account.charges_enabled !== true) {
      throw new ServiceError(403, "not_checked", "Stripe is still checking this press's account, so it can't take real payments yet.");
    }
    await registry.updateShop(row.shopId, { payments: replaceSlot(row.payments, { slot: "current" }, { ...accountOnly(row.payments), chargesEnabled: true, stateAt: iso() }) });
    await logChange(row.shopId, `payments-checked-${row.payments.accountId}`, { kind: "payments.charges-enabled", accountId: row.payments.accountId });
  }

  function createParams(where, params, fee) {
    if (!plainObject(params)) throw bad("parameters are needed");
    const routing = routingKey(params);
    if (routing) throw new ServiceError(400, "money_routing", `${routing} is set by the platform, never by a shop`);
    if (!takesFee(fee)) return params;
    const amount = where === "top" ? params.amount : sessionAmount(params);
    if (where !== "top" && amount === null) {
      // A session whose total isn't known up front goes ahead without a fee rather than failing in front of a shopper.
      console.warn("Checkout Session without a known total: no platform fee taken");
      return params;
    }
    if (!Number.isInteger(amount)) throw bad("the platform fee needs the payment's amount");
    const applicationFee = feeFor(amount, fee);
    if (!applicationFee) return params;
    if (where === "top") return { ...params, application_fee_amount: applicationFee };
    return { ...params, payment_intent_data: { ...(params.payment_intent_data ?? {}), application_fee_amount: applicationFee } };
  }

  function refundParams(params, fee) {
    if (!plainObject(params)) throw bad("parameters are needed");
    const routing = routingKey(params);
    if (routing) throw new ServiceError(400, "money_routing", `${routing} is set by the platform, never by a shop`);
    const out = only(params, ["payment_intent", "amount", "reason", "metadata"]);
    idFor("pi", out.payment_intent);
    if (out.amount !== undefined && !(Number.isInteger(out.amount) && out.amount > 0)) throw bad("amount must be a whole number above 0");
    // The fee goes back in proportion to the refund: Stripe returns an application fee pro rata with a partial refund.
    return fee.refunded ? { ...out, refund_application_fee: true } : out;
  }

  async function accountStatus(row, fee) {
    const account = await stripe.call(row.payments.mode, "GET", `/v1/accounts/${row.payments.accountId}`);
    return {
      accountId: account.id,
      mode: row.payments.mode,
      chargesEnabled: account.charges_enabled === true,
      payoutsEnabled: account.payouts_enabled === true,
      detailsSubmitted: account.details_submitted === true,
      requirementsDue: Array.isArray(account.requirements?.currently_due) ? account.requirements.currently_due.length : 0,
      // What Stripe still needs, in plain words, with its deadline (7.9): { needs: [{ words, pastDue }], deadline,
      // pastDue, disabledReason }.
      ...accountNeeds(account),
      payoutSchedule: payoutSchedule(account),
      // Shown to the press next to their payouts (owner's instruction, 28 October 2026).
      platformFee: feeSummary(fee),
    };
  }

  async function onboardingLink(row, { returnUrl, refreshUrl } = {}) {
    const hosts = shopHosts(row);
    for (const [name, value] of [["returnUrl", returnUrl], ["refreshUrl", refreshUrl]]) {
      let url;
      try { url = new URL(value); } catch { throw bad(`${name} must be an address`); }
      if (url.protocol !== "https:" || !hosts.has(url.hostname.toLowerCase())) throw bad(`${name} must be one of the shop's own addresses`);
    }
    const link = await stripe.call(row.payments.mode, "POST", "/v1/account_links", {
      params: { account: row.payments.accountId, type: "account_onboarding", return_url: returnUrl, refresh_url: refreshUrl },
    });
    return { url: link.url, expiresAt: link.expires_at };
  }

  // Apple Pay and Google Pay show only on web addresses registered with Stripe for the account that takes the payment.
  // Only the shop's own addresses (shopHosts). Safe to repeat: an address already registered is checked again
  // (validate), never added twice; the idempotency key holds the shop and the address.
  async function paymentDomain(row, domain) {
    const name = typeof domain === "string" ? domain.trim().toLowerCase() : "";
    if (!name || !shopHosts(row).has(name)) throw bad("the domain must be one of the shop's own addresses");
    if (row.payments?.provider === "square") return { provider: "square", needed: false };
    const mode = row.payments.mode === "live" ? "live" : "test";
    const account = row.payments.accountId;
    const found = await stripe.call(mode, "GET", "/v1/payment_method_domains", { params: { domain_name: name, limit: 1 }, account });
    const existing = Array.isArray(found?.data) ? found.data.find((d) => d?.domain_name === name) : null;
    if (existing) return stripe.call(mode, "POST", `/v1/payment_method_domains/${encodeURIComponent(existing.id)}/validate`, { account });
    const created = await stripe.call(mode, "POST", "/v1/payment_method_domains", {
      params: { domain_name: name, enabled: true },
      account,
      idempotencyKey: `${row.shopId}/payment-domain/${name}`,
    });
    await logChange(row.shopId, `payment-domain-${name}`, { kind: "payments.payment-domain", domain: name, mode });
    return created;
  }

  const squareReady = () => {
    if (!square) throw new ServiceError(503, "square_not_ready", "The platform's Square connection isn't set up yet.");
    return square;
  };

  // A switch between providers (accountSlots.js): the Stripe account it moves to, made now (or the shop's earlier
  // Stripe account again) and kept as `payments.next` until the switch. The current account keeps selling meanwhile.
  async function nextStripeAccount(row) {
    if (row.payments.next?.provider === "stripe") return row.payments.next;
    const earlier = accountFor(row.payments, "stripe")?.account;
    const account = earlier
      ? accountOnly(earlier)
      : await createStripeAccount(row, { pressName: row.pressName, ownerEmail: row.ownerEmail, country: row.country, currency: row.currency, testMode: row.payments.mode !== "live", sells: row.publishes ?? null });
    const next = { provider: "stripe", accountId: account.accountId, mode: account.mode, ...(account.mcc ? { mcc: account.mcc } : {}), ...(earlier ? { chargesEnabled: earlier.chargesEnabled === true } : {}), stagedAt: iso() };
    await registry.updateShop(row.shopId, { payments: withNext(row.payments, next) });
    await logChange(row.shopId, `payments-next-${next.accountId}`, { kind: "payments.next-staged", provider: "stripe", accountId: next.accountId, mode: next.mode });
    return next;
  }

  // Which provider a call is for: `square.*` go to Square, the rest of the money calls to Stripe, and the account's
  // state to the shop's current provider.
  function providerOf(name, row) {
    if (typeof name === "string" && name.startsWith("square.")) return "square";
    if (name === "account.status") return row.payments.provider === "square" ? "square" : "stripe";
    return "stripe";
  }

  // The press pressed Switch (Settings › Payments): the account it connected takes sales alongside the current one
  // until the platform has moved the shop's server over and finishes the switch (control-room/providerSwitch.js).
  // Safe to press twice.
  async function startSwitch(row) {
    const payments = row.payments;
    if (row.paymentsEmergency) throw new ServiceError(409, "emergency_move", "The platform moved this shop's card payments for now, so it can't switch providers until that ends.");
    if (!payments.next) throw new ServiceError(409, "no_next_account", "Connect the account to switch to first.");
    if (!nextReady(payments)) throw new ServiceError(409, "next_not_ready", "The account to switch to can't take payments yet.");
    if (payments.switching?.accountId === payments.next.accountId) return { switching: payments.switching };
    const switching = { to: payments.next.provider, accountId: payments.next.accountId, at: iso() };
    await registry.updateShop(row.shopId, { payments: { ...payments, switching } });
    await logChange(row.shopId, `payments-switch-${switching.accountId}`, { kind: "payments.switch-started", from: payments.provider, to: switching.to, accountId: switching.accountId });
    return { switching };
  }

  const switchedAway = (name) => new ServiceError(409, "switched_provider", `This shop no longer takes new payments through ${name}.`);

  async function runShopOp(row, body) {
    const { op: name, args = {} } = body;
    if (!plainObject(args)) throw bad("args must be an object");
    if (name === "account.paymentDomain") return paymentDomain(row, args.domain);
    let fee;
    try { fee = feeForShop(row, config.fee); } catch (err) { throw new ServiceError(500, "fee_setting", `The shop's platform fee setting is wrong: ${err.message}`); }
    // The account being connected for a switch (args.which "next"): its state, for the admin's "ready to switch".
    if (name === "account.status" && args.which === "next") {
      const next = row.payments.next;
      // No switch under way: the accounts it sold through before (provider and until when, no ids), so Settings ›
      // Payments can say when the shop moved and where older orders refund.
      if (!next) return { next: null, earlier: (row.payments.earlier ?? []).map((a) => ({ provider: a.provider, until: a.until ?? null })) };
      const state = next.provider === "square" ? await squareReady().runShopOp(viewOf(row, next), { op: name }, fee) : await accountStatus(viewOf(row, next), fee);
      return { ...state, provider: next.provider, switching: row.payments.switching ?? null };
    }
    if (name === "account.switch") return startSwitch(row);
    if (name === "account.status" && args.which !== undefined) throw bad("which must be next when given");
    // Connect Square sees the whole row: on a shop selling through Stripe it connects the account for a switch.
    if (name === "account.connectLink") return squareReady().runShopOp(row, body, fee);
    // A shop on Square asking for Stripe's onboarding is moving to Stripe: the link is for the account it moves to.
    if (name === "account.onboardingLink" && row.payments.provider !== "stripe") return onboardingLink(viewOf(row, await nextStripeAccount(row)), args);
    const provider = providerOf(name, row);
    // After a switch, orders taken before it still go through the account that took them (the newest earlier one for
    // that provider). New sales only ever go to the current account.
    // While a switch is under way the account switched to takes sales as well: the shop's server moves over to it.
    const found = accountFor(row.payments, provider) ?? switchingTo(row.payments, provider);
    const sells = found?.slot === "current" || found?.slot === "next";
    if (provider === "square") {
      if (!found) throw new ServiceError(409, "not_connected", "This shop hasn't connected Square yet.");
      if (!sells && SQUARE_CREATE_OPS.has(name)) throw switchedAway("Square");
      return squareReady().runShopOp(viewOf(row, found.account), body, fee);
    }
    if (!found) throw new ServiceError(409, "no_account", "This shop has no Stripe account with the platform yet.");
    const whole = row;
    row = viewOf(row, found.account);
    if (name === "account.status") return accountStatus(row, fee);
    if (name === "account.onboardingLink") return onboardingLink(row, args);
    const op = typeof name === "string" && Object.hasOwn(SHOP_OPS, name) ? SHOP_OPS[name] : null;
    if (!op) throw bad(`unknown call ${String(name).slice(0, 60)}`);
    if (op.create && !sells) throw switchedAway("Stripe");
    const mode = modeFor(row, body.mode);
    // The account switched to was checked before the switch could start (nextReady).
    if (op.create && mode === "live" && found.slot === "current") await liveChargesAllowed(whole);
    const path = op.path(args);
    let idempotencyKey = null;
    if (op.create || op.refund) {
      if (typeof args.idempotencyKey !== "string" || !args.idempotencyKey || args.idempotencyKey.length > 200) throw bad("an idempotency key is needed");
      // Scoped to the shop, so two shops' keys can never meet.
      idempotencyKey = `${row.shopId}/${args.idempotencyKey}`;
    }
    // Pay as you sell replaces the shop's usual fee, and always gives the fee back with a refund.
    const terms = op.create || op.refund ? termsFor(row) : null;
    let params;
    let held = null;
    if (op.create && terms) {
      createParams(op.create, args.params, { basisPoints: 0 });
      const top = op.create === "top";
      held = await payAsYouSellFee(row, terms, {
        key: idempotencyKey,
        booksMinor: top ? intentBooksMinor(args.params) : sessionBooksMinor(args.params),
        currency: top ? args.params.currency : args.params.line_items?.[0]?.price_data?.currency,
      });
      params = withFee(op.create, args.params, held.feeMinor);
    } else if (op.create) params = createParams(op.create, args.params, fee);
    else if (op.refund) params = refundParams(args.params, terms ? { ...fee, refunded: true } : fee);
    else params = op.params(args.params);
    const answer = await stripe.call(mode, op.method, path, { params, account: row.payments.accountId, idempotencyKey });
    if (held?.ref && held.feeMinor > 0) await ledger.link(row.shopId, [answer?.id, answer?.payment_intent], held.ref);
    return answer;
  }

  // Pay as you sell: the parameters with the fee the ledger worked out (none when it is 0).
  function withFee(where, params, applicationFee) {
    if (!applicationFee) return params;
    if (where === "top") return { ...params, application_fee_amount: applicationFee };
    return { ...params, payment_intent_data: { ...(params.payment_intent_data ?? {}), application_fee_amount: applicationFee } };
  }

  // Pay as you sell: a connected account's event that pays, ends or refunds a checkout with a fee (6.19). Every step
  // sets a state rather than adding to one, so the same event twice changes nothing.
  async function ledgerEvent(row, event) {
    if (!ledger) return;
    const object = event.data?.object ?? {};
    const shopId = row.shopId;
    switch (event.type) {
      case "payment_intent.succeeded":
        await ledger.paid(shopId, object.id, { feeMinor: Number.isInteger(object.application_fee_amount) ? object.application_fee_amount : undefined });
        return;
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        if (object.payment_status === "paid") await ledger.paid(shopId, object.id, { alsoIds: [typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id] });
        return;
      case "checkout.session.expired":
      case "payment_intent.canceled":
        await ledger.released(shopId, object.id);
        return;
      case "charge.refunded": {
        const intent = typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id;
        await ledger.refunded(shopId, intent, { sourceId: object.id, refundedMinor: object.amount_refunded, totalMinor: object.amount });
        return;
      }
      default:
    }
  }

  return {
    /** A shop's call: `{ headers, body }` with body `{ op, mode, args }` (already parsed JSON). */
    async shopCall({ headers, body } = {}) {
      try {
        const row = await provenShop(headers);
        if (!plainObject(body)) throw bad("the call is missing");
        return { status: 200, body: await runShopOp(row, body) };
      } catch (err) {
        return errorAnswer(err);
      }
    },

    /** The one Connect events address. Answers 2xx only once the shop has the event, so Stripe retries otherwise. */
    async stripeEvent(headers, rawBody) {
      const signature = header(headers, "stripe-signature");
      const mode = ["live", "test"].find((m) => webhookSecrets[m].some((secret) => verifySignature(secret, rawBody, signature, { now: now() })));
      if (!mode) return { status: 400, body: { error: "The event's signature doesn't match." } };
      let event;
      try { event = JSON.parse(rawBody); } catch { return { status: 400, body: { error: "The event isn't JSON." } }; }
      if (event.livemode !== (mode === "live")) return { status: 400, body: { error: "The event's mode doesn't match its signature." } };
      // The platform's own account (billing, 2.4) isn't a shop's business.
      if (typeof event.account !== "string" || !ACCOUNT_ID.test(event.account)) return { status: 200, body: { ignored: "not a connected account" } };
      const row = await registry.findShopByPaymentAccount("stripe", event.account);
      if (!row) {
        console.warn(`Stripe event ${event.id} names ${event.account}, which no shop has`);
        return { status: 200, body: { ignored: "no shop has this account" } };
      }
      // The shop's current account, an earlier one (orders before a switch) or the next one (being connected).
      const found = findSlot(row.payments, "stripe", event.account);
      if (!found) return { status: 200, body: { ignored: "no shop has this account" } };
      const held = found.account;
      if (mode === "live" && held.mode !== "live") return { status: 200, body: { ignored: "live event for a test-only shop" } };
      // Per-shop counts for the control room (19.12).
      const tally = async (kind) => {
        try { if (deliveryStats) await deliveryStats.add(row.shopId, kind, iso()); } catch (err) { console.error(`couldn't count ${kind} for ${row.shopId}: ${err?.message || err}`); }
      };
      const failed = async (answer) => { await tally("payment-event-failed"); return answer; };
      // Counted alongside the work, not before it: on a busy day every event counts on the same record, and the shop's
      // forward mustn't wait in line for it. A lost count is only a number on the control room's page.
      void tally("payment-event");

      // The account's own state, kept in the registry for the go-live checklist (2.10) and the control room.
      if (event.type === "account.updated" && event.data?.object?.id === event.account && mode === held.mode) {
        const account = event.data.object;
        const needs = accountNeeds(account);
        const state = {
          chargesEnabled: account.charges_enabled === true,
          payoutsEnabled: account.payouts_enabled === true,
          detailsSubmitted: account.details_submitted === true,
          pastDue: needs.pastDue,
          // The merchant category Stripe holds (what the shop sells, for the control room's check against its answer).
          ...(typeof account.business_profile?.mcc === "string" && account.business_profile.mcc ? { mcc: account.business_profile.mcc } : {}),
          // When Stripe pays the press, for the control room's shop record; an event without it keeps the kept one.
          ...(payoutSchedule(account) ? { payoutSchedule: payoutSchedule(account) } : {}),
        };
        const saved = held;
        let payments = saved;
        // Stripe doesn't promise order: an account.updated older than the one the row took would put old state back
        // (cards on again after Stripe paused them), so it changes nothing.
        const created = Number.isFinite(event.created) ? event.created : null;
        const stale = created !== null && Number.isFinite(saved.accountEventCreated) && created < saved.accountEventCreated;
        if (!stale && Object.entries(state).some(([key, value]) => !isDeepStrictEqual(saved[key], value))) {
          // When it turned past due; cleared once it isn't, so the next time emails the owner again.
          const { pastDueSince, pastDueEmailedAt, ...rest } = saved;
          payments = { ...rest, ...state, stateAt: iso(), ...(created !== null ? { accountEventCreated: created } : {}), ...(needs.pastDue ? { pastDueSince: pastDueSince ?? iso(), ...(pastDueEmailedAt ? { pastDueEmailedAt } : {}) } : {}) };
          await registry.updateShop(row.shopId, { payments: replaceSlot(row.payments, found, payments) });
          await logChange(row.shopId, `payments-account-${event.id}`, { kind: "payments.account-updated", accountId: event.account, ...state });
        } else if (!stale && created !== null && created > (saved.accountEventCreated ?? -Infinity)) {
          // Nothing changed, but this is now the newest word from Stripe: an older one arriving later must not win.
          payments = { ...saved, accountEventCreated: created };
          await registry.updateShop(row.shopId, { payments: replaceSlot(row.payments, found, payments) });
        }
        // Stripe changed when it pays the press (it had a schedule before, and this one differs): the press hears once per
        // event, so a press counting on daily money isn't caught short. A failed email is only logged: Stripe resending
        // the event would find the schedule already saved and send nothing.
        const before = saved.payoutSchedule;
        if (!stale && found.slot === "current" && email && row.ownerEmail && before && state.payoutSchedule && !isDeepStrictEqual(before, state.payoutSchedule)) {
          try {
            await email.sendPlatform({
              kind: "payout-schedule-changed", to: row.ownerEmail, shopId: row.shopId, idempotencyKey: `payout-schedule-changed/${row.shopId}/${event.id}`,
              data: { pressName: row.pressName || row.shopId, before, after: state.payoutSchedule, link: paymentsPage(row) },
            });
          } catch (err) {
            console.error(`The payout-timing email for ${row.shopId} wasn't sent: ${err?.message || err}`);
          }
        }
        // Past due: Stripe has paused cards or payouts. The owner is emailed once (the admin shows a banner as well).
        // Only for the account that takes sales: an earlier one's cards don't matter to the shop any more.
        if (!stale && found.slot === "current" && needs.pastDue && !payments.pastDueEmailedAt && email) {
          const emailed = await emailPastDue(row, payments, needs, event.account);
          if (!emailed) return failed({ status: 502, body: { error: "The owner couldn't be emailed; Stripe will send the event again." } });
        }
      }
      if (event.type === "account.application.deauthorized" && mode === held.mode && !held.disconnectedAt) {
        await registry.updateShop(row.shopId, { payments: replaceSlot(row.payments, found, { ...held, disconnectedAt: iso() }) });
        await logChange(row.shopId, `payments-disconnected-${event.id}`, { kind: "payments.disconnected", accountId: event.account });
      }

      // The account being connected for a switch has taken no sales before the switch starts: nothing for the shop yet.
      if (found.slot === "next" && !switchingTo(row.payments, "stripe")) return { status: 200, body: { ignored: "account not in use yet" } };

      if (mode === held.mode) {
        try {
          await ledgerEvent(row, event);
        } catch (err) {
          console.error(`Stripe event ${event.id} for ${row.shopId} wasn't counted for pay as you sell: ${err?.message || err}`);
          return failed({ status: 500, body: { error: "The event couldn't be counted; Stripe will send it again." } });
        }
      }

      const result = await deliver(row, rawBody);
      if (result.status >= 200 && result.status < 300) return { status: 200, body: { forwarded: row.shopId } };
      console.error(`Stripe event ${event.id} for ${row.shopId} wasn't taken (${result.status}${result.error ? `: ${result.error}` : ""})`);
      return failed({ status: 502, body: { error: "The shop didn't take the event; Stripe will send it again." } });
    },

    /** Square sends the press back here after Connect Square (GET /square/oauth). */
    async squareOAuth(query) {
      if (!square) return { status: 503, body: { error: "The platform's Square connection isn't set up yet." } };
      try {
        return await square.oauthCallback(query);
      } catch (err) {
        return errorAnswer(err);
      }
    },

    /** Square's events for one environment ("live" or "test"). Answers 2xx only once the shop has the event. */
    async squareEvent(mode, headers, rawBody) {
      if (!square) return { status: 503, body: { error: "The platform's Square connection isn't set up yet." } };
      return square.squareEvent(mode, headers, rawBody, header);
    },

    /** Step 13 for a Square shop: the account the press connected through Connect Square, or null before then. */
    findSquareAccount: (shopId) => (square ? square.findAccount(shopId) : Promise.resolve(null)),

    /** The domain service (plan 2.9): registers a shop's address for Apple Pay and Google Pay once it is live. */
    async registerPaymentDomain(shopId, domain) {
      const row = await registry.getShop(shopId);
      if (!row) throw new ServiceError(404, "unknown_shop", `${shopId} isn't in the registry`);
      if (row.payments?.provider !== "square" && !ACCOUNT_ID.test(row.payments?.accountId ?? "")) {
        throw new ServiceError(409, "no_account", "This shop has no Stripe account with the platform yet.");
      }
      return paymentDomain(row, domain);
    },

    // ── The shop maker's step 13 (setup/payments.js provider client) ────────────────────────────────────────────

    /** The account the service made for this shop, once Stripe confirms it; null when there is none. */
    async findAccount(shopId) {
      const saved = await accounts.get(shopId);
      if (!saved) return null;
      let account;
      try {
        account = await stripe.call(saved.mode, "GET", `/v1/accounts/${saved.accountId}`);
      } catch (err) {
        if (err instanceof StripeApiError && (err.statusCode === 404 || err.code === "resource_missing" || err.code === "account_invalid")) return null;
        throw err;
      }
      if (account.metadata?.lmb_shop_id && account.metadata.lmb_shop_id !== shopId) {
        throw new Error(`Stripe account ${saved.accountId} belongs to ${account.metadata.lmb_shop_id}, not ${shopId}; a person checks`);
      }
      return { accountId: saved.accountId, mode: saved.mode };
    },

    /**
     * Makes the press's account, with Standard's behaviour. Safe to repeat: the shop id is in the idempotency key, so a
     * retry after a lost answer gets the same account back. The shop must be in the registry, with the same owner.
     *
     * Stripe calls the account types deprecated and describes accounts by their controller settings instead
     * (https://docs.stripe.com/connect/migrate-to-controller-properties). These four are what Standard means: Stripe
     * covers losses and collects what it needs, the press pays its own Stripe fees and has the full Stripe Dashboard.
     * Accounts made earlier with `type: "standard"` already carry the same settings and are left as they are.
     *
     * What the platform knows is filled in, so Stripe's sign-up asks less (and on these accounts it can only be filled
     * in now, before the press's first visit): the country from sign-up, the shop's web address and what it sells: "Book
     * Stores" (merchant category 5942) for a books shop, the matching category for one that sells other things
     * (shared/sells/sells.js merchantProfile).
     */
    async createAccount(shopId, details) {
      const row = await registry.getShop(shopId);
      if (!row) throw new Error(`${shopId} isn't in the registry`);
      if (String(row.ownerEmail).toLowerCase() !== String(details.ownerEmail).toLowerCase()) throw new Error(`${shopId} belongs to another owner in the registry`);
      return createStripeAccount(row, details);
    },
  };

  async function createStripeAccount(row, { pressName, ownerEmail, country, currency, testMode, sells }) {
    const shopId = row.shopId;
    const mode = testMode === true ? "test" : "live";
    const account = await stripe.call(mode, "POST", "/v1/accounts", {
      params: {
        controller: STANDARD_CONTROLLER,
        country,
        email: ownerEmail,
        default_currency: String(currency).toLowerCase(),
        business_profile: { name: pressName, url: shopAddress(row), ...businessKind(sells) },
        metadata: { lmb_shop_id: shopId },
      },
      idempotencyKey: `lmb-account-${shopId}-${mode}`,
    });
    if (!ACCOUNT_ID.test(account?.id ?? "")) throw new Error("Stripe gave no account id");
    const mcc = account.business_profile?.mcc || businessKind(sells).mcc;
    await accounts.set(shopId, { provider: "stripe", accountId: account.id, mode, mcc, createdAt: iso() });
    await logChange(shopId, `payments-account-created-${account.id}`, { kind: "payments.account-created", accountId: account.id, mode, mcc });
    return { accountId: account.id, mode, mcc };
  }
}
