// Settings › Payments › Card payments (code plan 2.2b / 2.10): the admin asks the platform whether the press's card
// account is connected and for the page that connects it. A pretend payment service stands in for the platform's;
// nothing reaches Square or Stripe.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createPayments } = require("./payments/index.js");
const { checkoutAdminActions } = require("./checkoutAdmin.js");

const SHOP = "moth-press";
const KEY = "service-key-moth-press-0123456789abcdef0123";
const ORIGIN = "https://shop.yourpress.example";

function fakeService(answers = {}) {
  const calls = [];
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, shop: init.headers["X-Shop-Id"], auth: init.headers.Authorization, ...body });
    if (answers[body.op]) return answers[body.op](body, reply);
    if (body.op === "account.status") return reply(200, { connected: true, accountId: "MLR1", locationName: "Moth Press", chargesEnabled: true, platformFee: { percent: 2, refundedWithRefunds: true } });
    if (body.op === "account.connectLink") return reply(200, { url: "https://connect.squareupsandbox.com/oauth2/authorize?state=abc", expiresAt: 1800000000 });
    if (body.op === "account.onboardingLink") return reply(200, { url: "https://connect.stripe.example/setup/abc", expiresAt: 1800000000 });
    return reply(400, { error: { code: "bad_request", message: `unknown call ${body.op}` } });
  };
  return { fetch, calls };
}

class NoStripe { constructor() { throw new Error("platform mode made a Stripe client"); } }
const noDb = { collection: () => ({ doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }) }) };

function make({ provider = "square", mode = "platform", answers } = {}) {
  const service = fakeService(answers);
  const payments = createPayments({
    provider, mode, db: noDb, Stripe: NoStripe, readAdminSecret: async () => ({}),
    liveSecretKey: { value: () => "" },
    ...(mode === "platform" ? { service: { url: "https://payments.platform.example", shopId: SHOP, fetch: service.fetch, serviceKey: () => KEY } } : {}),
  });
  const { handlePlatformPayments } = checkoutAdminActions({
    db: noDb, payments, ALLOWED_ORIGINS: [ORIGIN, "http://localhost:5173"],
    requireAdmin: async (req, res) => (req.admin ? { email: "owner@example.com" } : (res.status(403).json({ error: "Admin access required" }), null)),
    requireBooksReader: async (req, res) => (req.admin || req.bookkeeper ? { email: "kit@example.com" } : (res.status(403).json({ error: "Admin access required" }), null)),
  });
  const run = async (body, { admin = true, bookkeeper = false } = {}) => {
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await handlePlatformPayments({ body, admin, bookkeeper }, res);
    return res;
  };
  return { run, service };
}

describe("the admin's card account card", () => {
  test("the bookkeeper reads the account's status (payouts, fee) but can't open the connect page", async () => {
    const { run, service } = make();
    expect((await run({ step: "status" }, { admin: false, bookkeeper: true })).statusCode).toBe(200);
    expect((await run({ step: "connect", origin: ORIGIN }, { admin: false, bookkeeper: true })).statusCode).toBe(403);
    expect((await run({ step: "status" }, { admin: false })).statusCode).toBe(403);
    expect(service.calls.map((c) => c.op)).toEqual(["account.status"]);
  });

  test("status asks the platform as this shop, with its key, and passes on the fee", async () => {
    const { run, service } = make();
    const res = await run({ step: "status" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ provider: "square", connected: true, locationName: "Moth Press", platformFee: { percent: 2 } });
    expect(service.calls).toEqual([expect.objectContaining({ url: "https://payments.platform.example/shop", shop: SHOP, auth: `Bearer ${KEY}`, op: "account.status" })]);
  });

  test("connect gives Square's sign-in page, coming back to this admin's payment methods", async () => {
    const { run, service } = make();
    const res = await run({ step: "connect", origin: ORIGIN });
    expect(res.body).toEqual({ provider: "square", url: "https://connect.squareupsandbox.com/oauth2/authorize?state=abc", expiresAt: 1800000000 });
    expect(service.calls[0]).toMatchObject({ op: "account.connectLink", args: { returnUrl: `${ORIGIN}/admin#settings/payments/methods` } });
  });

  test("a Stripe shop gets Stripe's onboarding page, with its own return and refresh addresses", async () => {
    const { run, service } = make({ provider: "stripe" });
    const res = await run({ step: "connect", origin: ORIGIN });
    expect(res.body.url).toBe("https://connect.stripe.example/setup/abc");
    expect(service.calls[0]).toMatchObject({
      op: "account.onboardingLink",
      args: { returnUrl: `${ORIGIN}/admin?stripe=return#settings/payments/methods`, refreshUrl: `${ORIGIN}/admin?stripe=refresh#settings/payments/methods` },
    });
  });

  test("an address that isn't the shop's own (or isn't https) is refused before anything is sent", async () => {
    const { run, service } = make();
    expect((await run({ step: "connect", origin: "https://elsewhere.example" })).statusCode).toBe(400);
    expect((await run({ step: "connect", origin: "http://localhost:5173" })).statusCode).toBe(400);
    expect(service.calls).toEqual([]);
  });

  test("only an admin may ask, and an unknown step is refused", async () => {
    const { run, service } = make();
    expect((await run({ step: "status" }, { admin: false })).statusCode).toBe(403);
    expect((await run({ step: "disconnect" })).statusCode).toBe(400);
    expect(service.calls).toEqual([]);
  });

  test("a shop on its own keys has no platform account", async () => {
    const { run } = make({ provider: "stripe", mode: "own" });
    const res = await run({ step: "status" });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("own_keys");
  });

  test("the platform's refusal keeps its words and code", async () => {
    const { run } = make({ answers: { "account.status": (_body, reply) => reply(503, { error: { code: "square_not_ready", message: "The platform's Square connection isn't set up yet." } }) } });
    const res = await run({ step: "status" });
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: "The platform's Square connection isn't set up yet.", code: "square_not_ready" });
  });
});
