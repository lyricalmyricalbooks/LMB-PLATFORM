import { test } from "node:test";
import assert from "node:assert/strict";
import { checkupLines, createCheckups, makeInspector, offToken } from "./index.js";
import { fakePlatformEmail, fakeTipStore } from "../trial-tips/fakes.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { platformSettings } from "../settings.js";

const settings = platformSettings({});
const SECRET = "a-test-secret-of-enough-length";
const GOOD = { products: { total: 5, withoutDescription: 0 }, brokenLinks: null, pagesInGoogle: null, speed: null };
const MESSY = { products: { total: 5, withoutDescription: 3 }, brokenLinks: 2, pagesInGoogle: 12, speed: "slow" };

function world({ row = {}, facts = GOOD } = {}) {
  const registry = fakeRegistry();
  registry.shops.set("moth-press", { shopId: "moth-press", pressName: "Moth Press", ownerEmail: "owner@example.com", status: "ready", createdAt: "2026-09-01T00:00:00.000Z", billing: { access: "open" }, ...row });
  registry.profiles.set("moth-press", { siteUrl: "https://moth-press.web.app", apps: { shop: true } });
  const auditLog = fakeAuditLog();
  const email = fakePlatformEmail(settings);
  const store = fakeTipStore();
  let clock = new Date("2026-11-02T09:00:00Z");
  const state = { facts };
  const checkups = createCheckups({ registry, auditLog, email, store, settings, secret: SECRET, inspect: async () => state.facts, now: () => clock });
  return { registry, auditLog, email, store, checkups, state, setClock: (d) => { clock = new Date(d); } };
}

test("the lines say what is fine and what to fix, each fix with a button, and leave out what isn't known", () => {
  assert.deepEqual(checkupLines(GOOD).map((l) => [l.id, l.state]), [["products", "ok"]]);
  const lines = checkupLines(MESSY);
  assert.deepEqual(lines.map((l) => [l.id, l.state]), [["products", "fix"], ["links", "fix"], ["google", "ok"], ["speed", "fix"]]);
  assert.ok(lines.filter((l) => l.state === "fix").every((l) => l.fix.label && l.fix.hash));
  assert.match(lines[0].words, /^3 items have no description/);
  assert.equal(checkupLines({ products: { total: 0 } })[0].state, "fix");
  assert.deepEqual(checkupLines({}), []);
});

test("one email a month, with a button for each fix and a link to turn it off", async () => {
  const w = world({ facts: MESSY });
  const first = await w.checkups.run();
  assert.equal(first.sent.length, 1);
  const mail = w.email.sent[0];
  assert.equal(mail.kind, "shop-checkup");
  assert.match(mail.parts.subject, /^Moth Press: 3 things to fix/);
  assert.match(mail.parts.html, /https:\/\/moth-press\.web\.app\/admin#catalog/);
  assert.match(mail.parts.text, /Turn it off here: https:\/\/platform\.example\/checkup\/off\?shop=moth-press&sig=/);
  assert.equal(w.registry.events.get("moth-press").get("shop-checkup-2026-11").fixes, 3);
  assert.equal((await w.checkups.run()).skipped[0].why, "already-sent");
  w.setClock("2026-12-02T09:00:00Z");
  assert.equal((await w.checkups.run()).sent.length, 1);
  assert.equal(w.email.sent.length, 2);
});

test("a month with nothing to fix says the shop is in good shape", async () => {
  const w = world();
  await w.checkups.run();
  assert.match(w.email.sent[0].parts.subject, /in good shape/);
  assert.match(w.email.sent[0].parts.text, /Nothing needs you this month/);
});

test("nothing for a new, closed, paused, test or stockroom-only shop, or one with nothing to say", async () => {
  for (const [row, why] of [[{ createdAt: "2026-10-25T00:00:00.000Z" }, "too-new"], [{ status: "closed" }, "not-live"], [{ status: "creating" }, "not-live"], [{ closure: { by: "admin@example.com", reason: "abuse", at: "2026-11-01T00:00:00Z" } }, "not-live"],[{ billing: { access: "paused" } }, "not-live"], [{ testShop: true }, "not-live"], [{ ownerEmail: "" }, "no-owner"]]) {
    const w = world({ row });
    assert.equal((await w.checkups.run()).skipped[0].why, why);
    assert.equal(w.email.sent.length, 0);
  }
  const w = world({ facts: {} });
  assert.equal((await w.checkups.run()).skipped[0].why, "nothing-to-say");
  const none = world();
  none.registry.profiles.set("moth-press", { siteUrl: "https://x.web.app", apps: { shop: false } });
  assert.equal((await none.checkups.run()).skipped[0].why, "no-shop-admin");
});

test("a failed look skips that shop and records nothing, so the next run tries again", async () => {
  const w = world();
  w.state.facts = null;
  const bad = createCheckups({ registry: w.registry, auditLog: w.auditLog, email: w.email, store: w.store, settings, secret: SECRET, inspect: async () => { throw new Error("down"); }, now: () => new Date("2026-11-02T09:00:00Z") });
  assert.equal((await bad.run()).skipped[0].why, "failed");
  assert.equal(await w.store.get("moth-press"), null);
});

test("the off link needs the right signature, and turns the check-up off for good", async () => {
  const w = world({ facts: MESSY });
  assert.deepEqual(await w.checkups.turnOff("moth-press", "wrong"), { ok: false });
  assert.equal((await w.checkups.handleOff("/checkup/off?shop=moth-press&sig=wrong")).status, 400);
  const page = await w.checkups.handleOff(`/checkup/off?shop=moth-press&sig=${offToken(SECRET, "moth-press")}`);
  assert.equal(page.status, 200);
  assert.equal((await w.checkups.run()).skipped[0].why, "off");
  assert.equal(w.email.sent.length, 0);
});

test("the platform's own reader counts books without a description, ignoring drafts", async () => {
  const shopData = { list: async () => [{ id: "a", data: { description: "Poems." } }, { id: "b", data: { description: "  " } }, { id: "c", data: {} }, { id: "d", data: { status: "draft" } }] };
  const facts = await makeInspector({ shopData })("moth-press");
  assert.deepEqual(facts.products, { total: 3, withoutDescription: 2 });
  assert.equal(facts.brokenLinks, null);
});
