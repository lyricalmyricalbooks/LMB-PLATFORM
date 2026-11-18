import { describe, expect, it } from "vitest";
import { applyShelfCount, shelfCountPlan, shelfCountWords } from "./shelfCount";

const copies = (n: number) => `${n} ${n === 1 ? "copy" : "copies"}`;

describe("fixing stock from the product page", () => {
  it("writes off copies missing from a print run's count", () => {
    const plan = shelfCountPlan({ publisher: 5, hasPrintRun: true }, 3);
    expect(plan).toEqual({ kind: "writeOff", qty: 2 });
    const s = applyShelfCount(plan, "2026-11-18", "x1")!({ ledger: [] });
    expect(s.ledger[0]).toMatchObject({ type: "Inventory Disposal", qty: 2, reason: "Shelf count", date: "2026-11-18" });
    expect(shelfCountWords(plan, copies)).toMatch(/2 copies will be written off/);
  });
  it("leaves a print run's extra copies to the stockroom", () => {
    const plan = shelfCountPlan({ publisher: 5, hasPrintRun: true }, 7);
    expect(plan).toEqual({ kind: "more", extra: 2 });
    expect(applyShelfCount(plan, "2026-11-18", "x")).toBeNull();
  });
  it("moves a plain count either way", () => {
    const up = shelfCountPlan({ publisher: 4, hasPrintRun: false }, 6);
    expect(applyShelfCount(up, "d", "x")!({ stock: 4 }).stock).toBe(6);
    const down = shelfCountPlan({ publisher: 4, hasPrintRun: false }, 1);
    expect(applyShelfCount(down, "d", "x")!({ stock: 4 }).stock).toBe(1);
  });
  it("says when nothing changes", () => {
    expect(shelfCountPlan({ publisher: 3, hasPrintRun: true }, 3)).toEqual({ kind: "same" });
  });
});
