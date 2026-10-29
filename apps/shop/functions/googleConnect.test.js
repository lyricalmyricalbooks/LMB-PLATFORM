// Connect Google (code plan 6.17): the admin asks the platform's Google link, as this shop, with its service key. A
// pretend link stands in; nothing reaches Google.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { googleConnectActions, stockSheetRows } = require("./googleConnect.js");

const URL_ = "https://google.platform.example";
const KEY = "service-key-moth-press-0123456789abcdef0123";

function make({ url = URL_, key = KEY, answer, readStock } = {}) {
  const calls = [];
  const fetch = async (to, init) => {
    calls.push({ to, headers: init.headers, ...JSON.parse(init.body) });
    if (answer) return answer();
    return { ok: true, status: 200, json: async () => ({ enabled: true, connected: false, extrasOffered: ["drive"], steps: [] }) };
  };
  const { handleGoogleConnect } = googleConnectActions({
    url, shopId: "moth-press", serviceKey: () => key, fetch, ...(readStock ? { readStock } : {}),
    requireAdmin: async (req, res) => (req.admin ? { email: "owner@example.com" } : (res.status(403).json({ error: "Admin access required" }), null)),
  });
  const run = async (body, { admin = true } = {}) => {
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await handleGoogleConnect({ body, admin }, res);
    return res;
  };
  return { run, calls };
}

describe("Connect Google in the admin", () => {
  test("each step asks the platform's Google link as this shop, with its key", async () => {
    const { run, calls } = make();
    expect((await run({ step: "status" })).body.enabled).toBe(true);
    await run({ step: "connectLink", returnUrl: "https://moth-press.web.app/admin#overview", extras: ["drive", "nonsense", "ads"] });
    await run({ step: "tryAgain", part: "analytics" });
    await run({ step: "disconnect" });
    expect(calls.map((c) => [c.op, c.args])).toEqual([
      ["google.status", {}],
      ["google.connectLink", { returnUrl: "https://moth-press.web.app/admin#overview", extras: ["drive", "ads"] }],
      ["google.tryAgain", { step: "analytics" }],
      ["google.disconnect", {}],
    ]);
    expect(calls[0].to).toBe(`${URL_}/shop`);
    expect(calls[0].headers).toMatchObject({ "X-Shop-Id": "moth-press", Authorization: `Bearer ${KEY}` });
  });

  test("the books Google Shopping turned down are asked for as this shop", async () => {
    const { run, calls } = make();
    await run({ step: "productProblems" });
    expect(calls.map((c) => [c.op, c.args])).toEqual([["google.productProblems", {}]]);
  });

  test("the stock list is built on the server from the stockroom, never taken from the browser", async () => {
    const { run, calls } = make({ readStock: async () => [{ title: "Moth Book", author: "A. Writer", isbn: "9780000000000", price: 18, onHand: 12, feedAt: "2026-10-29T10:00:00Z" }, { title: "=Sum", price: null, onHand: null }] });
    await run({ step: "sheetSync", rows: [["from the browser"]] });
    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("google.sheetSync");
    expect(calls[0].args.rows[0][0]).toBe("Title");
    expect(calls[0].args.rows[1]).toEqual(["Moth Book", "A. Writer", "9780000000000", 18, 12, "2026-10-29T10:00:00Z"]);
    expect(calls[0].args.rows[2]).toEqual(["=Sum", "", "", "", "", ""]);
    expect(stockSheetRows(null)).toHaveLength(1);
  });

  test("a stockroom that can't be read sends nothing", async () => {
    const { run, calls } = make({ readStock: async () => { throw new Error("NOT_FOUND"); } });
    const res = await run({ step: "sheetSync" });
    expect([res.statusCode, res.body.code]).toEqual([409, "no_stockroom"]);
    expect(calls).toHaveLength(0);
  });

  test("only an admin may ask; a bad step, a shop without the link or without its key is refused before anything is sent", async () => {
    expect((await make().run({ step: "status" }, { admin: false })).statusCode).toBe(403);
    expect((await make().run({ step: "remove" })).statusCode).toBe(400);
    expect((await make().run({ step: "connectLink", returnUrl: "javascript:alert(1)" })).statusCode).toBe(400);
    const noLink = make({ url: "" });
    const res = await noLink.run({ step: "status" });
    expect([res.statusCode, res.body.code]).toEqual([409, "not_available"]);
    const noKey = make({ key: "" });
    expect((await noKey.run({ step: "status" })).statusCode).toBe(503);
    expect(noLink.calls.length + noKey.calls.length).toBe(0);
  });

  test("the link's refusal keeps its words; its failure is a plain 502", async () => {
    const refused = make({ answer: () => ({ ok: false, status: 409, json: async () => ({ error: { code: "google_off", message: "Connect Google isn't turned on yet." } }) }) });
    const res = await refused.run({ step: "disconnect" });
    expect([res.statusCode, res.body.code, res.body.error]).toEqual([409, "google_off", "Connect Google isn't turned on yet."]);
    const broken = make({ answer: () => ({ ok: false, status: 500, json: async () => ({}) }) });
    expect((await broken.run({ step: "status" })).statusCode).toBe(502);
  });
});
