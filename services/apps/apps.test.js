// App makers register outside apps; admins review them; the store shows only approved copies (code plan 26.1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../signup/api.js";
import { fakeVerifyIdToken } from "../../signup/fakes.js";
import { platformSettings } from "../settings.js";
import { findBanned } from "../../plain-words/words.js";
import { fakeFirestore } from "../../clients/fake-firestore.js";
import { token } from "../../clients/fake-fetch.js";
import { firestoreClient } from "../../clients/firestore.js";
import { firestoreApps } from "../../clients/stores.js";
import { fakeAppStore } from "./fakes.js";
import { MAX_APPS_PER_MAKER, createAppMakers, returnAddressAllowed } from "./makers.js";
import { appMakerRoutes, appStorePublicRoutes } from "./routes.js";
import { SCOPES, allows, cleanScopes, grantedScopes } from "./scopes.js";

const MAKER = { uid: "uid-maker", email: "Dev@Tools.example", email_verified: true, name: "Dee" };
const OTHER = { uid: "uid-other", email: "other@example.com", email_verified: true };
const UNCONFIRMED = { uid: "uid-new", email: "new@example.com", email_verified: false };
const ADMIN = { uid: "uid-admin", email: "team@platform.example", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(Date.now() / 1000) };
const settings = platformSettings({});

const APP = {
  name: "  Parcel   Pal ", tagline: "Cheaper labels", description: "Prints labels.", category: "orders-shipping",
  supportEmail: "help@tools.example", website: "https://tools.example", alertsAddress: "https://tools.example/alerts",
  returnAddresses: ["https://tools.example/installed", "http://localhost:3000/installed"], scopes: ["read_orders", "write_orders", "read_shop"],
};

function world(store = fakeAppStore()) {
  let clock = Date.parse("2026-11-04T12:00:00Z");
  let n = 0;
  let s = 0;
  const makers = createAppMakers({
    store, admins: ["team@platform.example"], now: () => new Date(clock),
    newId: () => `app_${String((n += 1)).padStart(12, "0")}`, newSecret: () => `cs_secret_${(s += 1)}`,
  });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings, routes: appMakerRoutes(makers), publicRoutes: appStorePublicRoutes(makers) });
  const ask = async (claims, method, path, body) => api({ method, path, body, headers: claims ? { Authorization: `Bearer ${JSON.stringify(claims)}` } : {} });
  return { store, makers, ask, tick: (minutes) => { clock += minutes * 60_000; } };
}

test("permissions: a fixed list in plain words, and change includes see", () => {
  assert.deepEqual(cleanScopes(["write_orders", "read_orders", "read_shop"]), ["read_shop", "write_orders"]);
  assert.equal(cleanScopes(["read_orders", "mark_paid"]), null, "a permission that isn't on the list is refused");
  assert.equal(cleanScopes("read_orders"), null);
  assert.deepEqual(grantedScopes(["write_products"]), ["read_products", "write_products"]);
  assert.ok(allows(["write_inventory"], "read_inventory"));
  assert.ok(!allows(["read_inventory"], "write_inventory"));
  for (const [name, scope] of Object.entries(SCOPES)) {
    assert.deepEqual(findBanned(scope.words), [], `${name}'s words are plain`);
    assert.ok(!/pay|card|checkout|refund/i.test(name), `${name}: no permission touches payments`);
  }
});

test("a maker registers an app and sees its secret once", async () => {
  const { ask, store } = world();
  const res = await ask(MAKER, "POST", "/api/apps/maker/create", APP);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const { app, secret } = res.body;
  assert.equal(secret, "cs_secret_1");
  assert.equal(app.draft.name, "Parcel Pal");
  assert.deepEqual(app.draft.scopes, ["read_shop", "write_orders"]);
  assert.equal(app.status, "draft");
  assert.equal(app.hasSecret, true);
  assert.equal(app.secretHash, undefined, "the fingerprint never leaves the server");
  const kept = store.apps.get(app.appId);
  assert.equal(kept.makerEmail, "dev@tools.example");
  assert.ok(!JSON.stringify(kept).includes("cs_secret_1"), "only the fingerprint is kept");

  const mine = await ask(MAKER, "GET", "/api/apps/maker/mine");
  assert.equal(mine.body.apps.length, 1);
  assert.ok(!JSON.stringify(mine.body).includes("cs_secret_1"));
});

