// The platform's billing (code plan 2.4): each press's Colophon plan (shop, stockroom or both), on the platform's own
// Stripe account (Stripe Billing, not Connect). One Stripe customer per platform account (the person who pays), one
// subscription per shop.
//
// - startTrial: the subscription starts with a free trial and no card (Stripe's trial without a payment method). If
//   the trial ends with no card, Stripe pauses the subscription (`trial_settings.end_behavior.missing_payment_method:
//   pause`): the shop closes its doors, nothing is deleted, and adding a card opens it again.
// - cardLink: a Stripe Checkout page in setup mode to add or change the card. When it completes, the card becomes the
//   default for the customer and the subscription, and a paused subscription resumes.
// - cancel / keep: cancel at the end of the period already paid for (or the trial), and undo that.
// - changePlan: move a shop to another plan, prorated.
// - handleEvent: Stripe's events for the platform account, checked by signature, each handled once. They keep the
//   shop's billing state in step and send the emails: trial ending, card needed, payment failed, cancelled, ended.
//
// Every change is kept in the billing store, mirrored onto the shop's registry row (`billing`, for the control room and
// the shop maker), and logged in the registry and the shop's audit log. Every Stripe call that creates something
// carries an idempotency key, so a retry never makes a second customer, subscription or price.
//
// Clients passed in (fakes.js has in-memory ones):
//   stripe          createStripeApi(...) (services/payments/stripeApi.js); built by services/payments, which alone
//                   reads the platform key (platformBillingStripe)
//   mode            "test" or "live": the Stripe mode billing runs in
//   customers       get(accountId) -> { customerId, email, name, trialUsedAt? } | null; set(accountId, row)
//   subscriptions   get(shopId) -> row | null; set(shopId, row); findBySubscriptionId(id) -> row | null; list() -> rows
//   events          seen(eventId) -> boolean; mark(eventId, entry)
//   registry        getShop(shopId) -> row | null; updateShop(shopId, fields); recordEvent(shopId, entry)
//   auditLog        ready(shopId); write(shopId, id, entry)
//   email           sendPlatform({ kind, to, data, idempotencyKey, shopId }) (services/email)
import { verifySignature } from "../payments/stripeSignature.js";
import { isPlan, planPrice } from "./plans.js";

/** What each Stripe subscription status means for the shop: open, paused (a card fixes it) or closed. */
export const ACCESS = Object.freeze({
  trialing: "open",
  active: "open",
  // Stripe is retrying a declined payment; the shop stays open meanwhile (and the press is emailed).
  past_due: "open",
  paused: "paused",
  incomplete: "paused",
  unpaid: "paused",
  canceled: "closed",
  incomplete_expired: "closed",
});

const ENDED = new Set(["canceled", "incomplete_expired"]);
const iso = (seconds) => (Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null);

/** A date the way the emails say it: "14 November 2026", Toronto time. */
export function dateText(isoTime) {
  if (!isoTime) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", day: "numeric", month: "long", year: "numeric" }).format(new Date(isoTime));
}

/** The parts of a Stripe subscription the platform keeps. */
export function fromSubscription(sub) {
  const item = sub.items?.data?.[0];
  return {
    subscriptionId: sub.id,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    status: sub.status,
    access: ACCESS[sub.status] ?? "paused",
    plan: isPlan(sub.metadata?.lmb_plan) ? sub.metadata.lmb_plan : null,
    trialEnd: iso(sub.trial_end),
    // Newer Stripe versions keep the period on the item; older ones on the subscription.
    currentPeriodEnd: iso(sub.current_period_end ?? item?.current_period_end),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    hasCard: Boolean(sub.default_payment_method),
    itemId: item?.id ?? null,
    priceId: item?.price?.id ?? null,
  };
}

export class BillingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createBilling({ stripe, mode = "test", settings, customers, subscriptions, events, registry, auditLog, email, webhookSecrets = [], now = () => Date.now() }) {
  if (mode !== "test" && mode !== "live") throw new Error('billing mode must be "test" or "live"');
  const at = () => new Date(now()).toISOString();
  const call = (method, path, options) => stripe.call(mode, method, path, options);
  const priceIds = new Map();

  const accountLink = (shopId) => `${settings.platformUrl}/account/billing?shop=${encodeURIComponent(shopId)}`;

  async function logChange(shopId, what, detail) {
    const entry = { id: `billing-${at()}-${what}`, source: "billing", at: at(), what, ...detail };
    await registry.recordEvent(shopId, entry);
    if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
  }

