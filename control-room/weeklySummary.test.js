import test from "node:test";
import assert from "node:assert/strict";
import { weeklySummary, summaryOf } from "./weeklySummary.js";
import { TEMPLATES } from "../services/email/templates.js";
import { JOBS } from "../services/jobs/index.js";
import { RUNNERS } from "../server/jobs.js";

const NOW = new Date("2026-11-16T08:10:00Z");
const rows = [
  { shopId: "a", pressName: "Alder Press", status: "live", createdAt: "2026-11-14T00:00:00Z", billing: {} },
  { shopId: "b", pressName: "Birch Books", status: "live", createdAt: "2026-01-01T00:00:00Z", billing: { leaving: { reason: "price", at: "2026-11-15T00:00:00Z" } } },
  { shopId: "c", pressName: "Cedar", status: "live", createdAt: "2026-01-01T00:00:00Z", billing: { leaving: { reason: "price", at: "2026-11-15T00:00:00Z", keptAt: "2026-11-15T01:00:00Z" } } },
  { shopId: "t", pressName: "Test", testShop: true, createdAt: "2026-11-15T00:00:00Z" },
];

test("the summary names new shops and shops leaving, skipping the test shop and presses who stayed", () => {
  const s = summaryOf(rows, { currency: "CAD" }, NOW);
  assert.deepEqual(s.started, ["Alder Press"]);
  assert.deepEqual(s.leaving, ["Birch Books"]);
  assert.equal(s.live, 3);
});

test("one email a week, keyed by the week, and none without an address", async () => {
  const sent = [];
  const email = { sendPlatform: async (m) => sent.push(m) };
  const registry = { listShops: async () => rows };
  await weeklySummary({ registry, email, to: "owner@example.com", now: () => NOW });
  assert.equal(sent[0].kind, "weekly-summary");
  assert.equal(sent[0].idempotencyKey, "weekly-summary-2026-W47");
  await assert.rejects(weeklySummary({ registry, email, to: null, now: () => NOW }));
});

test("the email reads plainly and the job is wired", () => {
  const out = TEMPLATES["weekly-summary"]({ income: 1250, currency: "CAD", live: 3, started: ["Alder Press"], leaving: [], waiting: 0, lines: [] }, { settings: { platformName: "Colophon" } });
  assert.match(JSON.stringify(out), /Alder Press/);
  assert.match(JSON.stringify(out), /Nothing is waiting on you/);
  assert.equal(JOBS.find((j) => j.name === "weekly-summary").every, 7 * 24 * 60);
  assert.equal(typeof RUNNERS["weekly-summary"], "function");
});
