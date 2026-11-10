// What each shop costs us (code plan 19.15), from a pretend billing export: credits come off, projects that aren't a
// shop are listed apart, the currency is kept, and a shop that costs more than it pays is marked losing.
import { TIERED_PRICES_ENV } from "../billing/fakes.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { costPerShop, costReport, createCostReader, monthOf, readCosts } from "./costs.js";
import { exportRow, fakeBillingExport } from "./fakes.js";
import { COSTS_EMPTY, costRoutes, createCostsDesk } from "../../control-room/costs.js";
import { controlRoomAdmins } from "../../control-room/controlRoom.js";
import { platformSettings } from "../settings.js";
import { createApi } from "../../signup/api.js";
import { fakeVerifyIdToken } from "../../signup/fakes.js";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const settings = platformSettings(TIERED_PRICES_ENV);
const admin = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
// Made-up presses; their project ids are their shop ids (named once, so apps-isolation.test.js sees no real project).
const OWL = "owl-press";
const FERN = "fern-press";

const ROWS = [
  // Moth Press: $12.40 of use, $2.40 of it free: net $10.00.
  exportRow({ projectId: "moth-press", cost: 7.4, credits: [-1.4], at: "2026-11-03T05:00:00Z" }),
  exportRow({ projectId: "moth-press", cost: 5, credits: [-0.5, -0.5], at: "2026-11-18T05:00:00Z" }),
  // Owl Press uses a lot: $45.123456 in many small charges.
  ...Array.from({ length: 3 }, (_, i) => exportRow({ projectId: OWL, cost: 15.041152, at: `2026-11-1${i}T00:00:00Z` })),
  // Last month: not counted in November.
  exportRow({ projectId: "moth-press", cost: 99, at: "2026-10-31T23:59:59Z" }),
  // The platform's own project and a charge with no project are not shops.
  exportRow({ projectId: "lmb-platform-prod", cost: 20, credits: [-5], at: "2026-11-05T00:00:00Z" }),
  exportRow({ projectId: null, cost: 1.25, at: "2026-11-05T00:00:00Z" }),
  // A shop billed in another currency keeps it.
  exportRow({ projectId: FERN, cost: 3, at: "2026-11-06T00:00:00Z", currency: "USD" }),
];

const SHOPS = [
  { shopId: "moth-press", projectId: "moth-press", pressName: "Moth Press", plan: "shop", status: "live", billing: { status: "active" } },
  { shopId: "owl-press", projectId: OWL, pressName: "Owl Press", plan: "both", status: "live", billing: { status: "active", percentOff: 50 } },
  { shopId: "fern-press", projectId: FERN, pressName: "Fern Press", plan: "stockroom", status: "live", billing: { status: "trialing" } },
  { shopId: "quiet-press", pressName: "Quiet Press", plan: "shop", status: "live", billing: { status: "trialing" } },
];

test("one month of the export, per project and currency, with credits taken off", () => {
  const { period, projects } = readCosts({ rows: ROWS, period: "2026-11" });
  assert.equal(period, "2026-11");
  const by = Object.fromEntries(projects.map((p) => [`${p.projectId} ${p.currency}`, p]));
  assert.deepEqual(by["moth-press CAD"], { projectId: "moth-press", currency: "CAD", costCents: 1240, creditCents: -240, netCents: 1000 });
  assert.equal(by["owl-press CAD"].netCents, 4512, "summed exactly, rounded to cents once");
  assert.equal(by["lmb-platform-prod CAD"].netCents, 1500);
  assert.equal(by["null CAD"].netCents, 125);
  assert.equal(by["fern-press USD"].currency, "USD");
  assert.equal(projects[0].projectId, "owl-press", "biggest first");
  assert.equal(readCosts({ rows: ROWS, period: "2026-10" }).projects[0].netCents, 9900);
  // BigQuery's client gives times as { value }.
  assert.equal(readCosts({ rows: [{ ...ROWS[0], usage_start_time: { value: "2026-11-03 05:00:00.000000 UTC".replace(" UTC", "Z").replace(" ", "T") } }], period: "2026-11" }).projects[0].netCents, 600);
  assert.equal(readCosts({ rows: [{ ...ROWS[0], usage_start_time: "whenever" }], period: "2026-11" }).skipped, 1);
  assert.throws(() => readCosts({ rows: ROWS, period: "November" }), /2026-11/);
});