  // The billing store holds the truth; the registry row carries a copy for the control room and the shop maker.
  async function save(shopId, fields, what) {
    const before = (await subscriptions.get(shopId)) ?? {};
    const row = { ...before, ...fields, shopId, updatedAt: at() };
    await subscriptions.set(shopId, row);
    if (await registry.getShop(shopId)) {
      const { plan, status, access, trialEnd, currentPeriodEnd, cancelAtPeriodEnd, hasCard } = row;
      await registry.updateShop(shopId, { billing: { plan, status, access, trialEnd, currentPeriodEnd, cancelAtPeriodEnd, hasCard, updatedAt: row.updatedAt } });
    }
    if (what) await logChange(shopId, what, { status: row.status, plan: row.plan, access: row.access });
    return row;
  }

  async function rowFor(shopId) {
    const row = await subscriptions.get(shopId);
    if (!row?.subscriptionId) throw new BillingError(404, "This shop has no plan yet.");
    return row;
  }

  /** The Stripe price for a plan, made (with its product) the first time it is needed. */
  async function ensurePrice(plan) {
    const price = planPrice(plan, settings);
    if (priceIds.has(price.lookupKey)) return priceIds.get(price.lookupKey);
    const found = await call("GET", "/v1/prices", { params: { lookup_keys: [price.lookupKey], active: true, limit: 1 } });
    let id = found?.data?.[0]?.id;
    if (!id) {
      try {
        await call("GET", `/v1/products/${price.productId}`);
      } catch (error) {
        if (error.statusCode !== 404) throw error;
        await call("POST", "/v1/products", {
          params: { id: price.productId, name: `${settings.platformName} ${price.name}`, metadata: { lmb_plan: plan } },
          idempotencyKey: `product-${price.productId}`,
        });
      }
      const made = await call("POST", "/v1/prices", {
        params: { product: price.productId, currency: price.currency, unit_amount: price.amount, recurring: { interval: "month" }, lookup_key: price.lookupKey, nickname: `${price.name} monthly`, metadata: { lmb_plan: plan } },
        idempotencyKey: `price-${price.lookupKey}`,
      });
      id = made.id;
    }
    priceIds.set(price.lookupKey, id);
    return id;
  }

  /** The Stripe customer for a platform account (the person who pays), made once. */
  async function ensureCustomer({ accountId, email: address, name }) {
    const saved = await customers.get(accountId);
    if (saved?.customerId) return saved;
    const customer = await call("POST", "/v1/customers", {
      params: { email: address, ...(name ? { name } : {}), metadata: { lmb_account_id: accountId } },
      idempotencyKey: `customer-${accountId}`,
    });
    const row = { customerId: customer.id, email: address, name: name ?? "" };
    await customers.set(accountId, row);
    return row;
  }

  async function notify(shopId, kind, data, key) {
    const row = await subscriptions.get(shopId);
    if (!row?.billingEmail) return;
    const price = row.plan ? planPrice(row.plan, settings) : null;
    await email.sendPlatform({
      kind,
      to: row.billingEmail,
      shopId,
      idempotencyKey: `billing/${key}`,
      data: { pressName: row.pressName || shopId, planName: price?.name ?? "", price: price?.priceText ?? "", link: accountLink(shopId), ...data },
    });
  }

  async function sync(shopId, sub, what) {
    const fields = fromSubscription(sub);
    if (!fields.plan) delete fields.plan;
    return save(shopId, fields, what);
  }

