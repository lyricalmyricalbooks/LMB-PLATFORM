import { describe, expect, it } from "vitest";
import { STARTER_SITES } from "../app/admin/lookGallery";
import { stylesFor } from "../app/admin/studio/starterStyles";
import { withShopStartFor } from "../app/admin/sells";
import { DEMO_NAME, DEMO_SELLS, demoChoice, demoDesign, demoShopName, underBase } from "./demoShop";

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
        expect(design.copy.siteName).toBe(DEMO_NAME);
        expect(books.length).toBeGreaterThan(0);
        // Every picture sits under the demo's folder.
        expect(JSON.stringify({ design, books })).not.toMatch(/"\/(starters|samples)\//);
        // What shoppers read, as the storefront reads it.
        const shown = withShopStartFor({ design, sells, info: { name: DEMO_NAME } } as any).design;
        if (kind !== "books") expect(shown.categories || []).not.toContain("ZINES");
      });
    }
  }
});
