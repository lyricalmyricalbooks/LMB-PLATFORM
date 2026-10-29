// The demo's practice card service: a stand-in for Stripe, on this computer only, so a shopper can pay at checkout and
// the shop's own server code (apps/shop/functions) runs every step after it as it would live: the order is paid, stock
// moves, the emails go out (to the practice inbox, practiceMail.js) and the admin can refund it.
//
// Two sides:
// - The shop's server code talks to it as if it were Stripe's API (index.js sends every Stripe call here when the
//   emulators run with DEMO_STRIPE_URL). Only what the shop asks for is answered; anything else is "not found".
// - The checkout page uses a practice card form (practiceStripeScript below, given to the page in its shop profile)
//   in place of Stripe's own. Paying sends the card here; a good card succeeds and the service tells the shop through
//   its webhook, signed with the practice signing secret, exactly as Stripe would.
//
// No real card is read or kept: only the last four digits of the practice card are remembered.
import { createHmac, randomBytes } from "node:crypto";

export const PRACTICE_KEYS = Object.freeze({
  // The shop checks a key's shape (pk_test_ and at least 24 letters or digits), so these look like Stripe's.
  secret: "sk_test_PracticeWalkthroughOnly000000000000",
  publishable: "pk_test_PracticeWalkthroughOnly000000000000",
  webhookSecret: "whsec_PracticeWalkthroughOnly0000000000",
});

/** Card numbers the practice form knows: the good one, and one that is always declined. */
export const PRACTICE_CARDS = Object.freeze({ good: "4242 4242 4242 4242", declined: "4000 0000 0000 0002" });

const id = (prefix) => `${prefix}_${randomBytes(12).toString("hex")}`;
const now = () => Math.floor(Date.now() / 1000);

/** Reads a form-encoded body the way Stripe's library sends it (`metadata[order_id]=…`, `expand[0]=…`) into objects. */
export function parseForm(text) {
  const out = {};
  for (const [rawKey, value] of new URLSearchParams(text)) {
    const parts = rawKey.replace(/\]/g, "").split("[");
    let at = out;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) at[part] = value;
      else at = at[part] ??= {};
    });
  }
  return out;
}

const list = (data, url) => ({ object: "list", data, has_more: false, url });
const notFound = (what) => ({ status: 404, body: { error: { type: "invalid_request_error", code: "resource_missing", message: `No such ${what}` } } });
const ok = (body) => ({ status: 200, body });

/** Stripe's webhook signature header for `payload`. */
export function signWebhook(payload, secret, time = now()) {
  const signature = createHmac("sha256", secret).update(`${time}.${payload}`).digest("hex");
  return `t=${time},v1=${signature}`;
}

/**
 * The practice Stripe: `{ api(method, path, query, body), confirm(body), state }`. `webhookUrl` is the shop's
 * stripeWebhook; `fetch` delivers to it. Kept in memory: a restart forgets payments, but paid orders stay paid.
 */
