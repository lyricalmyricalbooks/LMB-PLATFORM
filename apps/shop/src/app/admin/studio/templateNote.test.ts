import { describe, expect, it } from "vitest";
import { TEMPLATE_DETAIL_NAMES, TEMPLATE_ONLY_KEYS, templateDetailsLine, templateDetailsSet, templateOnlyNote } from "./templateNote";
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

  it("lists the template details a press set, for Reset template details", () => {
    expect(templateDetailsSet({ templateCardTilt: 2, templateOutlineWidth: 0, templateHeadingCase: "", buttonRadius: 4 }).sort()).toEqual(["templateCardTilt", "templateOutlineWidth"]);
    expect(templateDetailsSet(null)).toEqual([]);
  });

  it("name what Reset template details would clear", () => {
    expect(Object.keys(TEMPLATE_DETAIL_NAMES).sort()).toEqual([...TEMPLATE_ONLY_KEYS].sort());
    expect(templateDetailsLine({})).toBeNull();
    expect(templateDetailsLine({ templateCardTilt: 2 })).toBe("You've changed card tilt.");
    expect(templateDetailsLine({ templateCardTilt: 2, templateFrameWidth: 4 })).toBe("You've changed photo frames and card tilt.");
    expect(templateDetailsLine({ templateHeadingCase: "none", templateOutlineWidth: 2, templateRuleWidth: 1, templateCardTilt: 2 }))
      .toBe("You've changed heading capitals, outline width and 2 more.");
  });
});
