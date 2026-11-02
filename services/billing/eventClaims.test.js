// Each payment message handled exactly once (code plan 19.4): two copies of one Stripe event delivered together are
// handled once, the other copy is told to come back later (409); a failure gives the claim back so Stripe's next try is
// handled; a claim left by a handler that crashed is taken over after five minutes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBilling } from "./billing.js";
import { CLAIM_HOLD_MS, IN_PROGRESS_STATUS, claimEvent } from "./eventClaims.js";
import { fakeBillingStores, fakeBillingStripe, fakeEventClaims, fakePlatformEmail } from "./fakes.js";
import { createStripeApi } from "../payments/stripeApi.js";
import { signatureHeader } from "../payments/stripeSignature.js";
import { platformSettings } from "../settings.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";

const SECRET = "whsec_claims_test";
const NOW = 1_800_000_000_000;
const ACCOUNT = { accountId: "acct-owner-1", email: "owner@example.com", name: "Ada" };

async function make() {
  const stripe = fakeBillingStripe({ clock: () => NOW / 1000 });
  const stores = fakeBillingStores();
  const email = fakePlatformEmail();
  const billing = createBilling({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings: platformSettings({}), ...stores, registry: fakeRegistry(), auditLog: fakeAuditLog(), email, webhookSecrets: [SECRET], now: () => NOW,
  });
  const row = await billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "both" });
  const deleted = { ...stripe.subscription(row.subscriptionId), status: "canceled" };
  const deliver = (id) => {
    const rawBody = JSON.stringify({ id, type: "customer.subscription.deleted", livemode: false, data: { object: deleted } });
    return billing.handleEvent({ headers: { "Stripe-Signature": signatureHeader(SECRET, rawBody, NOW / 1000) }, rawBody });
  };
  const ended = () => email.list().filter((m) => m.kind === "subscription-ended").length;
  return { stores, deliver, ended };
}

test("two copies of one event delivered together: exactly one is handled, the other is sent back to try later", async () => {
  const { stores, deliver, ended } = await make();
  const answers = await Promise.all([deliver("evt_twice"), deliver("evt_twice")]);
  const statuses = answers.map((a) => a.status).sort();
  assert.deepEqual(statuses, [200, IN_PROGRESS_STATUS]);
  assert.equal(IN_PROGRESS_STATUS, 409);
  assert.equal(answers.find((a) => a.status === 409).body.inProgress, true);
  assert.equal(ended(), 1, "one ended email");
  assert.equal(stores.events.rows.get("evt_twice").state, "done");
  // Stripe sends the copy again later: it is done by then.
  const later = await deliver("evt_twice");
  assert.deepEqual([later.status, later.body.duplicate], [200, true]);
  assert.equal(ended(), 1);
});

test("a failure gives the claim back, so the retry is handled", async () => {
  const { stores, deliver, ended } = await make();
  const set = stores.subscriptions.set;
  stores.subscriptions.set = async () => { throw new Error("the store is down (pretend error)"); };
  assert.equal((await deliver("evt_retry")).status, 500);
  assert.equal(stores.events.rows.has("evt_retry"), false, "released");
  stores.subscriptions.set = set;
  const retry = await deliver("evt_retry");
  assert.equal(retry.status, 200);
  assert.equal(retry.body.duplicate, undefined);
  assert.equal(ended(), 1);
});

test("a claim from a handler that crashed is taken over after five minutes, not before", async () => {
  const { stores, deliver, ended } = await make();
  // A fresh claim (a minute old) holds: the copy is sent back.
  await stores.events.claim("evt_stuck", { at: new Date(NOW - 60_000).toISOString(), holdMs: CLAIM_HOLD_MS });
  assert.equal((await deliver("evt_stuck")).status, 409);
  assert.equal(ended(), 0);
  // Six minutes old: the next delivery takes it over and handles the event.
  stores.events.rows.set("evt_stuck", { state: "claimed", claimedAt: new Date(NOW - 6 * 60_000).toISOString() });
  assert.equal((await deliver("evt_stuck")).status, 200);
  assert.equal(ended(), 1);
  assert.equal(stores.events.rows.get("evt_stuck").state, "done");
});

test("the store: create-if-absent claims, release only drops a claim, and an older store without claim still works", async () => {
  const events = fakeEventClaims();
  const at = new Date(NOW).toISOString();
  assert.deepEqual(await Promise.all([events.claim("e1", { at }), events.claim("e1", { at })]), [true, false]);
  await events.mark("e1", { type: "x", at });
  await events.release("e1");
  assert.equal(await events.seen("e1"), true, "release never undoes a handled event");
  assert.equal(await events.claim("e1", { at: new Date(NOW + 3_600_000).toISOString() }), false, "a handled event is never claimed again");
  assert.equal(await claimEvent(events, "e1", { at }), "duplicate");

  const old = new Map();
  const older = { seen: async (id) => old.has(id), mark: async (id, entry) => void old.set(id, entry) };
  assert.equal(await claimEvent(older, "e2", { at }), "claimed");
  await older.mark("e2", {});
  assert.equal(await claimEvent(older, "e2", { at }), "duplicate");
});