export function createPracticeStripe({ webhookUrl, fetch = globalThis.fetch, log = () => {} } = {}) {
  const intents = new Map();
  const charges = new Map();
  const refunds = new Map();
  const events = new Map();
  const balance = new Map();

  const expandIntent = (intent, expand = []) => {
    const wanted = Object.values(expand ?? {});
    const copy = { ...intent };
    if (intent.latest_charge && wanted.some((e) => String(e).startsWith("latest_charge"))) {
      const charge = { ...charges.get(intent.latest_charge) };
      if (wanted.includes("latest_charge.balance_transaction")) charge.balance_transaction = balance.get(charge.balance_transaction) ?? charge.balance_transaction;
      copy.latest_charge = charge;
    }
    return copy;
  };

  async function sendEvent(type, object) {
    const event = { id: id("evt"), object: "event", api_version: "2025-01-01", created: now(), livemode: false, type, data: { object }, pending_webhooks: 1 };
    events.set(event.id, event);
    if (!webhookUrl) return event;
    const payload = JSON.stringify(event);
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Stripe-Signature": signWebhook(payload, PRACTICE_KEYS.webhookSecret) },
        body: payload,
      });
      log(`practice card: told the shop ${type} (${response.status})`);
    } catch (error) {
      log(`practice card: the shop didn't answer ${type} (${error?.message ?? error})`);
    }
    return event;
  }

  function api(method, path, query = {}, body = {}) {
    const parts = path.replace(/^\/v1\//, "").split("/").filter(Boolean);
    const [kind, one, action] = parts;

    if (kind === "payment_intents") {
      if (method === "POST" && !one) {
        const intent = {
          id: id("pi"), object: "payment_intent", amount: Number(body.amount), amount_received: 0, currency: body.currency,
          status: "requires_payment_method", description: body.description ?? null, metadata: body.metadata ?? {},
          created: now(), livemode: false, latest_charge: null, payment_method: null,
        };
        intent.client_secret = `${intent.id}_secret_${randomBytes(8).toString("hex")}`;
        intents.set(intent.id, intent);
        return ok(intent);
      }
      const intent = intents.get(one);
      if (!intent) return notFound(`payment_intent: '${one}'`);
      if (method === "GET") return ok(expandIntent(intent, query.expand));
      if (method === "POST" && action === "cancel") {
        if (intent.status === "succeeded") return { status: 400, body: { error: { type: "invalid_request_error", code: "payment_intent_unexpected_state", message: "This PaymentIntent has already succeeded." } } };
        intent.status = "canceled";
        return ok(intent);
      }
      if (method === "POST") {
        if (body.metadata) intent.metadata = { ...intent.metadata, ...body.metadata };
        if (body.amount) intent.amount = Number(body.amount);
        return ok(intent);
      }
    }

    if (kind === "charges" && method === "GET") return charges.has(one) ? ok(charges.get(one)) : notFound(`charge: '${one}'`);

    if (kind === "balance_transactions" && method === "GET") {
      if (one) return balance.has(one) ? ok(balance.get(one)) : notFound(`balance_transaction: '${one}'`);
      return ok(list([...balance.values()], "/v1/balance_transactions"));
    }

    if (kind === "refunds") {
      if (method === "POST" && !one) {
        const intent = intents.get(body.payment_intent) ?? [...intents.values()].find((pi) => pi.latest_charge === body.charge);
        if (!intent || intent.status !== "succeeded") return notFound(`payment_intent: '${body.payment_intent ?? body.charge}'`);
        const already = [...refunds.values()].filter((r) => r.payment_intent === intent.id).reduce((sum, r) => sum + r.amount, 0);
        const amount = body.amount ? Number(body.amount) : intent.amount_received - already;
        if (amount <= 0 || already + amount > intent.amount_received) return { status: 400, body: { error: { type: "invalid_request_error", code: "charge_already_refunded", message: "This payment has already been refunded." } } };
        const refund = { id: id("re"), object: "refund", amount, currency: intent.currency, payment_intent: intent.id, charge: intent.latest_charge, status: "succeeded", reason: body.reason ?? null, metadata: body.metadata ?? {}, created: now() };
        refunds.set(refund.id, refund);
        const charge = charges.get(intent.latest_charge);
        if (charge) Object.assign(charge, { amount_refunded: already + amount, refunded: already + amount >= charge.amount });
        return ok(refund);
      }
      if (method === "GET" && one) return refunds.has(one) ? ok(refunds.get(one)) : notFound(`refund: '${one}'`);
      if (method === "GET") return ok(list([...refunds.values()].filter((r) => !query.payment_intent || r.payment_intent === query.payment_intent), "/v1/refunds"));
    }

    if (kind === "events" && method === "GET") return events.has(one) ? ok(events.get(one)) : notFound(`event: '${one}'`);
    if (kind === "account" && method === "GET") return ok({ id: "acct_practice", object: "account", charges_enabled: true, payouts_enabled: true, country: "CA", default_currency: "cad", settings: { dashboard: { display_name: "Practice payments" } } });
    if (kind === "balance" && method === "GET") return ok({ object: "balance", available: [{ amount: 0, currency: "cad" }], pending: [{ amount: 0, currency: "cad" }], livemode: false });
    if (kind === "webhook_endpoints") {
      const endpoint = { id: "we_practice", object: "webhook_endpoint", url: webhookUrl, status: "enabled", enabled_events: ["*"], livemode: false };
      if (method === "GET") return ok(list([endpoint], "/v1/webhook_endpoints"));
      return ok({ ...endpoint, secret: PRACTICE_KEYS.webhookSecret });
    }
    if (kind === "payment_method_domains") return ok(method === "GET" && !one ? list([], "/v1/payment_method_domains") : { id: "pmd_practice", object: "payment_method_domain", domain_name: body.domain_name ?? "127.0.0.1", enabled: true });
    if (kind === "disputes" && method === "GET") return ok(list([], "/v1/disputes"));
    if (kind === "payouts" && method === "GET") return ok(list([], "/v1/payouts"));
    return notFound(`${method} ${path}`);
  }

  /** The checkout page's Pay: `{ client_secret, card, name }` → `{ paymentIntent }` or `{ error }`, like confirmPayment. */
  async function confirm({ client_secret: secret, card = "" } = {}) {
    const intentId = String(secret ?? "").split("_secret_")[0];
    const intent = intents.get(intentId);
    if (!intent || intent.client_secret !== secret) return { error: { type: "invalid_request_error", message: "This payment can't be found. Go back to the bag and try again." } };
    if (intent.status === "succeeded") return { paymentIntent: { id: intent.id, status: intent.status } };
    if (intent.status === "canceled") return { error: { type: "invalid_request_error", message: "This payment was cancelled. Go back to the bag and try again." } };
    const digits = String(card).replace(/\D/g, "");
    if (digits === PRACTICE_CARDS.declined.replace(/\D/g, "")) {
      await sendEvent("payment_intent.payment_failed", { ...intent, last_payment_error: { message: "Your card was declined." } });
      return { error: { type: "card_error", code: "card_declined", message: "Your card was declined. This is the practice card that is always declined: use 4242 4242 4242 4242." } };
    }
    if (digits.length < 12) return { error: { type: "validation_error", message: "Enter the practice card number: 4242 4242 4242 4242." } };
    const fee = Math.round(intent.amount * 0.029) + 30;
    const txn = { id: id("txn"), object: "balance_transaction", amount: intent.amount, fee, net: intent.amount - fee, currency: intent.currency, created: now(), type: "charge", status: "pending", fee_details: [{ amount: fee, currency: intent.currency, type: "stripe_fee", description: "Practice card fee" }] };
    balance.set(txn.id, txn);
    const charge = { id: id("ch"), object: "charge", amount: intent.amount, amount_refunded: 0, refunded: false, currency: intent.currency, payment_intent: intent.id, balance_transaction: txn.id, paid: true, status: "succeeded", payment_method_details: { type: "card", card: { brand: "visa", last4: digits.slice(-4), exp_month: 12, exp_year: 2030 } }, created: now() };
    txn.source = charge.id;
    charges.set(charge.id, charge);
    Object.assign(intent, { status: "succeeded", amount_received: intent.amount, latest_charge: charge.id, payment_method: id("pm") });
    await sendEvent("payment_intent.succeeded", { ...intent });
    return { paymentIntent: { id: intent.id, status: intent.status } };
  }

  return { api, confirm, state: { intents, charges, refunds, events } };
}

