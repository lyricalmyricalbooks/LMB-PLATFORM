// The shop's one door to Stripe (code plan 1.11). Everything that makes a Stripe client with the shop's own key goes
// through here: which key a mode uses, payment lookups, refunds, the refund/dispute (reversal) check and the webhook's
// client. Callers keep the order bookkeeping (what a lookup or refund means for an order); this module only talks to
// Stripe. Phase 2 adds the platform mode here (plan 2.2) without touching the callers.
//
// Nothing here loads the Stripe package itself: index.js passes in its lazy `Stripe` constructor, so functions that
// never pay start fast and the vm-based handler tests' fake Stripe still applies. Behaviour is the code that used to
// live in index.js, moved as is (payments/payments.test.js pins it with a fake Stripe).

const { modesToTry } = require("../stripeRecovery");

// An id this Stripe account doesn't know (or a key it refuses): the other account may know it.
function wrongAccount(err) {
  return err?.code === "resource_missing" || err?.statusCode === 404 || err?.type === "StripeAuthenticationError";
}

/**
 * @param {object} deps
 * @param {object} deps.db Firestore (settings/website, adminSecrets/stripe)
 * @param {Function} deps.Stripe constructor: `new Stripe(secret[, options])`
 * @param {{ value: () => string }} deps.liveSecretKey the deployed STRIPE_SECRET_KEY secret (live fallback)
 * @param {(id: string) => Promise<object>} deps.readAdminSecret reads adminSecrets/<id>, {} when missing or unreadable
 */
function createPayments({ db, Stripe, liveSecretKey, readAdminSecret }) {
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

  return {
    withPrivateStripeKeys, getStripeClientForMode, stripeSecretFor, shopTestMode, readStripeKeys,
    inOrderAccounts, retrieveOrderPayment, checkReversal, refundPayment, webhookClient, verifyWebhookEvent,
  };
}

module.exports = { createPayments, wrongAccount };
