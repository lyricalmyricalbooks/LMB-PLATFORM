import { describe, expect, it } from "vitest";
import { thumbLastRow, thumbLayout } from "./thumbStrip";
import { productPageCss } from "./productPageStyle";

const base = { width: 600, size: 64, gap: 10, perRow: 0, wrap: true, ratio: 0.75 };

describe("thumbLayout", () => {
  it("fills one row edge to edge when every thumbnail fits", () => {
    const l = thumbLayout({ ...base, count: 7 })!;
    expect(l.cols).toBe(7);
    expect(l.cellWidth * 7 + 6 * 10).toBeCloseTo(600);
    expect(l.cellHeight).toBeCloseTo(l.cellWidth / 0.75);
  });
  it("balances rows so the last one is as full as possible", () => {
    // 600px fits 8 thumbnails of 64px; 14 photos → 2 rows of 7, not 8 + 6.
    expect(thumbLayout({ ...base, count: 14 })!.cols).toBe(7);
    expect(thumbLayout({ ...base, count: 16 })!.cols).toBe(8);
    expect(thumbLayout({ ...base, count: 17 })!.cols).toBe(6);
  });
  it("uses the chosen number per row", () => {
    expect(thumbLayout({ ...base, count: 14, perRow: 5 })!.cols).toBe(5);
    expect(thumbLayout({ ...base, count: 3, perRow: 5 })!.cols).toBe(3);
  });
  it("on one scrolling line, the visible thumbnails fill it", () => {
    expect(thumbLayout({ ...base, count: 20, wrap: false })!.cols).toBe(8);
    expect(thumbLayout({ ...base, count: 4, wrap: false })!.cols).toBe(4);
  });
  it("answers null without a measurement", () => {
    expect(thumbLayout({ ...base, count: 5, width: 0 })).toBeNull();
    expect(thumbLayout({ ...base, count: 0 })).toBeNull();
  });
  it("reads the last-row choice", () => {
    expect(thumbLastRow(undefined)).toBe("stretch");
    expect(thumbLastRow("center")).toBe("center");
  });
});

describe("filled thumbnail strip CSS", () => {
  it("shares the row between --thumb-cols thumbnails with the chosen gap", () => {
    const css = productPageCss({ pdpThumbGap: 6 });
    expect(css).toContain(".fm-pdp-rail{display:flex;gap:6px;");
    expect(css).toContain('.fm-pdp-rail[data-fill][data-fill="wrap"] .fm-pdp-thumb{flex:1 1 calc((100% - (var(--thumb-cols) - 1) * 6px) / var(--thumb-cols));');
    expect(css).toContain('[data-last-row="center"]{justify-content:center;}');
  });
});
