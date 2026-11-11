// The Google link as the hosted server runs it (hosted.js): testing mode for the test shop only, writes into the shop's
// own folder, and the door answering "coming soon" without keys.
import test from "node:test";
import assert from "node:assert/strict";
import { googleEnv, hostedGoogleLink, hostedShopFirebase, shopPlace } from "./hosted.js";
import { readGoogleConfig } from "./config.js";

const KEYS = { GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "made-up", GOOGLE_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64"), PLATFORM_URL: "https://platform.example" };

test("keys without the switch is testing: the test shop only", () => {
  const config = readGoogleConfig(googleEnv(KEYS));
  assert.equal(config.enabled, false);
  assert.equal(config.testing, true);
  assert.equal(config.redirectUrl, "https://platform.example/api/google/oauth");
  assert.equal(readGoogleConfig({}).testing, false);
});

test("a shared shop's writes land in its own folder of its own project", async () => {
  const sent = [];
  const fetch = async (url, init = {}) => {
    sent.push({ url: String(url), method: init.method, body: init.body });
    if (String(url).includes("cloudresourcemanager")) return new Response(JSON.stringify({ projectNumber: "4242" }), { status: 200 });
    return new Response("{}", { status: 200 });
  };
  const shop = hostedShopFirebase({ fetch, token: async () => "t" });
  const row = { shopId: "test-press", projectId: "lmb-test-shop", shared: true };
  assert.equal(await shop.serviceAccount(row), "4242-compute@developer.gserviceaccount.com");
  await shop.writeAnalytics(row, { measurementId: "G-ABC", propertyId: "123" });
  await shop.publishVerificationFile(row, { name: "google0123456789abcdef.html", content: "x" });
  const writes = sent.filter((s) => s.method === "PATCH").map((s) => decodeURIComponent(s.url));
  assert.ok(writes.every((u) => u.includes("projects/lmb-test-shop/databases/(default)/documents/shops/test-press/")), writes.join("\n"));
  assert.ok(sent.some((s) => s.url.includes("/b/lmb-test-shop.firebasestorage.app/o") && decodeURIComponent(s.url).includes("name=shops/test-press/site/google0123456789abcdef.html")));
  await assert.rejects(() => shop.publishVerificationFile(row, { name: "../index.html", content: "x" }));
  await shop.deleteProject(row); // a shared project is never deleted for one shop
  await assert.rejects(() => shop.deleteProject({ ...row, shared: false }));
  assert.throws(() => shopPlace({ shopId: "a", projectId: "" }));
});

test("without keys there is no link; with keys only the test shop is told Google is on", async () => {
  assert.equal(hostedGoogleLink({ env: {}, fetch: async () => { throw new Error("no calls"); }, token: async () => "t", platform: {}, registry: {} }), null);
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update("k".repeat(40)).digest("hex");
  const rows = { "test-press": { shopId: "test-press", testShop: true, serviceKeyHash: hash }, other: { shopId: "other", serviceKeyHash: hash } };
  const registry = { getShop: async (id) => rows[id] ?? null };
  const platform = { get: async () => null, set: async () => {}, transaction: async () => null };
  const g = hostedGoogleLink({ env: KEYS, fetch: async () => new Response("{}"), token: async () => "t", platform, registry });
  const ask = (shopId) => g.handle({ method: "POST", path: "/shop", headers: { "x-shop-id": shopId, authorization: `Bearer ${"k".repeat(40)}` }, body: { op: "google.status" } });
  assert.equal((await ask("test-press")).body.enabled, true);
  assert.deepEqual((await ask("other")).body, { enabled: false });
});
