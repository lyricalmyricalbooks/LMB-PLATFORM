import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BOOK_ONLY_COPY, SELLS, SWAPPED, adminWordsFor, firstProductWords, goodsWords, sellsBooks, starterWords, startingKind, withStarterWords } from "./sells";
import { DEFAULT_COPY, getCopy } from "../features/site/storeCopy";
import { firstWeekSteps } from "./firstWeek";
import { suggestedThemes } from "./chooseLook";
import { PRODUCT_KINDS } from "../../shared/productOptions";

// Book words a shopper of a shop that sells shirts should never read.
const BOOK_WORDS = /\b(books?|authors?|publications?|publishing|publisher|photobooks?|zines?|e-books?|paperback|hardcover)\b/i;

describe("What a shop sells (plan 10.1)", () => {
  it("lists the sign-up form's answers, in its order", () => {
    const form = readFileSync(new URL("../../../../../signup/form.js", import.meta.url), "utf8");
    const block = form.slice(form.indexOf("export const PUBLISHES"), form.indexOf("/** Where a shop lives"));
    expect([...block.matchAll(/id: "([a-z]+)", label/g)].map(m => m[1])).toEqual([...SELLS]);
  });

  it("books shops stay the same: book answers, a skipped answer and an unknown one change nothing", () => {
    for (const answer of ["books", "zines", "comics", "mix", null, undefined, "", "pottery"]) {
      expect(sellsBooks(answer), String(answer)).toBe(true);
      expect(startingKind(answer)).toBe("book");
      expect(starterWords(answer)).toEqual({});
      const design = { copy: { footerAbout: "Ours" }, primary: "#000" };
      expect(withStarterWords(design, answer)).toBe(design);
      expect(firstProductWords(answer)).toBeNull();
    }
  });

  it("every other answer starts products as a real kind", () => {
    for (const answer of SELLS.filter(a => !sellsBooks(a))) expect(PRODUCT_KINDS).toContain(startingKind(answer));
    expect(startingKind("prints")).toBe("art");
    expect(startingKind("clothing")).toBe("clothing");
  });

  it("a shop that sells clothing reads no book words anywhere shoppers read", () => {
    const design = withStarterWords({}, "clothing");
    const left = Object.keys(DEFAULT_COPY)
      .filter(key => !BOOK_ONLY_COPY.has(key))
      .map(key => [key, getCopy(design, key).replace(/\{\w+\}/g, "")])
      .filter(([key, text]) => BOOK_WORDS.test(text) && !/Publish\b/.test(text) && !["seoBookTitleByline", "reviewsAuthor", "reviewsEmail"].includes(key));
    expect(left).toEqual([]);
    expect(getCopy(design, "siteName")).toBe("Your Shop");
  });

  it("each swap still matches its default, so a changed default is noticed", () => {
    for (const [key, pairs] of Object.entries(SWAPPED)) for (const [from] of pairs) expect(DEFAULT_COPY[key], key).toContain(from);
  });

  it("starter words never overwrite words the owner wrote", () => {
    const design = withStarterWords({ copy: { footerAbout: "Shirts from the coast." }, accent: "#f00" }, "clothing");
    expect(design.copy.footerAbout).toBe("Shirts from the coast.");
    expect(design.copy.catalogEmpty).toBe("No products match these filters.");
    expect(design.accent).toBe("#f00");
  });

  it("suggests looks and words the setup guide for every answer", () => {
    for (const answer of SELLS) expect(suggestedThemes(answer).length, answer).toBeGreaterThanOrEqual(2);
    const facts = { books: [], readiness: [] };
    const step = (publishes: string) => firstWeekSteps({ plan: "both", publishes }, facts).find(s => s.id === "add-books")!;
    expect(step("books").title).toBe("Add your first book");
    expect(step("jewelry").title).toBe("Add your first product");
  });

  it("admin words (plan 10.23): a books shop reads the same, a clothing shop reads products and makers", () => {
    for (const answer of ["books", "zines", null, "pottery"]) expect(adminWordsFor(answer)("Add book")).toBe("Add book");
    const w = adminWordsFor("clothing");
    expect(w("Add book")).toBe("Add product");
    expect(w("No books yet")).toBe("No products yet");
    expect(w("Search title, author, ISBN or SKU…")).toBe("Search title, maker, ISBN or SKU…");
    expect(w("BOOKS")).toBe("PRODUCTS");
    expect(w("Add your first title to start selling")).toBe("Add your first title to start selling");
    // Book-only and look-alike words are left alone.
    expect(goodsWords("E-book (PDF), e-books, Bookkeeping, bookkeeper, Facebook")).toBe("E-book (PDF), e-books, Bookkeeping, bookkeeper, Facebook");
  });
});
