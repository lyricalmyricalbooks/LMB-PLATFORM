// Settings › General › Your web address (code plan 2.9): the admin asks the platform's domain service, as this shop,
// with its service key. A pretend service stands in; nothing reaches Google.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { customDomainActions } = require("./customDomains.js");

const URL_ = "https://domains.platform.example";
const KEY = "service-key-moth-press-0123456789abcdef0123";

function make({ url = URL_, key = KEY, answer } = {}) {
  const calls = [];
  const fetch = async (to, init) => {
    calls.push({ to, headers: init.headers, ...JSON.parse(init.body) });
    if (answer) return answer();
    return { ok: true, status: 200, json: async () => ({ name: "shop.mothpress.example", state: "waiting_dns", records: [{ action: "add", host: "shop.mothpress.example", type: "A", value: "199.36.158.100" }] }) };
  };
  const { handleCustomDomains } = customDomainActions({
    url, shopId: "moth-press", serviceKey: () => key, fetch,
    requireAdmin: async (req, res) => (req.admin ? { email: "owner@example.com" } : (res.status(403).json({ error: "Admin access required" }), null)),
  });
  const run = async (body, { admin = true } = {}) => {
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await handleCustomDomains({ body, admin }, res);
    return res;
  };
  return { run, calls };
}

describe("the admin's web address card", () => {
  test("adding asks the domain service as this shop, with its key, and passes on the DNS records", async () => {
    const { run, calls } = make();
    const res = await run({ step: "add", domain: "shop.mothpress.example" });
    expect(res.statusCode).toBe(200);
    expect(res.body.records[0]).toMatchObject({ action: "add", type: "A" });
    expect(calls).toEqual([expect.objectContaining({ to: `${URL_}/shop`, op: "domains.add", args: { domain: "shop.mothpress.example" } })]);
    expect(calls[0].headers).toMatchObject({ "X-Shop-Id": "moth-press", Authorization: `Bearer ${KEY}` });
  });

  test("list and check map to the service's calls", async () => {
    const { run, calls } = make();
    await run({ step: "list" });
    await run({ step: "check", domain: "shop.mothpress.example" });
    expect(calls.map((c) => [c.op, c.args])).toEqual([["domains.list", {}], ["domains.check", { domain: "shop.mothpress.example" }]]);
  });

  test("Make main and Remove (plan 5.9) map to the service's calls, as this shop", async () => {
    const { run, calls } = make();
    await run({ step: "makeMain", domain: "shop.mothpress.example" });
    await run({ step: "remove", domain: "old.mothpress.example" });
    expect(calls.map((c) => [c.op, c.args])).toEqual([["domains.makeMain", { domain: "shop.mothpress.example" }], ["domains.remove", { domain: "old.mothpress.example" }]]);
    expect(calls.every((c) => c.headers["X-Shop-Id"] === "moth-press")).toBe(true);
  });

  test("the service refusing to remove the main address keeps its plain words", async () => {
    const refused = make({ answer: () => ({ ok: false, status: 409, json: async () => ({ error: { code: "is_main", message: "This is your shop's main address. Make another address main first, then remove this one." } }) }) });
    const res = await refused.run({ step: "remove", domain: "shop.mothpress.example" });
    expect([res.statusCode, res.body.code]).toEqual([409, "is_main"]);
    expect(res.body.error).toMatch(/Make another address main first/);
  });

  test("Connect (plan 6.15) maps to the service's one-step call, as this shop", async () => {
    const { run, calls } = make();
    const res = await run({ step: "connect", domain: "shop.mothpress.example" });
    expect(res.statusCode).toBe(200);
    expect(calls.map((c) => [c.op, c.args])).toEqual([["domains.connect", { domain: "shop.mothpress.example" }]]);
    expect(calls[0].headers).toMatchObject({ "X-Shop-Id": "moth-press", Authorization: `Bearer ${KEY}` });
  });

  test("only an admin may ask; an unknown step, a shop without the service or without its key is refused before anything is sent", async () => {
    expect((await make().run({ step: "list" }, { admin: false })).statusCode).toBe(403);
    expect((await make().run({ step: "delete" })).statusCode).toBe(400);
    const noService = make({ url: "" });
    const res = await noService.run({ step: "list" });
    expect([res.statusCode, res.body.code]).toEqual([409, "not_available"]);
    const noKey = make({ key: "" });
    expect((await noKey.run({ step: "list" })).statusCode).toBe(503);
    expect(noService.calls.length + noKey.calls.length).toBe(0);
  });

  test("the service's refusal keeps its words; its failure is a plain 502", async () => {
    const refused = make({ answer: () => ({ ok: false, status: 409, json: async () => ({ error: { code: "in_use", message: "That address is already connected to another shop." } }) }) });
    expect((await refused.run({ step: "add", domain: "x.example" })).body).toEqual({ error: "That address is already connected to another shop.", code: "in_use" });
    const broken = make({ answer: () => ({ ok: false, status: 500, json: async () => { throw new Error("not json"); } }) });
    expect((await broken.run({ step: "list" })).statusCode).toBe(502);
  });
});
