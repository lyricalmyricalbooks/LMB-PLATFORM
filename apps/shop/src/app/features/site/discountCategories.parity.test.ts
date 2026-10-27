import { describe, expect, it } from "vitest";
import { createRequire } from "module";
import { expandDiscountCategories, discountCategoryChoices } from "./discountCategories";
import { bookInCategory } from "./categoryMembership.mjs";

const server = createRequire(import.meta.url)("../../../../functions/shared/discountCategories.js");
const cats: any[] = [
  { id: "p", name: "PUBLICATIONS" },
  { id: "b", name: "BOOKS", aliases: ["Novels"] },
  { id: "z", name: "Poetry", parentId: "b" },
  { id: "x", name: "Zines", parentId: "z" },
  "Prints",
];
const cases = [
  { appliesTo: "all" },
  { appliesTo: "categories", selectedCategories: ["BOOKS"] },
  { appliesTo: "categories", selectedCategories: ["Novels"] },
  { appliesTo: "categories", selectedCategories: ["Poetry"] },
  { appliesTo: "categories", selectedCategories: ["Prints"] },
  { appliesTo: "categories", selectedCategories: ["PUBLICATIONS"] },
  { appliesTo: "categories", selectedCategories: ["Gone"] },
];

describe("discount category membership", () => {
  it("server and display agree", () => {
    for (const d of cases) expect(expandDiscountCategories(d, cats)).toEqual(server.expandDiscountCategories(d, cats));
  });
  it("covers aliases and sub-categories like the storefront", () => {
    const d = expandDiscountCategories({ appliesTo: "categories", selectedCategories: ["BOOKS"] }, cats) as any;
    expect([...d.selectedCategories].sort()).toEqual(["BOOKS", "Novels", "Poetry"].sort());
    expect(bookInCategory({ categories: ["Poetry"] }, cats[1], cats)).toBe(true);
    expect(expandDiscountCategories({ appliesTo: "categories", selectedCategories: ["PUBLICATIONS"] }, cats)).toMatchObject({ appliesTo: "all" });
  });
  it("keeps the same object when nothing widens", () => {
    const d = { appliesTo: "categories", selectedCategories: ["Gone"] };
    expect(expandDiscountCategories(d, cats)).toBe(d);
  });
  it("lists shop categories with sub-categories and flags old names", () => {
    const choices = discountCategoryChoices(cats, ["Novels", "Gone"]);
    expect(choices.map(c => c.name)).toEqual(["PUBLICATIONS", "BOOKS", "Poetry", "Zines", "Prints", "Novels", "Gone"]);
    expect(choices.find(c => c.name === "Poetry")).toMatchObject({ parent: "BOOKS" });
    expect(choices.find(c => c.name === "Novels")).toMatchObject({ renamedTo: "BOOKS" });
    expect(choices.find(c => c.name === "Gone")).toMatchObject({ missing: true });
  });
});
