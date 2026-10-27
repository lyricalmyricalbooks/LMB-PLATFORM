import { expect, test } from "vitest";
import { createRequire } from "node:module";
import { linkableEditions, openMatches, suggestLinks } from "./inventoryLink";

const require = createRequire(import.meta.url);
const server = require("../../../functions/inventoryLink.js");

const books = [
  { id: "b1", title: "The Hound", variants: [{ id: "v1", name: "Signed" }, { id: "v2", name: "Unsigned" }, { id: "v3", name: "E-book", digital: true }] },
  { id: "b2", title: "Un Fantástico Altrove", isbn: "978-1-23456-789-7" },
  { id: "b3", title: "Injured", variants: [{ id: "p", name: "Paperback", format: "Paperback" }, { id: "e", format: "EPUB" }] },
  { id: "b4", title: "Box set", bundleItems: [{ bookId: "b1", quantity: 1 }] },
  { id: "b5", title: "Gift card", productType: "giftCard" },
  { id: "b6", title: "Twins" },
  { id: "b7", title: "Old", status: "archived" },
];
const appBooks = [
  { id: "hound-signed", title: "The Hound Signed" },
  { id: "altrove", title: "Altrove", isbn: "9781234567897" },
  { id: "injured", title: "Injured" },
  { id: "twins-a", title: "Twins" },
  { id: "twins-b", title: "Twins" },
  { id: "old", title: "Old" },
].map((b) => ({ author: "", isbn: "", currency: "", maxPrint: null, onHand: null, feedAt: null, ...b }));

test("the sweep's suggestions are the panel's", () => {
  const editions = linkableEditions(books);
  expect(server.linkableEditions(books)).toEqual(editions);
  for (const links of [{}, { b1: { v1: "hound-signed" } }, { b6: { _: "twins-a" } }]) {
    expect(server.suggestLinks(server.linkableEditions(books), appBooks, links)).toEqual(suggestLinks(editions, appBooks, links));
  }
  expect(suggestLinks(editions, appBooks, {})).toEqual({ "b1|v1": "hound-signed", "b2|": "altrove", "b3|p": "injured", "b7|": "old" });
});

test("new matches leave out archived books and pairs the owner said no to", () => {
  const list = server.newMatchList(books, appBooks, {}, { "b2|": "altrove" });
  expect(list.map((m: any) => m.key)).toEqual(["b3|p", "b1|v1"]);
  expect(list[0]).toMatchObject({ bookId: "b3", variantId: "p", edition: "Paperback", inventoryBookId: "injured", inventoryTitle: "Injured" });
});

test("the panel and the server offer the same open suggestions", () => {
  const items = [
    { key: "a|v2", bookId: "a", variantId: "v2", inventoryBookId: "hound" },
    { key: "c|", bookId: "c", variantId: null, inventoryBookId: "cee" },
    { key: "d|", bookId: "d", variantId: null, inventoryBookId: "dee" },
    { key: "a|v1", bookId: "a", variantId: "v1", inventoryBookId: "new" },
  ];
  const links = { a: { v1: "x" }, b: { _: "hound" } };
  const ignored = { "d|": "dee" };
  expect(server.openMatches(items, links, ignored)).toEqual(openMatches(items as any, links, ignored));
  expect(openMatches(items as any, links, ignored).map((m) => m.key)).toEqual(["c|"]);
  expect(openMatches(items as any, {}, {})).toEqual([]);
});