  return {
    ensurePrice,
    ensureCustomer,

    /**
     * Starts a shop's plan. A press's first plan has the free trial and needs no card; a plan started again after one
     * ended (or for a second shop of an account that already had a trial) starts unpaid until a card is added.
     * Safe to repeat: a shop with a plan that hasn't ended gets that plan back.
     */
    async startTrial({ account, shopId, pressName, plan }) {
      if (!isPlan(plan)) throw new BillingError(400, "Choose a plan: shop, stockroom or both.");
      if (!account?.accountId || !account?.email) throw new BillingError(400, "The account is missing.");
      const existing = await subscriptions.get(shopId);
      if (existing?.subscriptionId && !ENDED.has(existing.status)) {
        if (existing.accountId !== account.accountId) throw new BillingError(403, "This shop belongs to another account.");
        return existing;
      }
      const customer = await ensureCustomer(account);
      const trial = settings.trialDays > 0 && !customer.trialUsedAt;
      const starts = (existing?.starts ?? 0) + 1;
      const sub = await call("POST", "/v1/subscriptions", {
        params: {
          customer: customer.customerId,
          items: [{ price: await ensurePrice(plan) }],
          metadata: { lmb_shop_id: shopId, lmb_plan: plan, lmb_account_id: account.accountId },
          payment_settings: { save_default_payment_method: "on_subscription" },
          ...(trial
            ? { trial_period_days: settings.trialDays, trial_settings: { end_behavior: { missing_payment_method: "pause" } } }
            : { payment_behavior: "default_incomplete" }),
        },
        idempotencyKey: `subscription-${shopId}-${starts}`,
      });
      if (trial) await customers.set(account.accountId, { ...customer, trialUsedAt: at() });
      return save(shopId, { ...fromSubscription(sub), accountId: account.accountId, billingEmail: account.email, pressName: pressName ?? "", starts, planChanges: 0 }, trial ? "trial-started" : "plan-started");
    },

    /** A Stripe page to add or change the card. `returnUrl` must be one of the platform's own pages. */
    async cardLink({ shopId, returnUrl }) {
      const row = await rowFor(shopId);
      if (typeof returnUrl !== "string" || !(returnUrl === settings.platformUrl || returnUrl.startsWith(`${settings.platformUrl}/`))) {
        throw new BillingError(400, "The page to come back to must be on the platform.");
      }
      const back = new URL(returnUrl);
      back.searchParams.set("card", "added");
      const session = await call("POST", "/v1/checkout/sessions", {
        params: {
          mode: "setup",
          customer: row.customerId,
          currency: settings.currency.toLowerCase(),
          success_url: back.toString(),
          cancel_url: returnUrl,
          metadata: { lmb_shop_id: shopId },
          setup_intent_data: { metadata: { lmb_shop_id: shopId } },
        },
      });
      return { url: session.url };
    },

    /** Cancels at the end of the paid period (or the trial). The shop stays open until then. */
    async cancel({ shopId }) {
      const row = await rowFor(shopId);
      if (ENDED.has(row.status)) return row;
      if (row.cancelAtPeriodEnd) return row;
      const sub = await call("POST", `/v1/subscriptions/${row.subscriptionId}`, { params: { cancel_at_period_end: true } });
      const saved = await sync(shopId, sub, "cancel-requested");
      const until = saved.status === "trialing" ? saved.trialEnd : saved.currentPeriodEnd;
      await notify(shopId, "subscription-cancelled", { date: dateText(until) }, `${shopId}/cancel/${saved.subscriptionId}/${at()}`);
      return saved;
    },

    /** Undoes a cancel that hasn't happened yet. */
    async keep({ shopId }) {
      const row = await rowFor(shopId);
      if (!row.cancelAtPeriodEnd || ENDED.has(row.status)) return row;
      const sub = await call("POST", `/v1/subscriptions/${row.subscriptionId}`, { params: { cancel_at_period_end: false } });
      return sync(shopId, sub, "cancel-undone");
    },

    /**
     * Moves the shop to another plan, prorated. The registry row's `plan` changes too, so the next run of the shop
     * maker adds the app the new plan brings (an app the plan drops is left in place, with its data).
     */
    async changePlan({ shopId, plan }) {
      if (!isPlan(plan)) throw new BillingError(400, "Choose a plan: shop, stockroom or both.");
      const row = await rowFor(shopId);
      if (ENDED.has(row.status)) throw new BillingError(409, "This plan has ended; start a new one instead.");
      if (row.plan === plan) return { ...row, changed: false };
      const changes = (row.planChanges ?? 0) + 1;
      const sub = await call("POST", `/v1/subscriptions/${row.subscriptionId}`, {
        params: { items: [{ id: row.itemId, price: await ensurePrice(plan) }], proration_behavior: "create_prorations", metadata: { lmb_plan: plan } },
        idempotencyKey: `plan-${shopId}-${changes}-${plan}`,
      });
      const saved = await save(shopId, { ...fromSubscription(sub), plan, planChanges: changes }, "plan-changed");
      if (await registry.getShop(shopId)) await registry.updateShop(shopId, { plan });
      await notify(shopId, "plan-changed", {}, `${shopId}/plan/${changes}`);
      return { ...saved, changed: true };
    },

    /** The shop's plan as the account page shows it. */
    async status(shopId) {
      const row = await subscriptions.get(shopId);
      if (!row) return null;
      const price = row.plan ? planPrice(row.plan, settings) : null;
      return {
        plan: row.plan, planName: price?.name ?? "", price: price?.priceText ?? "", status: row.status, access: row.access,
        trialEnd: row.trialEnd, currentPeriodEnd: row.currentPeriodEnd, cancelAtPeriodEnd: row.cancelAtPeriodEnd, hasCard: row.hasCard,
      };
    },

    /**
     * Stripe's events for the platform account. `rawBody` is the request body exactly as received (the signature
     * covers it). Answers { status, body }: 400 for a bad signature, 200 once handled or when the event isn't ours.
     * A failure answers 500, so Stripe sends the event again; nothing is marked handled until it succeeds.
     */
    async handleEvent({ headers, rawBody }) {
      const signature = Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === "stripe-signature")?.[1];
      if (!webhookSecrets.some((secret) => verifySignature(secret, rawBody, signature, { now: now() }))) {
        return { status: 400, body: { ok: false, message: "The signature doesn't match." } };
      }
      let event;
      try {
        event = JSON.parse(rawBody);
      } catch {
        return { status: 400, body: { ok: false, message: "The event isn't JSON." } };
      }
      if (Boolean(event.livemode) !== (mode === "live")) return { status: 200, body: { ok: true, ignored: "other mode" } };
      if (await events.seen(event.id)) return { status: 200, body: { ok: true, duplicate: true } };
      try {
        const handled = await handle(event);
        await events.mark(event.id, { type: event.type, at: at(), handled });
        return { status: 200, body: { ok: true, handled } };
      } catch (error) {
        return { status: 500, body: { ok: false, message: error.message } };
      }
    },
  };

  /** One event. Returns what it did, for the events log. */
  async function handle(event) {
    const object = event.data?.object ?? {};
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
      case "customer.subscription.deleted":
      case "customer.subscription.trial_will_end": {
        const shopId = object.metadata?.lmb_shop_id;
        const known = shopId ? await subscriptions.get(shopId) : null;
        if (!known || known.subscriptionId !== object.id) return "not ours";
        const saved = await sync(shopId, object, event.type.replace("customer.subscription.", "stripe-"));
        if (event.type === "customer.subscription.trial_will_end") {
          await notify(shopId, "trial-ending", { date: dateText(saved.trialEnd), hasCard: saved.hasCard }, event.id);
        } else if (event.type === "customer.subscription.paused") {
          await notify(shopId, "card-needed", {}, event.id);
        } else if (event.type === "customer.subscription.deleted") {
          await notify(shopId, "subscription-ended", {}, event.id);
        }
        return saved.status;
      }
      case "invoice.payment_failed": {
        const subscriptionId = object.subscription ?? object.parent?.subscription_details?.subscription;
        const row = subscriptionId ? await subscriptions.findBySubscriptionId(typeof subscriptionId === "string" ? subscriptionId : subscriptionId.id) : null;
        if (!row) return "not ours";
        const amount = new Intl.NumberFormat("en-CA", { style: "currency", currency: (object.currency ?? settings.currency).toUpperCase(), currencyDisplay: "narrowSymbol" }).format((object.amount_due ?? 0) / 100);
        await logChange(row.shopId, "payment-failed", { attempt: object.attempt_count ?? null });
        await notify(row.shopId, "payment-failed", { price: amount, nextTry: dateText(iso(object.next_payment_attempt)) }, event.id);
        return "payment failed";
      }
      case "checkout.session.completed": {
        if (object.mode !== "setup") return "not ours";
        const shopId = object.metadata?.lmb_shop_id;
        const row = shopId ? await subscriptions.get(shopId) : null;
        if (!row?.subscriptionId || row.customerId !== object.customer) return "not ours";
        const intentId = typeof object.setup_intent === "string" ? object.setup_intent : object.setup_intent?.id;
        const intent = await call("GET", `/v1/setup_intents/${intentId}`);
        const card = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
        if (!card) return "no card";
        await call("POST", `/v1/customers/${row.customerId}`, { params: { invoice_settings: { default_payment_method: card } } });
        let sub = await call("POST", `/v1/subscriptions/${row.subscriptionId}`, { params: { default_payment_method: card } });
        // A trial that ended without a card paused the plan: the card opens the shop again, billed from today.
        if (sub.status === "paused") sub = await call("POST", `/v1/subscriptions/${row.subscriptionId}/resume`, { params: { billing_cycle_anchor: "now" }, idempotencyKey: `resume-${event.id}` });
        // A plan started again without a trial waits for its first payment: pay it with the new card.
        const invoice = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
        if (sub.status === "incomplete" && invoice) {
          await call("POST", `/v1/invoices/${invoice}/pay`, { params: { payment_method: card }, idempotencyKey: `pay-${event.id}` });
          sub = await call("GET", `/v1/subscriptions/${row.subscriptionId}`);
        }
        await sync(shopId, sub, "card-added");
        return "card added";
      }
      default:
        return "not handled";
    }
  }
}
