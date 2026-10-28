// Closing (code plan 6.8) with fakes: 60 days paused -> closed, 90 days to download, warnings 30 and 7 days before,
// then the project is deleted through a pretend client. Dates, emails once each, nothing deleted before the notice,
// re-run safe, and the hooks the Google teardown (row 6.20) hangs on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBilling } from "./billing.js";
import { createClosingSweep, deletionAllowed, DOWNLOAD_DAYS, PAUSED_DAYS } from "./closing.js";
import { fakeBillingStores, fakeBillingStripe, fakePlatformEmail } from "./fakes.js";
import { fakeProjects } from "./closingFakes.js";
import { PLAN_DOC, shopPlanCopies } from "./shopPlan.js";
import { createStripeApi } from "../payments/stripeApi.js";
import { signatureHeader } from "../payments/stripeSignature.js";
import { platformSettings } from "../settings.js";
import { TEMPLATES } from "../email/templates.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { fakeShopData } from "../../accounts/fakes.js";

const SECRET = "whsec_billing_test";
const START = 1_800_000_000_000;
const DAY = 86400_000;
const ACCOUNT = { accountId: "acct-owner-1", email: "owner@example.com", name: "Ada" };
const SHOP = "moth-press";

async function make({ hooks } = {}) {
  let clock = START;
  const now = () => clock;
  const stripe = fakeBillingStripe({ clock: () => clock / 1000 });
  const registry = fakeRegistry();
  let projectGone = false;
  const auditLog = fakeAuditLog({ isReady: () => !projectGone });
  const shopData = fakeShopData();
  const email = fakePlatformEmail();
  const settings = platformSettings({});
  const billing = createBilling({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings, ...fakeBillingStores(), registry, auditLog, email,
    shopPlan: shopPlanCopies({ shopData, registry }), webhookSecrets: [SECRET], now,
  });
  const projects = fakeProjects();
  const realDelete = projects.deleteProject.bind(projects);
  projects.deleteProject = async (id) => { await realDelete(id); projectGone = true; };
  const sweep = createClosingSweep({ registry, auditLog, billing, email, projects, hooks, settings, now });
  await registry.createShop(SHOP, { shopId: SHOP, projectId: SHOP, pressName: "Moth Press", ownerEmail: "owner@example.com", plan: "shop", status: "live" });
  const row = await billing.startTrial({ account: ACCOUNT, shopId: SHOP, pressName: "Moth Press", plan: "shop" });
  const event = (type, object) => {
    const rawBody = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, type, livemode: false, data: { object } });
    return billing.handleEvent({ headers: { "Stripe-Signature": signatureHeader(SECRET, rawBody, clock / 1000) }, rawBody });
  };
  const pause = async () => {
    clock += 14 * DAY;
    await event("customer.subscription.paused", stripe.endTrial(row.subscriptionId));
  };
  return {
    stripe, registry, email, projects, sweep, billing, shopData, event, row, pause,
    at: () => clock,
    tick: (days) => { clock += days * DAY; },
    closing: async () => (await registry.getShop(SHOP)).closing,
    sent: (kind) => email.list().filter((m) => m.kind === kind),
    events: () => [...registry.events.get(SHOP).values()].filter((e) => e.source === "closing").map((e) => e.what),
  };
}

/** Runs the sweep once a day for `days` days. */
async function daily(t, days) {
  for (let i = 0; i < days; i++) {
    t.tick(1);
    await t.sweep.sweep();
  }
}