test("per shop: Google's cost against what the shop pays, most losing first, and the rest listed as not a shop", () => {
  const costs = readCosts({ rows: ROWS, period: "2026-11" });
  const report = costReport({ rows: SHOPS, costs, settings, fees: { "moth-press": 250 } });
  const [first, ...rest] = report.shops;
  assert.equal(first.shopId, "owl-press");
  assert.deepEqual({ google: first.googleCents, paid: first.paidCents, margin: first.marginCents, losing: first.losing }, { google: 4512, paid: 1950, margin: -2562, losing: true });
  const moth = rest.find((s) => s.shopId === "moth-press");
  assert.deepEqual({ plan: moth.planCents, fee: moth.feeCents, paid: moth.paidCents, google: moth.googleCents, margin: moth.marginCents, losing: moth.losing }, { plan: 2900, fee: 250, paid: 3150, google: 1000, margin: 2150, losing: false });
  // A live shop with nothing billed yet still shows, at no cost.
  const quiet = rest.find((s) => s.shopId === "quiet-press");
  assert.deepEqual({ google: quiet.googleCents, paid: quiet.paidCents, losing: quiet.losing }, { google: 0, paid: 0, losing: false });
  // Another currency is kept and not compared with the plan's price.
  const fern = report.shops.find((s) => s.shopId === "fern-press");
  assert.deepEqual(fern.otherCurrencies, { USD: 300 });
  assert.equal(fern.losing, null);
  assert.equal(report.shops.at(-1).shopId, "fern-press", "no margin sorts last");
  assert.deepEqual(report.notShops.map((p) => [p.projectId, p.googleCents]), [["lmb-platform-prod", 1500], [null, 125]], "biggest first, as read");
  assert.deepEqual(report.totals, { CAD: 4512 + 1000 + 1500 + 125, USD: 300 });
  assert.equal(report.losing, 1);
});

test("the per-shop totals row 15.17's spend guards read: shops only", () => {
  const costs = readCosts({ rows: ROWS, period: "2026-11" });
  assert.deepEqual(costPerShop({ rows: SHOPS, costs }), {
    "owl-press": { cents: 4512, currency: "CAD" },
    "moth-press": { cents: 1000, currency: "CAD" },
    "fern-press": { cents: 300, currency: "USD" },
  });
});

test("the control room's Costs: admins only, this month, and a plain empty state until the export is on", async () => {
  const exportFake = fakeBillingExport(ROWS);
  const registry = { listShops: async () => structuredClone(SHOPS) };
  const admins = controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" });
  const desk = createCostsDesk({ registry, reader: createCostReader({ fetchRows: exportFake.fetchRows }), admins, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings, routes: costRoutes(desk) });
  const ask = (claims) => api({ method: "GET", path: "/api/control/costs", headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });

  assert.equal((await ask({ ...admin, uid: "x", email: "someone@example.com" })).status, 403);
  const answer = await ask(admin);
  assert.equal(answer.status, 200);
  assert.equal(answer.body.month, "2026-11");
  assert.equal(answer.body.configured, true);
  assert.equal(answer.body.shops[0].shopId, "owl-press");
  assert.deepEqual(exportFake.asked, ["2026-11"]);

  const off = createCostsDesk({ registry, reader: createCostReader({}), admins, now: () => new Date(NOW) });
  assert.deepEqual(await off.costs(admin), { month: "2026-11", configured: false, empty: COSTS_EMPTY, shops: [], notShops: [], totals: {} });
  const nothingYet = createCostsDesk({ registry, reader: createCostReader({ fetchRows: fakeBillingExport([]).fetchRows }), admins, now: () => new Date(NOW) });
  assert.equal((await nothingYet.costs(admin)).empty, COSTS_EMPTY);

  exportFake.fail = true;
  assert.equal((await ask(admin)).status, 502);
  assert.equal(monthOf(Date.parse("2026-12-31T23:59:59Z")), "2026-12");
});

test("pay what you use: the running cost billed sits next to Google's, so a shop covers its cost plus the fee", () => {
  const five = platformSettings({});
  const costs = readCosts({ period: "2026-11", rows: [exportRow({ projectId: OWL, cost: 2.4, at: "2026-11-03T00:00:00Z" })] });
  const report = costReport({ rows: [{ shopId: OWL, status: "live", plan: "both", billing: { plan: "both", status: "active", lastRunningCost: { month: "2026-10", cents: 230 } } }], costs, settings: five });
  const [owl] = report.shops;
  assert.deepEqual([owl.googleCents, owl.runningCents, owl.runningMonth, owl.paidCents, owl.marginCents, owl.losing], [240, 230, "2026-10", 730, 490, false]);
});
