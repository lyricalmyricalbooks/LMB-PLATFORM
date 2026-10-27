import { describe, expect, it } from "vitest";
import { autoFitBlocks, autoFitSection, autoFitSections, autoFitRegions, flowGrids, phoneColumns, phoneHeadingSize, phonePadding, resetPhoneLayout } from "./autoMobile";
import type { Section, StudioBlock } from "./studioModel";

const block = (id: string, grid: any, extra: any = {}): StudioBlock => ({ id, type: "text", grid: { desktop: grid }, ...extra });
const comp = (items: StudioBlock[], extra: any = {}): Section => ({ id: "c", type: "CompositionSection", settings: { gridColumns: 12, items, ...extra } });

describe("phone sizing helpers", () => {
  it("auto-fits public regions while preserving explicit phone overrides", () => {
    const values = { wishlistGridColumns: 4, wishlistGridPadding: 80, wishlistTitleSize: 60, wishlistTitleMobileSize: 31 };
    expect(autoFitRegions(values).value).toMatchObject({ wishlistGridMobileColumns: 2, wishlistGridMobilePadding: 44 });
    expect(autoFitRegions(values).value).not.toHaveProperty("wishlistTitleMobileSize");
    expect(autoFitRegions(values, true).value.wishlistTitleMobileSize).toBe(36);
    expect(autoFitRegions({}).changes).toEqual([]);
  });
  it("scales padding down but never below 24 or above desktop", () => {
    expect(phonePadding(120)).toBe(68);
    expect(phonePadding(40)).toBe(24);
    expect(phonePadding(30)).toBe(24);
    expect(phonePadding(20)).toBe(20);
  });
  it("shrinks big headings only", () => {
    expect(phoneHeadingSize(80)).toBe(48);
    expect(phoneHeadingSize(30)).toBe(28);
    expect(phoneHeadingSize(24)).toBe(24);
  });
  it("picks phone columns by section kind", () => {
    expect(phoneColumns("FeatureGridSection", 3)).toBe(1);
    expect(phoneColumns("ProductGridSection", 3)).toBe(2);
    expect(phoneColumns("ProductGridSection", 5)).toBe(2);
    expect(phoneColumns("FeatureGridSection", 2)).toBeUndefined();
    expect(phoneColumns("FeatureGridSection", undefined as any)).toBeUndefined();
  });
});

describe("flowGrids", () => {
  const blocks = [
    block("b", { column: 7, span: 6, row: 1 }),
    block("a", { column: 1, span: 6, row: 1 }),
    block("c", { column: 1, span: 12, row: 2 }),
  ];
  it("stacks in reading order, one per row, full width on phone", () => {
    const g = flowGrids(blocks, 12, "mobile");
    expect(g.a).toEqual({ column: 1, span: 12, row: 1, rowSpan: 1 });
    expect(g.b.row).toBe(2);
    expect(g.c.row).toBe(3);
  });
  it("packs narrow blocks two-up and keeps wide ones full width on tablet", () => {
    const g = flowGrids(blocks, 12, "tablet");
    expect(g.a).toMatchObject({ column: 1, span: 6, row: 1 });
    expect(g.b).toMatchObject({ column: 7, span: 6, row: 1 });
    expect(g.c).toMatchObject({ column: 1, span: 12, row: 2 });
  });
  it("skips hidden blocks and blocks hidden at that size", () => {
    const g = flowGrids([block("a", { column: 1, span: 4, row: 1 }, { hidden: true }), block("b", { column: 1, span: 4, row: 1 }, { responsive: { mobile: { hidden: true } } }), block("c", { column: 1, span: 4, row: 2 })], 12, "mobile");
    expect(Object.keys(g)).toEqual(["c"]);
    expect(g.c.row).toBe(1);
  });
  it("flows blocks that have no desktop placement after the previous one", () => {
    const g = flowGrids([block("a", { column: 1, span: 4, row: 3 }), { id: "free", type: "text" }], 12, "mobile");
    expect(g.free.row).toBe(2);
  });
});

describe("autoFitBlocks", () => {
  const blocks = [block("a", { column: 1, span: 6, row: 1 }), block("b", { column: 7, span: 6, row: 1 })];
  it("fills tablet and phone placement without touching desktop or mutating input", () => {
    const before = JSON.stringify(blocks);
    const r = autoFitBlocks(blocks, 12);
    expect(JSON.stringify(blocks)).toBe(before);
    expect(r.value[0].grid!.desktop).toEqual({ column: 1, span: 6, row: 1 });
    expect(r.value[1].grid!.mobile).toEqual({ column: 1, span: 12, row: 2, rowSpan: 1 });
    expect(r.value[1].grid!.tablet).toMatchObject({ column: 7, span: 6, row: 1 });
  });
  it("keeps a device the owner already laid out unless overwrite is on", () => {
    const manual = [block("a", { column: 1, span: 6, row: 1 }, { grid: { desktop: { column: 1, span: 6, row: 1 }, mobile: { column: 1, span: 12, row: 5 } } }), blocks[1]];
    const kept = autoFitBlocks(manual, 12);
    expect(kept.value[0].grid!.mobile!.row).toBe(5);
    expect(kept.changes).toContain("Kept your own mobile layout");
    expect(autoFitBlocks(manual, 12, true).value[0].grid!.mobile!.row).toBe(1);
  });
});

