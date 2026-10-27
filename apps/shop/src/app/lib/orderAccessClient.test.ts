import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/authSession", () => ({ restoredUser: async () => null }));
import { rememberOrderAccess, savedOrderAccess, orderAccessHeaders, newOrderAccessKey } from "./orderAccessClient";
afterEach(() => vi.unstubAllGlobals());
describe("guest order authorization", () => {
  it("keeps checkout authorized when browser storage is blocked", async () => {
    vi.stubGlobal("sessionStorage", { setItem() { throw new Error("blocked"); }, getItem() { throw new Error("blocked"); } });
    const key = newOrderAccessKey();
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    rememberOrderAccess("storage-blocked-order", key);
    expect(savedOrderAccess("storage-blocked-order")).toBe(key);
    expect((await orderAccessHeaders("storage-blocked-order"))["X-Order-Key"]).toBe(key);
    expect(savedOrderAccess("different-order")).toBe("");
  });
});
