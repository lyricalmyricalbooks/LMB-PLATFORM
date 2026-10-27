import { describe, expect, it } from "vitest";
import { applyCanvasAction, moveBlockTo, moveSectionTo, updateSectionsById, writeSections } from "./studioWorkflow";
import { targetKey } from "./studioModel";

const key = () => "blocks";
const design = () => ({
  globalSections: [{ id: "g1", type: "Newsletter", settings: {} }],
  heroPage: { sections: [
    { id: "a", type: "Row", settings: { blocks: [{ id: "b1", title: "one" }, { id: "b2", title: "two", children: [{ id: "c1" }] }] } },
    { id: "b", type: "Text", settings: {} },
    { id: "c", type: "Row", settings: { blocks: [{ id: "x1" }] } },
  ] },
  "page:about": { title: "keep me" },
});
const ids = (list: any[]) => list.map(s => s.id);

describe("moving sections", () => {
  it("moves a section to another page, keeping that page's other settings", () => {
    const next = moveSectionTo(design(), "b", "page:about");
    expect(ids(next.heroPage.sections)).toEqual(["a", "c"]);
    expect(ids(next["page:about"].sections)).toEqual(["b"]);
    expect(next["page:about"].title).toBe("keep me");
  });
  it("moves a section into the every-page list at a position", () => {
    const next = moveSectionTo(design(), "a", "globalSections", 0);
    expect(ids(next.globalSections)).toEqual(["a", "g1"]);
    expect(ids(next.heroPage.sections)).toEqual(["b", "c"]);
  });
  it("reorders on the same page, and ignores no-op or unknown moves", () => {
    expect(ids(moveSectionTo(design(), "c", "heroPage", 0).heroPage.sections)).toEqual(["c", "a", "b"]);
    const d = design();
    expect(moveSectionTo(d, "a", "heroPage", 0)).toBe(d);
    expect(moveSectionTo(d, "nope", "heroPage", 0)).toBe(d);
  });
  it("keeps the preview's drag-to-reorder behaviour", () => {
    const next = applyCanvasAction(design(), { type: "SECTION_MOVE", sectionId: "a", beforeId: "c" }, key);
    expect(ids(next.heroPage.sections)).toEqual(["b", "a", "c"]);
  });
  it("updates or removes sections wherever they live", () => {
    const next = updateSectionsById(design(), ["g1", "b"], s => s.id === "b" ? null : { ...s, visible: false });
    expect(next.globalSections[0].visible).toBe(false);
    expect(ids(next.heroPage.sections)).toEqual(["a", "c"]);
  });
});

describe("moving blocks between sections", () => {
  it("moves a block and its children to another section of the same kind", () => {
    const r = moveBlockTo(design(), { fromSectionId: "a", blockId: "b2", toSectionId: "c", beforeId: "x1" }, key);
    expect(r.error).toBeUndefined();
    const [a, , c] = r.design.heroPage.sections;
    expect(a.settings.blocks.map((b: any) => b.id)).toEqual(["b1"]);
    expect(c.settings.blocks.map((b: any) => b.id)).toEqual(["b2", "x1"]);
    expect(c.settings.blocks[0].children[0].id).toBe("c1");
  });
  it("appends when there is no block to drop before", () => {
    const r = moveBlockTo(design(), { fromSectionId: "a", blockId: "b1", toSectionId: "c" }, key);
    expect(r.design.heroPage.sections[2].settings.blocks.map((b: any) => b.id)).toEqual(["x1", "b1"]);
  });
  it("refuses moves that would break the block", () => {
    const d = design();
    expect(moveBlockTo(d, { fromSectionId: "a", blockId: "b1", toSectionId: "b" }, key)).toMatchObject({ design: d, error: expect.stringMatching(/same kind/) });
    expect(moveBlockTo(d, { fromSectionId: "a", blockId: "b2", toSectionId: "a", beforeId: "c1" }, key).error).toMatch(/inside itself/);
    expect(moveBlockTo(d, { fromSectionId: "a", blockId: "zz", toSectionId: "c" }, key).error).toBeTruthy();
  });
  it("respects the nesting limit", () => {
    const deep = design();
    deep.heroPage.sections[2].settings.blocks = [{ id: "x1", children: [{ id: "x2", children: [{ id: "x3" }] }] }] as any;
    const r = moveBlockTo(deep, { fromSectionId: "a", blockId: "b2", toSectionId: "c", beforeId: "x3" }, key);
    expect(r.error).toMatch(/levels deep/);
    expect(r.design).toBe(deep);
  });
  it("reorders within the same section like before", () => {
    const r = moveBlockTo(design(), { fromSectionId: "a", blockId: "b2", toSectionId: "a", beforeId: "b1" }, key);
    expect(r.design.heroPage.sections[0].settings.blocks.map((b: any) => b.id)).toEqual(["b2", "b1"]);
  });
});

describe("section groups (2.2)", () => {
  it("moves sections between the header, footer and pop-up groups and pages", () => {
    const d = { ...design(), headerSections: [{ id: "h1", type: "PromoStrip", settings: {} }] };
    const toPopup = moveSectionTo(d, "g1", "overlaySections");
    expect(ids(toPopup.overlaySections)).toEqual(["g1"]);
    expect(ids(toPopup.globalSections)).toEqual([]);
    const toHeader = moveSectionTo(toPopup, "b", "headerSections", 0);
    expect(ids(toHeader.headerSections)).toEqual(["b", "h1"]);
    expect(ids(toHeader.heroPage.sections)).toEqual(["a", "c"]);
    const back = moveSectionTo(toHeader, "h1", "heroPage", 0);
    expect(ids(back.heroPage.sections)).toEqual(["h1", "a", "c"]);
    expect(ids(back.headerSections)).toEqual(["b"]);
  });
  it("writes group lists as plain arrays and page lists inside their surface", () => {
    expect(writeSections({}, "overlaySections", [{ id: "x" } as any])).toEqual({ overlaySections: [{ id: "x" }] });
    expect(writeSections({ heroPage: { title: "t" } }, "heroPage", [])).toEqual({ heroPage: { title: "t", sections: [] } });
  });
  it("bulk-edits sections in any group", () => {
    const d = { ...design(), overlaySections: [{ id: "p1", type: "Newsletter", settings: {} }] };
    const next = updateSectionsById(d, ["p1", "g1"], s => ({ ...s, visible: false }));
    expect(next.overlaySections[0].visible).toBe(false);
    expect(next.globalSections[0].visible).toBe(false);
  });
  it("targets the right list for each group", () => {
    expect(targetKey({ kind: "global" })).toBe("globalSections");
    expect(targetKey({ kind: "global", group: "overlaySections" })).toBe("overlaySections");
  });
});
