// The platform's shared sender (code plan 2.3b): the backup for a shop that hasn't connected its own Gmail, or whose
// Gmail refused a send. It asks the platform's email service (services/email in the platform repo) to send one email;
// the service puts the shop's name on it and sends replies to the shop, from the platform's notifications address.
// The shop never holds the platform's email key: it proves who it is with its own service key.
//
// Used only when the shop's functions env names the service (shopConfig.platformEmailUrl, PLATFORM_EMAIL_URL). A shop
// with Gmail connected sends from its own Gmail first and only comes here when Gmail refuses.
//
//   POST <url>   headers X-Shop-Id: <project id>, Authorization: Bearer <PLATFORM_SERVICE_KEY>
//                body { kind, to, subject, html, idempotencyKey }  ->  200 { ok, id } | 4xx/5xx { ok: false, retryable, message }

const KIND = /^[a-z][a-z0-9-]{1,40}$/;

/** The service's kind names are lowercase-with-dashes: orderConfirmed -> order-confirmed. */
function platformKind(kind) {
  const name = String(kind || "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 41);
  return KIND.test(name) ? name : "shop-email";
}

/**
 * @param {object} deps
 * @param {string} deps.url the platform email service's shop door (https)
 * @param {string} deps.shopId this shop's id in the registry (its project id)
 * @param {() => string} deps.serviceKey this shop's service key, read at send time
 * @param {Function} deps.fetch fetch with a timeout (index.js passes its own)
 */
function createPlatformSender({ url, shopId, serviceKey, fetch }) {
  if (!/^https:\/\/[^\s]+$/.test(String(url || ""))) throw new Error("The platform email address must be https");
  return {
    async send({ kind, to, subject, html, idempotencyKey }) {
      const key = String(serviceKey() || "").trim();
      if (!key) {
        const err = new Error("This shop has no key for the platform's shared sender yet. Connect Gmail in Settings › Email sender, or ask the platform to finish setting up email.");
        err.permanent = false;
        throw err;
      }
      let response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Shop-Id": shopId, Authorization: `Bearer ${key}` },
          body: JSON.stringify({ kind: platformKind(kind), to, subject, html, idempotencyKey }),
        });
      } catch (err) {
        throw Object.assign(new Error(`The platform's shared sender could not be reached (${err?.message || err}).`), { permanent: false });
      }
      const answer = await response.json().catch(() => ({}));
      if (response.ok && answer?.ok) return { id: answer.id || null };
      const err = new Error(`The platform's shared sender refused the email (${response.status}: ${String(answer?.message || "no answer").slice(0, 300)}).`);
      // A refusal the service says a retry can't fix (a bad address, a bad email) is not queued; anything else is.
      err.permanent = answer?.retryable === false;
      throw err;
    },
  };
}

module.exports = { createPlatformSender, platformKind };
