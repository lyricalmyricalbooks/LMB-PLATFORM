import { describe, expect, it } from "vitest";
import { DEFAULT_COLOR_SCHEMES, usesAllRoles } from "../../features/site/colorSchemes";
import {
  addScheme, deleteScheme, duplicateScheme, editableSchemes, moveScheme, newSchemeId, renameScheme, schemeUsage, setSchemeRole,
  upgradeSchemeIn, usageText, writeSchemes,
} from "./colorSchemeOps";
import { STYLE_GROUPS, schemeFieldOptions, NO_SCHEME } from "./styleSchema";

const legacy = [
  { id: "a", name: "Light", background: "#ffffff", text: "#111111", accent: "#A855F7" },
  { id: "b", name: "Dark", background: "#0a0a0a", text: "#ffffff", accent: "#A855F7" },
];
const design = () => ({
  colorSchemes: legacy,
  heroPage: { colorSchemes: legacy.slice(0, 1), sections: [{ id: "s1", type: "RichTextSection", settings: { colorSchemeId: "b" } }] },
  storefront: { sections: [{ id: "s2", type: "HeroSection", settings: { colorSchemeId: "a" } }] },
  "page:about": { sections: [{ id: "s3", type: "RichTextSection", settings: { colorSchemeId: "b", heading: "Hi" } }] },
  globalSections: [{ id: "g1", type: "NewsletterSection", settings: { colorSchemeId: "b" } }],
  sectionPresets: [{ id: "p1", name: "Saved", section: { id: "x", type: "RichTextSection", settings: { colorSchemeId: "b" } } }],
  elementSchemes: { cards: "b", cartDrawer: "a" },
});

describe("colour scheme edits", () => {
  it("edits the design's own schemes, or a copy of the starters", () => {
    expect(editableSchemes({})).toEqual(DEFAULT_COLOR_SCHEMES);
    expect(editableSchemes({})).not.toBe(DEFAULT_COLOR_SCHEMES);
    expect(editableSchemes(design()).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("saves for every page, clearing older page copies", () => {
    const next = writeSchemes(design(), legacy.slice(1));
    expect(next.colorSchemes.map((s: any) => s.id)).toEqual(["b"]);
    expect(next.heroPage.colorSchemes).toBeUndefined();
    expect(next.heroPage.sections).toHaveLength(1);
  });

  it("adds, duplicates, renames and reorders", () => {
    const id = newSchemeId(legacy);
    expect(legacy.some((s) => s.id === id)).toBe(false);
    const added = addScheme(legacy, id);
    expect(added.at(-1)).toMatchObject({ id, name: "New scheme", v: 2, background: "#ffffff" });
    expect(addScheme(added, "z").at(-1)!.name).toBe("New scheme 2");
    const dup = duplicateScheme(legacy, "a", "a2");
    expect(dup.map((s) => s.id)).toEqual(["a", "a2", "b"]);
    expect(dup[1]).toMatchObject({ name: "Light copy", background: "#ffffff" });
    expect(renameScheme(legacy, "b", "Night")[1].name).toBe("Night");
    expect(moveScheme(legacy, "b", -1).map((s) => s.id)).toEqual(["b", "a"]);
    expect(moveScheme(legacy, "a", -1)).toBe(legacy);
  });

  it("upgrades an older scheme on its first colour edit, keeping its stored colours", () => {
    const next = setSchemeRole(legacy, "a", "buttonBg", "#123456");
    expect(next[0]).toMatchObject({ v: 2, buttonBg: "#123456", background: "#ffffff", text: "#111111" });
    expect(usesAllRoles(next[1])).toBe(false);
    expect(upgradeSchemeIn(legacy, "b")[1]).toMatchObject({ v: 2, background: "#0a0a0a", surface: "#0a0a0a" });
    // Renaming alone never changes how a scheme looks.
    expect(usesAllRoles(renameScheme(legacy, "a", "X")[0])).toBe(false);
  });

  it("counts every section and part of the shop that uses a scheme", () => {
    const u = schemeUsage(design(), "b");
    expect(u).toEqual({ sections: 4, elements: ["Book cards"] });
    expect(usageText(u)).toBe("4 sections, book cards");
    expect(usageText(schemeUsage(design(), "zzz"))).toBe("");
  });

  it("deletes a scheme, sending everything that used it back to the theme colours", () => {
    const next = deleteScheme(design(), "b");
    expect(next.colorSchemes.map((s: any) => s.id)).toEqual(["a"]);
    expect(schemeUsage(next, "b")).toEqual({ sections: 0, elements: [] });
    expect(next.heroPage.sections[0].settings).toEqual({});
    expect(next["page:about"].sections[0].settings).toEqual({ heading: "Hi" });
    expect(next.storefront.sections[0].settings.colorSchemeId).toBe("a");
    expect(next.elementSchemes).toEqual({ cartDrawer: "a" });
    // Unrelated parts of the design are the same objects.
    const d = design();
    expect(deleteScheme(d, "a").globalSections).toBe(d.globalSections);
  });

  it("never deletes the last scheme", () => {
    const one = { colorSchemes: legacy.slice(0, 1) };
    expect(deleteScheme(one, "a")).toBe(one);
  });
});

describe("Theme settings › Colour schemes controls", () => {
  const group = STYLE_GROUPS.find((g) => g.id === "schemes")!;
  it("has a scheme choice for book cards, the buy card, the bag, the header and the footer", () => {
    expect(group.fields.map((f) => f.key)).toEqual(["elementSchemes.cards", "elementSchemes.buyCard", "elementSchemes.cartDrawer", "elementSchemes.header", "elementSchemes.footer"]);
  });
  it("lists the current schemes as choices", () => {
    const f = schemeFieldOptions(group.fields[0], legacy) as any;
    expect(f.options).toEqual([NO_SCHEME, { value: "a", label: "Light" }, { value: "b", label: "Dark" }]);
    const other = STYLE_GROUPS.find((g) => g.id === "buttons")!.fields[0];
    expect(schemeFieldOptions(other, legacy)).toBe(other);
  });
});
