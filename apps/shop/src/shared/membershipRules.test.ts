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
