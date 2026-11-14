// What a shop sells, for the platform's own code (code plan 12.18, part 3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SELLS, goodsWords, merchantProfile, sellsBooks, sellsOf, wordsFor } from "./sells.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the answers and the books rule match sign-up and the shop's own copy", () => {
  const form = read("signup/form.js");
  const block = form.slice(form.indexOf("export const PUBLISHES"), form.indexOf("/** Where a shop lives"));
  assert.deepEqual([...block.matchAll(/id: "([a-z]+)", label/g)].map(m => m[1]), [...SELLS]);
  const shop = read("apps/shop/src/shared/shopSells.ts");
  assert.match(shop, new RegExp(`export const SELLS = \\[${SELLS.map(a => `"${a}"`).join(", ")}\\] as const;`));
  assert.match(shop, /const BOOK_ANSWERS = new Set<string>\(\["books", "zines", "comics", "mix"\]\);/);
});

test("books shops stay the same", () => {
  for (const answer of ["books", "zines", "comics", "mix", null, undefined, "", "pottery"]) {
    assert.equal(sellsBooks(answer), true, String(answer));
    assert.equal(wordsFor(answer)("Add your first book, your press's copies"), "Add your first book, your press's copies");
    assert.deepEqual(merchantProfile(answer), { mcc: "5942", description: "Books and printed matter" });
  }
});

test("a shop that sells other things reads general words", () => {
  const w = wordsFor("clothing");
  assert.equal(w("Add your first book: a title, a price and a photo"), "Add your first product: a product, a price and a photo");
  assert.equal(w("Make your shop look like your press. Your press's details. The press's books, editions and copies."),
    "Make your shop look like your shop. Your shop's details. The shop's products, options and items.");
  assert.equal(goodsWords("E-books, ISBN, bookkeeping, Facebook, screen readers"), "E-books, ISBN, bookkeeping, Facebook, screen readers");
});

test("the answer from the records at hand: Settings first, then sign-up", () => {
  assert.equal(sellsOf({ sells: "shoes", publishes: "books" }), "shoes");
  assert.equal(sellsOf(null, { publishes: "music" }), "music");
  assert.equal(sellsOf({}, null), null);
});

test("every answer files the payment account under a real merchant category", () => {
  for (const answer of SELLS) {
    const { mcc, description } = merchantProfile(answer);
    assert.match(mcc, /^\d{4}$/, answer);
    assert.ok(description.length > 3, answer);
  }
  assert.equal(merchantProfile("clothing").mcc, "5651");
  assert.equal(merchantProfile("mixed").mcc, "5942");
  assert.equal(merchantProfile("prints").mcc, "5971");
});

test("the front door's Bookshop / General shop choice files every answer the way the shop reads it", async () => {
  const { BOOK_SELLS, GENERAL_SELLS, PUBLISHES, SHOP_TYPES, shopTypeOf } = await import("../../signup/form.js");
  assert.deepEqual(SHOP_TYPES.map((t) => t.id), ["books", "general"]);
  for (const { id } of PUBLISHES.options) assert.equal(shopTypeOf(id) === "books", sellsBooks(id), `${id} is filed under the right shop type`);
  assert.ok(BOOK_SELLS.every((id) => sellsBooks(id)));
  for (const { id } of GENERAL_SELLS) {
    assert.ok(PUBLISHES.options.some((o) => o.id === id), `${id} is a sign-up answer the server accepts`);
    assert.equal(sellsBooks(id), false, `${id} makes a general shop`);
  }
  assert.equal(new Set(GENERAL_SELLS.map((o) => o.id)).size, GENERAL_SELLS.length, "one tile per answer, so a saved answer shows one tile");
  assert.equal(shopTypeOf(""), "");
});
