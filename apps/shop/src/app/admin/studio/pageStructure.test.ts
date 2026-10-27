import { describe, expect, it } from "vitest";
import { buildPageStructure, primaryTarget, readStructure, structureKeys, structureLabel, structurePath, type StructureNode } from "./pageStructure";

const node = (key: string, extra: Partial<StructureNode> = {}): StructureNode => ({
  key, label: "", target: "", region: "", section: "", parent: "", zone: "main", hidden: false, count: 1, ...extra,
});

// Shaped like a real storefront scan: one root wrapper, a header, a section, built-in parts, a footer, the bag.
const SCAN: StructureNode[] = [
  node("t:style:colors|style:type|Page background", { label: "Page background", target: "style:colors|style:type" }),
  node("t:style:header|Header", { label: "Header", target: "style:header|copy:Header", zone: "header", parent: "t:style:colors|style:type|Page background" }),
  node("t:style:logo|Logo", { label: "Logo", target: "style:logo", zone: "header", parent: "t:style:header|Header" }),
  node("s:hero", { section: "hero", parent: "t:style:colors|style:type|Page background" }),
  node("t:style:hero-inner|Inner", { label: "Inner", target: "style:x", parent: "s:hero" }),
  node("t:style:catalog|Catalog heading", { label: "Catalog heading", target: "copy:Catalog|style:catalog", parent: "t:style:colors|style:type|Page background" }),
  node("t:style:products|Product grid", { label: "Product grid", target: "style:products", parent: "t:style:colors|style:type|Page background", count: 12 }),
  node("s:news", { section: "news", parent: "t:style:colors|style:type|Page background" }),
  node("r:footerPanel", { region: "footerPanel", label: "Footer", target: "style:footer", zone: "footer", parent: "t:style:colors|style:type|Page background" }),
  node("t:copy:Footer|Footer links", { label: "Footer links", target: "menus:footer", zone: "footer", parent: "r:footerPanel" }),
  node("t:style:cartDrawer|Cart drawer", { label: "Cart drawer", target: "style:cartDrawer|copy:Cart", zone: "overlay", parent: "t:style:colors|style:type|Page background" }),
];

describe("page structure", () => {
  it("groups the page into header, body, footer and pop-overs, in page order", () => {
    const s = buildPageStructure(SCAN);
    expect(s.header.map(i => i.label)).toEqual(["Header"]);
    expect(s.header[0].children.map(i => i.label)).toEqual(["Logo"]);
    expect(s.main.map(i => i.label)).toEqual(["Catalog heading", "Product grid"]);
    expect(s.footer[0].label).toBe("Footer");
    expect(s.footer[0].children.map(i => i.label)).toEqual(["Footer links"]);
    expect(s.overlay.map(i => i.label)).toEqual(["Cart drawer"]);
    expect(s.sections).toEqual(["hero", "news"]);
  });

  it("treats the whole-page wrapper as a page setting, not a container", () => {
    const s = buildPageStructure(SCAN);
    expect(s.page.map(i => i.label)).toEqual(["Page background"]);
    expect(s.page[0].children).toEqual([]);
  });

  it("leaves parts drawn inside a section to the section", () => {
    const keys = structureKeys([...buildPageStructure(SCAN).main, ...buildPageStructure(SCAN).page]);
    expect(keys).not.toContain("t:style:hero-inner|Inner");
  });

  it("keeps repeated parts as one row with a count", () => {
    expect(buildPageStructure(SCAN).main[1].count).toBe(12);
  });

  it("keeps a pop-over opened from the header out of the header", () => {
    const s = buildPageStructure([
      node("t:h|Header", { label: "Header", zone: "header" }),
      node("t:s|Search", { label: "Search overlay", zone: "overlay", parent: "t:h|Header" }),
    ]);
    expect(s.header.map(i => i.label)).toEqual(["Header"]);
    expect(s.header[0].children).toEqual([]);
    expect(s.overlay.map(i => i.label)).toEqual(["Search overlay"]);
  });

  it("validates what the preview sends", () => {
    expect(readStructure("nope")).toBeNull();
    const read = readStructure([{ key: "x:bad" }, null, { key: "r:a", zone: "moon", count: "3", hidden: "yes" }])!;
    expect(read).toHaveLength(1);
    expect(read[0]).toMatchObject({ key: "r:a", zone: "main", count: 3, hidden: false });
  });

  it("names unlabelled parts readably and picks the style target first", () => {
    expect(structureLabel({ label: "", region: "footerPanel", target: "" })).toBe("Footer Panel");
    expect(primaryTarget("copy:Footer|style:footer")).toBe("style:footer");
    expect(primaryTarget("menus:footer|copy:Footer")).toBe("menus:footer");
  });

  it("gives each part a breadcrumb of where it sits", () => {
    const s = buildPageStructure(SCAN);
    expect(structurePath(s, "t:style:logo|Logo")).toEqual(["Header", "Header"]);
    expect(structurePath(s, "t:copy:Footer|Footer links")).toEqual(["Footer", "Footer"]);
    expect(structurePath(s, "t:style:products|Product grid")).toEqual(["Page"]);
    expect(structurePath(s, "missing")).toEqual([]);
    expect(structurePath(null, "x")).toEqual([]);
  });
});
