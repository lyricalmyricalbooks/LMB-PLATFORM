// Memberships (M1): the plan rules and a member's state, on the shop's copy and the server's.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import * as shop from "./membershipRules";

const server = createRequire(import.meta.url)("../../functions/shared/membershipRules.js") as typeof shop;

describe.each([["shop", shop], ["server", server]])("memberships rules (%s copy)", (_name, m) => {
  test("a plan needs a name, monthly or yearly, a price in range and a trial up to 60 days", () => {
    expect(m.cleanPlan({ name: "  Friends  of the press ", interval: "month", priceMinor: 1500, perks: ["10% off", " ", "Early tickets"], trialDays: "" })).toEqual({
      plan: { name: "Friends of the press", description: "", perks: ["10% off", "Early tickets"], interval: "month", priceMinor: 1500, trialDays: 0, hidden: false, memberPercent: 0 },
    });
    expect(m.cleanPlan({ interval: "month", priceMinor: 1500 })).toMatchObject({ field: "name" });
    expect(m.cleanPlan({ name: "A", interval: "week", priceMinor: 1500 })).toMatchObject({ field: "interval" });
    expect(m.cleanPlan({ name: "A", interval: "year", priceMinor: 199 })).toMatchObject({ field: "price" });
    expect(m.cleanPlan({ name: "A", interval: "year", priceMinor: 15.5 })).toMatchObject({ field: "price" });
    expect(m.cleanPlan({ name: "A", interval: "year", priceMinor: 500001 })).toMatchObject({ field: "price" });
    expect(m.cleanPlan({ name: "A", interval: "year", priceMinor: 5000, trialDays: 61 })).toMatchObject({ field: "trial" });
    expect(m.cleanPlan({ name: "A", interval: "year", priceMinor: 5000, trialDays: 14, hidden: true })).toMatchObject({ plan: { trialDays: 14, hidden: true } });
  });

  test("a member price takes a whole percent from 0 to 50 off, to the cent", () => {
    expect(m.cleanPlan({ name: "A", interval: "month", priceMinor: 1500, memberPercent: 10 })).toMatchObject({ plan: { memberPercent: 10 } });
    expect(m.cleanPlan({ name: "A", interval: "month", priceMinor: 1500, memberPercent: "" })).toMatchObject({ plan: { memberPercent: 0 } });
    for (const bad of [51, -1, 12.5, "lots"]) expect(m.cleanPlan({ name: "A", interval: "month", priceMinor: 1500, memberPercent: bad })).toMatchObject({ field: "percent" });
    expect(m.memberUnitPrice(25, 10)).toBe(22.5);
    expect(m.memberUnitPrice(19.99, 15)).toBe(16.99);
    expect(m.memberUnitPrice(0.05, 50)).toBe(0.03);
    expect(m.memberUnitPrice(25, 0)).toBe(25);
    expect(m.memberUnitPrice(25, 80)).toBe(12.5);
  });

  test("a plan can ship a box: up to ten products and a cut-off day (M3)", () => {
    const base = { name: "Book club", interval: "month", priceMinor: 2500 };
    expect(m.cleanPlan(base)).not.toHaveProperty("plan.box");
    const ok = m.cleanPlan({ ...base, box: { items: [{ bookId: "b1" }, { bookId: "b2", variantId: "pb", quantity: 2 }, { bookId: "b1", quantity: 1 }, { bookId: "../x" }], cutoffDay: 15 } });
    expect(ok).toMatchObject({ plan: { box: { items: [{ bookId: "b1", quantity: 2 }, { bookId: "b2", variantId: "pb", quantity: 2 }], cutoffDay: 15 } } });
    expect(m.cleanPlan({ ...base, box: { items: [], cutoffDay: 15 } })).toMatchObject({ field: "box", problem: m.PLAN_MESSAGES.boxItems });
    expect(m.cleanPlan({ ...base, box: { items: [{ bookId: "b1" }], cutoffDay: 29 } })).toMatchObject({ field: "box", problem: m.PLAN_MESSAGES.cutoff });
    expect(m.cleanPlan({ ...base, box: { items: [{ bookId: "b1", quantity: 11 }], cutoffDay: 1 } })).toMatchObject({ field: "box" });
  });

  test("a box goes to a full Canadian or US address, in its month on the shop's clock, to paid members", () => {
    const addr = { name: " Ada  Reader ", line1: "12 Ink Lane", city: "Toronto", state: "on", postal_code: "m6g 3h1", country: "ca" };
    expect(m.cleanBoxAddress(addr)).toEqual({ name: "Ada Reader", line1: "12 Ink Lane", line2: "", city: "Toronto", state: "ON", postalCode: "M6G 3H1", country: "CA" });
    expect(m.cleanBoxAddress({ ...addr, country: "FR" })).toBeNull();
    expect(m.cleanBoxAddress({ ...addr, line1: "" })).toBeNull();
    const t = Date.parse("2026-12-01T03:00:00Z");
    expect(m.boxMonth(t, "America/Toronto")).toBe("2026-11");
    expect(m.shopDayOfMonth(t, "America/Toronto")).toBe(30);
    expect(m.boxMonth(t, "UTC")).toBe("2026-12");
    expect(["trial", "active", "ending", "pastDue", "ended", "pending"].map((x) => m.getsBox(x as any))).toEqual([false, true, true, false, false, false]);
  });

  test("only downloads can be Free for members", () => {
    expect(m.memberFreeProduct({ memberFree: true, digital: true })).toBe(true);
    expect(m.memberFreeProduct({ memberFree: true, format: "PDF" })).toBe(true);
    expect(m.memberFreeProduct({ memberFree: true, format: "Paperback" })).toBe(false);
    expect(m.memberFreeProduct({ digital: true })).toBe(false);
    expect(m.memberFreeProduct({ memberFree: true, digital: true }, { id: "print" })).toBe(false);
    expect(m.memberFreeProduct({ memberFree: true }, { id: "pdf", digital: true })).toBe(true);
  });

  test("a member's state follows the provider, and perks last while a payment is retried or the end is ahead", () => {
    expect(m.memberState("trialing")).toBe("trial");
    expect(m.memberState("active")).toBe("active");
    expect(m.memberState("active", true)).toBe("ending");
    expect(m.memberState("trialing", true)).toBe("ending");
    expect(m.memberState("past_due")).toBe("pastDue");
    expect(m.memberState("incomplete")).toBe("pending");
    expect(m.memberState("canceled")).toBe("ended");
    expect(m.memberState("incomplete_expired")).toBe("ended");
    expect(["trial", "active", "ending", "pastDue"].every((s) => m.hasPerks(s as never))).toBe(true);
    expect(m.hasPerks("ended")).toBe(false);
    expect(m.hasPerks("pending")).toBe(false);
    expect(m.mayJoin(["ended", "pending"])).toBe(true);
    expect(m.mayJoin(["ended", "ending"])).toBe(false);
  });

  test("prices read in plain words", () => {
    expect(m.planPriceWords(1500, "month")).toBe("$15.00 a month");
    expect(m.planPriceWords(15000, "year", "USD")).toBe("US$150.00 a year");
    expect(m.planPriceWords(1500, "month", "CAD", "fr-CA").replace(/\s/g, " ")).toBe("15,00 $ par mois");
  });
});

