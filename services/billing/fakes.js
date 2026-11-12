// In-memory stand-ins for billing's tests: its stores, and a pretend Stripe Billing behind `fetch` (products, prices,
// customers, subscriptions with trials that pause without a card, setup-mode Checkout, cards, invoices with PDFs, plan
// change previews and Stripe Tax's switches). Nothing reaches Stripe.
import { formPairs } from "../payments/fakes.js";
import { CLAIM_HOLD_MS } from "./eventClaims.js";

export function fakeBillingStores() {
  const customers = new Map();
  const subs = new Map();
  return {
    customers: { rows: customers, get: async (id) => (customers.has(id) ? { ...customers.get(id) } : null), set: async (id, row) => void customers.set(id, { ...row }) },
    subscriptions: {
      rows: subs,
      get: async (shopId) => (subs.has(shopId) ? structuredClone(subs.get(shopId)) : null),
      set: async (shopId, row) => void subs.set(shopId, structuredClone(row)),
      findBySubscriptionId: async (id) => structuredClone([...subs.values()].find((row) => row.subscriptionId === id) ?? null),
      list: async () => structuredClone([...subs.values()]),
    },
    events: fakeEventClaims(),
  };
}

/**
 * The billing events store (eventClaims.js), in memory, with real create-if-absent: `claim` checks and writes with
 * nothing awaited in between, so of two calls started together exactly one wins. `rows` holds claims
 * ({ state: "claimed", claimedAt }) and handled events ({ state: "done", ...entry }).
 */
export function fakeEventClaims() {
  const rows = new Map();
  return {
    rows,
    async claim(eventId, { at, holdMs = CLAIM_HOLD_MS } = {}) {
      const row = rows.get(eventId);
      if (row?.state === "done") return false;
      if (row && Date.parse(at) - Date.parse(row.claimedAt) < holdMs) return false;
      rows.set(eventId, { state: "claimed", claimedAt: at, ...(row ? { tookOverFrom: row.claimedAt } : {}) });
      return true;
    },
    async release(eventId) {
      if (rows.get(eventId)?.state === "claimed") rows.delete(eventId);
    },
    async mark(eventId, entry) {
      rows.set(eventId, { ...entry, state: "done" });
    },
    async seen(eventId) {
      return rows.get(eventId)?.state === "done";
    },
  };
}

/**
 * The founding places (founding.js), in memory: a claim checks and writes with nothing awaited in between, so of two
 * calls started together only one can take the last place. `rows` holds the shops given one.
 */
export function fakeFoundingSeats() {
  const rows = new Map();
  return {
    rows,
    async claim(shopId, { limit, at, percentOff }) {
      if (rows.has(shopId)) return true;
      if (rows.size >= limit) return false;
      rows.set(shopId, { shopId, at, percentOff });
      return true;
    },
    async release(shopId) {
      return rows.delete(shopId);
    },
    count: async () => rows.size,
  };
}

/** Records platform emails instead of sending them; one per idempotency key, like the real service. */
export function fakePlatformEmail() {
  const sent = new Map();
  return { sent, list: () => [...sent.values()], // Like the real one (services/email deliver): a repeated key sends nothing and says so.
    sendPlatform: async (message) => {
      if (sent.has(message.idempotencyKey)) return { alreadySent: true };
      sent.set(message.idempotencyKey, structuredClone(message));
      return { alreadySent: false };
    } };
}

/**
 * A pretend Stripe for billing. `world` holds what exists; `requests` every call. A repeated idempotency key gets the
 * first answer back. `clock()` is the pretend time in seconds.
 */
