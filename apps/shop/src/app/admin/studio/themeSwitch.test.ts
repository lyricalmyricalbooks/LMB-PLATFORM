// Themes › Use this look reports which of the press's own edits carried over (plan 2.12).
import { describe, expect, it } from "vitest";
import { defaultSettings } from "../defaultSettings";
import { THEME_LIBRARY } from "./themeLibrary";
import { themedDesign } from "./themeLook";
import { applyLook, bringBack, lookSignature, ownEdits, resetToLook, switchSummary, themeSwitchReport, updatedTheme, updateLookKeepingEdits } from "./themeSwitch";

const BASE = defaultSettings().design;
const theme = (id: string): any => THEME_LIBRARY.find((t: any) => t.id === id);
const sw = (before: any, id: string) => {
  const after = themedDesign(theme(id), before);
  return { after, report: themeSwitchReport(before, after, BASE, theme(id)) };
};

describe("theme switch report", () => {
  it("reports nothing when the press hadn't changed anything, from the start or from another look", () => {
    expect(sw(BASE, "press-broadsheet").report).toMatchObject({ kept: [], replaced: [] });
    const imprint = themedDesign(theme("press-imprint"), BASE);
    const { report } = sw(imprint, "press-broadsheet");
    expect(report.kept).toEqual([]);
    expect(report.replaced).toEqual([]);
    expect(switchSummary(report)).toBe("You hadn't changed any style settings, so “Broadsheet” replaced nothing of yours.");
  });

  it("keeps edits the new look doesn't set and names the ones it replaced, in Studio's words", () => {
    const before = { ...themedDesign(theme("press-imprint"), BASE), footerColumnGap: 120, primaryColor: "#123456", copy: { footerCopyright: "© us", shopTitle: "Ours" } };
    const { after, report } = sw(before, "press-broadsheet");
    expect(report.kept.map(i => i.key)).toEqual(["footerColumnGap"]);
    expect(report.replaced.map(i => i.key)).toEqual(["primaryColor"]);
    expect(report.replaced[0]).toMatchObject({ before: "#123456", after: after.primaryColor });
    expect(report.replaced[0].label).toMatch(/› Accent$/);
    expect(report.wordsKept).toBe(2);
    expect(switchSummary(report)).toBe("1 of your style changes carried over; 1 was replaced by “Broadsheet”.");
  });

  it("counts a page-only setting the look cleared, and Bring back puts edits back where they were", () => {
    const before = { ...BASE, primaryColor: "#123456", productPage: { ...(BASE.productPage || {}), headerBg: "#abcdef" } };
    const { after, report } = sw(before, "press-imprint");
    const page = report.replaced.find(i => i.surface === "productPage");
    expect(page).toMatchObject({ key: "headerBg", before: "#abcdef" });
    expect(page!.label).toMatch(/\(Book page only\)$/);
    const restored = bringBack(after, report.replaced);
    expect(restored.primaryColor).toBe("#123456");
    expect(restored.productPage.headerBg).toBe("#abcdef");
    // Everything else stays as the new look set it.
    expect(restored.headingFont).toBe(after.headingFont);
  });

  it("stores the look apart from the press's edits, lists the edits and resets them to the look (plan 3.5)", () => {
    const zine = theme("press-zine");
    const applied = applyLook(BASE, zine);
    expect(applied.themeBase).toMatchObject({ id: "press-zine", name: "Zine", sig: lookSignature(zine) });
    expect(applied.themeBase.look.themeLibraryPreset).toBeUndefined();
    expect(applied.headingFont).toBe("Archivo Black");
    expect(ownEdits(applied, BASE)).toEqual([]);
    expect(updatedTheme(applied)).toBeNull();

    const mine = { ...applied, headingFont: "Oswald", footerColumnGap: 120, productPage: { ...(applied.productPage || {}), headerBg: "#abcdef" } };
    const edits = ownEdits(mine, BASE);
    expect(edits.map(e => `${e.surface || "all"}:${e.key}`).sort()).toEqual(["all:footerColumnGap", "all:headingFont", "productPage:headerBg"]);
    expect(edits.find(e => e.key === "headingFont")).toMatchObject({ before: "Oswald", after: "Archivo Black" });
    const reset = resetToLook(mine, edits);
    expect(reset.headingFont).toBe("Archivo Black");
    expect(reset.productPage?.headerBg).toBeUndefined();
    expect(ownEdits(reset, BASE)).toEqual([]);
  });

  it("measures a switch against the stored look, and carries edits onto a newer version of the same theme", () => {
    const zine = theme("press-zine");
    // The shop applied an older Zine (a different accent and catalog heading), then changed the title font.
    const older = { ...zine, global: { ...zine.global, catalogHeading: "Old issues", primaryColor: "#aa0055" } };
    const mine = { ...applyLook(BASE, older), headingFont: "Oswald" };
    expect(ownEdits(mine, BASE).map(e => e.key)).toEqual(["headingFont"]);
    expect(updatedTheme(mine)?.id).toBe("press-zine");
    const updated = updateLookKeepingEdits(mine, BASE, zine);
    expect(updated.catalogHeading).toBe(zine.global.catalogHeading);
    expect(updated.primaryColor).toBe(applyLook(BASE, zine).primaryColor);
    expect(updated.headingFont).toBe("Oswald");
    expect(updatedTheme(updated)).toBeNull();
    // Switching from the stored look reports only the press's own edit.
    const { report } = sw(updated, "press-index");
    expect(report.replaced.map(i => i.key)).toEqual(["headingFont"]);
  });

  it("gives the plain summary for kept-only switches", () => {
    const { report } = sw({ ...BASE, footerColumnGap: 120, wordmarkSize: 3.2 }, "press-broadsheet");
    expect(switchSummary(report)).toBe("2 of your style changes carried over; “Broadsheet” replaced none of them.");
  });
});
