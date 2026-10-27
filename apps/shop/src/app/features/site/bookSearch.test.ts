import { describe, expect, it } from "vitest";
import { matchesSearch, searchScore } from "./bookSearch";

const hobbit = { title: "The Hobbit", authorName: "J. R. R. Tolkien", isbn: "978-0-261-10221-7", categories: ["Fantasy"] };
const cafe = { title: "Café Society", subtitle: "Poems", authorName: "Zoë Ng" };

describe("bookSearch", () => {
  it("needs every word, in any order", () => {
    expect(matchesSearch(hobbit, "tolkien hobbit")).toBe(true);
    expect(matchesSearch(hobbit, "hobbit dragon")).toBe(false);
  });
  it("ignores accents and case", () => {
    expect(matchesSearch(cafe, "CAFE")).toBe(true);
    expect(matchesSearch(cafe, "zoe")).toBe(true);
  });
  it("finds ISBNs with or without hyphens", () => {
    expect(matchesSearch(hobbit, "9780261102217")).toBe(true);
    expect(matchesSearch(hobbit, "978-0-261-10221-7")).toBe(true);
  });
  it("forgives one typo in longer words only", () => {
    expect(matchesSearch(hobbit, "hobbbit")).toBe(true);
    expect(matchesSearch(hobbit, "tolkein")).toBe(true);
    expect(matchesSearch(hobbit, "hobt")).toBe(false);
  });
  it("ranks title starts above author matches", () => {
    expect(searchScore(hobbit, "hobbit")).toBeGreaterThan(searchScore(hobbit, "tolkien"));
  });
  it("matches everything when empty", () => {
    expect(matchesSearch(hobbit, "  ")).toBe(true);
  });
});
