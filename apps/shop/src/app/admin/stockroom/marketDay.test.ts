import { describe, expect, it } from "vitest";
import { marketDayCard } from "./marketDay";

const sale = (date: string, qty: number, notes: string, chan = "Book Fair") => ({ date, qty, notes, chan });
const records = {
  books: [{ id: "a", title: "Ferry Poems" }, { id: "b", title: "Salt" }] as any,
  states: { a: { stock: 2, hist: [sale("2026-11-09", 3, "Cash · Spring fair"), sale("2026-11-09", 1, "Card · Spring fair")] }, b: { stock: 20, hist: [sale("2026-11-09", 1, "Stripe QR"), sale("2026-11-10", 1, "x", "Website")] } },
};

describe("market day summary", () => {
  it("says what sold, how it was paid and what is running low, as the old app does", () => {
    const card = marketDayCard(records, "2026-11-11", "")!;
    expect(card.day).toBe("2026-11-09");
    expect(card.detail).toBe("5 copies sold: Ferry Poems 4, Salt 1. Paid 2 by card, 3 cash. Running low: Ferry Poems (2 left).");
  });
  it("shows a day only once, and never today", () => {
    expect(marketDayCard(records, "2026-11-11", "2026-11-09")).toBeNull();
    expect(marketDayCard(records, "2026-11-09", "")).toBeNull();
  });
});
