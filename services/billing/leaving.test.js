// Why presses leave (code plan 19.8), on the billing side: the optional answer is kept with the cancel (billing row,
// the registry's copy and the log entry); no answer still cancels; a reason off the list is refused in plain words
// before anything reaches Stripe; keeping the plan marks the answer as one who stayed; and the page's choices are the
// same list. The door and the control room's view are in control-room/leaving.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBilling } from "./billing.js";
import { LEAVING_REASONS, LEAVING_WORDS_MAX, leavingAnswer } from "./leaving.js";
import { fakeBillingStores, fakeBillingStripe, fakePlatformEmail } from "./fakes.js";
import { createStripeApi } from "../payments/stripeApi.js";
import { platformSettings } from "../settings.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { LEAVING_CHOICES } from "../../accounts/billingWords.js";

const START = 1_800_000_000_000;
const SHOP = "moth-press";

async function make() {
  const stripe = fakeBillingStripe({ clock: () => Math.floor(START / 1000) });
  const stores = fakeBillingStores();
  const registry = fakeRegistry();
  const auditLog = fakeAuditLog();
  const billing = createBilling({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings: platformSettings({}), ...stores, registry, auditLog, email: fakePlatformEmail(), now: () => START,
  });
  await registry.createShop(SHOP, { shopId: SHOP, pressName: "Moth Press", plan: "both", status: "live" });
  await billing.startTrial({ account: { accountId: "acct-1", email: "owner@example.com" }, shopId: SHOP, pressName: "Moth Press", plan: "both" });
  const cancels = () => stripe.requests.filter((r) => r.method === "POST" && r.params.cancel_at_period_end === "true");
  const events = () => [...registry.events.get(SHOP).values()];
  return { billing, stores, registry, stripe, cancels, events };
}

test("the answer is kept with the cancel: on the billing row, the registry's copy and the log entry", async () => {
  const w = await make();
  const row = await w.billing.cancel({ shopId: SHOP, reason: "price", words: "  Lovely, but more than we can spend this year.  " });
  assert.equal(row.cancelAtPeriodEnd, true);
  const at = new Date(START).toISOString();
  const kept = { reason: "price", words: "Lovely, but more than we can spend this year.", at };
  assert.deepEqual((await w.stores.subscriptions.get(SHOP)).leaving, kept);
  assert.deepEqual((await w.registry.getShop(SHOP)).billing.leaving, kept);
  const entry = w.events().find((e) => e.what === "cancel-requested");
  assert.deepEqual([entry.reason, entry.words], ["price", kept.words]);
});

test("no answer still cancels, with nothing kept", async () => {
  const w = await make();
  const row = await w.billing.cancel({ shopId: SHOP });
  assert.equal(row.cancelAtPeriodEnd, true);
  assert.equal(w.cancels().length, 1);
  assert.equal((await w.registry.getShop(SHOP)).billing.leaving, null);
  assert.equal(w.events().find((e) => e.what === "cancel-requested").reason, undefined);
  assert.equal(leavingAnswer({ reason: "", words: "   ", at: "x" }), null);
});

test("a reason off the list is refused in plain words, before anything is cancelled", async () => {
  const w = await make();
  await assert.rejects(w.billing.cancel({ shopId: SHOP, reason: "too-many-emails" }), (error) => {
    assert.equal(error.status, 400);
    assert.equal(error.message, "Choose one of the reasons on the list, or leave the question blank.");
    return true;
  });
  await assert.rejects(w.billing.cancel({ shopId: SHOP, reason: "price", words: { html: "<b>" } }), /plain text/);
  assert.equal(w.cancels().length, 0, "nothing reached Stripe");
  assert.equal((await w.registry.getShop(SHOP)).billing.cancelAtPeriodEnd, false);
});

test("words alone count as 'other', and are trimmed to 500 characters", () => {
  assert.deepEqual(leavingAnswer({ words: "We're taking a year off.", at: "t" }), { reason: "other", words: "We're taking a year off.", at: "t" });
  assert.equal(leavingAnswer({ reason: "moving", words: "x".repeat(900), at: "t" }).words.length, LEAVING_WORDS_MAX);
});

test("keeping the plan afterwards keeps the answer, marked as one who stayed", async () => {
  const w = await make();
  await w.billing.cancel({ shopId: SHOP, reason: "missing-feature", words: "Gift cards" });
  await w.billing.keep({ shopId: SHOP });
  const leaving = (await w.registry.getShop(SHOP)).billing.leaving;
  assert.equal(leaving.reason, "missing-feature");
  assert.equal(leaving.keptAt, new Date(START).toISOString());
});

test("the page offers the same reasons as the service, as an optional question on the cancel confirmation", () => {
  assert.deepEqual(LEAVING_CHOICES.map(([id]) => id), Object.keys(LEAVING_REASONS));
  const page = readFileSync(new URL("../../accounts/billing.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../accounts/billing.js", import.meta.url), "utf8");
  for (const id of ["cancel-form", "leaving-choices", "leaving-words", "cancel-confirm", "cancel-back"]) assert.match(page, new RegExp(`id="${id}"`), id);
  assert.match(page, /\(optional\)/);
  assert.match(page, /maxlength="500"/);
  assert.match(app, /type: "radio", name: "reason"/);
  assert.doesNotMatch(app, /window\.confirm\(billingWords/, "the cancel asks on the page, not in a pop-up");
});
