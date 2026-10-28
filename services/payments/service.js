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
import { StripeApiError } from "./stripeApi.js";
import { SquareApiError } from "./squareApi.js";
import { createSquareService, SQUARE_OP_NAMES } from "./square.js";
import { verifySignature } from "./stripeSignature.js";
import { feeFor, feeForShop, feeSummary, takesFee } from "./fees.js";
import { serviceKeyMatches } from "../email/http.js";

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
const ids = { pi: /^pi_[A-Za-z0-9_]+$/, cs: /^cs_[A-Za-z0-9_]+$/, evt: /^evt_[A-Za-z0-9_]+$/ };

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
const listParams = (params) => {
  const out = only(params, ["payment_intent", "limit"]);
  idFor("pi", out.payment_intent);
  if (out.limit !== undefined && !(Number.isInteger(out.limit) && out.limit >= 1 && out.limit <= 100)) throw bad("limit must be 1 to 100");
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
  "paymentIntents.retrieve": { method: "GET", path: (a) => `/v1/payment_intents/${idFor("pi", a.id)}`, params: (p) => expandOnly(p, ["latest_charge"]) },
  "paymentIntents.cancel": { method: "POST", path: (a) => `/v1/payment_intents/${idFor("pi", a.id)}/cancel`, params: (p) => only(p, []) },
  "checkout.sessions.create": { method: "POST", path: () => "/v1/checkout/sessions", create: "payment_intent_data" },
  "checkout.sessions.retrieve": { method: "GET", path: (a) => `/v1/checkout/sessions/${idFor("cs", a.id)}`, params: (p) => expandOnly(p, []) },
  "checkout.sessions.expire": { method: "POST", path: (a) => `/v1/checkout/sessions/${idFor("cs", a.id)}/expire`, params: (p) => only(p, []) },
  "refunds.create": { method: "POST", path: () => "/v1/refunds", refund: true },
  "refunds.list": { method: "GET", path: () => "/v1/refunds", params: listParams },
  "disputes.list": { method: "GET", path: () => "/v1/disputes", params: listParams },
  "events.retrieve": { method: "GET", path: (a) => `/v1/events/${idFor("evt", a.id)}`, params: (p) => only(p, []) },
});

export const SHOP_OP_NAMES = Object.freeze([...Object.keys(SHOP_OPS), "account.status", "account.onboardingLink", "account.connectLink", "account.paymentDomain", ...SQUARE_OP_NAMES]);

