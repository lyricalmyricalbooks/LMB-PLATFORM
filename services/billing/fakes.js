// In-memory stand-ins for billing's tests: its stores, and a pretend Stripe Billing behind `fetch` (products, prices,
// customers, subscriptions with trials that pause without a card, setup-mode Checkout, cards, invoices with PDFs, plan
// change previews and Stripe Tax's switches). Nothing reaches Stripe.
import { formPairs } from "../payments/fakes.js";

export function fakeBillingStores() {
  const customers = new Map();
  const subs = new Map();
  const seen = new Map();
  return {
    customers: { rows: customers, get: async (id) => (customers.has(id) ? { ...customers.get(id) } : null), set: async (id, row) => void customers.set(id, { ...row }) },
    subscriptions: {
      rows: subs,
      get: async (shopId) => (subs.has(shopId) ? structuredClone(subs.get(shopId)) : null),
      set: async (shopId, row) => void subs.set(shopId, structuredClone(row)),
      findBySubscriptionId: async (id) => structuredClone([...subs.values()].find((row) => row.subscriptionId === id) ?? null),
      list: async () => structuredClone([...subs.values()]),
    },
    events: { rows: seen, seen: async (id) => seen.has(id), mark: async (id, entry) => void seen.set(id, { ...entry }) },
  };
}

/** Records platform emails instead of sending them; one per idempotency key, like the real service. */
export function fakePlatformEmail() {
  const sent = new Map();
  return { sent, list: () => [...sent.values()], sendPlatform: async (message) => void (sent.has(message.idempotencyKey) || sent.set(message.idempotencyKey, structuredClone(message))) };
}

/**
 * A pretend Stripe for billing. `world` holds what exists; `requests` every call. A repeated idempotency key gets the
 * first answer back. `clock()` is the pretend time in seconds.
 */
