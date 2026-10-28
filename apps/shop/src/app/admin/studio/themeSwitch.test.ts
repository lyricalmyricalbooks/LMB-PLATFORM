// Themes › Use this look reports which of the press's own edits carried over (plan 2.12).
import { describe, expect, it } from "vitest";
import { defaultSettings } from "../defaultSettings";
import { THEME_LIBRARY } from "./themeLibrary";
import { themedDesign } from "./themeLook";
import { bringBack, switchSummary, themeSwitchReport } from "./themeSwitch";

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

  it("gives the plain summary for kept-only switches", () => {
    const { report } = sw({ ...BASE, footerColumnGap: 120, wordmarkSize: 3.2 }, "press-broadsheet");
    expect(switchSummary(report)).toBe("2 of your style changes carried over; “Broadsheet” replaced none of them.");
  });
});
