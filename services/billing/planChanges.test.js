// Code plan 6.11 and 6.12 against the pretend Stripe: a plan that drops an app closes it at the end of the paid month
// (download kept 90 days), a change during the trial is at once, an upgrade is prorated and previewed; invoices with
// Stripe's PDF links; the card-expiring email once per card; and BILLING_TAX turning Stripe Tax on (off by default).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardEnds, createBilling, planOpening } from "./billing.js";
import { readBillingConfig } from "./index.js";
import { fakeBillingStores, fakeBillingStripe, fakePlatformEmail } from "./fakes.js";
import { createStripeApi } from "../payments/stripeApi.js";
import { signatureHeader } from "../payments/stripeSignature.js";
import { platformSettings } from "../settings.js";
import { TEMPLATES } from "../email/templates.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";

const SECRET = "whsec_billing_test";
const START = 1_800_000_000_000;
const DAY = 86400_000;
const ACCOUNT = { accountId: "acct-owner-1", email: "owner@example.com", name: "Ada" };
const SHOP = "moth-press";

function make({ tax = false, plan = "both" } = {}) {
  let clock = START;
  const stripe = fakeBillingStripe({ clock: () => Math.floor(clock / 1000) });
  const stores = fakeBillingStores();
  const registry = fakeRegistry();
  const auditLog = fakeAuditLog();
  const email = fakePlatformEmail();
  const closed = [];
  const billing = createBilling({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings: platformSettings({}), ...stores, registry, auditLog, email, webhookSecrets: [SECRET], tax,
    closeApp: async (entry) => void closed.push(entry), now: () => clock,
  });
  const event = (type, object, id = `evt_${Math.random().toString(36).slice(2)}`) => {
    const rawBody = JSON.stringify({ id, type, livemode: false, data: { object } });
    return billing.handleEvent({ headers: { "Stripe-Signature": signatureHeader(SECRET, rawBody, clock / 1000) }, rawBody });
  };
  const start = async () => {
    await registry.createShop(SHOP, { shopId: SHOP, pressName: "Moth Press", plan, status: "live" });
    return billing.startTrial({ account: ACCOUNT, shopId: SHOP, pressName: "Moth Press", plan });
  };
  /** A card is added through Stripe's page, and the trial turns into a paid month. */
  const payMonth = async (row) => {
    const { url } = await billing.cardLink({ shopId: SHOP, returnUrl: "https://platform.example/account/billing" });
    await event("checkout.session.completed", stripe.completeSetup(url.split("/").pop()));
    await event("customer.subscription.updated", stripe.payMonth(row.subscriptionId));
  };
  return { stripe, stores, registry, auditLog, email, billing, event, start, payMonth, closed, tick: (days) => { clock += days * DAY; } };
}

const lastPlanRequest = (stripe) => stripe.requests.filter((r) => r.method === "POST" && /^\/v1\/subscriptions\/sub_\w+$/.test(r.path) && r.params["items[0][price]"]).at(-1);

test("a downgrade on a paid month keeps the dropped app open to the month's end, then closes it with 90 days to download", async () => {
  const w = make();
  const row = await w.start();
  await w.payMonth(row);
  const periodEnd = (await w.stores.subscriptions.get(SHOP)).currentPeriodEnd;

  const preview = await w.billing.changePlan({ shopId: SHOP, plan: "shop", preview: true });
  assert.deepEqual([preview.closes, preview.adds, preview.immediate, preview.closesAt, preview.prorated], [["stockroom"], [], false, periodEnd, null]);
  assert.equal(preview.downloadUntil, new Date(Date.parse(periodEnd) + 90 * DAY).toISOString());
  assert.equal(lastPlanRequest(w.stripe), undefined, "a preview changes nothing");

  await w.billing.changePlan({ shopId: SHOP, plan: "shop" });
  assert.equal(lastPlanRequest(w.stripe).params.proration_behavior, "none", "the new price starts with the next month");
  const shopRow = await w.registry.getShop(SHOP);
  assert.equal(shopRow.plan, "both", "the stockroom is still open");
  assert.deepEqual(shopRow.billing.appsClosing.apps, ["stockroom"]);
  const note = w.email.list().find((m) => m.kind === "plan-changed");
  assert.equal(note.data.closing, "the stockroom");
  assert.equal(note.data.prorated, false);
  assert.match(TEMPLATES["plan-changed"](note.data, { settings: platformSettings({}), pressName: "Moth Press" }).text, /stays open until .* then closes/);

  // The sweep before the month ends does nothing; after, it closes the stockroom once.
  assert.deepEqual(await w.billing.closeDroppedApps(), []);
  w.tick(31);
  const [done] = await w.billing.closeDroppedApps();
  assert.deepEqual(done, { shopId: SHOP, apps: ["stockroom"] });
  assert.deepEqual(await w.billing.closeDroppedApps(), [], "safe to run twice");
  const after = await w.registry.getShop(SHOP);
  assert.equal(after.plan, "shop");
  assert.equal(after.closedApps.stockroom.downloadUntil, new Date(START + 31 * DAY + 90 * DAY).toISOString());
  assert.equal(w.closed.length, 1);
  assert.equal(w.closed[0].app, "stockroom");
  assert.ok([...w.registry.events.get(SHOP).values()].some((e) => e.what === "app-closed"));
  assert.ok([...w.auditLog.entries.get(SHOP).values()].some((e) => e.what === "app-closed"));
});

