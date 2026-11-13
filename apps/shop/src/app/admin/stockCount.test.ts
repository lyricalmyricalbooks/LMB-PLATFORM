import { describe, expect, it } from "vitest";
import { countReport, countReportRows, countStatus, countSummary, differenceText } from "./stockCount";

const rows = [{ id: "a", expected: 62 }, { id: "b", expected: 3 }, { id: "c", expected: 0 }];

describe("count stock", () => {
  it("adds up what is counted and what changes", () => {
    const s = countSummary(rows, { a: 62, b: 2 });
    expect(s).toMatchObject({ total: 3, counted: 2, left: 1, differences: 1, net: -1 });
    expect(s.changes).toEqual([{ id: "b", from: 3, to: 2 }]);
  });
  it("blocks finishing until every row is counted, then says what changes", () => {
    expect(countStatus(countSummary(rows, { a: 62 }))).toEqual({ tone: "warn", text: "2 items not counted yet", blocked: true });
    expect(countStatus(countSummary(rows, { a: 62, b: 2, c: 1 }))).toEqual({ tone: "warn", text: "Finishing will correct 2 items", blocked: false });
    expect(countStatus(countSummary(rows, { a: 62, b: 3, c: 0 }))).toEqual({ tone: "good", text: "Everything matches", blocked: false });
  });
  it("words the difference", () => {
    expect(differenceText(5, undefined)).toBe("Not counted");
    expect(differenceText(5, 5)).toBe("Matches");
    expect(differenceText(5, 7)).toBe("+2");
    expect(differenceText(5, 3)).toBe("−2");
  });
});

describe("count report", () => {
  const items = [{ id: "a", title: "Zine", cost: 2.5 }, { id: "b", title: "Tee", sub: "Size M", cost: 12 }, { id: "c", title: "Poster" }];
  it("lists the differences, biggest loss first, with their value at cost", () => {
    const r = countReport(items, [{ id: "a", from: 10, to: 12 }, { id: "b", from: 5, to: 3 }, { id: "c", from: 4, to: 1 }], 7);
    expect(r.rows.map((x) => [x.title, x.diff, x.value])).toEqual([["Tee", -2, -24], ["Poster", -3, null], ["Zine", 2, 5]]);
    expect(r).toMatchObject({ missing: 5, found: 2, valueMissing: 24, valueFound: 5, noCost: 1, matched: 4 });
  });
  it("is empty when everything matched, and becomes a spreadsheet", () => {
    expect(countReport(items, [], 3)).toMatchObject({ rows: [], missing: 0, found: 0, matched: 3 });
    const r = countReport(items, [{ id: "b", from: 5, to: 3 }], 3);
    expect(countReportRows(r, "2026-11-13")).toEqual([
      ["Counted", "Item", "Details", "Expected", "Counted", "Difference", "Value at cost"],
      ["2026-11-13", "Tee", "Size M", "5", "3", "-2", "-24.00"],
    ]);
  });
});
