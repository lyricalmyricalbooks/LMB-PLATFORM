// Settings › Apps through the platform's app store door: admin only, service key, plain errors.
import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { appsLinkActions } = require("./appsLink");
const { readShopConfig } = require("./shopConfig");

const res = () => { const r = { statusCode: 200, body: null }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const admin = async () => ({ email: "ada@example.com" });

describe("apps link", () => {
  test("lists the store and removes an app, with the shop's key and the admin's email", async () => {
    const calls = [];
    const fetch = async (url, init) => { calls.push({ url, ...init, json: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ ok: true, apps: [] }) }; };
    const { handleApps } = appsLinkActions({ url: "https://platform.example/api/apps", shopId: "moth-press", serviceKey: () => "sk_1", requireAdmin: admin, fetch });
    const r1 = res();
    await handleApps({ body: { step: "store", category: "marketing" } }, r1);
    expect(r1.body).toEqual({ ok: true, apps: [] });
    const r2 = res();
    await handleApps({ body: { step: "remove", appId: "app_0123456789ab" } }, r2);
    expect(calls.map((c) => c.json)).toEqual([{ op: "apps.store", args: { category: "marketing" } }, { op: "apps.remove", args: { appId: "app_0123456789ab", by: "ada@example.com" } }]);
    expect(calls[0].url).toBe("https://platform.example/api/apps/shop");
    expect(calls[0].headers).toMatchObject({ "X-Shop-Id": "moth-press", Authorization: "Bearer sk_1" });
  });

  test("off without the door; bad steps refused; platform errors passed on plainly", async () => {
    const off = res();
    await appsLinkActions({ url: "", shopId: "s", serviceKey: () => "k", requireAdmin: admin }).handleApps({ body: { step: "installed" } }, off);
    expect(off.body.code).toBe("not_available");
    const fetch = async () => ({ ok: false, status: 404, json: async () => ({ ok: false, message: "That app isn't installed on this shop." }) });
    const { handleApps } = appsLinkActions({ url: "https://p.example", shopId: "s", serviceKey: () => "k", requireAdmin: admin, fetch });
    const bad = res();
    await handleApps({ body: { step: "remove", appId: "nope" } }, bad);
    expect(bad.statusCode).toBe(400);
    const gone = res();
    await handleApps({ body: { step: "remove", appId: "app_0123456789ab" } }, gone);
    expect([gone.statusCode, gone.body.error]).toEqual([404, "That app isn't installed on this shop."]);
  });

  test("PLATFORM_APPS_URL turns it on; a plain http address doesn't", () => {
    expect(readShopConfig({ GCLOUD_PROJECT: "lmb-test-shop", PLATFORM_APPS_URL: "https://platform.example/api/apps/" }).platformAppsUrl).toBe("https://platform.example/api/apps");
    expect(readShopConfig({ GCLOUD_PROJECT: "lmb-test-shop", PLATFORM_APPS_URL: "http://plain.example" }).platformAppsUrl).toBe("");
  });
});
