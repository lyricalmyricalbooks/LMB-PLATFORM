import { describe, expect, it } from "vitest";
import { STARTER_SITES, libraryLook } from "../app/admin/lookGallery";
import { stylesFor } from "../app/admin/studio/starterStyles";
import { withShopStartFor } from "../app/admin/sells";
import { DEMO_NAME, DEMO_SELLS, demoChoice, demoDesign, demoShipping, demoShopName, underBase } from "./demoShop";

describe("live demo shops", () => {
  it("falls back to the first starter, its own style and a clothing shop for an unknown answer", () => {
    expect(demoChoice({ starter: "nope", style: "nope", sells: "nope" })).toEqual({ starter: STARTER_SITES[0], style: stylesFor(STARTER_SITES[0])[0].id, sells: "clothing" });
    expect(demoChoice({ starter: "juniper-catalogue", style: "night", sells: "studio" })).toEqual({ starter: "juniper-catalogue", style: "night", sells: "studio" });
    // A style of another starter isn't this one's.
    expect(demoChoice({ starter: "aurel-editorial", style: "sage" }).style).toBe(stylesFor("aurel-editorial")[0].id);
  });

  it("shows the visitor's own shop name (sign-up's live preview), as one plain line", () => {
    expect(demoShopName("  Moth   & Moon ")).toBe("Moth & Moon");
    expect(demoShopName("<b>Bold</b>\nShop")).toBe("bBold/b Shop");
    expect(demoShopName("x".repeat(80))).toHaveLength(60);
    expect(demoShopName("")).toBe(DEMO_NAME);
    expect(demoShopName(null)).toBe(DEMO_NAME);
    expect(demoDesign({ starter: STARTER_SITES[0], style: "", sells: "clothing" }, "/demo/", "Moth & Moon").design.copy.siteName).toBe("Moth & Moon");
  });

  it("fills the menu with the starter's own pages, published, so no header or side menu is empty", () => {
    for (const starter of STARTER_SITES) {
      const { pages, design } = demoDesign({ starter, style: "", sells: "clothing" });
      expect(pages.length, starter).toBeGreaterThan(0);
      for (const page of pages) expect(page, starter).toMatchObject({ status: "published" });
      // About and Contact sit in the menu; Shipping & returns in the footer, as on a finished shop.
      expect(pages.filter((p: any) => p.showInNav).map((p: any) => p.slug), starter).toContain("about");
      expect(pages.every((p: any) => p.showInNav || p.showInFooter), starter).toBe(true);
      // The menu's shelves are the sample products' own, never a bookshop's starting menu.
      expect(design.categories.map((c: any) => c.name), starter).not.toContain("ZINES");
      expect(new Set(pages.map((p: any) => p.slug)).size, starter).toBe(pages.length);
    }
  });

  it("puts the demo's folder in front of the starter pictures", () => {
    expect(underBase({ a: "/starters/aurel/hero.webp", b: ["/starters/x.webp"], c: "/other.webp" }, "/demo/")).toEqual({ a: "/demo/starters/aurel/hero.webp", b: ["/demo/starters/x.webp"], c: "/other.webp" });
    const same = { a: "/starters/x.webp" };
    expect(underBase(same, "/")).toBe(same);
  });

  for (const starter of STARTER_SITES) {
    for (const kind of Object.keys(DEMO_SELLS) as (keyof typeof DEMO_SELLS)[]) {
      it(`${starter} as a ${kind} shop: the style, sample products, the shop's own words and no book menu`, () => {
        const style = stylesFor(starter).at(-1)!.id;
        const { design, books, name, sells } = demoDesign({ starter, style, sells: kind }, "/demo/");
        expect(sells).toBe(DEMO_SELLS[kind]);
        expect(name).toMatch(/\S/);
        // No name asked: the starter's made-up brand, never "Your shop".
        expect(design.copy.siteName).toBe((libraryLook(starter) as any).content.sampleBrand);
        // A services shop sells nothing (its price list is its shop); every other kind shows sample products.
        if (kind === "studio" || kind === "beauty") expect(books).toEqual([]);
        else expect(books.length).toBeGreaterThan(0);
        // Every picture sits under the demo's folder.
        expect(JSON.stringify({ design, books })).not.toMatch(/"\/(starters|samples)\//);
        // What shoppers read, as the storefront reads it.
        const shown = withShopStartFor({ design, sells, info: { name: DEMO_NAME } } as any).design;
        if (kind !== "books") expect(shown.categories || []).not.toContain("ZINES");
      });
    }
  }
});

describe("Show as: a demo as a products, services or both shop", () => {
  it("picks a sample set that fits the kind and keeps the lead only for Both", () => {
    expect(demoChoice({ starter: "aurel-editorial", kind: "services" }).sells).toBe("studio");
    expect(demoChoice({ starter: "starter-salon", kind: "services" }).sells).toBe("beauty");
    expect(demoChoice({ starter: "starter-salon", kind: "products" }).sells).toBe("clothing");
    expect(demoChoice({ starter: "aurel-editorial", kind: "both", lead: "services" })).toMatchObject({ kind: "both", lead: "services" });
    expect(demoChoice({ starter: "aurel-editorial", kind: "products", lead: "services" }).lead).toBeUndefined();
    expect(demoChoice({ starter: "aurel-editorial", kind: "nonsense" }).kind).toBeUndefined();
  });
  it("a services demo sells nothing, a Both demo always has products and booking", () => {
    for (const starter of STARTER_SITES) {
      expect(demoDesign(demoChoice({ starter, kind: "services" })).books, starter).toEqual([]);
      const both = demoDesign(demoChoice({ starter, kind: "both" }));
      expect(both.books.length, starter).toBeGreaterThan(0);
      expect(JSON.stringify(both.design), starter).toMatch(/ServiceMenuSection|BookTimeSection/);
    }
  });
});

describe("the booking starters show their own price list and team", () => {
  it("Salon and Workshop bring their own services, never the general samples", () => {
    for (const starter of ["starter-salon", "starter-workshop"]) {
      const { bookingSamples } = demoDesign(demoChoice({ starter }), "/demo/");
      expect(bookingSamples.starterServices.length, starter).toBeGreaterThanOrEqual(4);
      expect(bookingSamples.starterTeam.length, starter).toBeGreaterThanOrEqual(2);
      for (const s of bookingSamples.starterServices) {
        expect(s.name).not.toMatch(/example|sample/i);
        expect(s.photo).toMatch(/^\/demo\/samples\//);
        expect(s.priceMinor).toBeGreaterThan(0);
      }
    }
    expect(demoDesign(demoChoice({ starter: "aurel-editorial" }), "/demo/").bookingSamples.starterServices).toEqual([]);
  });
});

describe("the demo bag's sample free-shipping rule", () => {
  it("sits at about twice a typical sample product, rounded, and is left out when nothing ships", () => {
    expect(demoShipping([{ retailPrice: 9 }, { retailPrice: 10 }, { retailPrice: 30 }])).toEqual([{ id: "demo-shipping", name: "Standard shipping", freeShippingOver: 20 }]);
    expect(demoShipping([{ retailPrice: 420 }, { retailPrice: 360 }, { retailPrice: 1100 }])[0].freeShippingOver).toBe(900);
    expect(demoShipping([])).toEqual([]);
    for (const starter of STARTER_SITES) {
      const { books } = demoDesign(demoChoice({ starter, kind: "products" }));
      const [rule] = demoShipping(books);
      expect(rule.freeShippingOver, starter).toBeGreaterThan(Math.min(...books.map((b: any) => b.retailPrice)));
    }
  });
});
