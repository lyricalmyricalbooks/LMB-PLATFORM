// Stripe's REST API (https://docs.stripe.com/api), reached through an injected `fetch`. No Stripe package: the service
// makes a handful of calls, each named in service.js, and tests hand in a fake fetch so nothing reaches Stripe.
//
// Every call names its mode ("live" or "test"), which picks the platform key, and may act for a connected account
// (the `Stripe-Account` header) with an idempotency key. Parameters are form-encoded the way Stripe expects
// (`metadata[order_id]=…`, `line_items[0][quantity]=…`, `expand[]=…`).

export const STRIPE_API = "https://api.stripe.com";

/**
 * The Stripe API version every call asks for (code plan 15.2), so the code decides what Stripe's answers look like and
 * not whatever the Stripe account's default happens to be. Stripe's go-live checklist asks for this. It is the newest
 * version Stripe's own upgrade page names (checked 29 October 2026). The code reads the newer answer shapes first
 * (`items.data[].current_period_end`, `parent.subscription_details`) and falls back to the older ones, but the first
 * Stripe sandbox run (plan 15.7) is what proves the whole flow against it. Change it with `STRIPE_API_VERSION`; the
 * Connect events address is created with the same `api_version` (README, Settings).
 */
export const DEFAULT_STRIPE_API_VERSION = "2026-09-30.endive";

/** Stripe's version names: a date, then (from 2024) a release name, like 2026-09-30.endive. */
export const isStripeApiVersion = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}(\.[a-z]+)?$/.test(value);

/** A refusal from Stripe, with Stripe's own type, code and HTTP status kept for the caller. */
export class StripeApiError extends Error {
  constructor({ message, type, code, param, statusCode }) {
    super(message || "Stripe refused the request.");
    this.name = "StripeApiError";
    this.type = type || "api_error";
    this.code = code || null;
    this.param = param || null;
    this.statusCode = statusCode || 500;
  }
}

/** Stripe's form encoding: nested objects as `a[b]`, arrays as `a[0]` (or `a[]` for plain values like expand). */
export function formEncode(params) {
  const pairs = [];
  const add = (key, value) => {
    if (value === undefined) return;
    if (value === null) { pairs.push([key, ""]); return; }
    if (Array.isArray(value)) {
      const plain = value.every((item) => item === null || typeof item !== "object");
      value.forEach((item, index) => add(plain ? `${key}[]` : `${key}[${index}]`, item));
      return;
    }
    if (typeof value === "object") {
      for (const [inner, item] of Object.entries(value)) add(`${key}[${inner}]`, item);
      return;
    }
    pairs.push([key, String(value)]);
  };
  for (const [key, value] of Object.entries(params ?? {})) add(key, value);
  return pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
}

/**
 * @param {object} deps
 * @param {typeof fetch} deps.fetch
 * @param {{ live?: string|null, test?: string|null }} deps.keys the platform's secret keys, from the environment only
 * @param {string} [deps.apiVersion] the Stripe API version to ask for on every call (DEFAULT_STRIPE_API_VERSION)
 */
export function createStripeApi({ fetch, keys, apiVersion = DEFAULT_STRIPE_API_VERSION }) {
  if (typeof fetch !== "function") throw new Error("the Stripe client needs a fetch");
  if (!isStripeApiVersion(apiVersion)) throw new Error(`the Stripe API version "${apiVersion}" is not a Stripe version name like ${DEFAULT_STRIPE_API_VERSION}`);
  return {
    /** Has the platform a key for this mode? */
    hasMode: (mode) => Boolean(keys?.[mode]),
    /**
     * One Stripe call. Returns Stripe's object; throws StripeApiError on a refusal.
     * @param {"live"|"test"} mode
     * @param {"GET"|"POST"|"DELETE"} method
     * @param {string} path like /v1/payment_intents
     */
    async call(mode, method, path, { params, account = null, idempotencyKey = null } = {}) {
      if (mode !== "live" && mode !== "test") throw new StripeApiError({ message: `unknown mode ${mode}`, type: "invalid_request_error", statusCode: 400 });
      const key = keys?.[mode];
      if (!key) throw new StripeApiError({ message: `The platform has no Stripe ${mode} key.`, type: "api_error", code: "platform_key_missing", statusCode: 503 });
      const body = formEncode(params);
      const url = method === "GET" && body ? `${STRIPE_API}${path}?${body}` : `${STRIPE_API}${path}`;
      const headers = { Authorization: `Bearer ${key}`, "Stripe-Version": apiVersion };
      if (account) headers["Stripe-Account"] = account;
      if (idempotencyKey && method === "POST") headers["Idempotency-Key"] = idempotencyKey;
      if (method !== "GET") headers["Content-Type"] = "application/x-www-form-urlencoded";
      let response;
      try {
        response = await fetch(url, { method, headers, ...(method !== "GET" ? { body } : {}) });
      } catch (err) {
        throw new StripeApiError({ message: `Stripe could not be reached: ${err?.message || err}`, type: "api_connection_error", statusCode: 502 });
      }
      let data = null;
      try { data = await response.json(); } catch { data = null; }
      if (!response.ok) {
        const error = data?.error ?? {};
        throw new StripeApiError({ message: error.message, type: error.type, code: error.code, param: error.param, statusCode: response.status });
      }
      return data;
    },
  };
}
