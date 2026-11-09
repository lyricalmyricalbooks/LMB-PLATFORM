// "Check my shop" (plan 14.3): a shop with each fault says so in plain words with a way to fix it; only the owner can ask.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkMyShop } from "./checkMyShop.js";

const NOW = new Date("2026-11-02T12:00:00Z");
const profile = { siteUrl: "https://moth.example", apps: { shop: true, stockroom: true }, stockroom: { firestoreDatabase: "stockroom" }, payments: { provider: "stripe", mode: "platform" } };
const row = { billing: { status: "active", access: "open", hasCard: true } };
const byId = (answer, id) => answer.results.find((r) => r.id === id);
const hoursAgo = (h) => new Date(NOW - h * 3600_000).toISOString();

test("a healthy shop passes every check", () => {
  const answer = checkMyShop({ row, profile, now: NOW, shopBackupAt: hoursAgo(5) });
  assert.equal(answer.ok, true);
  assert.deepEqual(answer.results.map((r) => r.id), ["address", "payments", "email", "stock", "backups", "plan"]);
  assert.ok(answer.results.every((r) => r.state === "ok" && !r.fix));
});

test("each fault says what is wrong and where to fix it", () => {
  const cases = [
    [{ row, profile: { ...profile, siteUrl: undefined }, shopBackupAt: hoursAgo(5) }, "address", "help"],
    [{ row, profile: { ...profile, payments: undefined }, shopBackupAt: hoursAgo(5) }, "payments", "admin"],
    [{ row: { ...row, emailSender: { state: "broken" } }, profile, shopBackupAt: hoursAgo(5) }, "email", "help"],
    [{ row, profile: { ...profile, stockroom: undefined }, shopBackupAt: hoursAgo(5) }, "stock", "help"],
    [{ row, profile, shopBackupAt: hoursAgo(60) }, "backups", "help"],
    [{ row, profile, shopBackupAt: null }, "backups", "help"],
    [{ row: { billing: { status: "unpaid", access: "paused" } }, profile, shopBackupAt: hoursAgo(5) }, "plan", "billing"],
    [{ row: { billing: { status: "past_due", access: "open", hasCard: true } }, profile, shopBackupAt: hoursAgo(5) }, "plan", "billing"],
  ];
  for (const [input, id, to] of cases) {
    const answer = checkMyShop({ ...input, now: NOW });
    const found = byId(answer, id);
    assert.equal(found.state, "fix", id);
    assert.equal(found.fix.to, to, id);
    assert.equal(answer.ok, false);
  }
});

test("a backup that can't be read says so rather than passing, and a trial without a card is a gentle reminder", () => {
  const answer = checkMyShop({ row: { billing: { status: "trialing", access: "open", hasCard: false } }, profile, now: NOW });
  assert.equal(byId(answer, "backups").state, "unknown");
  assert.equal(answer.ok, true);
  assert.match(byId(answer, "plan").words, /free trial/);
});

test("a stockroom-only shop isn't asked about payments, and the words are plain", () => {
  const answer = checkMyShop({ row, profile: { ...profile, apps: { shop: false, stockroom: true }, firebase: { projectId: "moth-press" }, payments: undefined }, now: NOW, shopBackupAt: hoursAgo(1) });
  assert.equal(byId(answer, "payments"), undefined);
  // Its address is the stockroom's, not a website it doesn't have.
  assert.equal(byId(answer, "address").title, "Your stockroom's web address");
  assert.match(byId(answer, "address").words, /-stockroom\.web\.app/);
  assert.doesNotMatch(byId(answer, "address").words, /People can find your shop/);
  const all = [{ row: { emailSender: { state: "broken" }, billing: { access: "paused" } }, profile: { ...profile, payments: undefined, stockroom: undefined, siteUrl: undefined } }]
    .flatMap((input) => checkMyShop({ ...input, now: NOW, shopBackupAt: null }).results)
    .map((r) => `${r.title}. ${r.words}`).join(" ");
  assert.doesNotMatch(all, /\b(firestore|firebase|api|json|webhook|server|database|dns|ssl|stripe|resend)\b/i);
  for (const sentence of all.split(/(?<=[.?!;])\s+/)) assert.ok(sentence.split(/\s+/).length <= 36, sentence);
});
