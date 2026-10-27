// The Stripe payment provider (functions/payments/index.js lists the interface every provider implements). This is the
// code that used to live in index.js, moved as is (code plans 1.11 and 1.12); payments.test.js pins it with a fake
// Stripe. Nothing here loads the Stripe package itself: index.js passes in its lazy `Stripe` constructor, so functions
// that never pay start fast and the vm-based handler tests' fake Stripe still applies.

const { modesToTry } = require("../stripeRecovery");

// An id this Stripe account doesn't know (or a key it refuses): the other account may know it.
function wrongAccount(err) {
  return err?.code === "resource_missing" || err?.statusCode === 404 || err?.type === "StripeAuthenticationError";
}

/**
 * The Stripe provider for one shop.
 * @param {object} deps
 * @param {object} deps.db Firestore (settings/website, adminSecrets/stripe)
 * @param {Function} deps.Stripe constructor: `new Stripe(secret[, options])`
 * @param {{ value: () => string }} deps.liveSecretKey the deployed STRIPE_SECRET_KEY secret (live fallback)
 * @param {(id: string) => Promise<object>} deps.readAdminSecret reads adminSecrets/<id>, {} when missing or unreadable
 */
function createStripeProvider({ db, Stripe, liveSecretKey, readAdminSecret }) {
  async function websiteSettings() {
    const settingsDoc = await db.collection("settings").doc("website").get();
    return settingsDoc.exists ? settingsDoc.data() || {} : {};
  }

  // Secret keys entered in the admin live in adminSecrets/stripe; older saves in settings win only when it has none.
  async function withPrivateStripeKeys(stripeSettings) {
    const merged = { ...(stripeSettings || {}) };
    const priv = await readAdminSecret("stripe");
    if (priv.secretKey) merged.secretKey = priv.secretKey;
    if (priv.testSecretKey) merged.testSecretKey = priv.testSecretKey;
    return merged;
  }

  // A client for one mode, acting for a connected account when the order recorded one. Throws when no key is set.
  async function getStripeClientForMode(mode, stripeAccountId = null) {
    const settings = await websiteSettings();
    const stripeSettings = await withPrivateStripeKeys(settings.payments?.stripe);
    const stripeSecret = mode === "test"
      ? stripeSettings.testSecretKey
      : (stripeSettings.secretKey || liveSecretKey.value());

    if (!stripeSecret) {
      throw new Error(`Stripe ${mode === "test" ? "test" : "live"} secret key is not configured.`);
    }

    return {
      stripe: new Stripe(stripeSecret),
      requestOptions: stripeAccountId ? { stripeAccount: stripeAccountId } : {},
    };
  }

  // The secret key for one Stripe mode, or "" when none is set (never throws).
  async function stripeSecretFor(mode) {
    const settings = await websiteSettings();
    const stripeSettings = await withPrivateStripeKeys(settings.payments?.stripe);
    if (mode === "test") return stripeSettings.testSecretKey || "";
    try { return stripeSettings.secretKey || liveSecretKey.value() || ""; } catch { return stripeSettings.secretKey || ""; }
  }

  async function shopTestMode() {
    const settingsDoc = await db.collection("settings").doc("website").get();
    return !!(settingsDoc.exists && settingsDoc.data()?.payments?.testMode);
  }

  // The shop's Stripe mode and both secret keys, read once for a whole sweep (the sweep asks Stripe about
  // many orders; each call used to read settings/website and adminSecrets/stripe again). Same keys as
  // shopTestMode/stripeSecretFor. Throws when either read fails, so the caller falls back to per-call reads
  // instead of running a whole sweep on a fallback key.
  async function readStripeKeys() {
    const [settingsDoc, secretDoc] = await Promise.all([
      db.collection("settings").doc("website").get(),
      db.collection("adminSecrets").doc("stripe").get(),
    ]);
    const stripe = settingsDoc.exists ? settingsDoc.data()?.payments?.stripe || {} : {};
    const priv = secretDoc.exists ? secretDoc.data() || {} : {};
    let live = priv.secretKey || stripe.secretKey || "";
    if (!live) { try { live = liveSecretKey.value() || ""; } catch { live = ""; } }
    return {
      testMode: !!(settingsDoc.exists && settingsDoc.data()?.payments?.testMode),
      secrets: { test: priv.testSecretKey || stripe.testSecretKey || "", live },
      // A slow Stripe answer must not run the sweep past its 300 s limit: give up sooner, retry next sweep.
      clientOptions: { timeout: 20 * 1000, maxNetworkRetries: 1 },
    };
  }

  // Runs `ask(stripe, mode)` against each Stripe account that may hold the order's payment (the order's own mode
  // first, modesToTry) and returns its answer. An account without a key is skipped; one that doesn't know the id
  // (wrongAccount) is skipped too; any other error is thrown. null when no account answered.
  // `keys` (readStripeKeys) skips the settings reads and adds the sweep's client options.
  async function inOrderAccounts(order, keys, ask) {
    const testMode = keys ? keys.testMode : await shopTestMode();
    for (const mode of modesToTry(order, testMode)) {
      const secret = keys ? keys.secrets[mode] : await stripeSecretFor(mode);
      if (!secret) continue;
      const stripe = keys ? new Stripe(secret, keys.clientOptions) : new Stripe(secret);
      try {
        return await ask(stripe, mode);
      } catch (err) {
        if (wrongAccount(err)) continue;
        throw err;
      }
    }
    return null;
  }

  // Asks Stripe (test and live accounts, the order's own mode first) for one of the
  // order's saved payments. Returns { intent | session, mode } or null when no account knows it.
  // Only a payment whose metadata/client_reference_id names this order counts.
  async function retrieveOrderPayment(orderId, order, { paymentIntentId, sessionId } = {}, keys = null) {
    return inOrderAccounts(order, keys, async (stripe, mode) => {
      if (paymentIntentId) {
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (intent.metadata?.order_id !== orderId) return null;
        return { intent, mode };
      }
      if (sessionId) {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.client_reference_id !== orderId) return null;
        return { session, mode };
      }
      return null;
    });
  }

  // Reads what Stripe says happened to a paid order's charge after payment (refunds, a dispute) and hands it to
  // `apply({ charge, dispute, listRefunds })`, whose answer is returned. listRefunds() asks Stripe for the payment's
  // refunds (up to 10) only when the caller needs them. null when the order has no PaymentIntent, the intent names
  // another order, or it has no charge. An error inside `apply` is handled like Stripe's own (inOrderAccounts).
  async function checkReversal(orderId, order, { keys = null } = {}, apply) {
    const pi = String(order.stripePaymentIntentId || "");
    if (!pi.startsWith("pi_")) return null;
    return inOrderAccounts(order, keys, async stripe => {
      const intent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] });
      if (intent.metadata?.order_id !== orderId) return null;
      const charge = intent.latest_charge && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
      if (!charge) return null;
      let dispute = null;
      if (charge.disputed) {
        const list = await stripe.disputes.list({ payment_intent: pi, limit: 1 });
        dispute = list.data[0] || null;
      }
      const listRefunds = async () => {
        const refunds = await stripe.refunds.list({ payment_intent: pi, limit: 10 });
        return refunds?.data || [];
      };
      return apply({ charge, dispute, listRefunds });
    });
  }

  // Refunds a Stripe payment in the order's own mode and account. `onCalling` runs once the client is ready, just
  // before Stripe is asked (the caller then knows a refund may have been taken). Throws when Stripe answers with
  // anything but succeeded/pending. Returns { refundId, amountMinor, currency, status }.
  async function refundPayment({ mode, accountId = null, paymentIntentId, amountMinor = null, metadata, idempotencyKey, onCalling = () => {} }) {
    const { stripe, requestOptions } = await getStripeClientForMode(mode === "test" ? "test" : "live", accountId);
    onCalling();
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(amountMinor != null ? { amount: amountMinor } : {}),
      reason: "requested_by_customer",
      metadata,
    }, { ...requestOptions, idempotencyKey });
    if (!["succeeded", "pending"].includes(refund.status)) {
      throw new Error(`Stripe refund was not accepted (status: ${refund.status}).`);
    }
    return { refundId: refund.id, amountMinor: refund.amount, currency: refund.currency, status: refund.status };
  }

  // The webhook's client: the shop's key for its current mode, else the deployed secret. Reading the deployed secret
  // can throw (not set); a failed settings read falls back to it with a warning.
  async function webhookClient() {
    let stripeSecret = liveSecretKey.value();
    try {
      const settingsDoc = await db.collection("settings").doc("website").get();
      if (settingsDoc.exists) {
        const settings = settingsDoc.data() || {};
        const testMode = settings.payments?.testMode || false;
        const stripeSettings = await withPrivateStripeKeys(settings.payments?.stripe);
        if (testMode && stripeSettings.testSecretKey) {
          stripeSecret = stripeSettings.testSecretKey;
        } else if (!testMode && stripeSettings.secretKey) {
          stripeSecret = stripeSettings.secretKey;
        }
      }
    } catch (dbErr) {
      console.warn("Failed to load settings in webhook, falling back to env secret key:", dbErr);
    }
    return new Stripe(stripeSecret);
  }

  // Checks a webhook delivery's signature against each signing secret in turn. { event } for the first that
  // verifies, else { event: null, lastError } (lastError null when there were no secrets to try).
  function verifyWebhookEvent(stripe, rawBody, signature, secrets) {
    let lastError = null;
    for (const secret of secrets) {
      try {
        return { event: stripe.webhooks.constructEvent(rawBody, signature, secret), lastError: null };
      } catch (err) {
        lastError = err;
      }
    }
    return { event: null, lastError };
  }

  // ── Checkout (plan 1.12) ──────────────────────────────────────────────────────────────────────────────────────

  // The card payment side of one checkout, for the shop's current mode. `settings` is settings/website as the checkout
  // already read it. Throws (with the shopper-safe messages checkout always used) when that mode has no key.
  async function forCheckout(settings) {
    const testMode = settings.payments?.testMode || false;
    const stripeSettings = await withPrivateStripeKeys(settings.payments?.stripe);
    const stripeSecret = testMode
      ? stripeSettings.testSecretKey
      : (stripeSettings.secretKey || liveSecretKey.value());

    if (!stripeSecret) {
      throw new Error(testMode
        ? "Stripe Test Secret Key is not configured in settings."
        : "Stripe Secret Key is not configured.");
    }

    const stripe = new Stripe(stripeSecret);
    return {
      // An earlier card payment on the same order: "in_progress" when it took (or may be taking) the money, else
      // "cleared" (cancelled here, or by a simultaneous request first). Throws when unsure whether it is still live.
      async settlePreviousIntent(intentId) {
        const previous = await stripe.paymentIntents.retrieve(intentId);
        if (["succeeded", "processing", "requires_capture"].includes(previous.status)) return "in_progress";
        if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(previous.status)) {
          try {
            await stripe.paymentIntents.cancel(previous.id);
          } catch (cancelErr) {
            // A simultaneous request may have cancelled it first; only a still-live intent blocks a new one.
            const again = await stripe.paymentIntents.retrieve(previous.id);
            if (again.status !== "canceled") throw cancelErr;
          }
        }
        return "cleared";
      },
      // The PaymentIntent for the card form on the checkout page, for exactly the server-priced amount.
      createCardIntent({ amount, currency, orderId, idempotencyKey }) {
        return stripe.paymentIntents.create({
          amount,
          currency,
          automatic_payment_methods: { enabled: true },
          // No receipt_email: the shop's own "Order confirmed" email is the customer's
          // one confirmation (Stripe's receipt duplicated it).
          description: `Order ${orderId}`,
          metadata: { order_id: orderId, checkout: "payment_element" },
        }, { idempotencyKey });
      },
      // A Stripe Checkout Session (hosted or embedded) with the caller's server-priced parameters.
      createCheckoutSession(params, { idempotencyKey }) {
        return stripe.checkout.sessions.create(params, { idempotencyKey });
      },
    };
  }

  // ── Admin: key test, webhook setup, wallet domains (plan 1.12) ─────────────────────────────────────────────────

  // The deployed live key, or "" when it isn't set (never throws).
  function deployedLiveKey() {
    try { return liveSecretKey.value() || ""; } catch { return ""; }
  }

  // Does this secret key work, and for which account? Restricted keys may not read the account: a balance read
  // still proves the key works. { ok: true, accountId, accountName?, chargesEnabled? } or { ok: false, error }.
  async function checkKey(key) {
    try {
      const account = await new Stripe(key).accounts.retrieve();
      return { ok: true, accountId: account.id, accountName: account.settings?.dashboard?.display_name || account.business_profile?.name || null, chargesEnabled: account.charges_enabled !== false };
    } catch (err) {
      try { await new Stripe(key).balance.retrieve(); return { ok: true, accountId: null }; }
      catch (err2) { return { ok: false, error: err2?.message || err?.message || "Stripe rejected the key." }; }
    }
  }

  // The webhook endpoints of the account for the shop's current mode: { mode, endpoints } where endpoints is null when
  // that mode has no key. endpoints.list/remove/create/update are Stripe's webhookEndpoints calls.
  async function webhookEndpoints() {
    const testMode = await shopTestMode();
    const mode = testMode ? "test" : "live";
    const secret = await stripeSecretFor(mode);
    if (!secret) return { mode, endpoints: null };
    const stripe = new Stripe(secret);
    return {
      mode,
      endpoints: {
        list: () => stripe.webhookEndpoints.list({ limit: 100 }),
        remove: id => stripe.webhookEndpoints.del(id),
        create: params => stripe.webhookEndpoints.create(params),
        update: (id, changes) => stripe.webhookEndpoints.update(id, changes),
      },
    };
  }

  // Registers (or re-validates) a storefront domain for Apple Pay / Google Pay in the current mode's account.
  // Throws "Stripe is not configured." when that mode has no key. Returns Stripe's payment method domain.
  async function registerPaymentDomain(domainName) {
    const settingsDoc = await db.collection("settings").doc("website").get();
    const settings = settingsDoc.exists ? settingsDoc.data() : {};
    const testMode = settings.payments?.testMode || false;
    const stripeSettings = await withPrivateStripeKeys(settings.payments?.stripe);
    const stripeSecret = testMode
      ? stripeSettings.testSecretKey
      : (stripeSettings.secretKey || liveSecretKey.value());
    if (!stripeSecret) throw new Error("Stripe is not configured.");
    const stripe = new Stripe(stripeSecret);
    const existing = await stripe.paymentMethodDomains.list({ domain_name: domainName, limit: 1 });
    const domain = existing.data[0];
    if (!domain) return stripe.paymentMethodDomains.create({ domain_name: domainName, enabled: true });
    return stripe.paymentMethodDomains.validate(domain.id);
  }

  // ── An unpaid order's payment attempt (cancel an unpaid order, a shopper's retry) ─────────────────────────────

  // Reads the attempt's PaymentIntent and/or Checkout Session with a clientForMode account, writing each into
  // `found` as it arrives: when the second read throws, the caller still has the first.
  async function readAttempt(account, { intentId = "", sessionId = "" }, found = {}) {
    const { stripe, requestOptions } = account;
    if (intentId.startsWith("pi_")) found.intent = await stripe.paymentIntents.retrieve(intentId, {}, requestOptions);
    if (sessionId.startsWith("cs_")) found.session = await stripe.checkout.sessions.retrieve(sessionId, {}, requestOptions);
    return found;
  }

  // Best effort: stops an attempt the shopper may still finish (an open Checkout Session expires, an unfinished
  // PaymentIntent is cancelled). A refusal is ignored. Returns what was stopped: "checkout", "card".
  async function stopAttempt(account, { intent = null, session = null }) {
    const { stripe, requestOptions } = account;
    const stopped = [];
    if (session && session.status === "open") {
      await stripe.checkout.sessions.expire(session.id, {}, requestOptions).then(() => stopped.push("checkout")).catch(() => {});
    }
    if (intent && ["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)) {
      await stripe.paymentIntents.cancel(intent.id, {}, requestOptions).then(() => stopped.push("card")).catch(() => {});
    }
    return stopped;
  }

  return {
    id: "stripe",
    // The provider interface (payments/index.js), under its provider-neutral names.
    testMode: shopTestMode, readKeys: readStripeKeys, clientForMode: getStripeClientForMode,
    findOrderPayment: retrieveOrderPayment, readAttempt, stopAttempt, checkReversal, refund: refundPayment,
    webhookClient, verifyWebhookEvent, forCheckout, deployedLiveKey, checkKey, webhookEndpoints, registerPaymentDomain,
    // Stripe-only helpers, for this provider's own tests.
    withPrivateStripeKeys, stripeSecretFor, inOrderAccounts,
  };
}

module.exports = { createStripeProvider, wrongAccount };
