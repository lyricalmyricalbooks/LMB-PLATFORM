import { describe, expect, it } from "vitest";
import { outlineMatches, filterSettingGroups } from "./studioNavigation";

describe("Studio navigation", () => {
  it("finds nested block content without losing the owning section", () => {
    const section = { type: "CompositionSection", settings: { blocks: [{ title: "Group", children: [{ body: "A rare poetry collection" }] }] } };
    expect(outlineMatches(section, "poetry")).toBe(true);
    expect(outlineMatches(section, "unrelated")).toBe(false);
    expect(outlineMatches(section, " ")).toBe(true);
  });
  it("searches field labels and group names across categories", () => {
    const groups = [{ id: "color", title: "Colors", fields: [{ key: "ink", label: "Text color" }] }, { id: "font", title: "Typography", fields: [{ key: "heading", label: "Heading font" }] }];
    expect(filterSettingGroups(groups, "heading", "color").map(g => g.id)).toEqual(["font"]);
    expect(filterSettingGroups(groups, "", "color").map(g => g.id)).toEqual(["color"]);
    expect(filterSettingGroups(groups, " typography ", null)[0].fields).toHaveLength(1);
    expect(filterSettingGroups(groups, "missing", null)).toEqual([]);
  });
});
