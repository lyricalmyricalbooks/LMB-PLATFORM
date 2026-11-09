// Installing an app with the owner's permission (code plan 26.2): permission page, one-time code, key, removal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../signup/api.js";
import { fakeVerifyIdToken } from "../../signup/fakes.js";
import { platformSettings } from "../settings.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { fakeFirestore } from "../../clients/fake-firestore.js";
import { token } from "../../clients/fake-fetch.js";
import { firestoreClient } from "../../clients/firestore.js";
import { firestoreAppCodes, firestoreAppInstalls, firestoreApps } from "../../clients/stores.js";
import { fakeAppInstallStores, fakeAppStore } from "./fakes.js";
import { createAppMakers } from "./makers.js";
import { CODE_MINUTES, createAppInstalls } from "./installs.js";
import { appInstallPublicRoutes, appInstallRoutes, appMakerRoutes, appStorePublicRoutes } from "./routes.js";

const MAKER = { uid: "uid-maker", email: "dev@tools.example", email_verified: true };
const OWNER = { uid: "uid-ada", email: "ada@moth.example", email_verified: true };
const STAFF = { uid: "uid-sam", email: "sam@moth.example", email_verified: true };
const STRANGER = { uid: "uid-x", email: "x@example.com", email_verified: true };
const ADMIN = { uid: "uid-admin", email: "team@platform.example", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(Date.now() / 1000) };
const RETURN = "https://tools.example/installed";
const APP = {
  name: "Parcel Pal", tagline: "Cheaper labels", category: "orders-shipping", supportEmail: "help@tools.example",
  returnAddresses: [RETURN], scopes: ["write_orders", "read_shop"],
};

function world({ stores = { apps: fakeAppStore(), ...fakeAppInstallStores() } } = {}) {
  let clock = Date.parse("2026-11-04T12:00:00Z");
  const now = () => new Date(clock);
  const roles = { "ada@moth.example moth-press": "owner", "sam@moth.example moth-press": "staff", "dev@tools.example dev-shop": "owner" };
  const registry = fakeRegistry();
  registry.shops?.set?.("moth-press", { shopId: "moth-press", pressName: "Moth Press" });
  const auditLog = fakeAuditLog();
  let k = 0;
  const makers = createAppMakers({ store: stores.apps, admins: ["team@platform.example"], now });
  const installs = createAppInstalls({
    apps: stores.apps, makers, installs: stores.installs, codes: stores.codes, registry, auditLog, now,
    roleIn: async (person, shopId) => roles[`${person.email} ${shopId}`] ?? null, newKey: () => `cak_key${(k += 1)}`,
  });
  const api = createApi({
    signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}),
    routes: { ...appMakerRoutes(makers), ...appInstallRoutes(installs) }, publicRoutes: { ...appStorePublicRoutes(makers), ...appInstallPublicRoutes(installs) },
  });
  const ask = async (claims, method, path, body) => api({ method, path, body, headers: claims ? { Authorization: `Bearer ${JSON.stringify(claims)}` } : {} });
  return { ask, installs, registry, auditLog, stores, tick: (minutes) => { clock += minutes * 60_000; } };
}

async function listedApp(w) {
  const { app, secret } = (await w.ask(MAKER, "POST", "/api/apps/maker/create", APP)).body;
  await w.ask(MAKER, "POST", "/api/apps/maker/submit", { appId: app.appId });
  await w.ask(ADMIN, "POST", "/api/control/apps/approve", { appId: app.appId });
  return { appId: app.appId, secret };
}

const codeFrom = (redirect) => new URL(redirect).searchParams.get("code");