test("changing back before the month ends keeps the app open", async () => {
  const w = make();
  const row = await w.start();
  await w.payMonth(row);
  await w.billing.changePlan({ shopId: SHOP, plan: "shop" });
  const back = await w.billing.changePlan({ shopId: SHOP, plan: "both", preview: true });
  assert.deepEqual([back.adds, back.closes, back.prorate], [[], [], false], "the stockroom is still open and already paid for");
  await w.billing.changePlan({ shopId: SHOP, plan: "both" });
  assert.equal(lastPlanRequest(w.stripe).params.proration_behavior, "none");
  w.tick(31);
  assert.deepEqual(await w.billing.closeDroppedApps(), []);
  assert.equal((await w.registry.getShop(SHOP)).plan, "both");
});

test("during the trial a plan change takes effect at once, a dropped app included", async () => {
  const w = make();
  await w.start();
  const preview = await w.billing.changePlan({ shopId: SHOP, plan: "stockroom", preview: true });
  assert.equal(preview.immediate, true);
  assert.deepEqual(preview.closes, ["shop"]);
  await w.billing.changePlan({ shopId: SHOP, plan: "stockroom" });
  assert.equal(lastPlanRequest(w.stripe).params.proration_behavior, "none");
  const shopRow = await w.registry.getShop(SHOP);
  assert.equal(shopRow.plan, "stockroom");
  assert.equal(shopRow.closedApps.shop.closedAt, new Date(START).toISOString());
  assert.equal(shopRow.closedApps.shop.downloadUntil, new Date(START + 90 * DAY).toISOString());
  assert.equal(w.closed.length, 1);
  assert.equal(w.email.list().find((m) => m.kind === "plan-changed").data.now, true);

  // Taking the shop back reopens it for the shop maker.
  await w.billing.changePlan({ shopId: SHOP, plan: "both" });
  const again = await w.registry.getShop(SHOP);
  assert.equal(again.plan, "both");
  assert.equal(again.closedApps.shop, undefined);
});

test("an upgrade on a paid month is prorated at once, and the preview says how much", async () => {
  const w = make({ plan: "stockroom" });
  const row = await w.start();
  await w.payMonth(row);
  w.tick(15);
  const preview = await w.billing.changePlan({ shopId: SHOP, plan: "both", preview: true });
  assert.deepEqual([preview.adds, preview.closes, preview.prorate], [["shop"], [], true]);
  // Half the month left: half of $39 less half of $19.
  assert.equal(preview.prorated.amount, 1950 - 950);
  assert.equal(preview.prorated.text, "$10.00");
  await w.billing.changePlan({ shopId: SHOP, plan: "both" });
  assert.equal(lastPlanRequest(w.stripe).params.proration_behavior, "create_prorations");
  assert.equal((await w.registry.getShop(SHOP)).plan, "both");
});

test("invoices come newest first with Stripe's PDF links; drafts and odd links are left out", async () => {
  const w = make();
  const row = await w.start();
  assert.deepEqual(await w.billing.invoices("nobody"), []);
  w.stripe.addInvoice(row.subscriptionId, { created: START / 1000 - 86400, total: 3900 });
  w.stripe.addInvoice(row.subscriptionId, { created: START / 1000, total: 4407, tax: 507 });
  w.stripe.addInvoice(row.subscriptionId, { status: "draft" });
  w.stripe.addInvoice(row.subscriptionId, { created: START / 1000 - 2 * 86400, invoice_pdf: "javascript:alert(1)" });
  w.stripe.addInvoice("sub_someone_else");
  const list = await w.billing.invoices(SHOP);
  assert.deepEqual(list.map((i) => [i.amount, i.tax]), [["$44.07", "$5.07"], ["$39.00", ""], ["$39.00", ""]]);
  assert.match(list[0].pdfUrl, /^https:\/\/pay\.stripe\.example\/invoice\/in_\w+\/pdf$/);
  assert.equal(list[2].pdfUrl, null);
});

