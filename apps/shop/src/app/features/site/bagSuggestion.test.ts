import { describe, expect, it } from "vitest";
import { dailyBagSuggestion } from "./bagSuggestion";

const books = ["c", "a", "d", "b"].map((id) => ({ id, categories: id === "d" || id === "b" ? ["Zines"] : ["Art"] }));
const at = (day: string) => Date.parse(`${day}T17:00:00Z`); // midday in Toronto

describe("dailyBagSuggestion", () => {
  it("shows the same book all day and a different one the next day", () => {
    const morning = dailyBagSuggestion(books, new Set(), Date.parse("2026-10-21T05:00:00Z"));
    const evening = dailyBagSuggestion(books, new Set(), Date.parse("2026-10-22T03:30:00Z")); // 23:30 Toronto
    expect(evening?.id).toBe(morning?.id);
    expect(dailyBagSuggestion(books, new Set(), at("2026-10-22"))?.id).not.toBe(morning?.id);
  });

  it("goes through every book before repeating", () => {
    const seen = new Set(["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"].map((d) => dailyBagSuggestion(books, new Set(), at(d))?.id));
    expect(seen.size).toBe(4);
  });

  it("does not depend on catalog order", () => {
    expect(dailyBagSuggestion([...books].reverse(), new Set(), at("2026-10-21"))?.id).toBe(dailyBagSuggestion(books, new Set(), at("2026-10-21"))?.id);
  });

  it("prefers books in the bag's categories", () => {
    for (const d of ["2026-10-21", "2026-10-22", "2026-10-23"]) {
      expect(["b", "d"]).toContain(dailyBagSuggestion(books, new Set(["Zines"]), at(d))?.id);
    }
  });

  it("returns nothing when no book can be added", () => {
    expect(dailyBagSuggestion([], new Set())).toBeUndefined();
  });
});
