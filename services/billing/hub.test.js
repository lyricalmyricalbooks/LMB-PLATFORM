// The billing hub's server side (code plan 22.1-22.5) against a pretend Stripe: the founding offer given for real, saved
// cards, billing details with a GST/HST number, the next bill, paying a declined bill now, the bank asking to confirm a
// payment, a payment recovered, and Stripe calls tried again when Stripe is briefly out of reach.
import { TIERED_PRICES_ENV } from "./fakes.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBilling } from "./billing.js";
import { createPaymentWay } from "./paymentWay.js";
import { fakeBillingStores, fakeBillingStripe, fakeFoundingSeats, fakePlatformEmail } from "./fakes.js";
import { foundingCouponId, foundingOfferOf } from "./founding.js";
import { addressOf, taxNumberOf } from "./hub.js";
import { retryable, safeToRepeat, withRetries } from "./stripeRetry.js";
import { BillingError } from "./billing.js";
import { createStripeApi } from "../payments/stripeApi.js";
import { signatureHeader } from "../payments/stripeSignature.js";
import { platformSettings, DEFAULT_SETTINGS } from "../settings.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";

const SECRET = "whsec_hub_test";
const NOW = 1_800_000_000_000;
const ACCOUNT = { accountId: "acct-owner-1", email: "owner@example.com", name: "Ada" };

function make({ presses = 25, percentOff = 25, tax = false } = {}) {
  const stripe = fakeBillingStripe({ clock: () => NOW / 1000 });
  const stores = fakeBillingStores();
  const registry = fakeRegistry();
  const auditLog = fakeAuditLog();
  const email = fakePlatformEmail();
  const seats = fakeFoundingSeats();
  const live = async () => ({ ...DEFAULT_SETTINGS, payAsYouSell: { basisPoints: 200 }, foundingOffer: { percentOff, presses } });
  const waits = [];
  const billing = createBilling({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings: platformSettings(TIERED_PRICES_ENV), ...stores, registry, auditLog, email, webhookSecrets: [SECRET], tax, live, foundingSeats: seats,
    sleep: async (ms) => void waits.push(ms), now: () => NOW,
  });
  let n = 0;
  const event = (type, object) => {
    const rawBody = JSON.stringify({ id: `evt_${(n += 1)}`, type, livemode: false, created: NOW / 1000 + n, data: { object } });
    return billing.handleEvent({ headers: { "Stripe-Signature": signatureHeader(SECRET, rawBody, NOW / 1000) }, rawBody });
  };
  const start = async (shopId = "moth-press", account = ACCOUNT) => {
    await registry.createShop(shopId, { shopId, projectId: shopId, plan: "both", ownerEmail: account.email });
    return billing.startTrial({ account, shopId, pressName: "Moth Press", plan: "both" });
  };
  const addCard = async (shopId = "moth-press", card = "pm_card_visa") => {
    const { url } = await billing.cardLink({ shopId, returnUrl: "https://platform.example/account/billing?shop=" + shopId });
    return event("checkout.session.completed", stripe.completeSetup(url.split("/").pop(), card));
  };
  return { stripe, stores, registry, auditLog, email, seats, billing, event, start, addCard, waits, live };
}

test("the first card makes a press a founding one: a place is taken and 25% comes off every bill, for good", async () => {
  const { billing, stripe, stores, registry, seats, start, addCard } = make();
  await start();
  assert.equal(seats.rows.size, 0, "a trial alone isn't paying yet");
  await addCard();
  const row = stores.subscriptions.rows.get("moth-press");
  assert.equal(row.founding, true);
  assert.equal(row.foundingPercentOff, 25);
  assert.equal((await registry.getShop("moth-press")).founding, true);
  const sub = stripe.world.subscriptions.get(row.subscriptionId);
  assert.equal(sub.coupon, foundingCouponId(25));
  assert.deepEqual(stripe.world.coupons.get("colophon_founding_25"), { id: "colophon_founding_25", percent_off: 25, duration: "forever", name: "Colophon founding press (25% off)" });
  const status = await billing.status("moth-press");
  assert.deepEqual(status.founding, { percentOff: 25, price: "$29.25" });

  // A second card, or the same event again, never takes a second place or a second coupon call.
  const couponCalls = () => stripe.requests.filter((r) => r.path === "/v1/coupons" && r.method === "POST").length;
  await billing.applyFounding("moth-press");
  assert.equal(couponCalls(), 1);
  assert.equal(seats.rows.size, 1);
});

