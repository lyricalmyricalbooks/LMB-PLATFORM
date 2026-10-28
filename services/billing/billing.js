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
// - changePlan: move a shop to another plan (code plan 6.11). A plan that opens a new app is prorated at once; a plan
//   that drops an app keeps it open to the end of the month already paid for, then closes it (its download is kept 90
//   days); during the trial, or while nothing is paid, the change takes effect at once. `changePlan({ preview: true })`
//   says what would change and the prorated amount, changing nothing.
// - invoices: the plan's invoices with Stripe's own PDF links (6.12).
// - closeDroppedApps / cardExpiryReminders: daily sweeps. The first closes an app a plan dropped once its paid month
//   ends; the second emails a month before the card on file runs out, once per card (6.12).
// - tax: with `tax` on (BILLING_TAX, read in index.js), prices are "plus tax" and Stripe Tax adds the tax from the
//   first charge after a card (and so an address) is on file (6.12). Off by default.
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
//   closeApp        optional: closeApp({ shopId, app, closedAt, downloadUntil }), takes a dropped app's pages down. The
//                   registry row's `closedApps` is written either way and is what the shop maker reads.
import { verifySignature } from "../payments/stripeSignature.js";
import { isPlan, planPrice, PLAN_APPS, PLAN_IDS } from "./plans.js";

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
// Statuses with a month already paid for: a plan that drops an app keeps it open to the end of that month.
const PAID = new Set(["active", "past_due"]);
const DAY = 86400_000;
/** How long the download of a closed app is kept (code plan 6.11, the same 90 days as a closed shop). */
export const DOWNLOAD_DAYS = 90;
/** How long before a card runs out the press is told (code plan 6.12). */
export const CARD_WARNING_DAYS = 30;
/** The apps, in words, for the page and the emails. */
export const APP_NAMES = Object.freeze({ shop: "the shop", stockroom: "the stockroom" });
const APPS = Object.keys(APP_NAMES);
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

/** The plan that opens exactly these apps (the registry's `plan` says what is open). */
export function planOpening(apps) {
  return PLAN_IDS.find((plan) => APPS.every((app) => PLAN_APPS[plan][app] === apps.includes(app))) ?? null;
}

/** The last moment a card works: the end of its expiry month, in UTC. */
export function cardEnds({ expMonth, expYear }) {
  if (!Number.isInteger(expMonth) || !Number.isInteger(expYear)) return null;
  return new Date(Date.UTC(expYear, expMonth, 1) - 1).toISOString();
}

const moneyText = (cents, currency) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: currency.toUpperCase(), currencyDisplay: "narrowSymbol" }).format(cents / 100);

export class BillingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createBilling({ stripe, mode = "test", settings, customers, subscriptions, events, registry, auditLog, email, webhookSecrets = [], tax = false, closeApp, now = () => Date.now() }) {
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
      await registry.updateShop(shopId, { billing: { plan, status, access, trialEnd, currentPeriodEnd, cancelAtPeriodEnd, hasCard, appsClosing: row.appsClosing ?? null, updatedAt: row.updatedAt } });
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
    // "Plus tax": a price made before tax was turned on says so once (Stripe lets an unset tax behaviour be set once).
    if (id && tax && (found.data[0].tax_behavior ?? "unspecified") === "unspecified") {
      await call("POST", `/v1/prices/${id}`, { params: { tax_behavior: "exclusive" } });
    }
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
        params: { product: price.productId, currency: price.currency, unit_amount: price.amount, recurring: { interval: "month" }, lookup_key: price.lookupKey, nickname: `${price.name} monthly`, metadata: { lmb_plan: plan }, ...(tax ? { tax_behavior: "exclusive" } : {}) },
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

