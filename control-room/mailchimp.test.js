// Mailchimp in the control room: admins only; whether the app is switched on; each shop that added it, problems first,
// with its audience, readers added and last sync; never a token, an address or a reader's details.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMailchimpDesk, mailchimpDeskRoutes } from "./mailchimp.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeRegistry } from "../setup/fakes.js";
import { fakeMailchimpStores } from "../services/apps/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };

async function world({ ready = true } = {}) {
  const registry = fakeRegistry();
  await registry.createShop("moth", { shopId: "moth", pressName: "Moth Press", status: "live" });
  await registry.createShop("wasp", { shopId: "wasp", pressName: "Wasp Books", status: "live" });
  await registry.createShop("ant", { shopId: "ant", pressName: "Ant Editions", status: "live" });
  const stores = fakeMailchimpStores();
  await stores.connections.put("moth", { shopId: "moth", stage: "connected", listId: "l1", listName: "Moth readers", added: 12, connectedAt: "2026-11-01T00:00:00Z", lastSyncAt: "2026-11-11T11:45:00Z", accessToken: "sealed-secret", tokenFingerprint: "abc123", connectedBy: "owner@example.com", lastProblem: null });
  await stores.connections.put("wasp", { shopId: "wasp", stage: "connected", listId: "l2", listName: "Wasp list", added: 3, lastProblem: { words: "Mailchimp said the sign-in was taken back.", at: "2026-11-11T10:00:00Z" } });
  await stores.connections.put("ant", { shopId: "ant", stage: "choose", lists: [{ id: "a", name: "A" }] });
  const desk = createMailchimpDesk({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), mailchimp: { ready: () => ready }, connections: stores.connections, registry, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: mailchimpDeskRoutes(desk), log: () => {} });
  const ask = (claims) => api({ method: "POST", path: "/api/control/mailchimp", body: {}, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { desk, ask };
}

test("only platform admins see Mailchimp", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS)).status, 403);
  assert.equal((await w.ask(ADMIN)).status, 200);
});

test("problems first, then shops still connecting, with counts", async () => {
  const { ready, shops, counts } = await (await world()).desk.overview(ADMIN);
  assert.equal(ready, true);
  assert.deepEqual(shops.map((s) => [s.pressName, s.stage, s.audience, s.added]), [["Wasp Books", "connected", "Wasp list", 3], ["Ant Editions", "choose", null, 0], ["Moth Press", "connected", "Moth readers", 12]]);
  assert.equal(shops[0].lastProblem.words, "Mailchimp said the sign-in was taken back.");
  assert.deepEqual(counts, { connected: 2, problems: 1, added: 15 });
});

test("never shows a token, the press's address or the audiences to pick from", async () => {
  const text = JSON.stringify(await (await world()).desk.overview(ADMIN));
  for (const secret of ["sealed-secret", "abc123", "owner@example.com", "\"lists\""]) assert.ok(!text.includes(secret), secret);
});

test("says when Mailchimp isn't switched on", async () => {
  assert.equal((await (await world({ ready: false })).desk.overview(ADMIN)).ready, false);
});

test("both worlds serve the route and the page shows it", () => {
  for (const door of ["../server/world.js", "../walkthrough/world.js"]) assert.match(readFileSync(new URL(door, import.meta.url), "utf8"), /mailchimpDeskRoutes\(createMailchimpDesk/, door);
  assert.match(readFileSync(new URL("./app.js", import.meta.url), "utf8"), /"\/control\/mailchimp"/);
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /id="mailchimp"/);
});
