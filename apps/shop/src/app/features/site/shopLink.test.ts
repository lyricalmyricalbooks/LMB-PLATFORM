import { describe, expect, it } from "vitest";
import { buildNavItems, shopLinkMode, withShopLink } from "./navItems";

// Plan "Starters on par", step 3: shoppers look for a Shop link first in the header (Shopify and Squarespace themes).
const cats = [{ id: "a", name: "Bread", showInNav: true }, { id: "b", name: "Tea", showInNav: true }];
const pages = [{ id: "p", title: "About", slug: "about", showInNav: true, status: "published" }];
const items = buildNavItems(cats, pages);

describe("Shop link in the menu", () => {
  it("is off unless Studio turns it on, so a shop's header draws as before", () => {
    expect(shopLinkMode({})).toBe("off");
    expect(shopLinkMode({ navShopLink: "other" })).toBe("off");
    expect(withShopLink(items, {}, "Shop")).toBe(items);
  });

  it("adds a Shop link to every product first, keeping the categories in the bar", () => {
    const out = withShopLink(items, { navShopLink: "link" }, "Shop");
    expect(out.map((i) => i.label)).toEqual(["Shop", "Bread", "Tea", "About"]);
    expect(out[0]).toMatchObject({ kind: "link", to: "/collections/all", children: [] });
  });

  it("moves the categories into a Shop drop-down in menu mode", () => {
    const out = withShopLink(items, { navShopLink: "menu" }, "Boutique");
    expect(out.map((i) => i.label)).toEqual(["Boutique", "About"]);
    expect((out[0] as any).children.map((c: any) => [c.id, c.name])).toEqual([["a", "Bread"], ["b", "Tea"]]);
  });
});
