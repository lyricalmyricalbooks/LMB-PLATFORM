import { describe, expect, it } from "vitest";
import { resolveLogoDesign, resolveLogoPosition } from "./selectors";

describe("surface logo design resolution", () => {
  it("uses a hero-only logo in both hero and catalog headers", () => {
    const design = { heroPage: { logoUrl: "/hero.svg", logoText: "Hero" } };

    const heroLogo = resolveLogoDesign(design.heroPage, [design]);
    const catalogLogo = resolveLogoDesign(design.storefront, [design.heroPage, design]);

    expect(heroLogo).toMatchObject({ logoUrl: "/hero.svg", logoText: "Hero" });
    expect(catalogLogo).toMatchObject({ logoUrl: "/hero.svg", logoText: "Hero" });
  });

  it("lets storefront logo fields override hero fields in the catalog", () => {
    const design = {
      heroPage: { logoUrl: "/hero.svg", logoText: "Hero", logoColor: "#111111" },
      storefront: { logoUrl: "/store.svg", logoText: "Store" },
    };

    expect(resolveLogoDesign(design.storefront, [design.heroPage, design])).toMatchObject({
      logoUrl: "/store.svg",
      logoText: "Store",
      logoColor: "#111111",
    });
  });

  it("leaves logo text absent so LogoMark produces its F✶M fallback", () => {
    const heroLogo = resolveLogoDesign(undefined, [{}]);
    const catalogLogo = resolveLogoDesign(undefined, [undefined, {}]);

    expect(heroLogo.logoText).toBeUndefined();
    expect(catalogLogo.logoText).toBeUndefined();
  });

  it("retains tint, color, and height when switching surfaces", () => {
    const design = {
      logoTint: true,
      logoColor: "#abcdef",
      logoHeight: 38,
      heroPage: { logoUrl: "/hero.svg" },
      storefront: { logoText: "Catalog" },
    };

    expect(resolveLogoDesign(design.heroPage, [design])).toMatchObject({
      logoTint: true,
      logoColor: "#abcdef",
      logoHeight: 38,
    });
    expect(resolveLogoDesign(design.storefront, [design.heroPage, design])).toMatchObject({
      logoTint: true,
      logoColor: "#abcdef",
      logoHeight: 38,
    });
  });

  it("resolves placement independently for hero and catalog surfaces", () => {
    const design = {
      logoPosition: "left",
      heroPage: { logoPosition: "center" },
      storefront: { logoPosition: "right" },
    };

    expect(resolveLogoPosition(design.heroPage, [design])).toBe("center");
    expect(resolveLogoPosition(design.storefront, [design.heroPage, design])).toBe("right");
  });
});
