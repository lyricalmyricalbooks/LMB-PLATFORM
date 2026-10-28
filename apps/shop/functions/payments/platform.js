// Payments through the platform (code plan 2.2): the shop holds no Stripe key. Every Stripe call goes to the platform's
// payment service (LMB-PLATFORM services/payments), which makes it on the press's own connected account, the one the
// platform's registry lists for this shop. The shop proves who it is with its service key:
//
//   X-Shop-Id: <shop id>    Authorization: Bearer <service key>     body { op, mode, args }
//
// The key is the Functions secret PLATFORM_SERVICE_KEY (platformKey.js), written by the platform's setup, which keeps
// only its hash. The same key serves the platform's email service.
//
// `platformStripeClient` gives stripe.js a Stripe-shaped client for one mode, so the provider's code (lookups, refunds,
// checkout) runs unchanged; only the calls the service allows exist on it.

/** A refusal from the payment service, shaped like a Stripe error so stripe.js treats it the same way. */
function serviceError(status, body) {
  const detail = body?.error || {};
  const err = new Error(detail.message || `The platform's payment service answered ${status}.`);
  err.type = detail.type || "api_error";
  err.code = detail.code || null;
  err.param = detail.param || null;
  err.statusCode = status;
  return err;
}

/**
 * The shop's caller for the payment service.
 * @param {object} deps
 * @param {typeof fetch} deps.fetch
 * @param {string} deps.url the service's address (shopConfig.paymentsServiceUrl)
 * @param {string} deps.shopId this shop's id in the platform registry (its project id)
 * @param {() => Promise<string>} deps.readKey the shop's service key
 */
function createServiceCaller({ fetch, url, shopId, readKey, timeoutMs = 20000 }) {
  return async function call(op, mode, args = {}) {
    const key = await readKey();
    if (!key) throw serviceError(503, { error: { code: "not_connected", message: "This shop isn't connected to the platform's payments yet." } });
    let response;
    try {
      response = await fetch(`${url}/shop`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shop-Id": shopId, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ op, mode, args }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw serviceError(502, { error: { type: "api_connection_error", message: `The platform's payment service could not be reached: ${err?.message || err}` } });
    }
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) throw serviceError(response.status, body);
    return body;
  };
}

// Stripe SDK calls take (id, params, options) or (params, options); the service wants plain args.
const params = (value) => (value && typeof value === "object" && Object.keys(value).length ? { params: value } : {});
const key = (options) => (options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {});

/** A Stripe-shaped client for one mode, backed by the payment service. */
function platformStripeClient(call, mode) {
  return Object.freeze({
    platform: true,
    mode,
    paymentIntents: {
      create: (p, options) => call("paymentIntents.create", mode, { params: p, ...key(options) }),
      retrieve: (id, p) => call("paymentIntents.retrieve", mode, { id, ...params(p) }),
      cancel: (id) => call("paymentIntents.cancel", mode, { id }),
    },
    checkout: {
      sessions: {
        create: (p, options) => call("checkout.sessions.create", mode, { params: p, ...key(options) }),
        retrieve: (id) => call("checkout.sessions.retrieve", mode, { id }),
        expire: (id) => call("checkout.sessions.expire", mode, { id }),
      },
    },
    refunds: {
      create: (p, options) => call("refunds.create", mode, { params: p, ...key(options) }),
      list: (p) => call("refunds.list", mode, { params: p }),
    },
    disputes: { list: (p) => call("disputes.list", mode, { params: p }) },
    events: { retrieve: (id) => call("events.retrieve", mode, { id }) },
  });
}

/**
 * The press's own account on the platform, for the admin's payments card (code plan 2.2b / 2.10): whether it is
 * connected and what the platform's fee is (`account.status`), and the page that connects it: Square's sign-in
 * (`account.connectLink`) or Stripe's onboarding (`account.onboardingLink`). The service checks that every return
 * address is one of the shop's own.
 */
function platformAccount(call) {
  return Object.freeze({
    status: () => call("account.status", undefined),
    connectLink: (returnUrl) => call("account.connectLink", undefined, { returnUrl }),
    onboardingLink: (returnUrl, refreshUrl) => call("account.onboardingLink", undefined, { returnUrl, refreshUrl }),
  });
}

/**
 * Everything stripe.js needs for platform mode.
 * @param {object} deps
 * @param {typeof fetch} deps.fetch
 * @param {string} deps.url the payment service's address
 * @param {string} deps.shopId
 * @param {() => string} deps.serviceKey the shop's key, read at call time (platformKey.js platformServiceKey)
 */
function createPlatformAccess({ fetch, url, shopId, serviceKey }) {
  if (typeof url !== "string" || !/^https:\/\/[^/\s]+(\/[^\s]*)?$/.test(url)) {
    throw new Error("Payments through the platform need SHOP_PAYMENTS_SERVICE_URL (https://…) in the shop's functions/.env file.");
  }
  const readKey = async () => {
    const value = typeof serviceKey === "function" ? serviceKey() : "";
    return typeof value === "string" ? value : "";
  };
  const call = createServiceCaller({ fetch, url: url.replace(/\/+$/, ""), shopId, readKey });
  return {
    call,
    account: platformAccount(call),
    client: (mode) => platformStripeClient(call, mode === "test" ? "test" : "live"),
  };
}

module.exports = { createPlatformAccess, createServiceCaller, platformAccount, platformStripeClient };