describe.each([["shop", shop], ["server", server]])("box orders, M3b (%s copy)", (_name, m) => {
  const { paidByCutoff, inStockWarning, shopHour, boxShortfall } = m;
  const zone = "America/Toronto";
  test("paid by the cut-off", () => {
    expect(paidByCutoff({ startedAt: "2026-10-02T15:00:00Z" }, "2026-11", 15, zone)).toBe(true);
    expect(paidByCutoff({ startedAt: "2026-11-10T15:00:00Z" }, "2026-11", 15, zone)).toBe(true);
    expect(paidByCutoff({ startedAt: "2026-11-20T15:00:00Z" }, "2026-11", 15, zone)).toBe(false);
    // A trial that turned into a paid membership after the cut-off waits for next month.
    expect(paidByCutoff({ startedAt: "2026-11-01T15:00:00Z", trialEnd: "2026-11-16T15:00:00Z" }, "2026-11", 15, zone)).toBe(false);
    expect(paidByCutoff({ startedAt: "2026-12-01T15:00:00Z" }, "2026-11", 15, zone)).toBe(false);
  });
  test("the warning days", () => {
    expect(inStockWarning(12, 15)).toBe(true);
    expect(inStockWarning(14, 15)).toBe(true);
    expect(inStockWarning(15, 15)).toBe(false);
    expect(inStockWarning(11, 15)).toBe(false);
  });
  test("the shop's hour", () => {
    expect(shopHour(Date.parse("2026-11-18T13:30:00Z"), zone)).toBe(8);
  });
  test("what the boxes are short of", () => {
    const books: Record<string, shop.BoxStockBook> = {
      a: { title: "Salt Hours", trackInventory: true, stockLevel: 5 },
      b: { title: "Night Songs", trackInventory: true, variants: [{ id: "v2", name: "Hardcover", stockLevel: 3 }] },
      c: { title: "Tote", trackInventory: false, stockLevel: 0 },
      d: { title: "Zine", trackInventory: true, allowBackorder: true, stockLevel: 0 },
    };
    const short = boxShortfall([{ bookId: "a", quantity: 1 }, { bookId: "b", variantId: "v2", quantity: 2 }, { bookId: "c", quantity: 1 }, { bookId: "d", quantity: 1 }, { bookId: "gone", quantity: 1 }], 4, (id) => books[id] || null);
    expect(short).toEqual([
      { bookId: "b", variantId: "v2", title: "Night Songs, Hardcover", need: 8, have: 3 },
      { bookId: "gone", variantId: "", title: "A product that was removed", need: 4, have: 0 },
    ]);
    expect(boxShortfall([{ bookId: "a", quantity: 1 }], 0, (id) => books[id] || null)).toEqual([]);
  });
});
