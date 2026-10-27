import { describe, expect, it } from "vitest";
import { WIDGETS, templateBoard, updateBand } from "./overviewBoard";
import { VISITOR_GROUP_OF, hashForTab, settleTab, tabForType, tabFromHash, topTabs, visitorGroups } from "./overviewTabs";

describe("overview tabs in the address", () => {
  it("round-trips every tab", () => {
    expect(tabFromHash("#overview/visitors/move")).toEqual({ band: "traffic", sub: "move" });
    expect(hashForTab({ band: "traffic", sub: "move" })).toBe("#overview/visitors/move");
    expect(hashForTab({ band: "sales", sub: "all" })).toBe("#overview/sales");
    expect(tabFromHash("#overview/all")).toEqual({ band: "all", sub: "all" });
    expect(tabFromHash("#overview/sales/move")).toEqual({ band: "sales", sub: "all" });
  });
  it("ignores other pages and unknown tabs", () => {
    expect(tabFromHash("#overview")).toBeNull();
    expect(tabFromHash("#orders/visitors")).toBeNull();
    expect(tabFromHash("#overview/nope")).toBeNull();
  });
});

describe("which tab shows", () => {
  it("lists only topics on the board, then Everything", () => {
    const b = templateBoard("visitors");
    const tops = topTabs(b, false);
    expect(tops[0]).toBe("traffic");
    expect(tops.at(-1)).toBe("all");
    const hidden = updateBand(b, "stock", { hidden: true });
    expect(topTabs(hidden, false)).not.toContain("stock");
  });
  it("falls back to the first tab, and to All inside Visitors", () => {
    const b = templateBoard("stock");
    expect(settleTab({ band: "traffic", sub: "move" }, b, false).band).toBe(topTabs(b, false)[0]);
    const v = templateBoard("visitors");
    expect(settleTab({ band: "traffic", sub: "move" }, v, false)).toEqual({ band: "traffic", sub: "move" });
    expect(visitorGroups(v).map(g => g.id)).toEqual(["now", "from", "move", "do", "leave"]);
  });
  it("puts every Visitors widget under a sub tab", () => {
    WIDGETS.filter(w => w.band === "traffic").forEach(w => expect(VISITOR_GROUP_OF[w.type], w.type).toBeTruthy());
    expect(tabForType("moves")).toEqual({ band: "traffic", sub: "move" });
    expect(tabForType("best")).toEqual({ band: "sales", sub: "all" });
  });
});
