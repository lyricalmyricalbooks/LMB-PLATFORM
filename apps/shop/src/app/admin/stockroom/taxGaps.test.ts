// Remind me later, Not missing and Show hidden, as the old Tax centre stored them in deductionNotes.
import { describe, expect, it } from "vitest";

import { openMismatches, withGapNote, withGapNotesCleared } from "./taxGaps";

const now = new Date(2026, 10, 11, 12);
const tc = (n: Record<string, unknown> = {}) => ({
  baseCurrency: "CAD", deductionNotes: n,
  businessExpenses: [
    ...Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, date: "2026-03-01", desc: "Adobe subscription", cat: "Software & Subscriptions", amount: 30 })),
    ...Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, date: "2026-03-01", desc: "Printing proofs", cat: "Printing & Production", amount: 40 })),
    { id: "odd", date: "2026-04-01", desc: "Adobe subscription", cat: "Printing & Production", amount: 30 },
  ],
});

describe("gap notes", () => {
  it("puts a finding off for 30 days, sets one aside for good, and Show hidden brings them back", () => {
    const snoozed = withGapNote(tc(), "gap:a", "snooze", now);
    expect(snoozed.deductionNotes["gap:a"]).toMatchObject({ status: "snoozed", until: "2026-12-11" });
    const both = withGapNote(snoozed, "gap:b", "dismiss", now);
    expect(both.deductionNotes["gap:b"].status).toBe("dismissed");
    expect(withGapNotesCleared(both).deductionNotes).toEqual({});
  });
  it("a cost filed against its own history shows as a category check, and a note hides it", () => {
    const { open } = openMismatches({ books: {}, states: {}, taxCenter: tc() }, "2026-11-11");
    const odd = open.find((f) => f.expenseId === "odd");
    expect(odd).toMatchObject({ suggestedCategory: "Software & Subscriptions", canMove: true });
    const later = openMismatches({ books: {}, states: {}, taxCenter: withGapNote(tc(), odd!.id, "dismiss", now) }, "2026-11-11");
    expect(later.open.some((f) => f.expenseId === "odd")).toBe(false);
    expect(later.hidden).toBeGreaterThan(0);
  });
});
