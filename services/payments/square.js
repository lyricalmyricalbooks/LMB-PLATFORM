// Square in the payment service (code plan 2.2b): a press can take payments through their own Square account instead of
// Stripe. The service holds the platform's Square applications (config.js) and each press's tokens, sealed
// (tokenSeal.js); a shop never sees either. Three parts, used by service.js:
//
//   Connect Square     `account.connectLink` gives the press's admin Square's sign-in page; Square sends the press back
//                      to `oauthCallback` (GET /square/oauth), which takes the token, picks the press's main location
//                      and records the account in the registry (payments.accountId = Square's merchant id).
//   Shop calls         `square.*` (SQUARE_OPS below): hosted checkout (payment links), payment and refund lookups,
//                      refunds, cancels and disputes, on the press's own account only, answered in a small,
//                      provider-neutral shape. The platform fee (fees.js) is Square's `app_fee_money`.
//   Events             `squareEvent(mode, …)` checks Square's signature, finds the shop by merchant id and passes the
//                      event on. The shop believes nothing in it: it reads the object's id and asks for the object again.
//
// One Square environment per shop: a shop whose registry `payments.mode` is "test" uses Square's Sandbox, a live shop
// Square's production. Test payments on a live Square shop are refused (`test_only` / `not_connected`), not faked.
//
// Clients (fakes in squareFakes.js):
//   square   createSquareApi(...) (squareApi.js)
//   tokens   get(shopId, mode) -> { sealed, merchantId, expiresAt } | null; set(shopId, mode, record); remove(shopId, mode)
//   states   put(state, { shopId, mode, returnUrl, expiresAt }); take(state) -> that record | null (once only)
import { createHash, randomBytes } from "node:crypto";
import { SquareApiError } from "./squareApi.js";
import { verifySquareSignature, SQUARE_SIGNATURE_HEADER } from "./squareSignature.js";
import { seal, unseal } from "./tokenSeal.js";
import { feeFor, feeSummary, takesFee } from "./fees.js";

/** What the platform asks a press to allow (the minimum Square lists for app fees, plus locations and disputes). */
export const SQUARE_SCOPES = Object.freeze([
  "MERCHANT_PROFILE_READ", "PAYMENTS_READ", "PAYMENTS_WRITE", "PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS", "ORDERS_READ", "ORDERS_WRITE", "DISPUTES_READ",
]);

const STATE_MS = 15 * 60 * 1000;
// Square's access tokens last 30 days; renew a week before.
const RENEW_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;
const SQUARE_ID = /^[A-Za-z0-9_-]{1,192}$/;
const MERCHANT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CURRENCY = /^[A-Z]{3}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Square caps an application fee at 90% of the payment, or 60% below a small threshold per currency
// (https://developer.squareup.com/docs/payments-api/take-payments-and-collect-fees).
const FEE_THRESHOLDS = Object.freeze({ USD: 500, CAD: 500, GBP: 400, AUD: 800, EUR: 500, JPY: 600 });

/** The platform fee on one Square payment, within Square's own cap. */
export function squareFee(totalMinor, currency, fee) {
  const wanted = feeFor(totalMinor, fee);
  const threshold = FEE_THRESHOLDS[currency];
  const share = threshold !== undefined && totalMinor >= threshold ? 0.9 : 0.6;
  return Math.min(wanted, Math.floor(totalMinor * share));
}

/** The part of a payment's fee that goes back with a refund of `amountMinor`, in proportion, rounded down. */
export function refundedFee(payment, amountMinor) {
  const fee = payment?.app_fee_money?.amount;
  const total = payment?.total_money?.amount ?? payment?.amount_money?.amount;
  if (!Number.isInteger(fee) || fee <= 0 || !Number.isInteger(total) || total <= 0) return 0;
  return Math.min(Math.floor((fee * amountMinor) / total), fee, amountMinor);
}

/** A shop's idempotency key as Square takes it: scoped to the shop and short enough for every call (refunds: 45). */
export const squareKey = (shopId, key) => createHash("sha256").update(`${shopId}/${key}`).digest("hex").slice(0, 40);

const money = (m) => (m && Number.isInteger(m.amount) ? m.amount : 0);