/**
 * The practice card form, as a script the shop page runs before its own code (it is added to the shop profile while
 * the demo runs). It sets `window.Stripe`, which Stripe's own loader uses when present, so the shop's checkout code is
 * unchanged: it builds "Stripe's" payment fields and confirms the payment the way it does live. `serviceUrl` is the
 * practice service's address.
 */
export function practiceStripeScript(serviceUrl) {
  return `// Practice payments (LMB-PLATFORM demo/practicePay.js): a stand-in for Stripe's card form on this computer only.
(function () {
  var SERVICE = ${JSON.stringify(serviceUrl)};
  var GOOD = ${JSON.stringify(PRACTICE_CARDS.good)};
  function el(tag, attrs, text) { var n = document.createElement(tag); for (var k in attrs || {}) n.setAttribute(k, attrs[k]); if (text) n.textContent = text; return n; }
  function emitter() { var h = {}; return { on: function (n, f) { (h[n] = h[n] || []).push(f); return this; }, off: function () { return this; }, emit: function (n, e) { (h[n] || []).forEach(function (f) { try { f(e || {}); } catch (err) { console.error(err); } }); } }; }
  function paymentElement(store, vars) {
    var events = emitter(), root = null;
    var element = {
      on: events.on, off: events.off,
      mount: function (host) {
        if (typeof host === "string") host = document.querySelector(host);
        root = el("div", { "data-practice-card": "" });
        root.style.cssText = "display:grid;gap:12px;font:inherit;color:" + (vars.colorText || "inherit");
        var note = el("p", { role: "note" }, "Practice payment: no real card is charged. Use " + GOOD + ", any future date and any 3 digits.");
        note.style.cssText = "margin:0;padding:10px 12px;border:1px dashed " + (vars.colorPrimary || "currentColor") + ";font-size:14px;line-height:1.4";
        root.appendChild(note);
        var field = function (label, name, value, extra) {
          var wrap = el("label"); wrap.style.cssText = "display:grid;gap:6px;font-size:14px;font-weight:600;color:" + (vars.labelColorText || "inherit");
          wrap.appendChild(document.createTextNode(label));
          var input = el("input", Object.assign({ name: name, autocomplete: "off", inputmode: name === "card" || name === "cvc" ? "numeric" : "text", value: value }, extra || {}));
          input.style.cssText = "font:inherit;font-weight:400;font-size:16px;padding:10px 12px;border:1px solid " + (vars.inputColorBorder || "#777") + ";border-radius:" + (vars.borderRadius || "0") + ";background:" + (vars.colorBackground || "#fff") + ";color:" + (vars.colorText || "#111");
          input.addEventListener("input", function () { store.values[name] = input.value; });
          store.values[name] = value;
          wrap.appendChild(input);
          return wrap;
        };
        root.appendChild(field("Card number", "card", GOOD, { "aria-describedby": "practice-card-note" }));
        var row = el("div"); row.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:12px";
        row.appendChild(field("Expiry", "expiry", "12 / 30"));
        row.appendChild(field("Security code", "cvc", "123"));
        root.appendChild(row);
        host.appendChild(root);
        setTimeout(function () { events.emit("ready", {}); }, 0);
      },
      unmount: function () { if (root && root.parentNode) root.parentNode.removeChild(root); },
      destroy: function () { element.unmount(); },
      update: function () {},
      focus: function () {},
      blur: function () {},
      clear: function () {},
      collapse: function () {},
    };
    return element;
  }
  function expressElement() {
    var events = emitter();
    return { on: events.on, off: events.off, mount: function () { setTimeout(function () { events.emit("ready", { availablePaymentMethods: null }); }, 0); }, unmount: function () {}, destroy: function () {}, update: function () {} };
  }
  function Stripe() {
    var store = { values: {} };
    return {
      _registerWrapper: function () {},
      registerAppInfo: function () {},
      elements: function (options) {
        var vars = (options && options.appearance && options.appearance.variables) || {};
        return {
          create: function (type) { return type === "expressCheckout" ? expressElement() : paymentElement(store, vars); },
          getElement: function () { return null; },
          update: function () {},
          fetchUpdates: function () { return Promise.resolve({}); },
          submit: function () {
            var digits = String(store.values.card || "").replace(/\\D/g, "");
            return Promise.resolve(digits.length < 12 ? { error: { type: "validation_error", message: "Enter the practice card number: " + GOOD + "." } } : {});
          },
        };
      },
      confirmPayment: function (options) {
        return fetch(SERVICE + "/practice/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_secret: options.clientSecret, card: store.values.card }),
        }).then(function (r) { return r.json(); }).catch(function () {
          return { error: { type: "api_error", message: "The practice card service isn't running. Start the demo again." } };
        });
      },
      retrievePaymentIntent: function () { return Promise.resolve({ paymentIntent: null }); },
    };
  }
  Stripe.version = 3;
  window.Stripe = Stripe;
})();
`;
}
