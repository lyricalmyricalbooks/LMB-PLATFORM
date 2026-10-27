import { describe, expect, it } from "vitest";
import { COALESCE_MS, describePlace, EMPTY_PLACES, goBack, normalizePlace, peekBack, PLACE_LIMIT, placeCrumbs, placeKey, samePlace, settlePlace, visitPlace, type Place, type PlaceLabels } from "./placeHistory";

const base: Place = { leftTab: "sections", styleCategory: null, textCategory: null, styleFocus: null, templateId: "heroPage", showGlobal: false, globalGroup: "globalSections", selectedId: null, blockId: null, element: null };
const at = (over: Partial<Place>): Place => ({ ...base, ...over });
const T = COALESCE_MS + 100;

const labels: PlaceLabels = {
  workspace: tab => ({ sections: "Page layout", style: "Theme settings", text: "Text & labels", pages: "Pages" } as Record<string, string>)[tab] || tab,
  styleCategory: id => ({ buttons: "Buttons" } as Record<string, string>)[id] || id,
  textCategory: id => id,
  page: p => (p.showGlobal ? "Every page · Above the footer" : p.templateId === "heroPage" ? "Home" : p.templateId),
  section: p => (p.selectedId === "s1" ? "Newsletter" : null),
  block: p => (p.blockId === "b2" ? "Block 2" : null),
};

describe("place history", () => {
  it("starts with no way back and remembers the first place", () => {
    const h = visitPlace(EMPTY_PLACES, base, 0);
    expect(h.current).toEqual(base);
    expect(peekBack(h)).toBeNull();
    expect(goBack(h, p => p, 5000)).toBeNull();
  });

  it("a jump pushes the place the owner left; the same place changes nothing", () => {
    let h = visitPlace(EMPTY_PLACES, base, 0);
    const found = at({ leftTab: "style", styleCategory: "buttons" });
    h = visitPlace(h, found, T);
    expect(h.back).toEqual([base]);
    expect(visitPlace(h, found, T + 5000)).toBe(h);
  });

  it("Back returns to where the owner was, and again further back", () => {
    const a = base, b = at({ leftTab: "style", styleCategory: "buttons" }), c = at({ selectedId: "s1" });
    let h = visitPlace(EMPTY_PLACES, a, 0);
    h = visitPlace(h, b, T);
    h = visitPlace(h, c, 2 * T);
    const first = goBack(h, p => p, 3 * T)!;
    expect(samePlace(first.place, b)).toBe(true);
    const second = goBack(first.history, p => p, 4 * T)!;
    expect(samePlace(second.place, a)).toBe(true);
    expect(goBack(second.history, p => p, 5 * T)).toBeNull();
  });

  it("changes within one jump fold together, so Back skips the in-between page", () => {
    const start = base, click = at({ templateId: "productPage" }), settled = at({ templateId: "productPage", selectedId: "s9" });
    let h = visitPlace(EMPTY_PLACES, start, 0);
    h = visitPlace(h, click, T);
    h = visitPlace(h, settled, T + 100);
    expect(h.back).toEqual([start]);
    expect(samePlace(goBack(h, p => p, 5 * T)!.place, start)).toBe(true);
  });

  it("a jump that settles back where it started records nothing", () => {
    let h = visitPlace(EMPTY_PLACES, base, 0);
    h = visitPlace(h, at({ selectedId: "s1" }), T);
    h = visitPlace(h, base, T + 50);
    expect(h.back).toEqual([]);
    expect(h.current).toEqual(base);
  });

  it("keeps at most PLACE_LIMIT places and never the same one twice in a row", () => {
    let h = visitPlace(EMPTY_PLACES, base, 0);
    for (let i = 1; i <= PLACE_LIMIT + 7; i++) h = visitPlace(h, at({ selectedId: `s${i}` }), i * T);
    expect(h.back).toHaveLength(PLACE_LIMIT);
    expect(h.back[h.back.length - 1].selectedId).toBe(`s${PLACE_LIMIT + 6}`);
    expect(h.back.every((p, i) => i === 0 || !samePlace(p, h.back[i - 1]))).toBe(true);
  });

  it("skips places that no longer exist and uses the next one", () => {
    const a = at({ templateId: "page:gone" }), b = at({ leftTab: "style", styleCategory: "buttons" });
    let h = visitPlace(EMPTY_PLACES, a, 0);
    h = visitPlace(h, b, T);
    h = visitPlace(h, at({ leftTab: "text", textCategory: "Footer" }), 2 * T);
    // b is gone; a is gone too → nowhere to go.
    expect(goBack(h, () => null, 3 * T)).toBeNull();
    // Only the newest is gone → the older one is used.
    const r = goBack(h, p => (samePlace(p, b) ? null : p), 3 * T)!;
    expect(samePlace(r.place, a)).toBe(true);
  });

  it("restores a place without the section or block that was deleted since (the resolver drops them)", () => {
    const withBlock = at({ selectedId: "s1", blockId: "b2" });
    let h = visitPlace(EMPTY_PLACES, withBlock, 0);
    h = visitPlace(h, at({ leftTab: "style", styleCategory: "buttons" }), T);
    const noBlock = goBack(h, p => ({ ...p, blockId: null }), 2 * T)!;
    expect(noBlock.place.selectedId).toBe("s1");
    expect(noBlock.place.blockId).toBeNull();
    const noSection = goBack(h, p => ({ ...p, selectedId: null, blockId: null }), 2 * T)!;
    expect(noSection.place.selectedId).toBeNull();
    expect(noSection.place.blockId).toBeNull();
  });

  it("skips a place that resolves to where the owner already is", () => {
    const a = at({ selectedId: "s1" });
    let h = visitPlace(EMPTY_PLACES, a, 0);
    h = visitPlace(h, base, T);
    // s1 was deleted, so the old place is just the page, which is where the owner is.
    expect(goBack(h, p => ({ ...p, selectedId: null }), 2 * T)).toBeNull();
  });

  it("settling after Back does not push the landing place", () => {
    let h = visitPlace(EMPTY_PLACES, base, 0);
    h = visitPlace(h, at({ selectedId: "s1" }), T);
    const back = goBack(h, p => p, 2 * T)!;
    const settled = settlePlace(back.history, { ...back.place, element: { key: "x", label: "X", target: "" } }, 2 * T + 10);
    expect(settled.back).toEqual(back.history.back);
  });

  it("hidden leftovers do not count as a move", () => {
    // A Theme settings category left behind on another workspace is not part of the place there.
    const a = normalizePlace(at({ leftTab: "sections", styleCategory: "buttons", textCategory: "Footer" }));
    expect(a.styleCategory).toBeNull();
    expect(a.textCategory).toBeNull();
    expect(placeKey(at({ blockId: "b2" }))).toBe(placeKey(base));
  });
});

