import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const source = readFileSync(join(__dirname, "index.js"), "utf8");
const endpoints = ["cartShippingPreview", "manageReturn", "deleteTestOrders", "createPayPalOrder", "capturePayPalOrder", "createStripeCheckoutSession", "refundOrder", "getShippoConfig", "setShippoDynamicRates", "getShippoRates", "saveShippoConfig", "validateAddress", "createShippingLabel", "validateDiscountCode", "sendTestEmail", "markOrderPaid"];
function harness() {
  const db = { collection: () => ({ doc: () => ({ get: () => { throw new Error("Unverified request reached Firestore"); } }) }) };
  const admin = { initializeApp() {}, firestore: () => db, appCheck: () => ({ verifyToken: async () => { throw new Error("invalid token"); } }) };
  const wrap = (...args) => args.at(-1);
  const mockRequire = name => {
    if (name === "firebase-admin") return admin;
    if (name.startsWith("firebase-functions/v2/")) return new Proxy({}, { get: () => wrap });
    if (name === "firebase-functions/params") return { defineSecret: () => ({ value: () => "fake" }) };
    return require(name);
  };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: mockRequire, process: { env: { APP_CHECK_MODE: "enforce" } }, Buffer, console: { info() {}, error() {}, warn() {}, log() {} }, URL, setTimeout, clearTimeout, AbortController, fetch: () => { throw new Error("Unverified request reached a provider"); } }, { filename: "index.js" });
  return module.exports;
}
function response() {
  return { statusCode: 200, body: null, headers: {}, set(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
}
describe("deployed browser endpoint coverage", () => {
  it.each(endpoints)("%s blocks unauthenticated attestation before any data/provider work", async name => {
    const res = response();
    await harness()[name]({ method: "POST", headers: {}, body: {}, path: "/" + name }, res);
    expect(res.statusCode).toBe(401); expect(res.body).toEqual({ code: "APP_CHECK_REQUIRED" });
  });
  it.each(endpoints)("%s permits the App Check header in browser preflight", async name => {
    const res = response();
    await harness()[name]({ method: "OPTIONS", headers: { origin: "https://lyricalmyricalbooks.github.io" }, body: {}, path: "/" + name }, res);
    expect(res.statusCode).toBe(204);
    expect(res.headers["Access-Control-Allow-Headers"]).toContain("X-Firebase-AppCheck");
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://lyricalmyricalbooks.github.io");
  });
  it.each(["https://lmb-test-shop.web.app", "https://lyricalmyricalbooks.github.io"])("browser calls from the storefront at %s get CORS", async origin => {
    const res = response();
    await harness().createStripeCheckoutSession({ method: "OPTIONS", headers: { origin }, body: {}, path: "/createStripeCheckoutSession" }, res);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe(origin);
  });
  it.each(["https://lmb-test-shop.firebaseapp.com", "https://evil.example"])("%s is not an allowed storefront origin", async origin => {
    const res = response();
    await harness().createStripeCheckoutSession({ method: "OPTIONS", headers: { origin }, body: {}, path: "/createStripeCheckoutSession" }, res);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
  it("emailed download links retain their entitlement guard instead of requiring a browser header", async () => {
    const res = response();
    await harness().downloadDigitalAsset({ method: "GET", headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(400); expect(res.body).toBe("Missing download parameters");
  });
  it.each(["stripeWebhook", "paypalWebhook", "shippoWebhook"])("%s keeps its provider-facing method handler", async name => {
    const res = response();
    await harness()[name]({ method: "GET", headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(405); expect(res.body).toBe("Method Not Allowed");
  });
});
