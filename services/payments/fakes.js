// In-memory stand-ins for the payment service's tests: a pretend Stripe behind `fetch`, the service's account record
// and a shop webhook that records what it is handed. Nothing here reaches Stripe.

/** Stripe's form body back into flat `key -> value` pairs (`metadata[order_id]` stays one key). */
export function formPairs(text) {
  const out = {};
  for (const part of String(text ?? "").split("&").filter(Boolean)) {
    const [key, value = ""] = part.split("=");
    const name = decodeURIComponent(key);
    const decoded = decodeURIComponent(value);
    if (name.endsWith("[]")) (out[name] ??= []).push(decoded);
    else out[name] = decoded;
  }
  return out;
}

/**
 * A pretend Stripe. `answers` is a list of { status, body } (or "network") used first, in order. Then it answers the
 * calls the service makes from `world` (accounts, payment intents, sessions, events), like Stripe, keeping the first
 * answer for a repeated idempotency key. `requests` keeps every call with its headers and decoded parameters.
 */
export function fakeStripeFetch(answers = []) {
  const queue = [...answers];
  const requests = [];
  const byKey = new Map();
  let next = 1;
  const world = { accounts: new Map(), intents: new Map(), sessions: new Map(), events: new Map(), refunds: [], paymentDomains: [], balanceTransactions: [] };

  const missing = (what) => ({ status: 404, body: { error: { type: "invalid_request_error", code: "resource_missing", message: `No such ${what}` } } });

  function answer(method, path, params, account) {
    let m;
    if (method === "POST" && path === "/v1/accounts") {
      const id = `acct_fake${next++}`;
      const created = { id, object: "account", charges_enabled: false, payouts_enabled: false, details_submitted: false, metadata: { lmb_shop_id: params["metadata[lmb_shop_id]"] }, requirements: { currently_due: ["external_account"] } };
      world.accounts.set(id, created);
      return { status: 200, body: created };
    }
    if ((m = path.match(/^\/v1\/accounts\/(acct_\w+)$/)) && method === "GET") {
      return world.accounts.has(m[1]) ? { status: 200, body: world.accounts.get(m[1]) } : missing("account");
    }
    if (method === "POST" && path === "/v1/account_links") {
      return { status: 200, body: { object: "account_link", url: `https://connect.stripe.example/setup/${params.account}`, expires_at: 1900000000 } };
    }
    if (method === "POST" && path === "/v1/payment_intents") {
      const id = `pi_fake${next++}`;
      const intent = { id, object: "payment_intent", amount: Number(params.amount), currency: params.currency, status: "requires_payment_method", client_secret: `${id}_secret_x`, metadata: { order_id: params["metadata[order_id]"] }, account };
      world.intents.set(id, intent);
      return { status: 200, body: intent };
    }
    if ((m = path.match(/^\/v1\/payment_intents\/(pi_\w+)(\/cancel)?$/))) {
      const intent = world.intents.get(m[1]);
      if (!intent || intent.account !== account) return missing("payment_intent");
      if (m[2]) intent.status = "canceled";
      return { status: 200, body: intent };
    }
    if (method === "POST" && path === "/v1/checkout/sessions") {
      const id = `cs_test_fake${next++}`;
      const session = { id, object: "checkout.session", status: "open", client_reference_id: params.client_reference_id, account };
      world.sessions.set(id, session);
      return { status: 200, body: session };
    }
    if ((m = path.match(/^\/v1\/checkout\/sessions\/(cs_\w+)(\/expire)?$/))) {
      const session = world.sessions.get(m[1]);
      if (!session || session.account !== account) return missing("checkout.session");
      if (m[2]) session.status = "expired";
      return { status: 200, body: session };
    }
    if (method === "POST" && path === "/v1/refunds") {
      const refund = { id: `re_fake${next++}`, object: "refund", amount: Number(params.amount ?? 0), status: "succeeded", payment_intent: params.payment_intent };
      world.refunds.push({ ...refund, account });
      return { status: 200, body: refund };
    }
    if (method === "GET" && (path === "/v1/refunds" || path === "/v1/disputes")) {
      return { status: 200, body: { object: "list", data: path === "/v1/refunds" ? world.refunds.filter((r) => r.account === account && r.payment_intent === params.payment_intent) : [] } };
    }
    if (path === "/v1/balance_transactions" && method === "GET") {
      // A payout's transactions (each `{ account, payout, ... }` in world.balanceTransactions), newest first, paged.
      const all = world.balanceTransactions.filter((t) => t.account === account && t.payout === params.payout).map(({ account: _a, payout: _p, ...t }) => t);
      const start = params.starting_after ? all.findIndex((t) => t.id === params.starting_after) + 1 : 0;
      const limit = Number(params.limit ?? 10);
      return { status: 200, body: { object: "list", data: all.slice(start, start + limit), has_more: start + limit < all.length } };
    }
    if (path === "/v1/payment_method_domains" && method === "GET") {
      return { status: 200, body: { object: "list", data: world.paymentDomains.filter((d) => d.account === account && d.domain_name === params.domain_name) } };
    }
    if (path === "/v1/payment_method_domains" && method === "POST") {
      const domain = { id: `pmd_fake${next++}`, object: "payment_method_domain", domain_name: params.domain_name, enabled: params.enabled === "true", apple_pay: { status: "active" }, google_pay: { status: "active" }, account, validated: 0 };
      world.paymentDomains.push(domain);
      return { status: 200, body: domain };
    }
    if ((m = path.match(/^\/v1\/payment_method_domains\/(pmd_\w+)\/validate$/)) && method === "POST") {
      const domain = world.paymentDomains.find((d) => d.id === m[1] && d.account === account);
      if (!domain) return missing("payment_method_domain");
      domain.validated += 1;
      return { status: 200, body: domain };
    }
    if ((m = path.match(/^\/v1\/events\/(evt_\w+)$/))) {
      const event = world.events.get(m[1]);
      return event && event.account === account ? { status: 200, body: event } : missing("event");
    }
    return { status: 404, body: { error: { type: "invalid_request_error", message: `Unrecognized request URL (${method} ${path})` } } };
  }

  const fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method ?? "GET";
    const params = formPairs(method === "GET" ? parsed.search.slice(1) : init.body);
    const headers = { ...(init.headers ?? {}) };
    requests.push({ method, path: parsed.pathname, headers, params });
    const queued = queue.shift();
    if (queued === "network") throw new Error("socket hang up");
    let result = queued;
    if (!result) {
      const key = headers["Idempotency-Key"];
      if (key && byKey.has(key)) result = byKey.get(key);
      else {
        result = answer(method, parsed.pathname, params, headers["Stripe-Account"] ?? null);
        if (key) byKey.set(key, result);
      }
    }
    return { ok: result.status >= 200 && result.status < 300, status: result.status, json: async () => structuredClone(result.body) };
  };
  return { fetch, requests, world };
}

/** The service's record of the accounts it made (a platform-project collection in the real service). */
export function fakeAccounts() {
  const rows = new Map();
  return {
    rows,
    get: async (shopId) => (rows.has(shopId) ? { ...rows.get(shopId) } : null),
    set: async (shopId, row) => void rows.set(shopId, { ...row }),
  };
}

/** A shop webhook: records each event it is handed and answers `status` (200 unless told otherwise). */
export function fakeDeliver(status = 200) {
  const delivered = [];
  const deliver = async (row, rawBody) => {
    delivered.push({ shopId: row.shopId, rawBody });
    return { status: typeof status === "function" ? status(row) : status };
  };
  return { deliver, delivered };
}
