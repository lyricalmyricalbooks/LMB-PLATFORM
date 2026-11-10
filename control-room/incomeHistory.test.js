// Income over time (code plan 19.7): one record a night, counted as Today counts (test shop never), safe to run twice
// the same day, with each night's movements; the 12-month line at month ends, money kept and lost this month, the
// trial-to-paying rate; the nightly run; and the control room's admin-only door with its chart on the Today page.
import { TIERED_PRICES_ENV } from "../services/billing/fakes.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dayKey, history, movements, snapshotIncome } from "./incomeHistory.js";
import { todaySummary } from "./today.js";
import { fakeIncomeHistory } from "./fakes.js";
import { businessRoutes, createBusinessRoom } from "./business.js";
import { runBusinessNightly } from "./nightly.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { fakeRegistry } from "../setup/fakes.js";
import { platformSettings } from "../services/settings.js";

const settings = platformSettings(TIERED_PRICES_ENV);
const DAY = 86_400_000;
const ADMIN = "admin@example.com";
const adminAt = (now) => ({ uid: "uid-admin", email: ADMIN, email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(now.getTime() / 1000) });

async function registryWith(rows) {
  const registry = fakeRegistry();
  for (const row of rows) await registry.createShop(row.shopId, { pressName: row.shopId, status: "live", plan: row.billing?.plan ?? "both", ...row });
  return registry;
}
const set = (registry, shopId, billing) => registry.updateShop(shopId, { billing });

test("a night's record counts what Today counts, leaves the test shop out, and keeps each shop for tomorrow", async () => {
  const rows = [
    { shopId: "trial-a", billing: { status: "trialing", access: "open", plan: "shop" } },
    { shopId: "paying", billing: { status: "active", access: "open", plan: "both" } },
    { shopId: "retrying", billing: { status: "past_due", access: "open", plan: "stockroom" } },
    { shopId: "paused", billing: { status: "paused", access: "paused", plan: "shop" } },
    { shopId: "ended", billing: { status: "canceled", access: "closed", plan: "shop" } },
    { shopId: "platform-test", testShop: true, billing: { status: "active", access: "open", plan: "both" } },
  ];
  const registry = await registryWith(rows);
  const store = fakeIncomeHistory();
  const now = new Date("2026-11-02T08:00:00Z");
  const record = await snapshotIncome({ registry, settings, store, now });
  const today = todaySummary({ rows: await registry.listShops(), settings, now });
  assert.equal(record.day, "2026-11-02");
  assert.equal(record.incomeCents, today.monthlyIncome);
  assert.equal(record.incomeCents, 3900 + 1900);
  assert.deepEqual([record.paying, record.trial, record.paused, record.closed], [today.counts.paying, today.counts.trial, today.counts.paused, today.counts.closed]);
  assert.equal(record.shops["platform-test"], undefined, "the test shop never counts");
  assert.equal(record.first, true);
  assert.ok(Object.values(record.moves).every((n) => n === 0), "the first night has nothing to compare with");
  assert.deepEqual(await store.get("2026-11-02"), record);
});

test("the day is Toronto's: late evening there is still the same day", () => {
  assert.equal(dayKey(new Date("2026-11-03T03:30:00Z")), "2026-11-02");
  assert.equal(dayKey(new Date("2026-11-03T06:00:00Z")), "2026-11-03");
});

