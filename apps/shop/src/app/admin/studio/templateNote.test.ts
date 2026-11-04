import { describe, expect, it } from "vitest";
import { TEMPLATE_ONLY_KEYS, templateOnlyNote } from "./templateNote";
import { STYLE_GROUPS } from "./styleSchema";

describe("template-only controls", () => {
  it("are the template group's own controls", () => {
    const group = STYLE_GROUPS.find((g) => g.id === "riso")!;
    const own = group.fields.map((f) => f.key).filter((k) => k.startsWith("template"));
    expect([...TEMPLATE_ONLY_KEYS].sort()).toEqual(own.sort());
  });

  it("say they draw nothing until a template is picked", () => {
    expect(templateOnlyNote("templateCardTilt", { themeStyle: "riso" })).toBe("Settings marked (templates) show only on a template, like Marquee. Print style is Riso Press.");
    expect(templateOnlyNote("templateCardTilt", {})).toContain("Print style is Standard.");
    expect(templateOnlyNote("templateCardTilt", { themeStyle: "market" })).toBeNull();
    expect(templateOnlyNote("buttonRadius", { themeStyle: "riso" })).toBeNull(); // shared controls work on every look
  });
});