test("the owner says yes, the app swaps the code for a key that works for that shop only", async () => {
  const w = await world();
  const { appId, secret } = await listedApp(w);
  const preview = await w.ask(OWNER, "POST", "/api/apps/install/preview", { appId, shopId: "moth-press", returnAddress: RETURN });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.app.name, "Parcel Pal");
  assert.equal(preview.body.shopName, "Moth Press", "the page names the shop the app joins");
  assert.deepEqual(preview.body.permissions.map((p) => p.words), ["See your shop's name, address and currency", "Add tracking and mark orders as sent"]);
  assert.equal(preview.body.canApprove, true);

  const yes = await w.ask(OWNER, "POST", "/api/apps/install/approve", { appId, shopId: "moth-press", returnAddress: RETURN, state: "xyz" });
  const back = new URL(yes.body.redirect);
  assert.equal(back.origin + back.pathname, RETURN);
  assert.equal(back.searchParams.get("shop"), "moth-press");
  assert.equal(back.searchParams.get("state"), "xyz");
  assert.ok(![...w.stores.codes.rows.keys()].includes(back.searchParams.get("code")), "only the code's fingerprint is kept");

  const swap = await w.ask(null, "POST", "/api/apps/oauth/token", { appId, secret, code: back.searchParams.get("code"), returnAddress: RETURN });
  assert.equal(swap.status, 200, JSON.stringify(swap.body));
  assert.deepEqual(swap.body, { ok: true, accessToken: "cak_key1", shopId: "moth-press", scopes: ["read_shop", "write_orders"] });
  assert.ok(!JSON.stringify([...w.stores.installs.rows.values()]).includes("cak_key1"), "only the key's fingerprint is kept");

  const who = await w.installs.authenticate("cak_key1");
  assert.equal(who.shopId, "moth-press");
  assert.deepEqual(who.granted, ["read_shop", "read_orders", "write_orders"]);
  assert.equal(await w.installs.authenticate("cak_nope"), null);

  const listed = await w.ask(STAFF, "POST", "/api/apps/installed", { shopId: "moth-press" });
  assert.deepEqual(listed.body.apps.map((a) => a.name), ["Parcel Pal"]);
  assert.deepEqual([...w.registry.events.get("moth-press").values()].map((e) => e.what), ["app-installed"]);
  assert.equal([...w.auditLog.entries.get("moth-press").values()][0].by, "ada@moth.example");
});

test("only the owner can say yes or remove; strangers can't even look", async () => {
  const w = await world();
  const { appId } = await listedApp(w);
  const staffLook = await w.ask(STAFF, "POST", "/api/apps/install/preview", { appId, shopId: "moth-press", returnAddress: RETURN });
  assert.equal(staffLook.body.canApprove, false);
  assert.equal((await w.ask(STAFF, "POST", "/api/apps/install/approve", { appId, shopId: "moth-press", returnAddress: RETURN })).status, 403);
  assert.equal((await w.ask(STRANGER, "POST", "/api/apps/install/preview", { appId, shopId: "moth-press", returnAddress: RETURN })).status, 403);
  assert.equal((await w.ask(STRANGER, "POST", "/api/apps/install/approve", { appId, shopId: "moth-press", returnAddress: RETURN })).status, 403);
  assert.equal((await w.ask(STRANGER, "POST", "/api/apps/installed", { shopId: "moth-press" })).status, 403);
});

test("an unregistered return address is refused before anything is made", async () => {
  const w = await world();
  const { appId } = await listedApp(w);
  for (const returnAddress of ["https://evil.example/installed", "https://tools.example/installed?next=evil", undefined]) {
    assert.equal((await w.ask(OWNER, "POST", "/api/apps/install/approve", { appId, shopId: "moth-press", returnAddress })).status, 400);
  }
  assert.equal(w.stores.codes.rows.size, 0);
});

test("a code works once, for its own app, before it runs out, with the same return address", async () => {
  const w = await world();
  const { appId, secret } = await listedApp(w);
  const other = (await w.ask(MAKER, "POST", "/api/apps/maker/create", { ...APP, name: "Other app" })).body;
  const approve = async () => codeFrom((await w.ask(OWNER, "POST", "/api/apps/install/approve", { appId, shopId: "moth-press", returnAddress: RETURN })).body.redirect);

  let code = await approve();
  assert.equal((await w.ask(null, "POST", "/api/apps/oauth/token", { appId, secret: "cs_wrong", code, returnAddress: RETURN })).status, 401);
  assert.equal((await w.ask(null, "POST", "/api/apps/oauth/token", { appId: other.app.appId, secret: other.secret, code, returnAddress: RETURN })).status, 400, "another app can't use it");
  assert.equal((await w.ask(null, "POST", "/api/apps/oauth/token", { appId, secret, code, returnAddress: "https://tools.example/other" })).status, 400);

  w.tick(CODE_MINUTES + 1);
  assert.equal((await w.ask(null, "POST", "/api/apps/oauth/token", { appId, secret, code, returnAddress: RETURN })).status, 400, "run out");

  code = await approve();
  assert.equal((await w.ask(null, "POST", "/api/apps/oauth/token", { appId, secret, code, returnAddress: RETURN })).status, 200);
  assert.ok(await w.installs.authenticate("cak_key1"));
  const twice = await w.ask(null, "POST", "/api/apps/oauth/token", { appId, secret, code, returnAddress: RETURN });
  assert.equal(twice.status, 400);
  assert.equal(await w.installs.authenticate("cak_key1"), null, "a code used twice takes its key back");
});