export function fakeBillingStripe({ clock = () => 1_800_000_000 } = {}) {
  const requests = [];
  const byKey = new Map();
  let next = 1;
  const world = { products: new Map(), prices: new Map(), customers: new Map(), subscriptions: new Map(), sessions: new Map(), setupIntents: new Map(), invoices: new Map(), paymentMethods: new Map() };
  const MONTH = 30 * 86400;
  const missing = (what) => ({ status: 404, body: { error: { type: "invalid_request_error", code: "resource_missing", message: `No such ${what}` } } });
  const ok = (body) => ({ status: 200, body: structuredClone(body) });
  const subBody = (sub) => ({ ...sub, items: { data: [{ id: sub.itemId, price: { id: sub.price }, current_period_end: sub.periodEnd }] } });

  function answer(method, path, p) {
    let m;
    if (method === "GET" && path === "/v1/prices") {
      const keys = p["lookup_keys[]"] ?? [];
      return ok({ object: "list", data: [...world.prices.values()].filter((price) => keys.includes(price.lookup_key) && price.active) });
    }
    if ((m = path.match(/^\/v1\/products\/([\w-]+)$/)) && method === "GET") return world.products.has(m[1]) ? ok(world.products.get(m[1])) : missing("product");
    if (method === "POST" && path === "/v1/products") {
      if (world.products.has(p.id)) return { status: 400, body: { error: { type: "invalid_request_error", code: "resource_already_exists", message: "exists" } } };
      world.products.set(p.id, { id: p.id, name: p.name });
      return ok(world.products.get(p.id));
    }
    if (method === "POST" && path === "/v1/prices") {
      const price = { id: `price_${next++}`, product: p.product, unit_amount: Number(p.unit_amount), currency: p.currency, lookup_key: p.lookup_key, active: true, interval: p["recurring[interval]"], tax_behavior: p.tax_behavior ?? "unspecified" };
      world.prices.set(price.id, price);
      return ok(price);
    }
    if ((m = path.match(/^\/v1\/prices\/(price_\w+)$/)) && method === "POST") {
      const price = world.prices.get(m[1]);
      if (!price) return missing("price");
      if (p.tax_behavior) {
        if (price.tax_behavior !== "unspecified") return { status: 400, body: { error: { type: "invalid_request_error", message: "tax_behavior can only be set once" } } };
        price.tax_behavior = p.tax_behavior;
      }
      return ok(price);
    }
    if (method === "POST" && path === "/v1/customers") {
      const customer = { id: `cus_${next++}`, email: p.email, metadata: { lmb_account_id: p["metadata[lmb_account_id]"] } };
      world.customers.set(customer.id, customer);
      return ok(customer);
    }
    if ((m = path.match(/^\/v1\/customers\/(cus_\w+)$/)) && method === "POST") {
      const customer = world.customers.get(m[1]);
      if (!customer) return missing("customer");
      customer.defaultCard = p["invoice_settings[default_payment_method]"];
      if (p["address[country]"]) customer.address = { country: p["address[country]"], postal_code: p["address[postal_code]"] ?? null };
      return ok(customer);
    }
    if (method === "POST" && path === "/v1/subscriptions") {
      if (!world.customers.has(p.customer)) return missing("customer");
      // A trial by days, or until a set time (`trial_end`, as a later monthly plan starts: paymentWay.js).
      const trialEndAt = p.trial_end ? Number(p.trial_end) : null;
      const trialDays = trialEndAt ? Math.max(1, Math.ceil((trialEndAt - clock()) / 86400)) : Number(p.trial_period_days ?? 0);
      const id = `sub_${next++}`;
      const sub = {
        id, object: "subscription", customer: p.customer, price: p["items[0][price]"], itemId: `si_${next++}`,
        status: trialDays ? "trialing" : "incomplete", trial_end: trialEndAt ?? (trialDays ? clock() + trialDays * 86400 : null),
        periodEnd: trialEndAt ?? clock() + (trialDays || 30) * 86400, cancel_at_period_end: false, default_payment_method: null,
        metadata: { lmb_shop_id: p["metadata[lmb_shop_id]"], lmb_plan: p["metadata[lmb_plan]"], lmb_account_id: p["metadata[lmb_account_id]"] },
        missingCard: p["trial_settings[end_behavior][missing_payment_method]"] ?? null,
        latest_invoice: null,
      };
      if (!trialDays) {
        const invoice = { id: `in_${next++}`, status: "open", subscription: id };
        world.invoices.set(invoice.id, invoice);
        sub.latest_invoice = invoice.id;
      }
      world.subscriptions.set(id, sub);
      return ok(subBody(sub));
    }
    if ((m = path.match(/^\/v1\/subscriptions\/(sub_\w+)(\/resume)?$/))) {
      const sub = world.subscriptions.get(m[1]);
      if (!sub) return missing("subscription");
      if (method === "DELETE" && !m[2]) {
        sub.status = "canceled";
        return ok(subBody(sub));
      }
      if (method === "POST" && m[2]) {
        if (sub.status !== "paused") return { status: 400, body: { error: { type: "invalid_request_error", message: "not paused" } } };
        sub.status = "active";
        sub.periodEnd = clock() + 30 * 86400;
      } else if (method === "POST") {
        if ("cancel_at_period_end" in p) sub.cancel_at_period_end = p.cancel_at_period_end === "true";
        if (p.default_payment_method) sub.default_payment_method = p.default_payment_method;
        if (p["items[0][price]"]) {
          if (p["items[0][id]"] !== sub.itemId) return { status: 400, body: { error: { type: "invalid_request_error", message: "wrong item" } } };
          sub.price = p["items[0][price]"];
        }
        if (p["metadata[lmb_plan]"]) sub.metadata.lmb_plan = p["metadata[lmb_plan]"];
        if (p["automatic_tax[enabled]"]) {
          // Like Stripe: Stripe Tax needs to know where the customer is.
          if (!world.customers.get(sub.customer)?.address?.country) return { status: 400, body: { error: { type: "invalid_request_error", code: "customer_tax_location_invalid", message: "no address" } } };
          sub.automatic_tax = { enabled: p["automatic_tax[enabled]"] === "true" };
        }
      }
      return ok(subBody(sub));
    }
    if (method === "POST" && path === "/v1/checkout/sessions") {
      const id = `cs_test_${next++}`;
      const intent = { id: `seti_${next++}`, payment_method: null };
      world.setupIntents.set(intent.id, intent);
      const session = { id, object: "checkout.session", mode: p.mode, customer: p.customer, url: `https://checkout.stripe.example/${id}`, setup_intent: intent.id, metadata: { lmb_shop_id: p["metadata[lmb_shop_id]"] }, success_url: p.success_url, currency: p.currency };
      world.sessions.set(id, session);
      return ok(session);
    }
    if ((m = path.match(/^\/v1\/setup_intents\/(seti_\w+)$/))) return world.setupIntents.has(m[1]) ? ok(world.setupIntents.get(m[1])) : missing("setup_intent");
    if ((m = path.match(/^\/v1\/payment_methods\/(pm_\w+)$/)) && method === "GET") {
      return ok(world.paymentMethods.get(m[1]) ?? { id: m[1], type: "card", card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 }, billing_details: { address: { country: "CA", postal_code: "M5V 2T6" } } });
    }
    if (method === "GET" && path === "/v1/invoices") {
      const list = [...world.invoices.values()].filter((invoice) => invoice.subscription === p.subscription).sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
      return ok({ object: "list", data: list.slice(0, Number(p.limit ?? 10)) });
    }
    if (method === "POST" && path === "/v1/invoices/create_preview") {
      // The prorated part of a move: the rest of the month at the new price, less the rest at the old one.
      const sub = world.subscriptions.get(p.subscription);
      if (!sub) return missing("subscription");
      const from = world.prices.get(sub.price);
      const to = world.prices.get(p["subscription_details[items][0][price]"]);
      if (!from || !to) return missing("price");
      const left = Math.max(0, sub.periodEnd - Number(p["subscription_details[proration_date]"] ?? clock())) / MONTH;
      const lines = [
        { amount: -Math.round(from.unit_amount * left), proration: true },
        { amount: Math.round(to.unit_amount * left), proration: true },
        { amount: to.unit_amount, proration: false },
      ];
      return ok({ object: "invoice", currency: to.currency, lines: { data: lines }, amount_due: lines.reduce((sum, line) => sum + line.amount, 0) });
    }
    if ((m = path.match(/^\/v1\/invoices\/(in_\w+)\/pay$/))) {
      const invoice = world.invoices.get(m[1]);
      if (!invoice) return missing("invoice");
      invoice.status = "paid";
      world.subscriptions.get(invoice.subscription).status = "active";
      return ok(invoice);
    }
    return { status: 404, body: { error: { type: "invalid_request_error", message: `Unrecognized request URL (${method} ${path})` } } };
  }

  const fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method ?? "GET";
    const params = formPairs(method === "GET" ? parsed.search.slice(1) : init.body);
    const headers = { ...(init.headers ?? {}) };
    requests.push({ method, path: parsed.pathname, headers, params });
    const key = headers["Idempotency-Key"];
    let result;
    if (key && byKey.has(key)) result = byKey.get(key);
    else {
      result = answer(method, parsed.pathname, params);
      if (key) byKey.set(key, result);
    }
    return { ok: result.status < 300, status: result.status, json: async () => structuredClone(result.body) };
  };

  /** Pretend time passes: a trial with no card ends and pauses; one with a card becomes active. */
  const endTrial = (id) => {
    const sub = world.subscriptions.get(id);
    sub.status = sub.default_payment_method ? "active" : sub.missingCard === "pause" ? "paused" : "active";
    return subBody(sub);
  };
  /** The customer finished the Checkout page and gave a card. */
  const completeSetup = (sessionId, card = "pm_card_visa") => {
    const session = world.sessions.get(sessionId);
    world.setupIntents.get(session.setup_intent).payment_method = card;
    return structuredClone(session);
  };
  const subscription = (id) => subBody(world.subscriptions.get(id));
  /** A month is paid: the trial (if any) is over and the subscription is active for the next 30 days. */
  const payMonth = (id) => {
    const sub = world.subscriptions.get(id);
    sub.status = "active";
    sub.trial_end = null;
    sub.periodEnd = clock() + MONTH;
    return subBody(sub);
  };
  /** An invoice Stripe made for a subscription, with its PDF and page. */
  const addInvoice = (subscriptionId, fields = {}) => {
    const id = `in_${next++}`;
    const invoice = {
      id, object: "invoice", subscription: subscriptionId, number: `COL-${String(next).padStart(4, "0")}`, status: "paid", currency: "cad", total: 3900, tax: 0, created: clock(),
      invoice_pdf: `https://pay.stripe.example/invoice/${id}/pdf`, hosted_invoice_url: `https://invoice.stripe.example/${id}`, ...fields,
    };
    world.invoices.set(id, invoice);
    return invoice;
  };
  return { fetch, requests, world, endTrial, completeSetup, subscription, payMonth, addInvoice };
}