test("registering twice with the same request is one app, and the retry can't show the secret", async () => {
  const { ask, store } = world();
  const first = await ask(MAKER, "POST", "/api/apps/maker/create", { ...APP, requestId: "req-00000001" });
  const again = await ask(MAKER, "POST", "/api/apps/maker/create", { ...APP, requestId: "req-00000001" });
  assert.equal(again.body.app.appId, first.body.app.appId);
  assert.equal(again.body.secret, null);
  assert.equal(store.apps.size, 1);
});

test("the details are checked, field by field", async () => {
  const { ask } = world();
  const bad = await ask(MAKER, "POST", "/api/apps/maker/create", {
    ...APP, name: "x", supportEmail: "nope", website: "http://tools.example", returnAddresses: ["http://tools.example/back", "https://user:pw@tools.example/"], scopes: ["read_orders", "mark_paid"], category: "games",
  });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.problems).sort(), ["category", "name", "returnAddresses", "scopes", "supportEmail", "website"]);
  const none = await ask(MAKER, "POST", "/api/apps/maker/create", { ...APP, scopes: [], returnAddresses: [] });
  assert.deepEqual(Object.keys(none.body.problems).sort(), ["returnAddresses", "scopes"]);
  const anon = await ask(null, "POST", "/api/apps/maker/create", APP);
  assert.equal(anon.status, 401);
  const unconfirmed = await ask(UNCONFIRMED, "POST", "/api/apps/maker/create", APP);
  assert.equal(unconfirmed.status, 403);
});

test(`a maker has at most ${MAX_APPS_PER_MAKER} apps`, async () => {
  const { ask } = world();
  for (let i = 0; i < MAX_APPS_PER_MAKER; i += 1) assert.equal((await ask(MAKER, "POST", "/api/apps/maker/create", APP)).status, 200);
  assert.equal((await ask(MAKER, "POST", "/api/apps/maker/create", APP)).status, 429);
  assert.equal((await ask(OTHER, "POST", "/api/apps/maker/create", APP)).status, 200, "the limit is per maker");
});

test("only the app's maker can change it, replace its secret or send it for review", async () => {
  const { ask } = world();
  const { app } = (await ask(MAKER, "POST", "/api/apps/maker/create", APP)).body;
  for (const path of ["/api/apps/maker/update", "/api/apps/maker/secret", "/api/apps/maker/submit"]) {
    const res = await ask(OTHER, "POST", path, { appId: app.appId, name: "Stolen" });
    assert.equal(res.status, 404, `${path} answers as if there were no such app`);
  }
  assert.equal((await ask(MAKER, "POST", "/api/apps/maker/update", { appId: "../apps/x" })).status, 404);
});

test("a new secret replaces the old one at once", async () => {
  const { ask, makers } = world();
  const { app, secret } = (await ask(MAKER, "POST", "/api/apps/maker/create", APP)).body;
  assert.equal((await makers.verifyClient(app.appId, secret))?.appId, app.appId);
  assert.equal(await makers.verifyClient(app.appId, "cs_wrong"), null);
  assert.equal(await makers.verifyClient(app.appId, ""), null);
  assert.equal(await makers.verifyClient("app_nope", secret), null);
  const fresh = await ask(MAKER, "POST", "/api/apps/maker/secret", { appId: app.appId });
  assert.equal(fresh.body.secret, "cs_secret_2");
  assert.equal(await makers.verifyClient(app.appId, secret), null, "the old secret stops working");
  assert.ok(await makers.verifyClient(app.appId, "cs_secret_2"));
});