test("60 days paused closes the shop, ends the plan and emails once; 90 days later, after both warnings, it is deleted", async () => {
  const t = await make();
  await t.pause();
  await t.sweep.sweep();
  const paused = await t.closing();
  assert.equal(paused.stage, "paused");
  assert.equal(paused.pausedAt, new Date(t.at()).toISOString());
  const pausedAt = t.at();

  await daily(t, PAUSED_DAYS - 1);
  assert.equal((await t.closing()).stage, "paused");
  await daily(t, 1);
  const closed = await t.closing();
  assert.equal(closed.stage, "closed");
  assert.equal(closed.closedAt, new Date(pausedAt + PAUSED_DAYS * DAY).toISOString());
  assert.equal(closed.downloadUntil, new Date(pausedAt + (PAUSED_DAYS + DOWNLOAD_DAYS) * DAY).toISOString());
  assert.equal(closed.deleteAfter, closed.downloadUntil);
  // The Stripe plan ended, so no card can bill a closed shop; the shop's own copy says closed, with its dates.
  assert.equal(t.stripe.world.subscriptions.get(t.row.subscriptionId).status, "canceled");
  const doc = t.shopData.docs.get(`${SHOP} ${PLAN_DOC}`);
  assert.equal(doc.access, "closed");
  assert.equal(doc.closing.downloadUntil, closed.downloadUntil);
  assert.equal(t.sent("shop-closed").length, 1);
  assert.equal(t.sent("shop-closed")[0].to, "owner@example.com");
  assert.equal(t.sent("shop-closed")[0].data.link, "https://platform.example/account/billing?shop=moth-press");

  // Day by day to deletion: the 30-day warning, the 7-day one, then the delete on the day. Nothing before.
  const closedAt = Date.parse(closed.closedAt);
  for (let day = 1; day <= DOWNLOAD_DAYS; day++) {
    t.tick(1);
    await t.sweep.sweep();
    const c = await t.closing();
    if (day < DOWNLOAD_DAYS) assert.equal(t.projects.deleted.length, 0, `deleted early on day ${day}`);
    if (day === DOWNLOAD_DAYS - 30) assert.ok(c.warned30At);
    if (day < DOWNLOAD_DAYS - 30) assert.equal(c.warned30At, null);
    if (day === DOWNLOAD_DAYS - 7) assert.ok(c.warned7At);
    if (day < DOWNLOAD_DAYS - 7) assert.equal(c.warned7At, null);
  }
  const done = await t.closing();
  assert.equal(done.stage, "deleted");
  assert.equal(done.deletedAt, new Date(closedAt + DOWNLOAD_DAYS * DAY).toISOString());
  assert.deepEqual(t.projects.deleted, [SHOP]);
  assert.deepEqual(t.sent("shop-deletion-warning").map((m) => m.data.days), [30, 7]);
  assert.equal(t.sent("shop-deleted").length, 1);
  assert.deepEqual(t.events(), ["paused", "closed", "warning-30", "warning-7", "deleted"]);

  // Re-running after the deletion touches nothing and sends nothing.
  const sentBefore = t.email.list().length;
  await daily(t, 10);
  assert.deepEqual(t.projects.deleted, [SHOP]);
  assert.equal(t.email.list().length, sentBefore);
  assert.equal((await t.closing()).stage, "deleted");
});

test("running the sweep many times a day sends each email once and records each stage once", async () => {
  const t = await make();
  await t.pause();
  for (let i = 0; i < 3; i++) await t.sweep.sweep();
  t.tick(PAUSED_DAYS);
  for (let i = 0; i < 3; i++) await t.sweep.sweep();
  t.tick(DOWNLOAD_DAYS - 30);
  for (let i = 0; i < 3; i++) await t.sweep.sweep();
  assert.equal(t.sent("shop-closed").length, 1);
  assert.equal(t.sent("shop-deletion-warning").length, 1);
  assert.deepEqual(t.events(), ["paused", "closed", "warning-30"]);
});

