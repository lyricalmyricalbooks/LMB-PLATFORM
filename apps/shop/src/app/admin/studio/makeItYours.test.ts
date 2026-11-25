import { describe, expect, it } from "vitest";
import { FONT_CHOICES } from "../../features/site/fonts";
import { getSectionMeta } from "../ThemeEditorExtensions";
import { libraryLook, STARTER_SITES } from "../lookGallery";
import { applyStarter, starterForShop } from "./starterDesign";
import { getSections } from "./studioModel";
import { stylesFor } from "./starterStyles";
import { contrastRatio } from "../../features/site/colorSchemes";
import {
  applyColours, applyFonts, applyHomeShape, colourChoices, currentColour, currentFonts, currentHomeShape, FONT_PAIRINGS, fontChoices,
  homeShapes, nextFour, pageChoices, starterOf, untouchedStarterPage, withOpeningWords,
} from "./makeItYours";

const started = (id: string, sells: string | null = "clothing") => applyStarter({}, starterForShop(libraryLook(id) as any, sells), getSectionMeta as any);
const home = (design: any) => getSections(design, { kind: "template", id: "heroPage" });

describe("Make it yours: colours", () => {
  it("offers the starter's three styles, and three more in the logo's colour", () => {
    const design = started("aurel-editorial");
    expect(starterOf(design)?.theme.id).toBe("aurel-editorial");
    expect(colourChoices(design).map((c) => c.id)).toEqual(stylesFor("aurel-editorial").map((s) => s.id));
    const withLogo = colourChoices(design, ["#1a9e3f", "#ffffff"]);
    expect(withLogo).toHaveLength(6);
    expect(withLogo.filter((c) => c.yours).map((c) => c.name)).toEqual(["Cobalt in your colour", "Sand in your colour", "Night in your colour"]);
    expect(colourChoices({})).toEqual([]);
  });

  it("puts a style on the whole shop, its band colours included, and can come back", () => {
    for (const id of STARTER_SITES) {
      const design = started(id);
      const choices = colourChoices(design);
      expect(currentColour(design, choices), id).toBe(choices[0].id);
      const night = choices[choices.length - 1];
      const dark = applyColours(design, night, getSectionMeta as any);
      expect(currentColour(dark, choices), id).toBe(night.id);
      expect(dark.themeBase.style, id).toBe(night.style);
      // Back to the first style gives the starter's own bands again.
      const back = applyColours(dark, choices[0], getSectionMeta as any);
      expect(currentColour(back, choices), id).toBe(choices[0].id);
      const settings = (d: any) => [...home(d), ...getSections(d, { kind: "global", group: "globalSections" as any })].map((s: any) => s.settings);
      expect(settings(back), id).toEqual(settings(design));
    }
  });

  it("keeps the owner's fonts when asked, and the logo's colour stays readable", () => {
    const design = applyFonts(started("juniper-slow-season"), FONT_PAIRINGS[0]);
    const sand = colourChoices(design, ["#f5d300"]).find((c) => c.yours)!;
    const next = applyColours(design, sand, getSectionMeta as any, true);
    expect(next.headingFont).toBe(FONT_PAIRINGS[0].heading);
    expect(contrastRatio(next.primaryColor, next.backgroundColor)).toBeGreaterThanOrEqual(3);
  });
});

describe("Make it yours: fonts", () => {
  it("offers six pairs, the starter's own first, every weight one Google serves", () => {
    const design = started("starter-larder");
    const pairs = fontChoices(design);
    expect(pairs).toHaveLength(6);
    expect(pairs[0].id).toBe("starter");
    expect(currentFonts(design, pairs)).toBe("starter");
    for (const p of FONT_PAIRINGS) {
      const heading = FONT_CHOICES.find((f) => f.name === p.heading);
      expect(heading?.weights, p.id).toContain(p.headingWeight);
      expect(FONT_CHOICES.some((f) => f.name === p.body), p.id).toBe(true);
    }
    const next = applyFonts(design, pairs[3]);
    expect(currentFonts(next, pairs)).toBe(pairs[3].id);
  });
});

describe("Make it yours: pages and homepage", () => {
  it("offers shipping only to shops that post things", () => {
    expect(pageChoices("clothing")).toContain("shipping");
    expect(pageChoices("hair")).not.toContain("shipping");
    expect(untouchedStarterPage({ status: "draft", body: "<p>x</p>" }, "<p>x</p>")).toBe(true);
    expect(untouchedStarterPage({ status: "draft", body: "<p>mine</p>" }, "<p>x</p>")).toBe(false);
    expect(untouchedStarterPage({ status: "published", body: "<p>x</p>" }, "<p>x</p>")).toBe(false);
  });

  it("gives up to three homepage shapes made of the starter's own sections, each one different", () => {
    for (const id of STARTER_SITES) {
      for (const sells of ["clothing", "hair"]) {
        const design = started(id, sells);
        const shapes = homeShapes(design, sells);
        expect(shapes[0].id, id).toBe("designed");
        expect(currentHomeShape(design, shapes), `${id} ${sells}`).toBe("designed");
        const orders = shapes.map((s) => s.sections.map((x) => x.type).join(","));
        expect(new Set(orders).size, id).toBe(orders.length);
        for (const shape of shapes) {
          const next = applyHomeShape(design, shape, getSectionMeta as any);
          expect(currentHomeShape(next, shapes), `${id} ${shape.id}`).toBe(shape.id);
          expect(home(next).every((s: any) => s.sample === true), id).toBe(true);
        }
      }
    }
  });
});

describe("Make it yours: words and what's left", () => {
  it("puts the owner's words on the homepage opening", () => {
    const design = started("starter-gallery");
    const next = withOpeningWords(design, { intro: "Small-batch ceramics from our river studio." });
    expect(home(next)[0].settings.body).toBe("Small-batch ceramics from our river studio.");
    const titled = withOpeningWords(started("aurel-editorial"), { headline: "Bags for every day", intro: "Leather goods, made slowly." });
    expect(home(titled)[0].settings).toMatchObject({ title: "Bags for every day", body: "Leather goods, made slowly.", accentWord: "" });
    expect(withOpeningWords(design, { intro: "  " })).toBe(design);
  });

  it("narrows the checklist to four things", () => {
    const design = started("starter-workshop", "lessons");
    const items = nextFour({ design, sells: "lessons", hasOwnProducts: false, phoneChecked: true, published: false });
    expect(items.map((i) => i.id)).toEqual(["photos", "products", "phone", "publish"]);
    expect(items[0].done).toBe(false);
    expect(items[1]).toMatchObject({ title: "Add your services", go: { kind: "admin", hash: "#bookings" } });
    expect(items[2].done).toBe(true);
    expect(nextFour({ design: {}, hasOwnProducts: true, phoneChecked: false, published: true }).filter((i) => i.done).map((i) => i.id)).toEqual(["photos", "products", "publish"]);
  });
});
