// Setting up (control room): presses still in setup mode or opening, read from the front door's setup records. Platform
// admins only; it shows what the press typed and the platform's dates, never the owner's sign-in id or the kept file's
// path; it flags a press stuck opening and one whose setup is about to be removed; it counts the looks presses chose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GOING_SOON_DAYS, STUCK_OPENING_HOURS, createSetupDesk, guideOf, setupRoutes, setupSummary } from "./setupPresses.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { SETUP_EXPIRY_DAYS, newPressRecord } from "../signup/pressRecord.js";
import { fakeFrontDoorStores, fakeVerifyIdToken } from "../signup/fakes.js";
import { fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { platformSettings } from "../services/settings.js";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const DAY = 86_400_000;
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const ago = (days) => new Date(NOW - days * DAY).toISOString();

const record = (pressId, fields = {}) => ({
  ...newPressRecord({ pressId, ownerUid: `uid-${pressId}`, email: `${pressId}@example.com`, now: new Date(NOW - DAY) }),
  ...fields,
});

async function world() {
  const { presses } = fakeFrontDoorStores();
  const registry = fakeRegistry();
  await presses.create("press-fresh-one", record("press-fresh-one", { pressName: "Moth Press", country: "CA", plan: "both", look: "market-stall", adminLook: "desk", moving: "yes",
    stagedImport: { name: "books.csv", size: 900, rows: 42, at: ago(1) }, stagedImportPath: "press-imports/press-fresh-one/abc.csv", lastSeenAt: ago(0) }));
  await presses.create("press-half-way", record("press-half-way", { pressName: "", country: "", look: "index", lastSeenAt: ago(3) }));
  await presses.create("press-gone-quiet", record("press-gone-quiet", { pressName: "Quiet Press", country: "CA", look: "market-stall", adminLook: "bento", createdAt: ago(50), lastSeenAt: ago(GOING_SOON_DAYS) }));
  await presses.create("press-stuck-open", record("press-stuck-open", { pressName: "Stuck Press", country: "CA", plan: "shop", status: "opening", shopId: "stuck-press", shopStatus: "queued", openedAt: ago(2) }));
  await presses.create("press-now-live", record("press-now-live", { pressName: "Live Press", country: "CA", plan: "shop", status: "opening", shopId: "live-press", shopStatus: "queued", openedAt: ago(3) }));
  await registry.createShop("stuck-press", { shopId: "stuck-press", pressName: "Stuck Press", status: "making" });
  await registry.createShop("live-press", { shopId: "live-press", pressName: "Live Press", status: "live" });
  const desk = createSetupDesk({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), presses, registry, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: setupRoutes(desk), log: () => {} });
  const ask = (claims) => api({ method: "GET", path: "/api/control/presses", headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { presses, registry, desk, ask };
}

test("only platform admins see the presses setting up", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS)).status, 403);
  assert.equal((await w.ask({ ...ADMIN, firebase: {} })).status, 403, "two-step sign-in is needed, like every control-room call");
  const seen = await w.ask(ADMIN);
  assert.equal(seen.status, 200);
  assert.equal(seen.body.presses.length, 5);
});