test("each night's movements: new paying, trials that converted, bigger and smaller plans, shops lost", async () => {
  const registry = await registryWith([
    { shopId: "a-trial", billing: { status: "trialing", access: "open", plan: "both" } },
    { shopId: "b-trial", billing: { status: "trialing", access: "open", plan: "shop" } },
    { shopId: "c-up", billing: { status: "active", access: "open", plan: "stockroom" } },
    { shopId: "d-down", billing: { status: "active", access: "open", plan: "both" } },
    { shopId: "e-lost", billing: { status: "active", access: "open", plan: "shop" } },
  ]);
  const store = fakeIncomeHistory();
  const night1 = new Date("2026-11-02T08:00:00Z");
  await snapshotIncome({ registry, settings, store, now: night1 });

  await set(registry, "a-trial", { status: "active", access: "open", plan: "both" }); // converted
  await set(registry, "b-trial", { status: "paused", access: "paused", plan: "shop" }); // trial ended with no card
  await set(registry, "c-up", { status: "active", access: "open", plan: "both" }); // 1900 -> 3900
  await set(registry, "d-down", { status: "active", access: "open", plan: "shop" }); // 3900 -> 2900
  await set(registry, "e-lost", { status: "canceled", access: "closed", plan: "shop" }); // 2900 lost
  await registry.createShop("f-new", { pressName: "f-new", status: "live", plan: "shop", billing: { status: "active", access: "open", plan: "shop" } });
  const night2 = new Date(night1.getTime() + DAY);
  const record = await snapshotIncome({ registry, settings, store, now: night2 });
  assert.equal(record.first, false);
  assert.deepEqual(record.moves, {
    newPaying: 2, newPayingCents: 3900 + 2900, upgrades: 1, upgradeCents: 2000, downgrades: 1, downgradeCents: 1000,
    lost: 1, lostCents: 2900, trialToPaid: 1, trialEnded: 2,
  });

  // Safe to run twice: the same day, the same key, the same numbers (never compared with its own record).
  const again = await snapshotIncome({ registry, settings, store, now: new Date(night2.getTime() + 3600_000) });
  assert.deepEqual({ ...again, at: null }, { ...record, at: null });
  assert.equal(store.rows.size, 2);
});

test("movements need no shop list order and treat a shop that disappears as lost", () => {
  const moves = movements({ x: { state: "paying", cents: 1900 } }, {});
  assert.equal(moves.lost, 1);
  assert.equal(moves.lostCents, 1900);
});

test("the line: month ends for 12 months plus this month so far, money kept and lost, and the 90-day trial rate", async () => {
  const store = fakeIncomeHistory();
  const record = (day, incomeCents, moves = {}) => store.set(day, { day, currency: "CAD", incomeCents, paying: incomeCents / 100, trial: 0, paused: 0, closed: 0, moves });
  await record("2025-09-30", 999); // more than 12 months back: not on the line
  await record("2026-06-10", 1000);
  await record("2026-06-30", 2000); // June's month end
  await record("2026-07-20", 3000, { trialEnded: 2, trialToPaid: 1 });
  await record("2026-10-31", 4000, { trialEnded: 1, trialToPaid: 1 });
  await record("2026-11-01", 4500, { newPaying: 1, newPayingCents: 1900, upgrades: 1, upgradeCents: 1000, trialEnded: 1, trialToPaid: 0 });
  await record("2026-11-02", 3000, { downgrades: 1, downgradeCents: 500, lost: 1, lostCents: 1000 });
  const now = new Date("2026-11-02T20:00:00Z");
  const line = await history({ store, now });
  assert.equal(line.months.length, 13);
  assert.equal(line.months[0].month, "2025-11");
  assert.equal(line.months.at(-1).month, "2026-11");
  assert.deepEqual(line.months.filter((m) => m.incomeCents !== null).map((m) => [m.month, m.incomeCents]), [["2026-06", 2000], ["2026-07", 3000], ["2026-10", 4000], ["2026-11", 3000]]);
  assert.equal(line.started, true);
  assert.deepEqual(line.kept, { cents: 2900, newPaying: 1, upgrades: 1 });
  assert.deepEqual(line.lost, { cents: 1500, downgrades: 1, lost: 1 });
  // 20 July is more than 90 days before 2 November: only October and November's trials count.
  assert.deepEqual(line.trials, { ended: 2, converted: 1, rate: 0.5, days: 90 });

  const empty = await history({ store: fakeIncomeHistory(), now });
  assert.equal(empty.started, false);
  assert.equal(empty.trials.rate, null);
  assert.ok(empty.months.every((m) => m.incomeCents === null));
});

