import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BOOK_ONLY_COPY, SELLS, SWAPPED, adminWordsFor, withShopWordsFor, firstProductWords, goodsWords, sellsBooks, starterWords, startingKind, withStarterWords } from "./sells";
import { DEFAULT_COPY, getCopy } from "../features/site/storeCopy";
import { firstWeekSteps } from "./firstWeek";
import { suggestedThemes } from "./chooseLook";
import { PRODUCT_KINDS } from "../../shared/productOptions";

// Book words a shopper of a shop that sells shirts should never read.
const BOOK_WORDS = /\b(books?|authors?|publications?|publishing|publisher|photobooks?|zines?|e-books?|paperback|hardcover|copies|titles|editions?|readers?)\b/i;

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
    expect(goodsWords("An author at a book fair, an author at Book Fairs")).toBe("A maker at a market, a maker at Markets");
  });

  it("counts items, products and shoppers instead of copies, titles and readers", () => {
    const w = adminWordsFor("clothing");
    expect(w("3 copies sold to returning readers")).toBe("3 items sold to returning shoppers");
    expect(w("Readers waiting · Copies in all · Top titles")).toBe("Shoppers waiting · Items in all · Top products");
    expect(w("A reader asked")).toBe("A shopper asked");
    // Look-alikes stay: screen readers, page and SEO titles, and "copy" on its own.
    expect(w("Named for screen readers. A screen reader, page titles, SEO titles. Copy the link")).toBe("Named for screen readers. A screen reader, page titles, SEO titles. Copy the link");
    expect(adminWordsFor("books")("3 copies sold to readers")).toBe("3 copies sold to readers");
  });

  it("shoppers read the words of what the shop sells now, even after a change", () => {
    const design = { copy: { footerAbout: "Ours" }, primary: "#000" };
    // No answer yet (an older shop): unchanged. A books shop with no starter words: unchanged.
    expect(withShopWordsFor(design, null)).toBe(design);
    expect(withShopWordsFor(design, "books")).toBe(design);
    expect(withShopWordsFor(null, "clothing")).toBeNull();
    // Changed to clothing in Settings: the starter words show under the owner's own.
    const clothing = withShopWordsFor(design, "clothing");
    expect(getCopy(clothing, "catalogCountMany", { count: 3 })).toBe("3 products");
    expect(getCopy(clothing, "pdpInBagMany", { count: 2 })).toBe("2 already in your bag");
    expect(getCopy(clothing, "footerAbout")).toBe("Ours");
    // Back to books: the starter words an earlier answer wrote go, the owner's own stay.
    const back = withShopWordsFor({ copy: { ...clothing.copy, catalogEmpty: "Nothing here, friend." } }, "zines");
    expect(getCopy(back, "catalogCountMany", { count: 3 })).toBe("3 titles");
    expect(getCopy(back, "bookNotFound")).toBe(DEFAULT_COPY.bookNotFound);
    expect(getCopy(back, "catalogEmpty")).toBe("Nothing here, friend.");
    expect(getCopy(back, "footerAbout")).toBe("Ours");
  });
});

// Starting words before the owner changes anything (12 November 2026).
import { withShopStartFor, GOODS_ANNOUNCEMENT } from "./sells";
import { defaultSettings, DEFAULT_ANNOUNCEMENT } from "./defaultSettings";
import { getCopy as copyOf } from "../features/site/storeCopy";

describe("withShopStartFor", () => {
  const fresh = (extra: Record<string, any> = {}) => ({ ...defaultSettings(), ...extra });

  it("names a new shop by its sign-up name instead of the placeholder, for books shops too", () => {
    const books = withShopStartFor(fresh({ shopName: "Moth Press" }));
    expect(copyOf(books.design, "siteName")).toBe("Moth Press");
    expect(books.info.name).toBe("Moth Press");
    expect(books.design.announcementText).toBe(DEFAULT_ANNOUNCEMENT);
    expect(copyOf(withShopStartFor(fresh(), "Profile Name").design, "siteName")).toBe("Profile Name");
  });

  it("keeps the owner's own names: Studio's site name first, then Settings' store name", () => {
    const base = fresh({ shopName: "Sign-up Name" });
    const studio = withShopStartFor({ ...base, design: { ...base.design, copy: { siteName: "Studio Name" } } });
    expect(copyOf(studio.design, "siteName")).toBe("Studio Name");
    const store = withShopStartFor({ ...base, info: { ...base.info, name: "Store Name" } });
    expect(copyOf(store.design, "siteName")).toBe("Store Name");
    expect(store.info.name).toBe("Store Name");
  });

  it("gives a shop that doesn't sell books a plain banner, description, title and menu", () => {
    const goods = withShopStartFor(fresh({ shopName: "Test Goods", sells: "other" }));
    expect(goods.design.announcementText).toBe(GOODS_ANNOUNCEMENT);
    expect(goods.announcements[0].message).toBe(GOODS_ANNOUNCEMENT);
    expect(goods.design.categories).toEqual([]);
    expect(goods.info.description).toBe("Test Goods is an independent shop of carefully made things.");
    expect(copyOf(goods.design, "siteDefaultTitle")).toBe("Test Goods — Independent shop");
    expect(goods.design.hero.slides[0]).toMatchObject({ title: "Test Goods", subtitle: "NEW ARRIVALS" });
    expect(/publishing house|Your Press|art books/i.test(JSON.stringify(goods))).toBe(false);
    // No name anywhere: the plain placeholder, never the press one.
    expect(withShopStartFor(fresh({ sells: "other" })).info.name).toBe("Your Shop");
  });

  it("keeps what the owner typed, and changes nothing for a books shop with its own name", () => {
    const base = fresh({ sells: "clothing" });
    const own = withShopStartFor({ ...base, announcements: [{ message: "FREE SHIPPING" }], design: { ...base.design, announcementText: "SALE", categories: ["TEES", "HATS"] } });
    expect(own.design.announcementText).toBe("SALE");
    expect(own.announcements[0].message).toBe("FREE SHIPPING");
    expect(own.design.categories).toEqual(["TEES", "HATS"]);
    const books = fresh({ sells: "books", info: { name: "Moth Press", description: "Poems." } });
    books.design.copy = { siteName: "Moth Press" };
    const shown = withShopStartFor(books);
    // Only the starting hero slide's placeholder title follows the name; the rest is untouched.
    expect(shown.design.hero.slides[0].title).toBe("Moth Press");
    expect({ ...shown, design: { ...shown.design, hero: books.design.hero } }).toEqual(books);
  });
});
