import { describe, expect, it } from "vitest";
import { applyGridMessage, cellsFromRect, clampCell, layerOrder, nudgeCell, setBlockGrid, shiftLayer } from "./gridPlacement";

// 12 columns, 1200px wide, 24px gaps: each column is 78px, one step 102px. Rows of 100px.
const grid = { width: 1200, columns: 12, gap: 24, rows: [100, 100, 100] };

describe("cellsFromRect (drag and resize on the grid)", () => {
  it("snaps a dropped block to the nearest cells", () => {
    expect(cellsFromRect({ x: 0, y: 0, w: 384, h: 100 }, grid)).toEqual({ column: 1, span: 4, row: 1, rowSpan: 1 });
    expect(cellsFromRect({ x: 410, y: 130, w: 590, h: 220 }, grid)).toEqual({ column: 5, span: 6, row: 2, rowSpan: 2 });
  });
  it("never runs past the last column and always keeps at least one cell", () => {
    expect(cellsFromRect({ x: 1100, y: 0, w: 900, h: 10 }, grid)).toEqual({ column: 12, span: 1, row: 1, rowSpan: 1 });
    expect(cellsFromRect({ x: -50, y: -20, w: 5, h: 5 }, grid)).toMatchObject({ column: 1, span: 1, row: 1, rowSpan: 1 });
  });
  it("rows below the drawn ones use the default height", () => {
    const r = cellsFromRect({ x: 0, y: 3 * 124 + 2 * 104, w: 100, h: 80 }, grid);
    expect(r.row).toBe(6);
  });
});

describe("clampCell / nudgeCell", () => {
  it("keeps typed numbers inside the grid", () => {
    expect(clampCell({ column: 11, span: 6, row: 0, rowSpan: 40 }, 12)).toEqual({ column: 11, span: 2, row: 1, rowSpan: 12 });
  });
  it("moves by whole cells and stops at the edge without shrinking", () => {
    expect(nudgeCell({ column: 9, span: 4, row: 1, rowSpan: 1 }, { dx: 1 }, 12)).toEqual({ column: 9, span: 4, row: 1, rowSpan: 1 });
    expect(nudgeCell({ column: 2, span: 4, row: 2, rowSpan: 1 }, { dx: -1, dy: 1 }, 12)).toEqual({ column: 1, span: 4, row: 3, rowSpan: 1 });
    expect(nudgeCell({ column: 2, span: 4, row: 2, rowSpan: 1 }, { dw: 2, dh: 1 }, 12)).toEqual({ column: 2, span: 6, row: 2, rowSpan: 2 });
  });
});

describe("setBlockGrid / layers", () => {
  const blocks = [
    { id: "a", grid: { desktop: { column: 1, span: 4, z: 1 } } },
    { id: "g", type: "group", children: [{ id: "c", grid: {} }] },
    { id: "b" },
  ];
  it("sets one block's placement for one size, nested children too", () => {
    const next = setBlockGrid(blocks, "c", "mobile", { column: 2, span: 3 });
    expect((next[1] as any).children[0].grid).toEqual({ mobile: { column: 2, span: 3 } });
    expect(next[0]).toBe(blocks[0]);
    const cleared = setBlockGrid(blocks, "a", "desktop", { z: null });
    expect(cleared[0].grid!.desktop).toEqual({ column: 1, span: 4 });
    expect(setBlockGrid(blocks, "nope", "desktop", { z: 1 })).toBe(blocks);
  });
  it("orders layers front-most first and shifts one step", () => {
    expect(layerOrder(blocks, "desktop").map(b => b.id)).toEqual(["a", "b", "g"]);
    expect(shiftLayer(blocks, "b", "desktop", "forward")).toBe(2);
    expect(shiftLayer(blocks, "a", "desktop", "forward")).toBeNull();
    expect(shiftLayer(blocks, "a", "desktop", "back")).toBe(0);
  });
});

describe("applyGridMessage", () => {
  const design = { heroPage: { sections: [{ id: "s1", type: "CompositionSection", settings: { items: [{ id: "a" }, { id: "b" }] } }] } };
  const update = (d: any, ids: string[], fn: (s: any) => any) => ({ ...d, heroPage: { ...d.heroPage, sections: d.heroPage.sections.map((s: any) => ids.includes(s.id) ? fn(s) : s) } });
  const key = () => "items";
  it("places a dropped block for the previewed size", () => {
    const next = applyGridMessage(design, { sectionId: "s1", blockId: "b", device: "tablet", rect: { x: 204, y: 0, w: 588, h: 100 }, grid }, key, update);
    expect(next.heroPage.sections[0].settings.items[1].grid).toEqual({ tablet: { column: 3, span: 6, row: 1, rowSpan: 1 } });
  });
  it("nudges from where the block is now", () => {
    const next = applyGridMessage(design, { sectionId: "s1", blockId: "a", device: "desktop", rect: { x: 0, y: 0, w: 384, h: 100 }, grid, by: { dw: 1 } }, key, update);
    expect(next.heroPage.sections[0].settings.items[0].grid.desktop.span).toBe(5);
  });
  it("ignores unknown blocks and other section types", () => {
    const same = applyGridMessage(design, { sectionId: "s1", blockId: "zz", device: "desktop", rect: { x: 0, y: 0, w: 10, h: 10 }, grid }, key, update);
    expect(same.heroPage.sections[0]).toBe(design.heroPage.sections[0]);
  });
});