export function fakeBillingStripe({ clock = () => 1_800_000_000 } = {}) {
  const requests = [];
  const byKey = new Map();
  let next = 1;
  const world = { products: new Map(), prices: new Map(), customers: new Map(), subscriptions: new Map(), sessions: new Map(), setupIntents: new Map(), invoices: new Map(), paymentMethods: new Map(), coupons: new Map(), taxIds: new Map(), invoiceItems: new Map(), payFails: null, down: 0, failOnce: null };
  const MONTH = 30 * 86400;
  const missing = (what) => ({ status: 404, body: { error: { type: "invalid_request_error", code: "resource_missing", message: `No such ${what}` } } });
  const ok = (body) => ({ status: 200, body: structuredClone(body) });
  const subBody = (sub) => ({ ...sub, items: { data: [{ id: sub.itemId, price: { id: sub.price }, current_period_end: sub.periodEnd }] } });

  const cardBody = (id) => world.paymentMethods.get(id) ?? { id, type: "card", card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 }, billing_details: { address: { country: "CA", postal_code: "M5V 2T6" } } };
  /** A card saved on a customer (Stripe attaches the card a setup page collects). */
  /** The bill Stripe makes when a plan starts paying now: the price less the plan's coupon at that moment. */
  const billNow = (sub, status) => {
    const price = world.prices.get(sub.price)?.unit_amount ?? 0;
    const off = sub.coupon ? Math.round((price * (world.coupons.get(sub.coupon)?.percent_off ?? 0)) / 100) : 0;
    const invoice = { id: `in_${next++}`, object: "invoice", status, subscription: sub.id, currency: "cad", subtotal: price, total: price - off, amount_due: price - off };
    world.invoices.set(invoice.id, invoice);
    sub.latest_invoice = invoice.id;
    return invoice;
  };
  const attach = (customerId, id) => {
    const card = cardBody(id);
    world.paymentMethods.set(id, { ...card, customer: customerId });
  };

  function answer(method, path, p) {
    let m;
    // Stripe briefly busy: the next `world.down` calls are turned away with a 429, before anything is done, so nothing
    // is kept against their idempotency key (stripeRetry.js tries again). `world.downStatus` picks another status.
    if (world.down > 0) {
      world.down -= 1;
      return { status: world.downStatus ?? 429, turnedAway: true, body: { error: { type: "rate_limit_error", message: "Stripe is busy" } } };
    }
    if ((m = path.match(/^\/v1\/coupons\/([\w-]+)$/)) && method === "GET") return world.coupons.has(m[1]) ? ok(world.coupons.get(m[1])) : missing("coupon");
    if (method === "POST" && path === "/v1/coupons") {
      const coupon = { id: p.id, percent_off: Number(p.percent_off), duration: p.duration, name: p.name };
      world.coupons.set(coupon.id, coupon);
      return ok(coupon);
    }
    if ((m = path.match(/^\/v1\/customers\/(cus_\w+)$/)) && method === "GET") return world.customers.has(m[1]) ? ok(world.customers.get(m[1])) : missing("customer");
    if ((m = path.match(/^\/v1\/customers\/(cus_\w+)\/payment_methods$/)) && method === "GET") {
      return ok({ object: "list", data: [...world.paymentMethods.values()].filter((card) => card.customer === m[1]) });
    }
    if ((m = path.match(/^\/v1\/payment_methods\/(pm_\w+)\/detach$/)) && method === "POST") {
      const card = world.paymentMethods.get(m[1]);
      if (!card?.customer) return missing("payment_method");
      card.customer = null;
      return ok(card);
    }
    if ((m = path.match(/^\/v1\/customers\/(cus_\w+)\/tax_ids$/))) {
      if (method === "GET") return ok({ object: "list", data: [...world.taxIds.values()].filter((t) => t.customer === m[1]) });
      const taxId = { id: `txi_${next++}`, customer: m[1], type: p.type, value: p.value };
      world.taxIds.set(taxId.id, taxId);
      return ok(taxId);
    }
    if ((m = path.match(/^\/v1\/customers\/(cus_\w+)\/tax_ids\/(txi_\w+)$/)) && method === "DELETE") {
      world.taxIds.delete(m[2]);
      return ok({ id: m[2], deleted: true });
    }
    if (method === "GET" && path === "/v1/prices") {
      const keys = p["lookup_keys[]"] ?? [];
      return ok({ object: "list", data: [...world.prices.values()].filter((price) => keys.includes(price.lookup_key) && price.active) });
    }
    if ((m = path.match(/^\/v1\/products\/([\w-]+)$/)) && method === "GET") return world.products.has(m[1]) ? ok(world.products.get(m[1])) : missing("product");
    if ((m = path.match(/^\/v1\/products\/([\w-]+)$/)) && method === "POST") {
      if (!world.products.has(m[1])) return missing("product");
      if (p.name) world.products.get(m[1]).name = p.name;
      return ok(world.products.get(m[1]));
    }
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
      if (p["invoice_settings[default_payment_method]"]) {
        customer.defaultCard = p["invoice_settings[default_payment_method]"];
        if (!world.paymentMethods.get(customer.defaultCard)?.customer) attach(customer.id, customer.defaultCard);
      }
      if (p["address[country]"]) customer.address = { line1: p["address[line1]"] ?? null, line2: p["address[line2]"] ?? null, city: p["address[city]"] ?? null, state: p["address[state]"] ?? null, country: p["address[country]"], postal_code: p["address[postal_code]"] ?? null };
      if ("email" in p) customer.email = p.email;
      if ("name" in p) customer.name = p.name || null;
      if (p["preferred_locales[]"]) customer.preferred_locales = p["preferred_locales[]"];
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
        latest_invoice: null, coupon: null,
      };
      if (p["discounts[0][coupon]"]) {
        if (!world.coupons.has(p["discounts[0][coupon]"])) return missing("coupon");
        sub.coupon = p["discounts[0][coupon]"];
      }
      if (!trialDays) billNow(sub, "open");
      world.subscriptions.set(id, sub);
      return ok(subBody(sub));
    }
    // Cancel now (the closing sweep's endPlan).
    if ((m = path.match(/^\/v1\/subscriptions\/(sub_\w+)$/)) && method === "DELETE") {
      const sub = world.subscriptions.get(m[1]);
      if (!sub) return missing("subscription");
      sub.status = "canceled";
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
        // billing_cycle_anchor=now bills the plan at once, at the price (and coupon) it has now.
        billNow(sub, "paid");
      } else if (method === "POST") {
        if ("cancel_at_period_end" in p) sub.cancel_at_period_end = p.cancel_at_period_end === "true";
        if (p.default_payment_method) sub.default_payment_method = p.default_payment_method;
        if (p["items[0][price]"]) {
          if (p["items[0][id]"] !== sub.itemId) return { status: 400, body: { error: { type: "invalid_request_error", message: "wrong item" } } };
          sub.price = p["items[0][price]"];
        }
        if (p["metadata[lmb_plan]"]) sub.metadata.lmb_plan = p["metadata[lmb_plan]"];
        if (p["discounts[0][coupon]"]) {
          if (!world.coupons.has(p["discounts[0][coupon]"])) return missing("coupon");
          sub.coupon = p["discounts[0][coupon]"];
        }
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
      return ok(cardBody(m[1]));
    }
    if (method === "GET" && path === "/v1/invoices") {
      // With no subscription named, every invoice (optionally only paid ones since a time), a page at a time.
      let list = [...world.invoices.values()]
        .filter((invoice) => (p.subscription ? invoice.subscription === p.subscription : true))
        .filter((invoice) => (p.status ? invoice.status === p.status : true))
        .filter((invoice) => (p["created[gte]"] ? (invoice.created ?? 0) >= Number(p["created[gte]"]) : true))
        .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
      if (p.starting_after) list = list.slice(list.findIndex((invoice) => invoice.id === p.starting_after) + 1);
      const size = Number(p.limit ?? 10);
      return ok({ object: "list", data: list.slice(0, size), has_more: list.length > size });
    }
    // A pending line for the subscription's next bill (pay what you use, billRunningCosts).
    if (method === "GET" && path === "/v1/invoiceitems") {
      return ok({ object: "list", data: [...world.invoiceItems.values()].filter((item) => item.customer === p.customer), has_more: false });
    }
    if (method === "POST" && path === "/v1/invoiceitems") {
      const item = { id: `ii_${next++}`, object: "invoiceitem", customer: p.customer, subscription: p.subscription, amount: Number(p.amount), currency: p.currency, description: p.description, discountable: p.discountable, metadata: { lmb_shop_id: p["metadata[lmb_shop_id]"], lmb_month: p["metadata[lmb_month]"], lmb_kind: p["metadata[lmb_kind]"] } };
      world.invoiceItems.set(item.id, item);
      return ok(item);
    }
    if (method === "POST" && path === "/v1/invoices/create_preview") {
      // The prorated part of a move: the rest of the month at the new price, less the rest at the old one.
      const sub = world.subscriptions.get(p.subscription);
      if (!sub) return missing("subscription");
      if (!p["subscription_details[items][0][price]"]) {
        // The next bill as it stands: the plan's price, less a coupon, plus 13% HST when Stripe Tax is on.
        const price = world.prices.get(sub.price);
        const off = sub.coupon ? Math.round((price.unit_amount * world.coupons.get(sub.coupon).percent_off) / 100) : 0;
        const taxed = sub.automatic_tax?.enabled ? Math.round((price.unit_amount - off) * 0.13) : 0;
        return ok({
          object: "invoice", currency: price.currency, period_end: sub.periodEnd, next_payment_attempt: sub.periodEnd,
          lines: { data: [{ description: "1 × Colophon Shop and stockroom (at $39.00 / month)", amount: price.unit_amount }] },
          subtotal: price.unit_amount, total_discount_amounts: off ? [{ amount: off }] : [], total_taxes: taxed ? [{ amount: taxed, taxability_reason: "standard_rated", tax_behavior: "exclusive" }] : [], total: price.unit_amount - off + taxed,
        });
      }
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
      if (world.payFails) return { status: world.payFails.status ?? 402, body: { error: { type: world.payFails.type ?? "card_error", code: world.payFails.code, message: "declined" } } };
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
    const asked = `${method} ${parsed.pathname} ${JSON.stringify(params)}`;
    let result;
    if (key && byKey.has(key)) {
      // Like Stripe: a key comes back with the same answer, but a key reused for different details is refused.
      const kept = byKey.get(key);
      result = kept.asked === asked ? kept.result : { status: 400, body: { error: { type: "idempotency_error", message: "Keys for idempotent requests can only be used with the same parameters they were first used with." } } };
    } else if (world.failOnce && world.failOnce.test(`${method} ${parsed.pathname}`)) {
      world.failOnce = null;
      result = { status: 400, body: { error: { type: "invalid_request_error", message: "made to fail once" } } };
      if (key) byKey.set(key, { asked, result });
    } else {
      result = answer(method, parsed.pathname, params);
      if (key && !result.turnedAway) byKey.set(key, { asked, result });
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
      id, object: "invoice", subscription: subscriptionId, number: `COL-${String(next).padStart(4, "0")}`, status: "paid", currency: "cad", total: 3900, total_taxes: [], created: clock(),
      invoice_pdf: `https://pay.stripe.example/invoice/${id}/pdf`, hosted_invoice_url: `https://invoice.stripe.example/${id}`, ...fields,
    };
    world.invoices.set(id, invoice);
    return invoice;
  };
  /** A payment is being retried after a decline (Stripe's past_due), with its bill open. */
  const pastDue = (id) => {
    const sub = world.subscriptions.get(id);
    sub.status = "past_due";
    return addInvoice(id, { status: "open", total: 3900, amount_due: 3900 });
  };
  return { fetch, requests, world, endTrial, completeSetup, subscription, payMonth, addInvoice, attach, pastDue };
}

/**
 * The fixed plans of before pay what you use ($29 / $19 / $39, and pay as you sell at 2%), still possible through the
 * settings. Tests of plan-change mechanics (proration, a cheaper plan, pay as you sell) need plans with different
 * prices, which the $5 default no longer gives: they read `platformSettings(TIERED_PRICES_ENV)`.
 */
export const TIERED_PRICES_ENV = Object.freeze({ PLAN_PRICE_SHOP: "2900", PLAN_PRICE_STOCKROOM: "1900", PLAN_PRICE_BOTH: "3900", PAY_AS_YOU_SELL_BASIS_POINTS: "200" });