describe("place breadcrumb", () => {
  it("Page layout › Home › Newsletter › Block 2", () => {
    const p = at({ selectedId: "s1", blockId: "b2" });
    expect(placeCrumbs(p, labels).map(c => c.level)).toEqual(["workspace", "page", "section", "block"]);
    expect(describePlace(p, labels)).toBe("Page layout › Home › Newsletter › Block 2");
  });
  it("Theme settings › Buttons › the part being edited", () => {
    expect(describePlace(at({ leftTab: "style", styleCategory: "buttons" }), labels)).toBe("Theme settings › Buttons");
    expect(describePlace(at({ leftTab: "style", styleCategory: "buttons", styleFocus: { id: "buttons", label: "Primary button" } }), labels)).toBe("Theme settings › Buttons › Primary button");
  });
  it("names the workspace alone when there is no category, and the page for shared groups", () => {
    expect(describePlace(at({ leftTab: "pages" }), labels)).toBe("Pages");
    expect(describePlace(at({ showGlobal: true }), labels)).toBe("Page layout › Every page · Above the footer");
    expect(describePlace(at({ leftTab: "text", textCategory: "Footer" }), labels)).toBe("Text & labels › Footer");
  });
  it("a page part opened from the preview ends the path, without repeating the focus card", () => {
    const element = { key: "k", label: "Header", target: "" };
    expect(describePlace(at({ element }), labels)).toBe("Page layout › Home › Header");
    expect(describePlace(at({ leftTab: "style", styleCategory: "buttons", styleFocus: { id: "b", label: "Header" }, element }), labels)).toBe("Theme settings › Buttons › Header");
  });
  it("a section the labels cannot find is left out rather than shown as a blank", () => {
    expect(describePlace(at({ selectedId: "gone", blockId: "b2" }), labels)).toBe("Page layout › Home");
  });
});
