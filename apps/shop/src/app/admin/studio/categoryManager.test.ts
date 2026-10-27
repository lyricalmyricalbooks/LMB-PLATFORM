import { describe, expect, it } from "vitest";
import { categoryBookPatch, directlyAssigned, deleteCategory, validateCategoryName, categoryNavOrder, appendCategory } from "./categoryManager";

const source = { id: "a", name: "Zines", aliases: ["ZINES", "Old zines"] };
const target = { id: "b", name: "Books" };
describe("category management", () => {
  it("counts direct assignments from current names and aliases, without treating Publications as every book", () => {
    expect(directlyAssigned({ genres: ["Old zines"] }, source)).toBe(true);
    expect(directlyAssigned({ categories: ["Other"] }, { name: "PUBLICATIONS" })).toBe(false);
  });
  it("moves every source alias while preserving other tags, inventory and existing target membership", () => {
    const book = { categories: ["ZINES", "Books", "Art"], genres: ["Old zines", "Poetry"], stock: 9 };
    const patch = categoryBookPatch(book, source, "move", target);
    expect(patch).toEqual({ categories: ["Books", "Art"], genres: ["Poetry"] });
    expect(book.categories).toEqual(["ZINES", "Books", "Art"]);
    expect(patch).not.toHaveProperty("stock");
  });
  it("removes assignments from both category and legacy genre fields", () => {
    expect(categoryBookPatch({ genres: ["ZINES", "Art"] }, source, "remove")).toEqual({ categories: [], genres: ["Art"] });
  });
  it("adds without duplicating an alias-backed assignment", () => {
    expect(categoryBookPatch({ categories: ["Old zines"] }, source, "add")).toEqual({ categories: ["Old zines"], genres: [] });
  });
  it("deletion promotes children, leaves unrelated parents intact and never modifies books", () => {
    expect(deleteCategory([source, { ...target, parentId: "a" }, { id: "c", parentId: "b" }], "a"))
      .toEqual([{ ...target, parentId: null }, { id: "c", parentId: "b" }]);
  });
  it("rejects blank names and names reserved by another category or its aliases", () => {
    expect(validateCategoryName([source, target], "a", " ")).toBeTruthy();
    expect(validateCategoryName([source, target], "b", "old ZINES")).toBeTruthy();
    expect(validateCategoryName([source, target], "a", "ZINES")).toBe("");
  });
  it("reorders category slots without moving the custom page between them", () => {
    expect(categoryNavOrder([source, target], [target, source], [{ id: "p", title: "About", showInNav: true, status: "published" }], ["cat:a", "page:p", "cat:b"]))
      .toEqual(["cat:b", "page:p", "cat:a"]);
  });
});

describe("appendCategory (book editor › create category)", () => {
  const added = { id: "cat-new", name: "Zines", showInNav: true };
  it("adds to the live list without publishing draft-only categories", () => {
    const live = [{ id: "a", name: "Poetry" }];
    const draft = [{ id: "a", name: "Poetry" }, { id: "d", name: "Unpublished" }];
    expect(appendCategory(live, added, []).map(c => c.name)).toEqual(["Poetry", "Zines"]);
    expect(appendCategory(draft, added, []).map(c => c.name)).toEqual(["Poetry", "Unpublished", "Zines"]);
  });
  it("starts from the shop defaults and never duplicates a name", () => {
    expect(appendCategory(undefined, added, ["PUBLICATIONS"]).map(c => c.name)).toEqual(["PUBLICATIONS", "Zines"]);
    expect(appendCategory([{ id: "z", name: "zines" }], added, [])).toHaveLength(1);
  });
});
