import { describe, expect, it } from "vitest";
import { liveLookName, pageRows, publishedLine, waitingWhere } from "./designPageWords";

const item = (area: string) => ({ id: area, area, label: "x", change: "changed" as const, restore: { kind: "path" as const, path: "x" } });

describe("Design page words", () => {
  it("says when the look went live, with the year only when it isn't this one", () => {
    const now = new Date(2026, 10, 11);
    expect(publishedLine(new Date(2026, 10, 6).toISOString(), now)).toBe("Published 6 Nov");
    expect(publishedLine(new Date(2025, 0, 2).toISOString(), now)).toBe("Published 2 Jan 2025");
    expect(publishedLine(undefined, now)).toBe("");
    expect(publishedLine("not a date", now)).toBe("");
  });

  it("names the live look by the theme it started from", () => {
    expect(liveLookName({ themeBase: { id: "harbour", name: "Harbour" } })).toBe("Harbour");
    expect(liveLookName({})).toBe("Your own");
    expect(liveLookName(null)).toBe("Your own");
  });

  it("says where the waiting changes are, once per place", () => {
    expect(waitingWhere([item("Home page"), item("Theme settings · Colors"), item("Home page"), item("Footer")])).toBe("Home page, theme settings, footer");
    expect(waitingWhere([item("A"), item("B"), item("C"), item("D")])).toBe("A, b, c and more");
    expect(waitingWhere([])).toBe("");
  });

  it("lists Home first, then the shop's pages in order, live or draft", () => {
    const rows = pageRows([
      { id: "e", title: "Events", slug: "events", status: "draft", order: 2 },
      { id: "a", title: "About", slug: "about", status: "published", order: 1 },
      { id: "x", title: "No address" },
    ]);
    expect(rows.map((r) => [r.name, r.live, r.studio])).toEqual([["Home", true, "heroPage"], ["About", true, "page:about"], ["Events", false, "page:events"]]);
  });
});