test("the card-expiring email goes a month ahead, once per card; a new card gets its own", async () => {
  const w = make();
  const row = await w.start();
  w.stripe.world.paymentMethods.set("pm_card_visa", { id: "pm_card_visa", card: { brand: "visa", last4: "4242", exp_month: 2, exp_year: 2027 }, billing_details: { address: { country: "CA" } } });
  await w.payMonth(row);
  const card = (await w.billing.status(SHOP)).card;
  assert.deepEqual(card, { brand: "visa", last4: "4242", expMonth: 2, expYear: 2027, words: "Visa ending 4242" });
  assert.equal(cardEnds(card), "2027-02-28T23:59:59.999Z");

  // 15 January 2027: more than a month before the end of February.
  assert.deepEqual(await w.billing.cardExpiryReminders(), []);
  w.tick(15); // 30 January: within a month
  assert.deepEqual(await w.billing.cardExpiryReminders(), [SHOP]);
  assert.deepEqual(await w.billing.cardExpiryReminders(), []);
  w.tick(5);
  assert.deepEqual(await w.billing.cardExpiryReminders(), [], "never twice for one card");
  const sent = w.email.list().filter((m) => m.kind === "card-expiring");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].data.card, "Visa ending 4242");
  assert.match(TEMPLATES["card-expiring"](sent[0].data, { settings: platformSettings({}), pressName: "Moth Press" }).text, /end of February 2027/);

  // A new card that also runs out soon gets one email of its own.
  w.stripe.world.paymentMethods.set("pm_card_new", { id: "pm_card_new", card: { brand: "mastercard", last4: "4444", exp_month: 2, exp_year: 2027 }, billing_details: { address: { country: "CA" } } });
  const { url } = await w.billing.cardLink({ shopId: SHOP, returnUrl: "https://platform.example/account/billing" });
  await w.event("checkout.session.completed", w.stripe.completeSetup(url.split("/").pop(), "pm_card_new"));
  assert.deepEqual(await w.billing.cardExpiryReminders(), [SHOP]);
  assert.equal(w.email.list().filter((m) => m.kind === "card-expiring").length, 2);
});

test("tax is off by default: nothing about tax reaches Stripe and prices aren't 'plus tax'", async () => {
  assert.equal(readBillingConfig({}).tax, false);
  assert.equal(readBillingConfig({ BILLING_TAX: "off" }).tax, false);
  assert.equal(readBillingConfig({ BILLING_TAX: "on" }).tax, true);
  assert.throws(() => readBillingConfig({ BILLING_TAX: "maybe" }), /BILLING_TAX/);
  const w = make();
  const row = await w.start();
  await w.payMonth(row);
  assert.equal(w.stripe.requests.some((r) => Object.keys(r.params).some((key) => key.startsWith("automatic_tax") || key === "tax_behavior" || key.startsWith("address["))), false);
  assert.equal((await w.billing.status(SHOP)).plusTax, false);
  assert.equal([...w.stripe.world.prices.values()][0].tax_behavior, "unspecified");
});

test("tax on: prices are 'plus tax', and Stripe Tax starts once the card gives an address", async () => {
  const w = make({ tax: true });
  const row = await w.start();
  assert.equal([...w.stripe.world.prices.values()][0].tax_behavior, "exclusive");
  assert.equal(w.stripe.world.subscriptions.get(row.subscriptionId).automatic_tax, undefined, "the trial needs no address and no card");
  assert.equal((await w.billing.status(SHOP)).plusTax, true);
  await w.payMonth(row);
  assert.equal([...w.stripe.world.customers.values()][0].address.country, "CA");
  assert.deepEqual(w.stripe.world.subscriptions.get(row.subscriptionId).automatic_tax, { enabled: true });
  await w.billing.changePlan({ shopId: SHOP, plan: "shop" });
  assert.equal(lastPlanRequest(w.stripe).params["automatic_tax[enabled]"], "true");
});

test("a price made before tax was turned on is marked 'plus tax' once", async () => {
  const off = make();
  await off.start();
  const tax = createBilling({
    stripe: createStripeApi({ fetch: off.stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings: platformSettings({}), ...off.stores, registry: off.registry, auditLog: off.auditLog, email: off.email, tax: true,
  });
  await tax.ensurePrice("both");
  assert.equal([...off.stripe.world.prices.values()][0].tax_behavior, "exclusive");
  assert.equal(off.stripe.world.prices.size, 1);
});

test("the plan that opens exactly some apps", () => {
  assert.equal(planOpening(["shop", "stockroom"]), "both");
  assert.equal(planOpening(["stockroom"]), "stockroom");
  assert.equal(planOpening([]), null);
});
