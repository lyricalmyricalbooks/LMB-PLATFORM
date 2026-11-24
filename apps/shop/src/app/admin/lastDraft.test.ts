import { describe, expect, it } from "vitest";
import { forgetLastDraft, readLastDraft, rememberLastDraft, whenWords } from "./lastDraft";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe("Continue where you left off", () => {
  it("remembers the newest new draft and forgets it after two weeks", () => {
    const s = memory();
    rememberLastDraft("p1", " Silver ring ", 1000, s);
    expect(readLastDraft(2000, s)).toEqual({ id: "p1", title: "Silver ring", at: 1000 });
    expect(readLastDraft(1000 + 15 * 86_400_000, s)).toBeNull();
  });
  it("forgets only the product it names", () => {
    const s = memory();
    rememberLastDraft("p1", "Ring", Date.now(), s);
    forgetLastDraft("p2", s);
    expect(readLastDraft(Date.now(), s)?.id).toBe("p1");
    forgetLastDraft("p1", s);
    expect(readLastDraft(Date.now(), s)).toBeNull();
  });
  it("shrugs off a broken or missing store", () => {
    expect(readLastDraft(0, null)).toBeNull();
    const s = memory(); s.setItem("colophon.admin.lastNewDraft", "{oops");
    expect(readLastDraft(0, s)).toBeNull();
  });
  it("says when in plain words", () => {
    const now = new Date(2026, 10, 24, 15, 0).getTime();
    expect(whenWords(now - 30_000, now)).toBe("just now");
    expect(whenWords(now - 20 * 60_000, now)).toBe("20 minutes ago");
    expect(whenWords(new Date(2026, 10, 24, 9, 0).getTime(), now)).toBe("earlier today");
    expect(whenWords(new Date(2026, 10, 23, 9, 0).getTime(), now)).toBe("yesterday");
    expect(whenWords(new Date(2026, 10, 20, 9, 0).getTime(), now)).toBe("4 days ago");
  });
});
