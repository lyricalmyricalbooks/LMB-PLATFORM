import { describe, expect, it } from "vitest";
import { bookInCategory, buildNavItems, moveNavItem, renameCategory } from "./navItems";

const cats = [
  { id: "a", name: "PUBLICATIONS", showInNav: true },
  { id: "b", name: "EPHEMERA", showInNav: true },
  { id: "c", name: "HIDDEN", showInNav: false },
];
const pages = [
  { id: "p1", slug: "history", title: "history", status: "published", showInNav: true },
  { id: "p2", slug: "draft", title: "draft", status: "draft", showInNav: true },
  { id: "p3", slug: "quiet", title: "quiet", status: "published", showInNav: false },
];

describe("buildNavItems", () => {
  it("lists visible categories then in-menu published pages", () => {
    expect(buildNavItems(cats, pages).map((i) => i.label)).toEqual(["PUBLICATIONS", "EPHEMERA", "history"]);
  });
  it("honours navOrder and appends unlisted items", () => {
    const order = ["page:p1", "cat:b"];
    expect(buildNavItems(cats, pages, order).map((i) => i.label)).toEqual(["history", "EPHEMERA", "PUBLICATIONS"]);
  });
  it("moves items within the visible list", () => {
    const items = buildNavItems(cats, pages);
    expect(moveNavItem(items, 2, -1)).toEqual(["cat:a", "page:p1", "cat:b"]);
    expect(moveNavItem(items, 0, -1)).toEqual(["cat:a", "cat:b", "page:p1"]);
  });
});

describe("renameCategory", () => {
  it("remembers the old name so tagged books still match", () => {
    const next = renameCategory(cats, 1, "ZINES");
    expect(next[1]).toMatchObject({ id: "b", name: "ZINES", aliases: ["EPHEMERA"] });
    expect(bookInCategory({ categories: ["EPHEMERA"] }, next[1])).toBe(true);
    expect(bookInCategory({ categories: ["ZINES"] }, next[1])).toBe(true);
    expect(bookInCategory({ categories: ["OTHER"] }, next[1])).toBe(false);
  });
  it("drops an alias when renamed back and ignores blanks", () => {
    const once = renameCategory(cats, 1, "ZINES");
    const back = renameCategory(once, 1, "EPHEMERA");
    expect(back[1].aliases).toEqual(["ZINES"]);
    expect(renameCategory(cats, 1, "  ")[1].name).toBe("EPHEMERA");
  });
  it("keeps PUBLICATIONS as the show-everything category even after a rename", () => {
    const next = renameCategory(cats, 0, "ALL BOOKS");
    expect(bookInCategory({ categories: [] }, next[0])).toBe(true);
  });
});

describe("sub-categories (drop-downs)", () => {
  const tree = [
    { id: "pub", name: "PUBLICATIONS", showInNav: true },
    { id: "books", name: "BOOKS", parentId: "pub", showInNav: true },
    { id: "zines", name: "ZINES", parentId: "pub", showInNav: true },
    { id: "eph", name: "EPHEMERA", showInNav: true },
    { id: "hid", name: "HIDDEN SUB", parentId: "eph", showInNav: false },
  ];
  it("nests sub-categories under their parent instead of giving them a spot in the bar", () => {
    const items = buildNavItems(tree, []);
    expect(items.map((i) => i.label)).toEqual(["PUBLICATIONS", "EPHEMERA"]);
    expect((items[0] as any).children.map((c: any) => c.name)).toEqual(["BOOKS", "ZINES"]);
    expect((items[1] as any).children).toEqual([]);
  });
  it("a parent matches books filed under any of its sub-categories", () => {
    const withParent = [...tree, { id: "prints", name: "PRINTS", showInNav: true }, { id: "risos", name: "RISOS", parentId: "prints" }];
    expect(bookInCategory({ categories: ["RISOS"] }, withParent[5], withParent)).toBe(true);
    expect(bookInCategory({ categories: ["ZINES"] }, withParent[5], withParent)).toBe(false);
    expect(bookInCategory({ categories: ["ZINES"] }, tree[2], tree)).toBe(true);
    expect(bookInCategory({ categories: ["BOOKS"] }, tree[2], tree)).toBe(false);
  });
  it("treats a missing or nested parent as top-level (one level deep only)", () => {
    const odd = [{ id: "a", name: "A", parentId: "gone" }, { id: "b", name: "B", parentId: "a" }, { id: "c", name: "C", parentId: "b" }];
    expect(buildNavItems(odd, []).map((i) => i.label)).toEqual(["A", "C"]);
  });
});
