import { describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({ adminApi: {} }));
vi.mock("./ordersCache", () => ({ getOrdersCached: vi.fn(async () => []) }));
vi.mock("../../lib/firebase", () => ({ auth: { currentUser: null } }));
const { blockedMessage, blockersBeforeOpening, readLaunchReadiness, readSignIn } = await import("./launchCheck");

const item = (id: string, status: "ok" | "warn" | "block", label = id) => ({ id, label, detail: "", status, tab: "general", action: "Open" });

describe("the last check wherever the shop is opened from", () => {
  it("names what would stop a sale, at most three, and says how many more", () => {
    const blockers = ["Stripe isn't connected yet", "No published books", "Missing store policies: Terms", "No postal address saved"].map(l => item(l, "block", l));
    expect(blockedMessage(blockers)).toBe("Shoppers couldn't buy yet. Still to do: Stripe isn't connected yet; No published books; Missing store policies: Terms and 1 more. Home's Ready to sell list takes you to each one.");
  });

  it("only blocking checks stop the opening; warnings don't", async () => {
    expect(await blockersBeforeOpening(async () => [item("email", "warn"), item("books", "ok")])).toEqual([]);
    expect((await blockersBeforeOpening(async () => [item("books", "block"), item("email", "warn")]))!.map(b => b.id)).toEqual(["books"]);
  });

  it("checks that can't be read never lock the press out: the caller asks as before", async () => {
    expect(await blockersBeforeOpening(async () => { throw new Error("offline"); })).toBeNull();
  });

  it("reads the same parts as Ready to sell", async () => {
    const api: any = {
      getSettings: vi.fn(async () => ({})), getShippingProfiles: vi.fn(async () => []), getRecentEmailLog: vi.fn(async () => []),
      getAllBooks: vi.fn(async () => []), platformPayments: vi.fn(async () => null),
    };
    const items = await readLaunchReadiness(api, async () => [], async () => ({ twoStep: false, codesLeft: null }));
    expect(api.getRecentEmailLog).toHaveBeenCalledWith(5);
    expect(items.find(i => i.id === "books")?.status).toBe("block");
    expect(items.find(i => i.id === "sign-in")).toMatchObject({ status: "warn", label: "Two-step sign-in is off" });
  });

  it("has no sign-in to read when nobody is signed in", async () => {
    expect(await readSignIn(null)).toBeNull();
  });
});

describe("openButtonLabel", () => {
  it("counts the steps left, and says nothing extra when none or unknown", async () => {
    const { openButtonLabel } = await import("./launchCheck");
    expect(openButtonLabel(4)).toBe("Open to shoppers · 4 steps");
    expect(openButtonLabel(1)).toBe("Open to shoppers · 1 step");
    expect(openButtonLabel(0)).toBe("Open to shoppers");
    expect(openButtonLabel(null)).toBe("Open to shoppers");
  });
});
