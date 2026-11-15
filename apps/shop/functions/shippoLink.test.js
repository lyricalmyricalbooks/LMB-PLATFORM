// Connect Shippo on a Colophon shop: the owner connects through the platform's app store door, the token is checked with
// Shippo and kept only in this shop's Shippo record, and calls then use it as a bearer token.
import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { shippoLinkActions, shippoAuthHeaders } = require("./shippoLink");

const res = () => { const r = { statusCode: 200, body: null }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const owner = async () => ({ email: "owner@example.com" });
const refuse = async (_req, r) => { r.status(403).json({ error: "Owner only." }); return null; };
const TICKET = "a".repeat(48);

function fakeDoc(start = null) {
  let data = start;
  return { doc: () => ({ get: async () => ({ exists: data !== null, data: () => data }), set: async (next, opts) => { data = opts?.merge ? { ...(data || {}), ...next } : next; } }), read: () => data };
}

function setup({ answers = {}, url = "https://platform.example/api/apps", shippoOk = true, start = null, requireOwner = owner } = {}) {
  const calls = [];
  const shippoCalls = [];
  const store = fakeDoc(start);
  const fetch = async (to, init) => {
    const json = JSON.parse(init.body);
    calls.push({ to, headers: init.headers, json });
    const answer = answers[json.op] ?? { ok: true };
    return { ok: !answer.status, status: answer.status || 200, json: async () => answer };
  };
  const callShippo = async (...args) => { shippoCalls.push(args); if (!shippoOk) throw Object.assign(new Error("401"), { shippoStatus: 401 }); return {}; };
  const { handleShippoLink } = shippoLinkActions({ url, shopId: "moth-press", serviceKey: () => "sk_1", requireAdmin: owner, requireOwner, configDoc: store.doc, callShippo, fetch, now: () => new Date("2026-11-14T12:00:00Z") });
  return { handleShippoLink, calls, shippoCalls, store };
}

describe("Connect Shippo", () => {
  test("status says whether it opens yet and whether this shop is connected", async () => {
    const { handleShippoLink, calls } = setup({ answers: { "shippo.status": { available: true } } });
    const r = res();
    await handleShippoLink({ body: { step: "status" } }, r);
    expect(r.body).toEqual({ available: true, connected: false });
    expect(calls[0].to).toBe("https://platform.example/api/apps/shop");
    expect(calls[0].headers).toMatchObject({ "X-Shop-Id": "moth-press", Authorization: "Bearer sk_1" });
    const off = res();
    await setup({ url: "" }).handleShippoLink({ body: { step: "status" } }, off);
    expect(off.body).toEqual({ available: false, connected: false });
  });

  test("connect hands back Shippo's page and nothing else", async () => {
    const good = setup({ answers: { "shippo.connectLink": { url: "https://goshippo.com/oauth/authorize?client_id=x" } } });
    const r = res();
    await good.handleShippoLink({ body: { step: "connect", returnUrl: "https://mothpress.example/admin/#settings/shipping" } }, r);
    expect(r.body).toEqual({ url: "https://goshippo.com/oauth/authorize?client_id=x" });
    expect(good.calls[0].json).toEqual({ op: "shippo.connectLink", args: { returnUrl: "https://mothpress.example/admin/#settings/shipping" } });
    const bad = setup({ answers: { "shippo.connectLink": { url: "https://evil.example/" } } });
    const r2 = res();
    await bad.handleShippoLink({ body: { step: "connect", returnUrl: "https://mothpress.example/admin/" } }, r2);
    expect(r2.statusCode).toBe(502);
  });

  test("finish checks the token with Shippo and keeps it in the shop's own record", async () => {
    const { handleShippoLink, shippoCalls, store, calls } = setup({ answers: { "shippo.claim": { accessToken: "oauth.abcdef123456" } } });
    const r = res();
    await handleShippoLink({ body: { step: "finish", ticket: TICKET } }, r);
    expect(r.body).toEqual({ connected: true });
    expect(calls[0].json).toEqual({ op: "shippo.claim", args: { ticket: TICKET } });
    expect(shippoCalls[0][3]).toBe("oauth.abcdef123456");
    expect(store.read()).toMatchObject({ apiToken: "oauth.abcdef123456", authType: "oauth", mode: "live", updatedBy: "owner@example.com", disconnectedAt: null });
  });

  test("a token Shippo refuses is never saved", async () => {
    const { handleShippoLink, store } = setup({ shippoOk: false, answers: { "shippo.claim": { accessToken: "oauth.abcdef123456" } }, start: { apiToken: "oauth.working", authType: "oauth" } });
    const r = res();
    await handleShippoLink({ body: { step: "finish", ticket: TICKET } }, r);
    expect(r.statusCode).toBe(502);
    expect(store.read().apiToken).toBe("oauth.working");
  });

  test("a spent ticket's refusal is passed on plainly", async () => {
    const { handleShippoLink } = setup({ answers: { "shippo.claim": { ok: false, status: 410, message: "That Shippo sign-in has run out. Press Connect Shippo again." } } });
    const r = res();
    await handleShippoLink({ body: { step: "finish", ticket: TICKET } }, r);
    expect(r.statusCode).toBe(410);
    expect(r.body.error).toMatch(/run out/);
  });

  test("disconnect forgets the account and switches live rates off", async () => {
    const { handleShippoLink, store } = setup({ start: { apiToken: "oauth.x", authType: "oauth", dynamicRatesEnabled: true, dynamicRateCountries: ["US"] } });
    const r = res();
    await handleShippoLink({ body: { step: "disconnect" } }, r);
    expect(r.body).toEqual({ connected: false });
    expect(store.read()).toMatchObject({ apiToken: "", authType: null, dynamicRatesEnabled: false, dynamicRateCountries: ["US"] });
  });

  test("only the owner connects, finishes or disconnects; bad input is refused", async () => {
    for (const step of ["connect", "finish", "disconnect"]) {
      const r = res();
      await setup({ requireOwner: refuse }).handleShippoLink({ body: { step, ticket: TICKET, returnUrl: "https://a.example/" } }, r);
      expect(r.statusCode).toBe(403);
    }
    const r1 = res();
    await setup().handleShippoLink({ body: { step: "finish", ticket: "short" } }, r1);
    expect(r1.statusCode).toBe(400);
    const r2 = res();
    await setup().handleShippoLink({ body: { step: "other" } }, r2);
    expect(r2.statusCode).toBe(400);
    const r3 = res();
    await setup({ url: "" }).handleShippoLink({ body: { step: "connect", returnUrl: "https://a.example/" } }, r3);
    expect(r3.body.code).toBe("not_available");
  });

  test("a connected account calls Shippo with a bearer token; a pasted key as before", () => {
    expect(shippoAuthHeaders("oauth.abc")).toEqual({ Authorization: "Bearer oauth.abc", "Shippo-API-Version": "2018-02-08" });
    expect(shippoAuthHeaders("shippo_live_abc")).toEqual({ Authorization: "ShippoToken shippo_live_abc" });
  });
});
