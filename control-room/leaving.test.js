// Why presses leave (code plan 19.8), in the control room: answers grouped by month and reason, newest first; counts
// for this month and the last six; the latest words; the save list (plans set to end, shops paused for a card), soonest
// first; and the whole way through the platform's door, from the press's cancel to the owner's page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { leavingSummary, saveList } from "./leaving.js";
import { adminClaims, person, platformWorld } from "../walkthrough/world.js";
import { PUBLISHES, QUESTION } from "../signup/form.js";
import { TERMS_VERSION } from "../terms/terms.js";

const NOW = new Date("2026-11-20T12:00:00Z");
const DAY = 86_400_000;
const answered = (shopId, reason, at, extra = {}) => ({ shopId, pressName: shopId, billing: { status: "active", access: "open", leaving: { reason, words: extra.words ?? "", at, ...(extra.keptAt ? { keptAt: extra.keptAt } : {}) }, ...(extra.billing ?? {}) }, ...(extra.row ?? {}) });

test("answers grouped by month and reason, newest first, with this month's and the last six months' counts", () => {
  const rows = [
    answered("a", "price", "2026-11-03T10:00:00Z", { words: "Too dear for a small press." }),
    answered("b", "price", "2026-11-10T10:00:00Z"),
    answered("c", "missing-feature", "2026-11-12T10:00:00Z", { words: "Gift cards, please." }),
    answered("d", "moving", "2026-09-01T10:00:00Z"),
    answered("e", "closed-press", "2026-05-31T10:00:00Z"), // more than six months back
    answered("f", "price", "2026-11-15T10:00:00Z", { keptAt: "2026-11-16T10:00:00Z", words: "Stayed after all." }),
    answered("g", "price", "2026-11-18T10:00:00Z", { row: { testShop: true } }),
    { shopId: "h", billing: { status: "active", access: "open" } },
  ];
  const summary = leavingSummary(rows, NOW);
  assert.deepEqual(summary.months.map((m) => m.month), ["2026-11", "2026-09", "2026-05"]);
  assert.deepEqual(summary.months[0], { month: "2026-11", total: 3, stayed: 1, reasons: { price: 2, "missing-feature": 1, "closed-press": 0, moving: 0, other: 0 } });
  assert.deepEqual(summary.thisMonth, { price: 2, "missing-feature": 1, "closed-press": 0, moving: 0, other: 0 });
  assert.deepEqual(summary.lastSixMonths, { price: 2, "missing-feature": 1, "closed-press": 0, moving: 1, other: 0 });
  assert.deepEqual([summary.stayedThisMonth, summary.stayedLastSixMonths], [1, 1]);
  assert.deepEqual(summary.latest.map((a) => [a.shopId, a.words, a.stayed]), [["f", "Stayed after all.", true], ["c", "Gift cards, please.", false], ["a", "Too dear for a small press.", false]]);
  assert.equal(summary.latest[1].label, "Something missing");
  assert.deepEqual(summary.reasons.map((r) => r.id), ["price", "missing-feature", "closed-press", "moving", "other"]);
  assert.deepEqual(leavingSummary([], NOW).months, []);
});

test("the save list: plans set to end and shops paused for a card, soonest first, with what they said", () => {
  const rows = [
    { shopId: "later", pressName: "Later Press", ownerEmail: "later@example.com", billing: { status: "active", access: "open", cancelAtPeriodEnd: true, currentPeriodEnd: "2026-12-15T00:00:00Z", leaving: { reason: "price", words: "Too dear.", at: "2026-11-15T00:00:00Z" } } },
    { shopId: "trial", pressName: "Trial Press", billing: { status: "trialing", access: "open", cancelAtPeriodEnd: true, trialEnd: "2026-11-25T00:00:00Z" } },
    { shopId: "no-card", pressName: "No Card Press", billing: { status: "paused", access: "paused", hasCard: false, troubleSince: "2026-10-01T00:00:00Z" }, closing: { stage: "paused", pausedAt: "2026-10-01T00:00:00Z" } },
    { shopId: "fine", pressName: "Fine Press", billing: { status: "active", access: "open" } },
    { shopId: "ended", pressName: "Ended Press", billing: { status: "canceled", access: "closed", cancelAtPeriodEnd: true } },
    { shopId: "test", pressName: "Test", testShop: true, billing: { status: "active", access: "open", cancelAtPeriodEnd: true, currentPeriodEnd: "2026-11-21T00:00:00Z" } },
  ];
  const list = saveList(rows, NOW);
  assert.deepEqual(list.map((s) => [s.shopId, s.why, s.daysLeft]), [["trial", "cancelled", 5], ["no-card", "no-card", 10], ["later", "cancelled", 25]]);
  assert.equal(list[1].endsAt, new Date(Date.parse("2026-10-01T00:00:00Z") + 60 * DAY).toISOString(), "paused shops close 60 days after the pause");
  assert.deepEqual([list[2].label, list[2].words, list[2].ownerEmail], ["The price", "Too dear.", "later@example.com"]);
  assert.equal(list[0].label, null);
});

test("from the press's cancel to the owner's page: the answer, the counts and the save list", async () => {
  const w = platformWorld({ suffix: () => "q7z2m" });
  const ada = person("uid-ada", "owner@example.com", "Ada");
  const signed = await w.ask(ada, "POST", "/api/signup", { pressName: "Moth Press", plan: "both", country: "CA", [QUESTION.id]: "fairs", [PUBLISHES.id]: "zines", termsAccepted: true, termsVersion: TERMS_VERSION });
  assert.equal(signed.status, 200, signed.body.message);
  const { shopId } = signed.body;
  await w.shopMaker.sweep();

  const bad = await w.ask(ada, "POST", "/api/billing/cancel", { shopId, reason: "nope" });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.message, "Choose one of the reasons on the list, or leave the question blank.");
  const done = await w.ask(ada, "POST", "/api/billing/cancel", { shopId, reason: "closed-press", words: "Retiring at last." });
  assert.equal(done.status, 200);
  assert.equal(done.body.cancelAtPeriodEnd, true);

  assert.equal((await w.ask(ada, "GET", "/api/control/leaving")).status, 403, "a press can't read it");
  const view = (await w.ask(adminClaims(w.clock), "GET", "/api/control/leaving")).body;
  assert.equal(view.thisMonth["closed-press"], 1);
  assert.deepEqual(view.latest.map((a) => [a.shopId, a.words]), [[shopId, "Retiring at last."]]);
  assert.deepEqual(view.saveList.map((s) => [s.shopId, s.why, s.reason]), [[shopId, "cancelled", "closed-press"]]);
});
