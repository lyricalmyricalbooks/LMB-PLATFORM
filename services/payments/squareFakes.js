// In-memory stand-ins for the Square side of the payment service's tests: a pretend Square behind `fetch` (both
// environments), the presses' token store and Connect Square's one-use states. Nothing here reaches Square.
import { SQUARE_HOSTS } from "./squareApi.js";

const notFound = (what) => ({ status: 404, body: { errors: [{ category: "INVALID_REQUEST_ERROR", code: "NOT_FOUND", detail: `${what} not found` }] } });

/**
 * A pretend Square. `world.merchants` maps a merchant id to `{ mode, location }`; `world.codes` maps a sign-in code to
 * the merchant who gave it. `world.pay(linkId)` plays a buyer paying a payment link; `world.dispute(paymentId)` opens a
 * dispute. `answers` (`{ status, body }` or "network") are used first, in order. `requests` keeps every call.
 */
export function fakeSquareFetch({ apps, answers = [] } = {}) {
  const queue = [...answers];
  const requests = [];
  let next = 1;
  const world = {
    merchants: new Map(), codes: new Map(), tokens: new Map(), refreshTokens: new Map(),
    links: new Map(), orders: new Map(), payments: new Map(), refunds: new Map(), disputes: [], byKey: new Map(), revoked: [],
    payouts: new Map(),
  };
  const nowIso = () => "2026-10-28T12:00:00Z";

  world.addMerchant = (merchantId, mode, location = {}) => {
    world.merchants.set(merchantId, { mode, location: { id: `LOC${merchantId}`, name: "Main shop", status: "ACTIVE", currency: "CAD", country: "CA", capabilities: ["CREDIT_CARD_PROCESSING"], ...location } });
  };
  world.pay = (linkId) => {
    const link = world.links.get(linkId);
    const order = world.orders.get(link.order_id);
    const id = `PAY${next++}`;
    const payment = {
      id, status: "COMPLETED", amount_money: { ...order.total_money }, total_money: { ...order.total_money }, order_id: order.id,
      location_id: order.location_id, created_at: nowIso(), refund_ids: [], merchant: link.merchant,
      ...(link.app_fee_money ? { app_fee_money: { ...link.app_fee_money } } : {}),
    };
    world.payments.set(id, payment);
    order.tenders = [{ id, payment_id: id, amount_money: { ...order.total_money }, type: "CARD" }];
    order.state = "COMPLETED";
    return payment;
  };
  world.dispute = (paymentId) => {
    const payment = world.payments.get(paymentId);
    const dispute = { id: `DSP${next++}`, state: "EVIDENCE_REQUIRED", reason: "NO_KNOWLEDGE", amount_money: { ...payment.amount_money }, disputed_payment: { payment_id: paymentId }, due_at: "2026-11-10T00:00:00Z", created_at: nowIso(), location_id: payment.location_id, merchant: payment.merchant };
    world.disputes.push(dispute);
    return dispute;
  };

  // A payout to the merchant's bank, with its lines (Square's PayoutEntry shape).
  world.payout = (merchantId, entries, fields = {}) => {
    const id = `po_fake-${next++}`;
    const currency = entries[0]?.gross_amount_money?.currency_code ?? "CAD";
    const amount = entries.reduce((sum, e) => sum + (e.net_amount_money?.amount ?? 0), 0);
    world.payouts.set(id, {
      payout: { id, status: "PAID", arrival_date: "2026-10-30", amount_money: { amount, currency_code: currency }, location_id: world.merchants.get(merchantId)?.location.id, type: "BATCH", created_at: nowIso(), ...fields },
      entries: entries.map((e, i) => ({ id: `${id}-e${i}`, payout_id: id, effective_at: nowIso(), ...e })),
      merchant: merchantId,
    });
    return id;
  };

  const clean = ({ merchant: _merchant, ...rest }) => rest;

  function answer(mode, method, path, headers, body, query) {
    let m;
    if (path === "/oauth2/token" && method === "POST") {
      const app = apps?.[mode];
      if (!app || body.client_id !== app.applicationId || body.client_secret !== app.applicationSecret) return { status: 401, body: { message: "Not Authorized", type: "service.not_authorized" } };
      let merchantId;
      if (body.grant_type === "authorization_code") {
        merchantId = world.codes.get(body.code);
        if (!merchantId) return { status: 400, body: { message: "Invalid authorization code", type: "bad_request" } };
        world.codes.delete(body.code);
      } else if (body.grant_type === "refresh_token") {
        merchantId = world.refreshTokens.get(body.refresh_token);
        if (!merchantId) return { status: 401, body: { message: "Invalid refresh token", type: "service.not_authorized" } };
      } else return { status: 400, body: { message: "bad grant", type: "bad_request" } };
      const accessToken = `EAAAfake${next++}`;
      const refreshToken = body.refresh_token || `EQAAfake-${merchantId}`;
      world.tokens.set(accessToken, merchantId);
      world.refreshTokens.set(refreshToken, merchantId);
      return { status: 200, body: { access_token: accessToken, token_type: "bearer", expires_at: "2026-11-27T12:00:00Z", merchant_id: merchantId, refresh_token: refreshToken, short_lived: false } };
    }
    if (path === "/oauth2/revoke" && method === "POST") {
      world.revoked.push(body.merchant_id);
      for (const [token, merchant] of world.tokens) if (merchant === body.merchant_id) world.tokens.delete(token);
      return { status: 200, body: { success: true } };
    }
    const merchantId = world.tokens.get(String(headers.Authorization ?? "").replace(/^Bearer /, ""));
    const merchant = merchantId && world.merchants.get(merchantId);
    if (!merchant || merchant.mode !== mode) return { status: 401, body: { errors: [{ category: "AUTHENTICATION_ERROR", code: "UNAUTHORIZED", detail: "This request could not be authorized." }] } };
    const mine = (thing) => thing && thing.merchant === merchantId;

    if ((m = path.match(/^\/v2\/locations\/([^/]+)$/)) && method === "GET") {
      return m[1] === "main" || m[1] === merchant.location.id ? { status: 200, body: { location: merchant.location } } : notFound("Location");
    }
    if (path === "/v2/online-checkout/payment-links" && method === "POST") {
      const key = `${merchantId}/${body.idempotency_key}`;
      if (body.idempotency_key && world.byKey.has(key)) return world.byKey.get(key);
      if (body.order.location_id !== merchant.location.id) return notFound("Location");
      const total = body.order.line_items.reduce((sum, line) => sum + line.base_price_money.amount * Number(line.quantity), 0);
      const currency = body.order.line_items[0].base_price_money.currency;
      const order = { id: `ORD${next++}`, location_id: body.order.location_id, reference_id: body.order.reference_id, line_items: body.order.line_items, total_money: { amount: total, currency }, state: "OPEN", tenders: [], merchant: merchantId };
      world.orders.set(order.id, order);
      const link = { id: `LNK${next++}`, version: 1, order_id: order.id, url: `https://square.link/u/fake${next}`, long_url: `https://checkout.square.site/fake${next}`, created_at: nowIso(), merchant: merchantId, app_fee_money: body.checkout_options?.app_fee_money ?? null, checkout_options: body.checkout_options, pre_populated_data: body.pre_populated_data };
      world.links.set(link.id, link);
      const result = { status: 200, body: { payment_link: { id: link.id, version: 1, order_id: order.id, url: link.url, long_url: link.long_url, created_at: link.created_at }, related_resources: { orders: [clean(order)] } } };
      if (body.idempotency_key) world.byKey.set(key, result);
      return result;
    }
    if ((m = path.match(/^\/v2\/online-checkout\/payment-links\/([^/]+)$/))) {
      const link = world.links.get(m[1]);
      if (!mine(link)) return notFound("Payment link");
      if (method === "DELETE") {
        world.links.delete(link.id);
        world.orders.get(link.order_id).state = "CANCELED";
        return { status: 200, body: { id: link.id, cancelled_order_id: link.order_id } };
      }
      return { status: 200, body: { payment_link: { id: link.id, version: 1, order_id: link.order_id, url: link.url, long_url: link.long_url, created_at: link.created_at } } };
    }
    if ((m = path.match(/^\/v2\/orders\/([^/]+)$/)) && method === "GET") {
      const order = world.orders.get(m[1]);
      return mine(order) ? { status: 200, body: { order: clean(order) } } : notFound("Order");
    }
    if ((m = path.match(/^\/v2\/payments\/([^/]+)(\/cancel)?$/))) {
      const payment = world.payments.get(m[1]);
      if (!mine(payment)) return notFound("Payment");
      if (m[2]) {
        if (payment.status !== "APPROVED") return { status: 400, body: { errors: [{ category: "INVALID_REQUEST_ERROR", code: "BAD_REQUEST", detail: "Only APPROVED payments can be canceled" }] } };
        payment.status = "CANCELED";
      }
      return { status: 200, body: { payment: clean(payment) } };
    }
    if (path === "/v2/refunds" && method === "POST") {
      const key = `${merchantId}/${body.idempotency_key}`;
      if (world.byKey.has(key)) return world.byKey.get(key);
      if (String(body.idempotency_key).length > 45) return { status: 400, body: { errors: [{ category: "INVALID_REQUEST_ERROR", code: "VALUE_TOO_LONG", field: "idempotency_key" }] } };
      const payment = world.payments.get(body.payment_id);
      if (!mine(payment)) return notFound("Payment");
      const left = payment.total_money.amount - (payment.refunded_money?.amount ?? 0);
      if (body.amount_money.amount > left) return { status: 400, body: { errors: [{ category: "INVALID_REQUEST_ERROR", code: "AMOUNT_TOO_HIGH", detail: "The requested refund amount exceeds the amount available to refund." }] } };
      const refund = { id: `RFD${next++}`, status: "PENDING", amount_money: { ...body.amount_money }, payment_id: payment.id, order_id: payment.order_id, location_id: payment.location_id, created_at: nowIso(), reason: body.reason, merchant: merchantId, ...(body.app_fee_money ? { app_fee_money: { ...body.app_fee_money } } : {}) };
      world.refunds.set(refund.id, refund);
      payment.refunded_money = { amount: (payment.refunded_money?.amount ?? 0) + refund.amount_money.amount, currency: refund.amount_money.currency };
      payment.refund_ids = [...(payment.refund_ids ?? []), refund.id];
      const result = { status: 200, body: { refund: clean(refund) } };
      world.byKey.set(key, result);
      return result;
    }
    if ((m = path.match(/^\/v2\/refunds\/([^/]+)$/)) && method === "GET") {
      const refund = world.refunds.get(m[1]);
      return mine(refund) ? { status: 200, body: { refund: clean(refund) } } : notFound("Refund");
    }
    if ((m = path.match(/^\/v2\/payouts\/([^/]+)(\/payout-entries)?$/)) && method === "GET") {
      const found = world.payouts.get(m[1]);
      if (!mine(found)) return notFound("Payout");
      if (!m[2]) return { status: 200, body: { payout: found.payout } };
      // Two to a page, so the shop's paging is exercised.
      const start = query.cursor ? Number(query.cursor) : 0;
      return { status: 200, body: { payout_entries: found.entries.slice(start, start + 2), ...(start + 2 < found.entries.length ? { cursor: String(start + 2) } : {}) } };
    }
    if (path === "/v2/disputes" && method === "GET") {
      const all = world.disputes.filter((d) => d.merchant === merchantId && (!query.location_id || d.location_id === query.location_id));
      // Two to a page, so the service's paging is exercised.
      const start = query.cursor ? Number(query.cursor) : 0;
      const page = all.slice(start, start + 2).map(clean);
      return { status: 200, body: { disputes: page, ...(start + 2 < all.length ? { cursor: String(start + 2) } : {}) } };
    }
    return { status: 404, body: { errors: [{ category: "INVALID_REQUEST_ERROR", code: "NOT_FOUND", detail: `No such call ${method} ${path}` }] } };
  }

  const fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    const mode = parsed.origin === SQUARE_HOSTS.live ? "live" : parsed.origin === SQUARE_HOSTS.test ? "test" : null;
    const method = init.method ?? "GET";
    const headers = { ...(init.headers ?? {}) };
    const body = init.body ? JSON.parse(init.body) : undefined;
    const query = Object.fromEntries(parsed.searchParams);
    requests.push({ mode, method, path: parsed.pathname, headers, body, query });
    const queued = queue.shift();
    if (queued === "network") throw new Error("socket hang up");
    const result = queued ?? (mode ? answer(mode, method, parsed.pathname, headers, body ?? {}, query) : { status: 404, body: {} });
    return { ok: result.status >= 200 && result.status < 300, status: result.status, json: async () => structuredClone(result.body) };
  };
  return { fetch, requests, world };
}

/** The presses' sealed Square tokens (a platform-project collection in the real service). */
export function fakeSquareTokens() {
  const rows = new Map();
  return {
    rows,
    get: async (shopId, mode) => (rows.has(`${shopId}/${mode}`) ? { ...rows.get(`${shopId}/${mode}`) } : null),
    set: async (shopId, mode, record) => void rows.set(`${shopId}/${mode}`, { ...record }),
    remove: async (shopId, mode) => void rows.delete(`${shopId}/${mode}`),
  };
}

/** Connect Square's one-use states. */
export function fakeSquareStates() {
  const rows = new Map();
  return {
    rows,
    put: async (state, record) => void rows.set(state, { ...record }),
    async take(state) {
      const record = rows.get(state) ?? null;
      rows.delete(state);
      return record;
    },
  };
}
