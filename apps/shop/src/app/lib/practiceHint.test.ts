import { afterEach, describe, expect, it, vi } from "vitest";
import { practiceHint, rememberPractice } from "./practiceHint";

// The browser's practice hint (plan 7.6) only steps past the store-status page in the owner's own browser; the server
// decides every checkout. It must never throw, and it ends when its hour does.
function memoryStorage() {
  const items = new Map<string, string>();
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), removeItem: (k: string) => void items.delete(k) };
}

describe("practice hint", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lasts until the time the server gave, and is cleared by an empty answer", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const now = Date.parse("2026-10-28T12:00:00Z");
    rememberPractice("2026-10-28T13:00:00.000Z");
    expect(practiceHint(now)).toBe("2026-10-28T13:00:00.000Z");
    expect(practiceHint(Date.parse("2026-10-28T13:00:00Z"))).toBe("");
    rememberPractice("");
    expect(practiceHint(now)).toBe("");
  });

  it("is off when storage is blocked or holds nonsense", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} });
    expect(() => rememberPractice("2026-10-28T13:00:00.000Z")).not.toThrow();
    expect(practiceHint()).toBe("");
    vi.stubGlobal("localStorage", { ...memoryStorage(), getItem: () => "soon" });
    expect(practiceHint()).toBe("");
  });
});
