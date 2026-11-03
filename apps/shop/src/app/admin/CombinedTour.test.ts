// The combined admin's first-time tour (CombinedTour.tsx): every "Show me" opens a real page, the words follow the
// shop type, and seen-or-skipped is remembered on this device without ever breaking the admin.
import { describe, expect, it } from "vitest";
import { TOUR_STEPS, markTourSeen, tourSeen } from "./CombinedTour";
import { COMBINED_MENU } from "./riso/nav";
import { STOCKROOM_PAGES } from "./combined";
import { goodsWords } from "./sells";


describe("the tour's steps", () => {
  it("opens only pages the combined menu has", () => {
    const menuPages = new Set(COMBINED_MENU.flatMap((item) => item.pages));
    const stockroom = new Set(STOCKROOM_PAGES.map((p) => p.id));
    for (const step of TOUR_STEPS) {
      if (!step.go) continue;
      if ("page" in step.go) expect(menuPages.has(step.go.page), step.go.page).toBe(true);
      else expect(stockroom.has(step.go.stockroom), step.go.stockroom).toBe(true);
      expect(step.show, step.title).toBeTruthy();
    }
  });
  it("is short: an intro and at most five stops", () => {
    expect(TOUR_STEPS[0].go).toBeUndefined();
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(6);
  });
  it("speaks of products, not books, for a general shop", () => {
    for (const step of TOUR_STEPS) {
      for (const text of [step.title, step.text, step.show || ""]) expect(goodsWords(text)).not.toMatch(/\b(books?|copies)\b/i);
    }
  });
});

describe("remembering the tour", () => {
  const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
  it("is unseen until marked", () => {
    const s = store();
    expect(tourSeen(s)).toBe(false);
    markTourSeen(s);
    expect(tourSeen(s)).toBe(true);
  });
  it("never throws when the device keeps nothing", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(tourSeen(broken)).toBe(false);
    expect(() => markTourSeen(broken)).not.toThrow();
    expect(tourSeen(null)).toBe(false);
  });
});
