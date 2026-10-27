import { describe, expect, it } from "vitest";
import { AUTO_LOAD_ROUNDS, catalogAutoLoadOn, catalogPageSize, nextShown, shouldAutoLoad, visibleCount } from "./catalogPaging";

describe("catalog paging", () => {
  it("is off unless a positive page size is set", () => {
    expect(catalogPageSize({})).toBe(0);
    expect(catalogPageSize({ catalogPageSize: "" })).toBe(0);
    expect(catalogPageSize({ catalogPageSize: -4 })).toBe(0);
    expect(catalogPageSize({ catalogPageSize: "12" })).toBe(12);
    expect(catalogPageSize({ catalogPageSize: 500 })).toBe(96);
  });
  it("shows every book when off", () => {
    expect(visibleCount(40, 0, 0)).toBe(40);
  });
  it("shows one page, then one more page per press, never past the total", () => {
    expect(visibleCount(40, 12, 0)).toBe(12);
    expect(nextShown(40, 12, 12)).toBe(24);
    expect(nextShown(40, 12, 36)).toBe(40);
    expect(visibleCount(5, 12, 0)).toBe(5);
  });
});

describe("loading more books by themselves", () => {
  it("is off unless switched on with a page size", () => {
    expect(catalogAutoLoadOn({})).toBe(false);
    expect(catalogAutoLoadOn({ catalogAutoLoad: true })).toBe(false);
    expect(catalogAutoLoadOn({ catalogAutoLoad: true, catalogPageSize: 12 })).toBe(true);
    expect(catalogAutoLoadOn({ catalogAutoLoad: "true", catalogPageSize: 12 })).toBe(false);
  });
  it("hands back to the button after a few automatic loads", () => {
    expect(shouldAutoLoad(false, 0)).toBe(false);
    expect(shouldAutoLoad(true, 0)).toBe(true);
    expect(shouldAutoLoad(true, AUTO_LOAD_ROUNDS - 1)).toBe(true);
    expect(shouldAutoLoad(true, AUTO_LOAD_ROUNDS)).toBe(false);
  });
});