  /** What a move to `plan` would do: the apps it adds and closes, when, and whether it is prorated. */
  function planMove(row, plan) {
    const open = APPS.filter((app) => PLAN_APPS[row.plan]?.[app] || row.appsClosing?.apps?.includes(app));
    const wanted = APPS.filter((app) => PLAN_APPS[plan][app]);
    const adds = wanted.filter((app) => !open.includes(app));
    const closes = open.filter((app) => !PLAN_APPS[plan][app]);
    // A trial, or a plan with nothing paid (paused, waiting for a first payment): the change takes effect at once.
    const immediate = !PAID.has(row.status);
    const closesAt = closes.length ? (immediate ? at() : row.currentPeriodEnd) : null;
    const price = planPrice(plan, settings);
    const higher = row.plan ? price.amount > planPrice(row.plan, settings).amount : false;
    return {
      plan, planName: price.name, price: price.priceText, from: row.plan, adds, closes, immediate, closesAt,
      downloadUntil: closesAt ? new Date(Date.parse(closesAt) + DOWNLOAD_DAYS * DAY).toISOString() : null,
      prorate: !immediate && adds.length > 0 && higher,
      // Until a dropped app closes, the shop keeps it: the registry's plan says what is open.
      openPlan: planOpening(immediate ? wanted : [...new Set([...wanted, ...closes])]),
    };
  }

  /** What Stripe would charge now for moving to `plan`: the prorated lines of a preview invoice. */
  async function prorated(row, plan) {
    const preview = await call("POST", "/v1/invoices/create_preview", {
      params: {
        customer: row.customerId,
        subscription: row.subscriptionId,
        subscription_details: { items: [{ id: row.itemId, price: await ensurePrice(plan) }], proration_behavior: "create_prorations", proration_date: Math.floor(now() / 1000) },
      },
    });
    const lines = preview?.lines?.data ?? [];
    const amount = lines.filter((line) => line.proration || line.parent?.subscription_item_details?.proration).reduce((sum, line) => sum + (line.amount ?? 0), 0);
    return { amount, text: moneyText(Math.max(0, amount), preview?.currency ?? settings.currency) };
  }

