import { describe, expect, it } from "vitest";
import { COMBINED_PAGES, STOCKROOM_PAGES } from "../combined";
import { NAV } from "../riso/nav";
import { adminWordsFor } from "../sells";
import { PAGE_HELP } from "./pageHelpContent";
import { pageHelpFor, pageHelpKey } from "./pageHelp";

// Pages whose header has no "?" (Home draws its own masthead; Help is the help).
const NO_HELP = new Set(["overview", "help", "settings", "settings/designer"]);
const everyPage = [
  ...NAV.filter((n) => !n.children).map((n) => n.id),
  ...(NAV.find((n) => n.id === "settings")?.children || []).map((c) => `settings/${c.id}`),
  ...STOCKROOM_PAGES.map((p) => `stockroom/${p.id}`),
  ...COMBINED_PAGES.map((p) => p.id),
].filter((id) => !NO_HELP.has(id));

describe("page help", () => {
  it("every page with a ? has help", () => {
    const missing = everyPage.filter((id) => !pageHelpFor(id, { books: true }));
    expect(missing).toEqual([]);
  });

  it("keeps the words short and plain", () => {
    for (const [key, entry] of Object.entries(PAGE_HELP)) {
      expect(entry.intro.length, key).toBeLessThanOrEqual(160);
      expect(entry.parts.length, key).toBeGreaterThan(0);
      expect(entry.parts.length, key).toBeLessThanOrEqual(5);
      for (const p of entry.parts) {
        expect(p.title.length, `${key} ${p.title}`).toBeLessThanOrEqual(32);
        expect(p.text.length, `${key} ${p.title}`).toBeLessThanOrEqual(110);
        expect(p.text, `${key} ${p.title}`).toMatch(/[.?!]$/);
        // No code or tool words in what an owner reads.
        expect(`${p.title} ${p.text}`, key).not.toMatch(/\b(CSV file|database|Firestore|API|webhook|click here)\b/i);
      }
      const titles = entry.parts.map((p) => p.title);
      expect(new Set(titles).size, key).toBe(titles.length);
    }
  });

  it("finds the help for the page on screen", () => {
    expect(pageHelpKey({ activeTab: "orders" })).toBe("orders");
    expect(pageHelpKey({ activeTab: "settings", settingsPage: "taxes" })).toBe("settings/taxes");
    expect(pageHelpKey({ activeTab: "shipping" })).toBe("settings/shipping");
    expect(pageHelpKey({ activeTab: "stockroom", stockroomPage: "books" })).toBe("stockroom/books");
    expect(pageHelpFor("settings/billing", { books: true })?.intro).toBe(PAGE_HELP["settings/plan"].intro);
    expect(pageHelpFor("nowhere", { books: true })).toBeNull();
  });

  it("speaks the shop's words and keeps book-only parts for bookshops", () => {
    const books = pageHelpFor("stockroom/artists", { books: true })!;
    const goods = pageHelpFor("stockroom/artists", { books: false })!;
    expect(books.parts.length).toBeGreaterThan(0);
    expect(goods.parts).toEqual([]);
    const catalog = pageHelpFor("catalog", { books: false, w: adminWordsFor("clothing") })!;
    expect(catalog.intro).not.toMatch(/\bbooks?\b/i);
    expect(pageHelpFor("inventory", { books: true })!.intro).toMatch(/title/);
  });
});