test("review: send back with a reason, fix, approve; the store shows the approved copy only", async () => {
  const { ask } = world();
  const { app } = (await ask(MAKER, "POST", "/api/apps/maker/create", APP)).body;
  assert.deepEqual((await ask(null, "GET", "/api/apps/store")).body.apps, [], "a draft isn't on the store");

  assert.equal((await ask(MAKER, "POST", "/api/apps/maker/submit", { appId: app.appId })).body.app.status, "in-review");
  assert.equal((await ask(MAKER, "POST", "/api/control/apps", {})).status, 403, "only admins see the queue");
  const queue = await ask(ADMIN, "POST", "/api/control/apps", {});
  assert.deepEqual(queue.body.apps.map((a) => a.appId), [app.appId]);

  assert.equal((await ask(ADMIN, "POST", "/api/control/apps/send-back", { appId: app.appId, reason: "short" })).status, 400);
  const back = await ask(ADMIN, "POST", "/api/control/apps/send-back", { appId: app.appId, reason: "Say what the app does with orders." });
  assert.equal(back.body.app.status, "draft");
  assert.equal(back.body.app.review.sentBack.reason, "Say what the app does with orders.");
  assert.equal((await ask(ADMIN, "POST", "/api/control/apps/approve", { appId: app.appId })).status, 409, "only an app waiting for review");

  await ask(MAKER, "POST", "/api/apps/maker/update", { appId: app.appId, description: "Prints cheaper labels for your orders and adds tracking." });
  await ask(MAKER, "POST", "/api/apps/maker/submit", { appId: app.appId });
  const ok = await ask(ADMIN, "POST", "/api/control/apps/approve", { appId: app.appId });
  assert.equal(ok.body.app.status, "listed");
  assert.equal(ok.body.app.review.sentBack, null);

  const shop = (await ask(null, "GET", "/api/apps/store")).body.apps;
  assert.equal(shop.length, 1);
  assert.equal(shop[0].name, "Parcel Pal");
  assert.equal(shop[0].categoryName, "Orders and shipping");
  assert.deepEqual(shop[0].permissions.map((p) => p.scope), ["read_shop", "write_orders"]);
  assert.ok(!("returnAddresses" in shop[0]) && !("makerEmail" in shop[0]), "the store shows only public details");
  assert.equal((await ask(null, "GET", "/api/apps/store?category=marketing")).body.apps.length, 0);
  assert.equal((await ask(null, "GET", "/api/apps/store?category=orders-shipping")).body.apps.length, 1);
});

test("a listed app's changes wait for review while the approved copy stays on the store", async () => {
  const { ask } = world();
  const { app } = (await ask(MAKER, "POST", "/api/apps/maker/create", APP)).body;
  await ask(MAKER, "POST", "/api/apps/maker/submit", { appId: app.appId });
  await ask(ADMIN, "POST", "/api/control/apps/approve", { appId: app.appId });
  assert.equal((await ask(MAKER, "POST", "/api/apps/maker/submit", { appId: app.appId })).status, 409, "nothing new to review");

  const changed = await ask(MAKER, "POST", "/api/apps/maker/update", { appId: app.appId, scopes: ["write_orders", "read_customers"] });
  assert.equal(changed.body.app.status, "draft");
  assert.equal(changed.body.app.draftDiffers, true);
  let shop = (await ask(null, "GET", "/api/apps/store")).body.apps;
  assert.deepEqual(shop[0].permissions.map((p) => p.scope), ["read_shop", "write_orders"], "presses still see what was approved");
  assert.deepEqual((await ask(ADMIN, "POST", "/api/control/apps", { status: "on-store" })).body.apps.map((a) => a.appId), [app.appId]);

  await ask(MAKER, "POST", "/api/apps/maker/submit", { appId: app.appId });
  await ask(ADMIN, "POST", "/api/control/apps/approve", { appId: app.appId });
  shop = (await ask(null, "GET", "/api/apps/store")).body.apps;
  assert.deepEqual(shop[0].permissions.map((p) => p.scope), ["write_orders", "read_customers"]);
  assert.equal(shop[0].permissions[1].personal, true, "customer details are marked as personal");

  // Undoing an edit puts it back to listed.
  await ask(MAKER, "POST", "/api/apps/maker/update", { appId: app.appId, tagline: "Something else" });
  const undone = await ask(MAKER, "POST", "/api/apps/maker/update", { appId: app.appId, tagline: "Cheaper labels" });
  assert.equal(undone.body.app.status, "listed");
});