export function paymentShape(payment, referenceId = null) {
  return {
    id: payment.id,
    status: payment.status,
    amountMinor: money(payment.amount_money),
    totalMinor: money(payment.total_money) || money(payment.amount_money),
    currency: payment.amount_money?.currency ?? null,
    refundedMinor: money(payment.refunded_money),
    appFeeMinor: money(payment.app_fee_money),
    orderId: payment.order_id ?? null,
    referenceId,
    refundIds: Array.isArray(payment.refund_ids) ? payment.refund_ids : [],
    locationId: payment.location_id ?? null,
    createdAt: payment.created_at ?? null,
  };
}

export function refundShape(refund) {
  return {
    id: refund.id,
    status: refund.status,
    amountMinor: money(refund.amount_money),
    currency: refund.amount_money?.currency ?? null,
    appFeeMinor: money(refund.app_fee_money),
    paymentId: refund.payment_id ?? null,
    orderId: refund.order_id ?? null,
    reason: refund.reason ?? null,
    createdAt: refund.created_at ?? null,
  };
}

export function disputeShape(dispute) {
  return {
    id: dispute.id,
    state: dispute.state,
    reason: dispute.reason ?? null,
    amountMinor: money(dispute.amount_money),
    currency: dispute.amount_money?.currency ?? null,
    paymentId: dispute.disputed_payment?.payment_id ?? null,
    dueAt: dispute.due_at ?? null,
    createdAt: dispute.created_at ?? null,
  };
}

export const SQUARE_OP_NAMES = Object.freeze([
  "square.checkout.create", "square.checkout.retrieve", "square.checkout.delete",
  "square.payments.retrieve", "square.payments.cancel",
  "square.refunds.create", "square.refunds.retrieve", "square.refunds.forPayment",
  "square.disputes.forPayment",
]);

/**
 * @param {object} deps see the header comment
 * @param {(status: number, code: string, message: string) => Error} deps.refuse makes the service's own refusals
 * @param {(shopId: string, id: string, entry: object) => Promise<void>} deps.logChange registry + audit log
 * @param {(row: object) => Set<string>} deps.shopHosts the shop's own web addresses
 */
