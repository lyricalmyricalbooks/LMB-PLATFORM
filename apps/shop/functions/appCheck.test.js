import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const { browserRequestHandler } = createRequire(import.meta.url)("./appCheck");
const APP_ID = "1:100000000001:web:0000000000000000000001";
function harness({ mode = "enforce", token, method = "POST", emulator = false, appId = APP_ID } = {}) {
  const effects = [], logs = [];
  const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
  const handler = browserRequestHandler(async (_req, res) => { effects.push("purchase"); res.json({ accepted: true }); }, {
    mode: () => mode, appId: () => APP_ID, emulator,
    verifyToken: async value => { if (value !== "valid") throw new Error("secret-token diagnostic"); return { appId }; },
    applyCors: (req, res) => { if (req.method === "OPTIONS") { res.status(204).send(""); return true; } return false; },
    log: fields => logs.push(fields),
  });
  return { effects, logs, response, call: () => handler({ method, headers: token === undefined ? {} : { "x-firebase-appcheck": token }, path: "/createStripeCheckoutSession" }, response) };
}
describe("HTTP App Check enforcement", () => {
  it.each([undefined, "", "forged", ["valid", "forged"]])("rejects missing or invalid token %s before a purchase", async token => {
    const app = harness({ token }); await app.call();
    expect(app.response.statusCode).toBe(401);
    expect(app.response.body).toEqual({ code: "APP_CHECK_REQUIRED" });
    expect(app.effects).toEqual([]);
    expect(JSON.stringify(app.logs)).not.toContain("secret-token");
  });
  it("allows a verified token from the registered storefront app", async () => {
    const app = harness({ token: "valid" }); await app.call();
    expect(app.response.body).toEqual({ accepted: true });
    expect(app.effects).toEqual(["purchase"]);
  });
  it("rejects a valid token for another Firebase app", async () => {
    const app = harness({ token: "valid", appId: "another-app" }); await app.call();
    expect(app.response.statusCode).toBe(401); expect(app.effects).toEqual([]);
  });
  it("monitor mode records verification status without blocking existing shoppers", async () => {
    const app = harness({ mode: "monitor", token: "forged" }); await app.call();
    expect(app.response.body).toEqual({ accepted: true });
    expect(app.logs).toEqual([{ event: "app_check", mode: "monitor", status: "invalid", path: "/createStripeCheckoutSession" }]);
  });
  it("preflight requests succeed without verification or business side effects", async () => {
    const app = harness({ method: "OPTIONS" }); await app.call();
    expect(app.response.statusCode).toBe(204); expect(app.effects).toEqual([]); expect(app.logs).toEqual([]);
  });
  it("unknown modes fail closed instead of disabling enforcement", async () => {
    const app = harness({ mode: "enfroce", token: "valid" }); await app.call();
    expect(app.response.statusCode).toBe(503); expect(app.effects).toEqual([]);
  });
  it("the server emulator can exercise existing flows without production attestation", async () => {
    const app = harness({ emulator: true }); await app.call();
    expect(app.response.body).toEqual({ accepted: true });
  });
});
