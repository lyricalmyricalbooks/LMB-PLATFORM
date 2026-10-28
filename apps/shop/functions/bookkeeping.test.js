// Settings › Bookkeeping (code plan 7.16): the admin asks the platform's bookkeeping service, as this shop, with its
// service key. A pretend service stands in; nothing reaches Intuit.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { bookkeepingActions, dayFromOrders } = require("./bookkeeping.js");
const { readShopConfig } = require("./shopConfig.js");
const { usesPlatformServices } = require("./platformKey.js");

const URL_ = "https://accounting.platform.example";
const KEY = "service-key-moth-press-0123456789abcdef0123";

function make({ url = URL_, key = KEY, answer, buildDay = null } = {}) {
  const calls = [];
  const fetch = async (to, init) => {
    calls.push({ to, headers: init.headers, ...JSON.parse(init.body) });
    if (answer) return answer();
    return { ok: true, status: 200, json: async () => ({ enabled: true, connected: false }) };
  };
  const { handleBookkeeping } = bookkeepingActions({
    url, shopId: "moth-press", serviceKey: () => key, fetch, buildDay,
    requireAdmin: async (req, res) => (req.admin ? { email: "owner@example.com" } : (res.status(403).json({ error: "Admin access required" }), null)),
  });
  const run = async (body, { admin = true } = {}) => {
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await handleBookkeeping({ body, admin }, res);
    return res;
  };
  return { run, calls };
}

describe("the admin's Bookkeeping page", () => {
  test("each step asks the bookkeeping service as this shop, with its key", async () => {
    const { run, calls } = make();
    await run({ step: "status" });
    await run({ step: "connect", returnUrl: "https://moth-press.web.app/admin#settings/bookkeeping" });
    await run({ step: "options" });
    await run({ step: "save", style: "daily", taxCodes: { GST: "5" }, noTaxCode: "2", accounts: { bank: "35" }, currency: "USD" });
    await run({ step: "disconnect" });
    expect(calls.map((c) => c.op)).toEqual(["accounting.status", "accounting.connectLink", "accounting.options", "accounting.save", "accounting.disconnect"]);
    expect(calls[1].args).toEqual({ returnUrl: "https://moth-press.web.app/admin#settings/bookkeeping" });
    // The currency is the shop's, never the page's.
    expect(calls[3].args).toEqual({ style: "daily", taxCodes: { GST: "5" }, noTaxCode: "2", accounts: { bank: "35" }, currency: "CAD" });
    expect(calls[0].to).toBe(`${URL_}/shop`);
    expect(calls[0].headers).toMatchObject({ "X-Shop-Id": "moth-press", Authorization: `Bearer ${KEY}` });
  });

  test("off without the service: status says so quietly, the other steps are refused, nothing is sent", async () => {
    const { run, calls } = make({ url: "" });
    const status = await run({ step: "status" });
    expect(status.statusCode).toBe(200);
    expect(status.body).toEqual({ enabled: false });
    const connect = await run({ step: "connect", returnUrl: "https://moth-press.web.app/admin" });
    expect(connect.statusCode).toBe(409);
    expect(connect.body.code).toBe("not_available");
    expect(calls).toEqual([]);
  });

  test("only an admin may ask; unknown steps and a missing key are refused", async () => {
    expect((await make().run({ step: "status" }, { admin: false })).statusCode).toBe(403);
    expect((await make().run({ step: "post" })).statusCode).toBe(400);
    expect((await make({ key: "" }).run({ step: "status" })).statusCode).toBe(503);
  });

  test("send again needs the day's numbers; with them it sends that day's summary", async () => {
    const waiting = await make().run({ step: "resend", date: "2026-10-27" });
    expect(waiting.statusCode).toBe(409);
    expect(waiting.body.code).toBe("not_ready");
    expect((await make().run({ step: "resend", date: "yesterday" })).statusCode).toBe(400);
    const summary = { date: "2026-10-27", salesCents: 4000, currency: "CAD" };
    const { run, calls } = make({ buildDay: async (date) => (date === "2026-10-27" ? summary : null) });
    expect((await run({ step: "resend", date: "2026-10-27" })).statusCode).toBe(200);
    expect(calls[0]).toMatchObject({ op: "accounting.resend", args: { summary } });
  });

  test("the service's refusals keep their plain words and code", async () => {
    const answer = () => ({ ok: false, status: 409, json: async () => ({ error: { code: "disconnected", message: "QuickBooks stopped taking this shop's sales. Connect to QuickBooks again." } }) });
    const res = await make({ answer }).run({ step: "options" });
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: "QuickBooks stopped taking this shop's sales. Connect to QuickBooks again.", code: "disconnected" });
    const down = await make({ answer: () => ({ ok: false, status: 503, json: async () => ({}) }) }).run({ step: "status" });
    expect(down.statusCode).toBe(502);
  });

  test("PLATFORM_ACCOUNTING_URL turns it on and brings the platform key", () => {
    const on = readShopConfig({ GCLOUD_PROJECT: "lmb-test-shop", PLATFORM_ACCOUNTING_URL: "https://accounting.platform.example/" });
    expect(on.platformAccountingUrl).toBe("https://accounting.platform.example");
    expect(usesPlatformServices(on)).toBe(true);
    expect(readShopConfig({ GCLOUD_PROJECT: "lmb-test-shop", PLATFORM_ACCOUNTING_URL: "http://plain.example" }).platformAccountingUrl).toBe("");
  });

  test("send again's numbers come from the orders, in the shop's time zone, with zeros on a quiet day", () => {
    const orders = [
      { id: "a", paymentStatus: "paid", paidAt: "2026-10-27T15:00:00Z", subtotal: 40, shipping: 10, tax: 6.5, total: 56.5 },
      // 01:00 UTC on the 28th is still the 27th in Toronto
      { id: "b", paymentStatus: "paid", paidAt: "2026-10-28T01:00:00Z", subtotal: 20, total: 20 },
      { id: "c", paymentStatus: "paid", paidAt: "2026-10-27T15:00:00Z", subtotal: 99, total: 99, isTest: true },
    ];
    const day = dayFromOrders(orders, "2026-10-27");
    expect(day).toMatchObject({ date: "2026-10-27", salesCents: 6000, shippingCents: 1000, netCents: 7650, currency: "CAD" });
    expect(Object.values(day.taxes)).toEqual([650]);
    expect(dayFromOrders(orders, "2026-10-20")).toMatchObject({ date: "2026-10-20", salesCents: 0, netCents: 0, taxes: {} });
  });
});
