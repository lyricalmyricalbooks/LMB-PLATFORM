// Code plan 6.11 and 6.12 against the pretend Stripe: a plan that drops an app closes it at the end of the paid month
// (download kept 90 days), a change during the trial is at once, an upgrade is prorated and previewed; invoices with
// Stripe's PDF links; the card-expiring email once per card; and BILLING_TAX turning Stripe Tax on (off by default).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardEnds, createBilling, noteDrops, planOpening } from "./billing.js";
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

function make({ tax = false, plan = "both", deleteApp = null } = {}) {
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
    closeApp: async (entry) => void closed.push(entry), deleteApp, now: () => clock,
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
  return { stripe, stores, registry, auditLog, email, billing, event, start, payMonth, closed, now: () => clock, tick: (days) => { clock += days * DAY; } };
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

test("Keep it: an app the plan change would close stays, the price goes back, and nothing closes at the month's end", async () => {
  const w = make();
  const row = await w.start();
  await w.payMonth(row);
  await assert.rejects(w.billing.keepClosingApps({ shopId: SHOP }), (error) => error.status === 409);
  await w.billing.changePlan({ shopId: SHOP, plan: "shop" });
  const kept = await w.billing.keepClosingApps({ shopId: SHOP });
  assert.equal(kept.plan, "both");
  assert.equal((await w.stores.subscriptions.get(SHOP)).appsClosing, null);
  assert.equal((await w.registry.getShop(SHOP)).plan, "both");
  const bothPrice = [...w.stripe.world.prices.values()].find((p) => p.lookup_key === "colophon_both_cad_3900_monthly");
  assert.equal(lastPlanRequest(w.stripe).params["items[0][price]"], bothPrice.id);
  w.tick(31);
  assert.deepEqual(await w.billing.closeDroppedApps(), [], "nothing closes");
});

test("a week before a dropped app closes, the press gets one reminder with the way to keep it", async () => {
  const w = make();
  const row = await w.start();
  await w.payMonth(row);
  await w.billing.changePlan({ shopId: SHOP, plan: "shop" });
  const at = (await w.stores.subscriptions.get(SHOP)).appsClosing.at;
  await w.billing.closeDroppedApps();
  assert.equal(w.email.list().filter((m) => m.kind === "app-closing-soon").length, 0, "not yet");
  w.tick((Date.parse(at) - START) / DAY - 6);
  await w.billing.closeDroppedApps();
  await w.billing.closeDroppedApps();
  const sent = w.email.list().filter((m) => m.kind === "app-closing-soon");
  assert.equal(sent.length, 1, "once");
  assert.equal(sent[0].data.closing, "the stockroom");
  assert.match(TEMPLATES["app-closing-soon"](sent[0].data, { settings: platformSettings({}), pressName: "Moth Press" }).subject, /^The stockroom for Moth Press closes on /);
  // The button keeps it with no sign-in: a one-time link; only its hash is stored.
  assert.match(sent[0].data.link, /\/account\/keep\.html\?shop=moth-press&t=[A-Za-z0-9_-]{32}$/);
  const stored = (await w.stores.subscriptions.get(SHOP)).keepLink;
  assert.equal(stored.for, at);
  assert.ok(!JSON.stringify(stored).includes(sent[0].data.link.split("t=")[1]), "the link itself is never stored");
  assert.equal((await w.registry.getShop(SHOP)).keepLink, undefined, "not on the registry");
});

test("the day a dropped app closes, the press is emailed where to download it and until when", async () => {
  const w = make();
  const row = await w.start();
  await w.payMonth(row);
  await w.billing.changePlan({ shopId: SHOP, plan: "shop" });
  w.tick(31);
  await w.billing.closeDroppedApps();
  await w.billing.closeDroppedApps();
  const sent = w.email.list().filter((m) => m.kind === "app-closed");
  assert.equal(sent.length, 1, "once");
  const { downloadUntil } = (await w.stores.subscriptions.get(SHOP)).closedApps.stockroom;
  assert.equal(sent[0].data.closing, "the stockroom");
  assert.match(sent[0].data.link, /\/accounts\/$/);
  const mail = TEMPLATES["app-closed"](sent[0].data, { settings: platformSettings({}), pressName: "Moth Press" });
  assert.match(mail.subject, /^The stockroom for Moth Press is closed\. Download it by /);
  assert.ok(mail.subject.endsWith(sent[0].data.date) && sent[0].data.date.length > 0, "the last day to download");
  assert.equal(Date.parse(downloadUntil) - (START + 31 * DAY), 90 * DAY);
});

test("every app dropped with time to change their mind is recorded as kept or closed, for the control room", async () => {
  const w = make();
  const row = await w.start();
  await w.payMonth(row);
  await w.billing.changePlan({ shopId: SHOP, plan: "shop" });
  await w.billing.keepClosingApps({ shopId: SHOP });
  await w.billing.changePlan({ shopId: SHOP, plan: "stockroom" });
  w.tick(31);
  await w.billing.closeDroppedApps();
  const drops = (await w.registry.getShop(SHOP)).billing.appDrops;
  assert.deepEqual(drops.map((d) => [d.app, Boolean(d.keptAt), Boolean(d.closedAt)]), [["stockroom", true, false], ["shop", false, true]]);
});

test("noteDrops: an app waiting to close isn't dropped twice; a plan change back keeps it; the last 20 are kept", () => {
  let drops = noteDrops([], { dropped: ["stockroom"] }, "t1");
  drops = noteDrops(drops, { dropped: ["stockroom"] }, "t2");
  assert.deepEqual(drops, [{ app: "stockroom", at: "t1", keptAt: null, closedAt: null }]);
  drops = noteDrops(drops, { kept: ["stockroom"] }, "t3");
  drops = noteDrops(drops, { closed: ["stockroom"] }, "t4");
  assert.deepEqual(drops, [{ app: "stockroom", at: "t1", keptAt: "t3", closedAt: null }], "nothing left waiting to close");
  for (let i = 0; i < 25; i += 1) drops = noteDrops(drops, { dropped: ["shop"], closed: ["shop"] }, `x${i}`);
  assert.equal(drops.length, 20);
});

// ── After closing (closedApps.js): the keep link, why it was dropped, the last email, and deletion. ──

/** A press that dropped the stockroom on a paid month, a week before it closes, with the reminder sent. */
async function reminded({ deleteApp } = {}) {
  const w = make({ deleteApp });
  const row = await w.start();
  await w.payMonth(row);
  await w.billing.changePlan({ shopId: SHOP, plan: "shop" });
  const at = (await w.stores.subscriptions.get(SHOP)).appsClosing.at;
  w.tick((Date.parse(at) - START) / DAY - 6);
  await w.billing.closeDroppedApps();
  const token = w.email.list().find((m) => m.kind === "app-closing-soon").data.link.split("t=")[1];
  return { ...w, token, at };
}

test("the keep link keeps the closing app with no sign-in, once, and only that", async () => {
  const w = await reminded();
  await assert.rejects(w.billing.keepClosingAppsByLink({ shopId: SHOP, token: "made-up" }), (e) => e.status === 404);
  await assert.rejects(w.billing.keepClosingAppsByLink({ shopId: "other-press", token: w.token }), (e) => e.status === 404, "another shop's link does nothing");
  const kept = await w.billing.keepClosingAppsByLink({ shopId: SHOP, token: w.token });
  assert.equal(kept.plan, "both");
  assert.equal((await w.stores.subscriptions.get(SHOP)).appsClosing, null);
  await assert.rejects(w.billing.keepClosingAppsByLink({ shopId: SHOP, token: w.token }), (e) => e.status === 410, "once");
});

test("the keep link runs out when the app closes, and a new drop needs a new link", async () => {
  const w = await reminded();
  w.tick(7);
  await assert.rejects(w.billing.keepClosingAppsByLink({ shopId: SHOP, token: w.token }), (e) => e.status === 410);
  const late = await reminded();
  await late.billing.changePlan({ shopId: SHOP, plan: "both" });
  await late.billing.changePlan({ shopId: SHOP, plan: "shop" });
  await assert.rejects(late.billing.keepClosingAppsByLink({ shopId: SHOP, token: late.token }), (e) => e.status === 404, "the link was for the earlier choice");
});

test("a press can say why they dropped an app; an answer off the list changes nothing", async () => {
  const w = make();
  const row = await w.start();
  await w.payMonth(row);
  await assert.rejects(w.billing.changePlan({ shopId: SHOP, plan: "shop", reason: "made-up" }), (e) => e.status === 400);
  assert.equal((await w.stores.subscriptions.get(SHOP)).plan, "both", "nothing changed");
  await w.billing.changePlan({ shopId: SHOP, plan: "shop", reason: "not-using" });
  assert.equal((await w.registry.getShop(SHOP)).billing.appDrops.at(-1).reason, "not-using");
});

test("three days before a closed app's download ends, one last email; then its records are deleted, never sooner", async () => {
  const deleted = [];
  const w = await reminded({ deleteApp: async (entry) => void deleted.push(entry) });
  w.tick(7);
  await w.billing.closeDroppedApps();
  const { downloadUntil } = (await w.stores.subscriptions.get(SHOP)).closedApps.stockroom;
  const daysToEnd = () => (Date.parse(downloadUntil) - w.now()) / DAY;
  w.tick(daysToEnd() - 4);
  await w.billing.closeDroppedApps();
  assert.equal(w.email.list().filter((m) => m.kind === "app-download-ending").length, 0, "not yet");
  w.tick(1.5);
  await w.billing.closeDroppedApps();
  await w.billing.closeDroppedApps();
  const ending = w.email.list().filter((m) => m.kind === "app-download-ending");
  assert.equal(ending.length, 1, "once");
  assert.equal(ending[0].data.closing, "the stockroom");
  assert.deepEqual(deleted, [], "not before the 90 days are over");
  w.tick(daysToEnd() + 0.1);
  await w.billing.closeDroppedApps();
  assert.deepEqual(deleted, [], "the email went 2.5 days before the end, so the press still gets 3 full days");
  w.tick(0.5);
  await w.billing.closeDroppedApps();
  assert.deepEqual(deleted, [{ shopId: SHOP, app: "stockroom" }]);
  assert.ok((await w.registry.getShop(SHOP)).closedApps.stockroom.deletedAt);
  await w.billing.closeDroppedApps();
  assert.equal(deleted.length, 1, "deleted once");
});

test("an email sent late pushes the deletion back; a failed deletion is kept and tried again", async () => {
  let fail = "Deleting a closed app's records isn't switched on yet.";
  const deleted = [];
  const w = await reminded({ deleteApp: async (entry) => { if (fail) throw new Error(fail); deleted.push(entry); } });
  w.tick(7);
  await w.billing.closeDroppedApps();
  const { downloadUntil } = (await w.stores.subscriptions.get(SHOP)).closedApps.stockroom;
  // The sweep didn't run in the last days: the email goes out after the 90 days, and deletion waits three more days.
  w.tick((Date.parse(downloadUntil) - w.now()) / DAY + 1);
  await w.billing.closeDroppedApps();
  assert.equal(w.email.list().filter((m) => m.kind === "app-download-ending").length, 1);
  w.tick(2);
  await w.billing.closeDroppedApps();
  assert.equal((await w.registry.getShop(SHOP)).closedApps.stockroom.problem, undefined, "not tried yet");
  w.tick(1.1);
  await w.billing.closeDroppedApps();
  assert.equal((await w.registry.getShop(SHOP)).closedApps.stockroom.problem, fail);
  fail = null;
  w.tick(1);
  await w.billing.closeDroppedApps();
  assert.equal(deleted.length, 1);
  assert.equal((await w.registry.getShop(SHOP)).closedApps.stockroom.problem, null);
});

test("an app added back is never deleted", async () => {
  const deleted = [];
  const w = await reminded({ deleteApp: async (entry) => void deleted.push(entry) });
  w.tick(7);
  await w.billing.closeDroppedApps();
  await w.billing.changePlan({ shopId: SHOP, plan: "both" });
  w.tick(100);
  await w.billing.closeDroppedApps();
  assert.deepEqual(deleted, []);
  assert.equal(w.email.list().filter((m) => m.kind === "app-download-ending").length, 0);
});

test("a late last email moves the download's end too, so the date it gives is ahead and the export still holds the app", async () => {
  const { exportApps } = await import("../export/export.js");
  const w = await reminded({ deleteApp: async () => {} });
  w.tick(7);
  await w.billing.closeDroppedApps();
  const first = (await w.stores.subscriptions.get(SHOP)).closedApps.stockroom.downloadUntil;
  w.tick((Date.parse(first) - w.now()) / DAY + 1);
  await w.billing.closeDroppedApps();
  const moved = (await w.registry.getShop(SHOP)).closedApps.stockroom.downloadUntil;
  assert.equal(Date.parse(moved), w.now() + 3 * DAY);
  const sent = w.email.list().find((m) => m.kind === "app-download-ending");
  assert.ok(Date.parse(`${sent.data.date} 23:59 UTC`) > w.now(), "the date in the email hasn't passed");
  assert.equal(exportApps(await w.registry.getShop(SHOP), new Date(w.now() + 2 * DAY)).stockroom, true);
});

test("an app added back while its records are being deleted is left alone, and a later drop closes it again", async () => {
  let w;
  const deleted = [];
  w = await reminded({
    deleteApp: async (entry) => {
      await w.billing.changePlan({ shopId: SHOP, plan: "both" });
      deleted.push(entry);
    },
  });
  w.tick(7);
  await w.billing.closeDroppedApps();
  w.tick(100);
  await w.billing.closeDroppedApps();
  w.tick(3.1);
  await w.billing.closeDroppedApps();
  assert.equal(deleted.length, 1, "the deletion ran while the app was added back");
  assert.equal((await w.stores.subscriptions.get(SHOP)).closedApps.stockroom, undefined, "no entry brought back");
  const closedBefore = w.closed.length;
  await w.billing.changePlan({ shopId: SHOP, plan: "shop" });
  w.tick(31);
  await w.billing.closeDroppedApps();
  assert.equal(w.closed.length, closedBefore + 1, "the second drop closes it");
});

test("a shop deleted as a whole gets no more emails or deletions for its closed apps", async () => {
  const deleted = [];
  const w = await reminded({ deleteApp: async (entry) => void deleted.push(entry) });
  w.tick(7);
  await w.billing.closeDroppedApps();
  await w.registry.updateShop(SHOP, { closing: { stage: "deleted" } });
  w.tick(100);
  await w.billing.closeDroppedApps();
  assert.deepEqual(deleted, [], "a shop deleted as a whole is left alone");
  assert.equal(w.email.list().filter((m) => m.kind === "app-download-ending").length, 0);
});

test("one shop's trouble doesn't stop the sweep for the others, and the run still says so", async () => {
  const w = await reminded();
  await w.stores.subscriptions.set("broken-press", { shopId: "broken-press", plan: "shop", status: "active", billingEmail: "owner@example.com", appsClosing: { apps: ["stockroom"], at: new Date(w.now() + DAY).toISOString() } });
  const send = w.email.sendPlatform;
  w.email.sendPlatform = async (message) => { if (message.shopId === "broken-press") throw new Error("Resend is down"); return send(message); };
  // List the broken shop first.
  const list = w.stores.subscriptions.list;
  w.stores.subscriptions.list = async () => [...(await list())].sort((a) => (a.shopId === "broken-press" ? -1 : 1));
  w.tick(7);
  await assert.rejects(w.billing.closeDroppedApps(), /1 shop had trouble: broken-press: Resend is down/);
  assert.ok((await w.stores.subscriptions.get(SHOP)).closedApps?.stockroom, "the other shop's app still closed");
});

test("dropping an app during the trial is recorded with its answer, and marked closed", async () => {
  const w = make();
  await w.start();
  await w.billing.changePlan({ shopId: SHOP, plan: "shop", reason: "price" });
  const [drop] = (await w.registry.getShop(SHOP)).billing.appDrops;
  assert.equal(drop.app, "stockroom");
  assert.equal(drop.reason, "price");
  assert.ok(drop.closedAt);
});

test("when the one-time link can't be shown again, the reminder sends the plan page and says to sign in", async () => {
  const w = make();
  const row = await w.start();
  await w.payMonth(row);
  await w.billing.changePlan({ shopId: SHOP, plan: "shop" });
  const at = (await w.stores.subscriptions.get(SHOP)).appsClosing.at;
  // A link was made on an earlier run whose email may have gone, then that run stopped.
  await w.stores.subscriptions.set(SHOP, { ...(await w.stores.subscriptions.get(SHOP)), keepLink: { hash: "x", for: at, expiresAt: at } });
  w.tick((Date.parse(at) - START) / DAY - 6);
  await w.billing.closeDroppedApps();
  const sent = w.email.list().find((m) => m.kind === "app-closing-soon");
  assert.match(sent.data.link, /&keep=closing$/);
  assert.equal(sent.data.signIn, true);
  const mail = TEMPLATES["app-closing-soon"](sent.data, { settings: platformSettings({}), pressName: "Moth Press" });
  assert.doesNotMatch(mail.text, /no need to sign in/);
});
