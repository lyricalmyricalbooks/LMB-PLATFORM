import { describe, expect, it } from "vitest";
import { bagNote, clearBagNote, orderNoteBoxOn, rememberBagNote, ORDER_NOTE_MAX } from "./bagNote";

function store() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
}

describe("bag order note", () => {
  it("keeps the note for the tab, cut to 500 characters", () => {
    const s = store();
    expect(bagNote(s)).toBe("");
    expect(rememberBagNote("Please gift wrap", s)).toBe("Please gift wrap");
    expect(bagNote(s)).toBe("Please gift wrap");
    rememberBagNote("x".repeat(600), s);
    expect(bagNote(s)).toHaveLength(ORDER_NOTE_MAX);
  });
  it("a blank note or clearing removes it", () => {
    const s = store();
    rememberBagNote("Hi", s);
    rememberBagNote("   ", s);
    expect(bagNote(s)).toBe("");
    rememberBagNote("Hi", s);
    clearBagNote(s);
    expect(bagNote(s)).toBe("");
  });
  it("survives blocked storage", () => {
    const broken: any = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
    expect(bagNote(broken)).toBe("");
    expect(rememberBagNote("Hi", broken)).toBe("Hi");
    expect(() => clearBagNote(broken)).not.toThrow();
  });
  it("checkout shows its note box for either switch, off by default", () => {
    expect(orderNoteBoxOn({})).toBe(false);
    expect(orderNoteBoxOn({ showOrderNote: true })).toBe(true);
    expect(orderNoteBoxOn({ cartDrawerShowOrderNote: true })).toBe(true);
    expect(orderNoteBoxOn({ cartDrawerShowOrderNote: "yes" })).toBe(false);
  });
});
