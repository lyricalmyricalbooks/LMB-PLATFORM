import { describe, expect, it } from "vitest";
import { blockMoveRoom, moveBlockBy, tabAfterSelection, withDeviceHidden } from "./inspectorState";

const b = (id: string, children?: any[]) => ({ id, type: "text", ...(children ? { children } : {}) }) as any;

describe("tabAfterSelection", () => {
  it("keeps the tab for another section of the same kind", () => {
    expect(tabAfterSelection("style", "Hero", "Hero")).toBe("style");
    expect(tabAfterSelection("visibility", "Hero", "Hero")).toBe("visibility");
  });
  it("goes back to Content when the kind changes or the tab is unknown", () => {
    expect(tabAfterSelection("style", "Hero", "Gallery")).toBe("content");
    expect(tabAfterSelection("nope", "Hero", "Hero")).toBe("content");
    expect(tabAfterSelection("style", undefined, "Hero")).toBe("content");
  });
});

describe("moving a block among its siblings", () => {
  const list = [b("a"), b("b", [b("c"), b("d")]), b("e")];
  it("reports where there is room", () => {
    expect(blockMoveRoom(list, "a")).toEqual({ up: false, down: true });
    expect(blockMoveRoom(list, "e")).toEqual({ up: true, down: false });
    expect(blockMoveRoom(list, "c")).toEqual({ up: false, down: true });
    expect(blockMoveRoom(list, "missing")).toEqual({ up: false, down: false });
  });
  it("moves one place at the block's own level", () => {
    expect(moveBlockBy(list, "a", 1).map(x => x.id)).toEqual(["b", "a", "e"]);
    expect(moveBlockBy(list, "e", -1).map(x => x.id)).toEqual(["a", "e", "b"]);
    const nested = moveBlockBy(list, "c", 1);
    expect(nested[1].children!.map(x => x.id)).toEqual(["d", "c"]);
    expect(nested.map(x => x.id)).toEqual(["a", "b", "e"]);
  });
  it("leaves the list alone at the ends", () => {
    expect(moveBlockBy(list, "a", -1)).toBe(list);
    expect(moveBlockBy(list, "e", 1)).toBe(list);
    expect(moveBlockBy(list, "missing", 1)).toBe(list);
  });
});

describe("withDeviceHidden", () => {
  it("writes responsive[device].hidden and keeps the other overrides", () => {
    const next = withDeviceHidden({ mobile: { align: "center" }, tablet: { hidden: true } }, "mobile", true);
    expect(next).toEqual({ mobile: { align: "center", hidden: true }, tablet: { hidden: true } });
  });
  it("removes the flag when switched off, whichever size is previewed", () => {
    expect(withDeviceHidden({ tablet: { hidden: true } }, "tablet", false).tablet.hidden).toBeUndefined();
    expect(withDeviceHidden(undefined, "mobile", true)).toEqual({ mobile: { hidden: true } });
  });
});
