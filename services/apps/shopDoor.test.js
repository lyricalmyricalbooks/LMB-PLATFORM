// The shop's door to the app store (26.5): the shop's server lists installed apps and the store, and removes an app,
// proving itself with its service key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../signup/api.js";
import { fakeVerifyIdToken } from "../../signup/fakes.js";
import { platformSettings } from "../settings.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { hashServiceKey } from "../email/http.js";
import { fakeAppInstallStores, fakeAppStore } from "./fakes.js";
import { createAppMakers } from "./makers.js";
import { createAppInstalls } from "./installs.js";
import { createAppShopDoor } from "./shopDoor.js";
import { appInstallPublicRoutes, appInstallRoutes, appMakerRoutes, appShopDoorRoutes, appStorePublicRoutes } from "./routes.js";

const MAKER = { uid: "uid-maker", email: "dev@tools.example", email_verified: true };
const OWNER = { uid: "uid-ada", email: "ada@moth.example", email_verified: true };
const ADMIN = { uid: "uid-admin", email: "team@platform.example", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(Date.now() / 1000) };
const RETURN = "https://tools.example/installed";
const KEY = "sk_shop_moth_press_0123456789abcdef0123456789";
const APP = { name: "Parcel Pal", tagline: "Cheaper labels", category: "orders-shipping", supportEmail: "help@tools.example", installAddress: "https://tools.example/start", returnAddresses: [RETURN], scopes: ["write_orders"] };

async function world() {
  const stores = { apps: fakeAppStore(), ...fakeAppInstallStores() };
  const registry = fakeRegistry();
  registry.shops.set("moth-press", { shopId: "moth-press", status: "live", serviceKeyHash: hashServiceKey(KEY) });
  const makers = createAppMakers({ store: stores.apps, admins: ["team@platform.example"] });
  const installs = createAppInstalls({ apps: stores.apps, makers, installs: stores.installs, codes: stores.codes, registry, auditLog: fakeAuditLog(), roleIn: async (p, s) => (p.email === OWNER.email && s === "moth-press" ? "owner" : null) });
  const api = createApi({
    signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}),
    routes: { ...appMakerRoutes(makers), ...appInstallRoutes(installs) },
    publicRoutes: { ...appStorePublicRoutes(makers), ...appInstallPublicRoutes(installs), ...appShopDoorRoutes(createAppShopDoor({ registry, installs, makers })) },
  });
  const ask = (claims, path, body) => api({ method: "POST", path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  const { app, secret } = (await ask(MAKER, "/api/apps/maker/create", APP)).body;
  await ask(MAKER, "/api/apps/maker/submit", { appId: app.appId });
  await ask(ADMIN, "/api/control/apps/approve", { appId: app.appId });
  const shop = (body, key = KEY, shopId = "moth-press") => api({ method: "POST", path: "/api/apps/shop", body, headers: { "X-Shop-Id": shopId, Authorization: `Bearer ${key}` } });
  return { ask, shop, appId: app.appId, secret, stores };
}

test("the shop lists the store, its installed apps, and removes one", async () => {
  const w = await world();
  const store = await w.shop({ op: "apps.store" });
  assert.equal(store.status, 200);
  assert.equal(store.body.apps[0].installAddress, "https://tools.example/start");
  assert.ok(store.body.categories.some((c) => c.id === "orders-shipping"));
  assert.deepEqual((await w.shop({ op: "apps.installed" })).body.apps, []);

  const { redirect } = (await w.ask(OWNER, "/api/apps/install/approve", { appId: w.appId, shopId: "moth-press", returnAddress: RETURN })).body;
  await w.ask(null, "/api/apps/oauth/token", { appId: w.appId, secret: w.secret, code: new URL(redirect).searchParams.get("code"), returnAddress: RETURN });
  const [installed] = (await w.shop({ op: "apps.installed" })).body.apps;
  assert.equal(installed.name, "Parcel Pal");
  assert.equal(installed.tagline, "Cheaper labels");
  assert.equal(installed.permissions[0].personal, true);

  assert.equal((await w.shop({ op: "apps.remove", args: { appId: w.appId, by: "ada@moth.example" } })).body.removed, true);
  assert.deepEqual((await w.shop({ op: "apps.installed" })).body.apps, []);
  assert.equal(w.stores.installs.rows.get(`moth-press~${w.appId}`).removedBy, "shop admin: ada@moth.example");
});

test("a wrong key or unknown shop gets the same no", async () => {
  const w = await world();
  assert.equal((await w.shop({ op: "apps.installed" }, "sk_wrong_wrong_wrong_wrong_wrong_wrong_1")).status, 401);
  assert.equal((await w.shop({ op: "apps.installed" }, KEY, "other-press")).status, 401);
  assert.equal((await w.shop({ op: "apps.nope" })).status, 400);
});