/** Where a shop's server code receives Stripe events (the shop's `stripeWebhook` function, apps/shop functionLink). */
export function shopWebhookUrl(row) {
  const region = row?.functionsRegion || row?.region;
  if (!/^[a-z]+-[a-z]+[0-9]{1,2}$/.test(region ?? "") || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(row?.projectId ?? "")) return null;
  return `https://${region}-${row.projectId}.cloudfunctions.net/stripeWebhook`;
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
export function createPaymentService({ stripe, registry, auditLog, accounts, deliver, config, squareApi = null, tokens = null, states = null, now = () => Date.now() }) {
  const { webhookSecrets } = config;
  const iso = () => new Date(now()).toISOString();

  // Every change the service makes is written down twice: the registry's history for the shop, and the shop's own
  // audit log. Stable ids, so writing the same change twice keeps one entry.
  async function logChange(shopId, id, entry) {
    const full = { id, source: "payment-service", at: iso(), ...entry };
    await registry.recordEvent(shopId, full);
    await auditLog.write(shopId, id, full);
  }

  const square = squareApi
    ? createSquareService({ square: squareApi, registry, tokens, states, deliver, config, logChange, shopHosts, now, refuse: (status, code, message) => new ServiceError(status, code, message) })
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
  async function liveChargesAllowed(row) {
    if (row.payments.chargesEnabled === true) return;
    const account = await stripe.call("live", "GET", `/v1/accounts/${row.payments.accountId}`);
    if (account.charges_enabled !== true) {
      throw new ServiceError(403, "not_checked", "Stripe is still checking this press's account, so it can't take real payments yet.");
    }
    await registry.updateShop(row.shopId, { payments: { ...row.payments, chargesEnabled: true, stateAt: iso() } });
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

  async function runShopOp(row, body) {
    const { op: name, args = {} } = body;
    if (!plainObject(args)) throw bad("args must be an object");
    if (name === "account.paymentDomain") return paymentDomain(row, args.domain);
    let fee;
    try { fee = feeForShop(row, config.fee); } catch (err) { throw new ServiceError(500, "fee_setting", `The shop's platform fee setting is wrong: ${err.message}`); }
    if (row.payments.provider === "square") {
      if (!square) throw new ServiceError(503, "square_not_ready", "The platform's Square connection isn't set up yet.");
      return square.runShopOp(row, body, fee);
    }
    if (name === "account.status") return accountStatus(row, fee);
    if (name === "account.onboardingLink") return onboardingLink(row, args);
    const op = typeof name === "string" && Object.hasOwn(SHOP_OPS, name) ? SHOP_OPS[name] : null;
    if (!op) throw bad(`unknown call ${String(name).slice(0, 60)}`);
    const mode = modeFor(row, body.mode);
    if (op.create && mode === "live") await liveChargesAllowed(row);
    const path = op.path(args);
    let params;
    if (op.create) params = createParams(op.create, args.params, fee);
    else if (op.refund) params = refundParams(args.params, fee);
    else params = op.params(args.params);
    let idempotencyKey = null;
    if (op.create || op.refund) {
      if (typeof args.idempotencyKey !== "string" || !args.idempotencyKey || args.idempotencyKey.length > 200) throw bad("an idempotency key is needed");
      // Scoped to the shop, so two shops' keys can never meet.
      idempotencyKey = `${row.shopId}/${args.idempotencyKey}`;
    }
    return stripe.call(mode, op.method, path, { params, account: row.payments.accountId, idempotencyKey });
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
      if (mode === "live" && row.payments?.mode !== "live") return { status: 200, body: { ignored: "live event for a test-only shop" } };

      // The account's own state, kept in the registry for the go-live checklist (2.10) and the control room.
      if (event.type === "account.updated" && event.data?.object?.id === event.account && mode === row.payments.mode) {
        const account = event.data.object;
        const state = {
          chargesEnabled: account.charges_enabled === true,
          payoutsEnabled: account.payouts_enabled === true,
          detailsSubmitted: account.details_submitted === true,
        };
        const saved = row.payments;
        if (Object.entries(state).some(([key, value]) => saved[key] !== value)) {
          await registry.updateShop(row.shopId, { payments: { ...saved, ...state, stateAt: iso() } });
          await logChange(row.shopId, `payments-account-${event.id}`, { kind: "payments.account-updated", accountId: event.account, ...state });
        }
      }
      if (event.type === "account.application.deauthorized" && mode === row.payments.mode && !row.payments.disconnectedAt) {
        await registry.updateShop(row.shopId, { payments: { ...row.payments, disconnectedAt: iso() } });
        await logChange(row.shopId, `payments-disconnected-${event.id}`, { kind: "payments.disconnected", accountId: event.account });
      }

      const result = await deliver(row, rawBody);
      if (result.status >= 200 && result.status < 300) return { status: 200, body: { forwarded: row.shopId } };
      console.error(`Stripe event ${event.id} for ${row.shopId} wasn't taken (${result.status}${result.error ? `: ${result.error}` : ""})`);
      return { status: 502, body: { error: "The shop didn't take the event; Stripe will send it again." } };
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
     * Makes the press's Standard account. Safe to repeat: the shop id is in the idempotency key, so a retry after a
     * lost answer gets the same account back. The shop must be in the registry, with the same owner.
     */
    async createAccount(shopId, { pressName, ownerEmail, country, currency, testMode }) {
      const row = await registry.getShop(shopId);
      if (!row) throw new Error(`${shopId} isn't in the registry`);
      if (String(row.ownerEmail).toLowerCase() !== String(ownerEmail).toLowerCase()) throw new Error(`${shopId} belongs to another owner in the registry`);
      const mode = testMode === true ? "test" : "live";
      const account = await stripe.call(mode, "POST", "/v1/accounts", {
        params: {
          type: "standard",
          country,
          email: ownerEmail,
          default_currency: String(currency).toLowerCase(),
          business_profile: { name: pressName },
          metadata: { lmb_shop_id: shopId },
        },
        idempotencyKey: `lmb-account-${shopId}-${mode}`,
      });
      if (!ACCOUNT_ID.test(account?.id ?? "")) throw new Error("Stripe gave no account id");
      await accounts.set(shopId, { provider: "stripe", accountId: account.id, mode, createdAt: iso() });
      await logChange(shopId, `payments-account-created-${account.id}`, { kind: "payments.account-created", accountId: account.id, mode });
      return { accountId: account.id, mode };
    },
  };
}