export function createSquareService({ square, registry, tokens, states, deliver, config, logChange, refuse, shopHosts, now = () => Date.now() }) {
  const settings = config.square ?? {};
  const iso = (ms = now()) => new Date(ms).toISOString();
  const bad = (message) => refuse(400, "bad_request", message);
  const sealKey = () => {
    if (!settings.tokenKey) throw refuse(503, "square_not_ready", "The platform's Square connection isn't set up yet.");
    return settings.tokenKey;
  };
  const bound = (shopId, mode) => `square/${shopId}/${mode}`;
  const idOf = (value, what) => {
    if (typeof value !== "string" || !SQUARE_ID.test(value)) throw bad(`a Square ${what} id is needed`);
    return value;
  };

  // The press's access token for this mode, renewed first when it ends within a week.
  async function accessToken(row, mode) {
    const record = await tokens.get(row.shopId, mode);
    if (!record || record.merchantId !== row.payments.accountId) throw refuse(409, "not_connected", "This shop hasn't connected Square yet.");
    let value;
    try { value = unseal(sealKey(), bound(row.shopId, mode), record.sealed); } catch (err) {
      if (err?.status) throw err;
      throw refuse(500, "token_unreadable", "The press's Square connection can't be read; connect Square again.");
    }
    if (Date.parse(record.expiresAt) - now() > RENEW_BEFORE_MS) return value.accessToken;
    const renewed = await square.obtainToken(mode, { refreshToken: value.refreshToken });
    const next = { accessToken: renewed.access_token, refreshToken: renewed.refresh_token || value.refreshToken };
    await tokens.set(row.shopId, mode, { sealed: seal(sealKey(), bound(row.shopId, mode), next), merchantId: record.merchantId, expiresAt: renewed.expires_at, renewedAt: iso() });
    await logChange(row.shopId, `payments-square-renewed-${renewed.expires_at}`, { kind: "payments.square-token-renewed", accountId: record.merchantId, expiresAt: renewed.expires_at });
    return next.accessToken;
  }

  // A live call needs a live (production) Square connection; a test call one made in the Sandbox.
  function modeFor(row, mode) {
    if (mode !== "live" && mode !== "test") throw bad("mode must be live or test");
    if (mode !== row.payments.mode) {
      throw mode === "live"
        ? refuse(403, "test_only", "This shop takes test payments only.")
        : refuse(409, "not_connected", "Test payments need a shop connected to Square's Sandbox.");
    }
    return mode;
  }

  async function referenceOf(mode, token, orderId) {
    if (!orderId) return null;
    const { order } = await square.call(mode, "GET", `/v2/orders/${idOf(orderId, "order")}`, { accessToken: token });
    return order?.reference_id ?? null;
  }

  function checkoutParams(row, params, fee) {
    if (!params || typeof params !== "object") throw bad("parameters are needed");
    const { referenceId, currency, lineItems, buyerEmail, redirectUrl, note } = params;
    if (typeof referenceId !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(referenceId)) throw bad("referenceId (the shop's order id, at most 40 letters) is needed");
    const upper = String(currency ?? "").toUpperCase();
    if (!CURRENCY.test(upper)) throw bad("currency must be a three-letter code");
    if (row.payments.currency && upper !== row.payments.currency) throw refuse(400, "currency_mismatch", `This press's Square account takes ${row.payments.currency} only.`);
    if (!Array.isArray(lineItems) || !lineItems.length || lineItems.length > 100) throw bad("lineItems must list 1 to 100 lines");
    let total = 0;
    const lines = lineItems.map((line) => {
      const { name, quantity, unitAmountMinor } = line ?? {};
      if (typeof name !== "string" || !name.trim() || name.length > 512) throw bad("each line needs a name");
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) throw bad("each line's quantity must be 1 to 9999");
      if (!Number.isInteger(unitAmountMinor) || unitAmountMinor < 0) throw bad("each line's unitAmountMinor must be a whole number");
      total += unitAmountMinor * quantity;
      return { name: name.trim(), quantity: String(quantity), base_price_money: { amount: unitAmountMinor, currency: upper } };
    });
    if (total < 1) throw bad("the order must charge something");
    let url;
    try { url = new URL(redirectUrl); } catch { throw bad("redirectUrl must be an address"); }
    if (url.protocol !== "https:" || !shopHosts(row).has(url.hostname.toLowerCase())) throw bad("redirectUrl must be one of the shop's own addresses");
    const appFee = takesFee(fee) ? squareFee(total, upper, fee) : 0;
    return {
      total,
      body: {
        order: { location_id: row.payments.locationId, reference_id: referenceId, line_items: lines },
        checkout_options: {
          redirect_url: url.toString(), allow_tipping: false, ask_for_shipping_address: false,
          ...(appFee > 0 ? { app_fee_money: { amount: appFee, currency: upper } } : {}),
        },
        ...(typeof buyerEmail === "string" && EMAIL.test(buyerEmail) && buyerEmail.length <= 256 ? { pre_populated_data: { buyer_email: buyerEmail } } : {}),
        ...(typeof note === "string" && note ? { payment_note: note.slice(0, 500) } : {}),
      },
    };
  }

  const keyFrom = (row, args) => {
    if (typeof args.idempotencyKey !== "string" || !args.idempotencyKey || args.idempotencyKey.length > 200) throw bad("an idempotency key is needed");
    return squareKey(row.shopId, args.idempotencyKey);
  };

  const OPS = {
    async "square.checkout.create"(row, mode, token, args, fee) {
      if (!row.payments.locationId) throw refuse(409, "not_connected", "This shop hasn't connected Square yet.");
      const { body } = checkoutParams(row, args.params, fee);
      const created = await square.call(mode, "POST", "/v2/online-checkout/payment-links", { accessToken: token, body: { idempotency_key: keyFrom(row, args), ...body } });
      const link = created.payment_link ?? {};
      return { id: link.id, url: link.url ?? link.long_url ?? null, squareOrderId: link.order_id ?? null, createdAt: link.created_at ?? null };
    },
    async "square.checkout.retrieve"(row, mode, token, args) {
      const { payment_link: link } = await square.call(mode, "GET", `/v2/online-checkout/payment-links/${idOf(args.id, "payment link")}`, { accessToken: token });
      const { order } = link?.order_id ? await square.call(mode, "GET", `/v2/orders/${idOf(link.order_id, "order")}`, { accessToken: token }) : { order: null };
      const tenders = Array.isArray(order?.tenders) ? order.tenders : [];
      return {
        id: link?.id ?? args.id,
        url: link?.url ?? null,
        squareOrderId: link?.order_id ?? null,
        referenceId: order?.reference_id ?? null,
        state: order?.state ?? null,
        totalMinor: money(order?.total_money),
        currency: order?.total_money?.currency ?? null,
        paymentIds: tenders.map((tender) => tender.payment_id || tender.id).filter(Boolean),
      };
    },
    async "square.checkout.delete"(row, mode, token, args) {
      const answer = await square.call(mode, "DELETE", `/v2/online-checkout/payment-links/${idOf(args.id, "payment link")}`, { accessToken: token });
      return { id: answer.id ?? args.id, cancelledOrderId: answer.cancelled_order_id ?? null };
    },
    async "square.payments.retrieve"(row, mode, token, args) {
      const { payment } = await square.call(mode, "GET", `/v2/payments/${idOf(args.id, "payment")}`, { accessToken: token });
      return paymentShape(payment, await referenceOf(mode, token, payment.order_id));
    },
    async "square.payments.cancel"(row, mode, token, args) {
      const { payment } = await square.call(mode, "POST", `/v2/payments/${idOf(args.id, "payment")}/cancel`, { accessToken: token, body: {} });
      return paymentShape(payment);
    },
    async "square.refunds.create"(row, mode, token, args, fee) {
      const params = args.params ?? {};
      const paymentId = idOf(params.paymentId, "payment");
      const { payment } = await square.call(mode, "GET", `/v2/payments/${paymentId}`, { accessToken: token });
      const left = money(payment.total_money) - money(payment.refunded_money);
      const amount = params.amountMinor === undefined || params.amountMinor === null ? left : params.amountMinor;
      if (!Number.isInteger(amount) || amount < 1) throw bad("amountMinor must be a whole number above 0");
      // The fee goes back in proportion to the refund, from the platform's share (Square's refund app_fee_money).
      const feeBack = fee.refunded ? refundedFee(payment, amount) : 0;
      const body = {
        idempotency_key: keyFrom(row, args),
        payment_id: paymentId,
        amount_money: { amount, currency: payment.amount_money?.currency },
        ...(feeBack > 0 ? { app_fee_money: { amount: feeBack, currency: payment.amount_money?.currency } } : {}),
        ...(typeof params.reason === "string" && params.reason ? { reason: params.reason.slice(0, 192) } : {}),
      };
      const { refund } = await square.call(mode, "POST", "/v2/refunds", { accessToken: token, body });
      return refundShape(refund);
    },
    async "square.refunds.retrieve"(row, mode, token, args) {
      const { refund } = await square.call(mode, "GET", `/v2/refunds/${idOf(args.id, "refund")}`, { accessToken: token });
      return refundShape(refund);
    },
    async "square.refunds.forPayment"(row, mode, token, args) {
      const { payment } = await square.call(mode, "GET", `/v2/payments/${idOf(args.paymentId, "payment")}`, { accessToken: token });
      const ids = (Array.isArray(payment.refund_ids) ? payment.refund_ids : []).slice(0, 20);
      const refunds = [];
      for (const id of ids) refunds.push(refundShape((await square.call(mode, "GET", `/v2/refunds/${idOf(id, "refund")}`, { accessToken: token })).refund));
      return { data: refunds };
    },
    async "square.disputes.forPayment"(row, mode, token, args) {
      const paymentId = idOf(args.paymentId, "payment");
      const found = [];
      let cursor;
      // Square lists disputes by account, not by payment: read a few pages, newest first, and keep this payment's.
      for (let page = 0; page < 5; page += 1) {
        const answer = await square.call(mode, "GET", "/v2/disputes", { accessToken: token, query: { cursor, location_id: row.payments.locationId } });
        for (const dispute of answer.disputes ?? []) if (dispute.disputed_payment?.payment_id === paymentId) found.push(disputeShape(dispute));
        cursor = answer.cursor;
        if (!cursor) break;
      }
      return { data: found };
    },
  };

  async function status(row, fee) {
    const base = { provider: "square", mode: row.payments.mode, platformFee: feeSummary(fee) };
    if (!row.payments.accountId || row.payments.disconnectedAt) return { ...base, connected: false };
    const token = await accessToken(row, row.payments.mode);
    const { location } = await square.call(row.payments.mode, "GET", `/v2/locations/${idOf(row.payments.locationId, "location")}`, { accessToken: token });
    const capabilities = Array.isArray(location?.capabilities) ? location.capabilities : [];
    return {
      ...base,
      connected: true,
      accountId: row.payments.accountId,
      locationId: location?.id ?? row.payments.locationId,
      locationName: location?.name ?? null,
      currency: location?.currency ?? row.payments.currency ?? null,
      chargesEnabled: location?.status === "ACTIVE" && capabilities.includes("CREDIT_CARD_PROCESSING"),
    };
  }

  async function connectLink(row, { returnUrl } = {}) {
    let url;
    try { url = new URL(returnUrl); } catch { throw bad("returnUrl must be an address"); }
    if (url.protocol !== "https:" || !shopHosts(row).has(url.hostname.toLowerCase())) throw bad("returnUrl must be one of the shop's own addresses");
    const mode = row.payments.mode === "live" ? "live" : "test";
    const state = randomBytes(24).toString("hex");
    const expiresAt = now() + STATE_MS;
    await states.put(state, { shopId: row.shopId, mode, returnUrl: url.toString(), expiresAt });
    return { url: square.authorizeUrl(mode, { scopes: SQUARE_SCOPES, state }), expiresAt: Math.floor(expiresAt / 1000) };
  }

  const backTo = (returnUrl, outcome) => {
    const url = new URL(returnUrl);
    url.searchParams.set("square", outcome);
    return { status: 302, headers: { Location: url.toString() }, body: { square: outcome } };
  };

  return {
    ops: Object.freeze(Object.keys(OPS)),

    /** One `square.*` call (or account.status / account.connectLink) for a proven shop on Square. */
    async runShopOp(row, body, fee) {
      const name = body.op;
      const args = body.args ?? {};
      if (name === "account.status") return status(row, fee);
      if (name === "account.connectLink") return connectLink(row, args);
      if (typeof name !== "string" || !Object.hasOwn(OPS, name)) throw bad(`unknown call ${String(name).slice(0, 60)}`);
      if (!row.payments.accountId || row.payments.disconnectedAt) throw refuse(409, "not_connected", "This shop hasn't connected Square yet.");
      const mode = modeFor(row, body.mode);
      return OPS[name](row, mode, await accessToken(row, mode), args, fee);
    },

    /**
     * Square sends the press back here (GET /square/oauth) with `code` and `state`, or `error` when they said no. Always
     * answers with a redirect to the shop's admin (`?square=connected|denied|in_use|other_account|failed`), except
     * for a state it doesn't know, which can't be sent anywhere safe.
     */
    async oauthCallback(query = {}) {
      const state = typeof query.state === "string" ? query.state : "";
      const saved = /^[0-9a-f]{48}$/.test(state) ? await states.take(state) : null;
      if (!saved || saved.expiresAt < now()) return { status: 400, body: { error: "This sign-in link has expired. Go back to your shop's admin and press Connect Square again." } };
      const row = await registry.getShop(saved.shopId);
      if (!row || row.payments?.provider !== "square") return backTo(saved.returnUrl, "failed");
      if (query.error || typeof query.code !== "string" || !query.code) return backTo(saved.returnUrl, "denied");
      let granted;
      try {
        granted = await square.obtainToken(saved.mode, { code: query.code });
      } catch (err) {
        console.error(`Square sign-in for ${saved.shopId} failed:`, err?.message || err);
        return backTo(saved.returnUrl, "failed");
      }
      const merchantId = granted.merchant_id;
      if (typeof merchantId !== "string" || !MERCHANT_ID.test(merchantId) || !granted.access_token || !granted.refresh_token) return backTo(saved.returnUrl, "failed");
      // One Square account per shop, one shop per Square account: anything else could send a press's money elsewhere.
      const holder = await registry.findShopByPaymentAccount("square", merchantId);
      if (holder && holder.shopId !== row.shopId) return backTo(saved.returnUrl, "in_use");
      if (row.payments.accountId && row.payments.accountId !== merchantId && !row.payments.disconnectedAt) return backTo(saved.returnUrl, "other_account");
      let location;
      try {
        ({ location } = await square.call(saved.mode, "GET", "/v2/locations/main", { accessToken: granted.access_token }));
      } catch (err) {
        console.error(`Square location for ${saved.shopId} couldn't be read:`, err?.message || err);
        return backTo(saved.returnUrl, "failed");
      }
      if (!location?.id) return backTo(saved.returnUrl, "failed");
      await tokens.set(row.shopId, saved.mode, {
        sealed: seal(sealKey(), bound(row.shopId, saved.mode), { accessToken: granted.access_token, refreshToken: granted.refresh_token }),
        merchantId, expiresAt: granted.expires_at, connectedAt: iso(),
      });
      const { disconnectedAt: _gone, ...kept } = row.payments;
      const payments = { ...kept, provider: "square", mode: saved.mode, accountId: merchantId, locationId: location.id, currency: location.currency ?? null, country: location.country ?? null, connectedAt: iso() };
      await registry.updateShop(row.shopId, { payments });
      await logChange(row.shopId, `payments-square-connected-${merchantId}-${saved.mode}`, { kind: "payments.square-connected", accountId: merchantId, locationId: location.id, mode: saved.mode });
      return backTo(saved.returnUrl, "connected");
    },

    /** Square's events for one environment (POST /square/events/live or /square/events/test). */
    async squareEvent(mode, headers, rawBody, header) {
      const hook = settings.webhooks?.[mode];
      if (!hook?.url || !hook.keys?.length) return { status: 503, body: { error: "Square events aren't set up for this environment." } };
      if (!verifySquareSignature(hook.keys, hook.url, rawBody, header(headers, SQUARE_SIGNATURE_HEADER))) return { status: 400, body: { error: "The event's signature doesn't match." } };
      let event;
      try { event = JSON.parse(rawBody); } catch { return { status: 400, body: { error: "The event isn't JSON." } }; }
      if (typeof event.merchant_id !== "string" || !MERCHANT_ID.test(event.merchant_id)) return { status: 200, body: { ignored: "no merchant" } };
      const row = await registry.findShopByPaymentAccount("square", event.merchant_id);
      if (!row || row.payments?.mode !== mode) return { status: 200, body: { ignored: "no shop has this Square account here" } };
      if (event.type === "oauth.authorization.revoked") {
        if (!row.payments.disconnectedAt) {
          await tokens.remove(row.shopId, mode);
          await registry.updateShop(row.shopId, { payments: { ...row.payments, disconnectedAt: iso() } });
          await logChange(row.shopId, `payments-square-revoked-${event.event_id}`, { kind: "payments.disconnected", accountId: event.merchant_id });
        }
        return { status: 200, body: { disconnected: row.shopId } };
      }
      // Only payments, refunds and disputes mean anything to a shop; the rest would be refused there and sent again.
      if (!["payment", "refund", "dispute"].includes(event.data?.type)) return { status: 200, body: { ignored: "not a payment, refund or dispute" } };
      const result = await deliver(row, rawBody, "square");
      if (result.status >= 200 && result.status < 300) return { status: 200, body: { forwarded: row.shopId } };
      console.error(`Square event ${event.event_id} for ${row.shopId} wasn't taken (${result.status}${result.error ? `: ${result.error}` : ""})`);
      return { status: 502, body: { error: "The shop didn't take the event; Square will send it again." } };
    },

    /** Step 13 for a Square shop: the account the press connected, once they have. */
    async findAccount(shopId) {
      const row = await registry.getShop(shopId);
      const payments = row?.payments;
      if (payments?.provider !== "square" || !payments.accountId || payments.disconnectedAt) return null;
      return { accountId: payments.accountId, mode: payments.mode };
    },
  };
}

export { SquareApiError };
