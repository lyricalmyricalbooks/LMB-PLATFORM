import { describe, expect, it } from "vitest";
import { automaticFooterItems, groupedFooterItems, pageInFooter } from "./footerNavigation";
import { buildNavItems } from "./navItems";

describe("grouped footer navigation", () => {
  it("keeps published pages, routes purchase help to Connect, and avoids repeated Contact", () => {
    const items = automaticFooterItems({}, [
      { id: "1", slug: "about", title: "About", status: "published", showInNav: true },
      { id: "2", slug: "contact", title: "contact", status: "published", showInNav: true },
      { id: "3", slug: "project-submissions", title: "Submissions", status: "published", showInNav: true },
      { id: "4", slug: "draft", title: "Draft", status: "draft", showInNav: true },
    ]);
    const groups = groupedFooterItems(items);
    expect(groups.explore.map(i => i.label)).toEqual(["Shop", "About"]);
    expect(groups.connect.map(i => i.label)).toContain("Submissions");
    expect(items.filter(i => /contact/i.test(i.label))).toHaveLength(1);
    expect(items.some(i => i.label === "Draft")).toBe(false);
  });
  it("honours explicit groups, visibility, children and custom destinations", () => {
    const groups = groupedFooterItems([
      { id: "1", label: "Contact", type: "page", value: "contact", footerGroup: "explore", children: [{ id: "child", label: "Press", type: "page", value: "press" }] },
      { id: "2", label: "Hidden", type: "home", hidden: true },
      { id: "3", label: "Email", type: "url", value: "mailto:shop@example.com" },
      { id: "4", label: "Email again", type: "url", value: "mailto:shop@example.com" },
    ]);
    expect(groups.explore[0].children).toHaveLength(1);
    expect(groups.connect.map(i => i.id)).toEqual(["3", "4"]);
  });
  it("links footer-only pages from the footer but never the header", () => {
    const pages = [
      { id: "1", slug: "about", title: "About", status: "published", showInNav: true },
      { id: "2", slug: "stockists", title: "Stockists", status: "published", showInNav: false, showInFooter: true },
      { id: "3", slug: "hidden", title: "Hidden", status: "published", showInNav: false },
      { id: "4", slug: "stockists-draft", title: "Draft", status: "draft", showInNav: false, showInFooter: true },
    ];
    expect(automaticFooterItems({}, pages).filter(i => i.type === "page").map(i => i.value)).toEqual(["about", "stockists"]);
    expect(buildNavItems([], pages).map(i => i.label)).toEqual(["About"]);
    expect(pages.map(pageInFooter)).toEqual([true, true, false, false]);
  });
});
