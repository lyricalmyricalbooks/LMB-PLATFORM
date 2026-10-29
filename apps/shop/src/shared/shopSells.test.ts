// What a shop sells, shared by the admin and the server's emails (plan 10.23): src/shared/shopSells.ts.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { emailDefaultsFor, goodsDownloadNote, GOODS_EMAILS, sellsBooks, withShopEmailWords } from "./shopSells";

const require = createRequire(import.meta.url);
const BOOKS = {
  gift_card: { subject: "Gift", body: "Hi", buttonText: "Shop now", signoff: "Happy reading,\nThe {{shop_name}} team" },
  review_request: { subject: "How are you finding your book?", body: "Hi {{customer_name}}, your books", signoff: "Thanks for reading", enabled: false },
  customer_welcome: { subject: "Welcome", body: "download digital library books", signoff: "Warmly" },
};

describe("what a shop sells", () => {
  it("a book answer, no answer or an unknown one is a books shop and keeps every default", () => {
    for (const answer of [undefined, null, "", "books", "zines", "comics", "mix", "spaceships"]) {
      expect(sellsBooks(answer), String(answer)).toBe(true);
      expect(emailDefaultsFor(answer, BOOKS)).toBe(BOOKS);
      expect(withShopEmailWords(answer, BOOKS, BOOKS)).toBe(BOOKS);
    }
  });

  it("any other answer gets the goods words, with no book or reading word left", () => {
    for (const answer of ["prints", "clothing", "shoes", "jewelry", "music", "other"]) {
      expect(sellsBooks(answer)).toBe(false);
      const out = emailDefaultsFor(answer, BOOKS);
      expect(out.gift_card.buttonText).toBe("Shop now");
      expect(out.review_request.enabled).toBe(false);
      expect(JSON.stringify(Object.values(GOODS_EMAILS))).not.toMatch(/\b(books?|reading|readers?)\b/i);
    }
    expect(goodsDownloadNote(10)).toContain("up to 10 times");
    expect(goodsDownloadNote(10)).not.toMatch(/\bbooks?\b/i);
  });

  it("a saved field at the books default becomes the shop's; the owner's own words stay", () => {
    const saved = { ...BOOKS, gift_card: { ...BOOKS.gift_card, signoff: "Love, us" }, brand: { brandColor: "#000" } };
    const out = withShopEmailWords("clothing", saved, BOOKS);
    expect(out.gift_card.signoff).toBe("Love, us");
    expect(out.review_request.subject).toBe(GOODS_EMAILS.review_request.subject);
    expect(out.customer_welcome.body).toBe(GOODS_EMAILS.customer_welcome.body);
    expect(out.brand).toEqual({ brandColor: "#000" });
    expect(saved.review_request.subject).toBe("How are you finding your book?");
  });

  it("the server's copy gives the same answers", () => {
    const server = require("../../functions/shared/shopSells.js");
    expect(server.emailDefaultsFor("shoes", BOOKS)).toEqual(emailDefaultsFor("shoes", BOOKS));
    expect(server.sellsBooks("mix")).toBe(true);
  });
});
