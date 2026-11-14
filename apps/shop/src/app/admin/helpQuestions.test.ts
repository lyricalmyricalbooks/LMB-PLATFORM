// The Help box over questions owners really type: the right answer must come first.
import { describe, expect, it } from "vitest";
import { articlesFor } from "@help/articles.js";
import { helpList } from "./helpAnswers";

const LIST = articlesFor("both", null);
export const ASKED: [string, string][] = [
  ["how do i add a book", "add-a-book"],
  ["add new product", "add-a-book"],
  ["how much does postage cost to send", "shipping"],
  ["set up shipping rates", "shipping"],
  ["delivery prices for the US", "shipping"],
  ["shiping", "shipping"],
  ["when do i get my money", "get-paid"],
  ["connect stripe", "get-paid"],
  ["how do payouts work", "get-paid"],
  ["gst hst", "taxes"],
  ["charge sales tax", "taxes"],
  ["make a coupon", "discounts"],
  ["promo code", "discounts"],
  ["change my theme", "look"],
  ["change colours and fonts", "look"],
  ["edit the text on my site", "words"],
  ["use my own domain", "own-address"],
  ["custom url", "own-address"],
  ["import from a csv", "import-spreadsheet"],
  ["upload spreadsheet of books", "import-spreadsheet"],
  ["move from shopify", "bring-books"],
  ["bring my mailing list", "bring-customers"],
  ["will my old links break", "old-links"],
  ["hardcover and paperback", "editions"],
  ["t-shirt sizes", "sizes-and-colours"],
  ["pre order", "pre-orders"],
  ["sell a book before release", "pre-orders"],
  ["what happens when i get an order", "new-order"],
  ["mark order shipped tracking number", "send-order"],
  ["selling at a craft fair", "fairs"],
  ["market stall stock", "stock-places"],
  ["add my assistant", "team"],
  ["give my accountant access", "team"],
  ["download a backup", "copy-of-everything"],
  ["export my customers", "copy-of-everything"],
  ["cancel my subscription", "close-shop"],
  ["delete my account", "close-shop"],
  ["free trial ending", "trial-ends"],
  ["privacy policy", "policies"],
  ["refund policy", "policies"],
  ["go live", "open-shop"],
  ["make my shop public", "open-shop"],
  ["place a test order", "test-order"],
  ["post on instagram", "sell-on-social"],
  ["where does the isbn go", "isbn"],
  ["upload pictures", "photos"],
  ["where do i start", "first-week"],
  ["do i need a business licence", "selling-legally"],
  ["which email do customers get receipts from", "email-sender"],
  ["size chart", "size-guide"],
];

describe("the Help box answers real questions", () => {
  for (const [q, id] of ASKED) {
    it(`“${q}” → ${id}`, () => {
      const items = helpList(LIST, { text: q, topic: "All" }).items;
      expect(items[0]?.id, items.slice(0, 3).map((a) => a.id).join(", ")).toBe(id);
    });
  }
  it("says nothing for words it can't place", () => {
    expect(helpList(LIST, { text: "zzzz qqqq", topic: "All" }).items).toEqual([]);
    expect(helpList(LIST, { text: "best pizza in toronto", topic: "All" }).items).toEqual([]);
  });
  it("never throws on odd input", () => {
    for (const q of ["???", "   ", "a", "the the the", "😀", "x".repeat(500), "' OR 1=1"]) expect(() => helpList(LIST, { text: q, topic: "All" })).not.toThrow();
  });
});

import { ARTICLES } from "@help/articles.js";
import { ALSO_ASKED } from "./helpAnswers";
describe("owners' own words for each answer", () => {
  it("name only answers that exist", () => {
    for (const id of Object.keys(ALSO_ASKED)) expect(ARTICLES.some((a) => a.id === id), id).toBe(true);
  });
  it("still find the answer in a shop that doesn't sell books", () => {
    const list = articlesFor("both", "clothing");
    expect(helpList(list, { text: "add a new product", topic: "All" }).items[0]?.id).toBe("add-a-book");
    expect(helpList(list, { text: "t-shirt sizes", topic: "All" }).items[0]?.id).toBe("sizes-and-colours");
  });
});