test("the nightly run writes tonight's record and checks the cards; one part failing doesn't stop the other", async () => {
  const registry = await registryWith([{ shopId: "paying", billing: { status: "active", access: "open", plan: "both" } }]);
  const store = fakeIncomeHistory();
  const now = () => new Date("2026-11-02T08:00:00Z");
  let checked = 0;
  const billing = { cardExpiryReminders: async () => { checked += 1; return ["paying"]; } };
  const done = await runBusinessNightly({ registry, settings, incomeHistory: store, billing, now });
  assert.deepEqual([done.ok, done.income.incomeCents, done.cardWarnings, checked], [true, 3900, ["paying"], 1]);

  const broken = { list: async () => { throw new Error("the records are out of reach"); }, set: async () => {} };
  const partly = await runBusinessNightly({ registry, settings, incomeHistory: broken, billing, now });
  assert.equal(partly.ok, false);
  assert.match(partly.problems[0], /out of reach/);
  assert.equal(checked, 2, "the card warnings still ran");
  const noBilling = await runBusinessNightly({ registry, settings, incomeHistory: store, now });
  assert.deepEqual([noBilling.ok, noBilling.cardWarnings], [true, null]);
});

test("GET /api/control/income is for platform admins only, and the Today page draws the line from it", async () => {
  const now = new Date("2026-11-02T20:00:00Z");
  const store = fakeIncomeHistory();
  const registry = await registryWith([]);
  await store.set("2026-11-01", { day: "2026-11-01", currency: "CAD", incomeCents: 3900, paying: 1, trial: 0, paused: 0, closed: 0, moves: {} });
  const room = createBusinessRoom({ registry, incomeHistory: store, admins: [ADMIN], now: () => now });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings, routes: businessRoutes(room) });
  const ask = (claims) => api({ method: "GET", path: "/api/control/income", headers: claims ? { Authorization: `Bearer ${JSON.stringify(claims)}` } : {} });
  assert.equal((await ask(null)).status, 401);
  assert.equal((await ask({ uid: "x", email: "someone@example.com", email_verified: true })).status, 403);
  assert.equal((await ask({ ...adminAt(now), firebase: {} })).status, 403, "two-step sign-in is needed");
  const answer = await ask(adminAt(now));
  assert.equal(answer.status, 200);
  assert.equal(answer.body.months.at(-1).incomeCents, 3900);

  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for (const path of Object.keys(businessRoutes({}))) assert.ok(app.includes(`"${path.split(" ")[1].replace("/api", "")}"`), path);
  assert.match(app, /The line starts the first night the platform runs\./);
  assert.match(app, /createElementNS/, "the chart is inline SVG, no library");
  for (const id of ["income-figures", "income-chart", "payment-trouble", "leaving", "save-list"]) assert.match(page, new RegExp(`id="${id}"`), id);
  // The chart wears the theme's own colours: no colour is written into the page for it.
  const chartCss = page.split("\n").filter((line) => line.includes(".cr-chart")).join("\n");
  assert.doesNotMatch(chartCss, /#[0-9a-f]{3,6}\b|rgb\(/i);
  assert.match(chartCss, /var\(--rp-primary\)/);
});

test("the nightly record keeps the money at risk, and the line shows it per month", async () => {
  const { snapshotIncome, history } = await import("./incomeHistory.js");
  const { fakeRegistry } = await import("../setup/fakes.js");
  const { platformSettings } = await import("../services/settings.js");
  const registry = fakeRegistry();
  await registry.createShop("moth", { shopId: "moth", plan: "both", status: "live", billing: { status: "active" }, drift: { level: "drifting", score: 4, reasons: [] } });
  await registry.createShop("wasp", { shopId: "wasp", plan: "shop", status: "live", billing: { status: "active" } });
  const records = new Map();
  const store = { get: async (d) => records.get(d) ?? null, set: async (d, r) => void records.set(d, r), list: async ({ since }) => [...records.values()].filter((r) => r.day >= since).sort((a, b) => (a.day < b.day ? -1 : 1)) };
  const settings = platformSettings(TIERED_PRICES_ENV);
  const now = new Date("2026-11-03T12:00:00Z");
  const record = await snapshotIncome({ registry, settings, store, now });
  assert.deepEqual(record.atRisk, { count: 1, cents: settings.prices.both });
  assert.deepEqual((await history({ store, now })).months.at(-1).atRisk, { count: 1, cents: settings.prices.both });
});