test("an admin takes an app off the store with a reason", async () => {
  const { ask } = world();
  const { app } = (await ask(MAKER, "POST", "/api/apps/maker/create", APP)).body;
  assert.equal((await ask(ADMIN, "POST", "/api/control/apps/unlist", { appId: app.appId, reason: "Not on the store yet." })).status, 409);
  await ask(MAKER, "POST", "/api/apps/maker/submit", { appId: app.appId });
  await ask(ADMIN, "POST", "/api/control/apps/approve", { appId: app.appId });
  const off = await ask(ADMIN, "POST", "/api/control/apps/unlist", { appId: app.appId, reason: "Presses reported it sends spam." });
  assert.equal(off.body.app.status, "unlisted");
  assert.deepEqual((await ask(null, "GET", "/api/apps/store")).body.apps, []);
  const history = (await ask(ADMIN, "POST", "/api/control/apps", { status: "unlisted" })).body.apps[0].history.map((h) => h.what);
  assert.deepEqual(history, ["registered", "sent for review", "approved", "taken off the store: Presses reported it sends spam."]);
  assert.equal((await ask(ADMIN, "POST", "/api/control/apps", { status: "gone" })).status, 400);
});

test("return addresses must match exactly", () => {
  const details = { returnAddresses: ["https://tools.example/installed", "http://localhost:3000/installed"] };
  assert.ok(returnAddressAllowed(details, "https://tools.example/installed"));
  assert.ok(returnAddressAllowed(details, "http://localhost:3000/installed"));
  assert.ok(!returnAddressAllowed(details, "https://tools.example/installed/../evil"));
  assert.ok(!returnAddressAllowed(details, "https://tools.example/other"));
  assert.ok(!returnAddressAllowed(details, "https://evil.example/installed"));
  assert.ok(!returnAddressAllowed(details, "http://tools.example/installed"));
  assert.ok(!returnAddressAllowed(details, null));
});

test("the public permission list needs no sign-in", async () => {
  const { ask } = world();
  const res = await ask(null, "GET", "/api/apps/permissions");
  assert.equal(res.status, 200);
  assert.equal(res.body.permissions.length, Object.keys(SCOPES).length);
  assert.ok(res.body.categories.some((c) => c.id === "accounting"));
});

test("the Firestore store keeps apps at apps/<appId> and finds them by maker, status and store", async () => {
  const fs = fakeFirestore();
  const firestore = firestoreClient({ fetch: fs.fetch, token, projectId: "lmb-platform-prod" });
  const { ask } = world(firestoreApps(firestore));
  const { app } = (await ask(MAKER, "POST", "/api/apps/maker/create", APP)).body;
  assert.ok(await firestore.get(`apps/${app.appId}`));
  assert.equal((await ask(MAKER, "GET", "/api/apps/maker/mine")).body.apps.length, 1);
  await ask(MAKER, "POST", "/api/apps/maker/submit", { appId: app.appId });
  assert.equal((await ask(ADMIN, "POST", "/api/control/apps", {})).body.apps.length, 1);
  await ask(ADMIN, "POST", "/api/control/apps/approve", { appId: app.appId });
  assert.equal((await ask(null, "GET", "/api/apps/store")).body.apps.length, 1);
});
