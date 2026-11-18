// Rentals admin rules (rentalsView.ts): the form round-trips, bad numbers are caught, and the timeline places bars.
import { describe, expect, test } from "vitest";
import { blankItem, formFromItem, itemToSave, rentalTotals, timelineRows, whenText } from "./rentalsView";
import { cleanRentalItem, type RentalItem } from "../../shared/rentalRules";
import type { AdminRental } from "./rentalsApi";

const item = cleanRentalItem({ name: "Kayak", units: 2, basis: "day", dayMinor: 4000, weekMinor: 20000 }, "kayak001") as RentalItem;
const rental = (over: Partial<AdminRental>): AdminRental => ({
  id: "r1", status: "paid", itemId: "kayak001", itemName: "Kayak", unit: 1, startMs: 0, endMs: 0, length: 1, basis: "day", name: "Ada", email: "a@example.com",
  totalMinor: 4000, taxMinor: 0, chargedMinor: 4000, currency: "CAD", refundedMinor: 0, test: true, createdAt: "", paidAt: "", pickedUpAt: "", returnedAt: "", holdUntil: "", ...over,
});

describe("rentals admin", () => {
  test("an item goes to the form and back unchanged", () => {
    expect(cleanRentalItem(itemToSave(formFromItem(item)), "kayak001")).toEqual(item);
    expect(itemToSave({ ...blankItem(), day: "ten" })).toEqual({ problem: "Type prices as amounts, like 25 or 12.50." });
    expect(itemToSave({ ...blankItem(), units: "1.5" })).toEqual({ problem: "Use whole numbers for units, lengths and days." });
  });
  test("figures and times read plainly", () => {
    const now = Date.parse("2026-11-18T17:00:00Z");
    const rs = [rental({ status: "out", endMs: now - 1, paidAt: "2026-11-02" }), rental({ id: "r2", startMs: now + 86_400_000, paidAt: "2026-11-10" })];
    expect(rentalTotals(rs, now)).toEqual({ out: 1, late: 1, coming: 1, monthMinor: 8000 });
    expect(whenText({ startMs: Date.parse("2026-11-20T15:00:00Z"), endMs: Date.parse("2026-11-20T17:00:00Z") }, "America/Toronto")).toBe("Fri, Nov 20, 10:00 – 12:00");
  });
  test("the timeline puts each rental on its unit", () => {
    const rows = timelineRows({ ...item, repair: [2] }, [rental({ startMs: 25, endMs: 75 }), rental({ id: "x", status: "cancelled", startMs: 0, endMs: 100 })], 0, 100);
    expect(rows.map((r) => r.unit)).toEqual([1, 2]);
    expect(rows[0].bars.map((b) => [b.left, b.width])).toEqual([[25, 50]]);
    expect(rows[1]).toMatchObject({ repair: true, bars: [] });
  });
});
