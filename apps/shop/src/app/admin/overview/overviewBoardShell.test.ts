import { describe, expect, it } from "vitest";
import { NEW_WIDGETS, WIDGET_KEYWORDS, goalProblem, leadDaysProblem, rowFills, searchWidgets } from "./OverviewBoard";
import { WIDGETS } from "./overviewBoard";

describe("rowFills: the last widget of a short row fills it", () => {
  it("leaves full rows alone", () => {
    expect(rowFills(["m", "m", "xl", "l", "s"])).toEqual([null, null, null, null, null]);
  });
  it("grows the last widget of a row that a too-wide widget breaks", () => {
    // L (8) then M (6) doesn't fit: L grows to 12; M is alone at the end and grows too.
    expect(rowFills(["l", "m"])).toEqual([12, 12]);
    // S + M = 10: M takes the last 2 columns as well.
    expect(rowFills(["s", "m", "xl"])).toEqual([null, 8, null]);
  });
  it("fills a lone widget and a short final row", () => {
    expect(rowFills(["m"])).toEqual([12]);
    expect(rowFills(["s", "s", "s", "s"])).toEqual([null, null, null, 12]);
    expect(rowFills([])).toEqual([]);
  });
  it("uses the tablet widths when given", () => {
    // On tablets S and M are both half, L and XL whole.
    expect(rowFills(["s", "l", "m"], { s: 6, m: 6, l: 12, xl: 12 })).toEqual([12, null, 12]);
  });
});

describe("searchWidgets: the Add widgets search", () => {
  it("returns every widget for an empty search", () => {
    expect(searchWidgets("  ")).toHaveLength(WIDGETS.length);
  });
  it("finds widgets by the owner's own words", () => {
    expect(searchWidgets("instagram").map(w => w.type)).toContain("notes");
    expect(searchWidgets("reprint").map(w => w.type)).toEqual(expect.arrayContaining(["reprint", "soldOut"]));
    expect(searchWidgets("goal").map(w => w.type)[0]).toBe("goal");
  });
  it("puts title matches first and forgives a plural", () => {
    const money = searchWidgets("money").map(w => w.type);
    expect(money[0]).toBe("money");
    expect(searchWidgets("refunds").length).toBeGreaterThan(0);
  });
  it("finds nothing for nonsense", () => {
    expect(searchWidgets("zzzz")).toEqual([]);
  });
  it("only names real widgets", () => {
    const types = new Set(WIDGETS.map(w => w.type));
    for (const t of [...NEW_WIDGETS, ...Object.keys(WIDGET_KEYWORDS)]) expect(types.has(t as any)).toBe(true);
  });
});

describe("Settings… checks", () => {
  it("accepts 1 to 365 whole days for a reprint", () => {
    expect(leadDaysProblem("35")).toBe("");
    expect(leadDaysProblem("365")).toBe("");
    for (const bad of ["0", "366", "abc", "", "2.5"]) expect(leadDaysProblem(bad)).not.toBe("");
  });
  it("accepts a goal in dollars, or empty to set later", () => {
    for (const ok of ["2000", "2,000", "$2,000", "CA$ 1500", ""]) expect(goalProblem(ok)).toBe("");
    for (const bad of ["0", "-5", "lots"]) expect(goalProblem(bad)).not.toBe("");
  });
});