  /** Closes apps a plan dropped: recorded on the billing row, the registry and the logs; the pages taken down. */
  async function closeApps(shopId, apps) {
    const row = await subscriptions.get(shopId);
    const closedApps = { ...(row?.closedApps ?? {}) };
    const closedAt = at();
    const downloadUntil = new Date(now() + DOWNLOAD_DAYS * DAY).toISOString();
    for (const app of apps) {
      if (closedApps[app]) continue;
      closedApps[app] = { closedAt, downloadUntil };
      if (closeApp) await closeApp({ shopId, app, closedAt, downloadUntil });
    }
    const saved = await save(shopId, { appsClosing: null, closedApps }, null);
    await logChange(shopId, "app-closed", { apps, downloadUntil });
    return saved;
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
     * Moves the shop to another plan (code plan 6.11). A plan that opens an app the shop doesn't have yet, for more
     * money, is prorated at once. A plan that drops an app keeps it open to the end of the month already paid for and
     * then closes it (closeDroppedApps), with its download kept 90 days; the new price starts with the next month.
     * During the trial, or while nothing is paid, the change takes effect at once. The registry row's `plan` says what
     * is open, so the next run of the shop maker adds the app the new plan brings.
     *
     * `preview: true` changes nothing and answers what would change: the apps added and closed, when, and the
     * prorated amount Stripe would charge now.
     */
    async changePlan({ shopId, plan, preview = false }) {
      if (!isPlan(plan)) throw new BillingError(400, "Choose a plan: shop, stockroom or both.");
      const row = await rowFor(shopId);
      if (ENDED.has(row.status)) throw new BillingError(409, "This plan has ended; start a new one instead.");
      const move = planMove(row, plan);
      if (preview) return { ...move, prorated: move.prorate ? await prorated(row, plan) : null };
      if (row.plan === plan) return { ...row, changed: false };
      const changes = (row.planChanges ?? 0) + 1;
      const sub = await call("POST", `/v1/subscriptions/${row.subscriptionId}`, {
        params: {
          items: [{ id: row.itemId, price: await ensurePrice(plan) }],
          proration_behavior: move.prorate ? "create_prorations" : "none",
          metadata: { lmb_plan: plan },
          ...(tax && row.hasCard ? { automatic_tax: { enabled: true } } : {}),
        },
        idempotencyKey: `plan-${shopId}-${changes}-${plan}`,
      });
      const closedApps = { ...(row.closedApps ?? {}) };
      for (const app of move.adds) delete closedApps[app];
      const appsClosing = move.closes.length && !move.immediate ? { apps: move.closes, at: move.closesAt, downloadUntil: move.downloadUntil } : null;
      let saved = await save(shopId, { ...fromSubscription(sub), plan, planChanges: changes, appsClosing, closedApps }, "plan-changed");
      if (move.immediate && move.closes.length) saved = await closeApps(shopId, move.closes);
      if (await registry.getShop(shopId)) await registry.updateShop(shopId, { plan: move.openPlan, closedApps: saved.closedApps ?? {} });
      const closing = move.closes.length ? { closing: move.closes.map((app) => APP_NAMES[app]).join(" and "), date: dateText(move.closesAt), now: move.immediate } : {};
      await notify(shopId, "plan-changed", { prorated: move.prorate, ...closing }, `${shopId}/plan/${changes}`);
      return { ...saved, changed: true };
    },

    /** The plan's invoices, newest first, each with Stripe's own PDF and page (code plan 6.12). */
    async invoices(shopId) {
      const row = await subscriptions.get(shopId);
      if (!row?.subscriptionId) return [];
      const list = await call("GET", "/v1/invoices", { params: { subscription: row.subscriptionId, limit: 24 } });
      return (list?.data ?? [])
        .filter((invoice) => invoice.status !== "draft")
        .map((invoice) => ({
          id: invoice.id,
          number: invoice.number ?? "",
          date: iso(invoice.created),
          amount: moneyText(invoice.total ?? invoice.amount_due ?? 0, invoice.currency ?? settings.currency),
          tax: invoice.tax ? moneyText(invoice.tax, invoice.currency ?? settings.currency) : "",
          status: invoice.status,
          pdfUrl: httpsOrNull(invoice.invoice_pdf),
          pageUrl: httpsOrNull(invoice.hosted_invoice_url),
        }));
    },

    /** The shop's plan as the Plan & billing page shows it. */
    async status(shopId) {
      const row = await subscriptions.get(shopId);
      if (!row) return null;
      const price = row.plan ? planPrice(row.plan, settings) : null;
      const ended = ENDED.has(row.status);
      const trialDaysLeft = row.status === "trialing" && row.trialEnd ? Math.max(0, Math.ceil((Date.parse(row.trialEnd) - now()) / DAY)) : null;
      const nextPaymentAt = ended || row.cancelAtPeriodEnd || !row.hasCard ? null : row.status === "trialing" ? row.trialEnd : PAID.has(row.status) ? row.currentPeriodEnd : null;
      return {
        plan: row.plan, planName: price?.name ?? "", price: price?.priceText ?? "", plusTax: tax, status: row.status, access: row.access,
        trialEnd: row.trialEnd, trialDaysLeft, currentPeriodEnd: row.currentPeriodEnd, nextPaymentAt, cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        hasCard: row.hasCard, card: row.hasCard && row.card ? { brand: row.card.brand, last4: row.card.last4, expMonth: row.card.expMonth, expYear: row.card.expYear, words: cardWords(row.card) } : null,
        appsClosing: row.appsClosing ?? null, closedApps: row.closedApps ?? {},
        plans: PLAN_IDS.map((id) => { const p = planPrice(id, settings); return { plan: id, name: p.name, price: p.priceText, apps: APPS.filter((app) => PLAN_APPS[id][app]) }; }),
      };
    },

    /**
     * The daily sweep for 6.11: an app a plan dropped closes once the month already paid for ends. Safe to repeat: a
     * closed app is not closed again.
     */
    async closeDroppedApps() {
      const closed = [];
      for (const row of await subscriptions.list()) {
        if (!row.appsClosing?.apps?.length || Date.parse(row.appsClosing.at) > now()) continue;
        const saved = await closeApps(row.shopId, row.appsClosing.apps);
        if (await registry.getShop(row.shopId)) await registry.updateShop(row.shopId, { plan: row.plan, closedApps: saved.closedApps });
        closed.push({ shopId: row.shopId, apps: row.appsClosing.apps });
      }
      return closed;
    },

    /**
     * The daily sweep for 6.12: a month before the card on file runs out, the person who pays is emailed, once per
     * card (a new card gets its own email when its time comes).
     */
    async cardExpiryReminders() {
      const sent = [];
      for (const row of await subscriptions.list()) {
        if (ENDED.has(row.status) || row.cancelAtPeriodEnd || !row.hasCard || !row.card?.id) continue;
        const ends = cardEnds(row.card);
        if (!ends || Date.parse(ends) - now() > CARD_WARNING_DAYS * DAY || Date.parse(ends) < now()) continue;
        if (row.cardWarned === row.card.id) continue;
        await notify(row.shopId, "card-expiring", { card: cardWords(row.card), date: dateText(ends), month: new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(ends)) }, `${row.customerId}/card-expiring/${row.card.id}`);
        await save(row.shopId, { cardWarned: row.card.id }, "card-expiring-sent");
        sent.push(row.shopId);
      }
      return sent;
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
        const method = await call("GET", `/v1/payment_methods/${card}`);
        const address = method?.billing_details?.address;
        // With tax on, the card's billing address is where Stripe Tax places the press, so it goes on the customer first.
        const located = tax && address?.country;
        await call("POST", `/v1/customers/${row.customerId}`, { params: { invoice_settings: { default_payment_method: card }, ...(located ? { address: plainAddress(address) } : {}) } });
        let sub = await call("POST", `/v1/subscriptions/${row.subscriptionId}`, { params: { default_payment_method: card, ...(located ? { automatic_tax: { enabled: true } } : {}) } });
        // A trial that ended without a card paused the plan: the card opens the shop again, billed from today.
        if (sub.status === "paused") sub = await call("POST", `/v1/subscriptions/${row.subscriptionId}/resume`, { params: { billing_cycle_anchor: "now" }, idempotencyKey: `resume-${event.id}` });
        // A plan started again without a trial waits for its first payment: pay it with the new card.
        const invoice = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
        if (sub.status === "incomplete" && invoice) {
          await call("POST", `/v1/invoices/${invoice}/pay`, { params: { payment_method: card }, idempotencyKey: `pay-${event.id}` });
          sub = await call("GET", `/v1/subscriptions/${row.subscriptionId}`);
        }
        const details = method?.card ?? {};
        await save(shopId, { card: { id: card, brand: details.brand ?? "card", last4: details.last4 ?? "", expMonth: details.exp_month ?? null, expYear: details.exp_year ?? null } }, null);
        await sync(shopId, sub, "card-added");
        return "card added";
      }
      default:
        return "not handled";
    }
  }
}

const httpsOrNull = (url) => (typeof url === "string" && url.startsWith("https://") ? url : null);

/** The parts of a Stripe address the customer takes, without empty ones. */
function plainAddress(address) {
  return Object.fromEntries(["line1", "line2", "city", "state", "postal_code", "country"].filter((part) => address[part]).map((part) => [part, address[part]]));
}

const BRANDS = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover", jcb: "JCB", diners: "Diners Club", unionpay: "UnionPay" };

/** "Visa ending 4242", for the page and the emails. */
export function cardWords(card) {
  const brand = BRANDS[card?.brand] ?? "Card";
  return card?.last4 ? `${brand} ending ${card.last4}` : brand;
}
