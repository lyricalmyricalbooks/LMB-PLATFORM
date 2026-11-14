// The admin walkthrough's steps (tourSteps.ts): every stop points at something this admin really has, the words follow
// the shop, and the card always lands inside the window.
import { describe, expect, it } from "vitest";
import { CHAPTERS, TOUR_STEPS, chaptersOf, markTourSeen, pageOf, placeCard, tourFor, tourSeen } from "./tourSteps";
import { MENU, sideMenu } from "../riso/nav";
import { goodsWords } from "../sells";

const firsts = (menu: { pages: string[] }[]) => new Set(menu.map((g) => g.pages[0]));
const combinedItems = firsts([...sideMenu("website"), ...sideMenu("stockroom")]);

describe("the stops", () => {
  it("point only at menu items the combined admin has, and every combined item gets a stop", () => {
    const navs = TOUR_STEPS.flatMap((s) => (s.target && "nav" in s.target ? [s.target.nav] : []));
    for (const nav of navs) expect(combinedItems.has(nav), nav).toBe(true);
    for (const item of combinedItems) expect(navs, item).toContain(item);
  });
  it("gives a shop without a stockroom only its own menu and no stockroom words", () => {
    const steps = tourFor({ combined: false, books: true, menuItems: firsts(MENU) });
    expect(steps.some((s) => s.chapter === "stockroom")).toBe(false);
    expect(steps.map((s) => s.id)).toEqual(["search", "status", "home", "orders", "products", "design", "settings", "help"]);
    for (const s of steps) expect(s.text).not.toMatch(/stockroom|fair mode/i);
  });
  it("leaves out a stop whose menu item is hidden", () => {
    const items = new Set(combinedItems); items.delete("stockroom/backups");
    expect(tourFor({ combined: true, books: true, menuItems: items }).some((s) => s.id === "backups")).toBe(false);
  });
  it("speaks of products, not books, in a shop that doesn't sell books", () => {
    for (const s of tourFor({ combined: true, books: false, menuItems: combinedItems })) {
      for (const text of [s.title, s.text]) expect(goodsWords(text), s.id).not.toMatch(/\b(books?|copies|ISBN|artists?|reprint)\b/i);
    }
  });
  it("keeps every stop short: a title of a few words and at most two sentences", () => {
    for (const s of TOUR_STEPS) {
      expect(s.title.split(" ").length, s.id).toBeLessThanOrEqual(5);
      for (const text of [s.text, s.books || ""]) expect(text.split(/[.!?](\s|$)/).filter((x) => x.trim().length > 1).length, s.id).toBeLessThanOrEqual(3);
    }
  });
  it("opens the page each stop talks about", () => {
    expect(pageOf(TOUR_STEPS.find((s) => s.id === "orders")!)).toBe("orders");
    expect(pageOf(TOUR_STEPS.find((s) => s.id === "search")!)).toBe("overview");
    expect(pageOf(TOUR_STEPS.find((s) => s.id === "fair")!)).toBeUndefined();
  });
  it("lists its chapters in order with where each starts", () => {
    const steps = tourFor({ combined: true, books: true, menuItems: combinedItems });
    const chapters = chaptersOf(steps, true);
    expect(chapters.map((c) => c.id)).toEqual(CHAPTERS.map((c) => c.id));
    for (const c of chapters) expect(steps[c.start].chapter).toBe(c.id);
    expect(chapters.reduce((n, c) => n + c.count, 0)).toBe(steps.length);
    expect(chaptersOf(tourFor({ combined: false, books: true, menuItems: firsts(MENU) }), false).map((c) => c.label)).toEqual(["Getting around", "Your shop", "Help"]);
  });
});

describe("where the card goes", () => {
  const view = { width: 1440, height: 900 };
  const card = { width: 360, height: 220 };
  it("sits to the right of a menu item down the left side", () => {
    expect(placeCard({ left: 8, top: 200, right: 230, bottom: 244 }, card, view)).toEqual({ left: 246, top: 192 });
  });
  it("sits under a spot in the top bar, and above one at the bottom of a phone", () => {
    expect(placeCard({ left: 280, top: 10, right: 790, bottom: 60 }, card, view).top).toBe(76);
    const phone = placeCard({ left: 70, top: 790, right: 170, bottom: 840 }, { width: 358, height: 250 }, { width: 390, height: 844 });
    expect(phone.top + 250).toBeLessThanOrEqual(790);
    expect(phone.left).toBe(16);
  });
  it("is centred with nothing to point at, and never leaves the window", () => {
    expect(placeCard(null, card, view)).toEqual({ left: 540, top: 340 });
    const p = placeCard({ left: 1400, top: 880, right: 1440, bottom: 900 }, card, view);
    expect(p.left + card.width).toBeLessThanOrEqual(view.width - 16);
    expect(p.top).toBeGreaterThanOrEqual(16);
  });
});

describe("remembering the tour", () => {
  const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
  it("is unseen until marked, and the old tour's mark doesn't count", () => {
    const s = store();
    expect(tourSeen(s)).toBe(false);
    s.setItem("lm:combined-tour", "done");
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