test("once the founding places are gone, the next paying press pays the full price", async () => {
  const { stores, seats, start, addCard, stripe } = make({ presses: 1 });
  await start("first-press", { accountId: "a1", email: "one@example.com" });
  await start("second-press", { accountId: "a2", email: "two@example.com" });
  await addCard("first-press");
  await addCard("second-press");
  assert.equal(stores.subscriptions.rows.get("first-press").founding, true);
  assert.equal(stores.subscriptions.rows.get("second-press").founding, undefined);
  assert.equal(seats.rows.size, 1);
  assert.equal(stripe.world.subscriptions.get(stores.subscriptions.rows.get("second-press").subscriptionId).coupon ?? null, null);
});

test("the founding offer turned off in the settings gives no place", async () => {
  const { stores, start, addCard } = make({ percentOff: 0 });
  await start();
  await addCard();
  assert.equal(stores.subscriptions.rows.get("moth-press").founding, undefined);
  assert.equal(foundingOfferOf({ foundingOffer: { percentOff: 25, presses: 0 } }), null);
});

test("choosing pay as you sell makes a press paying too: a founding place, with 25% off the share and the cap", async () => {
  const { billing, stores, registry, auditLog, seats, start, live, stripe } = make();
  await start();
  const paymentWay = createPaymentWay({ stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake" } }), mode: "test", settings: platformSettings(TIERED_PRICES_ENV), ...stores, registry, auditLog, billing, live, now: () => NOW });
  await paymentWay.switchPaymentWay({ shopId: "moth-press", to: "payAsYouSell" });
  assert.equal(seats.rows.size, 1);
  assert.equal(stores.subscriptions.rows.get("moth-press").founding, true);
  const terms = (await registry.getShop("moth-press")).payAsYouSell;
  assert.deepEqual([terms.basisPoints, terms.capMinor], [150, 2925]);
});

test("a stockroom-only press asking for pay as you sell is refused without taking a founding place", async () => {
  const { billing, stores, registry, auditLog, seats, live, stripe } = make();
  await registry.createShop("store-only", { shopId: "store-only", plan: "stockroom", ownerEmail: ACCOUNT.email });
  await billing.startTrial({ account: ACCOUNT, shopId: "store-only", pressName: "Store", plan: "stockroom" });
  const paymentWay = createPaymentWay({ stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake" } }), mode: "test", settings: platformSettings(TIERED_PRICES_ENV), ...stores, registry, auditLog, billing, live, now: () => NOW });
  await assert.rejects(paymentWay.switchPaymentWay({ shopId: "store-only", to: "payAsYouSell" }), /stockroom on its own/);
  assert.equal(seats.rows.size, 0);
});

test("saved cards: primary first, another made primary pays the plan, and the primary can't be removed", async () => {
  const { billing, stripe, stores, start, addCard, registry } = make();
  await start();
  await addCard("moth-press", "pm_card_visa");
  const customer = stores.subscriptions.rows.get("moth-press").customerId;
  stripe.world.paymentMethods.set("pm_card_mc", { id: "pm_card_mc", type: "card", card: { brand: "mastercard", last4: "4444", exp_month: 1, exp_year: 2020 } });
  stripe.attach(customer, "pm_card_mc");

  const { cards } = await billing.paymentMethods("moth-press");
  assert.deepEqual(cards.map((c) => [c.words, c.primary, c.expired]), [["Visa ending 4242", true, false], ["Mastercard ending 4444", false, true]]);

  await assert.rejects(billing.removeCard({ shopId: "moth-press", cardId: "pm_card_visa" }), (e) => e.status === 409 && /Make another card primary first/.test(e.message));
  assert.deepEqual(await billing.makePrimary({ shopId: "moth-press", cardId: "pm_card_mc" }), { changed: true });
  const row = stores.subscriptions.rows.get("moth-press");
  assert.equal(row.card.id, "pm_card_mc");
  assert.equal(stripe.world.subscriptions.get(row.subscriptionId).default_payment_method, "pm_card_mc");
  assert.equal(stripe.world.customers.get(customer).defaultCard, "pm_card_mc");
  assert.deepEqual(await billing.makePrimary({ shopId: "moth-press", cardId: "pm_card_mc" }), { changed: false });

  assert.deepEqual(await billing.removeCard({ shopId: "moth-press", cardId: "pm_card_visa" }), { removed: true });
  assert.deepEqual((await billing.paymentMethods("moth-press")).cards.map((c) => c.id), ["pm_card_mc"]);
  assert.deepEqual(await billing.removeCard({ shopId: "moth-press", cardId: "pm_card_visa" }), { removed: false }, "removing twice is fine");
  await assert.rejects(billing.makePrimary({ shopId: "moth-press", cardId: "pm_someone_else" }), (e) => e.status === 404);
  const logged = (await registry.getShop("moth-press")).events?.map?.((e) => e.what) ?? null;
  if (logged) assert.ok(logged.includes("card-removed") && logged.includes("card-made-primary"));
});

test("a card paying another shop of the same account can't be removed from this one", async () => {
  const { billing, stripe, stores, start, addCard } = make();
  await start("moth-press");
  await start("second-shop");
  await addCard("moth-press", "pm_card_visa");
  await addCard("second-shop", "pm_card_two");
  // moth-press moves to the second card; the first still pays second-shop? No: give second-shop the first card.
  await billing.makePrimary({ shopId: "second-shop", cardId: "pm_card_visa" });
  await billing.makePrimary({ shopId: "moth-press", cardId: "pm_card_two" });
  await assert.rejects(billing.removeCard({ shopId: "moth-press", cardId: "pm_card_visa" }), /another shop on your account/);
  assert.ok(stripe.world.paymentMethods.get("pm_card_visa").customer, "still saved");
  assert.equal(stores.subscriptions.rows.get("second-shop").card.id, "pm_card_visa");
});

test("billing details: name, email for bills, address and a GST/HST number, kept on Stripe and printed on bills", async () => {
  const { billing, stripe, stores, start, addCard } = make({ tax: true });
  await start();
  await addCard();
  await billing.saveBillingDetails({ shopId: "moth-press", name: "Moth Press Inc.", email: "Books@Moth.example", address: { line1: "1 King St W", city: "Toronto", state: "on", postalCode: "m5h 1a1" }, taxNumber: "123456789 RT 0001" });
  const row = stores.subscriptions.rows.get("moth-press");
  assert.equal(row.billingEmail, "books@moth.example", "Colophon's billing emails follow");
  const customer = stripe.world.customers.get(row.customerId);
  assert.deepEqual([customer.name, customer.email, customer.address.city, customer.address.state, customer.address.postal_code], ["Moth Press Inc.", "books@moth.example", "Toronto", "ON", "M5H 1A1"]);
  assert.equal(stripe.world.subscriptions.get(row.subscriptionId).automatic_tax.enabled, true, "an address lets Stripe Tax work");
  const details = await billing.billingDetails("moth-press");
  assert.deepEqual([details.taxNumber, details.taxLabel, details.address.postalCode, details.plusTax], ["123456789RT0001", "GST/HST", "M5H 1A1", true]);

  // A new number replaces the old one; saving the same again changes nothing.
  await billing.saveBillingDetails({ shopId: "moth-press", name: "Moth Press Inc.", email: "books@moth.example", address: null, taxNumber: "1234567890TQ0001" });
  await billing.saveBillingDetails({ shopId: "moth-press", name: "Moth Press Inc.", email: "books@moth.example", address: null, taxNumber: "1234567890TQ0001" });
  assert.deepEqual([...stripe.world.taxIds.values()].map((t) => [t.type, t.value]), [["ca_qst", "1234567890TQ0001"]]);
  await billing.saveBillingDetails({ shopId: "moth-press", name: "", email: "books@moth.example", taxNumber: "" });
  assert.equal(stripe.world.taxIds.size, 0, "an empty number takes it off");
});

test("billing details refuse what can't be right, in plain words", async () => {
  const { billing, start } = make();
  await start();
  await assert.rejects(billing.saveBillingDetails({ shopId: "moth-press", email: "not an email" }), /email address your bills/);
  await assert.rejects(billing.saveBillingDetails({ shopId: "moth-press", email: "a@b.example", taxNumber: "12345" }), /123456789 RT 0001/);
  await assert.rejects(billing.saveBillingDetails({ shopId: "moth-press", email: "a@b.example", address: { line1: "1 Main", city: "Toronto", postalCode: "90210" } }), /doesn't look Canadian/);
  await assert.rejects(billing.saveBillingDetails({ shopId: "moth-press", email: "a@b.example", address: { city: "Toronto" } }), /street, the city and the postal code/);
  assert.equal(addressOf({ line1: "", city: "", postalCode: "" }, BillingError), null);
  assert.deepEqual(taxNumberOf("123456789-rt-0001", BillingError), { type: "ca_gst_hst", value: "123456789RT0001" });
});

test("the next bill: date, lines, the founding discount and the total; none once cancelled", async () => {
  const { billing, start, addCard } = make();
  await start();
  await addCard();
  const bill = await billing.upcomingBill("moth-press");
  assert.equal(bill.subtotal, "$39.00");
  assert.equal(bill.discount, "$9.75");
  assert.equal(bill.total, "$29.25");
  assert.equal(bill.lines.length, 1);
  assert.ok(bill.date);
  await billing.cancel({ shopId: "moth-press" });
  assert.equal(await billing.upcomingBill("moth-press"), null);
});

test("a declined payment: the problem shows, Pay now pays it, and the paid bill clears it with one email", async () => {
  const { billing, stripe, stores, event, email, start, addCard } = make();
  await start();
  await addCard();
  const row = stores.subscriptions.rows.get("moth-press");
  const invoice = stripe.pastDue(row.subscriptionId);
  await event("customer.subscription.updated", stripe.subscription(row.subscriptionId));
  await event("invoice.payment_failed", { ...invoice, amount_due: 2925, attempt_count: 1, next_payment_attempt: NOW / 1000 + 3 * 86400 });
  let status = await billing.status("moth-press");
  assert.equal(status.paymentProblem.kind, "declined");
  assert.equal(status.paymentProblem.amount, "$29.25");
  assert.equal(status.canPayNow, true);

  stripe.world.payFails = { code: "card_declined" };
  await assert.rejects(billing.payNow({ shopId: "moth-press" }), (e) => e.status === 402 && /declined the payment again/.test(e.message));
  stripe.world.payFails = null;
  assert.deepEqual(await billing.payNow({ shopId: "moth-press" }), { paid: true });
  assert.equal(stores.subscriptions.rows.get("moth-press").status, "active");
  const pays = stripe.requests.filter((r) => r.path === `/v1/invoices/${invoice.id}/pay`);
  assert.notEqual(pays[0].headers["Idempotency-Key"], pays[1].headers["Idempotency-Key"], "a second try is a new try, a repeat of one try isn't");

  await event("invoice.paid", { ...invoice, status: "paid", amount_paid: 2925 });
  status = await billing.status("moth-press");
  assert.equal(status.paymentProblem, null);
  assert.equal(email.list().filter((m) => m.kind === "payment-received").length, 1);
  await assert.rejects(billing.payNow({ shopId: "moth-press" }), /nothing to pay/);
});

test("the bank asks the press to confirm: the hub shows Stripe's page, and Pay now says so too", async () => {
  const { billing, stripe, stores, event, email, start, addCard } = make();
  await start();
  await addCard();
  const row = stores.subscriptions.rows.get("moth-press");
  const invoice = stripe.pastDue(row.subscriptionId);
  await event("customer.subscription.updated", stripe.subscription(row.subscriptionId));
  await event("invoice.payment_action_required", { ...invoice, amount_due: 2925 });
  const status = await billing.status("moth-press");
  assert.equal(status.paymentProblem.kind, "confirm");
  assert.equal(status.paymentProblem.pageUrl, invoice.hosted_invoice_url);
  assert.equal(email.list().filter((m) => m.kind === "payment-needs-confirming").length, 1);
  stripe.world.payFails = { code: "invoice_payment_intent_requires_action", status: 400, type: "invalid_request_error" };
  assert.deepEqual(await billing.payNow({ shopId: "moth-press" }), { needsConfirming: true, url: invoice.hosted_invoice_url });
});

test("an ordinary monthly bill paid sends a receipt once, with its number, period, tax and link; a $0 bill sends none", async () => {
  const { billing, stripe, stores, event, email, start, addCard } = make();
  await start();
  await addCard();
  assert.deepEqual(email.list().map((m) => m.kind), ["card-changed"], "the new card is a safety notice");
  const subscriptionId = stores.subscriptions.rows.get("moth-press").subscriptionId;
  const free = stripe.addInvoice(subscriptionId, { total: 0, amount_paid: 0 });
  assert.equal((await event("invoice.paid", free)).body.handled, "paid");
  assert.equal(email.list().length, 1, "no receipt for a $0 bill");

  const start1 = Date.UTC(2026, 10, 4, 17) / 1000;
  const end1 = Date.UTC(2026, 11, 4, 17) / 1000;
  const invoice = stripe.addInvoice(subscriptionId, {
    amount_paid: 4407, total_taxes: [{ amount: 507 }], status_transitions: { paid_at: start1 },
    lines: { data: [{ period: { start: start1, end: end1 } }] },
  });
  assert.equal((await event("invoice.paid", invoice)).body.handled, "paid");
  assert.equal((await event("invoice.paid", invoice)).body.handled, "paid");
  const receipts = email.list().filter((m) => m.kind === "bill-paid");
  assert.equal(receipts.length, 1, "keyed on the bill: a second event sends nothing");
  const { data, to } = receipts[0];
  assert.equal(to, stores.subscriptions.rows.get("moth-press").billingEmail);
  assert.equal(data.price, "$44.07");
  assert.equal(data.number, invoice.number);
  assert.equal(data.tax, "$5.07");
  assert.equal(data.from, "November 4, 2026");
  assert.equal(data.to, "December 4, 2026");
  assert.equal(data.bill, invoice.hosted_invoice_url);
  assert.equal((await billing.status("moth-press")).paymentProblem, null);
});

test("Stripe briefly out of reach: safe calls are tried again, refusals and unsafe calls are not", async () => {
  const { billing, stripe, waits, start } = make();
  stripe.world.down = 2;
  await start();
  assert.deepEqual(waits, [300, 1200]);
  assert.equal(stripe.requests.filter((r) => r.path === "/v1/customers").length, 3, "the first call, turned away twice, then made");

  assert.equal(retryable({ type: "api_connection_error" }), true);
  assert.equal(retryable({ statusCode: 429 }), true);
  assert.equal(retryable({ statusCode: 402 }), false);
  assert.equal(retryable({ statusCode: 500 }), true, "a read after a Stripe-side error");
  assert.equal(retryable({ statusCode: 500 }, { keyed: true }), false, "Stripe keeps a 500 against its key: the same key would get it again");
  assert.equal(retryable({ statusCode: 503, code: "platform_key_missing" }), false);
  assert.equal(safeToRepeat("POST", {}), false);
  assert.equal(safeToRepeat("POST", { idempotencyKey: "k" }), true);
  let tries = 0;
  const once = withRetries(async () => { tries += 1; throw Object.assign(new Error("busy"), { statusCode: 503 }); }, { sleep: async () => {} });
  await assert.rejects(once("test", "POST", "/v1/checkout/sessions", {}));
  assert.equal(tries, 1, "a POST without a key is never sent twice");
  tries = 0;
  const read = withRetries(async () => { tries += 1; if (tries < 3) throw Object.assign(new Error("busy"), { statusCode: 503 }); return { ok: true }; }, { sleep: async () => {} });
  assert.deepEqual(await read("test", "GET", "/v1/invoices", {}), { ok: true });
  assert.equal(tries, 3);
});

test("the card page may come back to this shop's own admin, but not another shop's or a stranger's", async () => {
  const { billing, start, registry } = make();
  await start();
  await registry.createShop("press-two", { shopId: "press-two", plan: "shop" });
  const { url } = await billing.cardLink({ shopId: "moth-press", returnUrl: "https://moth-press.web.app/admin#settings/billing" });
  assert.ok(url);
  await assert.rejects(billing.cardLink({ shopId: "moth-press", returnUrl: "https://press-two.web.app/admin" }), /this shop's admin/);
  await assert.rejects(billing.cardLink({ shopId: "moth-press", returnUrl: "https://moth-press.web.app.evil.example/admin" }), /this shop's admin/);
});

// The fresh-eyes review's cases (22.1-22.5): each was a real way for a press to pay too much, get stuck or see the wrong thing.

test("a founding press whose trial ended without a card pays the founding price on the bill that reopens the shop", async () => {
  const { stripe, stores, event, start, addCard, email } = make();
  await start();
  const subId = stores.subscriptions.rows.get("moth-press").subscriptionId;
  await event("customer.subscription.updated", stripe.endTrial(subId));
  assert.equal(stores.subscriptions.rows.get("moth-press").status, "paused");
  await addCard();
  // The card that reopened the shop says so, and doesn't also send the plain card notice (25.3).
  const sent = email.list().map((m) => m.kind);
  assert.equal(sent.filter((k) => k === "shop-reopened").length, 1);
  assert.equal(sent.includes("card-changed"), false);
  assert.match(email.list().find((m) => m.kind === "shop-reopened").data.card, /ending/);
  const sub = stripe.world.subscriptions.get(subId);
  assert.equal(sub.status, "active");
  assert.equal(stripe.world.invoices.get(sub.latest_invoice).total, 2925, "$39 less 25%, on the very first bill");
  assert.equal(stores.subscriptions.rows.get("moth-press").founding, true);
});

test("a shop started without a trial gets the founding price on its first bill", async () => {
  const { stripe, stores, start, addCard } = make();
  await start("moth-press");
  await start("press-two"); // the account's trial is used, so this plan waits for its first payment
  const row = stores.subscriptions.rows.get("press-two");
  assert.equal(row.status, "incomplete");
  assert.equal(row.founding, true);
  const sub = stripe.world.subscriptions.get(row.subscriptionId);
  assert.equal(stripe.world.invoices.get(sub.latest_invoice).total, 2925);
  await addCard("press-two");
  assert.equal(stores.subscriptions.rows.get("press-two").foundingOn, row.subscriptionId);
});

test("making a saved card primary on a paused shop reopens it and makes it a founding press, like adding a card", async () => {
  const { billing, stripe, stores, event, start, addCard } = make();
  await start("moth-press");
  await addCard("moth-press", "pm_card_visa");
  await start("press-two");
  const two = stores.subscriptions.rows.get("press-two");
  // press-two started with no trial and no card; pretend its first bill lapsed into a pause.
  stripe.world.subscriptions.get(two.subscriptionId).status = "paused";
  await event("customer.subscription.updated", stripe.subscription(two.subscriptionId));
  assert.deepEqual(await billing.makePrimary({ shopId: "press-two", cardId: "pm_card_visa" }), { changed: true });
  const after = stores.subscriptions.rows.get("press-two");
  assert.equal(after.status, "active");
  assert.equal(after.founding, true);
  assert.equal(stripe.world.subscriptions.get(two.subscriptionId).coupon, foundingCouponId(25));
  assert.equal(stripe.world.subscriptions.get(two.subscriptionId).default_payment_method, "pm_card_visa");
});

test("a card Stripe says pays the plan can't be removed, even before another tab's change is saved", async () => {
  const { billing, stripe, stores, start, addCard } = make();
  await start();
  await addCard("moth-press", "pm_card_visa");
  const row = stores.subscriptions.rows.get("moth-press");
  stripe.world.paymentMethods.set("pm_card_mc", { id: "pm_card_mc", type: "card", card: { brand: "mastercard", last4: "4444", exp_month: 1, exp_year: 2031 } });
  stripe.attach(row.customerId, "pm_card_mc");
  stripe.world.subscriptions.get(row.subscriptionId).default_payment_method = "pm_card_mc"; // Stripe already moved
  await assert.rejects(billing.removeCard({ shopId: "moth-press", cardId: "pm_card_mc" }), (e) => e.status === 409);
});

test("a billing-details save that fails halfway can be corrected and saved again at once", async () => {
  const { billing, stripe, start, addCard } = make({ tax: true });
  await start();
  await addCard();
  stripe.world.failOnce = /^POST \/v1\/subscriptions\//;
  await assert.rejects(billing.saveBillingDetails({ shopId: "moth-press", name: "Moth", email: "books@moth.example", address: { line1: "1 King St W", city: "Toronto", state: "ON", postalCode: "M5H 1A1" }, taxNumber: "" }));
  assert.deepEqual(await billing.saveBillingDetails({ shopId: "moth-press", name: "Moth Press", email: "books@moth.example", address: { line1: "2 King St W", city: "Toronto", state: "ON", postalCode: "M5H 1A1" }, taxNumber: "" }), { saved: true });
  assert.equal((await billing.billingDetails("moth-press")).address.line1, "2 King St W");
});

test("a tax number taken off and put back the same day is really back on the bills", async () => {
  const { billing, start, addCard } = make();
  await start();
  await addCard();
  const save = (taxNumber) => billing.saveBillingDetails({ shopId: "moth-press", name: "Moth", email: "books@moth.example", address: null, taxNumber });
  await save("123456789RT0001");
  await save("");
  assert.equal((await billing.billingDetails("moth-press")).taxNumber, "");
  await save("123456789RT0001");
  assert.equal((await billing.billingDetails("moth-press")).taxNumber, "123456789RT0001");
});

test("a payment failure that arrives after its bill was paid shows nothing and sends nothing", async () => {
  const { billing, stripe, stores, event, email, start, addCard } = make();
  await start();
  await addCard();
  const row = stores.subscriptions.rows.get("moth-press");
  const invoice = stripe.addInvoice(row.subscriptionId, { status: "open", amount_due: 2925 });
  await event("invoice.paid", { ...invoice, status: "paid", amount_paid: 2925 });
  assert.equal((await event("invoice.payment_failed", { ...invoice, status: "open", amount_due: 2925, attempt_count: 1 })).body.handled, "already paid");
  assert.equal((await event("invoice.payment_action_required", { ...invoice, status: "open", amount_due: 2925 })).body.handled, "already paid");
  assert.equal((await billing.status("moth-press")).paymentProblem, null);
  assert.equal(email.list().filter((m) => m.kind === "payment-failed" || m.kind === "payment-needs-confirming").length, 0);
});

test("a problem left from a bill settled some other way stops showing once the plan is paid up", async () => {
  const { billing, stripe, stores, event, start, addCard } = make();
  await start();
  await addCard();
  const row = stores.subscriptions.rows.get("moth-press");
  const invoice = stripe.pastDue(row.subscriptionId);
  await event("customer.subscription.updated", stripe.subscription(row.subscriptionId));
  await event("invoice.payment_failed", { ...invoice, amount_due: 3900 });
  assert.ok((await billing.status("moth-press")).paymentProblem);
  await event("customer.subscription.updated", stripe.payMonth(row.subscriptionId));
  assert.equal((await billing.status("moth-press")).paymentProblem, null);
});

test("the bank's confirm email opens Stripe's page for that bill", async () => {
  const { stripe, stores, event, email, start, addCard } = make();
  await start();
  await addCard();
  const row = stores.subscriptions.rows.get("moth-press");
  const invoice = stripe.pastDue(row.subscriptionId);
  await event("invoice.payment_action_required", { ...invoice, amount_due: 2925 });
  const sent = email.list().find((m) => m.kind === "payment-needs-confirming");
  assert.equal(sent.data.link, invoice.hosted_invoice_url);
});

test("the control room counts a founding press at its founding price", async () => {
  const { registry, start, addCard } = make();
  await start();
  await addCard();
  assert.equal((await registry.getShop("moth-press")).billing.percentOff, 25);
});

test("a switch to pay as you sell that Stripe refuses takes no founding place", async () => {
  const { billing, stores, registry, auditLog, seats, start, live, stripe } = make();
  await start();
  const paymentWay = createPaymentWay({ stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake" } }), mode: "test", settings: platformSettings(TIERED_PRICES_ENV), ...stores, registry, auditLog, billing, live, now: () => NOW });
  stripe.world.failOnce = /^POST \/v1\/subscriptions\//;
  await assert.rejects(paymentWay.switchPaymentWay({ shopId: "moth-press", to: "payAsYouSell" }));
  assert.equal(seats.rows.size, 0);
});

test("the Billing page is told when the paying card runs out within a month, or has", async () => {
  const { billing, stripe, stores, start, addCard } = make();
  await start();
  stripe.world.paymentMethods.set("pm_card_soon", { id: "pm_card_soon", type: "card", card: { brand: "visa", last4: "1111", exp_month: 2, exp_year: 2027 } });
  await addCard("moth-press", "pm_card_soon");
  // NOW is 15 January 2027: the card works until the end of February, so it's more than a month away.
  assert.equal(new Date(NOW).toISOString().slice(0, 10), "2027-01-15");
  assert.equal((await billing.status("moth-press")).cardRunsOut, null);
  stores.subscriptions.rows.get("moth-press").card.expMonth = 1;
  assert.deepEqual((await billing.status("moth-press")).cardRunsOut, { ends: "2027-01-31T23:59:59.999Z", expired: false });
  stores.subscriptions.rows.get("moth-press").card = { ...stores.subscriptions.rows.get("moth-press").card, expMonth: 12, expYear: 2026 };
  assert.equal((await billing.status("moth-press")).cardRunsOut.expired, true);
});

test("a founding press that leaves before paying anything gives its place back; one that paid keeps it", async () => {
  const { stripe, stores, registry, seats, event, start, addCard } = make({ presses: 1 });
  await start("moth-press", { accountId: "a1", email: "one@example.com" });
  await addCard("moth-press");
  assert.equal(seats.rows.size, 1);
  const subId = stores.subscriptions.rows.get("moth-press").subscriptionId;
  stripe.world.subscriptions.get(subId).status = "canceled";
  await event("customer.subscription.deleted", stripe.subscription(subId));
  assert.equal(seats.rows.size, 0, "the place is free for the next paying press");
  assert.equal(stores.subscriptions.rows.get("moth-press").founding, false);
  assert.equal((await registry.getShop("moth-press")).founding, false);

  await start("press-two", { accountId: "a2", email: "two@example.com" });
  await addCard("press-two");
  const two = stores.subscriptions.rows.get("press-two");
  await event("invoice.paid", stripe.addInvoice(two.subscriptionId, { amount_paid: 2925 }));
  stripe.world.subscriptions.get(two.subscriptionId).status = "canceled";
  await event("customer.subscription.deleted", stripe.subscription(two.subscriptionId));
  assert.equal(seats.rows.has("press-two"), true, "a press that paid keeps its place for good");
});

test("with 'give a place back' turned off in the control room, a place once given stays", async () => {
  const t = make();
  const live = async () => ({ ...DEFAULT_SETTINGS, foundingOffer: { percentOff: 25, presses: 25, giveBackUnpaid: false } });
  const billing = createBilling({
    stripe: createStripeApi({ fetch: t.stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings: platformSettings(TIERED_PRICES_ENV), ...t.stores, registry: t.registry, auditLog: t.auditLog, email: t.email, webhookSecrets: [SECRET], live, foundingSeats: t.seats, sleep: async () => {}, now: () => NOW,
  });
  await t.registry.createShop("moth-press", { shopId: "moth-press", projectId: "moth-press", plan: "both", ownerEmail: ACCOUNT.email });
  await billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "both" });
  await billing.claimFounding("moth-press");
  const subId = t.stores.subscriptions.rows.get("moth-press").subscriptionId;
  t.stripe.world.subscriptions.get(subId).status = "canceled";
  const rawBody = JSON.stringify({ id: "evt_off", type: "customer.subscription.deleted", livemode: false, created: NOW / 1000 + 50, data: { object: t.stripe.subscription(subId) } });
  await billing.handleEvent({ headers: { "Stripe-Signature": signatureHeader(SECRET, rawBody, NOW / 1000) }, rawBody });
  assert.equal(t.seats.rows.size, 1);
});

test("a Quebec billing address sets the province on every shop the account pays for, and on its next new shop", async () => {
  const { billing, stores, start } = make();
  await start();
  await start("second-shop");
  await billing.saveBillingDetails({ shopId: "moth-press", name: "", email: "books@moth.example", address: { line1: "1 rue Saint-Denis", city: "Montréal", state: "qc", postalCode: "h2x 1k1", country: "CA" }, taxNumber: "" });
  assert.equal(stores.subscriptions.rows.get("moth-press").province, "QC");
  assert.equal(stores.subscriptions.rows.get("second-shop").province, "QC", "same account, same address");
  await start("third-shop");
  assert.equal(stores.subscriptions.rows.get("third-shop").province, "QC", "a later shop of the account starts with it");
});