describe("autoFitSection", () => {
  it("fills blank phone padding, heading and columns", () => {
    const s: Section = { id: "x", type: "FeatureGridSection", settings: { paddingTop: 120, paddingBottom: 100, headingSize: 72, columns: 4 } };
    const r = autoFitSection(s);
    expect(r.value).toEqual({ mobilePaddingTop: 68, mobilePaddingBottom: 56, mobileHeadingSize: 43, mobileColumns: 2 });
    expect(r.changes.length).toBe(4);
  });
  it("never overwrites the owner's own phone values unless asked", () => {
    const s: Section = { id: "x", type: "FeatureGridSection", settings: { paddingTop: 120, mobilePaddingTop: 10 } };
    expect(autoFitSection(s).value).toEqual({});
    expect(autoFitSection(s, true).value).toEqual({ mobilePaddingTop: 68 });
  });
  it("does nothing for a small, already phone-friendly section", () => {
    expect(autoFitSection({ id: "x", type: "HeroSection", settings: { paddingTop: 24, headingSize: 30, columns: 2 } }).value).toEqual({});
  });
  it("lays out a Flexible composition for phone and tablet", () => {
    const r = autoFitSection(comp([block("a", { column: 1, span: 6, row: 1 }), block("b", { column: 7, span: 6, row: 1 })]));
    expect(r.value.items[1].grid.mobile.row).toBe(2);
  });
  it("is idempotent", () => {
    const first = autoFitSection(comp([block("a", { column: 1, span: 6, row: 1 }), block("b", { column: 7, span: 6, row: 1 })]));
    const applied: Section = comp(first.value.items);
    expect(autoFitSection(applied).value).toEqual({});
  });
});

describe("autoFitSections / resetPhoneLayout", () => {
  it("returns the same list when nothing changes and counts touched sections", () => {
    const list: Section[] = [{ id: "a", type: "HeroSection", settings: {} }];
    expect(autoFitSections(list).value).toBe(list);
    const r = autoFitSections([{ id: "b", type: "FeatureGridSection", settings: { paddingTop: 100 } }, ...list]);
    expect(r.touched).toBe(1);
    expect(r.value[0].settings.mobilePaddingTop).toBe(56);
  });
  it("reset removes phone keys and tablet/phone grids but keeps desktop", () => {
    const fitted = autoFitSection(comp([block("a", { column: 1, span: 6, row: 1 })], { paddingTop: 100, mobilePaddingTop: 50 }));
    const section: Section = comp(fitted.value.items, { paddingTop: 100, mobilePaddingTop: 50 });
    const patch = resetPhoneLayout(section);
    expect(patch.mobilePaddingTop).toBeUndefined();
    expect("mobilePaddingTop" in patch).toBe(true);
    expect(patch.items[0].grid).toEqual({ desktop: { column: 1, span: 6, row: 1 } });
  });
});

it("resets new phone/tablet spacing overrides without clearing desktop spacing",()=>{
 const patch=resetPhoneLayout({id:"s",type:"CompositionSection",settings:{paddingLeft:40,mobilePaddingLeft:16,tabletPaddingRight:24,mobileGridGap:12,tabletGap:20}});
 expect(Object.keys(patch)).toEqual(expect.arrayContaining(["mobilePaddingLeft","tabletPaddingRight","mobileGridGap","tabletGap"]));
 expect(patch).not.toHaveProperty("paddingLeft");
});

it("keeps side spacing, tablet inheritance and zeroes when auto-fitting public regions", async () => {
  const { autoFitRegions } = await import("./autoMobile");
  const result = autoFitRegions({ wishlistTitlePaddingLeft: 0, wishlistTitleTabletPaddingRight: 80,
    wishlistTitleMobilePaddingBottom: 0, wishlistTitlePaddingBottom: 60 });
  expect(result.value.wishlistTitleMobilePaddingLeft).toBe(0);
  expect(result.value.wishlistTitleMobilePaddingRight).toBe(44);
  expect(result.value).not.toHaveProperty("wishlistTitleMobilePaddingBottom");
});

it("preserves an explicit phone padding shorthand instead of generating conflicting sides", () => {
  const result = autoFitRegions({ wishlistTitlePadding: 40, wishlistTitleMobilePadding: 8 });
  for (const side of ["Top", "Right", "Bottom", "Left"]) expect(result.value).not.toHaveProperty("wishlistTitleMobilePadding" + side);
  expect(autoFitRegions({ wishlistTitlePadding: 40, wishlistTitleMobilePadding: 8 }, true).value.wishlistTitleMobilePaddingTop).toBe(24);
});
