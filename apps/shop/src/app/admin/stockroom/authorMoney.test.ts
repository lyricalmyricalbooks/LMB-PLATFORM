import { describe, expect, it } from "vitest";
import { planArtistSettlement } from "@stockroom/artist-settlement.js";
import { authorMoneyPlan, authorStatement, pastSettlements, recordSettlement, undoSettlement } from "./authorMoney";

const book = { id: "b1", title: "Moths", currency: "CAD", productionCost: 0, profitTiers: [{ revenueUpTo: null, artistPct: 50 }] };
const fresh = () => ({
  hist: [
    { num: 1, date: "2026-10-01", qty: 2, price: 20, channel: "Shop" },
    { num: 2, date: "2026-10-02", qty: 1, price: 20, channel: "Fair", artistPending: true },
  ],
  revenue: 40, artistPayouts: [] as any[],
});

describe("author money", () => {
  it("shows the same figures as the old stockroom", () => {
    const state = fresh();
    const plan = authorMoneyPlan(book, state)!;
    const old = planArtistSettlement(book, structuredClone(state))!;
    expect(plan.balance).toEqual(old.balance);
    // Author earned 30 (half of 60), holds 20 of which 10 is theirs; the press owes 20, the author holds 10 of the press's.
    expect(plan.balance.direction).toBe("to-artist");
    expect(plan.balance.amount).toBe(10);
    expect(authorStatement(book, plan, "2026-11-11")).toContain("The publisher sends you CA$10.00");
  });

  it("records a settlement, then undoes it back to where it was", () => {
    const state = fresh();
    const plan = authorMoneyPlan(book, state)!;
    const after = recordSettlement(book, plan.id, { date: "2026-11-11", method: "e-Transfer" })(structuredClone(state));
    expect(pastSettlements(after)).toHaveLength(1);
    expect(authorMoneyPlan(book, after)!.balance.direction).toBe("settled");
    const undone = undoSettlement(String(pastSettlements(after)[0].id))(after);
    expect(pastSettlements(undone)).toHaveLength(0);
    expect(authorMoneyPlan(book, undone)!.balance).toEqual(plan.balance);
  });

  it("refuses when the book moved since the figures were shown", () => {
    const state = fresh();
    const plan = authorMoneyPlan(book, state)!;
    state.hist.push({ num: 3, date: "2026-10-03", qty: 1, price: 20, channel: "Shop" });
    expect(() => recordSettlement(book, plan.id, { date: "2026-11-11" })(state)).toThrow(/changed/);
  });

  it("has nothing to work out without an author share", () => {
    expect(authorMoneyPlan({ ...book, profitTiers: [] }, fresh())).toBeNull();
  });
});
