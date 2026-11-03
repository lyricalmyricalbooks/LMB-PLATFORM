// Stripe calls that try again when Stripe is briefly out of reach (code plan 22.4), with a short growing wait, and only
// when the retry can't do the thing twice:
//
// - a read (GET) or a DELETE: after a failed connection, a rate limit (429), a lock clash (409) or a Stripe-side error
//   (500 and up);
// - a POST with an idempotency key: after a failed connection, a 429 or a 409 only. Stripe keeps the answer to a key,
//   500 errors included, so sending the same key again after a 500 would only get the same 500 back; a 429 or a
//   connection that never got through left nothing saved.
//
// A POST without a key is never sent twice, and a refusal (400, 402, 404…) is never retried: it would only be refused
// again. Stripe's `Stripe-Should-Retry` header isn't read because stripeApi.js keeps only the status.

export const RETRY_WAITS_MS = Object.freeze([300, 1200]);

/** Should this failure be tried again? Network errors, 409 lock clashes, 429 and (unless `keyed`) 5xx. */
export function retryable(error, { keyed = false } = {}) {
  if (error?.type === "api_connection_error") return true;
  // The platform has no key for this mode: no wait will fix that.
  if (error?.code === "platform_key_missing") return false;
  const status = error?.statusCode;
  return status === 409 || status === 429 || (!keyed && Number.isInteger(status) && status >= 500);
}

/** A call that can safely be sent twice. */
export const safeToRepeat = (method, options) => method === "GET" || method === "DELETE" || Boolean(options?.idempotencyKey);

/**
 * Wraps `call(mode, method, path, options)` so a safe call that failed for a passing reason is tried again after each
 * wait in `waits`. `sleep` is injected so tests don't wait.
 */
export function withRetries(call, { waits = RETRY_WAITS_MS, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  return async (mode, method, path, options) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await call(mode, method, path, options);
      } catch (error) {
        const keyed = method === "POST";
        if (attempt >= waits.length || !safeToRepeat(method, options) || !retryable(error, { keyed })) throw error;
        await sleep(waits[attempt]);
      }
    }
  };
}
