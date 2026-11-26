import { describe, expect, it } from "vitest";
import { STARTER_STYLES, STYLED_LOOKS, styledName, stylesFor, withStyle } from "./starterStyles";
import { THEME_LIBRARY } from "./themeLibrary";
import { applyLook, updatedTheme } from "./themeSwitch";
import { offeredStyles, STARTER_SITES } from "../lookGallery";

const theme = (id: string) => (THEME_LIBRARY as any[]).find((t) => t.id === id);

describe("starter styles (next starters plan phase 2)", () => {
  it("gives every starter three styles, its own first, with unique ids", () => {
    for (const id of STARTER_SITES) {
      const styles = stylesFor(id);
      expect(styles.length, id).toBe(3);
      expect(new Set(styles.map((s) => s.id)).size, id).toBe(3);
      expect(styles[0].global, `${id}: the first style is the starter as it ships`).toBeUndefined();
      expect(styles[0].sections).toBeUndefined();
    }
    expect(Object.keys(STARTER_STYLES).sort()).toEqual([...STARTER_SITES].sort());
  });

  it("leaves the starter unchanged in its own style or an unknown one", () => {
    const aurel = theme("aurel-editorial");
    expect(withStyle(aurel, "cobalt")).toBe(aurel);
    expect(withStyle(aurel, "nope")).toBe(aurel);
    expect(withStyle(aurel, undefined)).toBe(aurel);
  });

  it("lays a style's colours over the look and its patches over every section of that type", () => {
    const slow = theme("juniper-slow-season");
    const sage = withStyle(slow, "sage") as any;
    expect(sage.id).toBe(slow.id);
    expect(sage.styleId).toBe("sage");
    expect(styledName(sage)).toBe(`${slow.name} Sage`);
    expect(sage.global.primaryColor).toBe("#4f6b4a");
    const intro = sage.content.sections.heroPage.find((s: any) => s.type === "BigIntroSection");
    expect(intro.settings.bgColor).toBe("#e9ecdf");
    expect(intro.settings.title).toBe("The long\nwinter");
    // The library's own starter is never changed.
    expect(slow.content.sections.heroPage.find((s: any) => s.type === "BigIntroSection").settings.bgColor).toBe("#f2eddf");
  });

  it("is checked by the theme checks in every style but the starter's own", () => {
    expect(STYLED_LOOKS.map((t) => t.checkId).sort()).toEqual(
      Object.entries(STARTER_STYLES).flatMap(([id, s]) => s.slice(1).map((x) => `${id}/${x.id}`)).sort());
  });

  it("remembers the style it was applied in, so its own colours never read as an update", () => {
    const night = withStyle(theme("juniper-catalogue"), "night");
    const design = { ...applyLook({}, night), themeLibraryPreset: "juniper-catalogue" };
    expect(design.themeBase.style).toBe("night");
    expect(design.themeBase.name).toBe("Catalogue Night");
    expect(updatedTheme(design)).toBeNull();
    const own = { ...applyLook({}, theme("juniper-catalogue")), themeLibraryPreset: "juniper-catalogue" };
    expect(own.themeBase.style).toBeUndefined();
    expect(updatedTheme(own)).toBeNull();
  });

  it("lets the control room hide a style, never the starter's own", () => {
    expect(offeredStyles("aurel-editorial").map((s) => s.id)).toEqual(["cobalt", "sand", "night"]);
    expect(offeredStyles("aurel-editorial", { hiddenStyles: ["aurel-editorial/sand", "aurel-editorial/cobalt"] }).map((s) => s.id)).toEqual(["cobalt", "night"]);
    expect(offeredStyles("press-atlas")).toEqual([]);
  });
});