test("removing an app ends its key at once; installing again gives a new key", async () => {
  const w = await world();
  const { appId, secret } = await listedApp(w);
  const install = async () => {
    const code = codeFrom((await w.ask(OWNER, "POST", "/api/apps/install/approve", { appId, shopId: "moth-press", returnAddress: RETURN })).body.redirect);
    return (await w.ask(null, "POST", "/api/apps/oauth/token", { appId, secret, code, returnAddress: RETURN })).body.accessToken;
  };
  const first = await install();
  assert.equal((await w.ask(STAFF, "POST", "/api/apps/install/remove", { appId, shopId: "moth-press" })).status, 403);
  assert.equal((await w.ask(OWNER, "POST", "/api/apps/install/remove", { appId, shopId: "moth-press" })).status, 200);
  assert.equal(await w.installs.authenticate(first), null);
  assert.equal((await w.ask(OWNER, "POST", "/api/apps/install/remove", { appId, shopId: "moth-press" })).status, 404);
  assert.deepEqual((await w.ask(OWNER, "POST", "/api/apps/installed", { shopId: "moth-press" })).body.apps, []);

  const second = await install();
  assert.notEqual(second, first);
  assert.ok(await w.installs.authenticate(second));
  assert.deepEqual([...w.registry.events.get("moth-press").values()].map((e) => e.what), ["app-installed", "app-removed", "app-installed"]);
});

test("a draft app can only be tried by its maker on their own shop", async () => {
  const w = await world();
  const { app, secret } = (await w.ask(MAKER, "POST", "/api/apps/maker/create", APP)).body;
  assert.equal((await w.ask(OWNER, "POST", "/api/apps/install/preview", { appId: app.appId, shopId: "moth-press", returnAddress: RETURN })).status, 404, "presses can't find a draft");
  const look = await w.ask(MAKER, "POST", "/api/apps/install/preview", { appId: app.appId, shopId: "dev-shop", returnAddress: RETURN });
  assert.equal(look.body.testing, true);
  const code = codeFrom((await w.ask(MAKER, "POST", "/api/apps/install/approve", { appId: app.appId, shopId: "dev-shop", returnAddress: RETURN })).body.redirect);
  const swap = await w.ask(null, "POST", "/api/apps/oauth/token", { appId: app.appId, secret, code, returnAddress: RETURN });
  assert.equal(swap.body.shopId, "dev-shop");
  assert.equal((await w.installs.authenticate(swap.body.accessToken)).testing, true);
});

test("the Firestore stores keep installs and codes and find a key by its fingerprint", async () => {
  const fs = fakeFirestore();
  const db = firestoreClient({ fetch: fs.fetch, token, projectId: "lmb-platform-prod" });
  const w = await world({ stores: { apps: firestoreApps(db), installs: firestoreAppInstalls(db), codes: { ...firestoreAppCodes(db), rows: new Map() } } });
  const { appId, secret } = await listedApp(w);
  const code = codeFrom((await w.ask(OWNER, "POST", "/api/apps/install/approve", { appId, shopId: "moth-press", returnAddress: RETURN, state: "s" })).body.redirect);
  const swap = await w.ask(null, "POST", "/api/apps/oauth/token", { appId, secret, code, returnAddress: RETURN });
  assert.equal(swap.status, 200, JSON.stringify(swap.body));
  assert.equal((await w.installs.authenticate(swap.body.accessToken)).appId, appId);
  assert.equal((await w.ask(OWNER, "POST", "/api/apps/installed", { shopId: "moth-press" })).body.apps.length, 1);
});
