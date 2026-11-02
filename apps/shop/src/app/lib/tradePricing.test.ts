import { beforeEach, describe, expect, test, vi } from "vitest";

const user = { current: null as null | { email?: string; getIdToken: () => Promise<string> } };
const fetchMock = vi.fn();
vi.mock("../../lib/authSession", () => ({ restoredUser: async () => user.current }));
vi.mock("./functionsBase", () => ({ functionFetch: (...args: unknown[]) => fetchMock(...args) }));

import { claimTradePricing } from "./tradePricing";

beforeEach(() => { fetchMock.mockReset(); user.current = null; });

describe("claimTradePricing", () => {
  test("a shopper who isn't signed in with an email asks nothing", async () => {
    expect(await claimTradePricing("o1")).toBe(false);
    user.current = { getIdToken: async () => "t" };
    expect(await claimTradePricing("o1")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test("a signed-in shopper sends their token and the order key, and reads the server's answer", async () => {
    user.current = { email: "shop@boutique.example", getIdToken: async () => "tok" };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ wholesale: true, name: "Boutique" }) });
    expect(await claimTradePricing("o1", "key1")).toBe(true);
    const [fn, init] = fetchMock.mock.calls[0];
    expect(fn).toBe("createStripeCheckoutSession");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok", "X-Order-Key": "key1" });
    expect(JSON.parse(init.body)).toEqual({ action: "stockistPricing", orderId: "o1" });
  });
  test("a refusal or a network failure is just 'no wholesale', never an error", async () => {
    user.current = { email: "reader@example.com", getIdToken: async () => "tok" };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ wholesale: false }) });
    expect(await claimTradePricing("o1")).toBe(false);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await claimTradePricing("o1")).toBe(false);
  });
});
