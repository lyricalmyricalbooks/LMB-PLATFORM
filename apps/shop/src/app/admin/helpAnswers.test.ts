// The admin's Help page rules (helpPage.ts) over the platform's real answers (help/articles.js).
import { describe, expect, it } from "vitest";
import { ARTICLES, TOPICS, articlesFor } from "@help/articles.js";
import { POPULAR, helpList, topicsOf, wherePage } from "./helpAnswers";
import { ADMIN_TABS, SETTINGS_TABS } from "./adminRoute";
import { STOCKROOM_PAGES } from "./combined";

describe("the Help page's answers", () => {
  it("opens on the popular answers, which all exist", () => {
    for (const id of POPULAR) expect(ARTICLES.some((a) => a.id === id), id).toBe(true);
    const { heading, items } = helpList(articlesFor("both"), { text: "", topic: "All" });
    expect(heading).toBe("popular");
    expect(items.map((a) => a.id)).toEqual(POPULAR);
  });
  it("skips a popular answer the shop's plan doesn't have", () => {
    const shopOnly = articlesFor("shop");
    const items = helpList(shopOnly, { text: "", topic: "All" }).items;
    expect(items.every((a) => shopOnly.includes(a))).toBe(true);
  });
  it("finds answers by words, questions first, and narrows by topic", () => {
    const found = helpList(articlesFor("both"), { text: "shipping", topic: "All" });
    expect(found.heading).toBe("results");
    expect(found.items[0].question.toLowerCase()).toContain("shipping");
    const orders = helpList(articlesFor("both"), { text: "", topic: "Orders" }).items;
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((a) => a.topic === "Orders")).toBe(true);
    expect(helpList(articlesFor("both"), { text: "zzzz nothing", topic: "All" }).items).toEqual([]);
  });
  it("lists only topics that have answers, after All", () => {
    const topics = topicsOf(TOPICS, articlesFor("shop"));
    expect(topics[0]).toBe("All");
    for (const t of topics.slice(1)) expect(articlesFor("shop").some((a) => a.topic === t), t).toBe(true);
  });
  it("in a shop that doesn't sell books, speaks of products", () => {
    const list = articlesFor("both", "clothing");
    const first = helpList(list, { text: "", topic: "All" }).items[0];
    expect(first.question).not.toMatch(/\bbooks?\b/i);
  });
});

describe("Go to buttons", () => {
  const pages = new Set<string>([...ADMIN_TABS, ...SETTINGS_TABS.map((t) => `settings/${t}`), ...STOCKROOM_PAGES.map((p) => `stockroom/${p.id}`)]);
  it("open a real admin page for every path the answers name", () => {
    for (const a of [...ARTICLES, ...articlesFor("both", "clothing")]) {
      for (const path of a.where || []) {
        const page = wherePage(path, { combined: true });
        expect(page, `${a.id}: ${path}`).not.toBeNull();
        expect(pages.has(page!), `${a.id}: ${path} → ${page}`).toBe(true);
      }
    }
  });
  it("read Settings pages by name, and Settings › Design as the Online store page", () => {
    expect(wherePage("Settings › Shipping", { combined: false })).toBe("settings/shipping");
    expect(wherePage("Settings › Design", { combined: false })).toBe("design");
    expect(wherePage("Products › a product", { combined: false })).toBe("catalog");
    expect(wherePage("Tax centre", { combined: false })).toBeNull();
    expect(wherePage("Tax centre", { combined: true })).toBe("stockroom/taxcenter");
  });
});
