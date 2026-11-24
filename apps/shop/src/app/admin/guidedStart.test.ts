import { describe, expect, it } from "vitest";
import { shortlist, styleForFeel, withLogoColours } from "./guidedStart";
import { libraryLook, STARTER_SITES } from "./lookGallery";
import { applyLook, updatedTheme } from "./studio/themeSwitch";
import { contrastRatio } from "../features/site/colorSchemes";

describe("guided start (next starters plan phase 3)", () => {
  it("gives every offered starter, in the control room's order, in the style that answers the feel", () => {
    const calm = shortlist({ feel: "calm" });
    expect(calm.map((e) => e.theme.id)).toEqual(STARTER_SITES);
    expect(calm.map((e) => e.name)).toEqual(["Slow Season Sage", "Catalogue Blueprint", "Aurel Sand"]);
    expect(shortlist({ feel: "bold" }).map((e) => e.name)).toEqual(["Slow Season Night", "Catalogue", "Aurel Night"]);
    const order = ["aurel-editorial", "juniper-catalogue", "juniper-slow-season"];
    const choice = { order, known: order, hidden: ["juniper-catalogue"], hiddenStyles: ["aurel-editorial/night"] };
    // A hidden starter is left out; a hidden style falls back to the starter's own.
    expect(shortlist({ feel: "bold", choice }).map((e) => e.name)).toEqual(["Aurel", "Slow Season Night"]);
    expect(styleForFeel("aurel-editorial", "classic")?.id).toBe("cobalt");
  });

  it("puts a logo's main colour in as the accent, readable on the style's own page, and keeps the page", () => {
    const sand = shortlist({ feel: "calm", colours: ["#ffffff", "#ffd60a"] }).find((e) => e.theme.id === "aurel-editorial")!.theme as any;
    expect(sand.global.backgroundColor).toBe("#efe7da");
    expect(contrastRatio(sand.global.primaryColor, sand.global.backgroundColor)).toBeGreaterThanOrEqual(3);
    expect(sand.global.primaryColor).not.toBe("#9a4f24");
    // The announcement bar was the accent, so it follows the logo, with readable words.
    expect(sand.global.announcementBg).toBe(sand.global.primaryColor);
    expect(contrastRatio(sand.global.announcementColor, sand.global.announcementBg)).toBeGreaterThanOrEqual(4.5);
    // No readable colour in the logo: the style stays as it is.
    const plain = libraryLook("aurel-editorial");
    expect(withLogoColours(plain, [])).toBe(plain);
    expect(withLogoColours(plain, null)).toBe(plain);
  });

  it("measures later starter updates against the starter, never the logo's colour", () => {
    const [entry] = shortlist({ feel: "calm", colours: ["#d62828"] });
    const design = { ...applyLook({}, entry.theme), themeLibraryPreset: entry.theme.id };
    expect(design.themeBase.style).toBe("sage");
    expect(design.primaryColor).toBe((entry.theme as any).global.primaryColor);
    expect(updatedTheme(design)).toBeNull();
  });
});
