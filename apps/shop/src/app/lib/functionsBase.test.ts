import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { functionFetch } from "./functionsBase";
import { copyErrorText } from "../features/site/storeCopy";
const { token, state } = vi.hoisted(() => ({ token: vi.fn(), state: { appCheck: {} as object | null } }));
vi.mock("firebase/app-check", () => ({ getToken: token }));
vi.mock("../../lib/firebaseApp", () => ({ get appCheck() { return state.appCheck; } }));
vi.mock("../../lib/authSession", () => ({ restoredUser: async () => null }));

beforeEach(() => { vi.stubEnv("VITE_APP_CHECK_MODE", "monitor"); state.appCheck = {}; token.mockReset(); token.mockResolvedValue({ token: "valid-token" }); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("browser Function requests", () => {
  it("sends App Check alongside authorization without changing the submitted body", async () => {
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(url).toContain("/refundOrder");
      expect(new Headers(init.headers).get("X-Firebase-AppCheck")).toBe("valid-token");
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer admin-id-token");
      expect(init.body).toBe('{"orderId":"one"}');
      return new Response('{"ok":true}', { status: 200 });
    });
    const response = await functionFetch("refundOrder", { method: "POST", headers: { Authorization: "Bearer admin-id-token" }, body: '{"orderId":"one"}' });
    expect(await response.json()).toEqual({ ok: true });
  });
  it("does not send a money-spending request when token acquisition fails in enforcement mode", async () => {
    vi.stubEnv("VITE_APP_CHECK_MODE", "enforce"); token.mockRejectedValue(new Error("provider diagnostic"));
    vi.stubGlobal("fetch", () => { throw new Error("Request must not be sent"); });
    await expect(functionFetch("createStripeCheckoutSession", { method: "POST" })).rejects.toMatchObject({ name: "AppVerificationError" });
  });
  it("fails closed when enforcement is configured without a client provider", async () => {
    vi.stubEnv("VITE_APP_CHECK_MODE", "enforce"); state.appCheck = null;
    vi.stubGlobal("fetch", () => { throw new Error("Request must not be sent"); });
    await expect(functionFetch("createPayPalOrder", { method: "POST" })).rejects.toMatchObject({ name: "AppVerificationError" });
  });
  it("allows monitoring traffic after a provider failure and removes caller-supplied App Check headers", async () => {
    token.mockRejectedValue(new Error("blocked script"));
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).has("X-Firebase-AppCheck")).toBe(false);
      return new Response("ok");
    });
    expect((await functionFetch("getShippoRates", { headers: { "X-Firebase-AppCheck": "unverified" } })).status).toBe(200);
  });
  it("converts backend verification rejection into Studio-editable copy without exposing diagnostics", async () => {
    vi.stubGlobal("fetch", async () => new Response('{"code":"APP_CHECK_REQUIRED","error":"private provider detail"}', { status: 401 }));
    let failure: unknown;
    try { await functionFetch("validateDiscountCode"); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ name: "AppVerificationError" });
    expect(copyErrorText(failure, { copy: { appVerificationFailed: "Please retry verification." } }, "coStripeError")).toBe("Please retry verification.");
    expect(copyErrorText(failure, { copy: { appVerificationFailed: "" } }, "coStripeError")).toBe("");
  });
  it("preserves unrelated authorization failures and their response bodies", async () => {
    vi.stubGlobal("fetch", async () => new Response('{"error":"Admin access required"}', { status: 403 }));
    const response = await functionFetch("refundOrder");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Admin access required" });
  });
});
