import { describe, expect, it } from "vitest";
import { countStatus, countSummary, differenceText } from "./stockCount";

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