test("a sweep that missed the warnings sends one a day and pushes the deletion back: the press always gets its notice", async () => {
  const t = await make();
  await t.pause();
  await t.sweep.sweep();
  t.tick(PAUSED_DAYS);
  await t.sweep.sweep();
  const closed = await t.closing();
  // The sweep was down for the whole download window.
  t.tick(DOWNLOAD_DAYS + 5);
  await t.sweep.sweep();
  let c = await t.closing();
  assert.ok(c.warned30At);
  assert.equal(c.warned7At, null);
  assert.equal(c.deleteAfter, new Date(t.at() + 30 * DAY).toISOString());
  assert.ok(Date.parse(c.deleteAfter) > Date.parse(closed.deleteAfter));
  assert.equal(t.projects.deleted.length, 0);
  // The new date is on the warning and in the shop's own copy.
  assert.equal(t.sent("shop-deletion-warning")[0].data.days, 30);
  assert.equal(t.shopData.docs.get(`${SHOP} ${PLAN_DOC}`).closing.deleteAfter, c.deleteAfter);

  await daily(t, 22);
  assert.equal((await t.closing()).warned7At, null);
  await daily(t, 1);
  c = await t.closing();
  assert.ok(c.warned7At);
  await daily(t, 6);
  assert.equal(t.projects.deleted.length, 0);
  await daily(t, 1);
  assert.deepEqual(t.projects.deleted, [SHOP]);
});

test("a card while paused opens the shop again and clears the timeline", async () => {
  const t = await make();
  await t.pause();
  await t.sweep.sweep();
  t.tick(30);
  const { url } = await t.billing.cardLink({ shopId: SHOP, returnUrl: "https://platform.example/account/billing" });
  await t.event("checkout.session.completed", t.stripe.completeSetup(url.split("/").pop()));
  await t.sweep.sweep();
  assert.equal(await t.closing(), null);
  assert.deepEqual(t.events(), ["paused", "reopened"]);
  t.tick(PAUSED_DAYS);
  await t.sweep.sweep();
  assert.equal(await t.closing(), null);
  assert.equal(t.sent("shop-closed").length, 0);
});

test("a plan that ended (cancelled) closes at once, with the full 90 days to download", async () => {
  const t = await make();
  await t.event("customer.subscription.deleted", { ...t.stripe.subscription(t.row.subscriptionId), status: "canceled" });
  await t.sweep.sweep();
  const c = await t.closing();
  assert.equal(c.stage, "closed");
  assert.equal(c.pausedAt, null);
  assert.equal(c.downloadUntil, new Date(t.at() + DOWNLOAD_DAYS * DAY).toISOString());
});

test("deletion is refused before the date and before both warnings, and a failed delete is retried next run", async () => {
  const closedAt = "2027-01-01T00:00:00.000Z";
  const deleteAfter = "2027-04-01T00:00:00.000Z";
  const on = Date.parse(deleteAfter);
  const base = { stage: "closed", closedAt, deleteAfter, warned30At: "2027-03-02T00:00:00.000Z", warned7At: "2027-03-25T00:00:00.000Z" };
  assert.equal(deletionAllowed(base, on), true);
  assert.equal(deletionAllowed(base, on - 1), false);
  assert.equal(deletionAllowed({ ...base, warned7At: null }, on + 100 * DAY), false);
  assert.equal(deletionAllowed({ ...base, warned30At: null }, on + 100 * DAY), false);
  assert.equal(deletionAllowed({ ...base, warned7At: "2027-03-30T00:00:00.000Z" }, on), false);
  assert.equal(deletionAllowed({ ...base, stage: "paused" }, on + 100 * DAY), false);
  assert.equal(deletionAllowed({ ...base, stage: "deleted" }, on + 100 * DAY), false);
  assert.equal(deletionAllowed(null, on), false);

  const t = await make();
  await t.pause();
  await t.sweep.sweep();
  t.tick(PAUSED_DAYS);
  await t.sweep.sweep();
  await daily(t, DOWNLOAD_DAYS - 1);
  t.projects.fail = true;
  await daily(t, 1);
  const failed = await t.closing();
  assert.equal(failed.stage, "closed");
  assert.match(failed.problem, /deleting the project/);
  assert.equal(t.sent("shop-deleted").length, 0);
  await daily(t, 1);
  assert.equal((await t.closing()).stage, "deleted");
  assert.equal((await t.closing()).problem, null);
  assert.deepEqual(t.projects.deleted, [SHOP]);
});