test("a press shows what it typed and the platform's dates, never its sign-in id or the kept file's path", async () => {
  const { presses } = await (await world()).desk.list(ADMIN);
  const moth = presses.find((p) => p.pressId === "press-fresh-one");
  assert.deepEqual(
    { name: moth.pressName, plan: moth.plan, look: moth.look, adminLook: moth.adminLook, moving: moth.moving, import: moth.import, stillToDo: moth.stillToDo, idle: moth.idleDays },
    { name: "Moth Press", plan: "both", look: "market-stall", adminLook: "desk", moving: "yes", import: { name: "books.csv", rows: 42, at: ago(1) }, stillToDo: [], idle: 0 });
  assert.equal(moth.removesOn, new Date(NOW + SETUP_EXPIRY_DAYS * DAY).toISOString());
  const text = JSON.stringify(presses);
  assert.doesNotMatch(text, /uid-press/, "no owner sign-in id");
  assert.doesNotMatch(text, /press-imports\//, "no kept file path");
  assert.deepEqual(presses.find((p) => p.pressId === "press-half-way").stillToDo, ["press name", "country"]);
});

test("a press stuck opening and one about to be removed come first, with counts", async () => {
  const { counts, presses } = await (await world()).desk.list(ADMIN);
  assert.deepEqual(presses.slice(0, 2).map((p) => [p.pressId, p.flag]), [["press-stuck-open", "stuck"], ["press-gone-quiet", "going-soon"]]);
  const live = presses.find((p) => p.pressId === "press-now-live");
  assert.equal(live.flag, null, "a shop that went live isn't stuck");
  assert.equal(live.shopStatus, "live");
  assert.deepEqual(counts, { inSetup: 3, readyToOpen: 2, signedUpThisWeek: 4, opening: 1, opened: 1, stuck: 1, goingSoon: 1, bringingShopOver: 1, withProductFile: 1 });
});

test("opening is only stuck after a day, and going soon only after 45 idle days", () => {
  const opening = record("press-just-open", { status: "opening", shopId: "x", openedAt: new Date(NOW - (STUCK_OPENING_HOURS - 1) * 3_600_000).toISOString() });
  const idle = record("press-idle-some", { lastSeenAt: ago(GOING_SOON_DAYS - 1) });
  const { presses } = setupSummary({ records: [opening, idle], rows: [], now: NOW });
  assert.deepEqual(presses.map((p) => p.flag), [null, null]);
});

test("looks are counted by how many presses picked them, not chosen yet last", async () => {
  const { looks } = await (await world()).desk.list(ADMIN);
  assert.deepEqual(looks.website, [{ id: "market-stall", count: 2 }, { id: "index", count: 1 }, { id: "", count: 2 }]);
  assert.deepEqual(looks.admin, [{ id: "bento", count: 1 }, { id: "desk", count: 1 }, { id: "", count: 3 }]);
});

test("each press shows Stripe or Square for its cards, and the picks are counted", async () => {
  const w = await world();
  await w.presses.create("press-on-square", record("press-on-square", { pressName: "Square Press", country: "CA", plan: "shop", cardProvider: "square", lastSeenAt: ago(0) }));
  const { presses, cards } = await w.desk.list(ADMIN);
  assert.equal(presses.find((p) => p.pressId === "press-on-square").cardProvider, "square");
  assert.equal(presses.find((p) => p.pressId === "press-fresh-one").cardProvider, "");
  assert.deepEqual(cards, [{ id: "square", count: 1 }, { id: "", count: 5 }]);
});

test("without the setup records the page says so instead of showing none", async () => {
  const desk = createSetupDesk({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), presses: null, registry: fakeRegistry(), now: () => new Date(NOW) });
  await assert.rejects(desk.list(ADMIN), { status: 503 });
});

test("the page has a Setting up page that loads the route, and both web doors serve it", () => {
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(page, /data-page="setting-up"/);
  assert.match(page, /href="#setting-up"/);
  assert.match(app, /"\/control\/presses"/);
  for (const door of ["../server/world.js", "../walkthrough/world.js"]) {
    assert.match(readFileSync(new URL(door, import.meta.url), "utf8"), /setupRoutes\(setupDesk\)/, door);
  }
});

test("how far through the setup guide: the shop's own steps, counted the same way", () => {
  const ts = readFileSync(new URL("../apps/shop/src/setupMode/pages.ts", import.meta.url), "utf8");
  const body = /export function guideSteps[\s\S]*?\n}\n/.exec(ts)[0];
  const shopIds = [...body.matchAll(/\bid: "([a-z]+)"/g)].map((m) => m[1]);
  const record = { plan: "", pressName: "", sells: "", country: "", look: "", moving: "", stagedImport: null, status: "setup" };
  assert.deepEqual(guideOf(record).steps.map((s) => s.id).sort(), [...new Set(shopIds)].sort(), "same steps as the shop's guide");
  assert.deepEqual([guideOf(record).done, guideOf(record).total, guideOf(record).next], [0, 4, "Pick what to set up"], "the bring-over step counts only once done");
  const halfway = { ...record, plan: "both", pressName: "Moth Press", sells: "books", country: "CA" };
  assert.deepEqual([guideOf(halfway).done, guideOf(halfway).total, guideOf(halfway).next], [2, 4, "Choose the website's look"]);
  const stockroom = { ...halfway, plan: "stockroom", stagedImport: { rows: 3 } };
  assert.deepEqual([guideOf(stockroom).done, guideOf(stockroom).total, guideOf(stockroom).next], [3, 4, "Create the shop"], "no look step without a website");
  assert.deepEqual([guideOf({ ...halfway, look: "riso", status: "opening" }).done, guideOf({ ...halfway, look: "riso", status: "opening" }).next], [4, null]);
  assert.deepEqual([guideOf({ ...halfway, domainChoice: "free" }).done, guideOf({ ...halfway, domainChoice: "free" }).total], [3, 5], "the web address step counts once answered");
  assert.equal(guideOf({ ...halfway, domainChoice: "own" }).total, 4, "a domain not typed yet isn't done");
});