test("the hooks run once at closed and before deleted; a failing beforeDelete hook stops the deletion until it works", async () => {
  const calls = [];
  let refuse = true;
  const hooks = {
    onClose: [async (shop) => { calls.push(["onClose", shop.shopId, shop.closing.stage]); }],
    beforeDelete: [async (shop) => { calls.push(["beforeDelete", shop.shopId]); if (refuse) throw new Error("Google teardown not finished"); }],
  };
  const t = await make({ hooks });
  await t.pause();
  await t.sweep.sweep();
  t.tick(PAUSED_DAYS);
  await t.sweep.sweep();
  await t.sweep.sweep();
  assert.deepEqual(calls, [["onClose", SHOP, "closed"]]);
  assert.ok((await t.closing()).hooks.onClose);

  await daily(t, DOWNLOAD_DAYS);
  assert.equal(t.projects.deleted.length, 0);
  assert.match((await t.closing()).problem, /beforeDelete: Google teardown not finished/);
  refuse = false;
  await daily(t, 1);
  assert.deepEqual(t.projects.deleted, [SHOP]);
  assert.deepEqual(calls.filter(([name]) => name === "onClose").length, 1);
  assert.ok(calls.filter(([name]) => name === "beforeDelete").length >= 2);

  assert.throws(() => createClosingSweep({ hooks: { onDelete: [] }, settings: platformSettings({}) }), /no hook called onDelete/);
});

test("a beforeDelete hook that answers { refused: true } stops the deletion, and sees the closing fields the teardown reads", async () => {
  let refuse = true;
  const seen = [];
  const hooks = {
    beforeDelete: [async (shop) => {
      seen.push(shop.closing);
      return refuse ? { refused: true, reason: "not due" } : { refused: false };
    }],
  };
  const t = await make({ hooks });
  await t.pause();
  await t.sweep.sweep();
  t.tick(PAUSED_DAYS);
  await daily(t, DOWNLOAD_DAYS + 1);
  assert.equal(t.projects.deleted.length, 0);
  assert.match((await t.closing()).problem, /beforeDelete: not due/);
  const c = seen.at(-1);
  for (const field of ["closedAt", "deleteAfter", "warned30At", "warned7At"]) assert.ok(c[field], field);
  assert.ok(Date.parse(c.deleteAfter) <= t.at() && Date.parse(c.warned7At) < t.at());
  refuse = false;
  await daily(t, 1);
  assert.deepEqual(t.projects.deleted, [SHOP]);
});

test("shops with no plan, or still open, are left alone", async () => {
  const t = await make();
  await t.registry.createShop("no-plan", { shopId: "no-plan", status: "live" });
  const results = await t.sweep.sweep();
  assert.deepEqual(results, [{ shopId: SHOP, stage: null }, { shopId: "no-plan", stage: null }]);
  assert.equal(await t.closing(), undefined);
});

test("the closing emails render with the date and the link, and the warning only for 30 or 7 days", () => {
  const settings = { platformName: "Colophon" };
  const data = { date: "1 April 2027", link: "https://platform.example/account/billing?shop=moth-press" };
  for (const [kind, extra] of [["shop-closed", {}], ["shop-deletion-warning", { days: 30 }], ["shop-deletion-warning", { days: 7 }], ["shop-deleted", {}]]) {
    const parts = TEMPLATES[kind]({ ...data, ...extra }, { settings, pressName: "Moth <b>Press</b>" });
    assert.ok(parts.subject && parts.text && parts.html, kind);
    assert.doesNotMatch(parts.html, /<b>Press/, kind);
    assert.doesNotMatch(parts.text, /Firebase|Google Cloud|project|API/, kind);
    if (kind !== "shop-deleted") assert.match(parts.html, /1 April 2027/, kind);
  }
  assert.throws(() => TEMPLATES["shop-deletion-warning"]({ ...data, days: 3 }, { settings, pressName: "P" }), /30 or 7/);
});
